// ─── Rune UI + Layout UI (ヘッダーバー) ─────────────────
import { Graphics, Text, TextStyle, Container } from 'pixi.js';
import type { RuneMode, LayoutMode } from '../../shared/types.js';
import { state } from '../core/state.js';
import { sendMessage } from '../core/vscode-api.js';
import { t, type TranslationKey } from '../core/i18n.js';
import { sendToWorker } from '../core/worker-bridge.js';

// ─── 定数 ────────────────────────────────────────────────
export const TOOLBAR_BTN_SIZE = 34;
export const TOOLBAR_GAP = 4;
export const TOOLBAR_PAD = 8;
export const TOOLBAR_Y = 10;

// ─── Rune ボタン定義 ────────────────────────────────────
interface RuneButton {
    mode: RuneMode;
    translationKey: TranslationKey;
    icon: string;
    color: number;
}

export const RUNE_BUTTONS: RuneButton[] = [
    { mode: 'default',       translationKey: 'rune.default',       icon: '◇', color: 0x6696ff },
    { mode: 'architecture',  translationKey: 'rune.architecture',  icon: '⬡', color: 0x44bbff },
    { mode: 'security',      translationKey: 'rune.security',      icon: '⚠', color: 0xff8800 },
    { mode: 'optimization',  translationKey: 'rune.optimization',  icon: '⚡', color: 0x44ff88 },
    { mode: 'refactoring',   translationKey: 'rune.refactoring',   icon: '🔥', color: 0xff4400 },
];

// ─── Layout ボタン定義 ──────────────────────────────────
interface LayoutButton {
    mode: LayoutMode;
    translationKey: TranslationKey;
    icon: string;
    color: number;
}

export const LAYOUT_BUTTONS: LayoutButton[] = [
    { mode: 'force',   translationKey: 'layout.mandala',   icon: '◎', color: 0x8866ff },
    { mode: 'tree',    translationKey: 'layout.yggdrasil', icon: '🌳', color: 0x44cc88 },
    { mode: 'balloon', translationKey: 'layout.bubble',    icon: '◉', color: 0x6699ff },
];

// ─── 内部参照 ────────────────────────────────────────────
let toolbarContainer: Container;
let tooltipContainer: Container;
let tooltipBg: Graphics;
let tooltipText: Text;
let _uiContainer: Container;

let _renderGraph: () => void;
let _startParticleLoading: () => void;
let _updateStatusText: () => void;

export function setToolbarContext(ctx: {
    uiContainer: Container;
    renderGraph: () => void;
    startParticleLoading: () => void;
    updateStatusText: () => void;
}) {
    _uiContainer = ctx.uiContainer;
    _renderGraph = ctx.renderGraph;
    _startParticleLoading = ctx.startParticleLoading;
    _updateStatusText = ctx.updateStatusText;
}

export function initRuneUI() {
    toolbarContainer = new Container();
    toolbarContainer.position.set(TOOLBAR_PAD, TOOLBAR_Y);
    _uiContainer.addChild(toolbarContainer);

    tooltipContainer = new Container();
    tooltipContainer.visible = false;
    tooltipBg = new Graphics();
    tooltipContainer.addChild(tooltipBg);
    tooltipText = new Text({
        text: '',
        style: new TextStyle({ fontSize: 11, fill: 0xd0d8ff, fontFamily: 'system-ui, -apple-system, sans-serif' }),
    });
    tooltipText.position.set(8, 5);
    tooltipContainer.addChild(tooltipText);
    _uiContainer.addChild(tooltipContainer);

    refreshRuneUI();
}

