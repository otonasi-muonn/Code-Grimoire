// ============================================================
// Code Grimoire - Webview メインスクリプト (PixiJS + D3 Worker)
// Phase 2: 3層同心円レイアウト + Summoning + Warm-up/Freeze
// ============================================================
import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type {
    ExtensionToWebviewMessage,
    LayoutMode,
} from '../shared/types.js';

// ─── Core ─────────────────────────────────────────────────
import { sendMessage } from './core/vscode-api.js';
import { getLODLevel } from './core/lod.js';
import { t, setCurrentLang, applyLocalization } from './core/i18n.js';
import { state } from './core/state.js';
import {
    initWorker,
    onGraphReceived,
    sendToWorker,
} from './core/worker-bridge.js';

// ─── Utils ────────────────────────────────────────────────
import { installBitmapFont } from './utils/font.js';

// ─── Renderer ─────────────────────────────────────────────
import {
    setEffectsContext,
    initParticleSystem,
    startParticleLoading,
    stopParticleLoading,
    triggerErrorFlash,
} from './renderer/effects.js';
import {
    renderGraph,
    setGraphContext,
    setMinimapGfx,
    selectedNodeId,
} from './renderer/graph.js';

// ─── UI ───────────────────────────────────────────────────
import {
    setToolbarContext,
    initRuneUI,
    initLayoutUI,
    refreshRuneUI,
    switchLayoutMode,
    RUNE_BUTTONS,
    TOOLBAR_PAD,
    TOOLBAR_Y,
    TOOLBAR_BTN_SIZE,
} from './ui/toolbar.js';
import {
    setBreadcrumbContext,
    initBreadcrumbs,
    refreshBreadcrumbs,
    getBreadcrumbContainer,
} from './ui/breadcrumbs.js';
import {
    setSearchContext,
    initSearchOverlay,
} from './ui/search.js';
import {
    setMinimapContext,
    initMinimap,
    refreshMinimap,
    updateMinimapPosition,
    getMinimapGfx,
    getMinimapContainer,
} from './ui/minimap.js';
import {
    setDetailPanelContext,
    initDetailPanel,
    openDetailPanel,
    closeDetailPanel,
    onCodePeekResponse,
} from './ui/detail-panel.js';
import {
    setHelpContext,
    initHelpOverlay,
    toggleHelp,
    helpVisible,
} from './ui/help.js';

// ─── Summoning (フォーカス切り替え) ──────────────────────
function summonNode(nodeId: string) {
    if (state.focusNodeId === nodeId) { return; }

    const node = state.graph?.nodes.find(n => n.id === nodeId);
    const label = node?.label || nodeId.split('/').pop() || nodeId;
    const existingIdx = state.breadcrumbs.findIndex(b => b.nodeId === nodeId);
    if (existingIdx >= 0) {
        state.breadcrumbs = state.breadcrumbs.slice(0, existingIdx + 1);
    } else {
        state.breadcrumbs.push({ nodeId, label });
        if (state.breadcrumbs.length > 12) {
            state.breadcrumbs = state.breadcrumbs.slice(-12);
        }
    }

    state.focusNodeId = nodeId;

    sendMessage({ type: 'FOCUS_NODE', payload: { nodeId } });
    sendToWorker({ type: 'FOCUS', payload: { focusNodeId: nodeId } });

    state.isLoading = true;
    startParticleLoading();
    updateStatusText();
    refreshBreadcrumbs();

    const pos = state.nodePositions.get(nodeId);
    if (pos) {
        animateViewportTo(pos.x, pos.y);
    }
}

/** Viewport をスムーズにターゲット座標へ移動 */
function animateViewportTo(targetX: number, targetY: number) {
    const duration = 600;
    const startX = viewport.center.x;
    const startY = viewport.center.y;
    const startTime = performance.now();

    const panelOffset = selectedNodeId ? -170 / viewport.scaled : 0;
    const finalX = targetX - panelOffset;

    const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        const x = startX + (finalX - startX) * ease;
        const y = startY + (targetY - startY) * ease;
        viewport.moveCenter(x, y);

        if (t < 1) {
            requestAnimationFrame(animate);
        }
    };
    requestAnimationFrame(animate);
}

