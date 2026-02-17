// ─── Minimap (V3 Phase 2) ───────────────────────────────
import { Graphics, Container, FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { state } from '../core/state.js';
import { getNodeColor } from '../utils/color.js';

export const MINIMAP_SCALE = 0.1;
export const MINIMAP_SIZE = 160;

let minimapContainer: Container;
let minimapGfx: Graphics;
let _uiContainer: Container;
let _viewport: Viewport;
let _animateViewportTo: (x: number, y: number) => void;

export function setMinimapContext(ctx: {
    uiContainer: Container;
    viewport: Viewport;
    animateViewportTo: (x: number, y: number) => void;
}) {
    _uiContainer = ctx.uiContainer;
    _viewport = ctx.viewport;
    _animateViewportTo = ctx.animateViewportTo;
}

export function getMinimapGfx() { return minimapGfx; }
export function getMinimapContainer() { return minimapContainer; }

export function initMinimap() {
    minimapContainer = new Container();
    minimapGfx = new Graphics();
    minimapContainer.addChild(minimapGfx);
    _uiContainer.addChild(minimapContainer);

    updateMinimapPosition();

    minimapContainer.eventMode = 'static';
    minimapContainer.cursor = 'pointer';
    minimapContainer.on('pointertap', (e: FederatedPointerEvent) => {
        const local = minimapContainer.toLocal(e.global);
        const worldX = (local.x - MINIMAP_SIZE / 2) / MINIMAP_SCALE;
        const worldY = (local.y - MINIMAP_SIZE / 2) / MINIMAP_SCALE;
        _animateViewportTo(worldX, worldY);
    });
}

export function updateMinimapPosition() {
    // レスポンシブ: 小画面ではミニマップを縮小
    const scale = window.innerWidth < 500 ? 0.6 : window.innerWidth < 800 ? 0.8 : 1.0;
    minimapContainer.scale.set(scale, scale);
    const effectiveSize = MINIMAP_SIZE * scale;
    minimapContainer.position.set(
        window.innerWidth - effectiveSize - 16,
        window.innerHeight - effectiveSize - 16,
    );
}

export function refreshMinimap() {
    minimapGfx.clear();

    minimapGfx.roundRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 6);
    minimapGfx.fill({ color: 0x0a0c1e, alpha: 0.8 });
    minimapGfx.stroke({ width: 1, color: 0x334466, alpha: 0.4 });

    if (!state.graph) { return; }

    for (const node of state.graph.nodes) {
        const pos = state.nodePositions.get(node.id);
        if (!pos) { continue; }

        const mx = pos.x * MINIMAP_SCALE + MINIMAP_SIZE / 2;
        const my = pos.y * MINIMAP_SCALE + MINIMAP_SIZE / 2;

        if (mx < 0 || mx > MINIMAP_SIZE || my < 0 || my > MINIMAP_SIZE) { continue; }

        const isFocus = node.id === state.focusNodeId;
        const color = isFocus ? 0x66ddff : getNodeColor(node);
        const radius = isFocus ? 3 : 1.5;

        minimapGfx.circle(mx, my, radius);
        minimapGfx.fill({ color, alpha: isFocus ? 1.0 : 0.6 });
    }

    const vp = _viewport;
    const vpLeft = (vp.left * MINIMAP_SCALE) + MINIMAP_SIZE / 2;
    const vpTop = (vp.top * MINIMAP_SCALE) + MINIMAP_SIZE / 2;
    const vpWidth = (vp.screenWidth / vp.scaled) * MINIMAP_SCALE;
    const vpHeight = (vp.screenHeight / vp.scaled) * MINIMAP_SCALE;

    minimapGfx.rect(vpLeft, vpTop, vpWidth, vpHeight);
    minimapGfx.stroke({ width: 1, color: 0x6699ff, alpha: 0.5 });
}
