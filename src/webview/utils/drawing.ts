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
    ringContainer.removeChildren();
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

        const alpha = isFocused
            ? Math.max(0.1, 0.2 - group.depth * 0.02)
            : Math.max(0.04, 0.12 - group.depth * 0.02);
        const strokeAlpha = isFocused
            ? Math.max(0.4, 0.7 - group.depth * 0.04)
            : Math.max(0.08, 0.25 - group.depth * 0.04);
        const strokeWidth = isFocused ? 3 : 1;
        const strokeColor = isFocused ? 0x66ddff : 0xdde4f0;
        const fillColor = isFocused ? 0x1a3366 : 0x1a2855;

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

        // ラベル描画 (LOD Mid のみ)
        if (state.currentLOD === 'mid' && group.r >= 30) {
            const labelFontSize = isFocused
                ? Math.min(16, Math.max(10, group.r * 0.15))
                : Math.min(12, Math.max(8, group.r * 0.12));
            const labelColor = isFocused ? 0x88ccee : 0x5580aa;
            const label = createSmartText(group.label, {
                fontSize: labelFontSize,
                fill: labelColor,
                ...(isFocused ? { fontWeight: 'bold' } : {}),
            });
            label.anchor.set(0.5, 0);
            label.position.set(0, -group.r + 4);
            label.alpha = isFocused
                ? Math.max(0.7, 0.95 - group.depth * 0.05)
                : Math.max(0.3, 0.7 - group.depth * 0.1);

            if (onGroupTap) {
                label.eventMode = 'static';
                label.cursor = 'pointer';
                const captured = group;
                label.on('pointertap', (e: any) => {
                    e.stopPropagation();
                    onGroupTap(captured);
                });
            }

            groupContainer.addChild(label);
        }

        ringContainer.addChild(groupContainer);
    }
}
