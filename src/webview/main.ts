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
} from '../shared/types.js';

// ─── VS Code API ────────────────────────────────────────
// @ts-expect-error acquireVsCodeApi は Webview 内でのみ利用可能
const vscode = acquireVsCodeApi();

// ─── LOD (Level of Detail) ───────────────────────────────
type LODLevel = 'far' | 'mid' | 'near';

function getLODLevel(scale: number): LODLevel {
    if (scale < 0.3) { return 'far'; }
    if (scale < 1.2) { return 'mid'; }
    return 'near';
}

// ─── 状態管理 ────────────────────────────────────────────
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
        },
    });

    state.isLoading = true;
    updateStatusText();
}

// ─── Summoning (フォーカス切り替え) ──────────────────────
function summonNode(nodeId: string) {
    if (state.focusNodeId === nodeId) { return; }

    state.focusNodeId = nodeId;

    // Extension にフォーカス変更を通知
    sendMessage({ type: 'FOCUS_NODE', payload: { nodeId } });

    // Worker にフォーカス変更を送信
    sendToWorker({ type: 'FOCUS', payload: { focusNodeId: nodeId } });

    state.isLoading = true;
    startParticleLoading();
    updateStatusText();

    // Viewport をフォーカスノードへスムーズ移動
    const pos = state.nodePositions.get(nodeId);
    if (pos) {
        animateViewportTo(pos.x, pos.y);
    }
}

/** Viewport をスムーズにターゲット座標へ移動 */
function animateViewportTo(targetX: number, targetY: number) {
    const duration = 600; // ms
    const startX = viewport.center.x;
    const startY = viewport.center.y;
    const startTime = performance.now();

    const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // easeOutCubic
        const ease = 1 - Math.pow(1 - t, 3);

        const x = startX + (targetX - startX) * ease;
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
        background: 0x0a0c1e,
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
    statusText = new Text({ text: 'Awaiting analysis...', style: statusStyle });
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
    });

    // LOD: ズーム変更で LOD レベルが切り替わったら再描画
    viewport.on('zoomed', () => {
        const newLOD = getLODLevel(viewport.scaled);
        if (newLOD !== state.currentLOD) {
            state.currentLOD = newLOD;
            renderGraph();
        }
    });

    // Worker 初期化
    initWorker();

    // Particle Loading 初期化 & 開始
    initParticleSystem();
    startParticleLoading();

    // Rune UI 初期化
    initRuneUI();

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

