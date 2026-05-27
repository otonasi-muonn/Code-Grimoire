// ============================================================
// Code Grimoire - Extension 本体 (VS Code Extension Host)
// ============================================================
import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeWorkspace } from './analyzer.js';
import { runRipgrepSearch } from './ripgrep-search.js';
import { getWebviewContent } from './webview.js';
import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    DependencyGraph,
} from './shared/types.js';
import * as fs from 'fs';

/** v2 改修 (T-08): オンボーディングツアー表示済みフラグの globalState キー */
const ONBOARDING_SHOWN_KEY = 'codegrimoire.onboardingShown.v1';

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
    /** 進行中の ripgrep 検索を中断するための AbortController */
    let activeSearchAbort: AbortController | null = null;

    // ─── ワークスペースルート取得 ────────────────────────
    const getWorkspaceRoot = (): string | undefined => {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    };

    // ─── 解析実行 & Webview へ送信 ──────────────────────
    const runAnalysis = async () => {
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
                // v2 改修: require() は Node のモジュールキャッシュに残るため、
                // loadDemo で別フォルダに切り替えた後も古い package.json が返り続ける問題があった。
                // fs.readFileSync + JSON.parse で毎回読み直す。
                const pkgRaw = fs.readFileSync(packageJsonPath, 'utf-8');
                const pkg = JSON.parse(pkgRaw);
                projectName = pkg.displayName || pkg.name || projectName;
            } catch { /* package.json が無い場合は無視 */ }

            // v2 改修 (T-08): オンボーディング表示済みフラグを同梱
            const onboardingShown = context.globalState.get<boolean>(ONBOARDING_SHOWN_KEY, false);

            // ファイル数の簡易カウント
            sendMessage({
                type: 'INSTANT_STRUCTURE',
                payload: {
                    projectName,
                    rootPath: root,
                    fileCount: 0, // 後で更新
                    language: vscode.env.language,
                    onboardingShown,
                },
            });

            // Phase 2: 完全なグラフ解析
            const graph = await analyzeWorkspace(root);
            cachedGraph = graph;

            // ファイル数を反映して再送 (onboardingShown は同じ値を維持)
            sendMessage({
                type: 'INSTANT_STRUCTURE',
                payload: {
                    projectName,
                    rootPath: root,
                    fileCount: graph.nodes.length,
                    language: vscode.env.language,
                    onboardingShown,
                },
            });

            sendMessage({
                type: 'GRAPH_DATA',
                payload: graph,
            });

            console.log(`[Code Grimoire] Analysis complete: ${graph.nodes.length} nodes, ${graph.edges.length} edges (${graph.analysisTimeMs}ms)`);
        } catch (err: any) {
            console.error('[Code Grimoire] Analysis error:', err);
            const message = err?.message || String(err);
            sendMessage({ type: 'ANALYSIS_ERROR', payload: { message } });
            // v2 改修 (レビュー): webview の通知だけだと展示来場者には届きにくいので
            // VS Code のステータス通知にも出し、「再試行」で再解析を即起動できるようにする。
            const retry = '再試行';
            vscode.window.showErrorMessage(
                `Code Grimoire: 解析に失敗しました — ${message}`,
                retry,
            ).then(choice => {
                if (choice === retry && panel) {
                    runAnalysisGuarded();
                }
            });
        }
    };

    // ─── 型安全なメッセージ送信 ──────────────────────────
    const sendMessage = (msg: ExtensionToWebviewMessage) => {
        panel?.webview.postMessage(msg);
    };

    // ─── ファイル変更の監視 → 自動再解析 ─────────────────
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx}');
    const debounceTimer = { handle: undefined as ReturnType<typeof setTimeout> | undefined };

    // v2 改修 (レビュー): 解析時間が 1.5s デバウンスを超えるリポで連続編集すると
    // runAnalysis が並走して CPU / 描画が荒れる。in-flight + pending の 2 段ガードで
    // 「走行中は新規をスキップし、完了後に最新変更を 1 回だけ追従」を保証する。
    let analysisInFlight = false;
    let analysisPending = false;

    const runAnalysisGuarded = async () => {
        if (analysisInFlight) { analysisPending = true; return; }
        analysisInFlight = true;
        try {
            await runAnalysis();
        } finally {
            analysisInFlight = false;
            if (analysisPending) {
                analysisPending = false;
                scheduleReanalysis();
            }
        }
    };

    const scheduleReanalysis = () => {
        if (debounceTimer.handle) { clearTimeout(debounceTimer.handle); }
        debounceTimer.handle = setTimeout(() => {
            if (panel) { runAnalysisGuarded(); }
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
                case 'ONBOARDING_DISMISS': {
                    // v2 改修 (T-08): オンボーディング完了/スキップを globalState に永続化
                    await context.globalState.update(ONBOARDING_SHOWN_KEY, true);
                    break;
                }
                case 'SEARCH_CONTENT_REQUEST': {
                    const { query, requestId } = message.payload;
                    const root = getWorkspaceRoot();
                    const trimmed = query.trim();

                    // 進行中の検索を中断
                    activeSearchAbort?.abort();

                    // 空クエリやワークスペース未開時は空応答 (UI 側で打ち消し)
                    if (!root || !trimmed || !cachedGraph) {
                        sendMessage({
                            type: 'SEARCH_CONTENT_RESPONSE',
                            payload: { requestId, query, matchedNodeIds: [], truncated: false },
                        });
                        break;
                    }

                    const ac = new AbortController();
                    activeSearchAbort = ac;

                    const { matches, truncated } = await runRipgrepSearch(trimmed, root, ac.signal);

                    // キャンセル済みなら結果を送らない (古い検索の応答が後着するのを防ぐ)
                    if (ac.signal.aborted) { break; }

                    // 絶対パス → nodeId のマップを作成して照合 (Windows/POSIX 区切り違いを正規化)
                    const norm = (p: string) => path.normalize(p).replace(/\\/g, '/').toLowerCase();
                    const pathToId = new Map<string, string>();
                    for (const node of cachedGraph.nodes) {
                        pathToId.set(norm(node.filePath), node.id);
                    }
                    // ripgrep は相対パスを返すことがあるので、workspaceRoot からの絶対パスでも試行する
                    const matchedNodeIds: string[] = [];
                    for (const matchPath of matches) {
                        const directKey = norm(matchPath);
                        const absKey = norm(path.resolve(root, matchPath));
                        const id = pathToId.get(directKey) ?? pathToId.get(absKey);
                        if (id) { matchedNodeIds.push(id); }
                    }

                    sendMessage({
                        type: 'SEARCH_CONTENT_RESPONSE',
                        payload: { requestId, query, matchedNodeIds, truncated },
                    });
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

    // ─── コマンド登録: デモプロジェクト切替 ─────────────────
    // 展示・デモ用途。settings.json の `codegrimoire.demoPresets` で
    // 事前登録した複数プロジェクトを QuickPick で即時切替する。
    interface DemoPreset {
        name: string;
        path: string;
    }
    const loadDemoDisposable = vscode.commands.registerCommand('codegrimoire.loadDemo', async () => {
        const presets = vscode.workspace.getConfiguration('codegrimoire')
            .get<DemoPreset[]>('demoPresets', []);

        if (!presets || presets.length === 0) {
            vscode.window.showInformationMessage(
                'No demo presets configured. Add them in settings.json under "codegrimoire.demoPresets".'
            );
            return;
        }

        const items = presets.map(p => ({
            label: p.name,
            description: p.path,
            preset: p,
        }));

        const choice = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select demo project to open',
            matchOnDescription: true,
        });

        if (!choice) {
            return; // ユーザーキャンセル
        }

        // パスの存在確認（展示中の不在パス事故を防ぐ）
        try {
            const stat = fs.statSync(choice.preset.path);
            if (!stat.isDirectory()) {
                vscode.window.showErrorMessage(
                    `Demo preset path is not a directory: ${choice.preset.path}`
                );
                return;
            }
        } catch (err) {
            vscode.window.showErrorMessage(
                `Demo preset path does not exist: ${choice.preset.path}`
            );
            return;
        }

        // v2 改修 (レビュー指摘): フォルダ切替前に既存パネルを明示的に dispose する。
        // openFolder が拡張ホストを再起動しない場合でも、旧グラフが残らないようクリーンアップ。
        if (panel) {
            panel.dispose();
        }

        // 現ウィンドウで開く（デモ中のウィンドウ切替を回避）
        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(choice.preset.path),
            { forceNewWindow: false }
        );
    });
    context.subscriptions.push(loadDemoDisposable);
}

export function deactivate() {}