import * as vscode from 'vscode';
import * as acorn from 'acorn'; // 追加
import * as acornLoose from 'acorn-loose'; // 追加

export function activate(context: vscode.ExtensionContext) {
    let panel: vscode.WebviewPanel | undefined = undefined;

    // 監視役をコマンドの外に出す（二重登録防止）
    vscode.workspace.onDidChangeTextDocument(event => {
        if (panel && event.document === vscode.window.activeTextEditor?.document) {
            const code = event.document.getText();
            try {
                // acorn-loose を使って、不完全なコードや型定義があっても強引に解析
                const ast = acornLoose.parse(code, { ecmaVersion: 2020 });
                const spellData = analyzeSpell(ast);

                panel.webview.postMessage({
                    type: 'CAST_MANA',
                    spellData: spellData
                });
            } catch (e) {
                // looseを使えば基本ここには来ないが、念のため
                panel.webview.postMessage({ type: 'BACKFIRE' });
            }
        }
    }, null, context.subscriptions);

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
                // データ保持用
                let spellData = { functions: [], callGraph: {} };
                let isCorrupted = false;

                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.type === 'CAST_MANA') {
                        // データ構造が変わったので受け取り方も更新
                        spellData = msg.spellData || { functions: [], callGraph: {} };
                        isCorrupted = false;
                    } else if (msg.type === 'BACKFIRE') {
                        isCorrupted = true;
                    }
                });

                function setup() {
                    createCanvas(windowWidth, windowHeight);
                    textFont('Courier New'); // 魔法っぽい等幅フォント
                }

                function draw() {
                    background(10, 10, 26);

                    if (isCorrupted) {
                        drawBackfire();
                        return;
                    }

                    // 関数がない場合は待機
                    if (!spellData.functions || spellData.functions.length === 0) {
                        fill(100); textAlign(CENTER); textSize(20);
                        text("Awaiting Spell...", width/2, height/2);
                        return;
                    }

                    // --- レイアウト計算 ---
                    const funcCount = spellData.functions.length;
                    const centerX = width / 2;
                    const centerY = height / 2;
                    // 関数が1個なら中央、複数なら円状に広げる
                    const layoutRadius = funcCount > 1 ? 250 : 0; 

                    // 各関数の座標を計算して保持
                    spellData.functions.forEach((f, i) => {
                        // 12時方向(-HALF_PI)から配置開始
                        let angle = (TWO_PI / funcCount) * i - HALF_PI;
                        f.x = centerX + cos(angle) * layoutRadius;
                        f.y = centerY + sin(angle) * layoutRadius;
                    });

                    // --- 1. 接続線 (Call Graph) の描画 ---
                    stroke(100, 100, 255, 100);
                    strokeWeight(1);
                    spellData.functions.forEach(f => {
                        const targets = spellData.callGraph[f.name] || [];
                        targets.forEach(targetName => {
                            const targetFunc = spellData.functions.find(tf => tf.name === targetName);
                            if (targetFunc) {
                                line(f.x, f.y, targetFunc.x, targetFunc.y);
                                // 魔力の流れ（パーティクル）
                                let particlePos = (frameCount * 0.02) % 1;
                                let px = lerp(f.x, targetFunc.x, particlePos);
                                let py = lerp(f.y, targetFunc.y, particlePos);
                                fill(255, 255, 0); noStroke();
                                ellipse(px, py, 4, 4);
                            }
                        });
                    });

                    // --- 2. 各魔法円の描画 ---
                    spellData.functions.forEach(f => {
                        drawFunctionCircle(f);
                    });
                }

                // 個別の魔法円を描く関数
                function drawFunctionCircle(f) {
                    push();
                    translate(f.x, f.y);

                    // 円の大きさ（行数が多いほど大きい）
                    let r = map(f.lineCount, 0, 50, 60, 150); 
                    r = constrain(r, 60, 200);

                    // ベースの円
                    noFill();
                    stroke(0, 200, 255, 150);
                    strokeWeight(2);
                    
                    push();
                    rotate(frameCount * 0.005);
                    ellipse(0, 0, r * 2);
                    pop();

                    // --- 条件分岐 (IF) = 多重円 ---
                    let conditions = f.conditions || 0;
                    for(let i = 0; i < conditions; i++) {
                        stroke(255, 200, 0, 150 - (i * 20)); // 黄色系
                        let offset = (i + 1) * 10;
                        ellipse(0, 0, (r * 2) - offset);
                    }

                    // --- ループ (Loop) = 外周の装飾リング ---
                    let loops = (f.loops && f.loops.length) || 0;
                    if (loops > 0) {
                        push();
                        rotate(-frameCount * 0.01);
                        stroke(0, 255, 100, 150); // 緑系
                        for(let i=0; i<loops; i++) {
                            arc(0, 0, r * 2.2 + (i*10), r * 2.2 + (i*10), 0, PI + (frameCount*0.01));
                        }
                        pop();
                    }

                    // --- 変数 (Variables) = 円内部のルーン文字 ---
                    if (f.variables && f.variables.length > 0) {
                        let vars = f.variables;
                        let angleStep = TWO_PI / vars.length;
                        fill(0, 255, 255, 200);
                        noStroke();
                        textSize(12);
                        textAlign(CENTER, CENTER);
                        
                        push();
                        rotate(frameCount * 0.01);
                        vars.forEach((v, i) => {
                            push();
                            rotate(angleStep * i);
                            translate(0, -r * 0.6); 
                            rotate(-(angleStep * i + frameCount * 0.01)); 
                            text(v, 0, 0);
                            pop();
                        });
                        pop();
                    }

                    // --- 関数名 (円の下に表示) ---
                    fill(255);
                    noStroke();
                    textSize(14);
                    textAlign(CENTER);
                    text(f.name, 0, r + 20);

                    pop();
                }

                function drawBackfire() {
                    background(60, 0, 0);
                    fill(255, 0, 0);
                    textAlign(CENTER);
                    textSize(30);
                    text("SPELL CORRUPTED", width/2, height/2);
                }
            </script>
        </body>
        </html>
    `;
}

export function deactivate() { }

// 術式（AST）を幾何学用のデータに変換する関数
function analyzeSpell(ast: any) {
    // 全体的な集計（既存のUI向け簡易データ）
    const summary = {
        loops: 0,
        conditions: 0,
        variables: 0,
        depth: 0
    };

    // 関数ごとの詳細情報を蓄える
    const functions: any[] = [];

    const isFunctionNode = (n: any) => {
        if (!n || typeof n !== 'object') return false;
        return ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(n.type);
    };

    const calleeName = (n: any): string => {
        if (!n) return 'unknown';
        if (n.type === 'Identifier') return n.name;
        if (n.type === 'MemberExpression') {
            const obj = n.object && calleeName(n.object);
            const prop = n.property && (n.property.name || (n.property.value ? String(n.property.value) : ''));
            return obj && prop ? obj + '.' + prop : (prop || obj || 'member');
        }
        if (n.type === 'CallExpression') return calleeName(n.callee);
        return n.type || 'unknown';
    };

    // 内部で使うユーティリティ: ASTを深さ優先で走査
    const walk = (node: any, depth: number, cb: (n: any, depth: number, parent?: any) => void, parent?: any) => {
        if (!node || typeof node !== 'object') return;
        summary.depth = Math.max(summary.depth, depth);
        cb(node, depth, parent);
        for (const key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            const child = node[key];
            if (Array.isArray(child)) {
                for (const c of child) walk(c, depth + 1, cb, node);
            } else if (child && typeof child === 'object' && child.type) {
                walk(child, depth + 1, cb, node);
            }
        }
    };

    // 全体を一回走査してsummaryの基本値を集める
    walk(ast, 1, (n) => {
        if (n.type === 'ForStatement' || n.type === 'WhileStatement' || n.type === 'ForOfStatement' || n.type === 'ForInStatement') summary.loops++;
        if (n.type === 'IfStatement' || n.type === 'ConditionalExpression') summary.conditions++;
        if (n.type === 'VariableDeclaration') summary.variables += (n.declarations && n.declarations.length) || 1;
    });

    // 関数検出: トップレベルやネストした関数を見つけ、詳細を抽出
    const findFunctions = (root: any) => {
        walk(root, 1, (n, depth, parent) => {
            if (isFunctionNode(n) || (n.type === 'VariableDeclarator' && n.init && isFunctionNode(n.init))) {
                // 関数の名前
                let fnNode = n.type === 'VariableDeclarator' ? n.init : n;
                let name = 'anonymous';
                if (n.type === 'VariableDeclarator' && n.id && n.id.name) name = n.id.name;
                else if (fnNode.id && fnNode.id.name) name = fnNode.id.name;
                else if (parent && parent.type === 'Property' && parent.key && parent.key.name) name = parent.key.name;

                const params = (fnNode.params || []).map((p: any) => {
                    if (!p) return 'unknown';
                    if (p.type === 'Identifier') return p.name;
                    try { return (p.name || JSON.stringify(p)); } catch { return 'param'; }
                });

                const startLine = fnNode.loc?.start?.line || (fnNode.start ? fnNode.start : 0);
                const endLine = fnNode.loc?.end?.line || (fnNode.end ? fnNode.end : startLine + 1);
                const lineCount = (fnNode.loc && fnNode.loc.end && fnNode.loc.start) ? (fnNode.loc.end.line - fnNode.loc.start.line + 1) : Math.max(1, endLine - startLine + 1);

                const stats: any = {
                    name,
                    params,
                    startLine,
                    endLine,
                    lineCount,
                    variables: new Set<string>(),
                    calls: [] as any[],
                    conditions: 0,
                    loops: [] as any[],
                    nestedDepth: 0,
                    returns: 0,
                    isAsync: !!fnNode.async,
                    isGenerator: !!fnNode.generator,
                    exported: false,
                    externalRefs: new Set<string>()
                };

                // collect declared identifiers within function to differentiate external refs
                const declared = new Set<string>(params.filter(Boolean));

                // 内部走査: 変数・呼び出し・条件・ループ・return・識別子使用
                walk(fnNode.body || fnNode, 1, (m: any, d: number, p: any) => {
                    stats.nestedDepth = Math.max(stats.nestedDepth, d);
                    if (m.type === 'VariableDeclarator' && m.id && m.id.name) {
                        stats.variables.add(m.id.name);
                        declared.add(m.id.name);
                    }
                    if (m.type === 'FunctionDeclaration' && m.id && m.id.name) declared.add(m.id.name);
                    if (m.type === 'CallExpression') {
                        stats.calls.push({ name: calleeName(m.callee), loc: m.loc });
                    }
                    if (m.type === 'IfStatement' || m.type === 'ConditionalExpression') stats.conditions++;
                    if (m.type === 'ForStatement' || m.type === 'WhileStatement' || m.type === 'ForOfStatement' || m.type === 'ForInStatement') stats.loops.push({ type: m.type, loc: m.loc });
                    if (m.type === 'ReturnStatement') stats.returns++;
                    // Identifier の簡易的な使用検出（宣言に含まれないものを外部参照候補とする）
                    if (m.type === 'Identifier') {
                        const parentType = p && p.type;
                        // 宣言やプロパティ名、関数名のIdentifierは除外
                        const skipParent = ['VariableDeclarator', 'FunctionDeclaration', 'FunctionExpression', 'ClassDeclaration', 'MethodDefinition', 'Property'];
                        if (!declared.has(m.name) && !params.includes(m.name) && !skipParent.includes(parentType)) {
                            stats.externalRefs.add(m.name);
                        }
                    }
                }, fnNode);

                // もし親がExportNamedDeclarationなどなら exported を true にする
                if (parent && (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportDefaultDeclaration')) stats.exported = true;

                // Set -> Array に変換
                stats.variables = Array.from(stats.variables);
                stats.externalRefs = Array.from(stats.externalRefs);

                functions.push(stats);
            }
        });
    };

    findFunctions(ast);

    // 簡易的なコールグラフ: 関数名 -> 呼び出し先名一覧
    const callGraph: Record<string, string[]> = {};
    for (const f of functions) {
        callGraph[f.name] = (f.calls || []).map((c: any) => c.name);
    }

    return {
        summary,
        functions,
        callGraph
    };
}