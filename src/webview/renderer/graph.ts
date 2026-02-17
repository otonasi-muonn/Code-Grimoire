// ─── Ghost Trail + Graph Rendering ──────────────────────
import { Graphics, Text, TextStyle, Container, FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { GraphNode, RuneMode } from '../../shared/types.js';
import { state } from '../core/state.js';
import { getNodeColor, getNodeGlowColor, getRingAlpha } from '../utils/color.js';
import { createSmartText } from '../utils/font.js';
import { drawDashedLine, getNodeSides, drawRingGuides, drawBubbleGroups } from '../utils/drawing.js';
import { animateScale, triggerClickRipple, startEdgeFlow, stopEdgeFlow } from './effects.js';
import { dimmedNodes } from '../ui/search.js';

/** 外部から注入される関数・オブジェクト参照 */
let _viewport: Viewport;
let _nodeContainer: Container;
let _edgeContainer: Container;
let _ringContainer: Container;
let _minimapGfx: Graphics | null = null;

let _summonNode: (nodeId: string) => void;
let _openDetailPanel: (nodeId: string) => void;
let _refreshMinimap: () => void;

/** 選択中ノードID (Detail Panel 連動) */
export let selectedNodeId: string | null = null;
export function setSelectedNodeId(id: string | null) { selectedNodeId = id; }

export function setGraphContext(ctx: {
    viewport: Viewport;
    nodeContainer: Container;
    edgeContainer: Container;
    ringContainer: Container;
    summonNode: (nodeId: string) => void;
    openDetailPanel: (nodeId: string) => void;
    refreshMinimap: () => void;
}) {
    _viewport = ctx.viewport;
    _nodeContainer = ctx.nodeContainer;
    _edgeContainer = ctx.edgeContainer;
    _ringContainer = ctx.ringContainer;
    _summonNode = ctx.summonNode;
    _openDetailPanel = ctx.openDetailPanel;
    _refreshMinimap = ctx.refreshMinimap;
}

export function setMinimapGfx(gfx: Graphics | null) {
    _minimapGfx = gfx;
}

// ─── Ghost Nodes (探索軌跡) ──────────────────────────────
function drawGhostTrail() {
    if (state.breadcrumbs.length < 2) { return; }

    const ghostGfx = new Graphics();
    const trail = state.breadcrumbs;
    let prevPos: { x: number; y: number } | null = null;

    for (let i = 0; i < trail.length; i++) {
        const crumb = trail[i];
        const pos = state.nodePositions.get(crumb.nodeId);
        if (!pos) { prevPos = null; continue; }

        const isCurrent = i === trail.length - 1;
        const age = (trail.length - 1 - i) / trail.length;

        if (!isCurrent) {
            const ghostAlpha = 0.15 + (1 - age) * 0.2;
            ghostGfx.circle(pos.x, pos.y, 18 - age * 8);
            ghostGfx.fill({ color: 0x44aaff, alpha: ghostAlpha * 0.4 });
            ghostGfx.circle(pos.x, pos.y, 10 - age * 4);
            ghostGfx.stroke({ width: 1.5, color: 0x44aaff, alpha: ghostAlpha });

            const ghostLabel = createSmartText(crumb.label, { fontSize: 8, fill: 0x446688 });
            ghostLabel.anchor.set(0.5, 0.5);
            ghostLabel.position.set(pos.x, pos.y - 20);
            ghostLabel.alpha = 0.3 + (1 - age) * 0.3;
            _edgeContainer.addChild(ghostLabel);
        }

        if (prevPos) {
            const segments = 12;
            const dx = pos.x - prevPos.x;
            const dy = pos.y - prevPos.y;
            for (let s = 0; s < segments; s++) {
                if (s % 2 === 0) {
                    const t1 = s / segments;
                    const t2 = (s + 1) / segments;
                    ghostGfx.moveTo(prevPos.x + dx * t1, prevPos.y + dy * t1);
                    ghostGfx.lineTo(prevPos.x + dx * t2, prevPos.y + dy * t2);
                    ghostGfx.stroke({
                        width: 1.5,
                        color: 0x3388bb,
                        alpha: 0.2 + (1 - age) * 0.15,
                    });
                }
            }
        }
        prevPos = pos;
    }

    _edgeContainer.addChild(ghostGfx);
}

// ─── グラフ描画 ──────────────────────────────────────────
export function renderGraph() {
    const graph = state.graph;
    if (!graph) { return; }

    _nodeContainer.removeChildren();
    _edgeContainer.removeChildren();

    drawRingGuides(_ringContainer);

    if (state.layoutMode === 'balloon' && state.bubbleGroups.length > 0) {
        drawBubbleGroups(_ringContainer);
    }

    // エッジ描画
    const edgeGfx = new Graphics();
    const cycleNodeIds = new Set<string>();
    if (state.graph?.circularDeps) {
        for (const cycle of state.graph.circularDeps) {
            for (const id of cycle.path) { cycleNodeIds.add(id); }
        }
    }

    const isHierarchyLayout = state.layoutMode === 'tree' || state.layoutMode === 'balloon';

    if (isHierarchyLayout && state.hierarchyEdges.length > 0) {
        for (const hEdge of state.hierarchyEdges) {
            const parentPos = state.nodePositions.get(hEdge.parent);
            const childPos = state.nodePositions.get(hEdge.child);
            if (!parentPos || !childPos) { continue; }

            edgeGfx.moveTo(parentPos.x, parentPos.y);

            if (state.layoutMode === 'tree') {
                const midY = (parentPos.y + childPos.y) / 2;
                edgeGfx.quadraticCurveTo(parentPos.x, midY, childPos.x, childPos.y);
            } else {
                edgeGfx.lineTo(childPos.x, childPos.y);
            }
            edgeGfx.stroke({ width: 2.5, color: 0x446688, alpha: 0.5 });
        }

        for (const edge of graph.edges) {
            const srcPos = state.nodePositions.get(edge.source);
            const tgtPos = state.nodePositions.get(edge.target);
            if (!srcPos || !tgtPos) { continue; }

            const isTypeOnly = edge.kind === 'type-import';
            const isCycleEdge = state.runeMode === 'architecture' &&
                cycleNodeIds.has(edge.source) && cycleNodeIds.has(edge.target);

            if (isCycleEdge) {
                edgeGfx.moveTo(srcPos.x, srcPos.y);
                edgeGfx.lineTo(tgtPos.x, tgtPos.y);
                edgeGfx.stroke({ width: 3, color: 0xff3333, alpha: 0.65 });
            } else if (isTypeOnly) {
                drawDashedLine(edgeGfx, srcPos.x, srcPos.y, tgtPos.x, tgtPos.y, 6, 4);
                edgeGfx.stroke({ width: 1, color: 0x334466, alpha: 0.18 });
            } else {
                edgeGfx.moveTo(srcPos.x, srcPos.y);
                edgeGfx.lineTo(tgtPos.x, tgtPos.y);
                edgeGfx.stroke({ width: 1, color: 0x334466, alpha: 0.15 });
            }
        }
    } else {
        for (const edge of graph.edges) {
            const srcPos = state.nodePositions.get(edge.source);
            const tgtPos = state.nodePositions.get(edge.target);
            if (!srcPos || !tgtPos) { continue; }

            const srcNode = graph.nodes.find(n => n.id === edge.source);
            const isTypeOnly = edge.kind === 'type-import';

            if (state.currentLOD === 'far' && isTypeOnly) { continue; }

            const isCycleEdge = state.runeMode === 'architecture' &&
                cycleNodeIds.has(edge.source) && cycleNodeIds.has(edge.target);

            let color: number;
            let alpha: number;
            let width: number;

            if (isCycleEdge) {
                color = 0xff3333;
                alpha = state.currentLOD === 'far' ? 0.5 : 0.8;
                width = state.currentLOD === 'far' ? 2 : 4;
            } else if (state.runeMode === 'architecture' && cycleNodeIds.size > 0) {
                color = srcNode ? getNodeColor(srcNode) : 0x334466;
                alpha = 0.08;
                width = 0.8;
            } else {
                color = srcNode ? getNodeColor(srcNode) : 0x334466;
                if (state.currentLOD === 'far') {
                    alpha = 0.15;
                    width = 0.8;
                } else {
                    alpha = isTypeOnly ? 0.15 : 0.4;
                    width = isTypeOnly ? 1 : 2;
                }
            }

            if (isTypeOnly && state.currentLOD !== 'far') {
                drawDashedLine(edgeGfx, srcPos.x, srcPos.y, tgtPos.x, tgtPos.y, 6, 4);
                edgeGfx.stroke({ width, color, alpha });
            } else {
                edgeGfx.moveTo(srcPos.x, srcPos.y);
                if (state.currentLOD === 'far') {
                    edgeGfx.lineTo(tgtPos.x, tgtPos.y);
                } else {
                    const midX = (srcPos.x + tgtPos.x) / 2;
                    const midY = (srcPos.y + tgtPos.y) / 2;
                    const bundleStrength = 0.25;
                    const cpX = midX * (1 - bundleStrength);
                    const cpY = midY * (1 - bundleStrength);
                    edgeGfx.quadraticCurveTo(cpX, cpY, tgtPos.x, tgtPos.y);
                }
                edgeGfx.stroke({ width, color, alpha });
            }
        }
    }
    _edgeContainer.addChild(edgeGfx);

    // ノード描画
    state.nodeContainerMap.clear();
    for (const node of graph.nodes) {
        const pos = state.nodePositions.get(node.id);
        if (!pos) { continue; }

        const ring = state.nodeRings.get(node.id) || 'global';
        const nodeGfx = createNodeGraphics(node, pos, ring);

        if (dimmedNodes.size > 0 && dimmedNodes.has(node.id)) {
            nodeGfx.alpha = 0.12;
        }

        if (selectedNodeId && node.id !== selectedNodeId) {
            nodeGfx.alpha = Math.min(nodeGfx.alpha, 0.35);
        }

        if (state.glowConnectedIds.has(node.id)) {
            nodeGfx.alpha = 1.0;
        }

        state.nodeContainerMap.set(node.id, nodeGfx);
        _nodeContainer.addChild(nodeGfx);
    }

    drawGhostTrail();

    if (_minimapGfx) { _refreshMinimap(); }

    stopEdgeFlow();
    if (!state.isLoading) { startEdgeFlow(_edgeContainer); }
}

function createNodeGraphics(
    node: GraphNode,
    pos: { x: number; y: number },
    ring: 'focus' | 'context' | 'global'
): Container {
    const container = new Container();
    container.position.set(pos.x, pos.y);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.alpha = getRingAlpha(ring);

    const baseColor = getNodeColor(node);
    const glowColor = getNodeGlowColor(node);
    const isFocus = ring === 'focus';
    const lod = state.currentLOD;

    let nodeRadius = Math.max(12, Math.min(60, 8 + Math.sqrt(node.lineCount) * 3));
    if (isFocus) { nodeRadius *= 1.4; }

    // ═══════════════════════════════════════════════════
    // LOD: Far — ドットのみ
    // ═══════════════════════════════════════════════════
    if (lod === 'far') {
        const dot = new Graphics();
        dot.circle(0, 0, Math.max(4, nodeRadius * 0.35));
        dot.fill({ color: baseColor, alpha: 0.7 });
        container.addChild(dot);

        if (state.runeMode === 'architecture' && node.inCycle) {
            dot.tint = 0xff3333;
            container.alpha = 1.0;
        } else if (state.runeMode === 'security' && node.securityWarnings && node.securityWarnings.length > 0) {
            dot.tint = 0xff8800;
            container.alpha = 1.0;
        } else if (state.runeMode === 'refactoring' && node.gitCommitCount && node.gitCommitCount > 0) {
            const heat = Math.min(1.0, node.gitCommitCount / 30);
            dot.tint = heat > 0.5 ? 0xff4400 : 0xffaa00;
            container.alpha = 0.3 + heat * 0.7;
        } else if (state.runeMode !== 'default') {
            dot.tint = 0x556677;
            container.alpha = 0.35;
        }

        const degree = state.nodeDegree.get(node.id) || 0;
        const isHub = degree >= 5;
        if (isFocus || isHub) {
            const miniLabel = createSmartText(node.label, { fontSize: 8, fill: glowColor });
            miniLabel.anchor.set(0.5, 0);
            miniLabel.position.set(0, Math.max(4, nodeRadius * 0.35) + 4);
            container.addChild(miniLabel);
        }

        attachNodeInteraction(container, node, ring);
        return container;
    }

    // ═══════════════════════════════════════════════════
    // LOD: Mid — フルノード描画
    // ═══════════════════════════════════════════════════
    const outerGfx = new Graphics();
    outerGfx.circle(0, 0, nodeRadius + (isFocus ? 8 : 4));
    outerGfx.fill({ color: glowColor, alpha: isFocus ? 0.3 : 0.12 });
    container.addChild(outerGfx);

    const gfx = new Graphics();
    const sides = getNodeSides(node);
    if (sides >= 20) {
        gfx.circle(0, 0, nodeRadius);
    } else {
        const points: number[] = [];
        for (let i = 0; i < sides; i++) {
            const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
            points.push(Math.cos(angle) * nodeRadius, Math.sin(angle) * nodeRadius);
        }
        gfx.poly(points);
    }
    gfx.fill({ color: baseColor, alpha: isFocus ? 0.4 : 0.2 });
    gfx.stroke({ width: isFocus ? 3 : 2, color: baseColor, alpha: 0.8 });
    container.addChild(gfx);

    const labelFontSize = Math.max(10, Math.min(14, nodeRadius * 0.8));
    const label = createSmartText(node.label, { fontSize: labelFontSize, fill: glowColor, align: 'center' });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, nodeRadius + 16);
    container.addChild(label);

    let nextBadgeY = nodeRadius + 30;
    if (ring !== 'global' && node.exports.length > 0) {
        const badge = createSmartText(`${node.exports.length} exports`, { fontSize: 9, fill: 0xaabbcc });
        badge.anchor.set(0.5, 0.5);
        badge.position.set(0, nextBadgeY);
        container.addChild(badge);
        nextBadgeY += 12;
    }

    // ─── Rune モード別オーバーレイ ───────────────────────
    if (state.runeMode === 'architecture' && node.inCycle) {
        const cycleRing = new Graphics();
        cycleRing.circle(0, 0, nodeRadius + 10);
        cycleRing.stroke({ width: 2, color: 0xff3333, alpha: 0.9 });
        container.addChild(cycleRing);

        const cycleLabel = new Text({
            text: '⟳ cycle',
            style: new TextStyle({ fontSize: 9, fill: 0xff5555, fontFamily: 'Consolas, monospace' }),
        });
        cycleLabel.anchor.set(0.5, 0.5);
        cycleLabel.position.set(0, -(nodeRadius + 14));
        container.addChild(cycleLabel);
        container.alpha = 1.0;
    } else if (state.runeMode === 'architecture' && !node.inCycle) {
        gfx.tint = 0x556677;
        if (outerGfx) { outerGfx.tint = 0x556677; }
        container.alpha = 0.35;
    }

    if (state.runeMode === 'architecture' && node.directoryGroup) {
        const dirLabel = new Text({
            text: `📁 ${node.directoryGroup}`,
            style: new TextStyle({ fontSize: 8, fill: 0x6688aa, fontFamily: 'Consolas, monospace' }),
        });
        dirLabel.anchor.set(0.5, 0.5);
        dirLabel.position.set(0, nodeRadius + (ring !== 'global' && node.exports.length > 0 ? 42 : 30));
        container.addChild(dirLabel);
    }

    if (state.runeMode === 'security' && node.securityWarnings && node.securityWarnings.length > 0) {
        const warnRing = new Graphics();
        warnRing.circle(0, 0, nodeRadius + 10);
        warnRing.stroke({ width: 3, color: 0xff8800, alpha: 0.9 });
        container.addChild(warnRing);

        const warningCount = node.securityWarnings.length;
        const warnLabel = new Text({
            text: `⚠ ${warningCount} warning${warningCount > 1 ? 's' : ''}`,
            style: new TextStyle({ fontSize: 9, fill: 0xffaa33, fontFamily: 'Consolas, monospace' }),
        });
        warnLabel.anchor.set(0.5, 0.5);
        warnLabel.position.set(0, -(nodeRadius + 14));
        container.addChild(warnLabel);
        container.alpha = 1.0;
    } else if (state.runeMode === 'security') {
        gfx.tint = 0x556677;
        if (outerGfx) { outerGfx.tint = 0x556677; }
        container.alpha = 0.35;
    }

    if (state.runeMode === 'refactoring' && node.gitCommitCount && node.gitCommitCount > 0) {
        const heat = Math.min(1.0, node.gitCommitCount / 30);
        const heatColor = heat > 0.5 ? 0xff4400 : 0xffaa00;
        const heatRing = new Graphics();
        heatRing.circle(0, 0, nodeRadius + 6);
        heatRing.fill({ color: heatColor, alpha: heat * 0.3 });
        container.addChild(heatRing);

        const hotLabel = new Text({
            text: `🔥 ${node.gitCommitCount} commits`,
            style: new TextStyle({ fontSize: 8, fill: heatColor, fontFamily: 'Consolas, monospace' }),
        });
        hotLabel.anchor.set(0.5, 0.5);
        hotLabel.position.set(0, -(nodeRadius + 14));
        container.addChild(hotLabel);
        container.alpha = 0.3 + heat * 0.7;
    } else if (state.runeMode === 'refactoring') {
        gfx.tint = 0x556677;
        if (outerGfx) { outerGfx.tint = 0x556677; }
        container.alpha = 0.35;
    }

    if (state.runeMode === 'optimization') {
        const risk = node.treeShakingRisk || 0;
        if (risk > 0) {
            const riskNorm = risk / 100;
            const riskColor = risk >= 50 ? 0xff4444 : risk >= 25 ? 0xffaa22 : 0x44ff88;
            const optRing = new Graphics();
            optRing.circle(0, 0, nodeRadius + 8);
            optRing.fill({ color: riskColor, alpha: riskNorm * 0.3 });
            optRing.stroke({ width: 2, color: riskColor, alpha: 0.7 });
            container.addChild(optRing);

            const labels: string[] = [];
            if (node.isBarrel) { labels.push('📦 barrel'); }
            if (node.hasSideEffects) { labels.push('⚡ side-effect'); }
            labels.push(`risk: ${risk}`);

            const optLabel = new Text({
                text: labels.join(' | '),
                style: new TextStyle({ fontSize: 8, fill: riskColor, fontFamily: 'Consolas, monospace' }),
            });
            optLabel.anchor.set(0.5, 0.5);
            optLabel.position.set(0, -(nodeRadius + 14));
            container.addChild(optLabel);
            container.alpha = 0.3 + riskNorm * 0.7;
        } else {
            gfx.tint = 0x556677;
            if (outerGfx) { outerGfx.tint = 0x556677; }
            container.alpha = 0.35;
        }
    }

    attachNodeInteraction(container, node, ring, gfx, outerGfx);
    return container;
}