export function refreshRuneUI() {
    toolbarContainer.removeChildren();
    let xOffset = 0;

    for (const btn of RUNE_BUTTONS) {
        const bc = createToolbarButton(btn.icon, btn.color, state.runeMode === btn.mode, t(btn.translationKey), xOffset);
        bc.on('pointertap', () => {
            state.runeMode = btn.mode;
            sendMessage({ type: 'RUNE_MODE_CHANGE', payload: { mode: btn.mode } });
            refreshRuneUI();
            _renderGraph();
        });
        toolbarContainer.addChild(bc);
        xOffset += TOOLBAR_BTN_SIZE + TOOLBAR_GAP;
    }

    const sep = new Graphics();
    sep.moveTo(xOffset + 2, 4);
    sep.lineTo(xOffset + 2, TOOLBAR_BTN_SIZE - 4);
    sep.stroke({ width: 1, color: 0x334466, alpha: 0.5 });
    toolbarContainer.addChild(sep);
    xOffset += 10;

    for (const btn of LAYOUT_BUTTONS) {
        const bc = createToolbarButton(btn.icon, btn.color, state.layoutMode === btn.mode, t(btn.translationKey), xOffset);
        bc.on('pointertap', () => {
            switchLayoutMode(btn.mode);
            refreshRuneUI();
        });
        toolbarContainer.addChild(bc);
        xOffset += TOOLBAR_BTN_SIZE + TOOLBAR_GAP;
    }
}

function createToolbarButton(icon: string, color: number, isActive: boolean, tooltip: string, x: number): Container {
    const bc = new Container();
    bc.position.set(x, 0);
    bc.eventMode = 'static';
    bc.cursor = 'pointer';

    const bg = new Graphics();
    bg.roundRect(0, 0, TOOLBAR_BTN_SIZE, TOOLBAR_BTN_SIZE, 8);
    bg.fill({ color: isActive ? color : 0x151830, alpha: isActive ? 0.35 : 0.7 });
    bg.stroke({ width: 1.5, color: color, alpha: isActive ? 0.9 : 0.25 });
    bc.addChild(bg);

    if (isActive) {
        const dot = new Graphics();
        dot.circle(TOOLBAR_BTN_SIZE / 2, TOOLBAR_BTN_SIZE - 3, 2);
        dot.fill({ color: color, alpha: 1 });
        bc.addChild(dot);
    }

    const iconText = new Text({
        text: icon,
        style: new TextStyle({ fontSize: 15, fill: isActive ? 0xffffff : color }),
    });
    iconText.anchor.set(0.5, 0.5);
    iconText.position.set(TOOLBAR_BTN_SIZE / 2, TOOLBAR_BTN_SIZE / 2 - 1);
    bc.addChild(iconText);

    bc.on('pointerover', () => {
        showTooltip(tooltip, x + TOOLBAR_PAD, TOOLBAR_Y + TOOLBAR_BTN_SIZE + 6);
    });
    bc.on('pointerout', hideTooltip);

    return bc;
}

function showTooltip(text: string, x: number, y: number) {
    tooltipText.text = text;
    const w = tooltipText.width + 16;
    const h = 24;
    tooltipBg.clear();
    tooltipBg.roundRect(0, 0, w, h, 5);
    tooltipBg.fill({ color: 0x0f1228, alpha: 0.92 });
    tooltipBg.stroke({ width: 1, color: 0x334466, alpha: 0.6 });
    tooltipContainer.position.set(x, y);
    tooltipContainer.visible = true;
}

function hideTooltip() {
    tooltipContainer.visible = false;
}

/** レイアウトモード切り替え */
export function switchLayoutMode(newMode: LayoutMode) {
    if (state.layoutMode === newMode) { return; }
    state.layoutMode = newMode;

    sendToWorker({ type: 'LAYOUT_CHANGE', payload: { mode: newMode } });

    state.isLoading = true;
    _startParticleLoading();
    _updateStatusText();
}

export function initLayoutUI() {
    // Layout ボタンは refreshRuneUI() 内でヘッダーバーに統合描画される
}

export function refreshLayoutUI() {
    refreshRuneUI();
}

/** ツールバーコンテナを返す (resize 連動用) */
export function getToolbarContainer() { return toolbarContainer; }
