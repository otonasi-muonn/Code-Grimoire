# Lessons Learned (再発防止ルール)

> v0.2.0 改修中・多角的レビュー (10 エージェント並列) 中・追加修正フェーズで得た知見を、将来の改修で再発させないためのルール集として記録。
> このファイルは CLAUDE.md §4 「Capture Lessons」に基づく一般化されたルールであり、個別タスクの履歴は git log を参照する。

---

## L1. PixiJS Graphics は `destroy()` を呼ぶこと

**ルール**: PixiJS の `Graphics` / `Container` を再描画前に破棄するときは、`removeChildren()` だけでなく `destroy({ children: true })` も呼ぶ。

**理由**: PixiJS Graphics は GL バッファ・テクスチャ等の内部リソースを持つ。`removeChildren()` は親子関係を切るだけで内部リソースは解放されず、GC では即時開放されないため長時間運用でメモリリーク。今回 `graph.ts:renderGraph` と `drawing.ts:drawRingGuides` で発生していた。

**適用場面**:
- `renderGraph` / `drawXXX` 等、毎フレームまたは頻繁に呼ばれる描画関数
- `effects.ts` の使い捨て Graphics (shockwave, ripple, flash) も同様 → ここは既に `destroy()` 済み

---

## L2. 警告系の視覚表現は色だけで判別させない (二重符号化)

**ルール**: severity / リスクレベル / 警告レベルを表示するときは、必ず **色 + 形状 (リング太さや絵文字) + テキストラベル** の 3 要素のうち 2 つ以上を併用する。

**理由**:
- 色弱モデル (deuteranopia / protanopia / tritanopia) で赤と橙の区別が困難なケースがある
- スクリーンリーダーは色を読まない
- WCAG 2.2 アクセシビリティ準拠

**今回の適用例**:
- `SecurityWarning.severity`: 色 (赤/橙/黄) + 絵文字 (⛔/⚠/ⓘ) + 大文字テキスト (`[CRITICAL]` / `[WARNING]` / `[INFO]`)
- `hugeFileLevel`: 色 (橙/赤) + リング太さ + ラベル `⚠ XXXL ${行数}L`
- `isHotSpot`: 二重リング + 🔥 + commit 数

---

## L3. inline `style="..."` 直書き禁止 (CSS class 経由にする)

**ルール**: 動的な色や属性を `style=` に文字列展開しない。CSS class (例: `.dp-severity-critical`) を定義してそれを class 属性で切り替える。

**理由**:
- 動的値が unsanitized 入力に由来した場合の CSS インジェクション境界を消す
- スタイル変更時に 1 箇所だけ修正すれば全箇所に反映される
- escapeHtml() があっても style 属性の中身 (色値・URL) は素通しになりやすい

**今回の適用例**: `detail-panel.ts` の severity / hugeFileLevel 表示で inline style を撤廃し `.dp-severity-* / .dp-huge-*` クラスへ移行。

---

## L4. 非同期処理に in-flight ガードを入れる

**ルール**: `await` を伴う処理を **debounce + setTimeout** 経由で呼ぶときは、処理時間が debounce より長くなる可能性を考え、`isInFlight` フラグ + 完了後の `pending` 再走機構を入れる。

**理由**: 1.5 秒 debounce でも `analyzeWorkspace` が 2 秒以上かかれば多重起動が起きる。古い解析結果で webview を上書きすると画面チラつき + CPU 100% リスク。

**今回の適用例**: `extension.ts:scheduleReanalysis` → `runAnalysisGuarded` を経由するように変更。

---

## L5. PixiJS v8 は `preference` を明示する (Canvas2D フォールバック隠蔽防止)

**ルール**: PixiJS v8 の `app.init` には必ず `preference: 'webgl'` または `'webgpu'` を明示する。さらに `app.renderer.type` をログ出力する。

**理由**: PixiJS v8 デフォルトは WebGL → WebGPU → Canvas2D の順でサイレントフォールバック。展示で「WebGL 描画」を謳う以上、Canvas2D に落ちたことを開発者が気付ける仕組みが必要。

