<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-^1.100.0-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/PixiJS-8.6.6-e72264?logo=pixi.js" alt="PixiJS">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

# 🔮 Code Grimoire

> **"Code into Magic, Logic into Art."**
>
> TypeScript / JavaScript プロジェクトの依存関係を「魔力」の流れとして解析し、美しい**魔方陣**として具現化する VS Code 拡張機能。

---

## ✨ 特徴 (Features)

*   **🌀 魔方陣の具現化**: `d3-force` 力学シミュレーションにより、ファイル間の依存関係を自然なバランスで配置。
*   **🧙‍♂️ 5つのルーン（解析モード）**: 目的（構造把握、セキュリティ、最適化など）に応じて視点を切り替え。
*   **🌌 3つの宇宙（レイアウト）**: 魔方陣、銀河、泡宇宙の3種類の配置アルゴリズムを搭載。
*   **⚡ 圧倒的なパフォーマンス**: PixiJS (WebGL) + Web Worker + BitmapFont/Canvas ハイブリッド描画により、数万ファイルのプロジェクトでも 60fps を維持。
*   **👻 Ghost Trail (探索軌跡)**: 探索した経路を光の軌跡として記録し、深い依存の森でも迷子を防ぎます。
*   **🔍 深層探索**: インクリメンタルサーチ、詳細パネル（全知の水晶）による徹底的なコード解析。

---

## 📜 呪文の書 (Runes & Modes)

キーボードの数字キー `1` ～ `5` で、魔方陣の性質（解析モード）を切り替えます。

### 1. 標準のルーン (Standard Mode)
*   **概要**: 最も基本的な表示です。
*   **色彩**: ファイルパスのハッシュ値に基づき、同じディレクトリのファイルは同系色で表示されます。

### 2. 構造のルーン (Structure Mode)
*   **概要**: 構造的な欠陥を浮き彫りにします。
*   **赤き鎖 (Red Edges)**: **循環参照（Circular Dependency）** を形成している依存線を赤く発光させます。
*   **石化**: 問題のないノードはグレーアウトし、修正すべき箇所だけが浮かび上がります。

### 3. 防衛のルーン (Defense Mode)
*   **概要**: セキュリティリスクを可視化します。
*   **警告**: `eval` や `dangerouslySetInnerHTML` など、脆弱性の原因となりうるコードを含む星を**警告色（赤/オレンジ）**で脈動させます。
*   **浄化**: リスクを修正すると、その星は即座に石化（沈黙）します。

### 4. 最適化のルーン (Optimization Mode)
*   **概要**: デッドコードやバンドル肥大化の原因を探します。
*   **死の兆候**: エントリーポイントから到達不能なファイルは**石化（完全なグレー）**します。これらは削除推奨です。
*   **混沌の契約**: 副作用のみのインポート（`import './init'`）を行っている接続を強調します。

### 5. 分析のルーン (Analysis Mode)
*   **概要**: 魔力（データシンボル）の流量を可視化します。
*   **シンボル流量**: ノード上に `⇄ N (↑X ↓Y)` を表示。
    *   **↑ (Output/供給)**: `export` し、他に使われている数。「ライブラリ的性質」。
    *   **↓ (Input/消費)**: 他から `import` している数。「アプリ/コントローラー的性質」。
*   **フィルタリング**: UI上で「型のみ」「動的インポート」「再エクスポート」の表示/非表示を切り替え可能。

---

## 📐 宇宙の理 (Layouts)

キーボードの `Q`, `W`, `E` で配置アルゴリズムを再構築します。

### 🌀 Q: 魔方陣 (Force Directed)
物理演算により、密結合なファイル同士が引き合い、自然なクラスタを形成します。プロジェクトの「重力中心」を直感的に把握できます。

### 🌌 W: 銀河 (Galaxy Layout)
エントリーポイント（`main.ts`等）を中心に、依存の深さ（Depth）に応じて同心円状に配置します。
*   **中心**: コアロジック。
*   **外縁**: 依存の末端。
*   **最外周**: **到達不能なデッドコード（Orphans）** が配置される「追放の地」。

### 🫧 E: 泡宇宙 (Bubble Cosmos)
ディレクトリ構造を入れ子の円（泡）として表現します。
*   **サイズ切替**: ツールバーで「行数 (Lines)」または「ファイルサイズ (Size)」に切り替え可能。肥大化したモジュールを一目で特定できます。
*   **ドリルダウン**: フォルダをクリックして内部にフォーカスできます。

---

## 🕯️ 召喚の儀 (Installation)

### 前提条件 (Prerequisites)
*   VS Code: `v1.100.0` 以上
*   Node.js: `v18` 以上

### 構築手順 (Build Steps)