/** ノードにインタラクションを付与する共通関数 */
function attachNodeInteraction(
    container: Container,
    node: GraphNode,
    ring: 'focus' | 'context' | 'global',
    gfx?: Graphics,
    outerGfx?: Graphics,
) {
    const baseScale = container.scale.x;

    container.on('pointerover', () => {
        if (dimmedNodes.size > 0) { return; }

        state.hoveredNodeId = node.id;
        if (gfx) { gfx.tint = 0xffffff; }
        if (outerGfx) { outerGfx.alpha = 0.6; }
        container.alpha = 1.0;

        animateScale(container, baseScale, baseScale * 1.15, 120);

        if (state.graph) {
            const connectedIds = new Set<string>();
            for (const edge of state.graph.edges) {
                if (edge.source === node.id) { connectedIds.add(edge.target); }
                if (edge.target === node.id) { connectedIds.add(edge.source); }
            }
            state.glowConnectedIds = connectedIds;
            for (const cid of connectedIds) {
                const c = state.nodeContainerMap.get(cid);
                if (c) { c.alpha = Math.min(1.0, c.alpha + 0.4); }
            }
        }
    });

    container.on('pointerout', () => {
        if (dimmedNodes.size > 0) { return; }

        if (state.hoveredNodeId === node.id) { state.hoveredNodeId = null; }
        if (gfx) { gfx.tint = 0xffffff; }
        if (outerGfx) { outerGfx.alpha = 1; }
        container.alpha = getRingAlpha(ring);

        animateScale(container, container.scale.x, baseScale, 120);

        for (const cid of state.glowConnectedIds) {
            const c = state.nodeContainerMap.get(cid);
            if (c) {
                const cRing = state.nodeRings.get(cid) || 'global';
                c.alpha = getRingAlpha(cRing);
            }
        }
        state.glowConnectedIds.clear();
    });

    container.on('pointertap', (e: FederatedPointerEvent) => {
        const pos = state.nodePositions.get(node.id);
        if (pos) { triggerClickRipple(pos.x, pos.y, getNodeColor(node)); }
        _summonNode(node.id);
        _openDetailPanel(node.id);
    });

    container.on('rightclick', (e: FederatedPointerEvent) => {
        e.preventDefault?.();
    });
}
