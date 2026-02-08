export function getWebviewContent() {
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
                let spellData = { functions: [], callGraph: {} };
                let isCorrupted = false;
                
                // カメラ操作用変数
                let viewX = 0;
                let viewY = 0;
                let zoom = 1.0;
                
                let hoverTooltip = null;
                const C_CYAN = [0, 220, 255];
                const C_MAGENTA = [255, 50, 150];

                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.type === 'CAST_MANA') {
                        spellData = msg.spellData || { functions: [], callGraph: {} };
                        isCorrupted = false;
                    } else if (msg.type === 'BACKFIRE') {
                        isCorrupted = true;
                    }
                });

                function setup() {
                    createCanvas(windowWidth, windowHeight);
                    textFont('Courier New');
                    textAlign(CENTER, CENTER);
                    rectMode(CENTER);
                }

                // === 修正: 安全なドラッグ操作 ===
                function mouseDragged() {
                    // 画面外への極端な移動を防ぐわけではないが、計算を安定させる
                    viewX += (mouseX - pmouseX);
                    viewY += (mouseY - pmouseY);
                }

                // === 修正: 安全なズーム操作 ===
                function mouseWheel(event) {
                    let e = event.delta;
                    let oldZoom = zoom;
                    // 感度を調整
                    zoom -= e * 0.001 * zoom; 
                    zoom = constrain(zoom, 0.1, 5.0);
                    
                    // マウス位置を中心にズームする補正（迷子防止）
                    // (今のズーム - 前のズーム) * (マウス位置 - 中心オフセット) 分だけ位置をずらす
                    // シンプルに中央ズームにするならこの補正は無くても良いが、あると便利
                    return false;
                }

                // === 新機能: ダブルクリックでリセット ===
                function doubleClicked() {
                    viewX = 0;
                    viewY = 0;
                    zoom = 1.0;
                }

                function draw() {
                    background(10, 12, 30);
                    
                    if (isCorrupted) { drawBackfire(); return; }
                    
                    try {
                        // データがない時の表示
                        if (!spellData.functions || spellData.functions.length === 0) {
                            push();
                            translate(width/2, height/2);
                            drawAwaiting(); 
                            pop();
                            return;
                        }

                        hoverTooltip = null;

                        push();
                        // 1. 画面中央を基準にする
                        translate(width/2, height/2);
                        // 2. パン（移動）
                        translate(viewX, viewY);
                        // 3. ズーム
                        scale(zoom);

                        drawSpell();

                        pop();

                        // UIレイヤー（ズーム影響なし）
                        drawUI();
                    
                    } catch (e) {
                        console.error(e);
                        // エラーが出ても止まらないようにする
                        fill(255, 0, 0); textSize(20);
                        text("Rendering Error: Double click to reset", width/2, height/2);
                    }
                }

                function drawSpell() {
                    const funcCount = spellData.functions.length;
                    // 配置半径
                    const layoutRadius = funcCount > 1 ? (250 + funcCount * 30) : 0; 

                    // 座標計算
                    spellData.functions.forEach((f, i) => {
                        let angle = (TWO_PI / funcCount) * i - HALF_PI;
                        f.x = cos(angle) * layoutRadius;
                        f.y = sin(angle) * layoutRadius;
                        // 行数に応じた円サイズ
                        f.r = constrain(map(f.lineCount, 0, 100, 80, 300), 80, 400);
                    });

                    // 描画
                    drawConnections();
                    spellData.functions.forEach(f => drawFunctionCircle(f));
                }

                function drawConnections() {
                    stroke(...C_CYAN, 80);
                    strokeWeight(1 / zoom); // 線幅もズームに合わせて補正
                    spellData.functions.forEach(f => {
                        const targets = spellData.callGraph[f.name] || [];
                        targets.forEach(targetName => {
                            const targetFunc = spellData.functions.find(tf => tf.name === targetName);
                            if (targetFunc) {
                                line(f.x, f.y, targetFunc.x, targetFunc.y);
                                
                                let p = (frameCount * 0.01) % 1;
                                let px = lerp(f.x, targetFunc.x, p);
                                let py = lerp(f.y, targetFunc.y, p);
                                noStroke(); fill(...C_CYAN);
                                ellipse(px, py, 6/zoom, 6/zoom);
                            }
                        });
                    });
                }

                function drawFunctionCircle(f) {
                    push();
                    translate(f.x, f.y);

                    // ベース円
                    noFill(); stroke(...C_CYAN, 180); strokeWeight(3 / zoom);
                    ellipse(0, 0, f.r * 2);

                    // 装飾
                    strokeWeight(1 / zoom); stroke(...C_CYAN, 60);
                    push(); rotate(frameCount * 0.005); ellipse(0, 0, f.r * 1.9); pop();

                    // 変数
                    if (f.variables) drawVariablesRing(f.variables, f.r * 0.75, 0.005);

                    // ロジックツリー (IF/Loop)
                    if (f.logicTree && f.logicTree.length > 0) {
                        push(); translate(0, f.r * 0.2); 
                        drawLogicGroup(f.logicTree, f.r * 0.5);
                        pop();
                    }

                    // 名前
                    fill(255); noStroke(); 
                    textSize(14 / zoom + 12);
                    text(f.name, 0, f.r + 30);
                    pop();
                }

                function drawVariablesRing(vars, radius, speed) {
                    push(); rotate(frameCount * speed);
                    const angleStep = 0.25;
                    const startAngle = - (vars.length * angleStep * 2) / 2;
                    vars.forEach((v, i) => {
                        let angle = startAngle + i * (angleStep * 3);
                        push(); rotate(angle); translate(0, -radius);
                        
                        noStroke(); let size = 8 / zoom;
                        if (v.type === 'number') { fill(...C_CYAN); rect(0, -15, size, size); }
                        else if (v.type === 'string') { fill(...C_MAGENTA); ellipse(0, -15, size, size); }
                        else { fill(200); triangle(0, -18, -size/2, -12, size/2, -12); }

                        fill(...C_CYAN, 200); rotate(-PI/2); textSize(10 / zoom + 4);
                        text(v.name, 0, 0);
                        pop();
                    });
                    pop();
                }

                function drawLogicGroup(nodes, size) {
                    if(!nodes) return;
                    let stepX = size * 0.8;
                    let startX = -((nodes.length - 1) * stepX) / 2;
                    nodes.forEach((node, i) => {
                        push(); translate(startX + i * stepX, 0);
                        if (node.type === 'if') drawIfNode(node, size * 0.6);
                        else if (node.type === 'loop') drawLoopNode(node, size * 0.6);
                        pop();
                    });
                }

                function drawIfNode(node, r) {
                    // マウス判定（簡易版: 画面中央からの相対座標で計算）
                    // 厳密な行列計算は重いため、ズームが極端でない限りこれで動く
                    let scR = r * zoom;
                    
                    stroke(255, 200, 50, 200); strokeWeight(1.5 / zoom);
                    
                    // ホバー判定用（p5のscreenXを使うと行列適用後の座標が取れる）
                    let sx = screenX(0, 0);
                    let sy = screenY(0, 0);
                    if (dist(mouseX, mouseY, sx, sy) < scR) {
                        fill(255, 200, 50, 50);
                        hoverTooltip = node.condition;
                    } else {
                        noFill();
                    }
                    
                    ellipse(0, 0, r * 2);

                    fill(255, 200, 50, 200); noStroke();
                    let condText = node.condition || "?";
                    let fSize = constrain((r * 1.5) / condText.length, 2, r * 0.4);
                    textSize(fSize);
                    text(condText, 0, -r * 0.5);

                    if (node.children && node.children.length > 0) {
                        push(); translate(0, r * 0.2);
                        drawLogicGroup(node.children, r * 0.7);
                        pop();
                    }
                }

                function drawLoopNode(node, r) {
                    noFill(); stroke(50, 255, 100, 200); strokeWeight(2 / zoom);
                    push(); rotate(frameCount * 0.05);
                    arc(0, 0, r*1.5, r*1.5, 0, PI * 1.5);
                    push(); rotate(PI * 1.5); translate(r*0.75, 0);
                    triangle(0, -5, 0, 5, 8, 0); pop(); pop();

                    fill(50, 255, 100, 100); noStroke(); ellipse(0, 0, r * 0.5);
                    if (node.children && node.children.length > 0) {
                         drawLogicGroup(node.children, r * 0.5);
                    }
                }

                function drawUI() {
                    if (hoverTooltip) {
                        let padding = 10; textSize(14);
                        let w = textWidth(hoverTooltip) + padding * 2;
                        fill(0, 0, 0, 200); stroke(255, 200, 50);
                        rect(mouseX, mouseY - 30, w, 30, 5);
                        fill(255, 200, 50); noStroke();
                        text(hoverTooltip, mouseX, mouseY - 30);
                    }
                    fill(100, 150, 255, 150); noStroke(); textAlign(LEFT, BOTTOM); textSize(12);
                    text("Double Click to RESET View | Drag to Pan | Scroll to Zoom", 20, height - 20);
                }

                function drawAwaiting() {
                    fill(...C_CYAN, 150); textSize(20);
                    text("Awaiting Code...", 0, 0);
                    noFill(); stroke(...C_CYAN, 50);
                    ellipse(0, 0, 200 + sin(frameCount*0.05)*20);
                }

                function drawBackfire() {
                    background(30, 0, 0);
                    fill(255, 50, 50); textSize(30);
                    text("SPELL BROKEN", width/2, height/2);
                }
            </script>
        </body>
        </html>
    `;
}