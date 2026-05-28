# Code Grimoire ロードマップ (2 トラック)

20 ペルソナ擬似ユーザビリティ評価 + devils-advocate (`docs/20260528_persona_usability.md`) と、その前の多角的レビュー (`docs/20260527_review_v020.md`) の結論を、**展示前 (安定バージョン)** と **リリース後** の 2 トラックに整理したもの。今後の会話はこの 2 軸で進める。

- 展示日: **2026-05-30 (技育博 vol.1)**
- 基盤: develop ブランチ (安定版コミット積み上げ済)
- 方針: 展示前はコード変更を低リスク順に最小化。各タスクで lint/tsc/compile + F5 確認、問題は `git revert` で個別ロールバック

---

## トラック A: 安定バージョンまで (展示前)

### A-1. 実機確認 (人間作業、コード変更なし、最優先)
- [ ] 会場 PC 相当機で **オフライン動作** 確認 (`worker-bridge.ts` の `fetch(workerUrl)` が会場 Wi-Fi なしで動くか)
- [ ] **WebGL 有効性** 確認 (貸出 PC / リモートデスクトップで WebGL が使えるか、`app.renderer.type` が `1`=WebGL か)
- [ ] **VS Code バージョン** 確認 (会場 PC が `engines ^1.100.0` を満たすか)
- [ ] **vsix 配布動線** の確認 (会場 PC への拡張インストール方法)
- [ ] **morph メモリ実測** (DevTools Memory で数十回 Summon/レイアウト切替 → ヒープ増加が許容内か)
  - 許容内 → 触らない (YAGNI)
  - クラッシュ級 → トラック A に「DONE 時のみ再構築」を追加 (PixiJS Issue #10549/#10586 注意、単純な position.set 化は禁止)

### A-2. コントラスト修正 (低リスク、CSS 色値のみ) ✅ 実装対象
- [ ] コード行番号 `rgba(100,140,200,0.25)` = **1.36:1** (会場プロジェクタで最致命) — `webview.ts:478`
- [ ] 検索プレースホルダ `rgba(100,140,200,0.5)` = 2.25:1 — `webview.ts:111`
- [ ] search-count / search-icon — `webview.ts:113-126`
- [ ] 依存リスト `(kind)` / `(NL)` 注記 `rgba(100,140,200,0.5)` = 2.24:1 — `detail-panel.ts:131,452`

### A-3. UX 文言改善 (低リスク、文字列のみ) ✅ 実装対象
- [ ] オンボーディング STEPS 先頭に目的文を追加 — `onboarding.ts`
- [ ] 魔術用語に素の説明を併記 (Summoning/石化 等) — `onboarding.ts` / `help.ts`
- [ ] ローディング文言を進捗込みに — `webview.ts`

### A-4. 意味バグ修正 (中リスク) ✅ 実装対象
- [ ] データフロー ↑↓ を RUNES_GUIDE と統一 — `detail-panel.ts`
- [ ] cycleCount 表記を「循環に巻き込まれたファイル数」に統一 — `RUNES_GUIDE.md` / `LAYOUTS_GUIDE.md`
- [ ] help の optimization 説明を Tree-shaking 主軸に統一 — `help.ts`

---

## トラック B: リリース後 (展示後)

展示当日には影響しないが、正式リリースを目指すなら対応価値あり。

### B-1. パフォーマンス
- [ ] 描画 O(E×N) の解消: `graph.ts:244` の `nodes.find` を `nodeById` Map で O(1) 化 (#11/#15)
- [ ] morph destroy 最適化: DONE 時のみ再構築 (実測でクラッシュ確認時のみ展示前に前倒し、PixiJS Issue 注意) (#15)
- [ ] ビューポートカリング + ノード数上限 (#11)

### B-2. 解析の意味論
- [ ] `hasSideEffects` のフラグ対象 (source) の明確化 or ラベル修正 (#4)
- [ ] `treeShakingRisk` を「未使用 export (デッドコード)」と「shake 阻害」に分離 (#4)
- [ ] 危険関数の取りこぼし: `new Function()`/`setTimeout(string)`/`obj['eval']` 追加、checker でシンボル解決 (#10)
- [ ] `export * from` の star re-export シンボル流量集計 (#3)

### B-3. アクセシビリティ・操作性
- [ ] キーボードで Summon/ノード選択 (検索ヒット → Enter、Tab/矢印巡回) (#13/#14)
- [ ] aria/role/focus-visible: オーバーレイに role="dialog"、クリック要素を button 化 (#14)
- [ ] inline style の CSS class 化 (kind 注記等、lessons L3) (#14)

### B-4. 拡張・エコシステム
- [ ] CLI/JSON・DOT エクスポート (CI ゲート用途、bin エントリ) (#16)
- [ ] テスト追加: Tarjan/依存解決/security の単体テスト (#5)
- [ ] `contributes.keybindings` 宣言 (Keyboard Shortcuts UI 対応 + 再割当) (#18)
- [ ] `unsafe-eval` 除去可否の再検証 (PixiJS v8 で本当に必要か) (#18)
- [ ] 被依存リストから該当 import 行へジャンプ (`JUMP_TO_FILE` の line:1 固定解消) (#20)

### B-5. 機能拡張 (大きめ、要検討)
- [ ] 初期フォーカスに index/main ファイル名ヒューリスティック加味 (#9)
- [ ] Python 等の多言語対応 (#17)
- [ ] パス hash 色の改善: 兄弟フォルダに色相を等間隔分配 (docs の「似た色」と一致) (#6)

---

## 参照

- 多角的レビュー (壊滅バグ): `docs/20260527_review_v020.md`
- 20 ペルソナ評価: `docs/20260528_persona_usability.md`
- 手動回帰チェック: `tasks/regression_check.md`
- 再発防止ルール: `tasks/lessons.md`
