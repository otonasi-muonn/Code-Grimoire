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
    BubbleGroup,
    BubbleSizeMode,
    NodeSizeStats,
} from '../shared/types.js';
import {
    computeNodeSizeStats,
    computeNodeRadius,
} from './utils/node-size.js';

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
let currentBubbleSizeMode: BubbleSizeMode = 'lineCount';
/**
 * v2 改修 (レビュー): forceCollide / Galaxy / Balloon の半径・間隔・padding を
 * 相対値で決定するための統計。webview から INIT 時に届く想定だが、無ければ
 * Worker 内で再計算する。
 */
let currentNodeSizeStats: NodeSizeStats = { count: 0, minLines: 1, maxLines: 1, medianLines: 1, p90Lines: 1 };
/** 最後に計算された階層エッジ (Balloon/Galaxy レイアウト時のみ) */
let lastHierarchyEdges: HierarchyEdge[] = [];
/** 最後に計算された Bubble グループ円 (Balloon レイアウト時のみ) */
let lastBubbleGroups: BubbleGroup[] = [];

// ─── メッセージ受信 ──────────────────────────────────────
self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'INIT':
            currentLayoutMode = msg.payload.layoutMode || 'force';
            currentBubbleSizeMode = msg.payload.bubbleSizeMode || 'lineCount';
            // webview 側で算出済みなら受け取る。なければ Worker 内で再計算。
            currentNodeSizeStats = msg.payload.nodeSizeStats
                ?? computeNodeSizeStats(msg.payload.nodes);
            initLayout(msg.payload.nodes, msg.payload.edges, msg.payload.focusNodeId);
            break;
        case 'FOCUS':
            changeFocus(msg.payload.focusNodeId);
            break;
        case 'LAYOUT_CHANGE':
            if (msg.payload.bubbleSizeMode) {
                currentBubbleSizeMode = msg.payload.bubbleSizeMode;
            }
            switchLayout(msg.payload.mode);
            break;
        case 'BUBBLE_SIZE_CHANGE':
            currentBubbleSizeMode = msg.payload.bubbleSizeMode;
            if (currentLayoutMode === 'balloon') {
                // Balloon レイアウトを再計算
                const targets = calculateStaticLayout(currentLayoutMode);
                morphToPositions(targets);
            }
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
        // balloon / galaxy: 静的レイアウトを計算して送信
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
            // v2 改修 (レビュー): 描画 (graph.ts) と同じ半径を使い、不整合を解消。
            // マージン + 4 は枠線分の最低マージン (元の式 + 14 から再縮小、
            // 中央値あたりで元の collide 式とほぼ近似する)。
            .radius(d => computeNodeRadius(d.lineCount, currentNodeSizeStats) + 4)
            .strength(1.0)
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
        lastBubbleGroups = [];
        initForceSimulation(currentFocusNodeId);
    } else {
        // balloon / galaxy: 静的レイアウトへモーフィング
        if (simulation) {
            simulation.stop();
            simulation = null;
        }
        const targets = calculateStaticLayout(newMode);
        morphToPositions(targets);
    }
}

// ═══════════════════════════════════════════════════════════
// 静的レイアウト計算 (Balloon / Galaxy)
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

