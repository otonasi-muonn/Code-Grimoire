// ─── 状態管理 ────────────────────────────────────────────
import type { Container } from 'pixi.js';
import type { DependencyGraph, RuneMode, LayoutMode, HierarchyEdge, BubbleGroup } from '../../shared/types.js';
import type { LODLevel } from './lod.js';

export interface BreadcrumbEntry {
    nodeId: string;
    label: string;
}

export interface AppState {
    graph: DependencyGraph | null;
    projectName: string;
    isLoading: boolean;
    error: string | null;
    /** ノード位置キャッシュ (id -> {x, y}) */
    nodePositions: Map<string, { x: number; y: number }>;
    /** ノードのリング情報 */
    nodeRings: Map<string, 'focus' | 'context' | 'global'>;
    /** ホバー中のノードID */
    hoveredNodeId: string | null;
    /** フォーカス中のノードID */
    focusNodeId: string | null;
    /** Worker 準備完了フラグ */
    workerReady: boolean;
    /** ノードID の順序配列（Worker 座標との対応用） */
    nodeOrder: string[];
    /** 現在の Rune モード */
    runeMode: RuneMode;
    /** 現在の LOD レベル */
    currentLOD: LODLevel;
    /** 現在のレイアウトモード (V3) */
    layoutMode: LayoutMode;
    /** 階層エッジ (Tree/Balloon 時のみ、V3.5) */
    hierarchyEdges: HierarchyEdge[];
    /** Bubble レイアウト時のディレクトリグループ円 (V6) */
    bubbleGroups: BubbleGroup[];
    /** 探索履歴 (Breadcrumbs) */
    breadcrumbs: BreadcrumbEntry[];
    /** ノードごとの接続数キャッシュ (Smart Labeling 用) */
    nodeDegree: Map<string, number>;
    /** ノードID → Container 参照 (Interactive Glow 用) */
    nodeContainerMap: Map<string, Container>;
    /** ホバー中の接続ノードID群 (Interactive Glow 用) */
    glowConnectedIds: Set<string>;
}

export const state: AppState = {
    graph: null,
    projectName: 'Loading...',
    isLoading: true,
    error: null,
    nodePositions: new Map(),
    nodeRings: new Map(),
    hoveredNodeId: null,
    focusNodeId: null,
    workerReady: false,
    nodeOrder: [],
    runeMode: 'default',
    currentLOD: 'mid',
    layoutMode: 'force',
    hierarchyEdges: [],
    bubbleGroups: [],
    breadcrumbs: [],
    nodeDegree: new Map(),
    nodeContainerMap: new Map(),
    glowConnectedIds: new Set(),
};
