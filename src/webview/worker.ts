// ============================================================
// Code Grimoire - D3 Force Simulation Web Worker
// メインスレッドから分離して物理レイアウト計算を実行する
// ============================================================
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCollide,
    type Simulation,
    type SimulationNodeDatum,
    type SimulationLinkDatum,
} from 'd3-force';
import type {
    MainToWorkerMessage,
    WorkerToMainMessage,
    WorkerNode,
    WorkerEdge,
} from '../shared/types.js';

// ─── 定数 ────────────────────────────────────────────────
const RING_RADII = {
    focus: 0,         // 中心
    context: 250,     // 中間リング
    global: 550,      // 外周リング
};

/** Warm-up で事前計算するステップ数 */
const WARMUP_TICKS = 300;
/** Alpha Decay: 高めに設定して急速停止 */
const ALPHA_DECAY = 0.05;
/** Alpha Min: これ以下で停止 */
const ALPHA_MIN = 0.001;

// ─── 状態 ────────────────────────────────────────────────
let simulation: Simulation<WorkerNode, SimulationLinkDatum<WorkerNode>> | null = null;
let nodes: WorkerNode[] = [];
let edges: WorkerEdge[] = [];
let nodeIndexMap: Map<string, number> = new Map();

// ─── メッセージ受信 ──────────────────────────────────────
self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'INIT':
            initSimulation(msg.payload.nodes, msg.payload.edges, msg.payload.focusNodeId);
            break;
        case 'FOCUS':
            changeFocus(msg.payload.focusNodeId);
            break;
    }
};

// ─── シミュレーション初期化 ──────────────────────────────
function initSimulation(
    inNodes: WorkerNode[],
    inEdges: WorkerEdge[],
    focusNodeId: string | null
): void {
    // ノードとエッジを保存
    nodes = inNodes.map(n => ({ ...n }));
    edges = inEdges.map(e => ({ ...e }));

    // インデックスマップ構築
    nodeIndexMap.clear();
    nodes.forEach((n, i) => nodeIndexMap.set(n.id, i));

    // リング割り当て
    assignRings(focusNodeId);

    // d3-force リンク用のデータ (source/target は ID 文字列)
    const links: SimulationLinkDatum<WorkerNode>[] = edges
        .filter(e => nodeIndexMap.has(e.source) && nodeIndexMap.has(e.target))
        .map(e => ({
            source: e.source as any,
            target: e.target as any,
        }));

    // シミュレーション構築
    simulation = forceSimulation<WorkerNode>(nodes)
        .alphaDecay(ALPHA_DECAY)
        .alphaMin(ALPHA_MIN)
        .force('link', forceLink<WorkerNode, SimulationLinkDatum<WorkerNode>>(links)
            .id(d => d.id)
            .distance(100)
            .strength(0.3)
        )
        .force('charge', forceManyBody<WorkerNode>()
            .strength(-150)
            .distanceMax(600)
        )
        .force('collide', forceCollide<WorkerNode>()
            .radius(d => Math.max(15, Math.sqrt(d.lineCount) * 2 + 10))
            .strength(0.7)
        )
        .force('ring', ringForce(0.6))
        .stop();  // 自動ティックを止めてマニュアル制御

    // ─── Warm-up: 事前計算 ───────────────────────────────
    // ユーザーに振動を見せずに一気に収束させる
    simulation.alpha(1);
    for (let i = 0; i < WARMUP_TICKS; i++) {
        simulation.tick();
    }

    // Warm-up 完了後の最終座標を送信
    sendPositions(1.0);
    sendDone();
}

// ─── フォーカス変更 (Summoning) ──────────────────────────
function changeFocus(focusNodeId: string): void {
    if (!simulation) { return; }

    // リング再割り当て
    assignRings(focusNodeId);

    // シミュレーションを再加熱して再収束
    simulation.alpha(0.8);
    for (let i = 0; i < WARMUP_TICKS; i++) {
        simulation.tick();
    }

    sendPositions(1.0);
    sendDone();
}

// ─── リング割り当てロジック ──────────────────────────────
function assignRings(focusNodeId: string | null): void {
    if (!focusNodeId || !nodeIndexMap.has(focusNodeId)) {
        // フォーカスが無い場合は全て global
        nodes.forEach(n => { n.ring = 'global'; });
        return;
    }

    // 直接依存 (Context): focusNode が import しているもの、または focusNode を import しているもの
    const directDeps = new Set<string>();
    edges.forEach(e => {
        if (e.source === focusNodeId) { directDeps.add(e.target); }
        if (e.target === focusNodeId) { directDeps.add(e.source); }
    });

    nodes.forEach(n => {
        if (n.id === focusNodeId) {
            n.ring = 'focus';
        } else if (directDeps.has(n.id)) {
            n.ring = 'context';
        } else {
            n.ring = 'global';
        }
    });
}

// ─── カスタムフォース: 3層同心円拘束 ────────────────────
function ringForce(strength: number) {
    let cachedNodes: WorkerNode[] = [];

    const force = (alpha: number) => {
        for (const node of cachedNodes) {
            const targetRadius = RING_RADII[node.ring] || RING_RADII.global;

            // 現在の距離
            const x = node.x || 0;
            const y = node.y || 0;
            const currentRadius = Math.sqrt(x * x + y * y) || 1;

            // Focus ノードは原点に固定
            if (node.ring === 'focus') {
                node.vx = (node.vx || 0) + (0 - x) * strength * alpha * 3;
                node.vy = (node.vy || 0) + (0 - y) * strength * alpha * 3;
                continue;
            }

            // リングへの引力: 現在の角度を保ったまま目標半径へ
            const ratio = (targetRadius - currentRadius) / currentRadius;
            node.vx = (node.vx || 0) + x * ratio * strength * alpha;
            node.vy = (node.vy || 0) + y * ratio * strength * alpha;
        }
    };

    force.initialize = (n: WorkerNode[]) => {
        cachedNodes = n;
    };

    return force as any;
}

// ─── 座標送信 (Transferable) ─────────────────────────────
function sendPositions(progress: number): void {
    const positions = new Float32Array(nodes.length * 2);
    for (let i = 0; i < nodes.length; i++) {
        positions[i * 2] = nodes[i].x || 0;
        positions[i * 2 + 1] = nodes[i].y || 0;
    }

    const msg: WorkerToMainMessage = {
        type: 'TICK',
        payload: { positions, progress },
    };

    // Transferable としてバッファを渡す (ゼロコピー)
    (self as any).postMessage(msg, [positions.buffer]);
}

function sendDone(): void {
    const positions = new Float32Array(nodes.length * 2);
    const rings: Record<string, 'focus' | 'context' | 'global'> = {};
    for (let i = 0; i < nodes.length; i++) {
        positions[i * 2] = nodes[i].x || 0;
        positions[i * 2 + 1] = nodes[i].y || 0;
        rings[nodes[i].id] = nodes[i].ring;
    }

    const msg: WorkerToMainMessage = {
        type: 'DONE',
        payload: { positions, rings },
    };

    (self as any).postMessage(msg, [positions.buffer]);
}
