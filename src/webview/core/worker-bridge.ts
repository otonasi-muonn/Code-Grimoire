// ─── Worker 管理 ─────────────────────────────────────────
import type { MainToWorkerMessage, WorkerToMainMessage, WorkerNode, WorkerEdge } from '../../shared/types.js';
import { state } from '../core/state.js';

let worker: Worker | null = null;

/** pendingGraphInit — Worker がまだ準備中の場合に GRAPH_DATA をキューする */
export let pendingGraphInit = false;
export function setPendingGraphInit(v: boolean) { pendingGraphInit = v; }

/** Worker への送信 */
export function sendToWorker(msg: MainToWorkerMessage) {
    worker?.postMessage(msg);
}

/** Worker から受け取った Float32Array を nodePositions に展開 */
export function applyPositions(positions: Float32Array) {
    for (let i = 0; i < state.nodeOrder.length; i++) {
        const id = state.nodeOrder[i];
        state.nodePositions.set(id, {
            x: positions[i * 2],
            y: positions[i * 2 + 1],
        });
    }
}

/** Worker から受け取ったリング情報を nodeRings に展開 */
export function applyRings(rings: Record<string, 'focus' | 'context' | 'global'>) {
    for (const [id, ring] of Object.entries(rings)) {
        state.nodeRings.set(id, ring);
    }
}

/**
 * Worker を初期化。
 * @param callbacks Worker DONE 完了時に呼ぶコールバック群
 */
export function initWorker(callbacks: {
    renderGraph: () => void;
    stopParticleLoading: () => void;
    updateStatusText: () => void;
    onGraphReceived: () => void;
    viewport: { moveCenter: (x: number, y: number) => void };
}) {
    // Worker URL は HTML 内の data-worker-uri 属性から取得
    const workerUrl = (document.querySelector('script[data-worker-uri]') as HTMLScriptElement)
        ?.getAttribute('data-worker-uri');
    if (!workerUrl) {
        console.error('[Code Grimoire] Worker URI not found');
        return;
    }

    // VS Code Webview CSP 制限回避: fetch → Blob → Worker
    fetch(workerUrl)
        .then(res => res.blob())
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            worker = new Worker(blobUrl);

            worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
                const msg = event.data;
                switch (msg.type) {
                    case 'TICK':
                        applyPositions(msg.payload.positions);
                        callbacks.renderGraph();
                        break;
                    case 'DONE':
                        applyPositions(msg.payload.positions);
                        applyRings(msg.payload.rings);
                        state.hierarchyEdges = msg.payload.hierarchyEdges || [];
                        state.bubbleGroups = msg.payload.bubbleGroups || [];
                        callbacks.renderGraph();
                        state.isLoading = false;
                        callbacks.stopParticleLoading();
                        callbacks.updateStatusText();
                        // Viewport を初回はフォーカスノード中心に移動
                        if (state.focusNodeId) {
                            const pos = state.nodePositions.get(state.focusNodeId);
                            if (pos) { callbacks.viewport.moveCenter(pos.x, pos.y); }
                        }
                        break;
                }
            };

            state.workerReady = true;

            // Worker 準備前に GRAPH_DATA が来ていた場合、ここで処理
            if (pendingGraphInit && state.graph) {
                callbacks.onGraphReceived();
            }
        })
        .catch(err => {
            console.error('[Code Grimoire] Worker init failed:', err);
        });
}

/**
 * グラフデータ受信時：Worker にフォーカス＆レイアウト設定を送信してレイアウト計算開始
 */
export function onGraphReceived(callbacks: {
    updateStatusText: () => void;
    startParticleLoading: () => void;
}) {
    const graph = state.graph;
    if (!graph || graph.nodes.length === 0) {
        state.isLoading = false;
        callbacks.updateStatusText();
        return;
    }

    // ノード順序を記録
    state.nodeOrder = graph.nodes.map(n => n.id);

    // Smart Labeling: ノード接続数を計算
    state.nodeDegree.clear();
    for (const node of graph.nodes) {
        state.nodeDegree.set(node.id, 0);
    }
    for (const edge of graph.edges) {
        state.nodeDegree.set(edge.source, (state.nodeDegree.get(edge.source) || 0) + 1);
        state.nodeDegree.set(edge.target, (state.nodeDegree.get(edge.target) || 0) + 1);
    }

    // Worker がまだ準備中なら待機フラグを立てる
    if (!state.workerReady) {
        pendingGraphInit = true;
        return;
    }
    pendingGraphInit = false;

    // Worker 用データに変換
    const workerNodes: WorkerNode[] = graph.nodes.map(n => ({
        id: n.id,
        ring: 'global' as const,  // 初期状態は全て global、Worker 側で割り当て
        lineCount: n.lineCount,
    }));

    const workerEdges: WorkerEdge[] = graph.edges
        .filter(e => e.kind !== 'type-import') // type-only import はレイアウトに影響させない
        .map(e => ({
            source: typeof e.source === 'string' ? e.source : (e.source as any).id,
            target: typeof e.target === 'string' ? e.target : (e.target as any).id,
        }));

    // フォーカス: まだ未選択なら最初のソースファイルを選択
    if (!state.focusNodeId) {
        const firstSource = graph.nodes.find(n => n.kind === 'source');
        state.focusNodeId = firstSource?.id || graph.nodes[0].id;
    }

    sendToWorker({
        type: 'INIT',
        payload: {
            nodes: workerNodes,
            edges: workerEdges,
            focusNodeId: state.focusNodeId,
            layoutMode: state.layoutMode,
        },
    });

    state.isLoading = true;
    callbacks.updateStatusText();
}
