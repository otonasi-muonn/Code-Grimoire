// ============================================================
// Code Grimoire - Webview メインスクリプト (PixiJS + D3 Worker)
// Phase 2: 3層同心円レイアウト + Summoning + Warm-up/Freeze
// ============================================================
import { Application, Graphics, Text, TextStyle, BitmapText, BitmapFont, Container, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    DependencyGraph,
    GraphNode,
    GraphEdge,
    MainToWorkerMessage,
    WorkerToMainMessage,
    WorkerNode,
    WorkerEdge,
    RuneMode,
    LayoutMode,
    HierarchyEdge,
} from '../shared/types.js';

// ─── VS Code API ────────────────────────────────────────
// @ts-expect-error acquireVsCodeApi は Webview 内でのみ利用可能
const vscode = acquireVsCodeApi();

// ─── LOD (Level of Detail) ───────────────────────────────
type LODLevel = 'far' | 'mid';

function getLODLevel(scale: number): LODLevel {
    if (scale < 0.3) { return 'far'; }
    return 'mid';
}

// ─── I18n (Localization) ─────────────────────────────────

type TranslationKey =
    | 'rune.default' | 'rune.architecture' | 'rune.security' | 'rune.optimization' | 'rune.refactoring'
    | 'layout.mandala' | 'layout.yggdrasil' | 'layout.bubble'
    | 'dp.path' | 'dp.info' | 'dp.git' | 'dp.exports' | 'dp.imports' | 'dp.importedBy'
    | 'dp.securityWarnings' | 'dp.optimization' | 'dp.codePreview'
    | 'search.placeholder' | 'search.matches'
    | 'status.computing' | 'status.awaiting'
    | 'loading.summoning'
    | 'help.title' | 'help.mouse' | 'help.keyboard' | 'help.legend';

const translations: Record<string, Record<TranslationKey, string>> = {
    en: {
        'rune.default': '◇ Default',
        'rune.architecture': '⬡ Architecture',
        'rune.security': '⚠ Security',
        'rune.optimization': '⚡ Optimization',
        'rune.refactoring': '🔥 Refactoring',
        'layout.mandala': '◎ Mandala',
        'layout.yggdrasil': '🌳 Yggdrasil',
        'layout.bubble': '◉ Bubble',
        'dp.path': 'Path',
        'dp.info': 'Info',
        'dp.git': 'Git',
        'dp.exports': 'Exports',
        'dp.imports': 'Imports',
        'dp.importedBy': 'Imported by',
        'dp.securityWarnings': '⚠ Security Warnings',
        'dp.optimization': '⚡ Optimization',
        'dp.codePreview': 'Code Preview',
        'search.placeholder': 'Search files... (Ctrl+F)',
        'search.matches': 'matches',
        'status.computing': 'Computing layout...',
        'status.awaiting': 'Awaiting analysis...',
        'loading.summoning': '⟐ Summoning the Magic Circle...',
        'help.title': '✦ Code Grimoire — Help',
        'help.mouse': 'Mouse',
        'help.keyboard': 'Keyboard',
        'help.legend': 'Symbol Legend',
    },
    ja: {
        'rune.default': '◇ 標準',
        'rune.architecture': '⬡ 構造 (Architecture)',
        'rune.security': '⚠ 防衛 (Security)',
        'rune.optimization': '⚡ 最適化 (Optimization)',
        'rune.refactoring': '🔥 再生 (Refactoring)',
        'layout.mandala': '◎ 魔法陣 (Mandala)',
        'layout.yggdrasil': '🌳 世界樹 (Yggdrasil)',
        'layout.bubble': '◉ 泡宇宙 (Bubble)',
        'dp.path': 'パス',
        'dp.info': '情報',
        'dp.git': 'Git',
        'dp.exports': 'エクスポート',
        'dp.imports': '依存 (Imports)',
        'dp.importedBy': '被依存 (Imported by)',
        'dp.securityWarnings': '⚠ セキュリティ警告',
        'dp.optimization': '⚡ 最適化',
        'dp.codePreview': 'コード閲覧',
        'search.placeholder': 'ファイルを検索... (Ctrl+F)',
        'search.matches': '件',
        'status.computing': '魔法陣を構築中...',
        'status.awaiting': '解析待機中...',
        'loading.summoning': '⟐ 魔法陣を召喚中...',
        'help.title': '✦ Code Grimoire — ヘルプ',
        'help.mouse': 'マウス操作',
        'help.keyboard': 'キーボード',
        'help.legend': 'シンボル凡例',
    },
};

let currentLang = 'en';

/** 翻訳キーからローカライズテキストを取得 */
function t(key: TranslationKey): string {
    const dict = translations[currentLang] || translations['en'];
    return dict[key] ?? translations['en'][key] ?? key;
}

/** 言語設定変更時に UI テキストを一括更新 */
function applyLocalization() {
    // Search placeholder
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    if (searchInput) {
        searchInput.placeholder = t('search.placeholder');
    }
    // Loading overlay text
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = t('loading.summoning');
    }
    // Rune & Layout UI (再描画で反映)
    if (typeof refreshRuneUI === 'function') { refreshRuneUI(); }
    if (typeof refreshLayoutUI === 'function') { refreshLayoutUI(); }
}

// ─── 状態管理 ────────────────────────────────────────────
interface BreadcrumbEntry {
    nodeId: string;
    label: string;
}

interface AppState {
    graph: DependencyGraph | null;
    projectName: string;
    isLoading: boolean;
    error: string | null;
    /** ノード位置キャッシュ (id -> {x, y}) */
    nodePositions: Map<string, { x: number; y: number }>;
    /** ノードのリング情報 */
    nodeRings: Map<string, 'focus' | 'context' | 'global'>;
    /** ホバー中のノードID */
    hoveredNodeId: string | null;
    /** フォーカス中のノードID */
    focusNodeId: string | null;
    /** Worker 準備完了フラグ */
    workerReady: boolean;
    /** ノードID の順序配列（Worker 座標との対応用） */
    nodeOrder: string[];
    /** 現在の Rune モード */
    runeMode: RuneMode;
    /** 現在の LOD レベル */
    currentLOD: LODLevel;
    /** 現在のレイアウトモード (V3) */
    layoutMode: LayoutMode;
    /** 階層エッジ (Tree/Balloon 時のみ、V3.5) */
    hierarchyEdges: HierarchyEdge[];
    /** 探索履歴 (Breadcrumbs) */
    breadcrumbs: BreadcrumbEntry[];
    /** ノードごとの接続数キャッシュ (Smart Labeling 用) */
    nodeDegree: Map<string, number>;
    /** ノードID → Container 参照 (Interactive Glow 用) */
    nodeContainerMap: Map<string, Container>;
    /** ホバー中の接続ノードID群 (Interactive Glow 用) */
    glowConnectedIds: Set<string>;
}

const state: AppState = {
    graph: null,
    projectName: 'Loading...',
    isLoading: true,
    error: null,
    nodePositions: new Map(),
    nodeRings: new Map(),
    hoveredNodeId: null,
    focusNodeId: null,
    workerReady: false,
    nodeOrder: [],
    runeMode: 'default',
    currentLOD: 'mid',
    layoutMode: 'force',
    hierarchyEdges: [],
    breadcrumbs: [],
    nodeDegree: new Map(),
    nodeContainerMap: new Map(),
    glowConnectedIds: new Set(),
};

// ─── 色ユーティリティ ────────────────────────────────────
function stringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 360);
}

function hslToHex(h: number, s: number, l: number): number {
    const hue = h / 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + hue * 12) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color);
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
}

function getNodeColor(node: GraphNode): number {
    const hue = stringToHue(node.relativePath);
    return hslToHex(hue, 0.7, 0.55);
}

function getNodeGlowColor(node: GraphNode): number {
    const hue = (stringToHue(node.relativePath) + 20) % 360;
    return hslToHex(hue, 0.7, 0.65);
}

/** リングに基づくアルファ値 */
function getRingAlpha(ring: 'focus' | 'context' | 'global'): number {
    switch (ring) {
        case 'focus': return 1.0;
        case 'context': return 0.75;
        case 'global': return 0.4;
    }
}

// ─── フォントヘルパー (ハイブリッド方式) ────────────────
// ASCII のみ → BitmapText (GPU最適化), マルチバイト含む → 標準 Text (Canvas)

const BITMAP_FONT_NAME = 'GrimoireASCII';
let bitmapFontReady = false;

/** ASCII文字のみかどうかを判定 */
function isAsciiOnly(str: string): boolean {
    // eslint-disable-next-line no-control-regex
    return /^[\x00-\x7F]*$/.test(str);
}

/** BitmapFont をランタイム生成 (init で呼ぶ) */
function installBitmapFont() {
    BitmapFont.install({
        name: BITMAP_FONT_NAME,
        style: {
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 32,  // ベースサイズ (BitmapText 側でスケール)
            fill: '#ffffff',
        },
        chars: [
            ['a', 'z'],
            ['A', 'Z'],
            ['0', '9'],
            [' ', '/'],   // ASCII 32-47: space !"#$%&'()*+,-./
            [':', '@'],   // ASCII 58-64: :;<=>?@
            ['[', '`'],   // ASCII 91-96: [\]^_`
            ['{', '~'],   // ASCII 123-126: {|}~
        ],
        resolution: 2,
        padding: 4,
    });
    bitmapFontReady = true;
}

/** 高速テキスト生成: ASCII → BitmapText, マルチバイト → Text */
function createSmartText(
    content: string,
    options: { fontSize: number; fill: number | string; fontFamily?: string; align?: string; lineHeight?: number }
): Text | BitmapText {
    if (bitmapFontReady && isAsciiOnly(content) && !options.lineHeight) {
        const bt = new BitmapText({
            text: content,
            style: {
                fontFamily: BITMAP_FONT_NAME,
                fontSize: options.fontSize,
                fill: options.fill,
                align: (options.align as 'left' | 'center' | 'right') || undefined,
            },
        });
        return bt;
    }
    // フォールバック: Canvas Text (マルチバイト対応)
    return new Text({
        text: content,
        style: new TextStyle({
            fontSize: options.fontSize,
            fill: options.fill,
            fontFamily: options.fontFamily || 'Consolas, "Courier New", monospace',
            align: (options.align as 'left' | 'center' | 'right') || undefined,
            lineHeight: options.lineHeight,
        }),
    });
}

// ─── メッセージ送受信 ────────────────────────────────────
function sendMessage(msg: WebviewToExtensionMessage) {
    vscode.postMessage(msg);
}

// ─── Worker 管理 ─────────────────────────────────────────
let worker: Worker | null = null;

