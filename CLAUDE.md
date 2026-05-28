# Code Grimoire プロジェクト規約 (AI 向け CLAUDE.md)

> このファイルはプロジェクト固有のルール。ユーザー global `~/.claude/CLAUDE.md` のルールも引き続き適用される (上書きではなく **追加**)。日本語 OK (層 2 = Claude への指示書)。

---

## 1. ブランチ運用

- **`main`**: VS Code Marketplace 公開済み安定版 (`muonn.codegrimoire@0.1.2`)。**直接コミット禁止**
- **`develop`**: 開発本流、次の安定リリース候補
- **`feature/*`**: develop から切る (例: `feature/multi-tsconfig-support`)
- **merge は `--no-ff` 必須** (マージコミットで feature 境界を明示)
- **作業場所は `C:\.program\Code-Grimoire` 固定** (`.claude/worktrees/` 等は使わない、ユーザー明示指示)
- 公開時に `develop → main` の流れ
- 展示前は `develop` で完結、main へは push しない

---

## 2. 環境セットアップ

```bash
cd C:\.program\Code-Grimoire
npm install
npm run compile          # esbuild: out/extension.js + out/webview/main.js + out/webview/worker.js
npm run watch            # 開発中の自動再ビルド
# VS Code で F5 → Extension Development Host が起動
```

ビルド構成:
- `tsconfig.json` → Extension コード (Node.js, CJS)
- `tsconfig.webview.json` → Webview / Worker コード (Browser, IIFE)
- esbuild で別バンドル (`esbuild.js`)

---

## 3. 検証フロー (コミット / merge 前に必須)

以下 3 つすべて pass してから commit:

```bash
npm run lint                                          # eslint 警告ゼロ
npx tsc --noEmit                                      # Extension 型エラーゼロ
npx tsc --noEmit -p tsconfig.webview.json             # Webview 型エラーゼロ
npm run compile                                       # esbuild Build complete!
```

**F5 動作確認は人間が実施** (AI は「テストした」と言わない)。最低限のチェックは `tasks/regression_check.md` を参照。

---

## 4. コミット規約

- **Conventional Commits 風**プレフィックス: `feat / fix / docs / chore / refactor / test`
- **日本語 OK** (層 1 = ユーザー向け出力)
- **HEREDOC で複数行**:
  ```bash
  git commit -m "$(cat <<'EOF'
  feat(analyzer): multi-tsconfig 対応

  詳細な理由・背景・検証結果...

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```
- 末尾に **`Co-Authored-By:` 行**を必須付与 (AI 共同作業の明示)
- **`git add -A` 禁止**、特定ファイル指定 (.env 等の事故防止)
- **hooks スキップ禁止** (`--no-verify`, `--no-gpg-sign` 等)
- **amend 禁止**、常に新規コミット
- 1 機能 = 1 コミット (lessons L8 参照)
- `*.vsix` バイナリは `.gitignore` 済

---

## 5. マルチエージェント編成 (CLAUDE.md §5 準拠)

レビュー / 設計判断系のタスクで起動する標準編成:

| 分類 | 役割 | 代表エージェント |
|------|------|------------------|
| 実行系 1-2 | 実装・修正・調査 | `Explore` / `bug-hunter` / `general-purpose` |
| レビュー系 1 | 多角的評価 | `multi-perspective-reviewer` |
| **批判系 1 (必須)** | 粗探し | `devils-advocate` |

ルール:
- 同一メッセージで**並列起動** (互いの出力を見せない → アンカリング回避)
- 統合は呼び出し元 Claude が行う
- 仲裁ルール: 双方の出典 Tier を比較 → 同等なら **user 判断を仰ぐ**
- 「批判系を抜く」のは **ユーザー明示時のみ**

外部知見の Tier:
- Tier 1: 公式 (`docs.claude.com`, `anthropic.com/engineering`, `code.visualstudio.com/api`, `github.com/anthropics`, `github.com/microsoft/vscode`, `pixijs.com/8.x`)
- Tier 2: 実績ある実務家・高 Star OSS
- Tier 3: 個人ブログ・コミュニティ記事 (単独採用しない)

---

## 6. 言語ポリシー

| 層 | 対象 | 言語 |
|----|------|------|
| 層 1 ユーザー向け | チャット応答、`docs/*.md`、`tasks/*.md`、コミットメッセージ | **日本語** |
| 層 2 Claude 指示書 | このファイル `CLAUDE.md` | **日本語 OK** |
| 層 3 AI 内部資産 | `.claude/agents/*.md`、`.claude/commands/*.md`、`.claude/skills/*/SKILL.md` | **英語推奨** |

---

## 7. コード原則

- **YAGNI**: Acceptance Criteria 外の機能は書かない・テストしない
- **Deletion First**: 新規実装の前に「既存のリファクタ・削除で済まないか」を必ず検討
- **既存ライブラリ縛り**: `pixi.js` / `d3-force` / `d3-hierarchy` / `pixi-viewport` 以外を**追加しない** (例外として `@vscode/ripgrep` は採用、追加要望は事前合意)
- **型先行**: `src/shared/types.ts` の変更を**最初**に。その後 Extension / Webview / Worker の実装
- **`innerHTML` 直代入禁止**: 新規 DOM 操作は `createElement` / `textContent` で (lessons L3)
- **PixiJS Graphics の `destroy()`**: renderGraph 再呼び出し時のメモリリーク対策 (lessons L1)
- **嘘実装禁止**: `Math.random()` 等の見せかけ表示、未実装機能のヘルプ記述などは絶対 NG
- **ハードコード閾値の回避**: プロジェクト規模依存の定数 (`>= 10` 等) でなく、**パーセンタイル等の相対値**で
- **警告系の二重符号化**: 色だけで判別させない (lessons L2)
- **inline `style=` 禁止**: CSS class 経由 (lessons L3)
- **非同期処理に in-flight ガード**: debounce + setTimeout は重複起動を防ぐ (lessons L4)

