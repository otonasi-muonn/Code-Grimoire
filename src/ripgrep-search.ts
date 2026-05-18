// ============================================================
// ripgrep ラッパー: ファイル内容全文検索
// @vscode/ripgrep をバンドルし、child_process.spawn で --json
// 出力をストリーム処理する。Extension Host を非ブロックで動作させる。
// ============================================================
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

// @vscode/ripgrep は ESM-only。CommonJS の require では読めないので動的 import で解決する。
// 初回呼び出し時のみ解決し、以降はキャッシュした Promise を再利用する。
let _rgPathPromise: Promise<string> | undefined;
function getRgPath(): Promise<string> {
    if (!_rgPathPromise) {
        _rgPathPromise = import('@vscode/ripgrep').then(m => m.rgPath);
    }
    return _rgPathPromise;
}

/** マッチしたファイル数の上限 (これを超えたら ripgrep を SIGTERM で打ち切り) */
const MAX_MATCH_FILES = 500;
/** 1 ファイル内のマッチ数上限 (パフォーマンス: ファイル単位のヒット有無のみ知りたい) */
const MAX_COUNT_PER_FILE = 10;
/** 検査するファイルサイズの上限 */
const MAX_FILE_SIZE = '1M';

export interface RipgrepSearchResult {
    /** マッチしたファイルの絶対パス集合 (rg が出力したままの形式; OS により区切り文字が異なる) */
    matches: Set<string>;
    /** 上限に達して結果が打ち切られたか */
    truncated: boolean;
}

/**
 * ripgrep を起動して query を含むファイル一覧を取得する。
 *
 * - `signal.aborted` で起動済みプロセスを SIGTERM 終了 (新クエリ到着時の古い検索キャンセル)
 * - 結果が `MAX_MATCH_FILES` を超えたら自前で打ち切り
 * - rg の起動失敗やパースエラーは握りつぶし、空集合を返す (UI 側の即時検索は維持されるためフェイルセーフ)
 *
 * @param query 検索文字列 (rg のデフォルトは正規表現扱いだが、ユーザー入力をエスケープして固定文字列扱いにする)
 * @param workspaceRoot 検索対象のディレクトリ
 * @param signal AbortSignal (新クエリ到着時に古い検索を中断するため)
 */
export async function runRipgrepSearch(
    query: string,
    workspaceRoot: string,
    signal: AbortSignal,
): Promise<RipgrepSearchResult> {
    let rgBinary: string;
    try {
        rgBinary = await getRgPath();
    } catch (err) {
        console.warn('[Code Grimoire] ripgrep module load failed:', err);
        return { matches: new Set(), truncated: false };
    }

    return new Promise((resolve) => {
        const matches = new Set<string>();
        let truncated = false;
        let killed = false;

        const args = [
            '--json',
            '--ignore-case',
            '--fixed-strings',     // クエリを正規表現ではなく固定文字列として扱う (ユーザー入力安全)
            `--max-filesize=${MAX_FILE_SIZE}`,
            `--max-count=${MAX_COUNT_PER_FILE}`,
            '-g', '*.ts',
            '-g', '*.tsx',
            '-g', '*.js',
            '-g', '*.jsx',
            '--',
            query,
            workspaceRoot,
        ];

        let child: ReturnType<typeof spawn>;
        try {
            child = spawn(rgBinary, args, { signal });
        } catch (err) {
            console.warn('[Code Grimoire] ripgrep spawn failed:', err);
            resolve({ matches, truncated });
            return;
        }

        // stdout を 1 行ずつ JSON.parse
        if (child.stdout) {
            const rl = readline.createInterface({ input: child.stdout });
            rl.on('line', (line) => {
                if (!line) { return; }
                let event: { type?: string; data?: { path?: { text?: string } } };
                try {
                    event = JSON.parse(line);
                } catch {
                    return;
                }
                // 'begin' イベントが各ファイルにつき 1 回発火するので、これを集計に使う
                if (event.type === 'begin' && event.data?.path?.text) {
                    matches.add(event.data.path.text);
                    if (matches.size >= MAX_MATCH_FILES && !killed) {
                        truncated = true;
                        killed = true;
                        child.kill();
                    }
                }
            });
        }

        child.on('error', (err) => {
            // AbortError は意図したキャンセルなので静かに無視
            if (signal.aborted) {
                resolve({ matches, truncated });
                return;
            }
            console.warn('[Code Grimoire] ripgrep error:', err);
            resolve({ matches: new Set(), truncated: false });
        });

        child.on('close', () => {
            resolve({ matches, truncated });
        });
    });
}