function initWorker() {
    // Worker URL は HTML 内の data-worker-uri 属性から取得
    const workerUrl = (document.querySelector('script[data-worker-uri]') as HTMLScriptElement)
        ?.getAttribute('data-worker-uri');
    if (!workerUrl) {
        console.error('[Code Grimoire] Worker URI not found');
        return;
    }

    // VS Code Webview CSP 制限回避: fetch → Blob → Worker
    fetch(workerUrl)
        .then(res => res.blob())
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            worker = new Worker(blobUrl);

            worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
                const msg = event.data;
                switch (msg.type) {
                    case 'TICK':
                        applyPositions(msg.payload.positions);
                        renderGraph();
                        break;
                    case 'DONE':
                        applyPositions(msg.payload.positions);
                        applyRings(msg.payload.rings);
                        state.hierarchyEdges = msg.payload.hierarchyEdges || [];
                        renderGraph();
                        state.isLoading = false;
                        stopParticleLoading();
                        updateStatusText();
                        // Viewport を初回はフォーカスノード中心に移動
                        if (state.focusNodeId) {
                            const pos = state.nodePositions.get(state.focusNodeId);
                            if (pos) { viewport.moveCenter(pos.x, pos.y); }
                        }
                        break;
                }
            };

            state.workerReady = true;

            // Worker 準備前に GRAPH_DATA が来ていた場合、ここで処理
            if (pendingGraphInit && state.graph) {
                onGraphReceived();
            }
        })
        .catch(err => {
            console.error('[Code Grimoire] Worker init failed:', err);
        });
}

function sendToWorker(msg: MainToWorkerMessage) {
    worker?.postMessage(msg);
}

/** Worker から受け取った Float32Array を nodePositions に展開 */
function applyPositions(positions: Float32Array) {
    for (let i = 0; i < state.nodeOrder.length; i++) {
        const id = state.nodeOrder[i];
        state.nodePositions.set(id, {
            x: positions[i * 2],
            y: positions[i * 2 + 1],
        });
    }
}

/** Worker から受け取ったリング情報を nodeRings に展開 */
function applyRings(rings: Record<string, 'focus' | 'context' | 'global'>) {
    for (const [id, ring] of Object.entries(rings)) {
        state.nodeRings.set(id, ring);
    }
}

// ─── Extension メッセージ受信 ────────────────────────────
window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'INSTANT_STRUCTURE':
            state.projectName = msg.payload.projectName;
            state.isLoading = true;
            // I18n: 言語を設定
            if (msg.payload.language) {
                currentLang = msg.payload.language.startsWith('ja') ? 'ja' : 'en';
                applyLocalization();
            }
            updateStatusText();
            break;
        case 'GRAPH_DATA':
            state.graph = msg.payload;
            state.error = null;
            onGraphReceived();
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

/** Worker がまだ準備中の場合に GRAPH_DATA をキューする */
let pendingGraphInit = false;

/** グラフデータ受信時：Worker に送信してレイアウト計算開始 */
function onGraphReceived() {
    const graph = state.graph;
    if (!graph || graph.nodes.length === 0) {
        state.isLoading = false;
        updateStatusText();
        return;
    }

    // ノード順序を記録
    state.nodeOrder = graph.nodes.map(n => n.id);

    // Smart Labeling: ノード接続数を計算
    state.nodeDegree.clear();
    for (const node of graph.nodes) {
        state.nodeDegree.set(node.id, 0);
    }
    for (const edge of graph.edges) {
        state.nodeDegree.set(edge.source, (state.nodeDegree.get(edge.source) || 0) + 1);
        state.nodeDegree.set(edge.target, (state.nodeDegree.get(edge.target) || 0) + 1);
    }

    // Worker がまだ準備中なら待機フラグを立てる
    if (!state.workerReady) {
        pendingGraphInit = true;
        return;
    }
    pendingGraphInit = false;

    // Worker 用データに変換
    const workerNodes: WorkerNode[] = graph.nodes.map(n => ({
        id: n.id,
        ring: 'global' as const,  // 初期状態は全て global、Worker 側で割り当て
        lineCount: n.lineCount,
    }));

    const workerEdges: WorkerEdge[] = graph.edges
        .filter(e => e.kind !== 'type-import') // type-only import はレイアウトに影響させない
        .map(e => ({
            source: typeof e.source === 'string' ? e.source : (e.source as any).id,
            target: typeof e.target === 'string' ? e.target : (e.target as any).id,
        }));

    // フォーカス: まだ未選択なら最初のソースファイルを選択
    if (!state.focusNodeId) {
        const firstSource = graph.nodes.find(n => n.kind === 'source');
        state.focusNodeId = firstSource?.id || graph.nodes[0].id;
    }

    sendToWorker({
        type: 'INIT',
        payload: {
            nodes: workerNodes,
            edges: workerEdges,
            focusNodeId: state.focusNodeId,
            layoutMode: state.layoutMode,
        },
    });

    state.isLoading = true;
    updateStatusText();
}

// ─── Summoning (フォーカス切り替え) ──────────────────────
function summonNode(nodeId: string) {
    if (state.focusNodeId === nodeId) { return; }

    // 探索履歴に追加
    const node = state.graph?.nodes.find(n => n.id === nodeId);
    const label = node?.label || nodeId.split('/').pop() || nodeId;
    // 既に履歴にある場合はその地点まで巻き戻し
    const existingIdx = state.breadcrumbs.findIndex(b => b.nodeId === nodeId);
    if (existingIdx >= 0) {
        state.breadcrumbs = state.breadcrumbs.slice(0, existingIdx + 1);
    } else {
        state.breadcrumbs.push({ nodeId, label });
        // 履歴上限: 最新12件
        if (state.breadcrumbs.length > 12) {
            state.breadcrumbs = state.breadcrumbs.slice(-12);
        }
    }

    state.focusNodeId = nodeId;

    // Extension にフォーカス変更を通知
    sendMessage({ type: 'FOCUS_NODE', payload: { nodeId } });

    // Worker にフォーカス変更を送信
    sendToWorker({ type: 'FOCUS', payload: { focusNodeId: nodeId } });

    state.isLoading = true;
    startParticleLoading();
    updateStatusText();
    refreshBreadcrumbs();

    // Viewport をフォーカスノードへスムーズ移動
    const pos = state.nodePositions.get(nodeId);
    if (pos) {
        animateViewportTo(pos.x, pos.y);
    }
}

/** Viewport をスムーズにターゲット座標へ移動 (Smart Camera: Detail Panel オフセット対応) */
function animateViewportTo(targetX: number, targetY: number) {
    const duration = 600; // ms
    const startX = viewport.center.x;
    const startY = viewport.center.y;
    const startTime = performance.now();

    // Smart Camera Offset: Detail Panel が開いていれば左へ panelWidth/2 分ずらす
    const panelOffset = selectedNodeId ? -170 / viewport.scaled : 0;
    const finalX = targetX - panelOffset;

    const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // easeOutCubic
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

    // BitmapFont をランタイム生成 (ASCII英数字用)
    installBitmapFont();

    // ローディングオーバーレイを非表示にする
    hideLoadingOverlay();

    // Viewport (無限キャンバス)
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

    // レイヤー構成 (背景から前景へ)
    ringContainer = new Container();   // 同心円ガイド
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
        if (breadcrumbContainer) {
            breadcrumbContainer.position.set(TOOLBAR_PAD, TOOLBAR_Y + TOOLBAR_BTN_SIZE + 8);
        }
        if (minimapContainer) {
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
        // Minimap: ビューポート矩形を更新
        if (minimapGfx) { refreshMinimap(); }
    });

    // Minimap: パン時にも更新
    viewport.on('moved', () => {
        if (minimapGfx) { refreshMinimap(); }
    });

    // 背景クリックで Detail Panel を閉じる
    viewport.on('clicked', (e: any) => {
        // ノード上のクリックでない場合のみ閉じる
        if (!state.hoveredNodeId && selectedNodeId) {
            closeDetailPanel();
        }
    });

    // Worker 初期化
    initWorker();

    // Particle Loading 初期化 & 開始
    initParticleSystem();
    startParticleLoading();

    // Rune UI 初期化
    initRuneUI();

    // Layout Mode UI 初期化 (V3)
    initLayoutUI();

    // Breadcrumbs 初期化
    initBreadcrumbs();

    // Search Overlay 初期化 (V3 Phase 2)
    initSearchOverlay();

    // Minimap 初期化 (V3 Phase 2)
    initMinimap();

    // Detail Panel 初期化 (V3 Phase 3)
    initDetailPanel();

    // Help Overlay 初期化 (V6 Phase 4)
    initHelpOverlay();

    // Keyboard Shortcuts 初期化 (V6 UX+)
    initKeyboardShortcuts();

    // 解析リクエスト
    sendMessage({ type: 'REQUEST_ANALYSIS' });
}

// ─── Particle Loading 演出 ──────────────────────────────
// 解析中に中心へ向かって収束する光の粒子アニメーション

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;       // 0.0 〜 1.0
    maxLife: number;
    radius: number;
    color: number;
}

const PARTICLE_COUNT = 120;
const PARTICLE_COLORS = [0x00dcff, 0x4488ff, 0x66aaff, 0xaaddff, 0x2266cc];
let particles: Particle[] = [];
let particleContainer: Container;
let particleGfx: Graphics;
let particleAnimActive = false;
let particleTickerFn: ((dt: any) => void) | null = null;

function initParticleSystem() {
    particleContainer = new Container();
    particleContainer.alpha = 0;
    viewport.addChild(particleContainer);

    particleGfx = new Graphics();
    particleContainer.addChild(particleGfx);
}

/** パーティクルを1つ生成（中心に向かって飛ぶ） */
function spawnParticle(): Particle {
    const angle = Math.random() * Math.PI * 2;
    const dist = 300 + Math.random() * 500;
    const speed = 0.5 + Math.random() * 1.5;
    const life = 0.6 + Math.random() * 0.4;

    return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        radius: 1 + Math.random() * 2.5,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    };
}

/** パーティクルアニメーション開始 */
function startParticleLoading() {
    if (particleAnimActive) { return; }
    particleAnimActive = true;
    particleContainer.alpha = 1;

    // 初期粒子を生成
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(spawnParticle());
    }

    particleTickerFn = () => {
        particleGfx.clear();
        const dt = app.ticker.deltaTime * 0.016; // 正規化

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            // 中心への吸引力
            const dx = -p.x;
            const dy = -p.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 1;
            const attraction = 0.3;
            p.vx += (dx / dist) * attraction;
            p.vy += (dy / dist) * attraction;

            // 速度減衰
            p.vx *= 0.98;
            p.vy *= 0.98;

            p.x += p.vx;
            p.y += p.vy;
            p.life -= dt * 0.6;

            if (p.life <= 0 || dist < 8) {
                // リスポーン
                particles[i] = spawnParticle();
                continue;
            }

            const alpha = (p.life / p.maxLife) * 0.8;
            // グロー（大きめ半透明）
            particleGfx.circle(p.x, p.y, p.radius * 3);
            particleGfx.fill({ color: p.color, alpha: alpha * 0.15 });
            // コア（小さめ明るい）
            particleGfx.circle(p.x, p.y, p.radius);
            particleGfx.fill({ color: 0xffffff, alpha: alpha * 0.9 });
        }
    };
    app.ticker.add(particleTickerFn);
}

