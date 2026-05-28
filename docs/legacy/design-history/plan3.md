📘 開発計画書：Code Grimoire V3.5 "Structure & Insight"
コンセプト: レイアウトに合わせて「絆（エッジ）」の形を変え、魔導書（パネル）に「言の葉（コード）」を映し出す。

1. Smart Edges (レイアウト適応型エッジ)
レイアウトモードに応じて、描画する線を切り替えます。

Mandala (Force): 従来の Dependency Edge (import関係) を描画。

Yggdrasil (Tree) / Bubble: Hierarchy Edge (ディレクトリ親子関係) をメインに描画し、Dependency Edge はオプション（または薄く表示）にする。これにより、「木」としての構造美が際立ちます。

2. Code Peek (コードプレビュー)
Detail Panel にファイルの中身（先頭50行程度）を表示する機能を追加します。

通信: Webviewでノードをクリック → Extensionへリクエスト → ファイル読み込み → Webviewへ返却。

表示: <pre><code> タグで簡易ハイライト表示。