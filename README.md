<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-^1.100.0-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/PixiJS-8.6.6-e72264?logo=pixi.js" alt="PixiJS">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

# 🔮 Code Grimoire

> プロジェクトの依存関係を「魔方陣」のような図で見える化する VS Code 拡張機能。
>
> *Code into Magic, Logic into Art.*

---

## これは何？

コードを書いていると、「このファイルはどれを使っていて、どれから使われているのか」がだんだん見えなくなってきます。特に AI と一緒に開発していると、ファイルが増えて全体像を見失いがちです。

**Code Grimoire** は、TypeScript / JavaScript プロジェクトの **依存関係（ファイル同士の import のつながり）を 1 枚の図にして、構造を直感的に掴めるようにする** VS Code 拡張です。グラフが「魔方陣」のように広がって見えるのが特色です。

- 🔍 **正確な解析** — 正規表現ではなく TypeScript Compiler API でファイルの依存を解析します。
- ⚡ **なめらかな描画** — WebGL（PixiJS）で描き、レイアウト計算を Web Worker に分けて UI が固まらないようにしています。
- 🧭 **5 つの解析モード × 3 つのレイアウト** — 「何を見たいか」に応じて表示を切り替えられます。

---

## 主な機能

| 機能 | 説明 |
| :--- | :--- |
| 依存グラフの可視化 | ファイル間の import 関係をグラフ表示 |
| 5 つの解析モード | 標準 / 構造（循環参照）/ セキュリティ / 最適化 / データフロー → [詳しく](docs/RUNES_GUIDE.md) |
| 3 つのレイアウト | 力学配置 / 同心円 / 入れ子円 → [詳しく](docs/LAYOUTS_GUIDE.md) |
| ファイル検索 | ファイル名 + 中身の全文検索（`Ctrl+F`） |
| 詳細パネル | クリックしたファイルの依存・被依存・Git 履歴などを表示 |

各モード・レイアウトの「どんなときに使うか」は、専用ガイドにまとめています：

- 📜 [解析モードガイド（RUNES_GUIDE）](docs/RUNES_GUIDE.md)
- 📐 [レイアウトガイド（LAYOUTS_GUIDE）](docs/LAYOUTS_GUIDE.md)

---

## インストール

### 前提条件
- VS Code `v1.100.0` 以上
- Node.js `v18` 以上

### 手順
```bash
git clone https://github.com/otonasi-muonn/Code-Grimoire.git
cd Code-Grimoire
npm install
npm run compile
```

### 起動
1. VS Code でこのフォルダを開き、`F5` でデバッグ起動します。
2. 立ち上がった別ウィンドウで、解析したいプロジェクトを開きます。
3. コマンドパレット（`Ctrl+Shift+P`）から **`CodeGrimoire: Open Grimoire`** を実行します。

初回起動時にかんたんな操作ツアーが表示されます。`?` キーでいつでもヘルプを開けます。

---

## キーボードショートカット

| Key | 動作 |
| :--- | :--- |
| `1` – `5` | 解析モードの切替 |
| `Q` / `W` / `E` | レイアウトの切替 |
| `Ctrl + F` | ファイル検索 |
| `Esc` | 検索解除 / パネルを閉じる |
| `?` | ヘルプの表示 / 非表示 |

ノードをクリックすると、そのファイルが中心に来て依存先が周りに再配置され、詳細パネルが開きます。

---

## しくみ（技術ハイライト）

- **解析**: TypeScript Compiler API（AST）で、正規表現に頼らず依存を正確に解決します。循環参照は Tarjan's SCC アルゴリズムで検出します。
- **描画**: PixiJS（WebGL）でレンダリング。ズームアウト時はノードを簡略表示する LOD（詳細度）で描画負荷を抑えます。
- **計算の分離**: `d3-force` の物理シミュレーションを Web Worker にオフロードし、UI スレッドをブロックしません。
- **3 コンテキスト構成**: Extension Host（解析）/ Webview（描画）/ Web Worker（レイアウト計算）。詳細は [CLAUDE.md](CLAUDE.md) を参照してください。

---

## ビルド

```bash
npm run compile    # 本番ビルド
npm run watch      # 変更監視ビルド
npm run lint       # ESLint チェック
npm run test       # テスト
```

esbuild で Extension Host（CJS）/ Webview（IIFE）/ Web Worker（IIFE）の 3 つを別々にバンドルしています。

---

## 技術スタック

| ライブラリ | バージョン | 用途 |
| :--- | :--- | :--- |
| [PixiJS](https://pixijs.com/) | 8.6.6 | WebGL レンダリング |
| [pixi-viewport](https://github.com/davidfig/pixi-viewport) | 6.0.3 | 無限キャンバス（drag / pinch / wheel） |
| [d3-force](https://d3js.org/) | 3.0.0 | 力学シミュレーション |
| [d3-hierarchy](https://d3js.org/) | 3.1.2 | 入れ子円（泡宇宙）レイアウト |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.3 | 解析エンジン（Compiler API） |
| [esbuild](https://esbuild.github.io/) | 0.24.0 | バンドラー |

---

## もっと詳しく

- 🗂️ [ドキュメント索引](docs/README.md)
- 📜 [解析モードガイド](docs/RUNES_GUIDE.md)
- 📐 [レイアウトガイド](docs/LAYOUTS_GUIDE.md)
- 🤝 [コントリビューションガイド](CONTRIBUTING.md)
- 📝 [変更履歴（CHANGELOG）](CHANGELOG.md)

---

## ライセンス

MIT © Code Grimoire Contributors
