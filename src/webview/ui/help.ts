// ─── Help / Legend Overlay (V6 Phase 4) ─────────────────
import { Graphics, Text, TextStyle, Container } from 'pixi.js';
import { t } from '../core/i18n.js';
import { currentLang } from '../core/i18n.js';
import { MINIMAP_SIZE } from './minimap.js';

let helpOverlay: HTMLElement | null = null;
let helpCard: HTMLElement | null = null;
export let helpVisible = false;

let _uiContainer: Container;

export function setHelpContext(ctx: {
    uiContainer: Container;
}) {
    _uiContainer = ctx.uiContainer;
}

export function initHelpOverlay() {
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

    helpBtn.position.set(window.innerWidth - MINIMAP_SIZE - 56, window.innerHeight - MINIMAP_SIZE - 16);
    _uiContainer.addChild(helpBtn);

    helpBtn.on('pointertap', () => toggleHelp());

    window.addEventListener('resize', () => {
        const scale = window.innerWidth < 500 ? 0.6 : window.innerWidth < 800 ? 0.8 : 1.0;
        const effectiveSize = MINIMAP_SIZE * scale;
        helpBtn.position.set(window.innerWidth - effectiveSize - 56, window.innerHeight - effectiveSize - 16);
    });
}

export function toggleHelp(forceState?: boolean) {
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
            <tr><td>${isJa ? '背景クリック' : 'Click Background'}</td><td>${isJa ? '詳細パネルを閉じる' : 'Close the Detail Panel'}</td></tr>
        </table>

        <h3>⌨️ ${isJa ? '詠唱 (Shortcuts)' : 'Shortcuts'}</h3>
        <table>
            <tr><td>1 – 5</td><td>${isJa ? 'ルーン切替（解析モードの変更）' : 'Change Rune (analysis mode)'}</td></tr>
            <tr><td>Q / W / E</td><td>${isJa ? '宇宙の再構築（レイアウト切替）' : 'Rebuild cosmos (change layout)'}</td></tr>
            <tr><td>Ctrl+F</td><td>${isJa ? 'インクリメンタルサーチ & ハイライト' : 'Incremental search & highlight'}</td></tr>
            <tr><td>Esc</td><td>${isJa ? '検索解除 / パネルを閉じる' : 'Clear search / close panel'}</td></tr>
            <tr><td>Space</td><td>${isJa ? '物理演算の一時停止 / 再開' : 'Pause / resume physics simulation'}</td></tr>
            <tr><td>?</td><td>${isJa ? 'このヘルプを表示 / 非表示' : 'Toggle this Help overlay'}</td></tr>
        </table>

        <h3>📜 ${isJa ? '呪文の書 — ルーン（解析モード）' : 'Runes — Analysis Modes'}</h3>
        <table>
            <tr><td style="color:#6696ff">1: ${isJa ? '標準のルーン' : 'Standard'}</td><td>${isJa ? '最も基本的な表示。ファイルパスのハッシュ値に基づき、同じディレクトリのファイルは同系色で表示されます' : 'Basic view. Node colors hashed from file paths — files in the same directory share similar hues'}</td></tr>
            <tr><td style="color:#44bbff">2: ${isJa ? '構造のルーン' : 'Structure'}</td><td>${isJa ? '構造的な欠陥を浮き彫りに。循環参照を赤き鎖（赤いエッジ）で発光。問題のないノードは石化（グレーアウト）し、修正すべき箇所だけが浮かび上がります' : 'Reveals structural flaws. Circular dependencies glow as red chains. Uninvolved nodes are petrified (grayed out)'}</td></tr>
            <tr><td style="color:#ff8800">3: ${isJa ? '防衛のルーン' : 'Defense'}</td><td>${isJa ? 'セキュリティリスクを可視化。eval や dangerouslySetInnerHTML 等を含む星を警告色（赤/オレンジ）で脈動。リスクを修正すると即座に石化（浄化）します' : 'Visualizes security risks. Files with eval/dangerouslySetInnerHTML pulse in warning colors. Fixing risks purifies (petrifies) them'}</td></tr>
            <tr><td style="color:#44ff88">4: ${isJa ? '最適化のルーン' : 'Optimization'}</td><td>${isJa ? 'デッドコードやバンドル肥大化の原因を探索。到達不能ファイルは石化（死の兆候）。副作用のみのインポートは混沌の契約として強調されます' : 'Hunts dead code and bundle bloat. Unreachable files petrify (death signs). Side-effect-only imports highlighted as chaotic contracts'}</td></tr>
            <tr><td style="color:#66ddff">5: ${isJa ? '分析のルーン' : 'Analysis'}</td><td>${isJa ? '魔力（データシンボル）の流量を可視化。ノード上に ⇄ N (↑X ↓Y) を表示。↑=供給（export数）、↓=消費（import数）。エッジ種別フィルタリングも可能' : 'Visualizes magic (data symbol) flow. Shows ⇄ N (↑X ↓Y) on nodes. ↑=supply (exports), ↓=consume (imports). Edge type filtering available'}</td></tr>
        </table>

        <h3>📐 ${isJa ? '宇宙の理 — レイアウト' : 'Cosmos — Layouts'}</h3>
        <table>
            <tr><td style="color:#8866ff">Q: ${isJa ? '魔方陣' : 'Mandala'}</td><td>${isJa ? '物理演算により、密結合なファイル同士が引き合い自然なクラスタを形成。プロジェクトの「重力中心」を直感的に把握できます' : 'Physics-driven layout where tightly coupled files attract each other, forming natural clusters. Intuitively grasp the project\'s "center of gravity"'}</td></tr>
            <tr><td style="color:#44cc88">W: ${isJa ? '銀河' : 'Galaxy'}</td><td>${isJa ? 'エントリーポイントを中心に依存の深さで同心円状に配置。中心=コアロジック、外縁=末端、最外周=到達不能なデッドコード（追放の地）' : 'Entry point at center, radial by dependency depth. Center=core, rim=endpoints, outermost=unreachable dead code (exile zone)'}</td></tr>
            <tr><td style="color:#6699ff">E: ${isJa ? '泡宇宙' : 'Bubble'}</td><td>${isJa ? 'ディレクトリ構造を入れ子の円（泡）で表現。行数/ファイルサイズでサイズ切替可能。フォルダクリックでドリルダウン' : 'Nested circles (bubbles) for directory structure. Toggle size by lines/file size. Click folders to drill down'}</td></tr>
        </table>

        <h3>� ${isJa ? '全知の水晶（詳細パネル）' : 'Crystal of Omniscience (Detail Panel)'}</h3>
        <p style="font-size:12px;color:#8899aa;margin:4px 0 8px">${isJa ? 'ノードをクリックすると右側に詳細パネル（全知の水晶）が表示されます。以下の情報が確認できます。' : 'Click a node to open the Detail Panel (Crystal of Omniscience) on the right. It displays the following information:'}</p>
        <table>
            <tr><td>📄 / ✦</td><td>${isJa ? 'アクションボタン — ファイルをVS Codeで開く / ノードをSummon（中心に配置）' : 'Action buttons — Open file in VS Code / Summon node (center it)'}</td></tr>
            <tr><td>${isJa ? 'パス' : 'Path'}</td><td>${isJa ? 'ワークスペースルートからの相対パス' : 'Relative path from workspace root'}</td></tr>
            <tr><td>${isJa ? '情報' : 'Info'}</td><td>${isJa ? 'ファイル種別（source / declaration / config 等）、行数、エクスポート数' : 'File kind (source / declaration / config etc.), line count, export count'}</td></tr>
            <tr><td>Git</td><td>${isJa ? 'コミット数と最終更新日（Git が有効な場合）' : 'Commit count and last modified date (when Git is available)'}</td></tr>
            <tr><td>${isJa ? 'エクスポート' : 'Exports'}</td><td>${isJa ? 'ファイルがエクスポートするシンボル一覧。★ = default export、(function) / (class) / (type) 等で種別表示' : 'List of exported symbols. ★ = default export, with kind labels like (function) / (class) / (type)'}</td></tr>
            <tr><td>${isJa ? '依存 (Imports)' : 'Imports'}</td><td>${isJa ? 'このファイルが import しているファイルの一覧。クリックでそのファイルへジャンプ' : 'Files imported by this file. Click to jump to that file'}</td></tr>
            <tr><td>${isJa ? '被依存 (Imported by)' : 'Imported by'}</td><td>${isJa ? 'このファイルを import しているファイルの一覧。クリックでジャンプ' : 'Files that import this file. Click to jump'}</td></tr>
            <tr><td>⚠ ${isJa ? 'セキュリティ' : 'Security'}</td><td>${isJa ? 'eval / innerHTML 等のセキュリティ警告（該当ファイルのみ表示）' : 'Security warnings like eval / innerHTML (shown only for affected files)'}</td></tr>
            <tr><td>⚡ ${isJa ? '最適化' : 'Optimization'}</td><td>${isJa ? 'Tree-shaking リスクスコア、バレルファイル判定、副作用の有無。リスクメーターで視覚化' : 'Tree-shaking risk score, barrel file detection, side effects. Visualized with a risk meter'}</td></tr>
            <tr><td>⇄ ${isJa ? 'データフロー' : 'Data Flow'}</td><td>${isJa ? 'このファイルが送受信するシンボル数（↑ = 送信 / ↓ = 受信）。型インポートは除外' : 'Symbol count sent/received by this file (↑ = out / ↓ = in). Type imports excluded'}</td></tr>
            <tr><td>${isJa ? 'コード閲覧' : 'Code Preview'}</td><td>${isJa ? 'ファイルの先頭50行をシンタックスハイライト付きで表示' : 'First 50 lines of the file with syntax highlighting'}</td></tr>
            <tr><td>${isJa ? 'Activity' : 'Activity'}</td><td>${isJa ? 'Git コミット頻度のヒートバー。Hot spot 🔥 / Active / Stable で分類' : 'Git commit frequency heat bar. Classified as Hot spot 🔥 / Active / Stable'}</td></tr>
        </table>

        <h3>⇄ ${isJa ? '分析のルーン — シンボル流量表示' : 'Analysis Rune — Symbol Flow Display'}</h3>
        <p style="font-size:12px;color:#8899aa;margin:4px 0 8px">${isJa ? '分析のルーン（Rune 5）では魔力（データシンボル）の流量がノード上に直接表示されます。' : 'In Analysis Rune (Rune 5), magic (data symbol) flow is displayed directly on nodes.'}</p>
        <table>
            <tr><td style="color:#66ddff">⇄ N symbols</td><td>${isJa ? 'ノード上に表示される合計シンボル流量。このファイルを経由する魔力の量を表します' : 'Total symbol flow shown on node. Represents the amount of magic flowing through this file'}</td></tr>
            <tr><td style="color:#66ddff">↑N ↓N</td><td>${isJa ? '↑ = 供給（exportし他に使われている数）、↓ = 消費（他からimportしている数）。型インポートは除外' : '↑ = supply (exports used by others), ↓ = consume (imports from others). Type imports excluded'}</td></tr>
            <tr><td><div style="display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid #66ddff;background:rgba(102,221,255,0.15);vertical-align:middle"></div></td><td>${isJa ? 'フローリング — シンボルの流れが多いノードに表示される青い光輪。フロー量に比例して明るくなります' : 'Flow ring — blue glow around nodes with high symbol flow. Brightness scales with flow amount'}</td></tr>
            <tr><td style="color:#556677">${isJa ? '石化ノード' : 'Petrified'}</td><td>${isJa ? 'シンボルの流れが無いファイルは灰色で半透明になります（データの受け渡しに関与していない）' : 'Files with no symbol flow are grayed out (not involved in data exchange)'}</td></tr>
        </table>

        <h3>⬢ ${isJa ? '分析のルーン — 魔力の色分け線' : 'Analysis Rune — Color-Coded Magic Lines'}</h3>
        <p style="font-size:12px;color:#8899aa;margin:4px 0 8px">${isJa ? '分析のルーンではすべてのエッジが種別ごとに色分けされた実線で表示されます。線の太さと濃さはシンボル流量に比例します。ツールバーのフィルターボタン（分析のルーン時のみ表示）で種別ごとに表示/非表示を切り替えられます。' : 'In Analysis Rune, all edges are drawn as solid color-coded lines by type. Line width and opacity scale with symbol flow. Use filter buttons in the toolbar (visible only in Analysis Rune) to toggle visibility per type.'}</p>
        <table>
            <tr><td><div style="display:inline-block;width:40px;height:3px;background:#66bbff;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '通常インポート (static-import) — 青' : 'Static import — blue'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:3px;background:#cc66ff;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '動的インポート (dynamic-import) — 紫' : 'Dynamic import — purple'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:3px;background:#44ddaa;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '型インポート (type-import) — 緑' : 'Type import — green'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:3px;background:#ffaa33;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '副作用インポート (side-effect) — 橙' : 'Side-effect import — orange'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:3px;background:#ff6688;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '再エクスポート (re-export) — 桃' : 'Re-export — pink'}</td></tr>
        </table>

        <h3>⬡ ${isJa ? '泡宇宙での線の意味' : 'Bubble Layout Lines'}</h3>
        <table>
            <tr><td><div style="display:inline-block;width:40px;height:2.5px;background:#446688;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '階層エッジ — ディレクトリ（親）とファイル（子）の所属関係を示す構造線' : 'Hierarchy edge — structural line showing directory-to-file containment'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:0;border-top:2px dashed #6688cc;vertical-align:middle"></div></td><td>${isJa ? '型インポート — ランタイムに影響しない型のみの依存（青い点線）' : 'Type-import — type-only dependency with no runtime impact (blue dashed)'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:1px;background:#334466;opacity:0.5;border-radius:1px;vertical-align:middle"></div></td><td>${isJa ? '通常のインポート — 薄い直線で表示される標準的なファイル間の依存' : 'Normal import — standard file dependency shown as a faint line'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:3px;background:#ff3333;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '循環参照（赤き鎖）— 構造のルーンで赤く強調される相互依存のエッジ' : 'Circular dependency (Red Chain) — mutual import edge highlighted red in Structure Rune'}</td></tr>
        </table>

        <h3>📦 ${isJa ? '泡宇宙のサイズモード' : 'Bubble Size Mode'}</h3>
        <p style="font-size:12px;color:#8899aa;margin:4px 0 8px">${isJa ? '泡宇宙レイアウト時にツールバーに表示されるサイズモード切替ボタンです。' : 'Size mode toggle buttons appear in the toolbar when using the Bubble layout.'}</p>
        <table>
            <tr><td>📏</td><td>${isJa ? '行数モード — ファイルの行数に応じて円の大きさが変化します（デフォルト）' : 'Line Count mode — circle size scales with file line count (default)'}</td></tr>
            <tr><td>📦</td><td>${isJa ? 'サイズモード — ファイルのバイトサイズに応じて円の大きさが変化します' : 'File Size mode — circle size scales with file byte size'}</td></tr>
        </table>

        <h3>📁 ${isJa ? '泡宇宙のフォルダ操作' : 'Bubble Folder Interaction'}</h3>
        <table>
            <tr><td>${isJa ? 'フォルダ円クリック' : 'Click folder circle'}</td><td>${isJa ? 'フォルダ詳細パネルを表示。フォルダ統計（ファイル数・行数・エクスポート数）、内部接続数、外部依存/被依存、配下ファイル一覧が確認できます' : 'Opens Folder Detail Panel. Shows folder stats (file count, lines, exports), internal connections, external deps, and file list'}</td></tr>
            <tr><td><div style="display:inline-block;width:16px;height:16px;border-radius:50%;border:3px solid #66ddff;background:rgba(26,51,102,0.2);vertical-align:middle"></div></td><td>${isJa ? 'フォーカス中のフォルダ — 太い枠線とボールドラベルで強調表示されます' : 'Focused folder — highlighted with thicker border and bold label'}</td></tr>
        </table>

        <h3>🌌 ${isJa ? '銀河 — 宇宙の見方' : 'Galaxy — Cosmos Guide'}</h3>
        <table>
            <tr><td><div style="display:inline-block;width:16px;height:16px;border-radius:50%;border:1.5px solid #4466cc;background:rgba(34,68,170,0.15);vertical-align:middle"></div></td><td>${isJa ? '中心 — エントリーポイント（最も多くの依存を発信するファイル、またはフォーカス中のノード）' : 'Center — entry point (file with most outgoing deps, or currently focused node)'}</td></tr>
            <tr><td>${isJa ? '内側のリング' : 'Inner rings'}</td><td>${isJa ? 'エントリーポイントから依存を辿って近いファイル。BFS深度が浅いほど中心に近い' : 'Files closer to the entry point by dependency. Shallower BFS depth = closer to center'}</td></tr>
            <tr><td>${isJa ? '外側のリング' : 'Outer rings'}</td><td>${isJa ? 'エントリーポイントから遠いファイル。依存チェーンが深い' : 'Files far from entry point. Deep dependency chains'}</td></tr>
            <tr><td style="color:#ff6666">${isJa ? '最外周（追放の地）' : 'Outermost rim (Exile)'}</td><td>${isJa ? 'エントリーポイントから到達不能なファイル。デッドコード（Orphans）や孤立モジュールの可能性があります' : 'Files unreachable from entry point. Possibly dead code (Orphans) or isolated modules'}</td></tr>
        </table>

        <h3>🔍 ${isJa ? '探索の道具' : 'Exploration Tools'}</h3>
        <table>
            <tr><td>${isJa ? 'パンくずリスト' : 'Breadcrumbs'}</td><td>${isJa ? '探索履歴をツールバー下に表示。クリックで過去のノードに戻れます。小画面では最大3つ＋省略表示' : 'Exploration history shown below toolbar. Click to revisit past nodes. Compressed to 3 items + ellipsis on small screens'}</td></tr>
            <tr><td>${isJa ? '👻 探索軌跡' : '👻 Ghost Trail'}</td><td>${isJa ? '探索した経路を光の軌跡として記録。訪問済みノード間を点線で結び、深い依存の森でも迷子を防ぎます' : 'Records exploration paths as trails of light. Dotted lines connect visited nodes, preventing you from getting lost in deep dependency forests'}</td></tr>
            <tr><td>${isJa ? 'ミニマップ' : 'Minimap'}</td><td>${isJa ? '画面右下の全体俯瞰図。現在のビューポート位置を白い矩形で表示。クリックでその位置にジャンプ' : 'Overview map at bottom-right. Shows current viewport as a white rectangle. Click to jump to that position'}</td></tr>
            <tr><td>${isJa ? '検索バー' : 'Search Bar'}</td><td>${isJa ? 'Ctrl+F でファイル名をインクリメンタル検索。一致しないノードは透明化されます' : 'Ctrl+F for incremental file search. Non-matching nodes become transparent'}</td></tr>
            <tr><td>${isJa ? 'LOD 自動切替' : 'LOD Auto-Switch'}</td><td>${isJa ? 'ズームアウトすると LOD Far モードに自動切替。遠景ではノードがドットに簡略化され、型インポート線が非表示になります' : 'Auto-switches to LOD Far when zoomed out. Nodes become dots and type-import lines are hidden in Far mode'}</td></tr>
        </table>

        <h3>${t('help.legend')}</h3>
        <table>
            <tr><td><div class="help-legend-swatch" style="background:linear-gradient(90deg,#4488ff,#ff8844,#44ff88);display:inline-block;width:40px;height:12px;border-radius:3px;vertical-align:middle"></div></td><td>${isJa ? 'ノードの色 — ファイルパスのハッシュで自動決定。同じフォルダ内のファイルは似た色になります' : 'Node color — auto-assigned by file path hash. Files in the same folder have similar colors'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#66ddff;display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle"></div></td><td>${isJa ? 'フォーカスノード（Summon対象）— 中心に配置され、最も明るく表示' : 'Focus node (Summoned) — placed at center, displayed brightest'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#ff3333;display:inline-block;width:40px;height:3px;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '赤き鋎（循環参照エッジ）— ファイル間の相互依存を示す赤い線（構造のルーンで発光）' : 'Red Chain (circular dependency edge) — red line showing mutual imports (glows in Structure Rune)'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#556677;display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle"></div></td><td>${isJa ? '石化ノード — 現在のルーンで注目対象外のファイル。灰色で半透明に沈黙します' : 'Petrified node — not relevant in current Rune. Silenced in gray and translucent'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:0;border-top:2px dashed #6688cc;vertical-align:middle"></div></td><td>${isJa ? '型インポート (type-import) — 青い点線で表示。ランタイムには影響しない型のみの依存' : 'Type-import — shown as blue dashed line. Type-only dependency with no runtime impact'}</td></tr>
            <tr><td style="font-size:14px">○ ◇ ⬡ △</td><td>${isJa ? 'ノードの形状 — 円=通常、四角=設定/パッケージ、六角=宣言ファイル、三角=外部モジュール' : 'Node shapes — circle=normal, square=config/package, hexagon=declaration, triangle=external'}</td></tr>
            <tr><td style="font-size:14px;color:#88aacc">大 ↔ 小</td><td>${isJa ? 'ノードのサイズ — ファイルの行数に比例。大きいほどコード量が多い' : 'Node size — proportional to file line count. Larger = more code'}</td></tr>
            <tr><td style="font-size:14px">━ ┄ ⤳ ⚡ ⇄</td><td>${isJa ? 'エッジフィルター — 分析のルーン時にツールバーに表示。エッジ種別ごとに表示/非表示を切替' : 'Edge filters — shown in toolbar during Analysis Rune. Toggle visibility per edge type'}</td></tr>
        </table>
    `;
}