/** パーティクルアニメーション停止（フェードアウト + Shockwave） */
function stopParticleLoading() {
    if (!particleAnimActive) { return; }
    particleAnimActive = false;

    // ── Shockwave エフェクト (中心から外側へ広がるリング) ──
    triggerShockwave();

    // フェードアウト
    const fadeStart = performance.now();
    const fadeDuration = 800;
    const fadeOut = () => {
        const elapsed = performance.now() - fadeStart;
        const t = Math.min(elapsed / fadeDuration, 1);
        particleContainer.alpha = 1 - t;
        if (t < 1) {
            requestAnimationFrame(fadeOut);
        } else {
            // 完全停止
            if (particleTickerFn) {
                app.ticker.remove(particleTickerFn);
                particleTickerFn = null;
            }
            particleGfx.clear();
            particles = [];
        }
    };
    requestAnimationFrame(fadeOut);
}

// ─── Shockwave エフェクト (V5: Summoning Impact) ─────────
function triggerShockwave() {
    const cx = state.focusNodeId ? (state.nodePositions.get(state.focusNodeId)?.x || 0) : 0;
    const cy = state.focusNodeId ? (state.nodePositions.get(state.focusNodeId)?.y || 0) : 0;

    const shockGfx = new Graphics();
    viewport.addChild(shockGfx);

    const startTime = performance.now();
    const duration = 700;
    const maxRadius = 500;

    const animateShock = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic

        const radius = ease * maxRadius;
        const alpha = (1 - t) * 0.4;
        const width = 2 + (1 - t) * 3;

        shockGfx.clear();
        shockGfx.circle(cx, cy, radius);
        shockGfx.stroke({ width, color: 0x44aaff, alpha });

        // 内側にフラッシュリング
        if (t < 0.3) {
            const flashAlpha = (0.3 - t) / 0.3 * 0.15;
            shockGfx.circle(cx, cy, radius * 0.6);
            shockGfx.fill({ color: 0x88ddff, alpha: flashAlpha });
        }

        if (t < 1) {
            requestAnimationFrame(animateShock);
        } else {
            viewport.removeChild(shockGfx);
            shockGfx.destroy();
        }
    };
    requestAnimationFrame(animateShock);
}

// ─── Edge Particle Flow (V5: 依存方向の光粒子) ──────────
interface EdgeFlowParticle {
    srcId: string;
    tgtId: string;
    progress: number; // 0.0 → 1.0
    speed: number;
    color: number;
}

const EDGE_FLOW_MAX = 60;
let edgeFlowParticles: EdgeFlowParticle[] = [];
let edgeFlowGfx: Graphics | null = null;
let edgeFlowTickerFn: ((dt: any) => void) | null = null;

/** Edge Particle Flow を開始 (renderGraph 後に呼ぶ) */
function startEdgeFlow() {
    if (edgeFlowTickerFn) { return; } // 既に動作中

    edgeFlowGfx = new Graphics();
    edgeContainer.addChild(edgeFlowGfx);

    edgeFlowTickerFn = () => {
        if (!edgeFlowGfx || !state.graph || state.isLoading) { return; }
        edgeFlowGfx.clear();

        // Mid LOD のみ描画 (Far では省略)
        if (state.currentLOD === 'far') { return; }

        const dt = app.ticker.deltaTime * 0.016;

        // 不足分をスポーン
        while (edgeFlowParticles.length < EDGE_FLOW_MAX && state.graph.edges.length > 0) {
            const edge = state.graph.edges[Math.floor(Math.random() * state.graph.edges.length)];
            if (edge.kind === 'type-import') { continue; }
            const srcNode = state.graph.nodes.find(n => n.id === edge.source);
            edgeFlowParticles.push({
                srcId: edge.source,
                tgtId: edge.target,
                progress: Math.random() * 0.3,
                speed: 0.15 + Math.random() * 0.25,
                color: srcNode ? getNodeColor(srcNode) : 0x4488ff,
            });
        }

        // 更新 & 描画
        for (let i = edgeFlowParticles.length - 1; i >= 0; i--) {
            const p = edgeFlowParticles[i];
            p.progress += p.speed * dt;

            if (p.progress >= 1.0) {
                edgeFlowParticles.splice(i, 1);
                continue;
            }

            const srcPos = state.nodePositions.get(p.srcId);
            const tgtPos = state.nodePositions.get(p.tgtId);
            if (!srcPos || !tgtPos) { continue; }

            const x = srcPos.x + (tgtPos.x - srcPos.x) * p.progress;
            const y = srcPos.y + (tgtPos.y - srcPos.y) * p.progress;

            // フェードイン/アウト
            const alpha = p.progress < 0.15 ? p.progress / 0.15
                        : p.progress > 0.85 ? (1 - p.progress) / 0.15
                        : 1.0;

            // グロー
            edgeFlowGfx.circle(x, y, 3);
            edgeFlowGfx.fill({ color: p.color, alpha: alpha * 0.12 });
            // コア
            edgeFlowGfx.circle(x, y, 1.2);
            edgeFlowGfx.fill({ color: 0xffffff, alpha: alpha * 0.6 });
        }
    };
    app.ticker.add(edgeFlowTickerFn);
}

/** Edge Particle Flow を停止 */
function stopEdgeFlow() {
    if (edgeFlowTickerFn) {
        app.ticker.remove(edgeFlowTickerFn);
        edgeFlowTickerFn = null;
    }
    edgeFlowParticles = [];
    if (edgeFlowGfx) {
        edgeFlowGfx.clear();
        edgeFlowGfx = null;
    }
}

