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
    /** ファイルサイズ (bytes) */
    fileSize?: number;
    /** 同心円上のリング配置 (Phase 2で使用) */
    ring?: 'focus' | 'context' | 'global';

    // ─── Phase 3: Intelligence ─────────────────────────
    /** Git 変更回数 (commit 数) */
    gitCommitCount?: number;
    /** Git 最終更新日 (ISO 8601) */
    gitLastModified?: string;
    /** 循環参照を含むかどうか */
    inCycle?: boolean;
    /** ディレクトリグループ (Architecture Rune 用: e.g. "components", "hooks") */
    directoryGroup?: string;
    /** セキュリティ警告一覧 (Security Rune 用) */
    securityWarnings?: SecurityWarning[];
    /** 関数レベルのシンボル依存 (関数呼び出しグラフ用) */
    functionDeps?: FunctionDep[];

    // ─── Phase 5: Optimization ─────────────────────────
    /** Barrel ファイルかどうか (index.ts で re-export のみ) */
    isBarrel?: boolean;
    /** Tree-shaking リスクスコア (0-100, 高いほどリスク大) */
    treeShakingRisk?: number;
    /** 副作用インポートを含むか */
    hasSideEffects?: boolean;
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
    /** データ受け渡しに使われるシンボル名 (関数引数・戻り値の型など、分析モード用) */
    dataSymbols?: string[];
}

/** エッジの種類 */
export type EdgeKind =
    | 'static-import'     // import { x } from '...'
    | 'dynamic-import'    // import('...')
    | 'type-import'       // import type { x } from '...'
    | 'side-effect'       // import '...'
    | 're-export';        // export { x } from '...'

// ─── Phase 3: Intelligence 型定義 ──────────────────────

/** セキュリティ警告 */
export interface SecurityWarning {
    /** 警告の種類 */
    kind: 'dangerous-function' | 'taint-source' | 'eval-usage' | 'innerHTML';
    /** 該当行 */
    line: number;
    /** 説明 */
    message: string;
    /** 対象シンボル名 */
    symbol: string;
}

/** 関数レベルの依存情報 */
export interface FunctionDep {
    /** 呼び出し元の関数名 */
    callerName: string;
    /** 呼び出し先のシンボル名 */
    calleeName: string;
    /** 呼び出し先が属するファイルID (外部ファイルの場合) */
    targetFileId?: string;
    /** 行番号 */
    line: number;
}

/** 循環参照パス */
export interface CircularDependency {
    /** サイクルを構成するノードID群 (順序付き) */
    path: string[];
}

/** Rune モード */
export type RuneMode =
    | 'default'          // 通常モード（Phase 2 の表示）
    | 'architecture'     // 構造の紋章: 循環参照・モジュール境界
    | 'security'         // セキュリティの紋章: Taint・危険関数
    | 'optimization'     // 最適化の紋章: Tree-shaking スコア
    | 'analysis';        // 分析の紋章: データ受け渡し可視化

/** レイアウトモード (V3) */
export type LayoutMode =
    | 'force'      // Mandala (魔法陣): d3-force 物理演算
    | 'balloon'    // Bubble (泡宇宙): パック円充填
    | 'galaxy';    // Galaxy (銀河): BFS深度ベースの放射状配置

/** 泡宇宙のサイズモード */
export type BubbleSizeMode =
    | 'lineCount'  // 行数でサイズ決定
    | 'fileSize';  // ファイルサイズでサイズ決定

/** Git Hotspot 情報 */
export interface GitHotspot {
    /** ファイルの相対パス */
    relativePath: string;
    /** commit 数 */
    commitCount: number;
    /** 最終更新日 (ISO 8601) */
    lastModified: string;
}

/** 解析結果グラフ全体 */
export interface DependencyGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** ワークスペースルートパス */
    rootPath: string;
    /** 解析にかかった時間 (ms) */
    analysisTimeMs: number;

    // ─── Phase 3 ───────────────────────────────────────
    /** 検出された循環参照一覧 */
    circularDeps?: CircularDependency[];
    /** Git Hotspot 一覧 */
    gitHotspots?: GitHotspot[];
}

// ─── Extension -> Webview メッセージ ───────────────────

