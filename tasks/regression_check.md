# 手動回帰チェックリスト (技育博 vol.1 展示用)

> 展示日 2026-05-30 までに 1 度実施。発表前 PC でも追えるよう、コードを読まない手順だけにする。

---

## 起動

- [ ] VS Code で `C:\.program\Code-Grimoire` を開く
- [ ] F5 → "Extension Development Host" が新規ウィンドウで起動
- [ ] 新ウィンドウで適当な TypeScript プロジェクト (例: 自分のプロジェクト) を開く
- [ ] コマンドパレット → `CodeGrimoire: Open Grimoire` 実行
- [ ] **初回ユーザー想定**: 右下にオンボーディングツアーが表示される (5 ステップ)
- [ ] DevTools (F12) Console に `[Code Grimoire] Renderer: 1` (WebGL) と表示されている

---

## ルーン × レイアウト 全 15 通り (主要観察ポイント)

各組み合わせで「描画崩れ・例外なし・ノードが見える」ことを確認。

### Mandala (Q)
- [ ] **default (1)**: 物理シミュレーションでクラスタが自然に分かれる
- [ ] **architecture (2)**: 循環参照ノードに赤リング、Hotspot 🔥 が見える (リポにある場合)
- [ ] **security (3)**: 危険関数ファイルが ⛔/⚠/ⓘ で表示
- [ ] **optimization (4)**: tree-shaking リスクで赤/橙/緑リング、📦/⚡ マーク
- [ ] **analysis (5)**: edge が 5 色 (青/紫/緑/橙/桃) で色分け、ノード上に `⇄ N (↑X ↓Y)`

### Galaxy (W)
- [ ] **default (1)**: 中心ノードからリング状に放射
- [ ] **architecture (2)**: 最外周に Orphan (孤立) ノード
- [ ] **security (3)**: severity 階層で表示
- [ ] **optimization (4)**: 最外周 = デッドコード候補 + tree-shaking リスクで二重符号化
- [ ] **analysis (5)**: edge 色分け + シンボル流量

### Bubble (E)
- [ ] **default (1)**: フォルダが入れ子の円で表現、子ファイルが内部に
- [ ] **architecture (2)**: cycleCount メトリクス (toolbar で `cycles` 選択) でフォルダ縁が赤
- [ ] **security (3)**: 危険関数ファイルが該当 bubble 内で強調
- [ ] **optimization (4)**: avgLineCount メトリクス (toolbar) で肥大フォルダが赤
- [ ] **analysis (5)**: edge 色分けが bubble 越しに見える
- [ ] **bubble label が読める**: 深い階層 (depth 4 以上) でもラベルが識別可能

---

## 主要機能

### Detail Panel
- [ ] ノードクリック → 右側に Detail Panel 開く
- [ ] **Security** ルーンで Security Warning がある node → `⛔ [CRITICAL]` / `⚠ [WARNING]` / `ⓘ [INFO]` 表示
- [ ] **巨大ファイル (1000+ 行)** → `⚠ [CRITICAL] 1234 lines` 表示
- [ ] Activity ヒートバーが過去 8 ヶ月の commit 数で表示 (Git 有効時)
- [ ] パス・行数・エクスポート・依存・被依存セクションすべて表示
- [ ] 📄 ボタンでファイルを VS Code エディタで開ける
- [ ] ✦ Summon ボタンでフォーカス変更

### 検索
- [ ] `Ctrl+F` で検索バー開く
- [ ] **ファイル名検索**: 文字入力で即座にマッチ件数表示、マッチしないノードが暗くなる
- [ ] **内容検索 (ripgrep)**: 300ms デバウンス後にファイル内容の一致も追加 (`(by-name N + by-content M)` 表示)
- [ ] **0 件ヒット**: `0 matches` と表示
- [ ] `Enter` で次のマッチへ FlyTo
- [ ] `Esc` で検索クリア

### Summoning (フォーカス移動)
- [ ] ノードクリック → 世界が再配置、focus ring が新しい中心に
- [ ] パンくずリストに前のフォーカスが追加される
- [ ] Ghost Trail (過去軌跡の点線) が描かれる

### ヘルプ
- [ ] `?` キーでヘルプ表示
- [ ] **Detail Panel が開いている時にヘルプ開くと、Detail Panel が閉じる** (排他)
- [ ] ヘルプ末尾に「🔁 ツアーをもう一度見る」ボタン → クリックでオンボーディング再表示
- [ ] 背景クリックで閉じる、Esc でも閉じる