// ─── 同心円ガイド描画 ────────────────────────────────────
function drawRingGuides() {
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

// ─── Ghost Nodes (探索軌跡) ──────────────────────────────
function drawGhostTrail() {
    if (state.breadcrumbs.length < 2) { return; }

    const ghostGfx = new Graphics();

    // 過去のフォーカスノードを半透明の点で描画、点線で接続
    const trail = state.breadcrumbs;
    let prevPos: { x: number; y: number } | null = null;

    for (let i = 0; i < trail.length; i++) {
        const crumb = trail[i];
        const pos = state.nodePositions.get(crumb.nodeId);
        if (!pos) { prevPos = null; continue; }

        const isCurrent = i === trail.length - 1;
        const age = (trail.length - 1 - i) / trail.length; // 0=最新, 1=最古

        if (!isCurrent) {
            // Ghost ドット (半透明の残像)
            const ghostAlpha = 0.15 + (1 - age) * 0.2;
            ghostGfx.circle(pos.x, pos.y, 18 - age * 8);
            ghostGfx.fill({ color: 0x44aaff, alpha: ghostAlpha * 0.4 });
            ghostGfx.circle(pos.x, pos.y, 10 - age * 4);
            ghostGfx.stroke({ width: 1.5, color: 0x44aaff, alpha: ghostAlpha });

            // Ghost ラベル
            const ghostLabel = createSmartText(crumb.label, {
                fontSize: 8,
                fill: 0x446688,
            });
            ghostLabel.anchor.set(0.5, 0.5);
            ghostLabel.position.set(pos.x, pos.y - 20);
            ghostLabel.alpha = 0.3 + (1 - age) * 0.3;
            edgeContainer.addChild(ghostLabel);
        }

        // 点線で前のノードと接続
        if (prevPos) {
            const segments = 12;
            const dx = pos.x - prevPos.x;
            const dy = pos.y - prevPos.y;
            for (let s = 0; s < segments; s++) {
                // ダッシュ: 偶数セグメントのみ描画
                if (s % 2 === 0) {
                    const t1 = s / segments;
                    const t2 = (s + 1) / segments;
                    ghostGfx.moveTo(
                        prevPos.x + dx * t1,
                        prevPos.y + dy * t1,
                    );
                    ghostGfx.lineTo(
                        prevPos.x + dx * t2,
                        prevPos.y + dy * t2,
                    );
                    ghostGfx.stroke({
                        width: 1.5,
                        color: 0x3388bb,
                        alpha: 0.2 + (1 - age) * 0.15,
                    });
                }
            }
        }
        prevPos = pos;
    }

    // edgeContainer に追加 (ノードの下、エッジの上)
    edgeContainer.addChild(ghostGfx);
}

// ─── グラフ描画 ──────────────────────────────────────────
function renderGraph() {
    const graph = state.graph;
    if (!graph) { return; }

    // クリア
    nodeContainer.removeChildren();
    edgeContainer.removeChildren();

    // 同心円ガイド
    drawRingGuides();

    // エッジ描画 (Smart Edges: レイアウトモード適応)
    const edgeGfx = new Graphics();
    const cycleNodeIds = new Set<string>();
    if (state.graph?.circularDeps) {
        for (const cycle of state.graph.circularDeps) {
            for (const id of cycle.path) { cycleNodeIds.add(id); }
        }
    }

    const isHierarchyLayout = state.layoutMode === 'tree' || state.layoutMode === 'balloon';

    // ── 1) メインエッジ描画 ──────────────────────────────
    if (isHierarchyLayout && state.hierarchyEdges.length > 0) {
        // Tree / Balloon: 階層エッジをメインに描画
        for (const hEdge of state.hierarchyEdges) {
            const parentPos = state.nodePositions.get(hEdge.parent);
            const childPos = state.nodePositions.get(hEdge.child);
            if (!parentPos || !childPos) { continue; }

            edgeGfx.moveTo(parentPos.x, parentPos.y);

            if (state.layoutMode === 'tree') {
                // Yggdrasil: エルボー曲線 (親→子を縦方向に接続)
                const midY = (parentPos.y + childPos.y) / 2;
                edgeGfx.quadraticCurveTo(parentPos.x, midY, childPos.x, childPos.y);
            } else {
                // Bubble: 直線 (パック円の中心同士を結ぶ)
                edgeGfx.lineTo(childPos.x, childPos.y);
            }
            edgeGfx.stroke({ width: 2.5, color: 0x446688, alpha: 0.5 });
        }

        // 依存エッジを薄く重ねて描画 (構造美を損なわない程度)
        for (const edge of graph.edges) {
            const srcPos = state.nodePositions.get(edge.source);
            const tgtPos = state.nodePositions.get(edge.target);
            if (!srcPos || !tgtPos) { continue; }

            const isTypeOnly = edge.kind === 'type-import';

            const isCycleEdge = state.runeMode === 'architecture' &&
                cycleNodeIds.has(edge.source) && cycleNodeIds.has(edge.target);

            if (isCycleEdge) {
                // 循環参照は赤で目立たせる (Architecture Rune 時)
                edgeGfx.moveTo(srcPos.x, srcPos.y);
                edgeGfx.lineTo(tgtPos.x, tgtPos.y);
                edgeGfx.stroke({ width: 3, color: 0xff3333, alpha: 0.65 });
            } else if (isTypeOnly) {
                // type-import は点線 (dashed) で薄く
                drawDashedLine(edgeGfx, srcPos.x, srcPos.y, tgtPos.x, tgtPos.y, 6, 4);
                edgeGfx.stroke({ width: 1, color: 0x334466, alpha: 0.18 });
            } else {
                // 通常の依存エッジ
                edgeGfx.moveTo(srcPos.x, srcPos.y);
                edgeGfx.lineTo(tgtPos.x, tgtPos.y);
                edgeGfx.stroke({ width: 1, color: 0x334466, alpha: 0.15 });
            }
        }
    } else {
        // Mandala (Force): 従来の Dependency Edge を描画
        for (const edge of graph.edges) {
            const srcPos = state.nodePositions.get(edge.source);
            const tgtPos = state.nodePositions.get(edge.target);
            if (!srcPos || !tgtPos) { continue; }

            const srcNode = graph.nodes.find(n => n.id === edge.source);
            const isTypeOnly = edge.kind === 'type-import';

            // LOD Far: type-import エッジは完全スキップ
            if (state.currentLOD === 'far' && isTypeOnly) { continue; }

            // Architecture Rune: 循環参照エッジを赤くハイライト
            const isCycleEdge = state.runeMode === 'architecture' &&
                cycleNodeIds.has(edge.source) && cycleNodeIds.has(edge.target);

            let color: number;
            let alpha: number;
            let width: number;

            if (isCycleEdge) {
                color = 0xff3333;
                alpha = state.currentLOD === 'far' ? 0.5 : 0.8;
                width = state.currentLOD === 'far' ? 2 : 4;
            } else if (state.runeMode === 'architecture' && cycleNodeIds.size > 0) {
                color = srcNode ? getNodeColor(srcNode) : 0x334466;
                alpha = 0.08;
                width = 0.8;
            } else {
                color = srcNode ? getNodeColor(srcNode) : 0x334466;
                if (state.currentLOD === 'far') {
                    alpha = 0.15;
                    width = 0.8;
                } else {
                    alpha = isTypeOnly ? 0.15 : 0.4;
                    width = isTypeOnly ? 1 : 2;
                }
            }

            // Edge 描画: type-import は点線、それ以外はベジェ曲線
            if (isTypeOnly && state.currentLOD !== 'far') {
                drawDashedLine(edgeGfx, srcPos.x, srcPos.y, tgtPos.x, tgtPos.y, 6, 4);
                edgeGfx.stroke({ width, color, alpha });
            } else {
                edgeGfx.moveTo(srcPos.x, srcPos.y);
                // Edge Bundling: 二次ベジェ曲線で描画
                if (state.currentLOD === 'far') {
                    edgeGfx.lineTo(tgtPos.x, tgtPos.y);
                } else {
                    const midX = (srcPos.x + tgtPos.x) / 2;
                    const midY = (srcPos.y + tgtPos.y) / 2;
                    const bundleStrength = 0.25;
                    const cpX = midX * (1 - bundleStrength);
                    const cpY = midY * (1 - bundleStrength);
                    edgeGfx.quadraticCurveTo(cpX, cpY, tgtPos.x, tgtPos.y);
                }
                edgeGfx.stroke({ width, color, alpha });
            }
        }
    }
    edgeContainer.addChild(edgeGfx);

    // ノード描画
    state.nodeContainerMap.clear();
    for (const node of graph.nodes) {
        const pos = state.nodePositions.get(node.id);
        if (!pos) { continue; }

        const ring = state.nodeRings.get(node.id) || 'global';
        const nodeGfx = createNodeGraphics(node, pos, ring);

        // Search Dimming: マッチしないノードを暗くする
        if (dimmedNodes.size > 0 && dimmedNodes.has(node.id)) {
            nodeGfx.alpha = 0.12;
        }

        // Detail Panel 選択強調
        if (selectedNodeId && node.id !== selectedNodeId) {
            nodeGfx.alpha = Math.min(nodeGfx.alpha, 0.35);
        }

        // Interactive Glow: 接続中ノードを発光
        if (state.glowConnectedIds.has(node.id)) {
            nodeGfx.alpha = 1.0;
        }

        state.nodeContainerMap.set(node.id, nodeGfx);
        nodeContainer.addChild(nodeGfx);
    }

    // Ghost Nodes: 探索履歴の軌跡を描画
    drawGhostTrail();

    // Minimap 更新
    if (minimapGfx) { refreshMinimap(); }

    // Edge Particle Flow: レンダリング後に開始
    stopEdgeFlow();
    if (!state.isLoading) { startEdgeFlow(); }
}

function createNodeGraphics(
    node: GraphNode,
    pos: { x: number; y: number },
    ring: 'focus' | 'context' | 'global'
): Container {
    const container = new Container();
    container.position.set(pos.x, pos.y);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.alpha = getRingAlpha(ring);

    const baseColor = getNodeColor(node);
    const glowColor = getNodeGlowColor(node);
    const isFocus = ring === 'focus';
    const lod = state.currentLOD;

    // ノードサイズ: 行数に応じたスケーリング (Focus は大きく)
    let nodeRadius = Math.max(12, Math.min(60, 8 + Math.sqrt(node.lineCount) * 3));
    if (isFocus) { nodeRadius *= 1.4; }

    // ═══════════════════════════════════════════════════
    // LOD: Far — ドットのみ (ラベル・グロー省略で高速)
    // ═══════════════════════════════════════════════════
    if (lod === 'far') {
        const dot = new Graphics();
        dot.circle(0, 0, Math.max(4, nodeRadius * 0.35));
        dot.fill({ color: baseColor, alpha: 0.7 });
        container.addChild(dot);

        // Rune モード: 循環参照/セキュリティ/ホットスポットのドット色変更
        if (state.runeMode === 'architecture' && node.inCycle) {
            dot.tint = 0xff3333;
            container.alpha = 1.0;
        } else if (state.runeMode === 'security' && node.securityWarnings && node.securityWarnings.length > 0) {
            dot.tint = 0xff8800;
            container.alpha = 1.0;
        } else if (state.runeMode === 'refactoring' && node.gitCommitCount && node.gitCommitCount > 0) {
            const heat = Math.min(1.0, node.gitCommitCount / 30);
            dot.tint = heat > 0.5 ? 0xff4400 : 0xffaa00;
            container.alpha = 0.3 + heat * 0.7;
        } else if (state.runeMode !== 'default') {
            // 石化 (Dormant): 彩度を落としてグレーアウト、透明度は維持
            dot.tint = 0x556677;
            container.alpha = 0.35;
        }

        // Smart Labeling: Focus ノード & Hub ノード (接続数 >= 5) のみラベル表示
        const degree = state.nodeDegree.get(node.id) || 0;
        const isHub = degree >= 5;
        if (isFocus || isHub) {
            const miniLabel = createSmartText(node.label, { fontSize: 8, fill: glowColor });
            miniLabel.anchor.set(0.5, 0);
            miniLabel.position.set(0, Math.max(4, nodeRadius * 0.35) + 4);
            container.addChild(miniLabel);
        }

        attachNodeInteraction(container, node, ring);
        return container;
    }

    // ═══════════════════════════════════════════════════
    // LOD: Mid — フルノード描画
    // ═══════════════════════════════════════════════════

    // 外周グロー
    const outerGfx = new Graphics();
    outerGfx.circle(0, 0, nodeRadius + (isFocus ? 8 : 4));
    outerGfx.fill({ color: glowColor, alpha: isFocus ? 0.3 : 0.12 });
    container.addChild(outerGfx);

    // メインノード形状
    const gfx = new Graphics();
    const sides = getNodeSides(node);
    if (sides >= 20) {
        gfx.circle(0, 0, nodeRadius);
    } else {
        const points: number[] = [];
        for (let i = 0; i < sides; i++) {
            const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
            points.push(Math.cos(angle) * nodeRadius, Math.sin(angle) * nodeRadius);
        }
        gfx.poly(points);
    }
    gfx.fill({ color: baseColor, alpha: isFocus ? 0.4 : 0.2 });
    gfx.stroke({ width: isFocus ? 3 : 2, color: baseColor, alpha: 0.8 });
    container.addChild(gfx);

    // ラベル (BitmapText ハイブリッド)
    const labelFontSize = Math.max(10, Math.min(14, nodeRadius * 0.8));
    const label = createSmartText(node.label, { fontSize: labelFontSize, fill: glowColor, align: 'center' });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, nodeRadius + 16);
    container.addChild(label);

    // エクスポート数バッジ (Context 以上のみ)
    let nextBadgeY = nodeRadius + 30;
    if (ring !== 'global' && node.exports.length > 0) {
        const badge = createSmartText(`${node.exports.length} exports`, { fontSize: 9, fill: 0xaabbcc });
        badge.anchor.set(0.5, 0.5);
        badge.position.set(0, nextBadgeY);
        container.addChild(badge);
        nextBadgeY += 12;
    }

    // ─── Rune モード別オーバーレイ ───────────────────────

    // Architecture Rune: 循環参照ノードに赤リング + ラベル
    if (state.runeMode === 'architecture' && node.inCycle) {
        const cycleRing = new Graphics();
        cycleRing.circle(0, 0, nodeRadius + 10);
        cycleRing.stroke({ width: 2, color: 0xff3333, alpha: 0.9 });
        container.addChild(cycleRing);

        const cycleLabel = new Text({
            text: '⟳ cycle',
            style: new TextStyle({ fontSize: 9, fill: 0xff5555, fontFamily: 'Consolas, monospace' }),
        });
        cycleLabel.anchor.set(0.5, 0.5);
        cycleLabel.position.set(0, -(nodeRadius + 14));
        container.addChild(cycleLabel);
        container.alpha = 1.0; // 循環参照ノードは常に100%
    } else if (state.runeMode === 'architecture' && !node.inCycle) {
        // 石化 (Dormant): 彩度を落としてグレーアウト
        gfx.tint = 0x556677;
        if (outerGfx) { outerGfx.tint = 0x556677; }
        container.alpha = 0.35;
    }

    // Architecture Rune: ディレクトリグループ表示
    if (state.runeMode === 'architecture' && node.directoryGroup) {
        const dirLabel = new Text({
            text: `📁 ${node.directoryGroup}`,
            style: new TextStyle({ fontSize: 8, fill: 0x6688aa, fontFamily: 'Consolas, monospace' }),
        });
        dirLabel.anchor.set(0.5, 0.5);
        dirLabel.position.set(0, nodeRadius + (ring !== 'global' && node.exports.length > 0 ? 42 : 30));
        container.addChild(dirLabel);
    }

    // Security Rune: セキュリティ警告のあるノードをハイライト
    if (state.runeMode === 'security' && node.securityWarnings && node.securityWarnings.length > 0) {
        const warnRing = new Graphics();
        warnRing.circle(0, 0, nodeRadius + 10);
        warnRing.stroke({ width: 3, color: 0xff8800, alpha: 0.9 });
        container.addChild(warnRing);

        const warningCount = node.securityWarnings.length;
        const warnLabel = new Text({
            text: `⚠ ${warningCount} warning${warningCount > 1 ? 's' : ''}`,
            style: new TextStyle({ fontSize: 9, fill: 0xffaa33, fontFamily: 'Consolas, monospace' }),
        });
        warnLabel.anchor.set(0.5, 0.5);
        warnLabel.position.set(0, -(nodeRadius + 14));
        container.addChild(warnLabel);
        container.alpha = 1.0;
    } else if (state.runeMode === 'security') {
        // 石化 (Dormant)
        gfx.tint = 0x556677;
        if (outerGfx) { outerGfx.tint = 0x556677; }
        container.alpha = 0.35;
    }

    // Refactoring Rune: Git Hotspot (変更頻度の高いノードをオレンジ強調)
    if (state.runeMode === 'refactoring' && node.gitCommitCount && node.gitCommitCount > 0) {
        const heat = Math.min(1.0, node.gitCommitCount / 30); // 30 commits で最大
        const heatColor = heat > 0.5 ? 0xff4400 : 0xffaa00;
        const heatRing = new Graphics();
        heatRing.circle(0, 0, nodeRadius + 6);
        heatRing.fill({ color: heatColor, alpha: heat * 0.3 });
        container.addChild(heatRing);

        const hotLabel = new Text({
            text: `🔥 ${node.gitCommitCount} commits`,
            style: new TextStyle({ fontSize: 8, fill: heatColor, fontFamily: 'Consolas, monospace' }),
        });
        hotLabel.anchor.set(0.5, 0.5);
        hotLabel.position.set(0, -(nodeRadius + 14));
        container.addChild(hotLabel);
        container.alpha = 0.3 + heat * 0.7;
    } else if (state.runeMode === 'refactoring') {
        // 石化 (Dormant)
        gfx.tint = 0x556677;
        if (outerGfx) { outerGfx.tint = 0x556677; }
        container.alpha = 0.35;
    }

    // Optimization Rune: Tree-Shaking リスク + Barrel 検出
    if (state.runeMode === 'optimization') {
        const risk = node.treeShakingRisk || 0;
        if (risk > 0) {
            const riskNorm = risk / 100; // 0.0 ~ 1.0
            const riskColor = risk >= 50 ? 0xff4444 : risk >= 25 ? 0xffaa22 : 0x44ff88;
            const optRing = new Graphics();
            optRing.circle(0, 0, nodeRadius + 8);
            optRing.fill({ color: riskColor, alpha: riskNorm * 0.3 });
            optRing.stroke({ width: 2, color: riskColor, alpha: 0.7 });
            container.addChild(optRing);

            // リスクラベル
            const labels: string[] = [];
            if (node.isBarrel) { labels.push('📦 barrel'); }
            if (node.hasSideEffects) { labels.push('⚡ side-effect'); }
            labels.push(`risk: ${risk}`);

            const optLabel = new Text({
                text: labels.join(' | '),
                style: new TextStyle({ fontSize: 8, fill: riskColor, fontFamily: 'Consolas, monospace' }),
            });
            optLabel.anchor.set(0.5, 0.5);
            optLabel.position.set(0, -(nodeRadius + 14));
            container.addChild(optLabel);
            container.alpha = 0.3 + riskNorm * 0.7;
        } else {
            // 石化 (Dormant)
            gfx.tint = 0x556677;
            if (outerGfx) { outerGfx.tint = 0x556677; }
            container.alpha = 0.35;
        }
    }

    attachNodeInteraction(container, node, ring, gfx, outerGfx);
    return container;
}

