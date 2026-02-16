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
    </style>
</head>
<body>
    <div id="loading-overlay">
        <div class="loading-circle"></div>
        <div class="loading-text">⟐ Summoning the Magic Circle...</div>
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