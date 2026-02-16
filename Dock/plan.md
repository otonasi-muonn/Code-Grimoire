📘 開発計画書：Code Magic Circle

Version: 2.0 "Stable Dynamic Mandala"

Concept: 開発者の関心を中心に世界を再構築する、安定的かつ動的な探索型UI

1. アーキテクチャ刷新 (Tech Stack Strategy)

「没入感（Immersion）」と「実用性（Utility）」を両立させるため、以下の通り技術スタックを刷新する。

領域現行 (Legacy)変更後 (Target)選定理由解析エンジンacorn-looseTS Compiler API正確な型情報・参照解決・シンボル追跡のため必須。描画エンジンp5.js (Canvas)PixiJS (WebGL)数万ノードの描画負荷に耐え、MSDFフォントを使用するため。レイアウト静的配置D3.js (d3-force)依存関係に基づく「3つの同心円」動的レイアウト実現のため。実行環境UIスレッドWeb Worker計算負荷を分離し、UIのフリーズと画面酔いを防ぐため。Webview構成文字列埋め込みDual Build (esbuild)Extension (Node.js) と Webview (Browser) の実行環境の違いを吸収するため。2. モジュール別 実装方針

A. バックエンド解析部 (src/extension/)

目標: Zero Config & Deep Analysis

Zero Config Engine: tsconfig.json を自動検出し、ユーザー設定不要で解析を開始する。

Symbol Graphing: ファイル単位だけでなく、関数・クラス単位の詳細なノード生成。

Edge Tracing: import 文に加え、CallExpression (関数呼び出し) を追跡してエッジを生成。

Scoring: 「物理と最適化の眼」用のスコア（複雑度・結合度）計算ロジックの実装。

B. フロントエンド描画部 (src/webview/)

目標: High Performance & Build Pipeline

ビルドパイプラインの二重化:

esbuild を導入し、Extension本体（CommonJS形式）と Webview用スクリプト（IIFE/ESM形式）を分離してビルドするタスクを定義。

Simulation Worker:

d3-force の計算処理をWeb Workerへ完全隔離。

PixiJS Viewport & Rendering:

無限キャンバス操作（Pan/Zoom）の実装。

英数字と日本語（マルチバイト文字）が混在するコードベースに対応するため、描画戦略を最適化する。

C. データ通信プロトコル (src/shared/)

目標: Zero-copy & Progressive Loading

型安全な通信: src/shared/types.ts などで型定義を共有し、ExtensionとWebview間のメッセージングを堅牢にする。

Progressive Loading:

Phase 1 (Instant): package.json 解析のみの軽量JSONを即座に送信。

Phase 2 (Detail): TS解析完了後、詳細なグラフデータを追送。

データシリアライズ最適化:

巨大なJSONによるフリーズを防ぐため、postMessage 時に Transferable Objects (ArrayBuffer / Float32Array 等) を用いたゼロコピー転送を導入する。

3. 段階的実装ロードマップ

Phase 1: 基盤とパイプライン (The Foundation)

目標: TS Compiler APIによる解析と、PixiJSによる描画環境の確立、および強固なビルド・通信基盤の構築。

[Must] ビルド基盤の構築

[ ] esbuild を導入し、extension.ts (CJS) と webview.ts (IIFE/ESM) を別々にビルドする npm run build スクリプトを作成。

[Must] 通信基盤の確立

[ ] Extension -> Webview 間のメッセージングにおいて、型安全性（型定義の共有）を確保する。

バックエンド

[ ] Analyzer刷新: ts.createProgram を使用した簡易ファイル依存グラフ（Nodes/Edges）の出力。

[Must] Viewer（ストレステスト）

[ ] PixiJSを起動し、1万個のパーティクルを描画してFPSが落ちないことを確認するストレステストを実施。

Phase 2: 構造と物理挙動 (The Structure & Physics)

目標: 「3つの同心円」レイアウトの実装と「画面酔い」の完全排除、および通信の高速化。

通信の最適化

[ ] Transferable Objects導入: 大量データの送信時、ArrayBuffer (Float32Array等) を利用してシリアライズコストを排除（ゼロコピー転送）。

Web Worker実装

[ ] D3シミュレーション計算をWeb Workerへ移設。

レイアウトロジック

[ ] カスタムフォース実装: ノードを「Focus」「Context」「Global」の3層に拘束。

[ ] Warm-up (事前計算): 表示前にシミュレーションを空回しし、初期配置を安定化。

[ ] Rapid Freeze (急速停止): 配置決定後に演算を即時停止し、振動を防ぐ。

インタラクション

[ ] Summoning: ノードクリックで中心を切り替えるアニメーションの実装。

Phase 3: 知性とルーン (The Intelligence)

目標: 専門的な解析ロジック（3つの眼）と可視化モードの実装。

詳細解析

[ ] 関数レベルの依存関係解析の実装。

[ ] Git履歴（Hotspots）情報の統合。

UI実装

[ ] Rune UI: 画面上に解析モード切り替えスイッチ（ルーン）を配置。

モード実装

[ ] Architecture Rune: モジュール境界・循環参照の可視化。

[ ] Security Rune: 外部入力（Taint）と危険な関数のハイライト表示。

Phase 4: 体験と最適化 (The Polish)

目標: UXの磨き込みと大規模プロジェクト・多言語対応。

フォントレンダリング戦略（ハイブリッド方式の検討）

[ ] 英数字: 高速かつ高品質な MSDFフォント で描画。

[ ] 日本語等のマルチバイト文字: 画像サイズ肥大化を防ぐため、標準の Canvas API (またはPixi標準Text) でテクスチャとして動的生成するハイブリッド方式を実装。

描画品質

[ ] LOD (Level of Detail): ズームレベルに応じた「点→ラベル→詳細情報」の表示切り替え。

演出

[ ] Particle Loading: 解析待ち時間に光の粒が集まるローディング演出の実装。

パフォーマンス (Optional)

[ ] OxC導入: 解析速度向上のためのRust製パーサー検証・導入（必要に応じて）。