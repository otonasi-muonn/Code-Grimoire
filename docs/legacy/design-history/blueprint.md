設計図

TS可視化プラットフォーム設計書：「コードの魔法陣 (Code Magic Circle)」

1. UI/UXコンセプト： 「安定的かつ動的な魔法陣」 (Stable Dynamic Mandala)

開発者の関心を中心に世界を再構築する「探索型UI」ですが、「画面酔い」と「待機時間のストレス」を徹底的に排除した設計にします。

A. 構造：3つの同心円 (The Three Rings)

情報の「抽象度」と「距離」を同心円で表現します。

 * Inner Ring (Focus / 虫の目): 現在選択中のファイル/関数。詳細なロジック、直近のデータフロー、Taint（汚染）の発生源。

 * Middle Ring (Context / 街の目): 直接依存するモジュール、Propsバケツリレーの経路、同一パッケージ内のディレクトリ。

 * Outer Ring (Global / 鳥の目): モノレポの他パッケージ、外部ライブラリ、インフラ設定、ネットワーク境界。

B. 物理挙動：揺らぎの抑制 (Taming the Wobble) 【New!】

D3 force simulation特有の「プルプル震える挙動」を排除し、ビシッと決まるUIを実現します。

 * Simulation Warm-up (事前計算):

   * 中心が切り替わった瞬間、裏側（Web Worker）でシミュレーションを数百ステップ空回しさせます。ユーザーには計算過程（震え）を見せず、ある程度収束した状態で「パッ」と表示します。

 * Rapid Freeze (急速冷却):

   * Alpha Decay（減衰率）を高く設定し、配置が決まったら即座に物理演算を停止（Freeze）させます。これにより、ノードがいつまでも漂う「画面酔い」を防ぎます。

C. ナビゲーション：ピボットと軌跡

 * 「召喚 (Summoning)」アクション:

   * Outer Ringにある「気になるノード」をクリックすると、アニメーションと共にそのノードが**Inner Ring（中心）**へ移動し、世界が再構築されます。

 * 運命の軌跡 (The Trail):

   * Visual Breadcrumbs: 画面隅に「経由してきたノードのサムネイル列」を表示。

   * Ghost Nodes (残像): 過去の中心ノードをうっすらと残し、点線で結んで「探索ストーリー」を可視化。

D. 表示制御：MSDFとLOD

 * MSDFフォント: GPU負荷が低く、拡大してもくっきり見えるフォント技術を採用。

 * Semantic Zoom (意味的ズーム):

   * 遠景: 点のみ。

   * 中景: MSDFフォントでラベル表示。

   * 近景: DOMオーバーレイでリッチテキスト表示（コピペ可能）。

2. ローディング体験： 「プログレッシブ・ディスクロージャー」 (The First Impression) 【New!】

解析待ち時間を「期待感」に変える演出と技術です。

A. Progressive Disclosure (段階的開示)

 * Phase 1: Instant Structure (0.5秒)

   * AST解析を待たず、package.json / pnpm-workspace.yaml だけを高速に読み込み、「Outer Ring（パッケージ構成）」だけを瞬時に表示します。まずは全体像を見せることでユーザーを安心させます。

 * Phase 2: Particle Loading (〜数秒)

   * 詳細なAST解析（TS Compiler / OxC）が終わったモジュールから順次、魔法陣のInner Ringに向かって**「光の粒」が集まるようにノードが出現**します。

 * Phase 3: Deep Dive (完了)

   * 全解析完了後、依存線（Edge）と詳細情報（Taint Flowなど）が結合されます。

B. データブリッジ (The Data Bridge)

 * 差分更新: 初期表示は「Inner + Middle」のみ転送。Outerはバックグラウンドで遅延ロード。

 * Binary Protocol: 通信にはProtobuf/FlatBuffersを使用し、シリアライズコストを最小化。

3. 解析ロジック： 「全知の眼」とゼロコンフィグ (The Omniscient Eye)

A. Zero Config Goal (設定レスへの挑戦) 【New!】

ユーザーに設定を書かせず、「開けば動く」を実現します。

 * Auto-Discovery Engine:

   * プロジェクトルートの nx.json, turbo.json, pnpm-workspace.yaml, lerna.json を自動検知。

   * tsconfig.json の paths (エイリアス) を自動解決。

   * 目標: リポジトリを開いて3秒で「可視化された！」という感動を与える。

B. 3つの眼 (Analysis Modules)

1. 物理と最適化の眼 (Physical & Optimization)

 * Pseudo-Tree-Shaking Score: 副作用と参照数に基づく「残留リスク」警告。

 * Barrel Explosion: index.ts の巻き込み事故検知。

2. セキュリティと整合性の眼 (Security & Integrity)

 * Taint Analyzer: 機密データ・未検証入力のフロー追跡。

 * Network Boundary Breach: Server/Clientコードの流出検知。

 * Monorepo Guardrails: 境界侵犯とバージョンドリフト検知。

3. 品質と歴史の眼 (Quality & History)

 * True Git Hotspots: 自動生成コードを除外した「真の修正頻度」。

 * Type Confidence Score: 外部データの浸透深度。

4. 推奨技術スタック (Tech Stack)

Frontend (描画・操作)

 * Layout Engine: D3.js

   * 役割: 力学モデル計算 (d3-force) と階層構造 (d3-hierarchy)。Web Workerで計算させ、メインスレッドをブロックしない。

   * Edge Bundling: d3.curveBundle を使用し、スパゲッティ配線を束ねて整理。

 * Rendering Engine: PixiJS (WebGL)

   * 役割: 数万ノードの高速描画。

   * Plugins: pixi-msdf-text (MSDFフォント描画用)、pixi-viewport (無限キャンバス操作用)。

Backend / Analysis (解析)

 * Core: TypeScript Compiler API

   * 役割: AST解析、型推論、シンボル解決の基本エンジン。

 * Speed: OxC (Oxidation Compiler)

   * 役割: ファイル変更検知時の高速再解析。Rust製パーサーをWASMで駆動。

5. 提供されるビューモード (Rune Modes)

ユーザーはトグルスイッチ（ルーン）で「何を見るか」を切り替えます。

 * Security Rune (セキュリティの紋章)

   * Focus: Taint Flow, Network Boundary, Secret Leaks.

   * Target: 脆弱性と情報漏洩の撲滅。

 * Optimization Rune (最適化の紋章)

   * Focus: Pseudo-Tree-Shaking Score (残留リスク), Side Effects.

   * Target: バンドルサイズの最小化。

 * Architecture Rune (構造の紋章)

   * Focus: Monorepo Boundaries, Domain Coupling, Circular Deps.

   * Target: 設計の健全性維持。

 * Refactoring Rune (再生の紋章)

   * Focus: Git Hotspots, Test Death Zones, Type Erosion.

   * Target: 技術的負債の返済。