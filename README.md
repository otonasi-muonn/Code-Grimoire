<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-^1.100.0-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/PixiJS-8.6.6-e72264?logo=pixi.js" alt="PixiJS">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

# 🔮 Code Grimoire

> **コードを魔法陣に変換する** — TypeScript / JavaScript の依存関係グラフを、魔導書風のインタラクティブな可視化で表示する VS Code 拡張機能。

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🌀 **Magic Circle Graph** | d3-force による力学シミュレーションで依存関係を魔法陣風に配置 |
| 🎨 **Rune Modes** | `Arcane` / `Celestial` / `Verdant` / `Inferno` / `Abyss` — 5 種のカラーテーマ |
| 📐 **Layout Modes** | `Force` / `Radial` / `Hierarchy` — 3 種のレイアウトアルゴリズム |
| 🔍 **Fuzzy Search** | ファイル名インクリメンタル検索 + ディム表示 |
| 🗺️ **Minimap** | 全体マップ + 現在のビューポートインジケータ |
| 📊 **Detail Panel** | ノード詳細 + Code Peek（ソースコードプレビュー） |
| 🧭 **Breadcrumbs** | 探索履歴をパンくずリストで表示 + クリックで戻る |
| ⚡ **Edge Flow** | 選択ノードの依存方向をアニメーション付きで可視化 |
| 💫 **Particle Effects** | 読み込み中のパーティクルローディング + クリック時の衝撃波 |
| 🌐 **i18n** | 日本語 / English 自動切り替え |
| 📱 **Responsive** | 小さなパネルでも快適に操作可能なレスポンシブデザイン |

---

## 🏗️ Architecture

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

## 🚀 Getting Started

### Prerequisites

- **VS Code** ≥ 1.100.0
- **Node.js** ≥ 18

### Install & Build

```bash
git clone https://github.com/your-org/Code-Grimoire.git
cd Code-Grimoire
npm install
npm run compile
```

### Run (Debug)

1. VS Code で `F5` を押す
2. Extension Development Host が起動
3. コマンドパレット → `CodeGrimoire: Open Grimoire`
4. TypeScript プロジェクトの依存グラフが魔法陣として表示 ✨

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + F` / `Cmd + F` | 検索トグル |
| `Escape` | 検索閉じる / 詳細パネル閉じる |
| `H` | ヘルプ表示トグル |
| `1`–`5` | Rune モード切替 |
| `R` | レイアウト切替 (Force → Radial → Hierarchy) |

---

## 🎨 Rune Modes

| Mode | Theme | Hue Range |
|------|-------|-----------|
| 🟣 **Arcane** | 神秘的な紫 | Purple — Violet |
| 🔵 **Celestial** | 天空の青 | Cyan — Blue |
| 🟢 **Verdant** | 生命の緑 | Green — Emerald |
| 🔴 **Inferno** | 業火の赤 | Red — Orange |
| ⚫ **Abyss** | 深淵の闇 | Dark — Monochrome |

---

## 🔧 Build System

esbuild による **Triple Build**:

| Target | Format | Output |
|--------|--------|--------|
| Extension Host | CJS | `out/extension.js` |
| Webview | IIFE | `out/webview/main.js` |
| Web Worker | IIFE | `out/webview/worker.js` |

### Scripts

```bash
npm run compile    # 本番ビルド
npm run watch      # ファイル変更監視ビルド
npm run lint       # ESLint チェック
npm run test       # テスト実行
```

---

## 📦 Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| [PixiJS](https://pixijs.com/) | 8.6.6 | WebGL レンダリング |
| [pixi-viewport](https://github.com/davidfig/pixi-viewport) | 6.0.3 | 無限キャンバス (drag/pinch/wheel) |
| [d3-force](https://d3js.org/) | 3.0.0 | 力学シミュレーション |
| [d3-hierarchy](https://d3js.org/) | 3.1.2 | 階層レイアウト |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.3 | 型安全な開発 |
| [esbuild](https://esbuild.github.io/) | 0.24.0 | 高速バンドラー |

---

## 📄 License

MIT © Code Grimoire Contributors
