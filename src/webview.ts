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
                // データ保持用
                let spellData = { functions: [], callGraph: {} };
                let isCorrupted = false;

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
                }

                function draw() {
                    background(10, 10, 26);

                    if (isCorrupted) {
                        drawBackfire();
                        return;
                    }

                    if (!spellData.functions || spellData.functions.length === 0) {
                        fill(100); textAlign(CENTER); textSize(20);
                        text("Awaiting Spell...", width/2, height/2);
                        return;
                    }

                    // --- レイアウト計算 ---
                    const funcCount = spellData.functions.length;
                    const centerX = width / 2;
                    const centerY = height / 2;
                    // 関数が複数あるなら円状に広げる
                    const layoutRadius = funcCount > 1 ? 250 : 0; 

                    spellData.functions.forEach((f, i) => {
                        // 12時方向(-HALF_PI)から配置開始
                        let angle = (TWO_PI / funcCount) * i - HALF_PI;
                        f.x = centerX + cos(angle) * layoutRadius;
                        f.y = centerY + sin(angle) * layoutRadius;
                    });

                    // --- 1. 接続線 (Call Graph) ---
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

                    // IF分岐 = 多重円
                    let conditions = f.conditions || 0;
                    for(let i = 0; i < conditions; i++) {
                        stroke(255, 200, 0, 150 - (i * 20)); 
                        let offset = (i + 1) * 10;
                        ellipse(0, 0, (r * 2) - offset);
                    }

                    // ループ = 外周リング
                    let loops = (f.loops && f.loops.length) || 0;
                    if (loops > 0) {
                        push();
                        rotate(-frameCount * 0.01);
                        stroke(0, 255, 100, 150);
                        for(let i=0; i<loops; i++) {
                            arc(0, 0, r * 2.2 + (i*10), r * 2.2 + (i*10), 0, PI + (frameCount*0.01));
                        }
                        pop();
                    }

                    // 変数 = ルーン文字
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

                    // 関数名
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