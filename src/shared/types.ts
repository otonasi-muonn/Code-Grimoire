// ============================================================
// Code Grimoire - 共有型定義 (Shared Types)
// Extension (Node.js) と Webview (Browser) の両方で使用する
// ============================================================

// ─── グラフデータ構造 ───────────────────────────────────

/** ファイルノード（依存グラフの頂点） */
export interface GraphNode {
    /** 一意なID (ファイルの絶対パス) */
    id: string;
    /** 表示ラベル (ファイル名) */
    label: string;
    /** ファイルの絶対パス */
    filePath: string;
    /** 相対パス（ワークスペースルートからの） */
    relativePath: string;
    /** ノードの種別 */
    kind: NodeKind;
    /** エクスポートされたシンボル一覧 */
    exports: SymbolInfo[];
    /** ファイルの行数 */
    lineCount: number;
    /** 同心円上のリング配置 (Phase 2で使用) */
    ring?: 'focus' | 'context' | 'global';
}

/** シンボル情報 */
export interface SymbolInfo {
    name: string;
    kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'other';
    line: number;
    isDefault: boolean;
}

/** ノードの種別 */
export type NodeKind =
    | 'source'       // .ts / .tsx ソースファイル
    | 'declaration'  // .d.ts 型定義ファイル
    | 'config'       // tsconfig.json 等
    | 'package'      // package.json
    | 'external';    // node_modules 等の外部モジュール

/** 依存エッジ（依存グラフの辺） */
export interface GraphEdge {
    /** インポート元ファイルID */
    source: string;
    /** インポート先ファイルID */
    target: string;
    /** インポートされたシンボル名の一覧 (空配列 = * or side-effect import) */
    importedSymbols: string[];
    /** import の種類 */
    kind: EdgeKind;
}

/** エッジの種類 */
export type EdgeKind =
    | 'static-import'     // import { x } from '...'
    | 'dynamic-import'    // import('...')
    | 'type-import'       // import type { x } from '...'
    | 'side-effect'       // import '...'
    | 're-export';        // export { x } from '...'

/** 解析結果グラフ全体 */
export interface DependencyGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** ワークスペースルートパス */
    rootPath: string;
    /** 解析にかかった時間 (ms) */
    analysisTimeMs: number;
}

// ─── Extension -> Webview メッセージ ───────────────────

/** Phase 1: 即時構造 (package.json 等の軽量データ) */
export interface MsgInstantStructure {
    type: 'INSTANT_STRUCTURE';
    payload: {
        projectName: string;
        rootPath: string;
        fileCount: number;
    };
}

/** Phase 2: 完全なグラフデータ */
export interface MsgGraphData {
    type: 'GRAPH_DATA';
    payload: DependencyGraph;
}

/** 解析エラー */
export interface MsgAnalysisError {
    type: 'ANALYSIS_ERROR';
    payload: {
        message: string;
    };
}

/** Extension → Webview に送信するメッセージの Union */
export type ExtensionToWebviewMessage =
    | MsgInstantStructure
    | MsgGraphData
    | MsgAnalysisError;

// ─── Webview -> Extension メッセージ ───────────────────

/** ファイルへジャンプ */
export interface MsgJumpToFile {
    type: 'JUMP_TO_FILE';
    payload: {
        filePath: string;
        line?: number;
    };
}

/** ノードを中心に据える（Summoning） */
export interface MsgFocusNode {
    type: 'FOCUS_NODE';
    payload: {
        nodeId: string;
    };
}

/** 解析のリクエスト */
export interface MsgRequestAnalysis {
    type: 'REQUEST_ANALYSIS';
}

/** Webview → Extension に送信するメッセージの Union */
export type WebviewToExtensionMessage =
    | MsgJumpToFile
    | MsgFocusNode
    | MsgRequestAnalysis;

// ─── バイナリプロトコル (Transferable Objects) ─────────

/**
 * グラフデータをゼロコピーで転送するためのバイナリ表現。
 * ノード座標は Float32Array に格納し、Transferable として転送する。
 * レイアウト: [x0, y0, x1, y1, ...] (各ノード 2 float = 8 bytes)
 */
export interface BinaryGraphPayload {
    /** ノードID の順序配列 (座標配列のインデックスと対応) */
    nodeIds: string[];
    /** ノード座標 Float32Array: [x0, y0, x1, y1, ...] */
    positions: Float32Array;
    /** 追加メタデータ (ring 等) */
    meta: NodeMeta[];
}

export interface NodeMeta {
    id: string;
    ring: 'focus' | 'context' | 'global';
    lineCount: number;
    label: string;
    kind: NodeKind;
    exportCount: number;
}

// ─── Worker メッセージ (Main Thread <-> Web Worker) ────

/** Worker に送るシミュレーション開始メッセージ */
export interface WorkerMsgInit {
    type: 'INIT';
    payload: {
        nodes: WorkerNode[];
        edges: WorkerEdge[];
        focusNodeId: string | null;
    };
}

/** Worker に送るフォーカス変更メッセージ */
export interface WorkerMsgFocus {
    type: 'FOCUS';
    payload: {
        focusNodeId: string;
    };
}

/** Worker から返す座標更新メッセージ (Transferable) */
export interface WorkerMsgTick {
    type: 'TICK';
    payload: {
        /** [x0, y0, x1, y1, ...] */
        positions: Float32Array;
        /** シミュレーション進捗 (0.0 ~ 1.0, 1.0 = 完了) */
        progress: number;
    };
}

/** Worker から返すシミュレーション完了メッセージ */
export interface WorkerMsgDone {
    type: 'DONE';
    payload: {
        positions: Float32Array;
        /** ノードIDごとのリング情報 */
        rings: Record<string, 'focus' | 'context' | 'global'>;
    };
}

/** Worker に送る全メッセージの Union */
export type MainToWorkerMessage = WorkerMsgInit | WorkerMsgFocus;

/** Worker から返す全メッセージの Union */
export type WorkerToMainMessage = WorkerMsgTick | WorkerMsgDone;

/** Worker 内部で使用するノード表現 (d3-force 互換) */
export interface WorkerNode {
    id: string;
    ring: 'focus' | 'context' | 'global';
    lineCount: number;
    /** d3-force が利用する座標 (初期値 undefined → d3 が設定) */
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    /** d3-force の固定座標 */
    fx?: number | null;
    fy?: number | null;
}

/** Worker 内部で使用するエッジ表現 */
export interface WorkerEdge {
    source: string;
    target: string;
}
