// ─── 描画ユーティリティ ──────────────────────────────────
import { Graphics, Container } from 'pixi.js';
import type { GraphNode, BubbleGroup } from '../../shared/types.js';
import { state } from '../core/state.js';
import { createSmartText } from './font.js';

/** 点線 (dashed line) を描画するヘルパー */
export function drawDashedLine(gfx: Graphics, x0: number, y0: number, x1: number, y1: number, dashLen: number, gapLen: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) { return; }
    const ux = dx / dist;
    const uy = dy / dist;
    let drawn = 0;
    let drawing = true;
    while (drawn < dist) {
        const seg = drawing ? dashLen : gapLen;
        const end = Math.min(drawn + seg, dist);
        if (drawing) {
            gfx.moveTo(x0 + ux * drawn, y0 + uy * drawn);
            gfx.lineTo(x0 + ux * end, y0 + uy * end);
        }
        drawn = end;
        drawing = !drawing;
    }
}

/** ノードの種別とエクスポート数に応じた多角形の辺数を返す */
export function getNodeSides(node: GraphNode): number {
    if (node.kind === 'package' || node.kind === 'config') { return 4; }
    if (node.kind === 'declaration') { return 6; }
    if (node.kind === 'external') { return 3; }

    const exportCount = node.exports.length;
    if (exportCount <= 2) { return 20; }
    if (exportCount <= 5) { return 8; }
    return 6;
}

/** 同心円ガイド描画 */
export function drawRingGuides(ringContainer: Container) {
    // graph.ts:renderGraph と同じ理由で、removeChildren より前に destroy しておく。
    const oldRings = [...ringContainer.children];
    ringContainer.removeChildren();
    for (const c of oldRings) { c.destroy({ children: true }); }
    const gfx = new Graphics();

    if (state.layoutMode === 'galaxy') {
        // Galaxy: BFS 深度リングを描画 (最大 8 リング)
        for (let i = 0; i < 8; i++) {
            const radius = (i + 1) * 200;
            gfx.circle(0, 0, radius);
            gfx.stroke({ width: 1, color: 0x1a2244, alpha: Math.max(0.08, 0.3 - i * 0.03) });
        }

        // 中心マーカー (エントリーポイント)
        gfx.circle(0, 0, 20);
        gfx.fill({ color: 0x2244aa, alpha: 0.15 });
        gfx.stroke({ width: 1.5, color: 0x4466cc, alpha: 0.4 });
    } else {
        // Mandala / Balloon: デフォルトリングガイド
        // Focus ring (中心の円)
        gfx.circle(0, 0, 30);
        gfx.stroke({ width: 1, color: 0x1a2244, alpha: 0.4 });

        // Context ring
        gfx.circle(0, 0, 250);
        gfx.stroke({ width: 1, color: 0x1a2244, alpha: 0.3 });

        // Global ring
        gfx.circle(0, 0, 550);
        gfx.stroke({ width: 1, color: 0x1a2244, alpha: 0.2 });
    }

    ringContainer.addChild(gfx);
}

/**
 * v2 改修 (T-06): BubbleMetric に応じてフォルダ円の塗り色を返す。
 * フォーカス枠線は常に最優先表示するため、本関数は内部塗り色のみ決定する。
 */
function getMetricFillColor(group: BubbleGroup): number | null {
    // メトリクス未計算 (cohesion 等が undefined) なら null を返してデフォルト色を維持
    switch (state.bubbleMetric) {
        case 'cohesion': {
            const c = group.cohesion;
            if (c === undefined) { return null; }
            if (c >= 0.8) { return 0x44dd66; } // 高凝集 = 緑
            if (c >= 0.5) { return 0xddcc44; } // 中 = 黄
            return 0xdd4444;                    // 低凝集 = 赤
        }
        case 'avgLines': {
            const a = group.avgLineCount;
            if (a === undefined) { return null; }
            // 平均行数: 小さいほど良い (200 行以下緑 / 500 行以下黄 / 超 赤)
            if (a < 200) { return 0x44dd66; }
            if (a < 500) { return 0xddcc44; }
            return 0xdd4444;
        }
        case 'cycles': {
            const cy = group.cycleCount;
            if (cy === undefined) { return null; }
            if (cy === 0) { return 0x44dd66; }
            if (cy <= 2) { return 0xddcc44; }
            return 0xdd4444;
        }
    }
    return null;
}

