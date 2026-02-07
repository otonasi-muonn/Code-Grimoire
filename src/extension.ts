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
                function setup() {
                    createCanvas(windowWidth, windowHeight);
                }
                function draw() {
                    background(10, 10, 26);
                    noFill();
                    strokeWeight(2);
                    
                    let centerX = width / 2;
                    let centerY = height / 2;

                    // 拍動するメインの円（魔力の核）
                    stroke(0, 200, 255, 150);
                    ellipse(centerX, centerY, 200 + sin(frameCount * 0.05) * 15);
                    
                    // 外側の回転する飾り円
                    push();
                    translate(centerX, centerY);
                    rotate(frameCount * 0.01);
                    stroke(0, 200, 255, 80);
                    rectMode(CENTER);
                    rect(0, 0, 150, 150); // 魔法陣っぽさを出す矩形
                    pop();

                    stroke(0, 200, 255, 40);
                    ellipse(centerX, centerY, 250 + cos(frameCount * 0.03) * 10);
                }
            </script>
        </body>
        </html>
    `;
}

export function deactivate() {}