/** ノードにインタラクションを付与する共通関数 */
function attachNodeInteraction(
    container: Container,
    node: GraphNode,
    ring: 'focus' | 'context' | 'global',
    gfx?: Graphics,
    outerGfx?: Graphics,
) {
    const baseScale = container.scale.x;

    // インタラクション: ホバー + Interactive Glow + Scale-up
    container.on('pointerover', () => {
        // 検索中はホバー演出を抑制
        if (dimmedNodes.size > 0) { return; }

        state.hoveredNodeId = node.id;
        if (gfx) { gfx.tint = 0xffffff; }
        if (outerGfx) { outerGfx.alpha = 0.6; }
        container.alpha = 1.0;

        // Hover Scale-up (V5)
        animateScale(container, baseScale, baseScale * 1.15, 120);

        // Interactive Glow: 接続ノードを発光させる
        if (state.graph) {
            const connectedIds = new Set<string>();
            for (const edge of state.graph.edges) {
                if (edge.source === node.id) { connectedIds.add(edge.target); }
                if (edge.target === node.id) { connectedIds.add(edge.source); }
            }
            state.glowConnectedIds = connectedIds;
            for (const cid of connectedIds) {
                const c = state.nodeContainerMap.get(cid);
                if (c) { c.alpha = Math.min(1.0, c.alpha + 0.4); }
            }
        }
    });

    container.on('pointerout', () => {
        // 検索中はホバー演出を抑制
        if (dimmedNodes.size > 0) { return; }

        if (state.hoveredNodeId === node.id) { state.hoveredNodeId = null; }
        if (gfx) { gfx.tint = 0xffffff; }
        if (outerGfx) { outerGfx.alpha = 1; }
        container.alpha = getRingAlpha(ring);

        // Hover Scale-down (V5)
        animateScale(container, container.scale.x, baseScale, 120);

        // Interactive Glow: 接続ノードの発光を解除
        for (const cid of state.glowConnectedIds) {
            const c = state.nodeContainerMap.get(cid);
            if (c) {
                const cRing = state.nodeRings.get(cid) || 'global';
                c.alpha = getRingAlpha(cRing);
            }
        }
        state.glowConnectedIds.clear();
    });

    // インタラクション: クリック = Summoning + Detail Panel + Ripple
    container.on('pointertap', (e: FederatedPointerEvent) => {
        // Click Ripple (V5)
        const pos = state.nodePositions.get(node.id);
        if (pos) { triggerClickRipple(pos.x, pos.y, getNodeColor(node)); }
        summonNode(node.id);
        openDetailPanel(node.id);
    });

    // 右クリックメニュー抑止
    container.on('rightclick', (e: FederatedPointerEvent) => {
        e.preventDefault?.();
    });
}

/** スケールアニメーション (V5 Hover Feedback) */
function animateScale(target: Container, from: number, to: number, duration: number) {
    const startTime = performance.now();
    const tick = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 2); // easeOutQuad
        const val = from + (to - from) * ease;
        target.scale.set(val, val);
        if (t < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}

/** クリック波紋エフェクト (V5) */
function triggerClickRipple(worldX: number, worldY: number, color: number) {
    const rippleGfx = new Graphics();
    viewport.addChild(rippleGfx);

    const startTime = performance.now();
    const duration = 400;
    const maxRadius = 60;

    const animateRipple = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        rippleGfx.clear();
        const radius = ease * maxRadius;
        const alpha = (1 - t) * 0.5;

        rippleGfx.circle(worldX, worldY, radius);
        rippleGfx.stroke({ width: 1.5, color, alpha });

        if (t < 0.5) {
            rippleGfx.circle(worldX, worldY, radius * 0.5);
            rippleGfx.fill({ color, alpha: (0.5 - t) * 0.1 });
        }

        if (t < 1) {
            requestAnimationFrame(animateRipple);
        } else {
            viewport.removeChild(rippleGfx);
            rippleGfx.destroy();
        }
    };
    requestAnimationFrame(animateRipple);
}

/** エラー時の赤フラッシュ (V5) */
function triggerErrorFlash() {
    const flashGfx = new Graphics();
    flashGfx.rect(0, 0, window.innerWidth, window.innerHeight);
    flashGfx.fill({ color: 0xff2222, alpha: 0.15 });
    app.stage.addChild(flashGfx);

    const startTime = performance.now();
    const duration = 500;
    const flash = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        flashGfx.alpha = (1 - t);
        if (t < 1) {
            requestAnimationFrame(flash);
        } else {
            app.stage.removeChild(flashGfx);
            flashGfx.destroy();
        }
    };
    requestAnimationFrame(flash);
}