```bash
# 1. 禁書庫の複製 (Clone)
git clone https://github.com/otonasi-muonn/Code-Grimoire.git
cd Code-Grimoire

# 2. ページを綴る (Install)
npm install

# 3. 魔力の充填 (Compile)
npm run compile
```

### 発動 (Activation)
1.  VS Code でプロジェクトを開き、`F5` を押してデバッグ起動。
2.  コマンドパレット (`Ctrl+Shift+P`) から **`CodeGrimoire: Open Grimoire`** を実行。

---

## ⌨️ 詠唱 (Shortcuts)

| Key | Action | Description |
| :--- | :--- | :--- |
| **1 - 5** | Change Rune | モード切替 (標準/構造/防衛/最適化/分析) |
| **Q / W / E** | Change Layout | レイアウト切替 (魔方陣/銀河/泡宇宙) |
| **Ctrl + F** | Search | インクリメンタルサーチ & ハイライト |
| **Esc** | Clear | 検索解除 / パネルを閉じる |
| **Space** | Pause | 物理演算の一時停止/再開 |
| **?** | Help | このヘルプを表示 / 非表示 |

---

## 🏗️ 魔術工学 (Architecture)

*   **Analysis**: TypeScript Compiler API (AST) を使用し、正規表現ではなく正確なシンボルカウントと依存解決を実現。
*   **Rendering**: PixiJS (WebGL) を採用。**LOD (Level of Detail)** システムにより、遠景ではドット、近景ではテキストとアイコンへ自動的に切り替わり、描画負荷を最小化。
*   **Physics**: `d3-force` の計算を **Web Worker** にオフロード。UIスレッドをブロックせず、常に滑らかな操作感を実現。
*   **Text**: BitmapFont（英数字・高速）と Canvas（日本語・動的生成）のハイブリッド描画システム。

### 📂 Directory Structure

```
src/
├── extension.ts          … Extension Host (パネル管理 + Analyzer 起動)
├── analyzer.ts           … TypeScript AST 解析 → 依存グラフ生成
├── webview.ts            … Webview HTML/CSS テンプレート
└── webview/
    ├── main.ts           … Orchestrator (全モジュールの配線)
    ├── worker.ts         … Web Worker (d3-force シミュレーション)
    ├── core/
    │   ├── state.ts      … AppState シングルトン
    │   ├── i18n.ts       … 国際化 (ja/en)
    │   ├── lod.ts        … Level of Detail 判定
    │   ├── vscode-api.ts … VS Code API ラッパー
    │   └── worker-bridge.ts … Worker 通信ブリッジ
    ├── renderer/
    │   ├── graph.ts      … ノード/エッジ描画 + インタラクション
    │   └── effects.ts    … パーティクル/衝撃波/エッジフロー
    ├── ui/
    │   ├── toolbar.ts    … Rune + Layout ヘッダーバー
    │   ├── search.ts     … 検索オーバーレイ
    │   ├── breadcrumbs.ts … パンくずナビゲーション
    │   ├── minimap.ts    … ミニマップ
    │   ├── detail-panel.ts … 詳細パネル + Code Peek
    │   └── help.ts       … ヘルプ/凡例オーバーレイ
    └── utils/
        ├── color.ts      … カラーユーティリティ
        ├── font.ts       … BitmapFont ハイブリッドシステム
        └── drawing.ts    … 描画ヘルパー
```

**設計パターン**: 各モジュールは `setXxxContext()` 関数で依存を受け取る DI パターンを採用し、循環参照を回避しています。

---

## 🔧 ビルドシステム

esbuild による **3つのビルド**:

| ターゲット | フォーマット | アウトプット |
|--------|--------|--------|
| Extension Host | CJS | `out/extension.js` |
| Webview | IIFE | `out/webview/main.js` |
| Web Worker | IIFE | `out/webview/worker.js` |

### スクリプト

```bash
npm run compile    # 本番ビルド
npm run watch      # ファイル変更監視ビルド
npm run lint       # ESLint チェック
npm run test       # テスト実行
```

---

## 📦 技術スタック

| ライブラリ | バージョン | パーパス |
|---------|---------|---------|
| [PixiJS](https://pixijs.com/) | 8.6.6 | WebGL レンダリング |
| [pixi-viewport](https://github.com/davidfig/pixi-viewport) | 6.0.3 | 無限キャンバス (drag/pinch/wheel) |
| [d3-force](https://d3js.org/) | 3.0.0 | 力学シミュレーション |
| [d3-hierarchy](https://d3js.org/) | 3.1.2 | 泡宇宙 pack レイアウト |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.3 | 型安全な開発 |
| [esbuild](https://esbuild.github.io/) | 0.24.0 | 高速バンドラー |

---

## 🤝 Contribution

バグ報告、機能追加の提案（プルリクエスト）は歓迎します。
新たなルーンの追加や、禁断の魔術（新機能）の実装をお待ちしています。

## 📄 License

MIT © Code Grimoire Contributors
