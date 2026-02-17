// ─── Search Overlay (V3 Phase 2) ────────────────────────
import type { Viewport } from 'pixi-viewport';
import { state } from '../core/state.js';
import { t } from '../core/i18n.js';

let searchOverlay: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let searchCountEl: HTMLElement | null = null;
let searchResults: string[] = [];
let searchCurrentIdx = -1;
/** ディミング中のノードID集合 (マッチしないもの) */
export let dimmedNodes: Set<string> = new Set();

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
    dimmedNodes.clear();
    if (searchCountEl) { searchCountEl.textContent = ''; }
    _renderGraph();
}

function performSearch(query: string) {
    const graph = state.graph;
    if (!graph || !query.trim()) {
        searchResults = [];
        searchCurrentIdx = -1;
        dimmedNodes.clear();
        if (searchCountEl) { searchCountEl.textContent = ''; }
        _renderGraph();
        return;
    }

    const q = query.toLowerCase();
    searchResults = [];
    dimmedNodes = new Set(graph.nodes.map(n => n.id));

    for (const node of graph.nodes) {
        const matchLabel = node.label.toLowerCase().includes(q);
        const matchPath = node.relativePath.toLowerCase().includes(q);
        if (matchLabel || matchPath) {
            searchResults.push(node.id);
            dimmedNodes.delete(node.id);
        }
    }

    searchCurrentIdx = searchResults.length > 0 ? 0 : -1;
    updateSearchCount();
    _renderGraph();
}

function updateSearchCount() {
    if (!searchCountEl) { return; }
    if (searchResults.length === 0) {
        searchCountEl.textContent = searchInput?.value ? `0 ${t('search.matches')}` : '';
    } else {
        searchCountEl.textContent = `${searchCurrentIdx + 1}/${searchResults.length}`;
    }
}

function flyToSearchResult(nodeId: string) {
    const pos = state.nodePositions.get(nodeId);
    if (pos) {
        _animateViewportTo(pos.x, pos.y);
    }
}
