// ─── LOD (Level of Detail) ───────────────────────────────
export type LODLevel = 'far' | 'mid';

export function getLODLevel(scale: number): LODLevel {
    if (scale < 0.3) { return 'far'; }
    return 'mid';
}
