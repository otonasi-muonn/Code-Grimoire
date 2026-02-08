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
                // 基本色（シアン単色）
                const BASE_COLOR = [0, 220, 255];

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

                function draw() {
                    background(10, 12, 30); // 少し深い青背景

                    if (isCorrupted) { drawBackfire(); return; }
                    if (!spellData.functions || spellData.functions.length === 0) {
                        drawAwaiting(); return;
                    }

                    // --- レイアウト計算 ---
                    const funcCount = spellData.functions.length;
                    const centerX = width / 2;
                    const centerY = height / 2;
                    const layoutRadius = funcCount > 1 ? 250 : 0; 

                    spellData.functions.forEach((f, i) => {
                        let angle = (TWO_PI / funcCount) * i - HALF_PI;
                        f.x = centerX + cos(angle) * layoutRadius;
                        f.y = centerY + sin(angle) * layoutRadius;
                        // 半径計算（少し大きめに調整）
                        f.r = constrain(map(f.lineCount, 0, 50, 80, 180), 80, 250);
                    });

                    // --- 1. 接続線 (Call Graph) ---
                    drawConnections();

                    // --- 2. 各魔法円の描画 ---
                    spellData.functions.forEach(f => {
                        drawFunctionCircle(f);
                    });
                }

                // 接続線と外部魔力流
                function drawConnections() {
                    stroke(...BASE_COLOR, 100);
                    strokeWeight(2);
                    spellData.functions.forEach(f => {
                        const targets = spellData.callGraph[f.name] || [];
                        targets.forEach(targetName => {
                            const targetFunc = spellData.functions.find(tf => tf.name === targetName);
                            if (targetFunc) {
                                line(f.x, f.y, targetFunc.x, targetFunc.y);
                                // 魔力の流れ（パーティクル）
                                let particlePos = (frameCount * 0.015) % 1;
                                let px = lerp(f.x, targetFunc.x, particlePos);
                                let py = lerp(f.y, targetFunc.y, particlePos);
                                noStroke(); fill(...BASE_COLOR, 255);
                                ellipse(px, py, 5, 5);
                            }
                        });
                    });
                }

                // 個別の魔法円を描くメイン関数
                function drawFunctionCircle(f) {
                    push();
                    translate(f.x, f.y);

                    // === ベースの円 (太く、見やすく) ===
                    noFill();
                    stroke(...BASE_COLOR, 200);
                    strokeWeight(4); // 線を太く
                    ellipse(0, 0, f.r * 2);
                    
                    // 内側の装飾リング（薄く回転）
                    strokeWeight(1);
                    stroke(...BASE_COLOR, 80);
                    push();
                    rotate(frameCount * 0.01);
                    ellipse(0, 0, f.r * 1.8);
                    pop();

                    // === 変数ルーン (円周に沿った文字) ===
                    // パラメータ（外側リング）
                    if (f.params && f.params.length > 0) {
                        drawCurvedText(f.params, f.r * 0.85, 0.005, 200);
                    }
                    // ローカル変数（内側リング）
                    if (f.variables && f.variables.length > 0) {
                        drawCurvedText(f.variables, f.r * 0.65, -0.008, 150);
                    }

                    // === IF分岐 (内部ノードと接続) ===
                    let conditions = f.conditions || 0;
                    if (conditions > 0) {
                        let nodeR = f.r * 0.4;
                        for(let i = 0; i < conditions; i++) {
                            push();
                            rotate((TWO_PI / conditions) * i + frameCount * 0.005);
                            translate(nodeR, 0);
                            // 中心との接続線
                            stroke(...BASE_COLOR, 150); strokeWeight(2);
                            line(-nodeR, 0, 0, 0);
                            // 分岐ノード（小円）
                            fill(...BASE_COLOR, 50); stroke(...BASE_COLOR, 255); strokeWeight(3);
                            ellipse(0, 0, 20);
                            pop();
                        }
                    }

                    // === ループ (再帰矢印) ===
                    let loops = (f.loops && f.loops.length) || 0;
                    if (loops > 0) {
                        for(let i = 0; i < loops; i++) {
                            push();
                            rotate((TWO_PI/loops) * i);
                            drawReflexiveArrow(f.r * 1.1, i);
                            pop();
                        }
                    }

                    // === 内部の魔力流 (Internal Flow) ===
                    push();
                    rotate(frameCount * 0.02);
                    let orbitR = f.r * 0.5 * sin(frameCount * 0.01) + f.r * 0.2;
                    translate(orbitR, 0);
                    noStroke(); fill(...BASE_COLOR, 200);
                    ellipse(0, 0, 4, 4);
                    pop();

                    // === 関数名 ===
                    fill(255); noStroke(); textSize(16);
                    textHighlight(f.name, 0, f.r + 30);

                    pop();
                }

                // ヘルパー: 円周に沿って文字を描く
                function drawCurvedText(txtArray, radius, speed, alpha) {
                    push();
                    rotate(frameCount * speed);
                    fill(...BASE_COLOR, alpha); noStroke(); textSize(12);
                    
                    let totalChars = txtArray.join("  ").length;
                    let angleStep = TWO_PI / totalChars;
                    let charIndex = 0;

                    txtArray.forEach(word => {
                        for (let i = 0; i < word.length; i++) {
                            push();
                            let angle = angleStep * charIndex - HALF_PI;
                            rotate(angle);
                            translate(0, -radius);
                            rotate(-angle); // 文字自体は上向きに補正
                            text(word[i], 0, 0);
                            pop();
                            charIndex++;
                        }
                        charIndex+=2; // 単語間のスペース
                    });
                    pop();
                }

                // ヘルパー: 再帰矢印を描く
                function drawReflexiveArrow(r, offset) {
                    noFill(); stroke(...BASE_COLOR, 180); strokeWeight(3);
                    let startAngle = -PI/4 + offset*0.5;
                    let endAngle = PI/4 + offset*0.5;
                    // ベジェ曲線でループを描く
                    bezier(
                        r*cos(startAngle), r*sin(startAngle),
                        r*1.6*cos(startAngle-0.5), r*1.6*sin(startAngle-0.5),
                        r*1.6*cos(endAngle+0.5), r*1.6*sin(endAngle+0.5),
                        r*cos(endAngle), r*sin(endAngle)
                    );
                    // 矢印の先端
                    push();
                    translate(r*cos(endAngle), r*sin(endAngle));
                    rotate(endAngle + PI/2 + 0.4);
                    fill(...BASE_COLOR, 180); noStroke();
                    triangle(0, 0, -6, -10, 6, -10);
                    pop();
                }

                // ヘルパー: テキスト強調表示
                function textHighlight(txt, x, y) {
                    push();
                    translate(x, y);
                    noStroke(); fill(...BASE_COLOR, 50);
                    rect(0, 0, textWidth(txt) + 10, 24, 5);
                    fill(255);
                    text(txt, 0, 0);
                    pop();
                }

                function drawAwaiting() {
                    fill(...BASE_COLOR, 150); textSize(20);
                    text("Awaiting Spell...", width/2, height/2);
                    noFill(); stroke(...BASE_COLOR, 50);
                    ellipse(width/2, height/2, 200 + sin(frameCount*0.05)*20);
                }

                function drawBackfire() {
                    background(20, 0, 0);
                    fill(255, 50, 50); textSize(30);
                    text("SPELL CORRUPTED", width/2, height/2 - 20);
                    textSize(16); fill(255, 100, 100);
                    text("Syntax Error Detected", width/2, height/2 + 20);
                    // ノイズ演出
                    stroke(255, 0, 0, 100);
                    for(let i=0; i<10; i++) {
                        let y = random(height);
                        line(0, y, width, y);
                    }
                }
            </script>
        </body>
        </html>
    `;
}