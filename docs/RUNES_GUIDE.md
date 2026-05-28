# 5 ルーン (解析モード) ガイド

> **Code Grimoire は依存関係を「魔方陣」として描く VS Code 拡張です。** 1 つのコードベースに対し、同じグラフを 5 通りの観点 (= ルーン) で読み替えられます。本書は各ルーンが「何を見せ、どんなコードベースで活きるか」を整理したものです。

切替キーは **1 / 2 / 3 / 4 / 5** (順に default → architecture → security → optimization → analysis)。

---

## 早見表

| キー | ルーン | 主な可視化 | データ源 | 強み | 苦手 |
|----:|--------|-----------|---------|------|------|
| 1 | **default** ◇ | パス hash 色 + 行数サイズ | `relativePath`, `lineCount` | 全体俯瞰、形状の癖を見る | 構造課題は浮き上がらない |
| 2 | **architecture** ⬡ | 循環参照リング + Hotspot 🔥 | `inCycle`, `isHotSpot`, `gitCommitCount` | モノリス / レガシーの依存膠着検出 | マイクロサービスで何も光らない |
| 3 | **security** ⚠ | severity 別 ⛔/⚠/ⓘ | `securityWarnings[].severity` | 危険関数・Taint source の即時可視化 | 型安全プロジェクトで警告少なめ |
| 4 | **optimization** ⚡ | Tree-shaking スコア / barrel / side-effect | `treeShakingRisk`, `isBarrel`, `hasSideEffects` | SPA / npm package の bundle 最適化 | サーバーサイドのみだと意味薄 |
| 5 | **analysis** ⬢ | edge 5 色 + シンボル流量 | `edge.kind`, `edge.importedSymbols` | API コントラクト / データフロー把握 | 大規模で edge が混み合うと情報過多 |

---

## 1. default ◇ — 標準

### 何を見せるか
- **ノード色**: `relativePath` の hash 値から HSL 色相を決定。同じディレクトリのファイルは似た色になる。
- **ノードサイズ**: 行数に比例。
- ルーン固有のオーバーレイは **無し**。

### 強み
- 初めて開いた人がまず触る画面。「フォルダ単位の色まとまり」と「ファイル規模の偏り」を 5 秒で掴める。
- 他ルーンに切り替える前のニュートラルなベースラインとして使える。

### 苦手
- 構造的な問題 (循環参照、危険関数、デッドコード) は何も光らない。「ぱっと見」以上の情報は得られない。

### おすすめシナリオ
- リポジトリを開いた直後の最初の 30 秒
- ファイル数・規模分布を見せたいデモ場面

---

## 2. architecture ⬡ — 構造の紋章

