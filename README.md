<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-^1.100.0-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/PixiJS-8.6.6-e72264?logo=pixi.js" alt="PixiJS">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

# 🔮 Code Grimoire

> **コードを魔法陣に変換する** — TypeScript / JavaScript で作られたコードの依存関係を魔力とし、自動的に繋がりを可視化した魔方陣を形成する VS Code 拡張機能。

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🌀 **魔方陣** | d3-force による力学シミュレーションで依存関係を魔法陣風に配置 |
| 🎨 **RUNE モード** | `標準` / `構造` / `防衛` / `最適化` / `分析` — 5 種の解析視点の切り替え |
| 📐 **レイアウト** | `魔法陣` / `銀河` / `泡宇宙` — 3 種の配置方式の切り替え |
| 🌌 **銀河レイアウト** | エントリーポイントを中心に BFS 深度で放射状配置。到達不能ファイルは最外周に |
| 🫧 **泡宇宙サイズモード** | 泡宇宙レイアウトで行数 / ファイルサイズによる円のサイズ切替 |
| � **フォルダ詳細** | 泡宇宙でフォルダ円をクリックしてフォルダ統計・依存関係を確認 |
| �🔍 **ファイル検索** | ファイル名の逐次検索 + 強調表示 |
| 🗺️ **マップ** | 全体マップ + 現在の表示範囲 |
| 📊 **詳細パネル** | パス・情報・Git・エクスポート・依存/被依存・セキュリティ・最適化リスク・データフロー・コード閲覧 |
| 🧭 **探索履歴** | 探索履歴をパンくずリスト + Ghost Trail（探索軌跡）で表示 |
| ⚡ **依存方向の可視化** | 選択ノードの依存方向をアニメーション付きで可視化 |
| ⇄ **データの受け渡し可視化** | ファイル間でやり取りされるシンボル数を分析モードでノード上に `⇄ N symbols (↑N ↓N)` として表示 |
| 🔇 **依存関係の非表示** | エッジ種別（通常・型・動的・副作用・再エクスポート）ごとに表示/非表示をトグル（分析モード時） |
| 🔭 **LOD 自動切替** | ズームアウト時にノードをドットに簡略化する Far モードへ自動切替 |
| 💫 **演出** | 読み込み中のパーティクルローディング + クリック時の衝撃波 |
| 🌐 **言語切り替え** | 日本語 / English 自動切り替え |
| 📱 **レスポンシブ** | 小さなパネルでも快適に操作可能なレスポンシブデザイン |

---

## 🏗️ アーキテクチャ

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

## 🚀 導入ガイド

### 前提条件

- **VS Code** ≥ 1.100.0
- **Node.js** ≥ 18

### インストール & ビルド

```bash
git clone https://github.com/your-org/Code-Grimoire.git
cd Code-Grimoire
npm install
npm run compile
```

### 実行 (デバッグ)

1. VS Code で `F5` を押す
2. Extension Development Host が起動
3. コマンドパレット（Shift + Ctrl + P） → `CodeGrimoire: Open Grimoire`
4. TypeScript プロジェクトの依存グラフが魔法陣として表示 ✨

---

## ⌨️ キーボードショートカット

| キー | 実行 |
|-----|--------|
| `Ctrl + F` / `Cmd + F` | 検索トグル |
| `Escape` | 検索閉じる / 詳細パネル閉じる |
| `?` | ヘルプ表示トグル |
| `1`–`5` | モード切替 |
| `Q` / `W` / `E` | レイアウト切替 (Q: 魔方陣 / W: 銀河 / E: 泡宇宙) |

---

## 🎨 Rune モード

| モード | 詳細 |
|------|-----------|
|  1: **標準** | 依存関係をそのまま表示。ノードの色はファイルパスのハッシュで決定され、同じディレクトリのファイルは似た色相になります |
|  2: **構造** | 循環参照（import の相互依存）を赤いエッジで強調。該当ノードは明るく、それ以外は石化（灰色）して背景に退きます |
|  3: **防衛** | 	eval() や dangerouslySetInnerHTML 等のセキュリティリスクを持つファイルを警告色で強調。安全なファイルは石化します |
|  4: **最適化** | 意図せず必要なコードが削除されること、期待通りに削除されずファイルが肥大化することのリスク（依存関係のブラックボックス化・意図しないコード削除）を可視化。リスクが高いほど明るく、低いものは石化します |
|  5: **分析** | ファイル間のデータ受け渡し（import されたシンボル数）を可視化。ノード上に `⇄ N symbols (↑N ↓N)` と表示され、シンボルの流れが多いノードほど明るく表示されます。エッジ種別（通常・型・動的・副作用・再エクスポート）ごとのフィルタリングも可能 |

---

## 📐 レイアウト

| レイアウト | 詳細 |
|---------|-----------|
| 🌀 **魔法陣** (Q) | d3-force による力学シミュレーション。ノードが相互に反発しながら依存エッジで引き合い、自然な配置に収束します |
| 🌌 **銀河** (W) | エントリーポイントを中心に BFS 深度で放射状に配置。依存階層が同心円で可視化され、どのファイルからも到達できないファイルは最外周リングに配置されるため、デッドコード検出に有効です |
| 🫧 **泡宇宙** (E) | d3-hierarchy の pack レイアウト。ディレクトリ構造を入れ子の円として表現し、フォルダクリックでフォーカス・詳細パネル表示が可能。📏行数 / 📦ファイルサイズ でバブルサイズの切り替えができます |

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

## 📄 ライセンス

MIT © Code Grimoire Contributors