/** Bubble レイアウト時のディレクトリグループ円を描画 */
export function drawBubbleGroups(
    ringContainer: Container,
    onGroupTap?: (group: BubbleGroup) => void,
) {
    // 深い順にソート (背面から描画するため depth が大きい=最も内側 を先に描画しない)
    // → depth が小さいもの (外側のディレクトリ) を先に描画
    const sorted = [...state.bubbleGroups].sort((a, b) => a.depth - b.depth);

    for (const group of sorted) {
        // フォーカス中のフォルダかどうか判定
        const isFocused = state.focusedBubbleGroup !== null &&
            group.label === state.focusedBubbleGroup.label &&
            group.depth === state.focusedBubbleGroup.depth &&
            Math.abs(group.x - state.focusedBubbleGroup.x) < 1;

        // v2 改修 (レビュー): 深い階層でも bubble の塗りが視認できるよう、
        // 非フォーカス時の最小 alpha を 0.04 → 0.10 に引き上げ、減衰係数を
        // 0.02 → 0.015 に緩和する。重なり過多なら別途 LOD で間引く。
        const alpha = isFocused
            ? Math.max(0.12, 0.22 - group.depth * 0.015)
            : Math.max(0.10, 0.16 - group.depth * 0.015);
        const strokeAlpha = isFocused
            ? Math.max(0.4, 0.7 - group.depth * 0.04)
            : Math.max(0.08, 0.25 - group.depth * 0.04);
        const strokeWidth = isFocused ? 3 : 1;
        // v2 改修 (T-06): フォーカス枠線は最優先で青、非フォーカス時はメトリクス色を縁取りに反映
        const metricColor = !isFocused ? getMetricFillColor(group) : null;
        const strokeColor = isFocused ? 0x66ddff : (metricColor ?? 0xdde4f0);
        const fillColor = isFocused ? 0x1a3366 : (metricColor ?? 0x1a2855);

        // グループ円をインタラクティブな Container にする
        const groupContainer = new Container();
        groupContainer.position.set(group.x, group.y);

        const circleGfx = new Graphics();
        circleGfx.circle(0, 0, group.r);
        circleGfx.fill({ color: fillColor, alpha });
        circleGfx.stroke({ width: strokeWidth, color: strokeColor, alpha: strokeAlpha });
        groupContainer.addChild(circleGfx);

        // クリック判定用: hitArea を設定して円全体をタッチ可能にする
        if (onGroupTap) {
            groupContainer.eventMode = 'static';
            groupContainer.cursor = 'pointer';
            // 円の外側のリング部分のみ反応（内部の子ノードと干渉しないよう）
            // ラベル付近 + 外縁帯 (半径の85%〜100%) をヒット判定領域にする
            const outerHit = new Graphics();
            outerHit.circle(0, 0, group.r);
            outerHit.fill({ color: 0xffffff, alpha: 0.001 }); // ほぼ透明だがヒット判定に必要
            outerHit.eventMode = 'static';
            outerHit.cursor = 'pointer';

            const captured = group;
            outerHit.on('pointertap', (e) => {
                e.stopPropagation();
                onGroupTap(captured);
            });

            // ポインターオーバーで外縁をハイライト
            outerHit.on('pointerover', () => {
                circleGfx.clear();
                circleGfx.circle(0, 0, group.r);
                circleGfx.fill({ color: 0x223366, alpha: alpha * 2 });
                circleGfx.stroke({ width: strokeWidth + 1, color: 0x88bbdd, alpha: Math.min(1, strokeAlpha * 2) });
            });
            outerHit.on('pointerout', () => {
                circleGfx.clear();
                circleGfx.circle(0, 0, group.r);
                circleGfx.fill({ color: fillColor, alpha });
                circleGfx.stroke({ width: strokeWidth, color: strokeColor, alpha: strokeAlpha });
            });

            groupContainer.addChild(outerHit);
        }

        // ラベル描画 (LOD Mid のみ。Far では bubble 円のみ残る)
        // v2 改修 (レビュー): 非フォーカス時のフォントを 8-12 → 11-14 に底上げ、
        // alpha 減衰も 0.1 係数 → 0.05 に緩和して深い階層でも読める形にする。
        // さらにラベル背後に半透明ボックスを敷き、上に重なる node に label が
        // 完全に隠されないようにする (描画順制約の回避)。
        if (state.currentLOD === 'mid' && group.r >= 30) {
            const labelFontSize = isFocused
                ? Math.min(16, Math.max(11, group.r * 0.15))
                : Math.min(14, Math.max(11, group.r * 0.16));
            const labelColor = isFocused ? 0x88ccee : 0x88a8d0;
            const label = createSmartText(group.label, {
                fontSize: labelFontSize,
                fill: labelColor,
                ...(isFocused ? { fontWeight: 'bold' } : {}),
            });
            label.anchor.set(0.5, 0);
            label.position.set(0, -group.r + 4);
            const labelAlpha = isFocused
                ? Math.max(0.75, 0.95 - group.depth * 0.04)
                : Math.max(0.55, 0.8 - group.depth * 0.05);
            label.alpha = labelAlpha;

            // ラベル背景: createSmartText 後に width/height が確定するので、
            // それを使って padding 付きの矩形を label の直前に挿入する。
            const padX = 5;
            const padY = 2;
            const bgWidth = label.width + padX * 2;
            const bgHeight = label.height + padY * 2;
            const labelBg = new Graphics();
            labelBg.roundRect(-bgWidth / 2, -group.r + 4 - padY, bgWidth, bgHeight, 3);
            labelBg.fill({ color: 0x0a1428, alpha: Math.min(0.7, labelAlpha + 0.1) });

            if (onGroupTap) {
                label.eventMode = 'static';
                label.cursor = 'pointer';
                const captured = group;
                label.on('pointertap', (e: any) => {
                    e.stopPropagation();
                    onGroupTap(captured);
                });
            }

            groupContainer.addChild(labelBg);
            groupContainer.addChild(label);
        }

        ringContainer.addChild(groupContainer);
    }
}