// ─── Extension メッセージ受信 ────────────────────────────
window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'INSTANT_STRUCTURE':
            state.projectName = msg.payload.projectName;
            state.isLoading = true;
            if (msg.payload.language) {
                setCurrentLang(msg.payload.language.startsWith('ja') ? 'ja' : 'en');
                applyLocalization(refreshRuneUI);
            }
            updateStatusText();
            break;
        case 'GRAPH_DATA':
            state.graph = msg.payload;
            state.error = null;
            onGraphReceived({ updateStatusText, startParticleLoading });
            break;
        case 'ANALYSIS_ERROR':
            state.error = msg.payload.message;
            state.isLoading = false;
            renderError();
            break;
        case 'CODE_PEEK_RESPONSE':
            onCodePeekResponse(msg.payload);
            break;
    }
});

// ─── PixiJS 初期化 ──────────────────────────────────────
function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => overlay.remove(), 600);
    }
}

let app: Application;
let viewport: Viewport;
let nodeContainer: Container;
let edgeContainer: Container;
let ringContainer: Container;
let uiContainer: Container;
let statusText: Text;
let fpsText: Text;

async function init() {
    app = new Application();
    await app.init({
        background: 0x080a18,
        resizeTo: window,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    });

    document.body.appendChild(app.canvas as HTMLCanvasElement);

    installBitmapFont();
    hideLoadingOverlay();

    viewport = new Viewport({
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        worldWidth: 10000,
        worldHeight: 10000,
        events: app.renderer.events,
    });

    viewport
        .drag()
        .pinch()
        .wheel()
        .decelerate()
        .clampZoom({ minScale: 0.05, maxScale: 5 });

    app.stage.addChild(viewport);

    ringContainer = new Container();
    edgeContainer = new Container();
    nodeContainer = new Container();
    uiContainer = new Container();

    viewport.addChild(ringContainer);
    viewport.addChild(edgeContainer);
    viewport.addChild(nodeContainer);
    app.stage.addChild(uiContainer);

    // ステータステキスト
    const statusStyle = new TextStyle({
        fontSize: 14,
        fill: 0x6696ff,
        fontFamily: 'Consolas, "Courier New", monospace',
    });
    statusText = new Text({ text: t('status.awaiting'), style: statusStyle });
    statusText.position.set(16, window.innerHeight - 40);
    uiContainer.addChild(statusText);

    // FPS表示
    const fpsStyle = new TextStyle({
        fontSize: 12,
        fill: 0x445588,
        fontFamily: 'Consolas, monospace',
    });
    fpsText = new Text({ text: 'FPS: --', style: fpsStyle });
    fpsText.position.set(window.innerWidth - 100, 16);
    uiContainer.addChild(fpsText);

    app.ticker.add(() => {
        fpsText.text = `FPS: ${Math.round(app.ticker.FPS)}`;
    });

    window.addEventListener('resize', () => {
        viewport.resize(window.innerWidth, window.innerHeight);
        statusText.position.set(16, window.innerHeight - 40);
        fpsText.position.set(window.innerWidth - 100, 16);
        const bc = getBreadcrumbContainer();
        if (bc) {
            bc.position.set(TOOLBAR_PAD, TOOLBAR_Y + TOOLBAR_BTN_SIZE + 8);
        }
        const mc = getMinimapContainer();
        if (mc) {
            updateMinimapPosition();
        }
    });

    // LOD: ズーム変更で LOD レベルが切り替わったら再描画
    viewport.on('zoomed', () => {
        const newLOD = getLODLevel(viewport.scaled);
        if (newLOD !== state.currentLOD) {
            state.currentLOD = newLOD;
            renderGraph();
        }
        if (getMinimapGfx()) { refreshMinimap(); }
    });

    viewport.on('moved', () => {
        if (getMinimapGfx()) { refreshMinimap(); }
    });

    // 背景クリックで Detail Panel を閉じる
    viewport.on('clicked', (e: any) => {
        if (!state.hoveredNodeId && selectedNodeId) {
            closeDetailPanel();
        }
    });

    // ── 各モジュールにコンテキストを注入 ──
    setEffectsContext(app, viewport);
    setGraphContext({
        viewport,
        nodeContainer,
        edgeContainer,
        ringContainer,
        summonNode,
        openDetailPanel,
        refreshMinimap,
    });
    setToolbarContext({
        uiContainer,
        renderGraph,
        startParticleLoading,
        updateStatusText,
    });
    setBreadcrumbContext({ uiContainer, summonNode });
    setSearchContext({ renderGraph, animateViewportTo });
    setMinimapContext({ uiContainer, viewport, animateViewportTo });
    setDetailPanelContext({ summonNode, renderGraph, animateViewportTo });
    setHelpContext({ uiContainer });

    // ── 初期化 ──
    initWorker({
        renderGraph,
        stopParticleLoading,
        updateStatusText,
        onGraphReceived: () => onGraphReceived({ updateStatusText, startParticleLoading }),
        viewport,
    });

    initParticleSystem();
    startParticleLoading();

    initRuneUI();
    initLayoutUI();
    initBreadcrumbs();
    initSearchOverlay();
    initMinimap();
    initDetailPanel();
    initHelpOverlay();
    initKeyboardShortcuts();

    // Minimap の Graphics 参照を graph renderer に渡す
    setMinimapGfx(getMinimapGfx());

    sendMessage({ type: 'REQUEST_ANALYSIS' });
}