### Minimap
- [ ] 画面右下に縮小マップ
- [ ] 白い矩形が現在のビューポート
- [ ] クリックでその位置にジャンプ

### LOD 自動切替
- [ ] ズームアウトすると LOD `far` に切替、ノードがドットに
- [ ] 型インポート (緑/破線) が非表示になる (analysis 以外)
- [ ] ズームインで `mid` に戻る

---

## エッジケース / 安全性

### Git なし環境
- [ ] `.git` のないフォルダを開く → エラーなく解析完了
- [ ] Detail Panel に Git セクションが表示されない (or commit 数なし)
- [ ] Activity ヒートバーが Hot spot 🔥 を表示しない

### 解析失敗
- [ ] workspace を閉じてから `CodeGrimoire: Open Grimoire` → エラーメッセージ表示
- [ ] **VS Code 通知に「再試行」ボタンが出る** → 押すと再解析が走る

### Worker 起動失敗
- [ ] (シミュレーション困難) — ローディング画面が永続化しないこと

### プリセット切替 (展示用)
- [ ] `settings.json` に `codegrimoire.demoPresets` を 2-3 個登録
- [ ] コマンドパレット → `CodeGrimoire: Load Demo Project` → QuickPick 表示
- [ ] プリセット選択 → 現ウィンドウでフォルダが切り替わる
- [ ] 切替後にパネル状態がクリーンになる (古いグラフが残らない)

### 連続ファイル編集
- [ ] 1 秒以内に複数ファイルを保存 → 1.5 秒デバウンス後に **1 回だけ** 再解析が走る
- [ ] 解析中に追加編集 → 完了後に最新変更を反映するために再走 (`analysisInFlight` ガード)

---

## メモリ・パフォーマンス (時間あれば)

- [ ] DevTools (F12) → Performance タブで FPS を計測、Mandala で `60` 付近
- [ ] DevTools Memory タブで heap snapshot
  - 起動直後 / ルーン切替 50 回後 で比較 → heap 増加が緩やか
- [ ] 大規模プロジェクト (1000+ ファイル) で初回解析時間 < 5 秒目安

---

## アクセシビリティ (時間あれば)

- [ ] **色覚シミュレーター** (Color Oracle, macOS Sim Daltonism 等):
  - Deuteranopia / Protanopia / Tritanopia で Security Rune の ⛔/⚠/ⓘ が識別可能
  - hugeFileLevel の警告リングが識別可能
- [ ] Chrome DevTools Accessibility パネルで Detail Panel テキストのコントラスト比 4.5:1 以上

---

## 展示当日チェック (5/30 朝)

- [ ] 会場 PC で F5 起動
- [ ] DevTools Console に `[Code Grimoire] Renderer: 1` (= WebGL) を確認
  - もし `0` (= WebGPU) や `2` (= Canvas) なら、グラフィックドライバ確認
- [ ] 主要 3-4 プリセットの解析時間を体感確認
- [ ] minimap / detail-panel / search のレスポンスが遅延なし

---

## トラブル対応

| 症状 | 確認手順 |
|------|---------|
| グラフが表示されない | DevTools Console のエラー → ANALYSIS_ERROR 受信していないか確認、`CodeGrimoire: Open Grimoire` を再実行 |
| ローディングが終わらない | DevTools Console に `Worker init failed` が出ていないか、出ていれば bundle 不在 → `npm run compile` 再実行 |
| FPS が落ちる | LOD `far` モードになっているか、ズームインしすぎていないか確認 |
| 検索が反応しない | Console に `ripgrep` 関連の警告がないか、`@vscode/ripgrep` モジュール解決失敗の可能性 |
| パネルが重なる | Help を Esc で閉じる、Detail Panel の × ボタンで閉じる、それでもダメなら F5 で拡張ホスト再起動 |

---

## NG 判定基準 (= 展示できない)

以下のいずれかが発生したら **展示中止 or 直前修正**:
- ❌ グラフが初回解析で表示されない
- ❌ ノードクリックで例外発生
- ❌ ルーン切替で描画崩壊
- ❌ オンボーディング・ヘルプが開かない
- ❌ Renderer が WebGL でない (会場 PC のドライバ問題、それ自体は拡張のせいではないが)
