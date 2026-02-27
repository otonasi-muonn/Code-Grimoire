// ============================================================
// Code Grimoire - esbuild ビルドスクリプト
// Extension (CJS/Node.js) と Webview (IIFE/Browser) を別々にビルド
// ============================================================
const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: './out/extension.js',
    external: ['vscode'],    // vscode モジュールは外部扱い（typescript はバンドルする）
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: !isProduction,
    minify: isProduction,
    tsconfig: './tsconfig.json',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
    entryPoints: ['./src/webview/main.ts'],
    bundle: true,
    outfile: './out/webview/main.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: !isProduction,
    minify: isProduction,
    tsconfig: './tsconfig.webview.json',
    define: {
        'globalThis.PIXI': 'undefined',
    },
};

/** @type {import('esbuild').BuildOptions} */
const workerConfig = {
    entryPoints: ['./src/webview/worker.ts'],
    bundle: true,
    outfile: './out/webview/worker.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: !isProduction,
    minify: isProduction,
    tsconfig: './tsconfig.webview.json',
};

async function build() {
    try {
        if (isWatch) {
            const extCtx = await esbuild.context(extensionConfig);
            const webCtx = await esbuild.context(webviewConfig);
            const wrkCtx = await esbuild.context(workerConfig);

            await extCtx.watch();
            await webCtx.watch();
            await wrkCtx.watch();

            console.log('[esbuild] Watching for changes...');
        } else {
            await Promise.all([
                esbuild.build(extensionConfig),
                esbuild.build(webviewConfig),
                esbuild.build(workerConfig),
            ]);
            console.log('[esbuild] Build complete!');
        }
    } catch (err) {
        console.error('[esbuild] Build failed:', err);
        process.exit(1);
    }
}

build();
