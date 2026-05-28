📘 開発計画書：Code Grimoire V4.0 "Zen & Localization"
Version: 4.0
Concept: "Less is More, Local is Best." 情報を削ぎ落として高速化し、言葉をユーザーに合わせる。

1. 💀 Optimization: 断捨離と高速化 (Zen Mode)
詳細すぎる情報表示を廃止し、描画負荷を下げて操作性を向上させます。

Remove "LOD Near" (詳細テキスト廃止):

src/webview/main.ts から、拡大時に表示していた詳細テキスト（行数、Exports一覧など）の描画ロジックを削除します。

代わりに「Detail Panel」と「Code Peek」への誘導を強化します。

Smart Labeling (ラベルの間引き):

createNodeGraphics を修正し、ズームアウト時は「Focusノード」「ハブ（重要）ノード」以外のラベルを非表示にします。

Interactive Glow (ホバー演出):

マウスホバー時、接続されたエッジとノードを強く発光させ、ネットワーク構造を視覚的に強調します。

2. 🌏 Localization: 日本語化対応 (I18n)
VS Codeの言語設定に連動して、UIを自動的に日本語化します。

A. アーキテクチャ (The Translation Bridge)
Extension Host:

vscode.env.language を取得。

INSTANT_STRUCTURE メッセージのペイロードに language: string を追加してWebviewへ送信。

Webview:

TranslationManager クラス（または簡易関数）を作成。

辞書データ（en / ja）を持ち、指定されたキーの翻訳テキストを返す。

B. 翻訳対象エリア
Rune / Layout UI:

"Architecture" → "構造 (Architecture)"

"Security" → "防衛 (Security)"

"Mandala" → "魔法陣 (Mandala)"

Detail Panel:

"Path" → "パス"

"Imports" → "依存 (Imports)"

"Code Preview" → "コード閲覧"

Search Overlay:

"Search files..." → "ファイルを検索..."

Status Bar:

"Computing layout..." → "魔法陣を構築中..."