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
                const vscode = acquireVsCodeApi();

                // シンプルな状態管理
                const state = {
                    spellData: { functions: [], callGraph: {} },
                    isCorrupted: false,
                    viewX: 0,
                    viewY: 0,
                    zoom: 1,
                    hover: null
                };

                const C_CYAN = [0, 220, 255];
                const C_MAGENTA = [255, 50, 150];

                // 文字列から安定した色相を生成
                const stringToHue = (str) => {
                    let hash = 0;
                    for (let i = 0; i < str.length; i++) {
                        hash = str.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    return Math.abs(hash % 360);
                };

                // HSL -> RGB (0-255)
                const hslToRgb = (h, s, l) => {
                    const hue = h / 360;
                    let r, g, b;
                    if (s === 0) {
                        r = g = b = l;
                    } else {
                        const hue2rgb = (p, q, t) => {
                            if (t < 0) t += 1;
                            if (t > 1) t -= 1;
                            if (t < 1/6) return p + (q - p) * 6 * t;
                            if (t < 1/2) return q;
                            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                            return p;
                        };
                        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                        const p = 2 * l - q;
                        r = hue2rgb(p, q, hue + 1/3);
                        g = hue2rgb(p, q, hue);
                        b = hue2rgb(p, q, hue - 1/3);
                    }
                    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
                };

                const getPalette = (fileName) => {
                    const hue = stringToHue(fileName || 'unknown');
                    const base = hslToRgb(hue, 0.7, 0.55);
                    const glow = hslToRgb((hue + 20) % 360, 0.7, 0.65);
                    const dim = hslToRgb(hue, 0.5, 0.35);
                    return { base, glow, dim };
                };

                const toWorld = (sx, sy) => {
                    return {
                        x: (sx - width / 2 - state.viewX) / state.zoom,
                        y: (sy - height / 2 - state.viewY) / state.zoom
                    };
                };

                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.type === 'CAST_MANA') {
                        state.spellData = msg.spellData || { functions: [], callGraph: {} };
                        state.isCorrupted = false;
                    } else if (msg.type === 'BACKFIRE') {
                        state.isCorrupted = true;
                    }
                });

                function setup() {
                    createCanvas(windowWidth, windowHeight);
                    textFont('Courier New');
                    textAlign(CENTER, CENTER);
                    rectMode(CENTER);
                }

                function mouseDragged() {
                    state.viewX += (mouseX - pmouseX);
                    state.viewY += (mouseY - pmouseY);
                }

                function mouseWheel(event) {
                    state.zoom -= event.delta * 0.001 * state.zoom;
                    state.zoom = constrain(state.zoom, 0.1, 5);
                    return false;
                }

                function doubleClicked() {
                    state.viewX = 0;
                    state.viewY = 0;
                    state.zoom = 1;
                }

                function mousePressed() {
                    const data = state.spellData;
                    if (!data.functions || data.functions.length === 0) return;
                    const world = toWorld(mouseX, mouseY);
                    for (const f of data.functions) {
                        if (!f || !f.r) continue;
                        if (dist(world.x, world.y, f.x, f.y) < f.r) {
                            vscode.postMessage({ command: 'jumpToCode', fileName: f.fileName, line: f.startLine || 1 });
                            break;
                        }
                    }
                }

                function draw() {
                    background(10, 12, 30);
                    if (state.isCorrupted) { drawBackfire(); return; }

                    try {
                        const data = state.spellData;
                        if (!data.functions || data.functions.length === 0) {
                            push(); translate(width / 2, height / 2); drawAwaiting(); pop();
                            return;
                        }

                        state.hover = null;

                        push();
                        translate(width / 2, height / 2);
                        translate(state.viewX, state.viewY);
                        scale(state.zoom);

                        layoutFunctions(data.functions);
                        drawConnections(data);
                        data.functions.forEach(drawFunctionCircle);

                        pop();

                        updateHover(data.functions);
                        drawUI();
                    } catch (e) {
                        console.error(e);
                        fill(255, 0, 0); textSize(20);
                        text("Rendering Error: Double click to reset", width/2, height/2);
                    }
                }

                function layoutFunctions(funcs) {
                    const count = funcs.length;
                    const radius = count > 1 ? (250 + count * 30) : 0;
                    funcs.forEach((f, i) => {
                        const angle = (TWO_PI / count) * i - HALF_PI;
                        f.x = cos(angle) * radius;
                        f.y = sin(angle) * radius;
                        f.r = constrain(map(f.lineCount, 0, 100, 80, 300), 80, 400);
                    });
                }

                function drawConnections(data) {
                    strokeWeight(1 / state.zoom);
                    data.functions.forEach(f => {
                        const palette = getPalette(f.fileName);
                        const targets = data.callGraph[f.name] || [];
                        targets.forEach(tName => {
                            const t = data.functions.find(fn => fn.name === tName);
                            if (!t) return;
                            stroke(palette.base[0], palette.base[1], palette.base[2], 100);
                            line(f.x, f.y, t.x, t.y);
                            const p = (frameCount * 0.01) % 1;
                            const px = lerp(f.x, t.x, p);
                            const py = lerp(f.y, t.y, p);
                            noStroke(); fill(palette.glow[0], palette.glow[1], palette.glow[2]);
                            ellipse(px, py, 6 / state.zoom, 6 / state.zoom);
                        });
                    });
                }

                function drawFunctionCircle(f) {
                    const palette = getPalette(f.fileName);
                    push();
                    translate(f.x, f.y);

                    drawMagicShape(f, palette);

                    strokeWeight(1 / state.zoom);
                    stroke(palette.glow[0], palette.glow[1], palette.glow[2], 80);
                    push(); rotate(frameCount * 0.005); ellipse(0, 0, f.r * 1.9); pop();

                    if (f.variables) drawVariablesRing(f.variables, f.r * 0.75, 0.005, palette);

                    if (f.logicTree && f.logicTree.length > 0) {
                        push(); translate(0, f.r * 0.2); drawLogicGroup(f.logicTree, f.r * 0.5, palette); pop();
                    }

                    fill(palette.glow[0], palette.glow[1], palette.glow[2]); noStroke();
                    textSize(14 / state.zoom + 12);
                    text(f.name, 0, f.r + 30);
                    pop();
                }

                function drawVariablesRing(vars, radius, speed, palette) {
                    push(); rotate(frameCount * speed);
                    const angleStep = 0.25;
                    const startAngle = - (vars.length * angleStep * 2) / 2;
                    vars.forEach((v, i) => {
                        const angle = startAngle + i * (angleStep * 3);
                        push(); rotate(angle); translate(0, -radius);
                        const size = 8 / state.zoom;
                        noStroke();
                        if (v.type === 'number') {
                            fill(palette.base[0], palette.base[1], palette.base[2]);
                            rect(0, -15, size, size);
                        } else if (v.type === 'string') {
                            fill(...C_MAGENTA);
                            ellipse(0, -15, size, size);
                        } else {
                            fill(palette.dim[0], palette.dim[1], palette.dim[2]);
                            triangle(0, -18, -size/2, -12, size/2, -12);
                        }
                        fill(palette.glow[0], palette.glow[1], palette.glow[2], 200);
                        rotate(-PI / 2); textSize(10 / state.zoom + 4); text(v.name, 0, 0);
                        pop();
                    });
                    pop();
                }

                function drawMagicShape(f, palette) {
                    const complexity = constrain(f.conditions || 0, 0, 24);
                    let points = map(complexity, 0, 20, 30, 3);
                    points = constrain(Math.floor(points), 3, 30);
                    noFill();
                    stroke(palette.base[0], palette.base[1], palette.base[2], 200);
                    strokeWeight(3 / state.zoom);
                    beginShape();
                    for (let i = 0; i < points; i++) {
                        const angle = TWO_PI / points * i;
                        let r = f.r;
                        if (complexity > 10 && i % 2 === 0) r *= 1.3;
                        if (complexity > 15) r *= 1 + noise(frameCount * 0.01 + i) * 0.1;
                        vertex(cos(angle) * r, sin(angle) * r);
                    }
                    endShape(CLOSE);
                }

                function drawLogicGroup(nodes, size, palette) {
                    const stepX = size * 0.8;
                    const startX = -((nodes.length - 1) * stepX) / 2;
                    nodes.forEach((node, i) => {
                        push(); translate(startX + i * stepX, 0);
                        if (node.type === 'if') drawIfNode(node, size * 0.6, palette);
                        else if (node.type === 'loop') drawLoopNode(node, size * 0.6, palette);
                        pop();
                    });
                }

                function drawIfNode(node, r, palette) {
                    noFill(); stroke(255, 200, 50, 200); strokeWeight(1.5 / state.zoom);
                    ellipse(0, 0, r * 2);
                    fill(255, 200, 50, 200); noStroke();
                    const condText = node.condition || "?";
                    const fSize = constrain((r * 1.5) / max(condText.length, 1), 2, r * 0.4);
                    textSize(fSize);
                    text(condText, 0, -r * 0.5);
                    if (node.children && node.children.length > 0) {
                        push(); translate(0, r * 0.2); drawLogicGroup(node.children, r * 0.7, palette); pop();
                    }
                }

                function drawLoopNode(node, r, palette) {
                    noFill(); stroke(50, 255, 100, 200); strokeWeight(2 / state.zoom);
                    push(); rotate(frameCount * 0.05);
                    arc(0, 0, r * 1.5, r * 1.5, 0, PI * 1.5);
                    push(); rotate(PI * 1.5); translate(r * 0.75, 0); triangle(0, -5, 0, 5, 8, 0); pop(); pop();
                    fill(50, 255, 100, 100); noStroke(); ellipse(0, 0, r * 0.5);
                    if (node.children && node.children.length > 0) drawLogicGroup(node.children, r * 0.5, palette);
                }

                function updateHover(funcs) {
                    const world = toWorld(mouseX, mouseY);
                    let closest = null;
                    funcs.forEach(f => {
                        const d = dist(world.x, world.y, f.x, f.y);
                        if (d < f.r) {
                            const label = f.fileName ? (f.name + ' @ ' + f.fileName) : f.name;
                            if (!closest || d < closest.d) closest = { d, label };
                        }
                    });
                    state.hover = closest ? closest.label : null;
                }

                function drawUI() {
                    if (state.hover) {
                        const padding = 10; textSize(14);
                        const w = textWidth(state.hover) + padding * 2;
                        fill(0, 0, 0, 200); stroke(255, 200, 50);
                        rect(mouseX, mouseY - 30, w, 30, 5);
                        fill(255, 200, 50); noStroke();
                        text(state.hover, mouseX, mouseY - 30);
                    }
                    fill(100, 150, 255, 150); noStroke(); textAlign(LEFT, BOTTOM); textSize(12);
                    text("Double Click to RESET View | Drag to Pan | Scroll to Zoom", 20, height - 20);
                }

                function drawAwaiting() {
                    fill(...C_CYAN, 150); textSize(20);
                    text("Awaiting Code...", 0, 0);
                    noFill(); stroke(...C_CYAN, 50);
                    ellipse(0, 0, 200 + sin(frameCount * 0.05) * 20);
                }

                function drawBackfire() {
                    background(30, 0, 0);
                    fill(255, 50, 50); textSize(30);
                    text("SPELL BROKEN", width / 2, height / 2);
                }
            </script>
        </body>
        </html>
    `;
}