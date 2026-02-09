import * as vscode from 'vscode';
// 作成する2つのモジュールをインポート
import { analyzeCode } from './analyzer.js';
import { getWebviewContent } from './webview.js';

export function activate(context: vscode.ExtensionContext) {
    let panel: vscode.WebviewPanel | undefined = undefined;

    // 1. 監視役: コードが変わるたびに解析を実行
    // コマンド登録の外に出すことで、二重登録を防ぎます
    vscode.workspace.onDidChangeTextDocument(event => {
        if (panel && event.document === vscode.window.activeTextEditor?.document) {
            const code = event.document.getText();
            
            // 脳（analyzer）に解析させる
            const spellData = analyzeCode(code, event.document.uri.fsPath);

            if (spellData) {
                // 顔（webview）にデータを送る
                panel.webview.postMessage({
                    type: 'CAST_MANA',
                    spellData: spellData
                });
            } else {
                // 解析不能なエラー
                panel.webview.postMessage({ type: 'BACKFIRE' });
            }
        }
    }, null, context.subscriptions);

    // 2. コマンド登録: 魔法陣を開く
    let disposable = vscode.commands.registerCommand('codegrimoire.openGrimoire', () => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.Two);
        } else {
            panel = vscode.window.createWebviewPanel(
                'grimoireView',
                'Code Grimoire',
                vscode.ViewColumn.Two,
                { enableScripts: true }
            );

            // 顔（webview）のHTMLを取得
            panel.webview.html = getWebviewContent();

            panel.webview.onDidReceiveMessage(async (message) => {
                if (message.command === 'jumpToCode' && message.fileName && panel) {
                    try {
                        const targetUri = vscode.Uri.file(message.fileName);
                        const doc = await vscode.workspace.openTextDocument(targetUri);
                        const editor = await vscode.window.showTextDocument(doc);
                        const line = Math.max((message.line || 1) - 1, 0);
                        const range = new vscode.Range(line, 0, line, 0);
                        editor.selection = new vscode.Selection(range.start, range.end);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    } catch (err) {
                        console.error('Jump failed', err);
                        vscode.window.showErrorMessage('Failed to jump to code location.');
                    }
                }
            }, undefined, context.subscriptions);

            // 開いた瞬間に現在のコードを解析して表示
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const spellData = analyzeCode(editor.document.getText(), editor.document.uri.fsPath);
                if (spellData) {
                    panel.webview.postMessage({ type: 'CAST_MANA', spellData });
                }
            }

            panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}