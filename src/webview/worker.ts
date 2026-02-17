// ============================================================
// Code Grimoire - D3 Force / Hierarchy Simulation Web Worker
// メインスレッドから分離してレイアウト計算を実行する
// ============================================================
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCollide,
    type Simulation,
    type SimulationLinkDatum,
} from 'd3-force';
import {
    hierarchy,
    tree as d3Tree,
    pack as d3Pack,
    type HierarchyNode,
} from 'd3-hierarchy';
import type {
    MainToWorkerMessage,
    WorkerToMainMessage,
    WorkerNode,
    WorkerEdge,
    LayoutMode,
    HierarchyEdge,
} from '../shared/types.js';

// ─── 定数 ────────────────────────────────────────────────
const RING_RADII = {
    focus: 0,         // 中心
    context: 350,     // 中間リング
    global: 750,      // 外周リング
};

/** Warm-up で事前計算するステップ数 */
const WARMUP_TICKS = 300;
/** Alpha Decay: 高めに設定して急速停止 */
const ALPHA_DECAY = 0.05;
/** Alpha Min: これ以下で停止 */
const ALPHA_MIN = 0.001;

/** モーフィングアニメーションのフレーム数 */
const MORPH_FRAMES = 40;
/** モーフィング1フレームの間隔 (ms) */
const MORPH_INTERVAL = 16;

// ─── 状態 ────────────────────────────────────────────────
let simulation: Simulation<WorkerNode, SimulationLinkDatum<WorkerNode>> | null = null;
let nodes: WorkerNode[] = [];
let edges: WorkerEdge[] = [];
let nodeIndexMap: Map<string, number> = new Map();
let currentLayoutMode: LayoutMode = 'force';
let currentFocusNodeId: string | null = null;
/** 最後に計算された階層エッジ (Tree/Balloon レイアウト時のみ) */
let lastHierarchyEdges: HierarchyEdge[] = [];

// ─── メッセージ受信 ──────────────────────────────────────
self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'INIT':
            currentLayoutMode = msg.payload.layoutMode || 'force';
            initLayout(msg.payload.nodes, msg.payload.edges, msg.payload.focusNodeId);
            break;
        case 'FOCUS':
            changeFocus(msg.payload.focusNodeId);
            break;
        case 'LAYOUT_CHANGE':
            switchLayout(msg.payload.mode);
            break;
    }
};

// ─── メインレイアウト初期化 ──────────────────────────────
function initLayout(
    inNodes: WorkerNode[],
    inEdges: WorkerEdge[],
    focusNodeId: string | null
): void {
    // ノードとエッジを保存
    nodes = inNodes.map(n => ({ ...n }));
    edges = inEdges.map(e => ({ ...e }));
    currentFocusNodeId = focusNodeId;

    // インデックスマップ構築
    nodeIndexMap.clear();
    nodes.forEach((n, i) => nodeIndexMap.set(n.id, i));

    // リング割り当て
    assignRings(focusNodeId);

    if (currentLayoutMode === 'force') {
        initForceSimulation(focusNodeId);
    } else {
        // tree / balloon: 静的レイアウトを計算して送信
        const targets = calculateStaticLayout(currentLayoutMode);
        applyPositions(targets);
        sendPositions(1.0);
        sendDone();
    }
}

// ─── Force シミュレーション初期化 ────────────────────────
function initForceSimulation(focusNodeId: string | null): void {
    // d3-force リンク用のデータ
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
            .distance(140)
            .strength(0.25)
        )
        .force('charge', forceManyBody<WorkerNode>()
            .strength(-220)
            .distanceMax(800)
        )
        .force('collide', forceCollide<WorkerNode>()
            .radius(d => Math.max(22, Math.sqrt(d.lineCount) * 2.5 + 14))
            .strength(0.8)
        )
        .force('ring', ringForce(0.6))
        .stop();

    // Warm-up
    simulation.alpha(1);
    for (let i = 0; i < WARMUP_TICKS; i++) {
        simulation.tick();
    }

    sendPositions(1.0);
    sendDone();
}

// ─── フォーカス変更 (Summoning) ──────────────────────────
function changeFocus(focusNodeId: string): void {
    currentFocusNodeId = focusNodeId;
    assignRings(focusNodeId);

    if (currentLayoutMode === 'force') {
        if (!simulation) { return; }
        simulation.alpha(0.8);
        for (let i = 0; i < WARMUP_TICKS; i++) {
            simulation.tick();
        }
        sendPositions(1.0);
        sendDone();
    } else {
        // 静的レイアウトの場合はモーフィングで移動
        const targets = calculateStaticLayout(currentLayoutMode);
        morphToPositions(targets);
    }
}