/** 点線 (dashed line) を描画するヘルパー */
function drawDashedLine(gfx: Graphics, x0: number, y0: number, x1: number, y1: number, dashLen: number, gapLen: number) {
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
function getNodeSides(node: GraphNode): number {
    if (node.kind === 'package' || node.kind === 'config') { return 4; }
    if (node.kind === 'declaration') { return 6; }
    if (node.kind === 'external') { return 3; }

    const exportCount = node.exports.length;
    if (exportCount <= 2) { return 20; }
    if (exportCount <= 5) { return 8; }
    return 6;
}

// ─── Rune UI (モード切り替え — 横型ヘッダーバー) ────────

interface RuneButton {
    mode: RuneMode;
    translationKey: TranslationKey;
    icon: string;
    color: number;
}

const RUNE_BUTTONS: RuneButton[] = [
    { mode: 'default',       translationKey: 'rune.default',       icon: '◇', color: 0x6696ff },
    { mode: 'architecture',  translationKey: 'rune.architecture',  icon: '⬡', color: 0x44bbff },
    { mode: 'security',      translationKey: 'rune.security',      icon: '⚠', color: 0xff8800 },
    { mode: 'optimization',  translationKey: 'rune.optimization',  icon: '⚡', color: 0x44ff88 },
    { mode: 'refactoring',   translationKey: 'rune.refactoring',   icon: '🔥', color: 0xff4400 },
];

const TOOLBAR_BTN_SIZE = 34;
const TOOLBAR_GAP = 4;
const TOOLBAR_PAD = 8;
const TOOLBAR_Y = 10;

let toolbarContainer: Container;
let tooltipContainer: Container;
let tooltipBg: Graphics;
let tooltipText: Text;

function initRuneUI() {
    // ── ヘッダーバーコンテナ (Rune + separator + Layout を1列に配置) ──
    toolbarContainer = new Container();
    toolbarContainer.position.set(TOOLBAR_PAD, TOOLBAR_Y);
    uiContainer.addChild(toolbarContainer);

    // ── ツールチップ (共有) ──
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
    uiContainer.addChild(tooltipContainer);

    refreshRuneUI();
}

/** Rune + Layout ヘッダーバーを再描画 */
function refreshRuneUI() {
    toolbarContainer.removeChildren();

    let xOffset = 0;

    // ── Rune ボタン ──
    for (const btn of RUNE_BUTTONS) {
        const bc = createToolbarButton(btn.icon, btn.color, state.runeMode === btn.mode, t(btn.translationKey), xOffset);
        bc.on('pointertap', () => {
            state.runeMode = btn.mode;
            sendMessage({ type: 'RUNE_MODE_CHANGE', payload: { mode: btn.mode } });
            refreshRuneUI();
            renderGraph();
        });
        toolbarContainer.addChild(bc);
        xOffset += TOOLBAR_BTN_SIZE + TOOLBAR_GAP;
    }

    // ── セパレータ ──
    const sep = new Graphics();
    sep.moveTo(xOffset + 2, 4);
    sep.lineTo(xOffset + 2, TOOLBAR_BTN_SIZE - 4);
    sep.stroke({ width: 1, color: 0x334466, alpha: 0.5 });
    toolbarContainer.addChild(sep);
    xOffset += 10;

    // ── Layout ボタン ──
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

/** ヘッダーバー用アイコンボタンを生成 */
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

    // アクティブインジケータ (下部のドット)
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

    // ツールチップ表示/非表示
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

// ─── Breadcrumbs (探索履歴パネル) ────────────────────────
let breadcrumbContainer: Container;

// ─── Layout Mode UI (V3 — ヘッダーバー統合) ────────────
interface LayoutButton {
    mode: LayoutMode;
    translationKey: TranslationKey;
    icon: string;
    color: number;
}

const LAYOUT_BUTTONS: LayoutButton[] = [
    { mode: 'force',   translationKey: 'layout.mandala',   icon: '◎', color: 0x8866ff },
    { mode: 'tree',    translationKey: 'layout.yggdrasil', icon: '🌳', color: 0x44cc88 },
    { mode: 'balloon', translationKey: 'layout.bubble',    icon: '◉', color: 0x6699ff },
];

function initLayoutUI() {
    // Layout ボタンは refreshRuneUI() 内でヘッダーバーに統合描画される
    // 個別の Container は不要
}

/** レイアウトモード切り替え */
function switchLayoutMode(newMode: LayoutMode) {
    if (state.layoutMode === newMode) { return; }
    state.layoutMode = newMode;

    // Worker にレイアウト変更メッセージ送信
    sendToWorker({ type: 'LAYOUT_CHANGE', payload: { mode: newMode } });

    state.isLoading = true;
    startParticleLoading();
    updateStatusText();
}

/** Layout ボタンの表示を更新 (ヘッダーバー内で refreshRuneUI に統合) */
function refreshLayoutUI() {
    refreshRuneUI();
}

function initBreadcrumbs() {
    breadcrumbContainer = new Container();
    // ヘッダーバーの下に配置
    breadcrumbContainer.position.set(TOOLBAR_PAD, TOOLBAR_Y + TOOLBAR_BTN_SIZE + 8);
    uiContainer.addChild(breadcrumbContainer);
}

function refreshBreadcrumbs() {
    breadcrumbContainer.removeChildren();
    if (state.breadcrumbs.length <= 1) { return; }

    // 右端座標を基準に右から左へ配置
    let xOffset = 0;
    const crumbHeight = 22;
    const maxLabelLen = 14;

    for (let i = 0; i < state.breadcrumbs.length; i++) {
        const crumb = state.breadcrumbs[i];
        const isCurrent = i === state.breadcrumbs.length - 1;
        const displayLabel = crumb.label.length > maxLabelLen
            ? crumb.label.substring(0, maxLabelLen - 1) + '…'
            : crumb.label;

        // 区切り矢印 (最初以外)
        if (i > 0) {
            const arrow = createSmartText('›', { fontSize: 12, fill: 0x445588 });
            arrow.anchor.set(0, 0.5);
            arrow.position.set(xOffset, crumbHeight / 2);
            breadcrumbContainer.addChild(arrow);
            xOffset += 14;
        }

        // ラベルボタン
        const btnC = new Container();
        btnC.position.set(xOffset, 0);
        btnC.eventMode = 'static';
        btnC.cursor = 'pointer';

        const labelColor = isCurrent ? 0x66ddff : 0x5588aa;
        const bg = new Graphics();
        const labelWidth = displayLabel.length * 7 + 12;
        bg.roundRect(0, 0, labelWidth, crumbHeight, 4);
        bg.fill({ color: isCurrent ? 0x1a2855 : 0x101530, alpha: 0.7 });
        bg.stroke({ width: 1, color: labelColor, alpha: isCurrent ? 0.6 : 0.2 });
        btnC.addChild(bg);

        const text = createSmartText(displayLabel, { fontSize: 10, fill: labelColor });
        text.anchor.set(0, 0.5);
        text.position.set(6, crumbHeight / 2);
        btnC.addChild(text);

        // クリック: その地点に Summon
        const crumbNodeId = crumb.nodeId;
        btnC.on('pointertap', () => {
            summonNode(crumbNodeId);
        });

        // ホバー
        btnC.on('pointerover', () => { bg.alpha = 1.0; });
        btnC.on('pointerout', () => { bg.alpha = 0.7; });

        breadcrumbContainer.addChild(btnC);
        xOffset += labelWidth + 4;
    }

    // 位置更新 (ヘッダーバーの下)
    breadcrumbContainer.position.set(TOOLBAR_PAD, TOOLBAR_Y + TOOLBAR_BTN_SIZE + 8);
}

// ─── Search Overlay (V3 Phase 2) ────────────────────────
let searchOverlay: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let searchCountEl: HTMLElement | null = null;
let searchResults: string[] = [];
let searchCurrentIdx = -1;
/** ディミング中のノードID集合 (マッチしないもの) */
let dimmedNodes: Set<string> = new Set();

function initSearchOverlay() {
    searchOverlay = document.getElementById('search-overlay');
    searchInput = document.getElementById('search-input') as HTMLInputElement;
    searchCountEl = document.getElementById('search-count');

    if (!searchInput || !searchOverlay) { return; }

    // Ctrl+F でトグル
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleSearch();
        }
        if (e.key === 'Escape' && searchOverlay?.classList.contains('visible')) {
            closeSearch();
        }
    });

    // インクリメンタルサーチ
    searchInput.addEventListener('input', () => {
        performSearch(searchInput!.value);
    });

    // Enter で次の結果へ FlyTo
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (searchResults.length > 0) {
                searchCurrentIdx = (searchCurrentIdx + 1) % searchResults.length;
                flyToSearchResult(searchResults[searchCurrentIdx]);
                updateSearchCount();
            }
        }
    });
}

function toggleSearch() {
    if (!searchOverlay) { return; }
    if (searchOverlay.classList.contains('visible')) {
        closeSearch();
    } else {
        searchOverlay.classList.add('visible');
        searchInput?.focus();
    }
}

function closeSearch() {
    if (!searchOverlay) { return; }
    searchOverlay.classList.remove('visible');
    if (searchInput) { searchInput.value = ''; }
    searchResults = [];
    searchCurrentIdx = -1;
    dimmedNodes.clear();
    if (searchCountEl) { searchCountEl.textContent = ''; }
    renderGraph(); // ディミング解除
}

function performSearch(query: string) {
    const graph = state.graph;
    if (!graph || !query.trim()) {
        searchResults = [];
        searchCurrentIdx = -1;
        dimmedNodes.clear();
        if (searchCountEl) { searchCountEl.textContent = ''; }
        renderGraph();
        return;
    }

    const q = query.toLowerCase();
    searchResults = [];
    dimmedNodes = new Set(graph.nodes.map(n => n.id));

    for (const node of graph.nodes) {
        const matchLabel = node.label.toLowerCase().includes(q);
        const matchPath = node.relativePath.toLowerCase().includes(q);
        if (matchLabel || matchPath) {
            searchResults.push(node.id);
            dimmedNodes.delete(node.id);
        }
    }

    searchCurrentIdx = searchResults.length > 0 ? 0 : -1;
    updateSearchCount();
    renderGraph(); // ディミング適用
}

function updateSearchCount() {
    if (!searchCountEl) { return; }
    if (searchResults.length === 0) {
        searchCountEl.textContent = searchInput?.value ? `0 ${t('search.matches')}` : '';
    } else {
        searchCountEl.textContent = `${searchCurrentIdx + 1}/${searchResults.length}`;
    }
}

function flyToSearchResult(nodeId: string) {
    const pos = state.nodePositions.get(nodeId);
    if (pos) {
        animateViewportTo(pos.x, pos.y);
    }
}

// ─── Minimap (V3 Phase 2) ───────────────────────────────
let minimapContainer: Container;
let minimapGfx: Graphics;
const MINIMAP_SCALE = 0.1;
const MINIMAP_SIZE = 160;

function initMinimap() {
    minimapContainer = new Container();
    minimapGfx = new Graphics();
    minimapContainer.addChild(minimapGfx);
    uiContainer.addChild(minimapContainer);

    // 位置: 右下
    updateMinimapPosition();

    // クリックでナビゲーション
    minimapContainer.eventMode = 'static';
    minimapContainer.cursor = 'pointer';
    minimapContainer.on('pointertap', (e: FederatedPointerEvent) => {
        const local = minimapContainer.toLocal(e.global);
        // ミニマップ座標 → ワールド座標
        const worldX = (local.x - MINIMAP_SIZE / 2) / MINIMAP_SCALE;
        const worldY = (local.y - MINIMAP_SIZE / 2) / MINIMAP_SCALE;
        animateViewportTo(worldX, worldY);
    });
}

function updateMinimapPosition() {
    minimapContainer.position.set(
        window.innerWidth - MINIMAP_SIZE - 16,
        window.innerHeight - MINIMAP_SIZE - 16,
    );
}

function refreshMinimap() {
    minimapGfx.clear();

    // 背景
    minimapGfx.roundRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 6);
    minimapGfx.fill({ color: 0x0a0c1e, alpha: 0.8 });
    minimapGfx.stroke({ width: 1, color: 0x334466, alpha: 0.4 });

    if (!state.graph) { return; }

    // ノードをドットで描画
    for (const node of state.graph.nodes) {
        const pos = state.nodePositions.get(node.id);
        if (!pos) { continue; }

        const mx = pos.x * MINIMAP_SCALE + MINIMAP_SIZE / 2;
        const my = pos.y * MINIMAP_SCALE + MINIMAP_SIZE / 2;

        // 範囲外は描画しない
        if (mx < 0 || mx > MINIMAP_SIZE || my < 0 || my > MINIMAP_SIZE) { continue; }

        const isFocus = node.id === state.focusNodeId;
        const color = isFocus ? 0x66ddff : getNodeColor(node);
        const radius = isFocus ? 3 : 1.5;

        minimapGfx.circle(mx, my, radius);
        minimapGfx.fill({ color, alpha: isFocus ? 1.0 : 0.6 });
    }

    // ビューポート範囲を矩形で表示
    const vp = viewport;
    const vpLeft = (vp.left * MINIMAP_SCALE) + MINIMAP_SIZE / 2;
    const vpTop = (vp.top * MINIMAP_SCALE) + MINIMAP_SIZE / 2;
    const vpWidth = (vp.screenWidth / vp.scaled) * MINIMAP_SCALE;
    const vpHeight = (vp.screenHeight / vp.scaled) * MINIMAP_SCALE;

    minimapGfx.rect(vpLeft, vpTop, vpWidth, vpHeight);
    minimapGfx.stroke({ width: 1, color: 0x6699ff, alpha: 0.5 });
}

