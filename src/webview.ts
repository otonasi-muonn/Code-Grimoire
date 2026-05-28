// ============================================================
// Code Grimoire - Webview HTML ホスト
// Extension 側で実行され、Webview 用の HTML を生成する
// ============================================================
import type { Webview, Uri } from 'vscode';

/**
 * Webview に表示する HTML を生成する。
 * @param webview - VS Code Webview インスタンス (CSP の nonce 生成に使用)
 * @param scriptUri - esbuild でバンドルされた Webview 用スクリプトの URI
 * @param workerUri - esbuild でバンドルされた Worker スクリプトの URI
 */
export function getWebviewContent(webview: Webview, scriptUri: Uri, workerUri: Uri): string {
    const nonce = getNonce();

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   img-src ${webview.cspSource} https: data:;
                   script-src 'nonce-${nonce}' 'unsafe-eval';
                   style-src 'unsafe-inline';
                   font-src ${webview.cspSource};
                   connect-src ${webview.cspSource};
                   worker-src blob:;">
    <title>Code Grimoire</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #080a18;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        }
        canvas {
            display: block;
        }
        /* ローディングオーバーレイ */
        #loading-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #080a18;
            z-index: 1200;
            transition: opacity 0.6s ease;
        }
        #loading-overlay.hidden {
            opacity: 0;
            pointer-events: none;
        }
        .loading-circle {
            width: 80px;
            height: 80px;
            border: 3px solid rgba(0, 220, 255, 0.15);
            border-top-color: rgba(0, 220, 255, 0.8);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        .loading-text {
            margin-top: 20px;
            color: rgba(0, 220, 255, 0.7);
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            letter-spacing: 0.5px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        /* ─── Search Overlay (V3 Phase 2) ──────────────── */
        #search-overlay {
            position: fixed;
            top: 0; left: 0; right: 0;
            display: flex;
            justify-content: center;
            padding-top: 12px;
            z-index: 900;
            pointer-events: none;
            opacity: 0;
            transform: translateY(-20px);
            transition: opacity 0.25s ease, transform 0.25s ease;
        }
        #search-overlay.visible {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }
        #search-input {
            width: min(360px, 80vw);
            padding: 8px 14px 8px 32px;
            background: rgba(10, 12, 28, 0.94);
            border: 1px solid rgba(100, 150, 255, 0.35);
            border-radius: 8px;
            color: #d0d8ff;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 13px;
            outline: none;
            backdrop-filter: blur(16px);
        }
        #search-input:focus {
            border-color: rgba(100, 200, 255, 0.7);
            box-shadow: 0 0 16px rgba(0, 180, 255, 0.18);
        }
        #search-input::placeholder {
            /* v2 改修 (a11y): 2.25:1 → WCAG 4.5:1 以上に引き上げ */
            color: rgba(140, 165, 210, 0.8);
        }
        .search-icon {
            position: absolute;
            left: calc(50% - 168px);
            top: 22px;
            color: rgba(100, 150, 255, 0.5);
            font-size: 14px;
            pointer-events: none;
        }
        #search-count {
            position: absolute;
            right: calc(50% - 168px);
            top: 22px;
            /* v2 改修 (a11y): 3.80:1 → WCAG 4.5:1 以上に引き上げ */
            color: rgba(120, 190, 255, 0.95);
            font-family: system-ui, sans-serif;
            font-size: 11px;
        }
        /* ─── Detail Panel (V3 Phase 3 + V5 Dual Typography) ── */
        #detail-panel {
            position: fixed;
            top: 0; right: 0; bottom: 0;
            width: min(340px, 85vw);
            background: rgba(6, 8, 22, 0.97);
            border-left: 1px solid rgba(100, 150, 255, 0.15);
            z-index: 800;
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow-y: auto;
            backdrop-filter: blur(20px);
            padding: 20px;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            color: #c8d0e8;
        }
        #detail-panel.visible {
            transform: translateX(0);
        }
        #detail-panel .dp-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(100, 150, 255, 0.12);
        }
        #detail-panel .dp-title {
            font-size: 15px;
            color: #88ccff;
            font-weight: 600;
            font-family: system-ui, -apple-system, sans-serif;
        }
        #detail-panel .dp-close {
            cursor: pointer;
            color: rgba(200, 200, 255, 0.5);
            font-size: 18px;
            line-height: 1;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.15s;
        }
        #detail-panel .dp-close:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
        }
        #detail-panel .dp-section {
            margin-bottom: 14px;
        }
        #detail-panel .dp-label {
            font-size: 10px;
            color: rgba(130, 170, 230, 0.7);
            text-transform: uppercase;
            letter-spacing: 1.2px;
            margin-bottom: 5px;
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 600;
        }
        #detail-panel .dp-value {
            font-size: 12px;
            color: #d8e0f4;
            line-height: 1.6;
            font-family: system-ui, -apple-system, sans-serif;
        }
        #detail-panel .dp-value.path {
            color: rgba(100, 180, 255, 0.85);
            word-break: break-all;
            font-family: Consolas, 'Courier New', monospace;
            font-size: 11px;
        }
        #detail-panel .dp-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            margin: 2px 4px 2px 0;
            background: rgba(100, 150, 255, 0.1);
            border: 1px solid rgba(100, 150, 255, 0.18);
            font-family: system-ui, sans-serif;
        }
        /* v2 改修 (レビュー): ノード hover ツールチップ。viewport ズームの影響を
           受けないよう HTML 側で実装。z-index は detail-panel(800) より上、
           help-overlay(950) より下に置く。 */
        #node-tooltip {
            position: fixed;
            pointer-events: none;
            background: rgba(10, 20, 40, 0.94);
            color: #d8e0f4;
            padding: 6px 10px;
            border: 1px solid rgba(120, 170, 240, 0.45);
            border-radius: 5px;
            font-size: 12px;
            font-family: system-ui, sans-serif;
            line-height: 1.5;
            z-index: 850;
            opacity: 0;
            transform: translateY(-4px);
            transition: opacity 0.15s ease, transform 0.15s ease;
            white-space: nowrap;
            max-width: 320px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
        }
        #node-tooltip.visible {
            opacity: 1;
            transform: translateY(0);
        }
        #node-tooltip .nt-title {
            font-weight: bold;
            color: #cfe8ff;
            font-size: 12px;
        }
        #node-tooltip .nt-meta {
            font-size: 11px;
            opacity: 0.85;
            margin-top: 2px;
        }
        .help-replay-btn {
            background: rgba(70, 130, 220, 0.18);
            border: 1px solid rgba(120, 170, 240, 0.45);
            color: #cde0ff;
            padding: 8px 16px;
            font-size: 13px;
            border-radius: 6px;
            cursor: pointer;
            font-family: system-ui, sans-serif;
            transition: background 0.15s, border-color 0.15s;
        }
        .help-replay-btn:hover {
            background: rgba(90, 150, 240, 0.32);
            border-color: rgba(150, 200, 255, 0.7);
        }
        #detail-panel .dp-warning {
            color: #ff8844;
            font-size: 11px;
            padding: 4px 0;
            border-left: 2px solid rgba(255, 136, 68, 0.4);
            padding-left: 8px;
            margin: 4px 0;
        }
        /* v2 改修 (レビュー): severity / hugeFileLevel の色を inline style から
           class に逃がし、CSS インジェクション境界を消す + 色弱対応の二重符号化
           (色 + アイコン + テキストラベル) を後押しする。
           背景 rgba(6,8,22,0.97) に対し全色 4.5:1 以上のコントラストを維持。 */
        #detail-panel .dp-warning.dp-severity-critical,
        #detail-panel .dp-warning.dp-huge-critical {
            color: #ff7777;
            font-weight: bold;
            border-left-color: rgba(255, 119, 119, 0.55);
        }
        #detail-panel .dp-warning.dp-severity-warning,
        #detail-panel .dp-warning.dp-huge-warning {
            color: #ffaa33;
            border-left-color: rgba(255, 170, 51, 0.5);
        }
        #detail-panel .dp-warning.dp-severity-info {
            color: #ffee66;
            border-left-color: rgba(255, 238, 102, 0.45);
        }
        #detail-panel .dp-dep-list {
            list-style: none;
            padding: 0;
            max-height: 200px;
            overflow-y: auto;
        }
        #detail-panel .dp-dep-list li {
            padding: 4px 0;
            font-size: 11px;
            color: rgba(180, 200, 255, 0.75);
            cursor: pointer;
            transition: color 0.15s, padding-left 0.15s;
        }
        #detail-panel .dp-dep-list li:hover {
            color: #88ccff;
            padding-left: 4px;
        }
        /* ─── Risk Meter (V5 Micrograph) ───────────────── */
        .dp-risk-meter {
            height: 6px;
            border-radius: 3px;
            background: rgba(255,255,255,0.06);
            overflow: hidden;
            margin: 6px 0 2px;
        }
        .dp-risk-meter-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.4s ease;
        }
        .dp-risk-low  .dp-risk-meter-fill { background: linear-gradient(90deg, #22cc66, #44ff88); }
        .dp-risk-mid  .dp-risk-meter-fill { background: linear-gradient(90deg, #ccaa22, #ffcc44); }
        .dp-risk-high .dp-risk-meter-fill { background: linear-gradient(90deg, #cc3322, #ff5544); }
        .dp-risk-label {
            font-size: 9px;
            color: rgba(180,200,240,0.6);
            font-family: system-ui, sans-serif;
        }
        /* ─── Activity Bar (V5 Micrograph) ─────────────── */
        .dp-activity-bar {
            display: flex;
            align-items: flex-end;
            gap: 2px;
            height: 24px;
            margin: 6px 0 2px;
        }
        .dp-activity-bar .bar {
            width: 6px;
            border-radius: 2px 2px 0 0;
            min-height: 2px;
            transition: height 0.3s ease;
        }
        /* ─── Detail Panel Action Buttons (V6) ─────────── */
        .dp-actions {
            display: flex;
            gap: 4px;
            margin-right: 8px;
        }
        .dp-action-btn {
            background: rgba(100, 150, 255, 0.08);
            border: 1px solid rgba(100, 150, 255, 0.2);
            border-radius: 5px;
            color: #88bbff;
            font-size: 13px;
            padding: 3px 8px;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s;
            line-height: 1;
        }
        .dp-action-btn:hover {
            background: rgba(100, 150, 255, 0.2);
            border-color: rgba(100, 180, 255, 0.5);
            color: #fff;
        }
        /* ─── Help Overlay (V6 Phase 4) ────────────────── */
        #help-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 950;
            background: rgba(4, 6, 18, 0.85);
            backdrop-filter: blur(12px);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.25s ease;
        }
        #help-overlay.visible {
            opacity: 1;
            pointer-events: auto;
        }
        .help-card {
            background: rgba(10, 14, 32, 0.95);
            border: 1px solid rgba(100, 150, 255, 0.2);
            border-radius: 12px;
            padding: 28px 34px;
            max-width: 640px;
            width: min(92%, 92vw);
            max-height: 80vh;
            overflow-y: auto;
            color: #c8d0e8;
            font-family: system-ui, -apple-system, sans-serif;
        }
        .help-card h2 {
            font-size: 16px;
            color: #88ccff;
            margin-bottom: 16px;
            font-weight: 600;
        }
        .help-card h3 {
            font-size: 12px;
            color: rgba(130, 170, 230, 0.7);
            text-transform: uppercase;
            letter-spacing: 1.2px;
            margin: 14px 0 6px;
            font-weight: 600;
        }
        .help-card table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .help-card td {
            padding: 3px 8px;
            vertical-align: top;
        }
        .help-card td:first-child {
            color: #88bbff;
            font-family: Consolas, 'Courier New', monospace;
            white-space: nowrap;
            width: 120px;
        }
        .help-card td:last-child {
            color: rgba(200, 210, 240, 0.8);
        }
        .help-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 6px;
        }
        .help-legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
        }
        .help-legend-swatch {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }
        .help-close {
            position: absolute;
            top: 16px;
            right: 16px;
            cursor: pointer;
            color: rgba(200, 200, 255, 0.5);
            font-size: 20px;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.15s;
        }
        .help-close:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
        }
        /* ─── Code Peek (V3.5 + V5 Dual Typography) ───── */
        #detail-panel .dp-code-peek {
            background: rgba(4, 6, 16, 0.95);
            border: 1px solid rgba(100, 150, 255, 0.1);
            border-radius: 6px;
            padding: 12px;
            overflow-x: auto;
            max-height: 320px;
            overflow-y: auto;
            position: relative;
        }
        #detail-panel .dp-code-peek pre {
            margin: 0;
            font-family: Consolas, 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.5;
            color: #c0c8e0;
            white-space: pre;
            tab-size: 4;
        }
        #detail-panel .dp-code-peek .cp-line-nums {
            position: absolute;
            top: 12px; left: 12px;
            /* v2 改修 (a11y): 1.36:1 (実質判読不能) → WCAG 基準へ。会場プロジェクタ対策 */
            color: rgba(140, 165, 210, 0.8);
            font-family: Consolas, 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.5;
            text-align: right;
            user-select: none;
            pointer-events: none;
        }
        #detail-panel .dp-code-peek pre code {
            padding-left: 40px;
            display: block;
        }
        /* 簡易構文ハイライト色 */
        .hl-keyword { color: #c586c0; }
        .hl-string { color: #ce9178; }
        .hl-comment { color: #6a9955; }
        .hl-type { color: #4ec9b0; }
        .hl-number { color: #b5cea8; }
        .dp-code-loading {
            color: rgba(100, 180, 255, 0.5);
            font-size: 11px;
            padding: 8px;
            font-style: italic;
        }
        /* ─── Onboarding Tooltip (v2: T-08) ─────────────── */
        /* WCAG 2.2 コントラスト比: 背景 rgba(10,14,32,0.96) vs 文字 #d8e0f4 = 13.4:1 (AAA) */
        #onboarding-tooltip {
            position: fixed;
            right: 20px;
            bottom: 80px;
            width: 320px;
            padding: 16px 18px 14px;
            background: rgba(10, 14, 32, 0.96);
            border: 1px solid rgba(100, 150, 255, 0.35);
            border-radius: 10px;
            color: #d8e0f4;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            font-size: 13px;
            line-height: 1.6;
            z-index: 1100;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(16px);
            display: none;
        }
        #onboarding-tooltip::before {
            content: '✦ ツアー';
            display: block;
            font-size: 11px;
            color: rgba(100, 180, 255, 0.7);
            letter-spacing: 1.2px;
            text-transform: uppercase;
            margin-bottom: 8px;
            font-weight: 600;
        }
        #ob-text {
            margin-bottom: 14px;
            color: #d8e0f4;
        }
        #ob-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #ob-progress {
            font-size: 11px;
            color: rgba(180, 200, 240, 0.6);
            font-family: Consolas, monospace;
        }
        #ob-skip, #ob-next {
            background: rgba(100, 150, 255, 0.12);
            border: 1px solid rgba(100, 150, 255, 0.3);
            border-radius: 5px;
            color: #d8e0f4;
            font-size: 12px;
            padding: 5px 12px;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s;
            margin-left: 6px;
            font-family: inherit;
        }
        #ob-skip:hover {
            background: rgba(255, 255, 255, 0.08);
        }
        #ob-next {
            background: rgba(100, 200, 255, 0.2);
            border-color: rgba(100, 200, 255, 0.5);
            color: #fff;
            font-weight: 600;
        }
        #ob-next:hover {
            background: rgba(100, 200, 255, 0.32);
        }
    </style>