// ─── レイアウトモード切り替え (V3) ──────────────────────
function switchLayout(newMode: LayoutMode): void {
    if (newMode === currentLayoutMode) { return; }
    currentLayoutMode = newMode;

    if (newMode === 'force') {
        // Force に戻す場合: 現在の座標を初期値として再構築
        lastHierarchyEdges = [];
        initForceSimulation(currentFocusNodeId);
    } else {
        // tree / balloon: 静的レイアウトへモーフィング
        if (simulation) {
            simulation.stop();
            simulation = null;
        }
        const targets = calculateStaticLayout(newMode);
        morphToPositions(targets);
    }
}

// ═══════════════════════════════════════════════════════════
// 静的レイアウト計算 (Tree / Balloon)
// ═══════════════════════════════════════════════════════════

/** ディレクトリ階層ツリーを構築 */
interface DirTreeNode {
    name: string;
    children: DirTreeNode[];
    /** 葉ノードの場合の WorkerNode ID */
    nodeId?: string;
    /** lineCount (Pack サイズ用) */
    value?: number;
}

function buildDirectoryTree(): DirTreeNode {
    const root: DirTreeNode = { name: '__root__', children: [] };

    for (const node of nodes) {
        // id はファイルパス。"/" 区切りで階層化
        const parts = node.id.replace(/\\/g, '/').split('/').filter(Boolean);
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLeaf = i === parts.length - 1;
            let child = current.children.find(c => c.name === part);
            if (!child) {
                child = { name: part, children: [] };
                current.children.push(child);
            }
            if (isLeaf) {
                child.nodeId = node.id;
                child.value = Math.max(node.lineCount, 10);
            }
            current = child;
        }
    }

    return root;
}

/** 中間ディレクトリ（子が1つだけ）を省略して直結する */
function collapseTree(node: DirTreeNode): DirTreeNode {
    // 葉ノード
    if (node.children.length === 0) { return node; }

    // 子を再帰的に整理
    node.children = node.children.map(collapseTree);

    // 非葉・子1つ → 直結 (ルートは除外)
    if (node.children.length === 1 && !node.nodeId && node.name !== '__root__') {
        const child = node.children[0];
        return {
            ...child,
            name: node.name + '/' + child.name,
        };
    }

    return node;
}

