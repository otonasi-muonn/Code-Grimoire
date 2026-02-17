// ─── Particle Loading / Shockwave / Edge Flow / Ripple / Error Flash ──────
import { Application, Graphics, Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { state } from '../core/state.js';
import { getNodeColor } from '../utils/color.js';

// ─── Particle Loading 演出 ──────────────────────────────

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    radius: number;
    color: number;
}

const PARTICLE_COUNT = 120;
const PARTICLE_COLORS = [0x00dcff, 0x4488ff, 0x66aaff, 0xaaddff, 0x2266cc];
let particles: Particle[] = [];
let particleContainer: Container;
let particleGfx: Graphics;
let particleAnimActive = false;
let particleTickerFn: ((dt: any) => void) | null = null;

/** 共有 app / viewport 参照 — init 時に設定 */
let _app: Application;
let _viewport: Viewport;

export function setEffectsContext(app: Application, viewport: Viewport) {
    _app = app;
    _viewport = viewport;
}

export function initParticleSystem() {
    particleContainer = new Container();
    particleContainer.alpha = 0;
    _viewport.addChild(particleContainer);

    particleGfx = new Graphics();
    particleContainer.addChild(particleGfx);
}

function spawnParticle(): Particle {
    const angle = Math.random() * Math.PI * 2;
    const dist = 300 + Math.random() * 500;
    const speed = 0.5 + Math.random() * 1.5;
    const life = 0.6 + Math.random() * 0.4;

    return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        radius: 1 + Math.random() * 2.5,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    };
}

export function startParticleLoading() {
    if (particleAnimActive) { return; }
    particleAnimActive = true;
    particleContainer.alpha = 1;

    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(spawnParticle());
    }

    particleTickerFn = () => {
        particleGfx.clear();
        const dt = _app.ticker.deltaTime * 0.016;

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            const dx = -p.x;
            const dy = -p.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 1;
            const attraction = 0.3;
            p.vx += (dx / dist) * attraction;
            p.vy += (dy / dist) * attraction;

            p.vx *= 0.98;
            p.vy *= 0.98;

            p.x += p.vx;
            p.y += p.vy;
            p.life -= dt * 0.6;

            if (p.life <= 0 || dist < 8) {
                particles[i] = spawnParticle();
                continue;
            }

            const alpha = (p.life / p.maxLife) * 0.8;
            particleGfx.circle(p.x, p.y, p.radius * 3);
            particleGfx.fill({ color: p.color, alpha: alpha * 0.15 });
            particleGfx.circle(p.x, p.y, p.radius);
            particleGfx.fill({ color: 0xffffff, alpha: alpha * 0.9 });
        }
    };
    _app.ticker.add(particleTickerFn);
}

export function stopParticleLoading() {
    if (!particleAnimActive) { return; }
    particleAnimActive = false;

    triggerShockwave();

    const fadeStart = performance.now();
    const fadeDuration = 800;
    const fadeOut = () => {
        const elapsed = performance.now() - fadeStart;
        const t = Math.min(elapsed / fadeDuration, 1);
        particleContainer.alpha = 1 - t;
        if (t < 1) {
            requestAnimationFrame(fadeOut);
        } else {
            if (particleTickerFn) {
                _app.ticker.remove(particleTickerFn);
                particleTickerFn = null;
            }
            particleGfx.clear();
            particles = [];
        }
    };
    requestAnimationFrame(fadeOut);
}

// ─── Shockwave エフェクト (V5: Summoning Impact) ─────────
export function triggerShockwave() {
    const cx = state.focusNodeId ? (state.nodePositions.get(state.focusNodeId)?.x || 0) : 0;
    const cy = state.focusNodeId ? (state.nodePositions.get(state.focusNodeId)?.y || 0) : 0;

    const shockGfx = new Graphics();
    _viewport.addChild(shockGfx);

    const startTime = performance.now();
    const duration = 700;
    const maxRadius = 500;

    const animateShock = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        const radius = ease * maxRadius;
        const alpha = (1 - t) * 0.4;
        const width = 2 + (1 - t) * 3;

        shockGfx.clear();
        shockGfx.circle(cx, cy, radius);
        shockGfx.stroke({ width, color: 0x44aaff, alpha });

        if (t < 0.3) {
            const flashAlpha = (0.3 - t) / 0.3 * 0.15;
            shockGfx.circle(cx, cy, radius * 0.6);
            shockGfx.fill({ color: 0x88ddff, alpha: flashAlpha });
        }

        if (t < 1) {
            requestAnimationFrame(animateShock);
        } else {
            _viewport.removeChild(shockGfx);
            shockGfx.destroy();
        }
    };
    requestAnimationFrame(animateShock);
}

// ─── Edge Particle Flow (V5: 依存方向の光粒子) ──────────
interface EdgeFlowParticle {
    srcId: string;
    tgtId: string;
    progress: number;
    speed: number;
    color: number;
}

