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