/** Tree レイアウト: トップダウン縦型ツリー (Yggdrasil) */
function calculateTreeLayout(dirTree: DirTreeNode): Map<string, { x: number; y: number }> {
    const root = hierarchy(dirTree)
        .sum(d => d.value || 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

    // nodeSize: [横方向のノード間距離, 縦方向(深さ)のレベル間距離]
    // ノード数に応じてスケーリング（密集を防ぐ）
    const hSpacing = Math.max(60, 120 - nodes.length * 0.5);
    const vSpacing = Math.max(100, 180 - nodes.length * 0.8);

    const treeLayout = d3Tree<DirTreeNode>()
        .nodeSize([hSpacing, vSpacing])
        .separation((a, b) => (a.parent === b.parent ? 1 : 2));

    treeLayout(root);

    const result = new Map<string, { x: number; y: number }>();

    // nodeSize モードでは原点がルートになるのでそのまま使える
    root.each((d: HierarchyNode<DirTreeNode>) => {
        if (d.data.nodeId) {
            result.set(d.data.nodeId, {
                x: (d as any).x as number,
                y: (d as any).y as number,
            });
        }
    });

    return result;
}

/** Balloon レイアウト: パック円充填 (Bubble) */
function calculateBalloonLayout(dirTree: DirTreeNode): Map<string, { x: number; y: number }> {
    const root = hierarchy(dirTree)
        .sum(d => d.value || 10)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

    const packLayout = d3Pack<DirTreeNode>()
        .size([1600, 1600])
        .padding(8);

    packLayout(root);

    const result = new Map<string, { x: number; y: number }>();

    root.each((d: HierarchyNode<DirTreeNode>) => {
        if (d.data.nodeId) {
            // 中央原点に平行移動 (pack は [0, size] を使う)
            result.set(d.data.nodeId, {
                x: (d as any).x - 800,
                y: (d as any).y - 800,
            });
        }
    });

    return result;
}

/** レイアウトモードに応じた静的座標を計算し、階層エッジも抽出する */
function calculateStaticLayout(mode: LayoutMode): Map<string, { x: number; y: number }> {
    const dirTree = collapseTree(buildDirectoryTree());

    // 座標計算
    const positions = mode === 'tree'
        ? calculateTreeLayout(dirTree)
        : calculateBalloonLayout(dirTree);

    // 階層エッジ抽出: ディレクトリツリーの親子関係から、
    // 葉ノード(ファイル)同士の「同じ親を持つ兄弟」および「親子」関係を復元
    lastHierarchyEdges = extractHierarchyEdges(dirTree);

    return positions;
}

/** ディレクトリツリーからファイルノード間の階層エッジを抽出 */
function extractHierarchyEdges(root: DirTreeNode): HierarchyEdge[] {
    const edges: HierarchyEdge[] = [];

    const walk = (node: DirTreeNode, parentFileId: string | null) => {
        const myFileId = node.nodeId || null;

        // 親ファイルがあり、自分もファイルなら親子エッジ
        if (parentFileId && myFileId) {
            edges.push({ parent: parentFileId, child: myFileId });
        }

        // 子ノードを探索。自分がファイルならその ID を伝播、
        // ディレクトリノードなら最も近い祖先ファイルを伝播
        const propagateId = myFileId || parentFileId;

        // 子ノードのうちファイルを持つもの同士で兄弟エッジは作らない
        // (階層エッジのみ — 親→子)
        for (const child of node.children) {
            walk(child, propagateId);
        }
    };

    // ルートからツリー全体を探索
    // しかし、「親がディレクトリのみ（ファイルではない）」場合は
    // 直下の全ファイルを「兄弟クラスタ」として接続する
    const walkDir = (dir: DirTreeNode) => {
        // dir 直下のファイルノード ID を収集
        const childFileIds: string[] = [];
        for (const child of dir.children) {
            if (child.nodeId) {
                childFileIds.push(child.nodeId);
            }
        }

        // 兄弟ファイルをチェーン状に接続（星型よりも線が少なくて美しい）
        for (let i = 1; i < childFileIds.length; i++) {
            edges.push({ parent: childFileIds[i - 1], child: childFileIds[i] });
        }

        // サブディレクトリを再帰
        for (const child of dir.children) {
            if (child.children.length > 0) {
                // サブディレクトリの代表ファイル（最初の葉）を見つけて接続
                const subRepresentative = findFirstLeaf(child);
                if (subRepresentative && childFileIds.length > 0) {
                    edges.push({ parent: childFileIds[0], child: subRepresentative });
                }
                walkDir(child);
            }
        }
    };

    walkDir(root);
    return edges;
}

/** ツリーの最初の葉ノード (ファイル) の ID を返す */
function findFirstLeaf(node: DirTreeNode): string | null {
    if (node.nodeId) { return node.nodeId; }
    for (const child of node.children) {
        const found = findFirstLeaf(child);
        if (found) { return found; }
    }
    return null;
}

/** 静的レイアウト座標を直接適用 */
function applyPositions(targets: Map<string, { x: number; y: number }>): void {
    for (const node of nodes) {
        const pos = targets.get(node.id);
        if (pos) {
            node.x = pos.x;
            node.y = pos.y;
        }
    }
}

// ═══════════════════════════════════════════════════════════
// モーフィング (座標補間アニメーション)
// ═══════════════════════════════════════════════════════════

/** 現在の座標から目標座標へ線形補間して TICK を送り続ける */
function morphToPositions(targets: Map<string, { x: number; y: number }>): void {
    // 開始座標を記録
    const startPositions = nodes.map(n => ({ x: n.x || 0, y: n.y || 0 }));
    // 目標座標
    const targetPositions = nodes.map(n => {
        const t = targets.get(n.id);
        return t ? { x: t.x, y: t.y } : { x: n.x || 0, y: n.y || 0 };
    });

    let frame = 0;

    const step = () => {
        frame++;
        const t = easeInOutCubic(frame / MORPH_FRAMES);

        for (let i = 0; i < nodes.length; i++) {
            nodes[i].x = startPositions[i].x + (targetPositions[i].x - startPositions[i].x) * t;
            nodes[i].y = startPositions[i].y + (targetPositions[i].y - startPositions[i].y) * t;
        }

        sendPositions(frame / MORPH_FRAMES);

        if (frame >= MORPH_FRAMES) {
            // モーフィング完了
            sendDone();
        } else {
            setTimeout(step, MORPH_INTERVAL);
        }
    };

    step();
}

/** Ease In-Out Cubic イージング */
function easeInOutCubic(t: number): number {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ═══════════════════════════════════════════════════════════
// リング割り当て & カスタムフォース (Force モード用)
// ═══════════════════════════════════════════════════════════

function assignRings(focusNodeId: string | null): void {
    if (!focusNodeId || !nodeIndexMap.has(focusNodeId)) {
        nodes.forEach(n => { n.ring = 'global'; });
        return;
    }

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

function ringForce(strength: number) {
    let cachedNodes: WorkerNode[] = [];

    const force = (alpha: number) => {
        for (const node of cachedNodes) {
            const targetRadius = RING_RADII[node.ring] || RING_RADII.global;
            const x = node.x || 0;
            const y = node.y || 0;
            const currentRadius = Math.sqrt(x * x + y * y) || 1;

            if (node.ring === 'focus') {
                node.vx = (node.vx || 0) + (0 - x) * strength * alpha * 3;
                node.vy = (node.vy || 0) + (0 - y) * strength * alpha * 3;
                continue;
            }

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
        payload: {
            positions,
            rings,
            // Smart Edges: Tree/Balloon レイアウト時のみ階層エッジを含める
            hierarchyEdges: currentLayoutMode !== 'force' ? lastHierarchyEdges : undefined,
        },
    };

    (self as any).postMessage(msg, [positions.buffer]);
}
