import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    let panel: vscode.WebviewPanel | undefined = undefined;

    // コマンドの登録（package.jsonのcommand名と一致させる必要があります）
    let disposable = vscode.commands.registerCommand('codegrimoire.openGrimoire', () => {
        if (panel) {
            // すでに開いている場合は表示する
            panel.reveal(vscode.ViewColumn.Two);
        } else {
            // 右側にWebViewパネルを作成
            panel = vscode.window.createWebviewPanel(
                'grimoireView',      // 識別子
                'Magic Circle',      // タブのタイトル
                vscode.ViewColumn.Two, // 表示場所（右側）
                { enableScripts: true } // JavaScriptを有効化
            );

            // WebViewの中身（HTML/p5.js）をセット
            panel.webview.html = getWebviewContent();

            // 詠唱（タイピング）を監視する
            vscode.workspace.onDidChangeTextDocument(event => {
                if (panel && event.document === vscode.window.activeTextEditor?.document) {
                    const code = event.document.getText();
                    
                    // WebViewへ「魔力データ」を送信
                    panel.webview.postMessage({
                        type: 'CAST_MANA',
                        lineCount: event.document.lineCount,
                        charCount: code.length,
                        // 'if' や 'for' が含まれているか簡易チェック
                        hasLogic: code.includes('if') || code.includes('for') || code.includes('while')
                    });
                }
            }, null, context.subscriptions);

            // パネルが閉じられた時のクリーンアップ
            panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
        }
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent() {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js"></script>
            <style>
                body { margin: 0; overflow: hidden; background: #0a0a1a; }
            </style>
        </head>
        <body>
            <script>
                // 魔導書の状態を保持する変数
                let manaLevel = 0;
                let circleCount = 1;
                let isRadiating = false;

                // 拡張機能からのメッセージを受け取る
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'CAST_MANA') {
                        manaLevel = message.charCount;
                        circleCount = Math.min(message.lineCount, 10); // 行数で円を増やす（最大10）
                        isRadiating = message.hasLogic; // ロジックがあれば輝かせる
                    }
                });

                function setup() {
                    createCanvas(windowWidth, windowHeight);
                }
                function draw() {
                    background(10, 10, 26);
                    noFill();
                    
                    // 魔力（文字数）に応じて回転速度を変える
                    let speed = 0.01 + (manaLevel * 0.0001);
                    
                    translate(width/2, height/2);
                    
                    // 行数（circleCount）の分だけ多重円を描く
                    for(let i = 0; i < circleCount; i++) {
                        push();
                        rotate(frameCount * speed * (i + 1) * 0.2);
                        stroke(0, 200, 255, 150 - (i * 10));
                        
                        // ロジック（if/for）がある時は線を太く、輝かせる
                        if (isRadiating) {
                            strokeWeight(3);
                            drawingContext.shadowBlur = 15;
                            drawingContext.shadowColor = 'cyan';
                        } else {
                            strokeWeight(2);
                            drawingContext.shadowBlur = 0;
                        }
                        
                        ellipse(0, 0, 100 + (i * 30));
                        if(i % 2 === 0) rect(-50, -50, 100, 100);
                        pop();
                    }
                }
            </script>
        </body>
        </html>
    `;
}

export function deactivate() {}