### 何を見せるか
- **赤いリング**: `inCycle = true` のノード (Tarjan's SCC で検出された循環参照に属する)
- **二重リング + 🔥**: 上記のうち、Git commit 数で 75 パーセンタイル以上の **Hotspot** ノード
- **赤いエッジ**: 循環の中で行き来している import 線
- **石化 (灰色化)**: 循環に関係しない他ノードを淡色化

### 強み
- 「直すべき箇所」を 1 画面で示せる。循環参照の存在を Tarjan's SCC で正確に拾うため、目視や grep より早い。
- Hotspot の 🔥 表示で「直すと利得が大きい循環」を優先付けできる。Git 履歴連携の利点。

### 苦手
- 循環参照のない健全なコードベースでは何も光らない (= 何も問題がないという情報自体は有用だが、デモ映えはしない)。
- 依存方向の「向き」までは見せない。SCC グループの中での因果関係は別途読み取る必要あり。

### おすすめシナリオ
- レガシーコードの診断、初期リファクタ調査
- 循環依存疑惑をチームに見せる場面

---

## 3. security ⚠ — 防衛の紋章

### 何を見せるか
- ノードの周りに severity 別のリング:
  - **⛔ critical** — `eval` / `dangerouslySetInnerHTML` / `innerHTML` などの危険関数
  - **⚠ warning** — `req.body` / `location.search` / `localStorage` などの汚染源 (Taint source)
  - **ⓘ info** — `process.env.X` / `fs.readFile` などの情報源
- 三重符号化: 色 (赤/橙/黄) + アイコン (⛔/⚠/ⓘ) + テキスト (`[CRITICAL]` / `[WARNING]` / `[INFO]`) で色覚特性に配慮。
- Detail Panel にも該当行と理由が表示される。

### 強み
- 「危険関数が混じってるか」を全ファイル横断で 1 秒で判定。AST ベース (TypeScript Compiler API) なので、文字列正規表現マッチより誤検出が少ない。
- severity 階層により対応の優先順位が立てやすい。

### 苦手
- 関数間 / 配列経由 / async 跨ぎの Taint 伝播 (Sink 解析) は未実装 (将来課題)。同一関数内の単純な代入チェーンまで。
- TypeScript / JavaScript 以外のセキュリティリスクは見ない。

### おすすめシナリオ
- Node.js サーバーや Web フロントの監査の初手
- code review でセキュリティ懸念のあるファイルを当たり付け

---

## 4. optimization ⚡ — 最適化の紋章

### 何を見せるか
- **Tree-shaking リスクスコア** (0-100) でリング色:
  - **赤** (≥50) — 高リスク
  - **橙** (≥25) — 中リスク
  - **緑** (>0) — 低リスク
- **📦 barrel** マーク: `index.ts` で再エクスポートのみのファイル
- **⚡ side-effect** マーク: side-effect import (`import 'foo';`) を持つファイル
- リスク 0 のノードは石化 (淡色)。

### 強み
- バンドル最適化 (Tree-shaking) を阻害しているファイルを「赤い」ノードとして直接見せられる。
- barrel ファイルが Tree-shaking の敵になりやすい点を視覚的に説明できる。

### 苦手
- 実バンドラ (webpack/esbuild/rollup) との挙動差は厳密には合わない。あくまで「リスク score」という近似指標。
- サーバーサイド専用コード (Node.js for backend) では Tree-shaking 自体がそこまで重要視されないため、薄い情報になる。

### おすすめシナリオ
- SPA / npm パッケージ / ライブラリのリリース前監査
- 「なんでバンドル大きいんだ?」の起点

---

## 5. analysis ⬢ — 分析の紋章

### 何を見せるか
- **エッジを kind 別に色分け** (default ルーンでは 1 色だった依存線が 5 色になる):
  - **青** — `static-import` (普通の import)
  - **紫** — `dynamic-import` (`import('...')`)
  - **緑** — `type-import` (`import type {...}`)
  - **橙** — `side-effect` (`import 'foo';`)
  - **桃** — `re-export` (`export { x } from '...'`)
- **エッジの太さ**: `importedSymbols.length` に比例 (シンボル数が多いほど太い)。
- **ノード上のシンボル流量**: `⇄ N (↑X ↓Y)` 形式で表示。↑ = 供給 (他で使われている export 数)、↓ = 消費 (この file が import している数)。
- **フローリング**: 流量の多いノードを青い光輪で強調。

### 強み
- 「データがどこからどこへ流れているか」を一望できる。API コントラクトの理解、リファクタ時の影響範囲調査に強い。
- type-only import を緑で別扱いするので「型のみの依存」と「実行時依存」を明確に区別できる。

### 苦手
- 大規模リポでは edge が密集して情報過多になりやすい。toolbar の edge filter で kind を絞るのが前提。
- シンボル単位の追跡 (call graph) ではない。あくまで import 文ベース。

### おすすめシナリオ
- 「この関数を変えたら何が壊れる?」の影響範囲調査
- 公開 API 設計時、import される側の責務を確認

---

## ルーン間の使い分けフロー

1. **1 (default)** で全体を俯瞰、フォルダ単位の構成を確認
2. **2 (architecture)** で循環参照の有無をチェック
3. **3 (security)** で危険関数の散らばりを確認
4. **4 (optimization)** で bundle 最適化リスクを見る (フロントエンドなら)
5. **5 (analysis)** で重要ファイル周辺のデータフローを精査

順序通りやる必要はないが、「全体 → 構造 → 個別の懸念」と段階的に絞り込むのが直感的。

---

## 共通の表示要素 (どのルーンでも見える)

- **巨大ファイル警告** (T-03): 500 行超は橙リング、1000 行超は赤リング + `⚠ XXXL ${行数}L` ラベル。全ルーン共通で表示。
- **focus / context / global の同心円リング**: フォーカスノードに近いほど明るく描画。
- **Smart Labeling**: ノード接続数が多いほど label が前面表示。
- **Ghost Trail**: 過去のフォーカス履歴が点線で残る (Mandala / Galaxy レイアウト時)。

---

## ショートカット

| キー | 動作 |
|------|------|
| `1` | default に切替 |
| `2` | architecture |
| `3` | security |
| `4` | optimization |
| `5` | analysis |
| `Q` | Mandala (force) レイアウト |
| `W` | Galaxy (hierarchy) レイアウト |
| `E` | Bubble (balloon) レイアウト |
| `Ctrl+F` | インクリメンタル検索 + 全文検索 |
| `?` | ヘルプ表示 |

レイアウトとの組み合わせは [LAYOUTS_GUIDE.md](./LAYOUTS_GUIDE.md) を参照。
