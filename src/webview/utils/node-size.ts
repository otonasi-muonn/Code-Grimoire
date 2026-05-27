// ─── Node Size Stats / Relative Radius ─────────────────────
// プロジェクト規模 (ノード数) に応じて控えめに補正しつつ、
// もともと経験的に良い値だった絶対値式に近似するノード半径・
// リング間隔・padding を返す。
//
// 設計判断 (レビュー反映):
//   - 元の式 Math.max(12, Math.min(60, 8 + sqrt(lc)*3)) を base とする
//     (sqrt スケール + 12-60 範囲が「重みの距離感」と「大きすぎない」を両立)
//   - 規模補正は ±15-25% 程度に抑え、絶対値の特性を維持
//   - 描画 (graph.ts) と物理衝突判定 (worker.ts forceCollide) で
//     同じ関数を使うことで半径不整合を解消、という当初目的は維持

import type { NodeSizeStats } from '../../shared/types.js';

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
 * プロジェクト規模に応じた一様補正係数。
 * 大規模リポでは画面が詰まるので少し縮め、中小規模では元の絶対値式を維持。
 */
function scaleByCount(count: number): number {
    if (count > 2000) { return 0.75; }
    if (count > 1000) { return 0.85; }
    if (count > 500)  { return 0.95; }
    return 1.0;
}

/**
 * ノード 1 つの相対描画半径を返す。
 * 元の経験式 Math.max(12, Math.min(60, 8 + sqrt(lc)*3)) をそのまま base にし、
 * 規模補正係数を掛けるだけ。これで:
 *   - 100 ノード: 12 - 60 (元の式と完全一致)
 *   - 1000 ノード: 10.2 - 51 (85%)
 *   - 2000 ノード: 9 - 45 (75%)
 * となり、lineCount 差による「重みでの距離感」と
 * 「ノードが大きすぎ・はみ出し」回避を両立する。
 */
export function computeNodeRadius(
    lineCount: number,
    stats: NodeSizeStats,
    isFocus: boolean = false,
): number {
    const baseRadius = Math.max(12, Math.min(60, 8 + Math.sqrt(Math.max(1, lineCount)) * 3));
    const scale = scaleByCount(stats.count);
    const radius = baseRadius * scale;
    return isFocus ? radius * 1.4 : radius;
}

/**
 * Galaxy レイアウトのリング間隔。
 * 元の経験値 200 を base にしてプロジェクト規模で微調整するだけ。
 * RING_RADII (focus/context/global) は別途絶対値だが、今回触らない。
 */
export function computeRingSpacing(stats: NodeSizeStats): number {
    const base = 200;
    return base * scaleByCount(stats.count);
}

/**
 * Balloon (d3-pack) の padding。
 * 元の経験値 20 を base、大規模リポだけ詰めて container に収める。
 */
export function computeBalloonPadding(stats: NodeSizeStats): number {
    const base = 20;
    if (stats.count > 2000) { return Math.max(8, base * 0.65); }
    if (stats.count > 1000) { return Math.max(12, base * 0.8); }
    return base;
}
