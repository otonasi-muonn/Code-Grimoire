// ─── I18n (Localization) ─────────────────────────────────

export type TranslationKey =
    | 'rune.default' | 'rune.architecture' | 'rune.security' | 'rune.optimization' | 'rune.analysis'
    | 'layout.mandala' | 'layout.galaxy' | 'layout.bubble'
    | 'bubble.size.lineCount' | 'bubble.size.fileSize'
    | 'dp.path' | 'dp.info' | 'dp.git' | 'dp.exports' | 'dp.imports' | 'dp.importedBy'
    | 'dp.securityWarnings' | 'dp.optimization' | 'dp.codePreview'
    | 'dp.dataFlow'
    | 'dp.folder' | 'dp.folderFiles' | 'dp.folderStats'
    | 'search.placeholder' | 'search.matches'
    | 'status.computing' | 'status.awaiting'
    | 'loading.summoning'
    | 'help.title' | 'help.mouse' | 'help.keyboard' | 'help.legend'
    | 'edge.toggle.static' | 'edge.toggle.type' | 'edge.toggle.dynamic' | 'edge.toggle.sideEffect' | 'edge.toggle.reExport';

const translations: Record<string, Record<TranslationKey, string>> = {
    en: {
        'rune.default': '◇ Default',
        'rune.architecture': '⬡ Architecture',
        'rune.security': '⚠ Security',
        'rune.optimization': '⚡ Optimization',
        'rune.analysis': '� Analysis',
        'layout.mandala': '◎ Mandala',
        'layout.galaxy': '� Galaxy',
        'layout.bubble': '◉ Bubble',
        'bubble.size.lineCount': '📏 Lines',
        'bubble.size.fileSize': '📦 Size',
        'dp.path': 'Path',
        'dp.info': 'Info',
        'dp.git': 'Git',
        'dp.exports': 'Exports',
        'dp.imports': 'Imports',
        'dp.importedBy': 'Imported by',
        'dp.securityWarnings': '⚠ Security Warnings',
        'dp.optimization': '⚡ Optimization',
        'dp.codePreview': 'Code Preview',
        'dp.dataFlow': 'Data Flow',
        'dp.folder': 'Folder',
        'dp.folderFiles': 'Files',
        'dp.folderStats': 'Statistics',
        'search.placeholder': 'Search files... (Ctrl+F)',
        'search.matches': 'matches',
        'status.computing': 'Computing layout...',
        'status.awaiting': 'Awaiting analysis...',
        'loading.summoning': '⟐ Summoning the Magic Circle...',
        'help.title': '✦ Code Grimoire — Help',
        'help.mouse': 'Mouse',
        'help.keyboard': 'Keyboard',
        'help.legend': 'Symbol Legend',
        'edge.toggle.static': 'Static Import',
        'edge.toggle.type': 'Type Import',
        'edge.toggle.dynamic': 'Dynamic Import',
        'edge.toggle.sideEffect': 'Side Effect',
        'edge.toggle.reExport': 'Re-export',
    },
    ja: {
        'rune.default': '◇ 標準',
        'rune.architecture': '⬡ 構造 (Architecture)',
        'rune.security': '⚠ 防衛 (Security)',
        'rune.optimization': '⚡ 最適化 (Optimization)',
        'rune.analysis': '� 分析 (Analysis)',
        'layout.mandala': '◎ 魔法陣 (Mandala)',
        'layout.galaxy': '� 銀河 (Galaxy)',
        'layout.bubble': '◉ 泡宇宙 (Bubble)',
        'bubble.size.lineCount': '📏 行数',
        'bubble.size.fileSize': '📦 サイズ',
        'dp.path': 'パス',
        'dp.info': '情報',
        'dp.git': 'Git',
        'dp.exports': 'エクスポート',
        'dp.imports': '依存 (Imports)',
        'dp.importedBy': '被依存 (Imported by)',
        'dp.securityWarnings': '⚠ セキュリティ警告',
        'dp.optimization': '⚡ 最適化',
        'dp.codePreview': 'コード閲覧',
        'dp.dataFlow': 'データの流れ',
        'dp.folder': 'フォルダ',
        'dp.folderFiles': '配下ファイル',
        'dp.folderStats': '統計',
        'search.placeholder': 'ファイルを検索... (Ctrl+F)',
        'search.matches': '件',
        'status.computing': '魔法陣を構築中...',
        'status.awaiting': '解析待機中...',
        'loading.summoning': '⟐ 魔法陣を召喚中...',
        'help.title': '✦ Code Grimoire — ヘルプ',
        'help.mouse': 'マウス操作',
        'help.keyboard': 'キーボード',
        'help.legend': 'シンボル凡例',
        'edge.toggle.static': '通常インポート',
        'edge.toggle.type': '型インポート',
        'edge.toggle.dynamic': '動的インポート',
        'edge.toggle.sideEffect': '副作用インポート',
        'edge.toggle.reExport': '再エクスポート',
    },
};

export let currentLang = 'en';

export function setCurrentLang(lang: string) {
    currentLang = lang;
}

/** 翻訳キーからローカライズテキストを取得 */
export function t(key: TranslationKey): string {
    const dict = translations[currentLang] || translations['en'];
    return dict[key] ?? translations['en'][key] ?? key;
}

/** 言語設定変更時に UI テキストを一括更新 */
export function applyLocalization(refreshRuneUI?: () => void) {
    // Search placeholder
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    if (searchInput) {
        searchInput.placeholder = t('search.placeholder');
    }
    // Loading overlay text
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = t('loading.summoning');
    }
    // Rune & Layout UI (再描画で反映)
    if (refreshRuneUI) { refreshRuneUI(); }
}
