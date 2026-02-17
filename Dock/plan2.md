📘 開発計画書：Code Grimoire V3.0 "The Shifting World"

1. コンセプト & UX変更点

"From Wandering to Seeking" (彷徨いから探求へ)

Multiverse Layouts (多次元レイアウト):

既存の「魔法陣（Force）」に加え、階層構造を可視化する「大樹（Radial Tree）」と「細胞（Balloon）」モードを追加。これらをシームレスに変形（モーフィング）させる。

Targeted Information (情報の選択的開示):

「ズームしたら全員喋り出す」騒がしさを廃止。

通常は「構造美」を楽しみ、クリックした対象だけが「真の姿（詳細）」を語るインタラクションへ変更。

2. アーキテクチャ拡張

A. レイアウトエンジンの多態性 (Polymorphic Layouts)

src/webview/worker.ts を拡張し、3つの計算モードを切り替えられるようにします。

モード名実装技術 (D3 modules)用途挙動Mandala (魔法陣)d3-force依存関係、循環参照、ハブの発見動的 (ゆらめく物理挙動)Yggdrasil (世界樹)d3-hierarchy (Tree)ディレクトリ階層、深さの把握静的 (放射状に整列)Bubble (泡宇宙)d3-hierarchy (Pack)フォルダごとの規模感、凝集度静的 (円の包含関係)

★ モーフィング技術:

レイアウト切り替え時、瞬時に切り替えるのではなく、現在の座標 $(x_1, y_1)$ から次のレイアウトの目標座標 $(x_2, y_2)$ へ、パーティクルが流れるように移動するアニメーションを実装します。

B. UIレイヤーの分離 (The HUD)

Canvas（PixiJS）の上に、HTML/CSSによる操作パネル（HUD）を明確に定義します。

Search Overlay: 画面上部中央。

Detail Panel: 画面右側（スライドイン）。

Mini-map: 画面右下（Canvas描画）。

3. 実装ロードマップ

Phase 1: レイアウトエンジンの拡張 (The Shape Shifter)

Worker側で静的レイアウト計算を行い、Forceレイアウトとの座標補間を実装します。

[Shared] 型定義の更新 (src/shared/types.ts)

LayoutMode = 'force' | 'tree' | 'balloon' を追加。

[Worker] D3 Hierarchy 導入 (src/webview/worker.ts)

d3-hierarchy をインポート。

calculateTreeLayout(): ディレクトリ構造に基づき $(x, y)$ を計算。

放射状変換: $(x, y) \to (radius, angle) \to (x', y')$

calculateBalloonLayout(): d3.pack を使用して包含円座標を計算。

[Worker] トランジション制御

物理演算（Force）を一時停止し、各ノードを目標座標へ「吸い寄せる」カスタムフォース、あるいは線形補間（Lerp）を実装して座標更新イベント (TICK) を送信し続ける。

Phase 2: 探索とナビゲーション (The Seer)

ユーザーが迷子にならないための機能を実装します。

[Webview] 検索機能 (src/webview/main.ts + UI)

HTML: インクリメンタルサーチ可能な <input> を配置。

Logic: 入力文字列にヒットするノードIDリストを抽出。

Effect: 該当ノード以外を暗くする（Dimming）。Enterキーで該当ノードへカメラ移動（FlyTo）。

[Webview] ミニマップ (The Crystal Ball)

PixiJS: メインの stage とは別に、画面右下に小さな Container を用意。

Logic: メインのノード位置を $1/10$ スケールで同期して描画（点は簡易的なドットでOK）。

Interaction: ミニマップ上のクリックで、メインビューポートをその位置へ移動。

Phase 3: 詳細情報の見せ方改革 (The Grimoire Page)

LODによる自動表示を廃止し、クリック駆動の情報パネルへ移行します。

[Webview] インタラクション変更 (createNodeGraphics)

ズームレベル（LOD）による「テキスト詳細表示」ロジックを削除。

クリックイベント (pointertap) を強化。

[Webview] 詳細パネル実装 (HTML/CSS)

画面右端に隠れているパネルを作成。

ノードクリック時:

パネルをスライドイン (class="visible").

選択ノードを強調（他を少しぼかす）。

パネル内に情報を流し込む（名前、パス、依存数、Git情報、コードプレビュー）。

背景クリック時:

パネルを閉じる。選択解除。