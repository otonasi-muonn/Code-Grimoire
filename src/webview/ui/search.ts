// ─── Search Overlay (V3 Phase 2) ────────────────────────
import type { Viewport } from 'pixi-viewport';
import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { sendMessage } from '../core/vscode-api.js';
import type { MsgSearchContentResponse } from '../../shared/types.js';

let searchOverlay: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let searchCountEl: HTMLElement | null = null;
let searchResults: string[] = [];
let searchCurrentIdx = -1;
/** ディミング中のノードID集合 (マッチしないもの) */
export let dimmedNodes: Set<string> = new Set();

// ─── 全文検索 (Item C) ─────────────────────────────────
/** ファイル名一致 (即時) ノード ID */
let nameMatchedIds: Set<string> = new Set();
/** ファイル内容一致 (遅延) ノード ID */
let contentMatchedIds: Set<string> = new Set();
/** 現在処理中の検索クエリ */
let currentQuery = '';
/** リクエストの世代カウンタ (古いレスポンスを破棄するため) */
let lastRequestId = 0;
/** 全文検索のデバウンスタイマー */
let contentSearchTimer: number | null = null;
/** 結果が打ち切られたか (UI の "+" 表示) */
let contentTruncated = false;
/** デバウンス遅延 (ms) */
const CONTENT_SEARCH_DEBOUNCE_MS = 300;

/** 外部依存 */
let _renderGraph: () => void;
let _animateViewportTo: (x: number, y: number) => void;

export function setSearchContext(ctx: {
    renderGraph: () => void;
    animateViewportTo: (x: number, y: number) => void;
}) {
    _renderGraph = ctx.renderGraph;
    _animateViewportTo = ctx.animateViewportTo;
}

export function initSearchOverlay() {
    searchOverlay = document.getElementById('search-overlay');
    searchInput = document.getElementById('search-input') as HTMLInputElement;
    searchCountEl = document.getElementById('search-count');

    if (!searchInput || !searchOverlay) { return; }

    // Ctrl+F でトグル
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleSearch();
        }
        if (e.key === 'Escape' && searchOverlay?.classList.contains('visible')) {
            closeSearch();
        }
    });

    // インクリメンタルサーチ
    searchInput.addEventListener('input', () => {
        performSearch(searchInput!.value);
    });

    // Enter で次の結果へ FlyTo
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (searchResults.length > 0) {
                searchCurrentIdx = (searchCurrentIdx + 1) % searchResults.length;
                flyToSearchResult(searchResults[searchCurrentIdx]);
                updateSearchCount();
            }
        }
    });
}

export function toggleSearch() {
    if (!searchOverlay) { return; }
    if (searchOverlay.classList.contains('visible')) {
        closeSearch();
    } else {
        searchOverlay.classList.add('visible');
        searchInput?.focus();
    }
}

function closeSearch() {
    if (!searchOverlay) { return; }
    searchOverlay.classList.remove('visible');
    if (searchInput) { searchInput.value = ''; }
    searchResults = [];
    searchCurrentIdx = -1;
    nameMatchedIds.clear();
    contentMatchedIds.clear();
    currentQuery = '';
    contentTruncated = false;
    if (contentSearchTimer !== null) {
        clearTimeout(contentSearchTimer);
        contentSearchTimer = null;
    }
    dimmedNodes.clear();
    if (searchCountEl) { searchCountEl.textContent = ''; }
    _renderGraph();
}

function performSearch(query: string) {
    const graph = state.graph;
    currentQuery = query;
    const trimmed = query.trim();

    if (!graph || !trimmed) {
        searchResults = [];
        searchCurrentIdx = -1;
        nameMatchedIds.clear();
        contentMatchedIds.clear();
        contentTruncated = false;
        if (contentSearchTimer !== null) {
            clearTimeout(contentSearchTimer);
            contentSearchTimer = null;
        }
        dimmedNodes.clear();
        if (searchCountEl) { searchCountEl.textContent = ''; }
        _renderGraph();
        return;
    }

    // ─── 即時: ファイル名/パス一致 ──────────────────────
    const q = trimmed.toLowerCase();
    nameMatchedIds = new Set();
    for (const node of graph.nodes) {
        const matchLabel = node.label.toLowerCase().includes(q);
        const matchPath = node.relativePath.toLowerCase().includes(q);
        if (matchLabel || matchPath) {
            nameMatchedIds.add(node.id);
        }
    }

    // ─── 遅延: ファイル内容全文検索 (ripgrep) ──────────
    if (contentSearchTimer !== null) {
        clearTimeout(contentSearchTimer);
    }
    // 新規クエリのため、前回の内容ヒットは一旦クリア (古いノードが残らないように)
    contentMatchedIds = new Set();
    contentTruncated = false;
    contentSearchTimer = window.setTimeout(() => {
        contentSearchTimer = null;
        lastRequestId++;
        sendMessage({
            type: 'SEARCH_CONTENT_REQUEST',
            payload: { query: trimmed, requestId: lastRequestId },
        });
    }, CONTENT_SEARCH_DEBOUNCE_MS);

    rebuildSearchResults();
}

/** Extension から SEARCH_CONTENT_RESPONSE を受け取った時に呼び出す */
export function onSearchContentResponse(payload: MsgSearchContentResponse['payload']) {
    // 古いレスポンスやクエリが変わったレスポンスは破棄
    if (payload.requestId !== lastRequestId) { return; }
    if (payload.query !== currentQuery.trim()) { return; }

    contentMatchedIds = new Set(payload.matchedNodeIds);
    contentTruncated = payload.truncated;
    rebuildSearchResults();
}

/** nameMatched と contentMatched を統合して searchResults / dimmedNodes を再構築 */
function rebuildSearchResults() {
    const graph = state.graph;
    if (!graph) { return; }

    // 検索順: ファイル名一致を先頭、その後に内容一致 (名前にもあれば重複排除)
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const id of nameMatchedIds) {
        if (!seen.has(id)) { ordered.push(id); seen.add(id); }
    }
    for (const id of contentMatchedIds) {
        if (!seen.has(id)) { ordered.push(id); seen.add(id); }
    }

    searchResults = ordered;
    dimmedNodes = new Set(graph.nodes.map(n => n.id));
    for (const id of searchResults) { dimmedNodes.delete(id); }

    searchCurrentIdx = searchResults.length > 0 ? 0 : -1;
    updateSearchCount();
    _renderGraph();
}

function updateSearchCount() {
    if (!searchCountEl) { return; }
    if (!searchInput?.value) {
        searchCountEl.textContent = '';
        return;
    }
    if (searchResults.length === 0) {
        // 内容検索がまだ走っているなら状態を示す
        const pending = contentSearchTimer !== null;
        searchCountEl.textContent = pending
            ? `0 ${t('search.matches')} …`
            : `0 ${t('search.matches')}`;
        return;
    }
    const truncMark = contentTruncated ? '+' : '';
    const breakdown = contentMatchedIds.size > 0
        ? ` (${t('search.byName')} ${nameMatchedIds.size} + ${t('search.byContent')} ${contentMatchedIds.size})`
        : '';
    searchCountEl.textContent = `${searchCurrentIdx + 1}/${searchResults.length}${truncMark}${breakdown}`;
}

function flyToSearchResult(nodeId: string) {
    const pos = state.nodePositions.get(nodeId);
    if (pos) {
        _animateViewportTo(pos.x, pos.y);
    }
}
