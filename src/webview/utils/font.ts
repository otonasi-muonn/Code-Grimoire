// ─── フォントヘルパー (ハイブリッド方式) ────────────────
// ASCII のみ → BitmapText (GPU最適化), マルチバイト含む → 標準 Text (Canvas)
import { Text, TextStyle, BitmapText, BitmapFont } from 'pixi.js';

const BITMAP_FONT_NAME = 'GrimoireASCII';
let bitmapFontReady = false;

/** ASCII文字のみかどうかを判定 */
function isAsciiOnly(str: string): boolean {
    return /^[\x00-\x7F]*$/.test(str);
}

/** BitmapFont をランタイム生成 (init で呼ぶ) */
export function installBitmapFont() {
    BitmapFont.install({
        name: BITMAP_FONT_NAME,
        style: {
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 32,  // ベースサイズ (BitmapText 側でスケール)
            fill: '#ffffff',
        },
        chars: [
            ['a', 'z'],
            ['A', 'Z'],
            ['0', '9'],
            [' ', '/'],   // ASCII 32-47: space !"#$%&'()*+,-./
            [':', '@'],   // ASCII 58-64: :;<=>?@
            ['[', '`'],   // ASCII 91-96: [\]^_`
            ['{', '~'],   // ASCII 123-126: {|}~
        ],
        resolution: 2,
        padding: 4,
    });
    bitmapFontReady = true;
}

/** 高速テキスト生成: ASCII → BitmapText, マルチバイト → Text */
export function createSmartText(
    content: string,
    options: { fontSize: number; fill: number | string; fontFamily?: string; align?: string; lineHeight?: number }
): Text | BitmapText {
    if (bitmapFontReady && isAsciiOnly(content) && !options.lineHeight) {
        const bt = new BitmapText({
            text: content,
            style: {
                fontFamily: BITMAP_FONT_NAME,
                fontSize: options.fontSize,
                fill: options.fill,
                align: (options.align as 'left' | 'center' | 'right') || undefined,
            },
        });
        return bt;
    }
    // フォールバック: Canvas Text (マルチバイト対応)
    return new Text({
        text: content,
        style: new TextStyle({
            fontSize: options.fontSize,
            fill: options.fill,
            fontFamily: options.fontFamily || 'Consolas, "Courier New", monospace',
            align: (options.align as 'left' | 'center' | 'right') || undefined,
            lineHeight: options.lineHeight,
        }),
    });
}
