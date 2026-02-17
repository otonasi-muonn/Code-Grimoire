// ─── 描画ユーティリティ ──────────────────────────────────
import { Graphics } from 'pixi.js';
import type { GraphNode } from '../../shared/types.js';
import { state } from '../core/state.js';
import { createSmartText } from './font.js';
import type { Container } from 'pixi.js';

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

    // Focus ring (中心の円)
    gfx.circle(0, 0, 30);
    gfx.stroke({ width: 1, color: 0x1a2244, alpha: 0.4 });

    // Context ring
    gfx.circle(0, 0, 250);
    gfx.stroke({ width: 1, color: 0x1a2244, alpha: 0.3 });

    // Global ring
    gfx.circle(0, 0, 550);
    gfx.stroke({ width: 1, color: 0x1a2244, alpha: 0.2 });

    ringContainer.addChild(gfx);
}

/** Bubble レイアウト時のディレクトリグループ円を描画 */
export function drawBubbleGroups(ringContainer: Container) {
    const groupGfx = new Graphics();

    // 深い順にソート (背面から描画するため depth が大きい=最も内側 を先に描画しない)
    // → depth が小さいもの (外側のディレクトリ) を先に描画
    const sorted = [...state.bubbleGroups].sort((a, b) => a.depth - b.depth);

    for (const group of sorted) {
        const alpha = Math.max(0.04, 0.12 - group.depth * 0.02);
        const strokeAlpha = Math.max(0.08, 0.25 - group.depth * 0.04);

        // 塗りつぶし
        groupGfx.circle(group.x, group.y, group.r);
        groupGfx.fill({ color: 0x1a2855, alpha });
        groupGfx.stroke({ width: 1, color: 0xdde4f0, alpha: strokeAlpha });
    }

    // ラベル描画 (LOD Mid のみ)
    if (state.currentLOD === 'mid') {
        for (const group of sorted) {
            if (group.r < 30) { continue; } // 小さすぎるグループはスキップ
            const label = createSmartText(group.label, {
                fontSize: Math.min(12, Math.max(8, group.r * 0.12)),
                fill: 0x5580aa,
            });
            label.anchor.set(0.5, 0);
            label.position.set(group.x, group.y - group.r + 4);
            label.alpha = Math.max(0.3, 0.7 - group.depth * 0.1);
            ringContainer.addChild(label);
        }
    }

    ringContainer.addChild(groupGfx);
}
