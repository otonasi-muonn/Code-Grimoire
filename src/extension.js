"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
var vscode = require("vscode");
var acornLoose = require("acorn-loose"); // 追加
function activate(context) {
    var panel = undefined;
    // 監視役をコマンドの外に出す（二重登録防止）
    vscode.workspace.onDidChangeTextDocument(function (event) {
        var _a;
        if (panel && event.document === ((_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.document)) {
            var code = event.document.getText();
            try {
                // acorn-loose を使って、不完全なコードや型定義があっても強引に解析
                var ast = acornLoose.parse(code, { ecmaVersion: 2020 });
                var spellData = analyzeSpell(ast);
                panel.webview.postMessage({
                    type: 'CAST_MANA',
                    spellData: spellData
                });
            }
            catch (e) {
                // looseを使えば基本ここには来ないが、念のため
                panel.webview.postMessage({ type: 'BACKFIRE' });
            }
        }
    }, null, context.subscriptions);
    // コマンドの登録（package.jsonのcommand名と一致させる必要があります）
    var disposable = vscode.commands.registerCommand('codegrimoire.openGrimoire', function () {
        if (panel) {
            // すでに開いている場合は表示する
            panel.reveal(vscode.ViewColumn.Two);
        }
        else {
            // 右側にWebViewパネルを作成
            panel = vscode.window.createWebviewPanel('grimoireView', // 識別子
            'Magic Circle', // タブのタイトル
            vscode.ViewColumn.Two, // 表示場所（右側）
            { enableScripts: true } // JavaScriptを有効化
            );
            // WebViewの中身（HTML/p5.js）をセット
            panel.webview.html = getWebviewContent();
            // パネルが閉じられた時のクリーンアップ
            panel.onDidDispose(function () { panel = undefined; }, null, context.subscriptions);
        }
    });
    context.subscriptions.push(disposable);
}
function getWebviewContent() {
    return "\n        <!DOCTYPE html>\n        <html>\n        <head>\n            <script src=\"https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js\"></script>\n            <style>\n                body { margin: 0; overflow: hidden; background: #0a0a1a; }\n            </style>\n        </head>\n        <body>\n            <script>\n                // \u8853\u5F0F\u30C7\u30FC\u30BF\u3068\u72B6\u614B\n                let currentSpell = { loops: 1, conditions: 0, variables: 1, depth: 1 };\n                let isCorrupted = false;\n\n                // \u62E1\u5F35\u6A5F\u80FD\u304B\u3089\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u53D7\u3051\u53D6\u308B\n                window.addEventListener('message', event => {\n                    const msg = event.data;\n                    if (msg.type === 'CAST_MANA') {\n                        const s = msg.spellData || { loops: 0, conditions: 0, variables: 0, depth: 0 };\n                        currentSpell = s;\n                        isCorrupted = false;\n                    } else if (msg.type === 'BACKFIRE') {\n                        isCorrupted = true;\n                    }\n                });\n\n                function setup() {\n                    createCanvas(windowWidth, windowHeight);\n                }\n\n                function drawBackfire() {\n                    background(60, 0, 0);\n                    fill(150, 0, 0, 50);\n                    for (let i = 0; i < 200; i++) {\n                        rect(random(width), random(height), random(2, 8), random(2, 8));\n                    }\n                }\n\n                function drawMagicCircle(s) {\n                    push();\n                    translate(width/2, height/2);\n\n                    // \u30CD\u30B9\u30C8\u306E\u6DF1\u3055\uFF08depth\uFF09\u306B\u5FDC\u3058\u3066\u9B54\u6CD5\u9663\u3092\u300C\u4E09\u6B21\u5143\u7684\u300D\u306B\u56DE\u8EE2\u3055\u305B\u308B\n                    let rotationZ = frameCount * 0.01;\n                    let rotationX = map(s.depth || 1, 1, 10, 0, PI/3); // \u6DF1\u3044\u307B\u3069\u50BE\u304F\n                    rotate(rotationZ);\n                    shearX(rotationX * 0.3); // \u8EFD\u304F\u50BE\u3051\u3066\u7ACB\u4F53\u611F\u3092\u6F14\u51FA\n\n                    // \u5F71\u306E\u6F14\u51FA\n                    drawingContext.shadowBlur = 20;\n                    drawingContext.shadowColor = 'cyan';\n\n                    // 3\u306E\u500D\u6570\u306E\u6642\u306B\u3060\u3051\u73FE\u308C\u308B\u300C\u5916\u5468\u306E\u8056\u57DF\u300D\n                    if (((s.variables || 0) + (s.conditions || 0)) % 3 === 0) {\n                        stroke(255, 255, 0, 100);\n                        rectMode(CENTER);\n                        push();\n                        rotate(rotationZ * 0.5);\n                        rect(0, 0, 300, 300);\n                        pop();\n                    }\n\n                    // \u30EB\u30FC\u30D7\u306E\u6570\u3060\u3051\u540C\u5FC3\u5186\uFF08\u6700\u4F4E1\uFF09\n                    const loops = Math.max(1, s.loops || 1);\n                    for (let i = 0; i < loops; i++) {\n                        stroke(0, 255, 200, Math.max(30, 180 - i * 20));\n                        noFill();\n                        strokeWeight(map(i, 0, loops, 3, 1));\n                        ellipse(0, 0, 150 + (i * 20));\n                    }\n\n                    // \u5206\u5C90\uFF08conditions\uFF09 -> \u4E09\u89D2\u306E\u30C8\u30B2\u3092\u5916\u5074\u306B\u914D\u7F6E\uFF08depth\u306B\u5408\u308F\u305B\u3066\u30B9\u30B1\u30FC\u30EB\uFF09\n                    const cond = Math.max(0, s.conditions || 0);\n                    if (cond > 0) {\n                        for (let i = 0; i < cond; i++) {\n                            push();\n                            rotate((TWO_PI / cond) * i + frameCount * 0.002);\n                            const scaleFactor = map(s.depth || 1, 1, 10, 1, 1.6);\n                            scale(scaleFactor);\n                            fill(255, 220, 120, 200);\n                            noStroke();\n                            triangle(-10, -100, 10, -100, 0, -130);\n                            pop();\n                        }\n                    }\n\n                    // \u5909\u6570\u6570 -> \u4E2D\u5FC3\u306E\u30EB\u30FC\u30F3\uFF08\u5C0F\u5186\uFF09\u306E\u6570\uFF08\u524D\u5F8C\u904B\u52D5\u3067\u5965\u884C\u304D\u3092\u8868\u73FE\uFF09\n                    const vars = Math.max(1, s.variables || 1);\n                    for (let i = 0; i < vars; i++) {\n                        push();\n                        const angle = (TWO_PI / vars) * i + frameCount * 0.005;\n                        rotate(angle);\n                        const zOffset = sin(frameCount * 0.01 + i) * map(s.depth || 1, 1, 10, 5, 30);\n                        translate(0, -40 + zOffset);\n                        fill(50, 200, 255, 200);\n                        noStroke();\n                        ellipse(0, 0, 12, 18);\n                        pop();\n                    }\n\n                    // \u30EA\u30BB\u30C3\u30C8\u5F71\n                    drawingContext.shadowBlur = 0;\n\n                    pop();\n                }\n\n                function draw() {\n                    background(10, 10, 26);\n                    noFill();\n\n                    if (isCorrupted) {\n                        drawBackfire();\n                        return;\n                    }\n\n                    drawMagicCircle(currentSpell);\n                }\n            </script>\n        </body>\n        </html>\n    ";
}
function deactivate() { }
// 術式（AST）を幾何学用のデータに変換する関数
function analyzeSpell(ast) {
    var stats = {
        loops: 0,
        conditions: 0,
        variables: 0,
        depth: 0
    };
    var walk = function (node, depth) {
        if (!node || typeof node !== 'object')
            return;
        stats.depth = Math.max(stats.depth, depth);
        if (node.type === 'ForStatement' || node.type === 'WhileStatement' || node.type === 'ForOfStatement' || node.type === 'ForInStatement')
            stats.loops++;
        if (node.type === 'IfStatement' || node.type === 'ConditionalExpression')
            stats.conditions++;
        if (node.type === 'VariableDeclaration')
            stats.variables++;
        for (var key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key))
                continue;
            var child = node[key];
            if (Array.isArray(child)) {
                for (var _i = 0, child_1 = child; _i < child_1.length; _i++) {
                    var c = child_1[_i];
                    walk(c, depth + 1);
                }
            }
            else if (child && typeof child === 'object' && child.type) {
                walk(child, depth + 1);
            }
        }
    };
    walk(ast, 1);
    return stats;
}