**外部ソース**: [PixiJS v8 Renderers](https://pixijs.com/8.x/guides/components/renderers) (Tier 1)

---

## L6. 例外境界は **必ず UI 復旧** までセットで書く

**ルール**: `.catch` や `try/catch` で例外をキャッチするとき、`console.error` だけで終わらせない。**UI 状態 (loading フラグ等) を必ずクリーンアップ**してユーザーに「何が起きたか」を最低限通知する。

**理由**: `worker-bridge.ts:initWorker` の fetch 失敗で `state.isLoading = true` のままになり、ローディングオーバーレイが永続化したケースが今回発生。

**今回の適用例**: `worker-bridge.ts:109` の `.catch` で `state.isLoading = false + stopParticleLoading + updateStatusText` を追加。`extension.ts:runAnalysis` の catch で `vscode.window.showErrorMessage('...再試行')` で再実行アクション付与。

---

## L7. パンフレット / 公開メッセージの謳い文句は「touch-禁止リスト」として記録する

**ルール**: 外部に公開した「正規表現に頼らず TypeScript Compiler API」「Tarjan's SCC」「Web Worker で 60fps」のような技術的主張は、それらに関わる実装ファイル・関数を一覧化し、修正時には特別な注意 (テスト / レビュー) を払う。

**理由**: 公開メッセージと実装が乖離した瞬間に信頼が崩れる。改修時に「触っていいか」を判断する明示的な境界が必要。

**今回の touch-禁止リスト**:
- `analyzer.ts:detectCircularDependencies` (Tarjan's SCC)
- `analyzer.ts:resolveModuleName` / `collectExports` (TS Compiler API)
- `worker.ts:initForceSimulation` 基本構造 (Web Worker 隔離)
- `shared/types.ts` の既存メッセージ Union 型 (後方互換)

---

## L8. 一括コミットでなく独立コミットに分ける

**ルール**: 複数の独立タスクを 1 コミットにまとめない。`fix:` / `feat:` / `refactor:` / `docs:` のプレフィックス付きで 1 機能 1 コミット。

**理由**:
- 問題発生時に `git revert <hash>` でピンポイント戻しができる
- `git log` で「何のためにこの変更が入ったか」が追える
- レビュー時に分割して読める

**反面教師**: `e75f095` で 6 タスク (T-01/T-03/T-04/T-05/T-06/T-08) を一括コミットしたため、後のレビュー時に「どの変更が何のため」を再構築する必要が出た。

---

## L9. マージ順序起因の宣言消失を git log で追う

**事象**: `fddbcbe` と `19d169b` で同一の「commitNorm 宣言を復活」というコミットが 2 回出現。マージ順序起因で消失 → 復活 → 消失 → 復活のサイクルが起きていた可能性。

**ルール**: マージ後は `git log -p -- <該当ファイル>` で「同じ宣言が削除・再追加されてないか」を確認する。pre-commit hook でビルドエラーを検出するのが理想だが、最低限手動でチェック。

---

## L10. 「使う側の視点」を別観点として持つ

**ルール**: コードレビューや実装判断は「動くか」だけでなく「**展示来場者 / エンドユーザーが触ったときどう感じるか**」の観点を別途持つ。

**理由**: 今回、解析中エフェクトの位置 / UI 重なり / Balloon 視認性は、コードレビューでは挙がらず、ユーザーが実機で触って初めて気づいた。コードを読むだけでは見えない問題がある。

**実践**:
- F5 で拡張ホストを必ず起動し、目視確認する (CLAUDE.md §3 「動作確認は人間が実施」を遵守)
- 来場者が 30 秒で何ができるか想像する
- 色覚特性・キーボード操作・小さい画面でも使えるかを検討

---

## L11. 「touch-禁止」をいきなり破らず、合成テストで結果一致を確認する

**ルール**: パンフレット謳い文句に関わるロジック (Tarjan's SCC 等) を変更する場合、**変更前と変更後で出力が完全一致することを確認できる小さなサンプル** を用意してから着手する。

**今回の Tarjan 反復化の場合の例**:
- A → B → A の 2 ノード自己ループ
- A → B → C → A の 3 ノード循環
- A → B → C (線形、循環なし)
- 自己エッジ A → A
- 2 つの独立した循環 (A → B → A) + (C → D → C)

これらで `detectCircularDependencies` の出力が完全一致することを目視確認してからマージ。

---

## L12. CLAUDE.md / プロジェクト固有 CLAUDE.md は AI 引継ぎ用に整える

**ルール**: ユーザー global `CLAUDE.md` だけでなく、プロジェクトルートに `CLAUDE.md` を置き、以下を明記:
- ブランチ運用 (main 直 push 禁止、develop が本流)
- 検証フロー (lint / tsc / compile)
- マルチエージェント編成ルール
- touch-禁止リスト
- 言語ポリシー
- 既存ライブラリ縛り

**理由**: 新メンバー / 別 AI セッションでも同じ規約で作業できる。Token を毎回ユーザーが伝えるコストを下げる。

---

## 関連ドキュメント

- 詳細レビュー報告書: `docs/20260527_review_v020.md`
- 5 ルーン解説: `docs/RUNES_GUIDE.md`
- 3 レイアウト解説: `docs/LAYOUTS_GUIDE.md`
- 手動チェックリスト: `tasks/regression_check.md`
- プロジェクト規約: `CLAUDE.md` (ルート)
