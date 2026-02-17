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
            background: #0a0c1e;
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
            background: #0a0c1e;
            z-index: 1000;
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
            font-family: Consolas, 'Courier New', monospace;
            font-size: 14px;
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
            width: 360px;
            padding: 8px 14px 8px 32px;
            background: rgba(15, 18, 40, 0.92);
            border: 1px solid rgba(100, 150, 255, 0.35);
            border-radius: 8px;
            color: #d0d8ff;
            font-family: Consolas, 'Courier New', monospace;
            font-size: 13px;
            outline: none;
            backdrop-filter: blur(10px);
        }
        #search-input:focus {
            border-color: rgba(100, 200, 255, 0.7);
            box-shadow: 0 0 12px rgba(0, 180, 255, 0.15);
        }
        #search-input::placeholder {
            color: rgba(100, 140, 200, 0.5);
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
            color: rgba(100, 180, 255, 0.6);
            font-family: Consolas, monospace;
            font-size: 11px;
        }
        /* ─── Detail Panel (V3 Phase 3) ────────────────── */
        #detail-panel {
            position: fixed;
            top: 0; right: 0; bottom: 0;
            width: 340px;
            background: rgba(10, 14, 32, 0.95);
            border-left: 1px solid rgba(100, 150, 255, 0.2);
            z-index: 800;
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow-y: auto;
            backdrop-filter: blur(12px);
            padding: 20px;
            font-family: Consolas, 'Courier New', monospace;
            color: #c0c8e0;
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
            border-bottom: 1px solid rgba(100, 150, 255, 0.15);
        }
        #detail-panel .dp-title {
            font-size: 15px;
            color: #88ccff;
            font-weight: normal;
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
            color: rgba(120, 160, 220, 0.6);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
        }
        #detail-panel .dp-value {
            font-size: 12px;
            color: #d0d8ff;
            line-height: 1.5;
        }
        #detail-panel .dp-value.path {
            color: rgba(100, 180, 255, 0.8);
            word-break: break-all;
        }
        #detail-panel .dp-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            margin: 2px 4px 2px 0;
            background: rgba(100, 150, 255, 0.12);
            border: 1px solid rgba(100, 150, 255, 0.2);
        }
        #detail-panel .dp-warning {
            color: #ff8844;
            font-size: 11px;
            padding: 4px 0;
            border-left: 2px solid rgba(255, 136, 68, 0.4);
            padding-left: 8px;
            margin: 4px 0;
        }
        #detail-panel .dp-dep-list {
            list-style: none;
            padding: 0;
            max-height: 200px;
            overflow-y: auto;
        }
        #detail-panel .dp-dep-list li {
            padding: 3px 0;
            font-size: 11px;
            color: rgba(180, 200, 255, 0.7);
            cursor: pointer;
            transition: color 0.15s;
        }
        #detail-panel .dp-dep-list li:hover {
            color: #88ccff;
        }
    </style>
</head>
<body>
    <div id="loading-overlay">
        <div class="loading-circle"></div>
        <div class="loading-text">⟐ Summoning the Magic Circle...</div>
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