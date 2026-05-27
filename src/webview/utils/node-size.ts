// ─── Node Size Stats / Relative Radius ─────────────────────
// プロジェクト規模 (ノード数 / lineCount 分布) に依らない相対的な
// ノード半径・リング間隔・padding を計算するためのユーティリティ。
// 描画 (graph.ts) と物理衝突判定 (worker.ts forceCollide) で
// 同じ関数を使うことで「描画はノード A と B が離れているのに
// 衝突半径だけ重なる」という不整合を解消する。

import type { NodeSizeStats } from '../../shared/types.js';

/**
 * 仮想ビューポートの基準サイズ。実際の表示ピクセルではなく
 * 「ノード配置のスケール基準」。viewport.worldWidth/Height (= 10000) より
 * 小さめにとり、全ノードがこの矩形内に収まることを意図した値。
 */
const VIRTUAL_VIEWPORT_SIDE = 4000;
const VIRTUAL_VIEWPORT_AREA = VIRTUAL_VIEWPORT_SIDE * VIRTUAL_VIEWPORT_SIDE;

/** 全ノードが占めるべき面積の比率 (10% 目安、密度がちょうど良い経験値) */
const TARGET_NODE_COVERAGE = 0.10;

/** ノード半径の上下限を avgRadius からどれくらい外せるか (相対倍率) */
const MIN_RADIUS_RATIO = 0.45;
const MAX_RADIUS_RATIO = 2.4;

/**
 * 全ノードを走査して lineCount の分布統計を算出する。
 * worker / webview の両方で同じ stats を共有するため、純粋関数で書く。
 */
export function computeNodeSizeStats(nodes: ReadonlyArray<{ lineCount: number }>): NodeSizeStats {
    const count = nodes.length;
    if (count === 0) {
        return { count: 0, minLines: 1, maxLines: 1, medianLines: 1, p90Lines: 1 };
    }
    const sorted = nodes.map(n => Math.max(1, n.lineCount)).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    return {
        count,
        minLines: sorted[0],
        maxLines: sorted[sorted.length - 1],
        medianLines: median,
        p90Lines: p90,
    };
}

/**
 * stats から「ノード 1 個あたりの平均半径」を逆算する。
 * 全ノード面積の合計 = 仮想ビューポート面積 × TARGET_NODE_COVERAGE になるよう
 * avgRadius を決めることで、ノード数が 100 でも 10000 でも視覚的な密度が
 * ほぼ一定になる。
 */
function computeAvgRadius(stats: NodeSizeStats): number {
    if (stats.count <= 0) { return 16; }
    const avgArea = (VIRTUAL_VIEWPORT_AREA * TARGET_NODE_COVERAGE) / stats.count;
    return Math.max(6, Math.sqrt(avgArea / Math.PI));
}

/**
 * ノード 1 つの相対描画半径を返す。
 * lineCount を log 正規化して [MIN_RADIUS_RATIO, MAX_RADIUS_RATIO] 倍に
 * マッピングし、avgRadius を中央値とする分布にする。
 * focus フラグが立っているときは 1.4 倍 (現状の慣習を維持)。
 */
export function computeNodeRadius(
    lineCount: number,
    stats: NodeSizeStats,
    isFocus: boolean = false,
): number {
    const avg = computeAvgRadius(stats);
    const minR = avg * MIN_RADIUS_RATIO;
    const maxR = avg * MAX_RADIUS_RATIO;

    // lineCount を log スケールで [0, 1] に正規化
    const logMax = Math.log(Math.max(2, stats.maxLines));
    const logMin = Math.log(Math.max(1, stats.minLines));
    const logSpan = Math.max(0.1, logMax - logMin);
    const t = (Math.log(Math.max(1, lineCount)) - logMin) / logSpan;
    const clamped = Math.max(0, Math.min(1, t));

    const radius = minR + clamped * (maxR - minR);
    return isFocus ? radius * 1.4 : radius;
}

/**
 * Galaxy レイアウトのリング間隔。
 * 深度ごとに「同深度ノードの最大半径 × 4 + 安全マージン」をとり、
 * プロジェクト規模に応じて自動拡縮する。
 */
export function computeRingSpacing(stats: NodeSizeStats): number {
    const avg = computeAvgRadius(stats);
    return avg * 6; // 半径 6 倍ぶんの間隔。隣接ノードの直径 (= 2r) を 2-3 個分挟む計算
}

/**
 * Balloon (d3-pack) の padding。子円同士の隙間を avgRadius ベースで設定し、
 * 大きいファイルだらけの project でも小さい file だらけの project でも
 * 体感の「詰まり方」が一定になるようにする。
 */
export function computeBalloonPadding(stats: NodeSizeStats): number {
    const avg = computeAvgRadius(stats);
    // d3-pack の padding は「兄弟円の中心間に追加するマージン」。
    // 平均半径の 0.6 倍くらい挟めば視覚的に余裕がある。
    return Math.max(4, avg * 0.6);
}