// ─── Detail Panel (V3 Phase 3) ──────────────────────────
let detailPanel: HTMLElement | null = null;
let detailTitle: HTMLElement | null = null;
let detailContent: HTMLElement | null = null;
let selectedNodeId: string | null = null;

function initDetailPanel() {
    detailPanel = document.getElementById('detail-panel');
    detailTitle = document.getElementById('dp-title');
    detailContent = document.getElementById('dp-content');
    const closeBtn = document.getElementById('dp-close');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeDetailPanel);
    }
}

function openDetailPanel(nodeId: string) {
    const graph = state.graph;
    if (!graph || !detailPanel || !detailTitle || !detailContent) { return; }

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) { return; }

    selectedNodeId = nodeId;

    // タイトル
    detailTitle.textContent = node.label;

    // アクションボタン: ヘッダー内の閉じるボタン前に挿入
    let existingActions = detailPanel.querySelector('.dp-actions');
    if (existingActions) { existingActions.remove(); }
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'dp-actions';
    actionsDiv.innerHTML = `
        <button class="dp-action-btn" id="dp-btn-open" title="Open File">📄</button>
        <button class="dp-action-btn" id="dp-btn-summon" title="Summon">✦</button>
    `;
    const headerEl = detailPanel.querySelector('.dp-header');
    const closeEl = detailPanel.querySelector('.dp-close');
    if (headerEl && closeEl) {
        headerEl.insertBefore(actionsDiv, closeEl);
    }

    // アクションボタンイベント
    const btnOpen = detailPanel.querySelector('#dp-btn-open');
    const btnSummon = detailPanel.querySelector('#dp-btn-summon');
    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            sendMessage({ type: 'JUMP_TO_FILE', payload: { filePath: node.filePath, line: 1 } });
        });
    }
    if (btnSummon) {
        btnSummon.addEventListener('click', () => {
            summonNode(nodeId);
        });
    }

    // コンテンツ構築
    let html = '';

    // パス
    html += `<div class="dp-section">
        <div class="dp-label">${t('dp.path')}</div>
        <div class="dp-value path">${escapeHtml(node.relativePath)}</div>
    </div>`;

    // 基本情報
    html += `<div class="dp-section">
        <div class="dp-label">${t('dp.info')}</div>
        <div class="dp-value">
            <span class="dp-badge">${node.kind}</span>
            <span class="dp-badge">${node.lineCount} lines</span>
            <span class="dp-badge">${node.exports.length} exports</span>
        </div>
    </div>`;

    // Git 情報
    if (node.gitCommitCount !== undefined) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.git')}</div>
            <div class="dp-value">
                <span class="dp-badge">${node.gitCommitCount} commits</span>
                ${node.gitLastModified ? `<span class="dp-badge">${node.gitLastModified.substring(0, 10)}</span>` : ''}
            </div>
        </div>`;
    }

    // Exports
    if (node.exports.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.exports')}</div>
            <div class="dp-value">${node.exports.map(e =>
                `<span class="dp-badge">${e.isDefault ? '★ ' : ''}${escapeHtml(e.name)} <small>(${e.kind})</small></span>`
            ).join('')}</div>
        </div>`;
    }

    // 依存先 (Imports)
    const outEdges = graph.edges.filter(e => e.source === nodeId);
    if (outEdges.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.imports')} (${outEdges.length})</div>
            <ul class="dp-dep-list">${outEdges.map(e => {
                const targetNode = graph.nodes.find(n => n.id === e.target);
                const label = targetNode?.label || e.target.split('/').pop() || e.target;
                return `<li data-node-id="${escapeHtml(e.target)}">${escapeHtml(label)} <small style="color:rgba(100,140,200,0.5)">(${e.kind})</small></li>`;
            }).join('')}</ul>
        </div>`;
    }

    // 被依存 (Imported by)
    const inEdges = graph.edges.filter(e => e.target === nodeId);
    if (inEdges.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.importedBy')} (${inEdges.length})</div>
            <ul class="dp-dep-list">${inEdges.map(e => {
                const srcNode = graph.nodes.find(n => n.id === e.source);
                const label = srcNode?.label || e.source.split('/').pop() || e.source;
                return `<li data-node-id="${escapeHtml(e.source)}">${escapeHtml(label)}</li>`;
            }).join('')}</ul>
        </div>`;
    }

    // セキュリティ警告
    if (node.securityWarnings && node.securityWarnings.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.securityWarnings')}</div>
            ${node.securityWarnings.map(w =>
                `<div class="dp-warning">L${w.line}: ${escapeHtml(w.message)}</div>`
            ).join('')}
        </div>`;
    }

    // Optimization
    if (node.isBarrel || (node.treeShakingRisk !== undefined && node.treeShakingRisk > 0)) {
        const risk = node.treeShakingRisk || 0;
        const riskClass = risk >= 50 ? 'dp-risk-high' : risk >= 25 ? 'dp-risk-mid' : 'dp-risk-low';
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.optimization')}</div>
            <div class="dp-value">
                ${node.isBarrel ? '<span class="dp-badge" style="color:#ff8800">Barrel file</span>' : ''}
                ${node.treeShakingRisk !== undefined ? `<span class="dp-badge">Tree-shaking risk: ${node.treeShakingRisk}</span>` : ''}
                ${node.hasSideEffects ? '<span class="dp-badge" style="color:#ff4400">Side effects</span>' : ''}
            </div>
            <div class="dp-risk-meter ${riskClass}"><div class="dp-risk-meter-fill" style="width:${Math.min(100, risk)}%"></div></div>
            <div class="dp-risk-label">${risk < 25 ? 'Low risk' : risk < 50 ? 'Medium risk' : 'High risk'}</div>
        </div>`;
    }

    // Activity Bar (Git commit count visualization)
    if (node.gitCommitCount !== undefined && node.gitCommitCount > 0) {
        const maxCommits = 30;
        const barCount = 8;
        const commitNorm = Math.min(1, node.gitCommitCount / maxCommits);
        // 疑似的にバーを生成 (実際のコミット履歴データがないため、ノイズで表現)
        let bars = '';
        for (let b = 0; b < barCount; b++) {
            const h = Math.max(2, Math.round(commitNorm * 22 * (0.3 + Math.random() * 0.7)));
            const heatHue = commitNorm > 0.5 ? '0' : '30'; // red or orange
            bars += `<div class="bar" style="height:${h}px;background:hsla(${heatHue},80%,${50 + b * 3}%,0.7)"></div>`;
        }
        html += `<div class="dp-section">
            <div class="dp-label">Activity</div>
            <div class="dp-activity-bar">${bars}</div>
            <div class="dp-risk-label">${node.gitCommitCount} commits — ${commitNorm > 0.6 ? 'Hot spot 🔥' : commitNorm > 0.3 ? 'Active' : 'Stable'}</div>
        </div>`;
    }

    detailContent.innerHTML = html;
    detailPanel.classList.add('visible');

    // Smart Camera: パネル展開時にフォーカスノードをパネル分左にオフセット
    const focusPos = state.nodePositions.get(nodeId);
    if (focusPos) {
        animateViewportTo(focusPos.x, focusPos.y);
    }

    // 依存リスト内のクリックでSummon
    const depLinks = detailContent.querySelectorAll('[data-node-id]');
    depLinks.forEach(el => {
        el.addEventListener('click', () => {
            const targetId = (el as HTMLElement).dataset.nodeId;
            if (targetId) {
                summonNode(targetId);
                openDetailPanel(targetId);
            }
        });
    });

    // Code Peek: ファイルの先頭50行をリクエスト
    sendMessage({
        type: 'CODE_PEEK_REQUEST',
        payload: { filePath: node.filePath, maxLines: 50 },
    });

    renderGraph(); // 選択強調
}

/** Code Peek 応答受信コールバック */
function onCodePeekResponse(payload: { filePath: string; code: string; totalLines: number; language: string }) {
    if (!detailContent || !selectedNodeId) { return; }

    // 現在のパネルのファイルと一致するか確認
    const currentNode = state.graph?.nodes.find(n => n.id === selectedNodeId);
    if (!currentNode || currentNode.filePath !== payload.filePath) { return; }

    // 既存のローディング表示を削除
    const existing = detailContent.querySelector('.dp-code-section');
    if (existing) { existing.remove(); }

    // Code Peek セクションを追加
    const section = document.createElement('div');
    section.className = 'dp-section dp-code-section';

    const label = document.createElement('div');
    label.className = 'dp-label';
    label.textContent = `${t('dp.codePreview')} (${Math.min(50, payload.totalLines)}/${payload.totalLines} lines)`;
    section.appendChild(label);

    const codeContainer = document.createElement('div');
    codeContainer.className = 'dp-code-peek';

    // 行番号
    const lines = payload.code.split('\n');
    const lineNums = document.createElement('div');
    lineNums.className = 'cp-line-nums';
    lineNums.textContent = lines.map((_, i) => String(i + 1)).join('\n');
    codeContainer.appendChild(lineNums);

    // コード本体 (簡易ハイライト)
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.innerHTML = simpleHighlight(payload.code, payload.language);
    pre.appendChild(code);
    codeContainer.appendChild(pre);

    section.appendChild(codeContainer);
    detailContent.appendChild(section);
}

