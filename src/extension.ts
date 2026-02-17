// ============================================================
// Code Grimoire - Extension 本体 (VS Code Extension Host)
// ============================================================
import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeWorkspace } from './analyzer.js';
import { getWebviewContent } from './webview.js';
import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    DependencyGraph,
} from './shared/types.js';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    // ─── ASCII Art Banner ───────────────────────────────
    console.log(`
\x1b[36m
   ╔═══════════════════════════════════════════╗
   ║                                           ║
   ║     ✦  C O D E   G R I M O I R E  ✦     ║
   ║                                           ║
   ║   ◇ ─── ⬡ ─── ⚠ ─── ⚡ ─── 🔥 ───  ◇   ║
   ║                                           ║
   ║    Visualize your code as a magic circle  ║
   ║                                           ║
   ╚═══════════════════════════════════════════╝
\x1b[0m`);

    let panel: vscode.WebviewPanel | undefined = undefined;
    let cachedGraph: DependencyGraph | undefined = undefined;

    // ─── ワークスペースルート取得 ────────────────────────
    const getWorkspaceRoot = (): string | undefined => {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    };

    // ─── 解析実行 & Webview へ送信 ──────────────────────
    const runAnalysis = () => {
        if (!panel) { return; }

        const root = getWorkspaceRoot();
        if (!root) {
            sendMessage({ type: 'ANALYSIS_ERROR', payload: { message: 'No workspace folder open.' } });
            return;
        }

        try {
            // Phase 1: Instant Structure（即時構造）
            const packageJsonPath = path.join(root, 'package.json');
            let projectName = path.basename(root);
            try {
                const pkg = require(packageJsonPath);
                projectName = pkg.displayName || pkg.name || projectName;
            } catch { /* package.json が無い場合は無視 */ }

            // ファイル数の簡易カウント
            sendMessage({
                type: 'INSTANT_STRUCTURE',
                payload: {
                    projectName,
                    rootPath: root,
                    fileCount: 0, // 後で更新
                    language: vscode.env.language,
                },
            });

            // Phase 2: 完全なグラフ解析
            const graph = analyzeWorkspace(root);
            cachedGraph = graph;

            // ファイル数を反映して再送
            sendMessage({
                type: 'INSTANT_STRUCTURE',
                payload: {
                    projectName,
                    rootPath: root,
                    fileCount: graph.nodes.length,
                    language: vscode.env.language,
                },
            });

            sendMessage({
                type: 'GRAPH_DATA',
                payload: graph,
            });

            console.log(`[Code Grimoire] Analysis complete: ${graph.nodes.length} nodes, ${graph.edges.length} edges (${graph.analysisTimeMs}ms)`);
        } catch (err: any) {
            console.error('[Code Grimoire] Analysis error:', err);
            sendMessage({ type: 'ANALYSIS_ERROR', payload: { message: err.message || String(err) } });
        }
    };

    // ─── 型安全なメッセージ送信 ──────────────────────────
    const sendMessage = (msg: ExtensionToWebviewMessage) => {
        panel?.webview.postMessage(msg);
    };

    // ─── ファイル変更の監視 → 自動再解析 ─────────────────
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx}');
    const debounceTimer = { handle: undefined as ReturnType<typeof setTimeout> | undefined };

    const scheduleReanalysis = () => {
        if (debounceTimer.handle) { clearTimeout(debounceTimer.handle); }
        debounceTimer.handle = setTimeout(() => {
            if (panel) { runAnalysis(); }
        }, 1500); // 1.5秒のデバウンス
    };

    watcher.onDidChange(scheduleReanalysis);
    watcher.onDidCreate(scheduleReanalysis);
    watcher.onDidDelete(scheduleReanalysis);
    context.subscriptions.push(watcher);

    // ─── コマンド登録: 魔法陣を開く ──────────────────────
    const disposable = vscode.commands.registerCommand('codegrimoire.openGrimoire', () => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        panel = vscode.window.createWebviewPanel(
            'grimoireView',
            'Code Grimoire',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'out'),
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                ],
            }
        );

        // Webview にスクリプトの URI を渡してHTMLを生成
        const webviewScriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'main.js')
        );
        const workerScriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'worker.js')
        );
        panel.webview.html = getWebviewContent(panel.webview, webviewScriptUri, workerScriptUri);

        // ─── Webview → Extension メッセージ受信 ─────────
        panel.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
            switch (message.type) {
                case 'JUMP_TO_FILE': {
                    try {
                        const targetUri = vscode.Uri.file(message.payload.filePath);
                        const doc = await vscode.workspace.openTextDocument(targetUri);
                        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                        const line = Math.max((message.payload.line || 1) - 1, 0);
                        const range = new vscode.Range(line, 0, line, 0);
                        editor.selection = new vscode.Selection(range.start, range.end);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    } catch (err) {
                        console.error('[Code Grimoire] Jump failed:', err);
                        vscode.window.showErrorMessage('Failed to jump to code location.');
                    }
                    break;
                }
                case 'FOCUS_NODE': {
                    // Summoning: フォーカスノード変更の通知を受信
                    console.log('[Code Grimoire] Focus node:', message.payload.nodeId);
                    // 現時点では Worker 側で完結するのでログのみ
                    // 将来的にフォーカス中心の再解析を実装可能
                    break;
                }
                case 'REQUEST_ANALYSIS': {
                    runAnalysis();
                    break;
                }
                case 'RUNE_MODE_CHANGE': {
                    console.log('[Code Grimoire] Rune mode:', message.payload.mode);
                    break;
                }
                case 'CODE_PEEK_REQUEST': {
                    const { filePath, maxLines } = message.payload;
                    const lines = maxLines || 50;
                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const allLines = content.split('\n');
                        const code = allLines.slice(0, lines).join('\n');
                        const ext = path.extname(filePath).replace('.', '');
                        const langMap: Record<string, string> = {
                            ts: 'typescript', tsx: 'typescript',
                            js: 'javascript', jsx: 'javascript',
                            json: 'json', md: 'markdown',
                            css: 'css', scss: 'scss', html: 'html',
                        };
                        sendMessage({
                            type: 'CODE_PEEK_RESPONSE',
                            payload: {
                                filePath,
                                code,
                                totalLines: allLines.length,
                                language: langMap[ext] || ext || 'plaintext',
                            },
                        });
                    } catch (err: any) {
                        console.error('[Code Grimoire] Code Peek error:', err);
                        sendMessage({
                            type: 'CODE_PEEK_RESPONSE',
                            payload: {
                                filePath,
                                code: `// Error reading file: ${err.message || err}`,
                                totalLines: 0,
                                language: 'plaintext',
                            },
                        });
                    }
                    break;
                }
            }
        }, undefined, context.subscriptions);

        // パネルが閉じられたときのクリーンアップ
        panel.onDidDispose(() => {
            panel = undefined;
            cachedGraph = undefined;
        }, null, context.subscriptions);

        // 初回解析の実行
        runAnalysis();
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}