// ─── UI ──────────────────────────────────────────────────
function updateStatusText() {
    if (state.isLoading) {
        statusText.text = `⟐ ${state.projectName} — ${t('status.computing')}`;
    } else if (state.graph) {
        const g = state.graph;
        const focusLabel = state.focusNodeId
            ? state.graph?.nodes.find(n => n.id === state.focusNodeId)?.label || ''
            : '';
        const runeLabel = state.runeMode !== 'default' ? ` | Rune: ${state.runeMode}` : '';
        const layoutLabel = state.layoutMode !== 'force' ? ` | Layout: ${state.layoutMode}` : '';
        const cycleCount = g.circularDeps?.length || 0;
        const cycleInfo = state.runeMode === 'architecture' && cycleCount > 0
            ? ` | ⟳ ${cycleCount} cycles` : '';
        const lodLabel = state.currentLOD !== 'mid' ? ` | LOD: ${state.currentLOD}` : '';
        statusText.text = `⟐ ${state.projectName} — ${g.nodes.length} files, ${g.edges.length} deps (${g.analysisTimeMs}ms) | Focus: ${focusLabel}${runeLabel}${layoutLabel}${cycleInfo}${lodLabel}`;
    }
}

function renderError() {
    nodeContainer.removeChildren();
    edgeContainer.removeChildren();

    triggerErrorFlash();

    const style = new TextStyle({
        fontSize: 20,
        fill: 0xff3333,
        fontFamily: 'Consolas, monospace',
        align: 'center',
    });
    const errText = new Text({ text: `✦ Analysis Error ✦\n${state.error || 'Unknown'}`, style });
    errText.anchor.set(0.5, 0.5);
    errText.position.set(0, 0);
    nodeContainer.addChild(errText);
    viewport.moveCenter(0, 0);
}

// ─── Keyboard Shortcuts (V6 UX+) ────────────────────────
function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') { return; }

        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
            e.preventDefault();
            toggleHelp();
            return;
        }

        if (e.key === 'Escape') {
            if (helpVisible) { toggleHelp(false); return; }
            if (selectedNodeId) { closeDetailPanel(); return; }
            return;
        }

        const runeIndex = parseInt(e.key, 10) - 1;
        if (runeIndex >= 0 && runeIndex < RUNE_BUTTONS.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const btn = RUNE_BUTTONS[runeIndex];
            state.runeMode = btn.mode;
            sendMessage({ type: 'RUNE_MODE_CHANGE', payload: { mode: btn.mode } });
            refreshRuneUI();
            renderGraph();
            return;
        }

        const layoutKeyMap: Record<string, LayoutMode> = { q: 'force', w: 'galaxy', e: 'balloon' };
        const layoutMode = layoutKeyMap[e.key.toLowerCase()];
        if (layoutMode && !e.ctrlKey && !e.metaKey && !e.altKey) {
            switchLayoutMode(layoutMode);
            refreshRuneUI();
            return;
        }
    });
}

// ─── 起動 ────────────────────────────────────────────────
init().catch(err => {
    console.error('[Code Grimoire Webview] Init failed:', err);
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        const textEl = overlay.querySelector('.loading-text');
        if (textEl) {
            textEl.textContent = `✦ Init Error: ${err?.message || err}`;
            (textEl as HTMLElement).style.color = '#ff4444';
        }
        const circle = overlay.querySelector('.loading-circle');
        if (circle) { (circle as HTMLElement).style.display = 'none'; }
    }
});
