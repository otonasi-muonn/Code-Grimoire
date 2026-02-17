// ─── 色ユーティリティ ────────────────────────────────────
import type { GraphNode } from '../../shared/types.js';

export function stringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 360);
}

export function hslToHex(h: number, s: number, l: number): number {
    const hue = h / 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + hue * 12) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color);
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
}

export function getNodeColor(node: GraphNode): number {
    const hue = stringToHue(node.relativePath);
    return hslToHex(hue, 0.7, 0.55);
}

export function getNodeGlowColor(node: GraphNode): number {
    const hue = (stringToHue(node.relativePath) + 20) % 360;
    return hslToHex(hue, 0.7, 0.65);
}

/** リングに基づくアルファ値 */
export function getRingAlpha(ring: 'focus' | 'context' | 'global'): number {
    switch (ring) {
        case 'focus': return 1.0;
        case 'context': return 0.75;
        case 'global': return 0.4;
    }
}