/** Galaxy レイアウト: BFS 深度ベースの放射状配置 (銀河) */
function calculateGalaxyLayout(): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();

    // エントリーポイントを推定: 最も多くの outgoing edges を持つノード
    // (index.ts, main.ts, app.ts 等がエントリーになりやすい)
    const outDegree = new Map<string, number>();
    const inDegree = new Map<string, number>();
    for (const n of nodes) {
        outDegree.set(n.id, 0);
        inDegree.set(n.id, 0);
    }
    for (const e of edges) {
        outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }

    // エントリーポイント: inDegree が 0 かつ outDegree が最大のノード
    // いなければ outDegree が最大のノード
    let entryNodeId: string | null = currentFocusNodeId;
    if (!entryNodeId || !nodeIndexMap.has(entryNodeId)) {
        // inDegree=0 のノードの中で outDegree 最大
        let bestScore = -1;
        for (const n of nodes) {
            const inD = inDegree.get(n.id) || 0;
            const outD = outDegree.get(n.id) || 0;
            const score = (inD === 0 ? 1000 : 0) + outD;
            if (score > bestScore) {
                bestScore = score;
                entryNodeId = n.id;
            }
        }
    }

    if (!entryNodeId) {
        // fallback: 全ノードを円形に配置
        const angleStep = (Math.PI * 2) / Math.max(1, nodes.length);
        nodes.forEach((n, i) => {
            result.set(n.id, {
                x: Math.cos(angleStep * i) * 400,
                y: Math.sin(angleStep * i) * 400,
            });
        });
        return result;
    }

    // BFS from entry point to assign depth
    const depthMap = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const n of nodes) { adjacency.set(n.id, []); }
    for (const e of edges) {
        adjacency.get(e.source)?.push(e.target);
        // 逆方向も辿る (被依存も考慮して到達可能性を広げる)
        adjacency.get(e.target)?.push(e.source);
    }

    // BFS (有向: source→target のみ) で深度計算
    const forwardAdj = new Map<string, string[]>();
    for (const n of nodes) { forwardAdj.set(n.id, []); }
    for (const e of edges) {
        forwardAdj.get(e.source)?.push(e.target);
    }

    const bfsQueue: string[] = [entryNodeId];
    depthMap.set(entryNodeId, 0);
    let maxDepth = 0;

    while (bfsQueue.length > 0) {
        const current = bfsQueue.shift()!;
        const currentDepth = depthMap.get(current)!;

        // 有向BFS (依存方向のみ)
        for (const neighbor of (forwardAdj.get(current) || [])) {
            if (!depthMap.has(neighbor)) {
                const newDepth = currentDepth + 1;
                depthMap.set(neighbor, newDepth);
                if (newDepth > maxDepth) { maxDepth = newDepth; }
                bfsQueue.push(neighbor);
            }
        }
    }

    // 到達不能なノードを検出 — 逆方向BFSも試す
    const reverseAdj = new Map<string, string[]>();
    for (const n of nodes) { reverseAdj.set(n.id, []); }
    for (const e of edges) {
        reverseAdj.get(e.target)?.push(e.source);
    }

    // エントリーから到達不能 → 逆向きでも到達不能なら真に孤立
    const unreachableNodes: WorkerNode[] = [];
    const reachableInReverse = new Set<string>();
    const revQueue: string[] = [entryNodeId];
    reachableInReverse.add(entryNodeId);
    while (revQueue.length > 0) {
        const current = revQueue.shift()!;
        for (const neighbor of (reverseAdj.get(current) || [])) {
            if (!reachableInReverse.has(neighbor)) {
                reachableInReverse.add(neighbor);
                revQueue.push(neighbor);
            }
        }
    }

    for (const n of nodes) {
        if (!depthMap.has(n.id)) {
            // 逆方向でも到達可能なら、逆依存としてマーク
            if (reachableInReverse.has(n.id)) {
                depthMap.set(n.id, maxDepth + 1);
            } else {
                unreachableNodes.push(n);
            }
        }
    }

    // 到達不能ノードは最外殻リング
    const unreachableDepth = maxDepth + 2;
    for (const n of unreachableNodes) {
        depthMap.set(n.id, unreachableDepth);
    }
    if (unreachableNodes.length > 0) {
        maxDepth = unreachableDepth;
    }

    // 深度ごとのノードをグループ化
    const depthGroups = new Map<number, WorkerNode[]>();
    for (const n of nodes) {
        const d = depthMap.get(n.id) || 0;
        if (!depthGroups.has(d)) { depthGroups.set(d, []); }
        depthGroups.get(d)!.push(n);
    }

    // ─── 放射状配置 (Plan agent 解法 A + C による重なり解消) ─────────
    //
    // 解法 A: 各深度のリング半径を動的算出。
    //   minByGap    = 前リング外周 + 自リング最大半径 + マージン
    //   minByCircum = N × (2·Rmax + margin) / (2π)  ノードを 1 周に並べる必要円周
    //   radius_d    = max(minByGap, minByCircum)
    //
    // 解法 C: 1 周に収まらない深度は内側 → 外側に subRing 分割する。
    //   maxPerRing = floor(2π·r_d / (2·Rmax + margin))
    //   親近傍ソート済の順序を保持して subRingIdx に振り分け
    //
    // radiusJitter は重なり要因 (旧コードで内側へ引っ張っていた) なので除去。
    const MARGIN = 20;
    const nodeAngles = new Map<string, number>();
    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

    // 各深度の最大ノード半径を事前計算 (描画半径と同じ式)
    const depthRmax = new Map<number, number>();
    for (const [d, group] of depthGroups) {
        let rmax = 0;
        for (const n of group) {
            const r = computeNodeRadius(n.lineCount, currentNodeSizeStats);
            if (r > rmax) { rmax = r; }
        }
        depthRmax.set(d, rmax);
    }

    // 動的リング半径 (解法 A)
    const ringRadius = new Map<number, number>();
    ringRadius.set(0, 0);
    let prevR = 0;
    let prevRmax = 0;
    for (const d of sortedDepths) {
        if (d === 0) { continue; }
        const N = depthGroups.get(d)!.length;
        const Rmax = depthRmax.get(d)!;
        const minByGap = prevR + prevRmax + Rmax + MARGIN;
        const minByCircum = (N * (2 * Rmax + MARGIN)) / (2 * Math.PI);
        const r = Math.max(minByGap, minByCircum);
        ringRadius.set(d, r);
        prevR = r;
        prevRmax = Rmax;
    }

    for (const depth of sortedDepths) {
        const group = depthGroups.get(depth)!;
        if (depth === 0) {
            for (const n of group) {
                result.set(n.id, { x: 0, y: 0 });
                nodeAngles.set(n.id, 0);
            }
            continue;
        }

        const radius = ringRadius.get(depth)!;
        const Rmax = depthRmax.get(depth)!;
        const angleOffset = depth * 0.618 * Math.PI;

        // 親近傍ソート (38e675d で導入したロジックを維持)
        const groupWithAnchor = group.map(n => {
            const parents: number[] = [];
            for (const src of reverseAdj.get(n.id) ?? []) {
                if (depthMap.get(src) === depth - 1) {
                    const a = nodeAngles.get(src);
                    if (a !== undefined) { parents.push(a); }
                }
            }
            for (const dst of forwardAdj.get(n.id) ?? []) {
                if (depthMap.get(dst) === depth - 1) {
                    const a = nodeAngles.get(dst);
                    if (a !== undefined) { parents.push(a); }
                }
            }
            let anchor = 0;
            if (parents.length > 0) {
                let sx = 0;
                let sy = 0;
                for (const a of parents) { sx += Math.cos(a); sy += Math.sin(a); }
                anchor = Math.atan2(sy, sx);
            }
            return { node: n, anchor };
        });

        groupWithAnchor.sort((a, b) => a.anchor - b.anchor);

        // subRing 分割 (解法 C) — 1 周に収まらない場合に内→外へ振り分け
        const subRingSpacing = 2 * Rmax + MARGIN;
        const maxPerRing = Math.max(1, Math.floor((2 * Math.PI * radius) / subRingSpacing));
        const totalSubRings = Math.ceil(groupWithAnchor.length / maxPerRing);

        for (let i = 0; i < groupWithAnchor.length; i++) {
            const { node: n } = groupWithAnchor[i];
            const subRingIdx = Math.floor(i / maxPerRing);
            const indexInRing = i % maxPerRing;
            const ringSize = subRingIdx === totalSubRings - 1
                ? groupWithAnchor.length - subRingIdx * maxPerRing
                : maxPerRing;
            const subRingR = radius + subRingIdx * subRingSpacing;
            const angleStep = (Math.PI * 2) / Math.max(1, ringSize);
            const angle = angleStep * indexInRing + angleOffset;

            result.set(n.id, {
                x: Math.cos(angle) * subRingR,
                y: Math.sin(angle) * subRingR,
            });
            nodeAngles.set(n.id, angle);
        }
    }

    // リング情報を更新 (Galaxy 用)
    for (const n of nodes) {
        const depth = depthMap.get(n.id) || 0;
        if (depth === 0) {
            n.ring = 'focus';
        } else if (depth <= 2) {
            n.ring = 'context';
        } else {
            n.ring = 'global';
        }
    }

    // 階層エッジ: 有向エッジのうち深度が連続するものを階層エッジとする
    lastHierarchyEdges = [];
    for (const e of edges) {
        const srcDepth = depthMap.get(e.source);
        const tgtDepth = depthMap.get(e.target);
        if (srcDepth !== undefined && tgtDepth !== undefined && tgtDepth === srcDepth + 1) {
            lastHierarchyEdges.push({ parent: e.source, child: e.target });
        }
    }

    return result;
}

