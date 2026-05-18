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

    // ─── Phase 5: Optimization ─────────────────────────
    /** Barrel ファイルかどうか (index.ts で re-export のみ) */
    isBarrel?: boolean;
    /** Tree-shaking リスクスコア (0-100, 高いほどリスク大) */
    treeShakingRisk?: number;
    /** 副作用インポートを含むか */
    hasSideEffects?: boolean;

    // ─── v2 改修: 巨大ファイル警告 (T-03) ───────────────
    /**
     * 行数ベースの巨大ファイル警告レベル。
     * - 'normal':   閾値未満
     * - 'warning':  HUGE_FILE_LINE_THRESHOLD (500行) 以上
     * - 'critical': MASSIVE_FILE_LINE_THRESHOLD (1000行) 以上
     */
    hugeFileLevel?: HugeFileLevel;

    // ─── v2 改修: Git Hotspot パーセンタイル (T-05) ─────
    /**
     * 循環参照を持つノードのうち、commit 数で上位パーセンタイル
     * (デフォルト 75%) に入る場合 true。Architecture Rune で強調表示。
     */
    isHotSpot?: boolean;

    // ─── v2 改修: 直近の commit 活動分布 (P1-A) ─────────
    /**
     * 直近 N 期間 (デフォルト 8 期間 × 30 日 ≒ 8 ヶ月) の commit 数バケット。
     * 配列の古い→新しい順。Detail Panel の Activity バーで実データ表示に使う。
     * Git 履歴が無い場合は undefined。
     */
    gitRecentActivity?: number[];
}

/** 巨大ファイル警告レベル (v2: T-03) */
export type HugeFileLevel = 'normal' | 'warning' | 'critical';

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

// ─── Phase 3: Intelligence 型定義 ──────────────────────

/** セキュリティ警告の重要度 (v2: T-04) */
export type SecuritySeverity = 'info' | 'warning' | 'critical';

/** セキュリティ警告の種別 */
export type SecurityWarningKind =
    | 'dangerous-function'
    | 'taint-source'
    | 'eval-usage'
    | 'innerHTML'
    /** v2: Source → Sink 流入の検出 (T-07 で実装、採用時のみ) */
    | 'taint-flow';

/** セキュリティ警告 */
export interface SecurityWarning {
    /** 警告の種類 */
    kind: SecurityWarningKind;
    /** 該当行 */
    line: number;
    /** 説明 */
    message: string;
    /** 対象シンボル名 */
    symbol: string;
    /**
     * v2 改修 (T-04): 重要度。既存生成箇所にも漏れなく付与する。
     * - 'info':     process.env / fs.readFile 等の情報源
     * - 'warning':  req.body / location.search / localStorage 等の汚染源
     * - 'critical': eval / dangerouslySetInnerHTML / innerHTML 等の危険関数
     */
    severity: SecuritySeverity;
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
    /**
     * v2 改修 (P1-A): 直近 N 期間 (デフォルト 8 期間 × 30 日) の commit 数バケット。
     * 配列の古い→新しい順。Activity ヒートバーの実データソース。
     */
    recentActivity?: number[];
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
        /**
         * v2 改修 (T-08): オンボーディングツアーを既に表示済みかどうか。
         * Extension Host の globalState から読み出した値。
         * true なら Webview は初回ツアーを表示しない。
         */
        onboardingShown?: boolean;
    };
}

// v2: MsgOnboardingState は当初設計したが、実装は INSTANT_STRUCTURE.onboardingShown 同梱で
// 完結したため未使用となり final-architect レビュー指摘で削除。
// 将来 Extension → Webview で動的にオンボーディング状態を通知したい場合は再追加する。

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
    | MsgCodePeekResponse
    | MsgSearchContentResponse;

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

/** v2: オンボーディング完了/スキップ通知 (Webview → Extension, T-08) */
export interface MsgOnboardingDismiss {
    type: 'ONBOARDING_DISMISS';
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

/** ファイル内容検索リクエスト (Webview → Extension) */
export interface MsgSearchContentRequest {
    type: 'SEARCH_CONTENT_REQUEST';
    payload: {
        /** 検索クエリ (大文字小文字無視) */
        query: string;
        /** 競合制御用の連番。レスポンスでそのまま返るので Webview は古い結果を破棄できる */
        requestId: number;
    };
}

/** ファイル内容検索応答 (Extension → Webview) */
export interface MsgSearchContentResponse {
    type: 'SEARCH_CONTENT_RESPONSE';
    payload: {
        requestId: number;
        query: string;
        /** マッチしたファイル (グラフノード) の id 配列 */
        matchedNodeIds: string[];
        /** 結果上限に到達したか (UI で "+" 表示用) */
        truncated: boolean;
    };
}

/** Webview → Extension に送信するメッセージの Union */
export type WebviewToExtensionMessage =
    | MsgJumpToFile
    | MsgFocusNode
    | MsgRequestAnalysis
    | MsgRuneModeChange
    | MsgCodePeekRequest
    | MsgOnboardingDismiss
    | MsgSearchContentRequest;

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

    // ─── v2 改修: ディレクトリヒートマップ (T-06) ─────────
    /**
     * 凝集度: フォルダ内部依存数 / フォルダ全体依存数。
     * 0.0-1.0 の範囲。1.0 に近いほど内部完結度が高い。
     * 全体依存数 = 0 のフォルダは 1.0 扱い (独立完結ファイル群)。
     */
    cohesion?: number;
    /** 子ノードの平均行数 */
    avgLineCount?: number;
    /** 子ノードのうち inCycle = true の数 */
    cycleCount?: number;
}

/** Bubble レイアウトのヒートマップ色付け軸 (v2: T-06) */
export type BubbleMetric = 'cohesion' | 'avgLines' | 'cycles';

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
    /**
     * v2 改修 (T-06): 循環参照に含まれるか。
     * BubbleGroup の cycleCount 集計用に Worker に渡す。
     */
    inCycle?: boolean;
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