/** 簡易的な構文ハイライト (正規表現ベース) */
function simpleHighlight(code: string, language: string): string {
    let escaped = escapeHtml(code);

    // コメント (// と /* */)
    escaped = escaped.replace(/(\/\/[^\n]*)/g, '<span class="hl-comment">$1</span>');
    escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');

    // 文字列 ('...' と "..." と `...`)
    escaped = escaped.replace(/(&quot;[^&]*?&quot;)/g, '<span class="hl-string">$1</span>');
    escaped = escaped.replace(/(&#x27;[^&]*?&#x27;)/g, '<span class="hl-string">$1</span>');

    // 数値
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');

    if (language === 'typescript' || language === 'javascript') {
        // キーワード
        const keywords = [
            'import', 'export', 'from', 'const', 'let', 'var', 'function',
            'class', 'interface', 'type', 'enum', 'return', 'if', 'else',
            'for', 'while', 'switch', 'case', 'break', 'default', 'new',
            'this', 'async', 'await', 'try', 'catch', 'throw', 'extends',
            'implements', 'readonly', 'public', 'private', 'protected',
            'static', 'abstract', 'as', 'of', 'in', 'typeof', 'keyof',
        ];
        const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
        escaped = escaped.replace(kwRegex, '<span class="hl-keyword">$1</span>');

        // 型名 (大文字始まり)
        escaped = escaped.replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="hl-type">$1</span>');
    }

    return escaped;
}

function closeDetailPanel() {
    if (detailPanel) {
        detailPanel.classList.remove('visible');
    }
    selectedNodeId = null;
    renderGraph(); // 選択解除
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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

    // Error Flash (V5: 画面赤明滅)
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

// ─── Help / Legend Overlay (V6 Phase 4) ─────────────────
let helpOverlay: HTMLElement | null = null;
let helpCard: HTMLElement | null = null;
let helpVisible = false;

function initHelpOverlay() {
    helpOverlay = document.getElementById('help-overlay');
    helpCard = document.getElementById('help-card');
    const closeBtn = document.getElementById('help-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => toggleHelp(false));
    }
    if (helpOverlay) {
        helpOverlay.addEventListener('click', (e) => {
            if (e.target === helpOverlay) { toggleHelp(false); }
        });
    }

    // PixiJS の ? ボタン (ミニマップの左隣)
    initHelpButton();
}

function initHelpButton() {
    const helpBtn = new Container();
    helpBtn.eventMode = 'static';
    helpBtn.cursor = 'pointer';

    const bg = new Graphics();
    bg.roundRect(0, 0, 30, 30, 8);
    bg.fill({ color: 0x151830, alpha: 0.7 });
    bg.stroke({ width: 1, color: 0x446688, alpha: 0.4 });
    helpBtn.addChild(bg);

    const qMark = new Text({
        text: '?',
        style: new TextStyle({ fontSize: 16, fill: 0x88aacc, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' }),
    });
    qMark.anchor.set(0.5, 0.5);
    qMark.position.set(15, 15);
    helpBtn.addChild(qMark);

    // ミニマップの左横に配置
    helpBtn.position.set(window.innerWidth - MINIMAP_SIZE - 56, window.innerHeight - MINIMAP_SIZE - 16);
    uiContainer.addChild(helpBtn);

    helpBtn.on('pointertap', () => toggleHelp());

    // Resize 時に位置更新
    window.addEventListener('resize', () => {
        helpBtn.position.set(window.innerWidth - MINIMAP_SIZE - 56, window.innerHeight - MINIMAP_SIZE - 16);
    });
}

function toggleHelp(forceState?: boolean) {
    helpVisible = forceState !== undefined ? forceState : !helpVisible;
    if (!helpOverlay || !helpCard) { return; }

    if (helpVisible) {
        helpCard.innerHTML = buildHelpContent();
        helpOverlay.classList.add('visible');
    } else {
        helpOverlay.classList.remove('visible');
    }
}

function buildHelpContent(): string {
    const isJa = currentLang === 'ja';
    return `
        <h2>${t('help.title')}</h2>

        <h3>${t('help.mouse')}</h3>
        <table>
            <tr><td>${isJa ? '左クリック' : 'Left Click'}</td><td>${isJa ? 'ノードをSummon（フォーカス移動＋3層リング再配置）し、詳細パネルを表示' : 'Summon node (focus + re-layout rings) and open Detail Panel'}</td></tr>
            <tr><td>${isJa ? 'スクロール' : 'Scroll'}</td><td>${isJa ? 'ズームイン / ズームアウト（遠景ではLOD Farモードに自動切替）' : 'Zoom in / out (switches to LOD Far mode when zoomed out)'}</td></tr>
            <tr><td>${isJa ? 'ドラッグ' : 'Drag'}</td><td>${isJa ? 'キャンバスを自由に移動' : 'Pan the canvas freely'}</td></tr>
            <tr><td>${isJa ? 'ホバー' : 'Hover'}</td><td>${isJa ? 'ノードの接続先をハイライト表示（検索中は無効）' : 'Highlight connected nodes (disabled during search)'}</td></tr>
        </table>

        <h3>${t('help.keyboard')}</h3>
        <table>
            <tr><td>1 – 5</td><td>${isJa ? 'Rune モード切替（下記参照）' : 'Switch Rune mode (see below)'}</td></tr>
            <tr><td>Q / W / E</td><td>${isJa ? 'レイアウト切替（下記参照）' : 'Switch Layout (see below)'}</td></tr>
            <tr><td>Ctrl+F</td><td>${isJa ? 'ファイル名でインクリメンタル検索' : 'Incremental file search'}</td></tr>
            <tr><td>Esc</td><td>${isJa ? 'パネル / 検索 / ヘルプを閉じる' : 'Close panel / search / help'}</td></tr>
            <tr><td>?</td><td>${isJa ? 'このヘルプを表示 / 非表示' : 'Toggle this Help overlay'}</td></tr>
        </table>

        <h3>◇ ${isJa ? 'Rune モード（解析視点の切替）' : 'Rune Modes (analysis perspectives)'}</h3>
        <table>
            <tr><td style="color:#6696ff">1: ${isJa ? '標準' : 'Default'}</td><td>${isJa ? '依存関係をそのまま表示。ノードの色はファイルパスのハッシュで決定され、同じディレクトリのファイルは似た色相になります' : 'Show dependencies as-is. Node colors are hashed from file paths — files in the same directory share similar hues'}</td></tr>
            <tr><td style="color:#44bbff">2: ${isJa ? '構造' : 'Architecture'}</td><td>${isJa ? '循環参照（import の相互依存）を赤いエッジで強調。該当ノードは明るく、それ以外は石化（灰色）して背景に退きます' : 'Highlights circular dependencies with red edges. Involved nodes glow brightly; others are petrified (grayed out)'}</td></tr>
            <tr><td style="color:#ff8800">3: ${isJa ? '防衛' : 'Security'}</td><td>${isJa ? 'eval() や dangerouslySetInnerHTML 等のセキュリティリスクを持つファイルを警告色で強調。安全なファイルは石化します' : 'Emphasizes files with security risks (eval, dangerouslySetInnerHTML, etc.) in warning colors. Safe files are petrified'}</td></tr>
            <tr><td style="color:#44ff88">4: ${isJa ? '最適化' : 'Optimization'}</td><td>${isJa ? 'Tree-shaking リスク（バレルファイル・副作用等）を可視化。リスクが高いほど明るく、低いものは石化します' : 'Visualizes tree-shaking risk (barrel files, side effects). Higher risk = brighter; low risk is petrified'}</td></tr>
            <tr><td style="color:#ff4400">5: ${isJa ? '再生' : 'Refactoring'}</td><td>${isJa ? '被依存数（importされている数）が多い「ホットスポット」を強調。変更時の影響範囲が大きいファイルほど目立ちます' : 'Highlights "hotspots" with many dependents. Files with larger blast radius on change are more prominent'}</td></tr>
        </table>

        <h3>◎ ${isJa ? 'レイアウト（配置方式の切替）' : 'Layouts (arrangement modes)'}</h3>
        <table>
            <tr><td style="color:#8866ff">Q: ${isJa ? '魔法陣' : 'Mandala'}</td><td>${isJa ? 'フォース（力学）シミュレーションによる同心円配置。クリックしたノードが中心、直接依存が中間リング、それ以外が外周に配置されます' : 'Force-directed concentric layout. Clicked node at center, direct deps in middle ring, others on outer ring'}</td></tr>
            <tr><td style="color:#44cc88">W: ${isJa ? '世界樹' : 'Yggdrasil'}</td><td>${isJa ? 'ディレクトリ構造に基づくトップダウンの木構造。ルートが上、子フォルダが下に展開されます' : 'Top-down tree based on directory structure. Root at top, subdirectories expand downward'}</td></tr>
            <tr><td style="color:#6699ff">E: ${isJa ? '泡宇宙' : 'Bubble'}</td><td>${isJa ? 'パック円充填レイアウト。ディレクトリがグループとなり、ファイルサイズ（行数）が円の大きさに反映されます' : 'Circle-packing layout. Directories form groups; file size (line count) determines circle size'}</td></tr>
        </table>

        <h3>${t('help.legend')}</h3>
        <table>
            <tr><td><div class="help-legend-swatch" style="background:linear-gradient(90deg,#4488ff,#ff8844,#44ff88);display:inline-block;width:40px;height:12px;border-radius:3px;vertical-align:middle"></div></td><td>${isJa ? 'ノードの色 — ファイルパスのハッシュで自動決定。同じフォルダ内のファイルは似た色になります' : 'Node color — auto-assigned by file path hash. Files in the same folder have similar colors'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#66ddff;display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle"></div></td><td>${isJa ? 'フォーカスノード（Summon対象）— 中心に配置され、最も明るく表示' : 'Focus node (Summoned) — placed at center, displayed brightest'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#ff3333;display:inline-block;width:40px;height:3px;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '循環参照エッジ — ファイル間の相互依存を示す赤い線（Architecture モードで目立つ）' : 'Circular dependency edge — red line showing mutual imports (prominent in Architecture mode)'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#556677;display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle"></div></td><td>${isJa ? '石化ノード — 現在のRuneモードで注目対象外のファイル。灰色で半透明に表示' : 'Petrified node — not relevant in current Rune mode. Shown gray and translucent'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:0;border-top:2px dashed #667;vertical-align:middle"></div></td><td>${isJa ? '型インポート (type-import) — 点線で表示。ランタイムには影響しない型のみの依存' : 'Type-import — shown as dashed line. Type-only dependency with no runtime impact'}</td></tr>
            <tr><td style="font-size:14px">○ ◇ ⬡ △</td><td>${isJa ? 'ノードの形状 — 円=通常、四角=設定/パッケージ、六角=宣言ファイル、三角=外部モジュール' : 'Node shapes — circle=normal, square=config/package, hexagon=declaration, triangle=external'}</td></tr>
            <tr><td style="font-size:14px;color:#88aacc">大 ↔ 小</td><td>${isJa ? 'ノードのサイズ — ファイルの行数に比例。大きいほどコード量が多い' : 'Node size — proportional to file line count. Larger = more code'}</td></tr>
        </table>
    `;
}

// ─── Keyboard Shortcuts (V6 UX+) ────────────────────────
function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        // テキスト入力中はスキップ
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') { return; }

        // ? = Help toggle
        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
            e.preventDefault();
            toggleHelp();
            return;
        }

        // Esc = 閉じる (Help → DetailPanel → Search の順)
        if (e.key === 'Escape') {
            if (helpVisible) { toggleHelp(false); return; }
            if (selectedNodeId) { closeDetailPanel(); return; }
            // Search は initSearchOverlay 内で処理済み
            return;
        }

        // 数字キー 1-5: Rune モード切り替え
        const runeIndex = parseInt(e.key, 10) - 1;
        if (runeIndex >= 0 && runeIndex < RUNE_BUTTONS.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const btn = RUNE_BUTTONS[runeIndex];
            state.runeMode = btn.mode;
            sendMessage({ type: 'RUNE_MODE_CHANGE', payload: { mode: btn.mode } });
            refreshRuneUI();
            renderGraph();
            return;
        }

        // Q / W / E: Layout モード切り替え
        const layoutKeyMap: Record<string, LayoutMode> = { q: 'force', w: 'tree', e: 'balloon' };
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
    // エラーをオーバーレイに表示してユーザーに見えるようにする
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
