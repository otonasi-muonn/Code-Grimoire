Code Grimoire UI/UX 改修計画書：Refining the Magic Circle
1. 改修の目的
現状の「機能的な魔法陣」から、実用性と審美性を兼ね備えた「真のグリモワール（魔導書）」へと昇華させる。
特に**「情報の階層化（Hierarchy）」「可読性（Readability）」「手応え（Juice）」**の3点に重点を置き、エンジニアが長時間触れていても疲れず、かつ所有欲を満たすUIを構築する。

2. 実装フェーズ分け
Phase 1: 構造とナビゲーションの最適化 (Structure & Navigation)
目標: 画面の作業領域（Canvas）を最大化し、迷子にならないナビゲーションを実現する。

1.1 UIパーツの省スペース化 (Toolbar Refactoring)
現状: 左上にRuneボタン、Layoutボタンが縦積みされ、画面を占有している。

改修:

Rune Bar (Header): 画面上部へ移動し、横並びのアイコンベースのUIに変更。

Layout Docker (Footer): 画面下部へ移動、またはRune Barに統合。

実装対象: src/webview/main.ts (initRuneUI, initLayoutUI), src/webview.ts (CSS)

デザイン: テキストラベルはツールチップ化し、紋章（アイコン）のみを常時表示。

1.2 パンくずリストの配置変更 (Breadcrumbs Relocation)
現状: 画面下部に配置。視線移動が不自然。

改修:

画面左上（Rune Barの下、または統合）へ移動。

Web/Appの標準的なメンタルモデル（上＝過去/親）に合わせる。

実装対象: src/webview/main.ts (refreshBreadcrumbs)

1.3 カメラ制御の高度化 (Smart Camera Offset)
現状: Detail Panelが開くと右側が隠れ、中心ノードが見えなくなる場合がある。

改修:

Detail Panel展開時、Viewportの中心座標を左へオフセット（panelWidth / 2 分ずらす）し、フォーカスノードが常に「視界の中心」に残るようにアニメーションさせる。

実装対象: src/webview/main.ts (openDetailPanel, animateViewportToの拡張)

Phase 2: タイポグラフィと情報の階層化 (Typography & Hierarchy)
目標: 「UI（操作盤）」と「コード（データ）」を視覚的に分離し、認知負荷を下げる。

2.1 デュアル・タイポグラフィ (Dual Typography)
現状: 全て等幅フォント (Consolas)。

改修:

System Font: 見出し、ボタン、ツールチップ、説明文には system-ui, -apple-system, sans-serif を適用。

Monospace: パス、コミットハッシュ、コード断片のみ Consolas を維持。

実装対象: src/webview.ts (CSSの.dp-label, .dp-title, body等の定義変更)

2.2 コントラストと視認性の向上
現状: 全体的に青系で統一されており、情報の優先度が色で判別しにくい。

改修:

Foreground: 重要情報（現在フォーカス中のノード名、エラー警告）は輝度を上げ、背景とのコントラスト比 4.5:1 以上を確保。

Background: UIパネル（Detail Panel, Search Overlay）の背景色を少し深くし、Canvas上のノードと混ざらないようにする（backdrop-filter の強化）。

Phase 3: データの可視化と動的表現 (Deep Visualization)
目標: 「読む」情報を減らし、「見る」だけで伝わる情報設計にする。

3.1 Detail Panelのマイクログラフ化
現状: Risk: 75, 15 commits 等のテキスト羅列。

改修:

Risk Meter: セキュリティ/最適化リスクを「バーゲージ」で表示（緑→黄→赤）。

Activity Sparkline: Gitのコミット頻度を単純な数値ではなく、ヒートマップ的な色付きバーやアイコンで表現。

実装対象: src/webview/main.ts (openDetailPanel内のHTML生成ロジック)

3.2 エッジの指向性とフロー表現 (Particle Flow)
現状: 静止した線。依存方向が不明瞭。

改修:

Flow Animation: 依存元から依存先へ、エッジ上を「光の粒子」が流れるアニメーションを追加（PixiJSのSpriteを使用）。

Weighting: 結合度が高い（import数が多い）エッジは太く、明るく描画。

実装対象: src/webview/main.ts (renderGraph, 新規Ticker処理)

Phase 4: 手応えと演出 (Juice & Feedback)
目標: ツールとしての応答性を「魔法的な体験」に変換する。

4.1 召喚完了エフェクト (Summoning Impact)
現状: ロード完了時にパッと表示されるのみ。

改修:

解析/レイアウト計算完了時、中心から外側へ広がる「衝撃波（Shockwave）」または「フラッシュ」エフェクトを追加。

「魔法陣が完成した」という達成感を演出。

4.2 インタラクション・フィードバック
改修:

Hover: ノードホバー時、単に明るくなるだけでなく、わずかに拡大（Scale Up）させる。

Click: クリック時に波紋エフェクトを出す。

Error: 解析エラー時、画面全体を一瞬赤く明滅（Glitch）させ、システム的な異常を直感的に伝える。