/** Phase 1: 即時構造 (package.json 等の軽量データ) */
export interface MsgInstantStructure {
    type: 'INSTANT_STRUCTURE';
    payload: {
        projectName: string;
        rootPath: string;
        fileCount: number;
        /** VS Code の UI 言語 (e.g. 'en', 'ja') */
        language: string;
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
    | MsgAnalysisError
    | MsgCodePeekResponse;

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

/** Rune モード切り替え (Webview 内部イベント、Extension に通知) */
export interface MsgRuneModeChange {
    type: 'RUNE_MODE_CHANGE';
    payload: {
        mode: RuneMode;
    };
}

/** Code Peek: コードプレビューリクエスト (Webview → Extension) */
export interface MsgCodePeekRequest {
    type: 'CODE_PEEK_REQUEST';
    payload: {
        filePath: string;
        /** 取得する最大行数 (デフォルト: 50) */
        maxLines?: number;
    };
}

/** Code Peek: コードプレビュー応答 (Extension → Webview) */
export interface MsgCodePeekResponse {
    type: 'CODE_PEEK_RESPONSE';
    payload: {
        filePath: string;
        /** ファイルの先頭N行のソースコード */
        code: string;
        /** 全体行数 */
        totalLines: number;
        /** 言語 (拡張子から推定) */
        language: string;
    };
}

/** Webview → Extension に送信するメッセージの Union */
export type WebviewToExtensionMessage =
    | MsgJumpToFile
    | MsgFocusNode
    | MsgRequestAnalysis
    | MsgRuneModeChange
    | MsgCodePeekRequest;

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
        /** 初期レイアウトモード (V3) — 省略時は 'force' */
        layoutMode?: LayoutMode;
        /** 泡宇宙のサイズモード — 省略時は 'lineCount' */
        bubbleSizeMode?: BubbleSizeMode;
    };
}

/** Worker に送るフォーカス変更メッセージ */
export interface WorkerMsgFocus {
    type: 'FOCUS';
    payload: {
        focusNodeId: string;
    };
}

/** Worker に送るレイアウトモード変更メッセージ (V3) */
export interface WorkerMsgLayoutChange {
    type: 'LAYOUT_CHANGE';
    payload: {
        mode: LayoutMode;
        /** 泡宇宙のサイズモード — 省略時は 'lineCount' */
        bubbleSizeMode?: BubbleSizeMode;
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
        /** 階層エッジ (Balloon/Galaxy レイアウト時のみ。ディレクトリ親子関係) */
        hierarchyEdges?: HierarchyEdge[];
        /** Bubble レイアウト時のディレクトリグループ円 */
        bubbleGroups?: BubbleGroup[];
    };
}

/** ディレクトリ階層エッジ (Smart Edges V3.5) */
export interface HierarchyEdge {
    /** 親ノード (ファイル) の ID */
    parent: string;
    /** 子ノード (ファイル) の ID */
    child: string;
}

/** Bubble レイアウトのディレクトリグループ円 (V6) */
export interface BubbleGroup {
    /** ディレクトリ名 (表示ラベル) */
    label: string;
    /** 中心X座標 */
    x: number;
    /** 中心Y座標 */
    y: number;
    /** 半径 */
    r: number;
    /** 階層の深さ (0=ルート) */
    depth: number;
    /** このディレクトリ直下のファイルノードIDリスト */
    childNodeIds: string[];
}

/** Worker に送る泡宇宙サイズモード変更メッセージ */
export interface WorkerMsgBubbleSizeChange {
    type: 'BUBBLE_SIZE_CHANGE';
    payload: {
        bubbleSizeMode: BubbleSizeMode;
    };
}

/** Worker に送る全メッセージの Union */
export type MainToWorkerMessage = WorkerMsgInit | WorkerMsgFocus | WorkerMsgLayoutChange | WorkerMsgBubbleSizeChange;

/** Worker から返す全メッセージの Union */
export type WorkerToMainMessage = WorkerMsgTick | WorkerMsgDone;

/** Worker 内部で使用するノード表現 (d3-force 互換) */
export interface WorkerNode {
    id: string;
    ring: 'focus' | 'context' | 'global';
    lineCount: number;
    /** ファイルサイズ (bytes) — 泡宇宙のサイズモード用 */
    fileSize?: number;
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