---

## 8. アーキテクチャ境界 (3 コンテキスト)

| コンテキスト | 主要ファイル | ビルド | 環境 |
|-------------|------------|-------|------|
| Extension Host | `src/extension.ts` / `src/analyzer.ts` / `src/ripgrep-search.ts` | esbuild CJS | Node.js |
| Webview | `src/webview/main.ts` ほか UI | esbuild IIFE | Browser |
| Web Worker | `src/webview/worker.ts` | esbuild IIFE | Browser Worker |

- メッセージプロトコルは **`src/shared/types.ts` に集約**
- Worker 送受信は **構造化クローン可能な値のみ** (関数・Class インスタンス禁止)
- tsconfig は分離 (`tsconfig.json` / `tsconfig.webview.json`)
- Worker URL は HTML の `data-worker-uri` 属性から取得し、`fetch` → `Blob` → `Worker` で CSP 制限を回避

---

## 9. CSP / セキュリティ

- 現状 CSP: `script-src 'nonce-${nonce}' 'unsafe-eval'` (PixiJS 8 の `new Function` 利用のため `unsafe-eval` 必須)
- 新規 `innerHTML` 直代入禁止 (既存箇所は `escapeHtml` 経由必須)
- `escapeHtml` は `& < > " '` の 5 文字をエスケープ
- `eval` / `new Function` の新規追加禁止 (PixiJS 依存は例外)
- 外部 URL fetch 禁止 (CSP `connect-src` 制限)

---

## 10. アクセシビリティ

- 色弱対応: 形状 / アイコン / テキストの**二重符号化** (色のみで判別させない)
- **WCAG 2.2 コントラスト比**: 4.5:1 (通常テキスト) / 3:1 (大テキスト・UI 要素)
- 検証ツール:
  - Sim Daltonism (macOS) / Color Oracle (Windows) で 3 種色覚モデル下確認
  - Chrome DevTools の Accessibility パネルでコントラスト比実測

---

## 11. タスク管理

- **期限・スケジュール表は使わない** (ユーザー明示)
- **優先度マーク (🔴🟡🟢) は使わない** (ユーザー明示)
- **依存関係ベース**で順序を決める
- 過剰なタスク分解は逆効果 (「下手にタスク考えたくない」精神)
- ユーザー指摘事項は `tasks/lessons.md` に再発防止ルールとして記録

---

## 12. Marketplace 戦略

- 当面 `develop` で完結、**Marketplace への push は実行しない**
- 将来公開時:
  1. `vsce package --pre-release` でローカル VSIX 生成
  2. `vsce publish --pre-release` で段階公開
  3. 数日〜1 週間の自己使用で問題なければ `vsce publish` で stable
- Marketplace は**版下げ不可** → 問題発覚時は patch リリースで対応
- `.vscodeignore` に `*.vsix` 追加済

---

## 13. パンフレット記載の謳い文句との整合 (touch-禁止リスト)

技育博 vol.1 ブース #A07 グリモワール (チーム名) で提出済みの謳い文句に直結する実装。改修時は特別な注意。

| 領域 | ファイル / 関数 | 理由 |
|------|---------------|------|
| 循環参照検出 | `analyzer.ts:detectCircularDependencies` (Tarjan's SCC) | パンフレット記載 |
| TS Compiler API 型解決 | `analyzer.ts:resolveModuleName` / `collectExports` / `applyOptimizationMetrics` | 「正規表現に頼らず TypeScript Compiler API」 |
| Worker レイアウト計算 | `worker.ts:initForceSimulation` の基本構造 | 「d3-force を Web Worker に隔離して 60fps」 |
| WebGL 描画 | `webview/main.ts:app.init({ preference: 'webgl' })` | 「PixiJS による WebGL 描画」 |
| 5 ルーン × 3 レイアウト | `toolbar.ts:RUNE_BUTTONS / LAYOUT_BUTTONS` | 5×3=15 通り維持 |
| メッセージプロトコル | `src/shared/types.ts` の既存 Union 型 | 後方互換性 (v0.1.2 → v0.2.0) |

これらに矛盾する実装変更 (文字列正規表現への退行、Worker 隔離の解除、ルーン削除等) は禁止。

---

## 14. 関連ドキュメント

- 5 ルーン詳細: [docs/RUNES_GUIDE.md](./docs/RUNES_GUIDE.md)
- 3 レイアウト詳細: [docs/LAYOUTS_GUIDE.md](./docs/LAYOUTS_GUIDE.md)
- 手動回帰チェック: [tasks/regression_check.md](./tasks/regression_check.md)
- 再発防止ルール: [tasks/lessons.md](./tasks/lessons.md)

---

## 15. 想定 AI 引継ぎ例

新しい Claude セッションで作業を引き継ぐ場合、以下を順に確認:

1. `git log --oneline main..develop | head -30` で最近のコミットを把握
2. このファイル + `tasks/lessons.md` を読み「過去の判断履歴 + ルール」を理解
3. `tasks/regression_check.md` で手動確認項目を把握
4. 必要なら `docs/20260527_review_v020.md` (詳細レビュー) を参照
5. ユーザーに「何をしたいか」を聞いてから着手

ファイル所在の手がかり:
- 解析ロジック: `src/analyzer.ts`
- メッセージ型: `src/shared/types.ts`
- 描画: `src/webview/renderer/graph.ts`
- レイアウト: `src/webview/worker.ts`
- UI: `src/webview/ui/*`
- HTML / CSS: `src/webview.ts`