const EDGE_FLOW_MAX = 60;
let edgeFlowParticles: EdgeFlowParticle[] = [];
let edgeFlowGfx: Graphics | null = null;
let edgeFlowTickerFn: ((dt: any) => void) | null = null;

export function startEdgeFlow(edgeContainer: Container) {
    if (edgeFlowTickerFn) { return; }

    edgeFlowGfx = new Graphics();
    edgeContainer.addChild(edgeFlowGfx);

    edgeFlowTickerFn = () => {
        if (!edgeFlowGfx || !state.graph || state.isLoading) { return; }
        edgeFlowGfx.clear();

        if (state.currentLOD === 'far') { return; }

        const dt = _app.ticker.deltaTime * 0.016;

        while (edgeFlowParticles.length < EDGE_FLOW_MAX && state.graph.edges.length > 0) {
            const edge = state.graph.edges[Math.floor(Math.random() * state.graph.edges.length)];
            if (edge.kind === 'type-import') { continue; }
            const srcNode = state.graph.nodes.find(n => n.id === edge.source);
            edgeFlowParticles.push({
                srcId: edge.source,
                tgtId: edge.target,
                progress: Math.random() * 0.3,
                speed: 0.15 + Math.random() * 0.25,
                color: srcNode ? getNodeColor(srcNode) : 0x4488ff,
            });
        }

        for (let i = edgeFlowParticles.length - 1; i >= 0; i--) {
            const p = edgeFlowParticles[i];
            p.progress += p.speed * dt;

            if (p.progress >= 1.0) {
                edgeFlowParticles.splice(i, 1);
                continue;
            }

            const srcPos = state.nodePositions.get(p.srcId);
            const tgtPos = state.nodePositions.get(p.tgtId);
            if (!srcPos || !tgtPos) { continue; }

            const x = srcPos.x + (tgtPos.x - srcPos.x) * p.progress;
            const y = srcPos.y + (tgtPos.y - srcPos.y) * p.progress;

            const alpha = p.progress < 0.15 ? p.progress / 0.15
                        : p.progress > 0.85 ? (1 - p.progress) / 0.15
                        : 1.0;

            edgeFlowGfx.circle(x, y, 3);
            edgeFlowGfx.fill({ color: p.color, alpha: alpha * 0.12 });
            edgeFlowGfx.circle(x, y, 1.2);
            edgeFlowGfx.fill({ color: 0xffffff, alpha: alpha * 0.6 });
        }
    };
    _app.ticker.add(edgeFlowTickerFn);
}

export function stopEdgeFlow() {
    if (edgeFlowTickerFn) {
        _app.ticker.remove(edgeFlowTickerFn);
        edgeFlowTickerFn = null;
    }
    edgeFlowParticles = [];
    if (edgeFlowGfx) {
        edgeFlowGfx.clear();
        edgeFlowGfx = null;
    }
}

// ─── アニメーションヘルパー ──────────────────────────────

/** スケールアニメーション (V5 Hover Feedback) */
export function animateScale(target: Container, from: number, to: number, duration: number) {
    const startTime = performance.now();
    const tick = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 2);
        const val = from + (to - from) * ease;
        target.scale.set(val, val);
        if (t < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}

/** クリック波紋エフェクト (V5) */
export function triggerClickRipple(worldX: number, worldY: number, color: number) {
    const rippleGfx = new Graphics();
    _viewport.addChild(rippleGfx);

    const startTime = performance.now();
    const duration = 400;
    const maxRadius = 60;

    const animateRipple = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        rippleGfx.clear();
        const radius = ease * maxRadius;
        const alpha = (1 - t) * 0.5;

        rippleGfx.circle(worldX, worldY, radius);
        rippleGfx.stroke({ width: 1.5, color, alpha });

        if (t < 0.5) {
            rippleGfx.circle(worldX, worldY, radius * 0.5);
            rippleGfx.fill({ color, alpha: (0.5 - t) * 0.1 });
        }

        if (t < 1) {
            requestAnimationFrame(animateRipple);
        } else {
            _viewport.removeChild(rippleGfx);
            rippleGfx.destroy();
        }
    };
    requestAnimationFrame(animateRipple);
}

/** エラー時の赤フラッシュ (V5) */
export function triggerErrorFlash() {
    const flashGfx = new Graphics();
    flashGfx.rect(0, 0, window.innerWidth, window.innerHeight);
    flashGfx.fill({ color: 0xff2222, alpha: 0.15 });
    _app.stage.addChild(flashGfx);

    const startTime = performance.now();
    const duration = 500;
    const flash = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        flashGfx.alpha = (1 - t);
        if (t < 1) {
            requestAnimationFrame(flash);
        } else {
            _app.stage.removeChild(flashGfx);
            flashGfx.destroy();
        }
    };
    requestAnimationFrame(flash);
}
