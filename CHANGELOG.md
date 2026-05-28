# Change Log

All notable changes to the "codegrimoire" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.0] - 2026-05-28

初の正式版。v0.1.x からの全改修をまとめた安定版リリース。

### Added
- multi-tsconfig 構成プロジェクトの解析対応（複数 tsconfig でのファイル取りこぼしを解消）
- ファイル内容の全文検索（`@vscode/ripgrep`）— ファイル名検索に加え中身も検索
- 起動時オンボーディングツアー（初回のみ表示、ヘルプから再表示可能）
- デモプロジェクト切替コマンド `CodeGrimoire: Load Demo Project`
- 巨大ファイル警告（500 行 / 1000 行で色・リング太さ・ラベルの多重符号化）
- セキュリティ警告の重要度分類（info / warning / critical）
- Git Hotspot 強調（変更頻度が高い循環参照ノードを 🔥 で表示）
- ディレクトリ凝集度ヒートマップ（泡宇宙: 凝集度 / 平均行数 / 循環参照ファイル数）
- ノードのホバーツールチップ（ファイル名・行数・依存数）

### Changed
- Git Hotspot 取得を非同期化（`execFile` + Promise でエディタを止めない）
- 循環参照検出（Tarjan's SCC）を反復実装に変更 — 大規模リポでのスタックオーバーフロー対策
- ノードの半径・配置を相対値ベースに — プロジェクト規模に依らず一貫した見た目に
- 銀河 / 泡宇宙レイアウトのノード重なりを配置側で解消
- 初期フォーカスを「最も依存の多いファイル」に
- 警告表示を色＋アイコン＋テキストの多重符号化に（色覚アクセシビリティ対応）
- 一部 UI のコントラストを WCAG 基準に改善

### Fixed
- Worker 初期化失敗時に画面がローディング表示のまま固まる問題
- PixiJS の WebGL を明示指定（Canvas2D への意図しないフォールバックを防止）
- ファイル連続編集時の解析多重起動を抑制
- PixiJS Graphics の破棄漏れによるメモリリーク
- Activity ヒートマップを実データ化（見せかけ表示を撤廃）
- 詳細パネルのデータフロー表示方向を解析モードの説明と統一

## [0.1.1] - 2026-02-27

### Fixed
- TypeScript コンパイラがバンドルに含まれない問題を修正

## [0.1.0] - 2026-02-20

### Added
- 🌀 魔方陣の具現化: d3-force 力学シミュレーションによる依存関係の可視化
- 🧙‍♂️ 5つのルーン（解析モード）: 標準 / 構造 / 防衛 / 最適化 / 分析
- 🌌 3つの宇宙（レイアウト）: 魔方陣 (Force) / 銀河 (Galaxy) / 泡宇宙 (Bubble)
- ⚡ PixiJS (WebGL) + Web Worker による高速レンダリング
- 👻 Ghost Trail（探索軌跡）
- 🔍 インクリメンタルサーチ & 詳細パネル（全知の水晶）
- 🗺️ ミニマップ & パンくずナビゲーション
- 🌐 国際化対応（日本語 / 英語）