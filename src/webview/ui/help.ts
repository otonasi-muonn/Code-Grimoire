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
            <tr><td style="color:#66ddff">5: ${isJa ? '分析' : 'Analysis'}</td><td>${isJa ? 'ファイル間のデータ受け渡し（importされたシンボル数）を可視化。シンボルの流れが多いノードほど明るく表示されます' : 'Visualizes data flow between files (imported symbol count). Nodes with more symbol flow are brighter'}</td></tr>
        </table>

        <h3>◎ ${isJa ? 'レイアウト（配置方式の切替）' : 'Layouts (arrangement modes)'}</h3>
        <table>
            <tr><td style="color:#8866ff">Q: ${isJa ? '魔法陣' : 'Mandala'}</td><td>${isJa ? 'フォース（力学）シミュレーションによる同心円配置。クリックしたノードが中心、直接依存が中間リング、それ以外が外周に配置されます' : 'Force-directed concentric layout. Clicked node at center, direct deps in middle ring, others on outer ring'}</td></tr>
            <tr><td style="color:#44cc88">W: ${isJa ? '銀河' : 'Galaxy'}</td><td>${isJa ? 'エントリーポイントを中心に、BFS深度で放射状に配置。依存が近いほど中心に、到達不能なファイルは最外周に配置されます' : 'Entry point at center, files arranged radially by BFS depth. Closer dependencies near center, unreachable files on outer rim'}</td></tr>
            <tr><td style="color:#6699ff">E: ${isJa ? '泡宇宙' : 'Bubble'}</td><td>${isJa ? 'パック円充填レイアウト。ディレクトリがグループとなり、ファイルの行数またはサイズが円の大きさに反映されます。ツールバーで行数/サイズモードを切替できます' : 'Circle-packing layout. Directories form groups; file line count or size determines circle size. Toggle size mode in toolbar'}</td></tr>
        </table>

        <h3>📋 ${isJa ? '詳細パネル' : 'Detail Panel'}</h3>
        <p style="font-size:12px;color:#8899aa;margin:4px 0 8px">${isJa ? 'ノードをクリックすると右側に詳細パネルが表示されます。以下の情報が確認できます。' : 'Click a node to open the Detail Panel on the right. It displays the following information:'}</p>
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

        <h3>⇄ ${isJa ? '分析モードのノード表示' : 'Analysis Mode Node Display'}</h3>
        <p style="font-size:12px;color:#8899aa;margin:4px 0 8px">${isJa ? '分析モード（Rune 5）ではノード上にデータフロー情報が直接表示されます。' : 'In Analysis mode (Rune 5), data flow information is displayed directly on nodes.'}</p>
        <table>
            <tr><td style="color:#66ddff">⇄ N symbols</td><td>${isJa ? 'ノード上に表示される合計シンボル数。このファイルを経由するデータの量を表します' : 'Total symbol count shown on node. Represents the amount of data flowing through this file'}</td></tr>
            <tr><td style="color:#66ddff">↑N ↓N</td><td>${isJa ? '↑ = 他のファイルへ送信しているシンボル数、↓ = 他のファイルから受信しているシンボル数（型インポートは除外）' : '↑ = symbols exported to other files, ↓ = symbols imported from other files (type imports excluded)'}</td></tr>
            <tr><td><div style="display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid #66ddff;background:rgba(102,221,255,0.15);vertical-align:middle"></div></td><td>${isJa ? 'フローリング — シンボルの流れが多いノードに表示される青い光輪。フロー量に比例して明るくなります' : 'Flow ring — blue glow around nodes with high symbol flow. Brightness scales with flow amount'}</td></tr>
            <tr><td style="color:#556677">${isJa ? '石化ノード' : 'Petrified'}</td><td>${isJa ? 'シンボルの流れが無いファイルは灰色で半透明になります（データの受け渡しに関与していない）' : 'Files with no symbol flow are grayed out (not involved in data exchange)'}</td></tr>
        </table>

        <h3>⬢ ${isJa ? '分析モードの色分け線' : 'Analysis Mode Color-Coded Lines'}</h3>
        <p style="font-size:12px;color:#8899aa;margin:4px 0 8px">${isJa ? '分析モードではすべてのエッジが種別ごとに色分けされた実線で表示されます。線の太さと濃さはインポートされたシンボル数に比例します。ツールバーのフィルターボタン（分析モード時のみ表示）で種別ごとに表示/非表示を切り替えられます。' : 'In Analysis mode, all edges are drawn as solid color-coded lines by type. Line width and opacity scale with imported symbol count. Use filter buttons in the toolbar (visible only in Analysis mode) to toggle visibility per type.'}</p>
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
            <tr><td><div style="display:inline-block;width:40px;height:3px;background:#ff3333;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '循環参照 — 構造モードで赤く強調される相互依存のエッジ' : 'Circular dependency — mutual import edge highlighted red in Architecture mode'}</td></tr>
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

        <h3>🌌 ${isJa ? '銀河レイアウトの見方' : 'Galaxy Layout Guide'}</h3>
        <table>
            <tr><td><div style="display:inline-block;width:16px;height:16px;border-radius:50%;border:1.5px solid #4466cc;background:rgba(34,68,170,0.15);vertical-align:middle"></div></td><td>${isJa ? '中心 — エントリーポイント（最も多くの依存を発信するファイル、またはフォーカス中のノード）' : 'Center — entry point (file with most outgoing deps, or currently focused node)'}</td></tr>
            <tr><td>${isJa ? '内側のリング' : 'Inner rings'}</td><td>${isJa ? 'エントリーポイントから依存を辿って近いファイル。BFS深度が浅いほど中心に近い' : 'Files closer to the entry point by dependency. Shallower BFS depth = closer to center'}</td></tr>
            <tr><td>${isJa ? '外側のリング' : 'Outer rings'}</td><td>${isJa ? 'エントリーポイントから遠いファイル。依存チェーンが深い' : 'Files far from entry point. Deep dependency chains'}</td></tr>
            <tr><td style="color:#ff6666">${isJa ? '最外周' : 'Outermost rim'}</td><td>${isJa ? 'エントリーポイントから到達不能なファイル。デッドコードや孤立モジュールの可能性があります' : 'Files unreachable from entry point. Possibly dead code or isolated modules'}</td></tr>
        </table>

        <h3>🔍 ${isJa ? 'UI コンポーネント' : 'UI Components'}</h3>
        <table>
            <tr><td>${isJa ? 'パンくずリスト' : 'Breadcrumbs'}</td><td>${isJa ? '探索履歴をツールバー下に表示。クリックで過去のノードに戻れます。小画面では最大3つ＋省略表示' : 'Exploration history shown below toolbar. Click to revisit past nodes. Compressed to 3 items + ellipsis on small screens'}</td></tr>
            <tr><td>${isJa ? '探索軌跡' : 'Ghost Trail'}</td><td>${isJa ? 'パンくずに連動した探索履歴の視覚化。訪問済みノード間を点線で結び、古いほど薄く表示' : 'Visual trail following breadcrumbs. Dotted lines connect visited nodes, fading with age'}</td></tr>
            <tr><td>${isJa ? 'ミニマップ' : 'Minimap'}</td><td>${isJa ? '画面右下の全体俯瞰図。現在のビューポート位置を白い矩形で表示。クリックでその位置にジャンプ' : 'Overview map at bottom-right. Shows current viewport as a white rectangle. Click to jump to that position'}</td></tr>
            <tr><td>${isJa ? '検索バー' : 'Search Bar'}</td><td>${isJa ? 'Ctrl+F でファイル名をインクリメンタル検索。一致しないノードは透明化されます' : 'Ctrl+F for incremental file search. Non-matching nodes become transparent'}</td></tr>
            <tr><td>${isJa ? 'LOD 自動切替' : 'LOD Auto-Switch'}</td><td>${isJa ? 'ズームアウトすると LOD Far モードに自動切替。遠景ではノードがドットに簡略化され、型インポート線が非表示になります' : 'Auto-switches to LOD Far when zoomed out. Nodes become dots and type-import lines are hidden in Far mode'}</td></tr>
        </table>

        <h3>${t('help.legend')}</h3>
        <table>
            <tr><td><div class="help-legend-swatch" style="background:linear-gradient(90deg,#4488ff,#ff8844,#44ff88);display:inline-block;width:40px;height:12px;border-radius:3px;vertical-align:middle"></div></td><td>${isJa ? 'ノードの色 — ファイルパスのハッシュで自動決定。同じフォルダ内のファイルは似た色になります' : 'Node color — auto-assigned by file path hash. Files in the same folder have similar colors'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#66ddff;display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle"></div></td><td>${isJa ? 'フォーカスノード（Summon対象）— 中心に配置され、最も明るく表示' : 'Focus node (Summoned) — placed at center, displayed brightest'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#ff3333;display:inline-block;width:40px;height:3px;border-radius:2px;vertical-align:middle"></div></td><td>${isJa ? '循環参照エッジ — ファイル間の相互依存を示す赤い線（Architecture モードで目立つ）' : 'Circular dependency edge — red line showing mutual imports (prominent in Architecture mode)'}</td></tr>
            <tr><td><div class="help-legend-swatch" style="background:#556677;display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle"></div></td><td>${isJa ? '石化ノード — 現在のRuneモードで注目対象外のファイル。灰色で半透明に表示' : 'Petrified node — not relevant in current Rune mode. Shown gray and translucent'}</td></tr>
            <tr><td><div style="display:inline-block;width:40px;height:0;border-top:2px dashed #6688cc;vertical-align:middle"></div></td><td>${isJa ? '型インポート (type-import) — 青い点線で表示。ランタイムには影響しない型のみの依存' : 'Type-import — shown as blue dashed line. Type-only dependency with no runtime impact'}</td></tr>
            <tr><td style="font-size:14px">○ ◇ ⬡ △</td><td>${isJa ? 'ノードの形状 — 円=通常、四角=設定/パッケージ、六角=宣言ファイル、三角=外部モジュール' : 'Node shapes — circle=normal, square=config/package, hexagon=declaration, triangle=external'}</td></tr>
            <tr><td style="font-size:14px;color:#88aacc">大 ↔ 小</td><td>${isJa ? 'ノードのサイズ — ファイルの行数に比例。大きいほどコード量が多い' : 'Node size — proportional to file line count. Larger = more code'}</td></tr>
            <tr><td style="font-size:14px">━ ┄ ⤳ ⚡ ⇄</td><td>${isJa ? 'エッジフィルター — 分析モード時にツールバーに表示。エッジ種別ごとに表示/非表示を切り替え' : 'Edge filters — shown in toolbar during Analysis mode. Toggle visibility per edge type'}</td></tr>
        </table>
    `;
}
