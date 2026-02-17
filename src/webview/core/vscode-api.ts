// ─── VS Code API ────────────────────────────────────────
import type { WebviewToExtensionMessage } from '../../shared/types.js';

// @ts-expect-error acquireVsCodeApi は Webview 内でのみ利用可能
export const vscode = acquireVsCodeApi();

export function sendMessage(msg: WebviewToExtensionMessage) {
    vscode.postMessage(msg);
}