/** パーティクルアニメーション停止（フェードアウト） */
function stopParticleLoading() {
    if (!particleAnimActive) { return; }
    particleAnimActive = false;

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

// ─── グラフ描画 ──────────────────────────────────────────
function renderGraph() {
    const graph = state.graph;
    if (!graph) { return; }

    // クリア
    nodeContainer.removeChildren();
    edgeContainer.removeChildren();

    // 同心円ガイド
    drawRingGuides();

    // エッジ描画
    const edgeGfx = new Graphics();
    const cycleNodeIds = new Set<string>();
    if (state.graph?.circularDeps) {
        for (const cycle of state.graph.circularDeps) {
            for (const id of cycle.path) { cycleNodeIds.add(id); }
        }
    }

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
            width = state.currentLOD === 'far' ? 1.5 : 3;
        } else if (state.runeMode === 'architecture' && cycleNodeIds.size > 0) {
            // Architecture モードで循環参照以外のエッジは薄く
            color = srcNode ? getNodeColor(srcNode) : 0x334466;
            alpha = 0.08;
            width = 0.5;
        } else {
            color = srcNode ? getNodeColor(srcNode) : 0x334466;
            // LOD Far: エッジを薄く細く
            if (state.currentLOD === 'far') {
                alpha = 0.1;
                width = 0.5;
            } else {
                alpha = isTypeOnly ? 0.08 : 0.25;
                width = isTypeOnly ? 0.5 : 1;
            }
        }

        edgeGfx.moveTo(srcPos.x, srcPos.y);
        edgeGfx.lineTo(tgtPos.x, tgtPos.y);
        edgeGfx.stroke({ width, color, alpha });
    }
    edgeContainer.addChild(edgeGfx);

    // ノード描画
    for (const node of graph.nodes) {
        const pos = state.nodePositions.get(node.id);
        if (!pos) { continue; }

        const ring = state.nodeRings.get(node.id) || 'global';
        const nodeGfx = createNodeGraphics(node, pos, ring);
        nodeContainer.addChild(nodeGfx);
    }
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
            container.alpha = Math.max(0.1, getRingAlpha(ring) * 0.3);
        }

        // Focus ノードのみ小ラベル表示
        if (isFocus) {
            const miniLabel = createSmartText(node.label, { fontSize: 8, fill: glowColor });
            miniLabel.anchor.set(0.5, 0);
            miniLabel.position.set(0, Math.max(4, nodeRadius * 0.35) + 4);
            container.addChild(miniLabel);
        }

        attachNodeInteraction(container, node, ring);
        return container;
    }

    // ═══════════════════════════════════════════════════
    // LOD: Mid & Near — フルノード描画
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

    // ═══════════════════════════════════════════════════
    // LOD: Near — 詳細情報パネル (scale >= 1.2)
    // ═══════════════════════════════════════════════════
    if (lod === 'near') {
        const detailLines: string[] = [];

        // 行数
        detailLines.push(`📝 ${node.lineCount} lines`);

        // import 数 (受信エッジ数)
        if (state.graph) {
            const incomingCount = state.graph.edges.filter(e => e.target === node.id).length;
            const outgoingCount = state.graph.edges.filter(e => e.source === node.id).length;
            detailLines.push(`📥 ${incomingCount} in / 📤 ${outgoingCount} out`);
        }

        // エクスポートシンボル一覧 (先頭5件)
        if (node.exports.length > 0) {
            const exportNames = node.exports.slice(0, 5).map(e => e.name).join(', ');
            const suffix = node.exports.length > 5 ? ` +${node.exports.length - 5}` : '';
            detailLines.push(`⬡ ${exportNames}${suffix}`);
        }

        // 関数依存 (先頭3件)
        if (node.functionDeps && node.functionDeps.length > 0) {
            const funcNames = node.functionDeps.slice(0, 3).map(f => f.calleeName).join(', ');
            const suffix = node.functionDeps.length > 3 ? ` +${node.functionDeps.length - 3}` : '';
            detailLines.push(`⚡ calls: ${funcNames}${suffix}`);
        }

        // セキュリティ警告詳細
        if (node.securityWarnings && node.securityWarnings.length > 0) {
            for (const w of node.securityWarnings.slice(0, 3)) {
                detailLines.push(`⚠ L${w.line}: ${w.kind}`);
            }
            if (node.securityWarnings.length > 3) {
                detailLines.push(`  +${node.securityWarnings.length - 3} more warnings`);
            }
        }

        // Git 情報
        if (node.gitCommitCount && node.gitCommitCount > 0) {
            detailLines.push(`🔥 ${node.gitCommitCount} commits`);
            if (node.gitLastModified) {
                detailLines.push(`📅 ${node.gitLastModified.substring(0, 10)}`);
            }
        }

        if (detailLines.length > 0) {
            // 背景パネル
            const panelWidth = 180;
            const lineHeight = 13;
            const panelHeight = detailLines.length * lineHeight + 12;
            const panelY = nextBadgeY + 6;

            const panel = new Graphics();
            panel.roundRect(-panelWidth / 2, panelY, panelWidth, panelHeight, 4);
            panel.fill({ color: 0x0d1025, alpha: 0.85 });
            panel.stroke({ width: 1, color: baseColor, alpha: 0.3 });
            container.addChild(panel);

            const detailStyle = new TextStyle({
                fontSize: 9,
                fill: 0x99aabb,
                fontFamily: 'Consolas, monospace',
                lineHeight: lineHeight,
            });
            const detailText = new Text({
                text: detailLines.join('\n'),
                style: detailStyle,
            });
            detailText.anchor.set(0.5, 0);
            detailText.position.set(0, panelY + 6);
            container.addChild(detailText);
        }
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
        container.alpha = Math.max(0.15, getRingAlpha(ring) * 0.4);
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
        container.alpha = Math.max(0.15, getRingAlpha(ring) * 0.4);
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
        container.alpha = 0.2;
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
    // インタラクション: ホバー
    container.on('pointerover', () => {
        state.hoveredNodeId = node.id;
        if (gfx) { gfx.tint = 0xffffff; }
        if (outerGfx) { outerGfx.alpha = 0.6; }
        container.alpha = 1.0;
    });

    container.on('pointerout', () => {
        if (state.hoveredNodeId === node.id) { state.hoveredNodeId = null; }
        if (gfx) { gfx.tint = 0xffffff; }
        if (outerGfx) { outerGfx.alpha = 1; }
        container.alpha = getRingAlpha(ring);
    });

    // インタラクション: クリック = Summoning (フォーカス切り替え)
    // 右クリック or Alt+クリック = ファイルへジャンプ
    container.on('pointertap', (e: FederatedPointerEvent) => {
        if (e.altKey || e.button === 2) {
            sendMessage({
                type: 'JUMP_TO_FILE',
                payload: { filePath: node.filePath, line: 1 },
            });
        } else {
            summonNode(node.id);
        }
    });

    // 右クリックメニュー抑止
    container.on('rightclick', (e: FederatedPointerEvent) => {
        e.preventDefault?.();
        sendMessage({
            type: 'JUMP_TO_FILE',
            payload: { filePath: node.filePath, line: 1 },
        });
    });
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

// ─── Rune UI (モード切り替えパネル) ─────────────────────

interface RuneButton {
    mode: RuneMode;
    label: string;
    icon: string;
    color: number;
}

const RUNE_BUTTONS: RuneButton[] = [
    { mode: 'default',       label: 'Default',       icon: '◇', color: 0x6696ff },
    { mode: 'architecture',  label: 'Architecture',  icon: '⬡', color: 0x44bbff },
    { mode: 'security',      label: 'Security',      icon: '⚠', color: 0xff8800 },
    { mode: 'refactoring',   label: 'Refactoring',   icon: '🔥', color: 0xff4400 },
];

let runeContainer: Container;

function initRuneUI() {
    runeContainer = new Container();
    runeContainer.position.set(16, 16);
    uiContainer.addChild(runeContainer);

    RUNE_BUTTONS.forEach((btn, i) => {
        const btnContainer = new Container();
        btnContainer.position.set(0, i * 36);
        btnContainer.eventMode = 'static';
        btnContainer.cursor = 'pointer';

        // 背景
        const bg = new Graphics();
        bg.roundRect(0, 0, 140, 30, 6);
        const isActive = state.runeMode === btn.mode;
        bg.fill({ color: isActive ? btn.color : 0x151830, alpha: isActive ? 0.35 : 0.6 });
        bg.stroke({ width: 1, color: btn.color, alpha: isActive ? 0.9 : 0.3 });
        btnContainer.addChild(bg);

        // テキスト
        const text = new Text({
            text: `${btn.icon} ${btn.label}`,
            style: new TextStyle({
                fontSize: 11,
                fill: isActive ? 0xffffff : btn.color,
                fontFamily: 'Consolas, monospace',
            }),
        });
        text.position.set(8, 7);
        btnContainer.addChild(text);

        // クリックイベント
        btnContainer.on('pointertap', () => {
            state.runeMode = btn.mode;
            sendMessage({ type: 'RUNE_MODE_CHANGE', payload: { mode: btn.mode } });
            refreshRuneUI();
            renderGraph();
        });

        runeContainer.addChild(btnContainer);
    });
}

/** Rune ボタンの表示を更新 */
function refreshRuneUI() {
    runeContainer.removeChildren();
    // 再描画（状態に基づく）
    RUNE_BUTTONS.forEach((btn, i) => {
        const btnContainer = new Container();
        btnContainer.position.set(0, i * 36);
        btnContainer.eventMode = 'static';
        btnContainer.cursor = 'pointer';

        const bg = new Graphics();
        bg.roundRect(0, 0, 140, 30, 6);
        const isActive = state.runeMode === btn.mode;
        bg.fill({ color: isActive ? btn.color : 0x151830, alpha: isActive ? 0.35 : 0.6 });
        bg.stroke({ width: 1, color: btn.color, alpha: isActive ? 0.9 : 0.3 });
        btnContainer.addChild(bg);

        const text = new Text({
            text: `${btn.icon} ${btn.label}`,
            style: new TextStyle({
                fontSize: 11,
                fill: isActive ? 0xffffff : btn.color,
                fontFamily: 'Consolas, monospace',
            }),
        });
        text.position.set(8, 7);
        btnContainer.addChild(text);

        btnContainer.on('pointertap', () => {
            state.runeMode = btn.mode;
            sendMessage({ type: 'RUNE_MODE_CHANGE', payload: { mode: btn.mode } });
            refreshRuneUI();
            renderGraph();
        });

        runeContainer.addChild(btnContainer);
    });
}

// ─── UI ──────────────────────────────────────────────────
function updateStatusText() {
    if (state.isLoading) {
        statusText.text = `⟐ ${state.projectName} — Computing layout...`;
    } else if (state.graph) {
        const g = state.graph;
        const focusLabel = state.focusNodeId
            ? state.graph?.nodes.find(n => n.id === state.focusNodeId)?.label || ''
            : '';
        const runeLabel = state.runeMode !== 'default' ? ` | Rune: ${state.runeMode}` : '';
        const cycleCount = g.circularDeps?.length || 0;
        const cycleInfo = state.runeMode === 'architecture' && cycleCount > 0
            ? ` | ⟳ ${cycleCount} cycles` : '';
        const lodLabel = state.currentLOD !== 'mid' ? ` | LOD: ${state.currentLOD}` : '';
        statusText.text = `⟐ ${state.projectName} — ${g.nodes.length} files, ${g.edges.length} deps (${g.analysisTimeMs}ms) | Focus: ${focusLabel}${runeLabel}${cycleInfo}${lodLabel}`;
    }
}

function renderError() {
    nodeContainer.removeChildren();
    edgeContainer.removeChildren();

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