/** Balloon レイアウト: パック円充填 (Bubble) — ディレクトリグループ円付き */
function calculateBalloonLayout(dirTree: DirTreeNode): Map<string, { x: number; y: number }> {
    const nodeMap = new Map<string, WorkerNode>();
    for (const n of nodes) { nodeMap.set(n.id, n); }

    // ─── Plan agent 解法 P + Q + R による重なり解消 ──────────────
    //
    // P: d.value を描画半径の二乗 (= 面積) に揃える。
    //    d3-pack は r ∝ sqrt(value) なので d3 の内部半径 ≡ 実描画半径 になり、
    //    子円同士は d3 の保証通り重ならない。
    // Q: size を totalArea (= Σ πR²) と充填率 0.55 から動的算出。
    //    container に収まらず葉が「はみ出る」現象を解消。
    // R: padding は avgRadius × 0.3 ベースに動的化。
    const assignRadiusSquared = (d: DirTreeNode) => {
        if (d.nodeId) {
            const wn = nodeMap.get(d.nodeId);
            const lc = currentBubbleSizeMode === 'fileSize'
                ? (wn?.fileSize ?? wn?.lineCount ?? 10)
                : (wn?.lineCount ?? 10);
            const r = computeNodeRadius(lc, currentNodeSizeStats);
            d.value = Math.PI * r * r;
        }
        for (const child of d.children) { assignRadiusSquared(child); }
    };
    assignRadiusSquared(dirTree);

    const root = hierarchy(dirTree)
        .sum(d => d.value || (Math.PI * 12 * 12))
        .sort((a, b) => (b.value || 0) - (a.value || 0));

    const totalArea = root.value ?? Math.PI * 12 * 12;
    const FILL_RATIO = 0.55; // d3-pack の経験的充填率
    const dynamicSide = Math.min(
        10000,
        Math.max(2000, 2 * Math.sqrt(totalArea / (Math.PI * FILL_RATIO))),
    );
    const avgR = Math.sqrt(totalArea / (Math.PI * Math.max(1, nodes.length)));
    const dynPadding = Math.max(4, avgR * 0.3);

    const packLayout = d3Pack<DirTreeNode>()
        .size([dynamicSide, dynamicSide])
        .padding(dynPadding);

    packLayout(root);

    const result = new Map<string, { x: number; y: number }>();
    const groups: BubbleGroup[] = [];
    const HALF = dynamicSide / 2;

    root.each((d: HierarchyNode<DirTreeNode>) => {
        const dx = (d as any).x - HALF;
        const dy = (d as any).y - HALF;
        const dr = (d as any).r as number;

        if (d.data.nodeId) {
            // 葉ノード (ファイル) — 座標を格納
            result.set(d.data.nodeId, { x: dx, y: dy });
        } else if (d.depth > 0 && d.children && d.children.length > 0) {
            // 中間ノード (ディレクトリ) — グループ円として収集
            // 直下の葉ノードIDを再帰収集
            const childIds: string[] = [];
            const collectLeaves = (n: HierarchyNode<DirTreeNode>) => {
                if (n.data.nodeId) { childIds.push(n.data.nodeId); }
                if (n.children) { for (const c of n.children) { collectLeaves(c); } }
            };
            collectLeaves(d);

            // ─── v2 改修 (T-06): ヒートマップ用メトリクス計算 ──
            const childSet = new Set(childIds);
            let internalDeps = 0;
            let externalDeps = 0;
            for (const e of edges) {
                const srcIn = childSet.has(e.source);
                const tgtIn = childSet.has(e.target);
                if (srcIn && tgtIn) {
                    internalDeps++;
                } else if (srcIn || tgtIn) {
                    externalDeps++;
                }
            }
            const totalDeps = internalDeps + externalDeps;
            // 凝集度: 全体依存数 = 0 のフォルダは独立完結とみなして 1.0
            const cohesion = totalDeps === 0 ? 1.0 : internalDeps / totalDeps;

            let sumLines = 0;
            let cycleCount = 0;
            for (const cid of childIds) {
                const wn = nodeMap.get(cid);
                if (wn) {
                    sumLines += wn.lineCount;
                    if (wn.inCycle) { cycleCount++; }
                }
            }
            const avgLineCount = childIds.length > 0 ? sumLines / childIds.length : 0;

            groups.push({
                label: d.data.name,
                x: dx,
                y: dy,
                r: dr,
                depth: d.depth,
                childNodeIds: childIds,
                cohesion,
                avgLineCount,
                cycleCount,
            });
        }
    });

    lastBubbleGroups = groups;
    return result;
}

/** レイアウトモードに応じた静的座標を計算し、階層エッジも抽出する */
function calculateStaticLayout(mode: LayoutMode): Map<string, { x: number; y: number }> {
    // Bubble グループは balloon 時のみ (calculateBalloonLayout 内で設定)
    lastBubbleGroups = [];

    if (mode === 'galaxy') {
        // Galaxy: BFS 深度ベースの放射状配置
        const positions = calculateGalaxyLayout();
        // Galaxy は独自に階層エッジを設定済み
        return positions;
    }

    // balloon: ディレクトリツリーベース
    const dirTree = collapseTree(buildDirectoryTree());
    const positions = calculateBalloonLayout(dirTree);

    // 階層エッジ抽出: ディレクトリツリーの親子関係から復元
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
            // Smart Edges: balloon/galaxy レイアウト時のみ階層エッジを含める
            hierarchyEdges: currentLayoutMode !== 'force' ? lastHierarchyEdges : undefined,
            // Bubble グループ円: Balloon レイアウト時のみ
            bubbleGroups: currentLayoutMode === 'balloon' ? lastBubbleGroups : undefined,
        },
    };

    (self as any).postMessage(msg, [positions.buffer]);
}