</head>
<body>
    <div id="loading-overlay">
        <div class="loading-circle"></div>
        <div class="loading-text">⟐ 魔方陣を構築中… 依存関係を解析しています</div>
    </div>
    <!-- Search Overlay (V3 Phase 2) -->
    <div id="search-overlay">
        <span class="search-icon">🔍</span>
        <input id="search-input" type="text" placeholder="Search files... (Ctrl+F)" autocomplete="off" spellcheck="false" />
        <span id="search-count"></span>
    </div>
    <!-- Detail Panel (V3 Phase 3) -->
    <div id="detail-panel">
        <div class="dp-header">
            <span class="dp-title" id="dp-title">—</span>
            <span class="dp-close" id="dp-close">✕</span>
        </div>
        <div id="dp-content"></div>
    </div>
    <!-- Hover Tooltip (v2: レビュー) -->
    <div id="node-tooltip" aria-hidden="true"></div>
    <!-- Help Overlay (V6 Phase 4) -->
    <div id="help-overlay">
        <span class="help-close" id="help-close">✕</span>
        <div class="help-card" id="help-card"></div>
    </div>
    <!-- Onboarding Tooltip (v2: T-08) — 初回起動時のみ表示 -->
    <div id="onboarding-tooltip">
        <div id="ob-text"></div>
        <div id="ob-footer">
            <span id="ob-progress">1 / 5</span>
            <div>
                <button id="ob-skip">スキップ</button>
                <button id="ob-next">次へ →</button>
            </div>
        </div>
    </div>
    <script nonce="${nonce}" data-worker-uri="${workerUri}" src="${scriptUri}"></script>
</body>
</html>`;
}

/** CSP用の暗号学的ランダムな nonce を生成 */
function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}