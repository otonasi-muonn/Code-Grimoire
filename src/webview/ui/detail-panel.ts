// ─── Detail Panel + Code Peek (V3 Phase 3) ──────────────
import { state } from '../core/state.js';
import { sendMessage } from '../core/vscode-api.js';
import { t } from '../core/i18n.js';
import { selectedNodeId, setSelectedNodeId } from '../renderer/graph.js';

let detailPanel: HTMLElement | null = null;
let detailTitle: HTMLElement | null = null;
let detailContent: HTMLElement | null = null;

let _summonNode: (nodeId: string) => void;
let _renderGraph: () => void;
let _animateViewportTo: (x: number, y: number) => void;

export function setDetailPanelContext(ctx: {
    summonNode: (nodeId: string) => void;
    renderGraph: () => void;
    animateViewportTo: (x: number, y: number) => void;
}) {
    _summonNode = ctx.summonNode;
    _renderGraph = ctx.renderGraph;
    _animateViewportTo = ctx.animateViewportTo;
}

export function initDetailPanel() {
    detailPanel = document.getElementById('detail-panel');
    detailTitle = document.getElementById('dp-title');
    detailContent = document.getElementById('dp-content');
    const closeBtn = document.getElementById('dp-close');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeDetailPanel);
    }
}

export function openDetailPanel(nodeId: string) {
    const graph = state.graph;
    if (!graph || !detailPanel || !detailTitle || !detailContent) { return; }

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) { return; }

    setSelectedNodeId(nodeId);

    detailTitle.textContent = node.label;

    // アクションボタン
    let existingActions = detailPanel.querySelector('.dp-actions');
    if (existingActions) { existingActions.remove(); }
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'dp-actions';
    actionsDiv.innerHTML = `
        <button class="dp-action-btn" id="dp-btn-open" title="Open File">📄</button>
        <button class="dp-action-btn" id="dp-btn-summon" title="Summon">✦</button>
    `;
    const headerEl = detailPanel.querySelector('.dp-header');
    const closeEl = detailPanel.querySelector('.dp-close');
    if (headerEl && closeEl) {
        headerEl.insertBefore(actionsDiv, closeEl);
    }

    const btnOpen = detailPanel.querySelector('#dp-btn-open');
    const btnSummon = detailPanel.querySelector('#dp-btn-summon');
    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            sendMessage({ type: 'JUMP_TO_FILE', payload: { filePath: node.filePath, line: 1 } });
        });
    }
    if (btnSummon) {
        btnSummon.addEventListener('click', () => {
            _summonNode(nodeId);
        });
    }

    // コンテンツ構築
    let html = '';

    html += `<div class="dp-section">
        <div class="dp-label">${t('dp.path')}</div>
        <div class="dp-value path">${escapeHtml(node.relativePath)}</div>
    </div>`;

    html += `<div class="dp-section">
        <div class="dp-label">${t('dp.info')}</div>
        <div class="dp-value">
            <span class="dp-badge">${node.kind}</span>
            <span class="dp-badge">${node.lineCount} lines</span>
            <span class="dp-badge">${node.exports.length} exports</span>
        </div>
    </div>`;

    if (node.gitCommitCount !== undefined) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.git')}</div>
            <div class="dp-value">
                <span class="dp-badge">${node.gitCommitCount} commits</span>
                ${node.gitLastModified ? `<span class="dp-badge">${node.gitLastModified.substring(0, 10)}</span>` : ''}
            </div>
        </div>`;
    }

    if (node.exports.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.exports')}</div>
            <div class="dp-value">${node.exports.map(e =>
                `<span class="dp-badge">${e.isDefault ? '★ ' : ''}${escapeHtml(e.name)} <small>(${e.kind})</small></span>`
            ).join('')}</div>
        </div>`;
    }

    const outEdges = graph.edges.filter(e => e.source === nodeId);
    if (outEdges.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.imports')} (${outEdges.length})</div>
            <ul class="dp-dep-list">${outEdges.map(e => {
                const targetNode = graph.nodes.find(n => n.id === e.target);
                const label = targetNode?.label || e.target.split('/').pop() || e.target;
                return `<li data-node-id="${escapeHtml(e.target)}">${escapeHtml(label)} <small style="color:rgba(100,140,200,0.5)">(${e.kind})</small></li>`;
            }).join('')}</ul>
        </div>`;
    }

    const inEdges = graph.edges.filter(e => e.target === nodeId);
    if (inEdges.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.importedBy')} (${inEdges.length})</div>
            <ul class="dp-dep-list">${inEdges.map(e => {
                const srcNode = graph.nodes.find(n => n.id === e.source);
                const label = srcNode?.label || e.source.split('/').pop() || e.source;
                return `<li data-node-id="${escapeHtml(e.source)}">${escapeHtml(label)}</li>`;
            }).join('')}</ul>
        </div>`;
    }

    if (node.securityWarnings && node.securityWarnings.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.securityWarnings')}</div>
            ${node.securityWarnings.map(w =>
                `<div class="dp-warning">L${w.line}: ${escapeHtml(w.message)}</div>`
            ).join('')}
        </div>`;
    }

    if (node.isBarrel || (node.treeShakingRisk !== undefined && node.treeShakingRisk > 0)) {
        const risk = node.treeShakingRisk || 0;
        const riskClass = risk >= 50 ? 'dp-risk-high' : risk >= 25 ? 'dp-risk-mid' : 'dp-risk-low';
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.optimization')}</div>
            <div class="dp-value">
                ${node.isBarrel ? '<span class="dp-badge" style="color:#ff8800">Barrel file</span>' : ''}
                ${node.treeShakingRisk !== undefined ? `<span class="dp-badge">Tree-shaking risk: ${node.treeShakingRisk}</span>` : ''}
                ${node.hasSideEffects ? '<span class="dp-badge" style="color:#ff4400">Side effects</span>' : ''}
            </div>
            <div class="dp-risk-meter ${riskClass}"><div class="dp-risk-meter-fill" style="width:${Math.min(100, risk)}%"></div></div>
            <div class="dp-risk-label">${risk < 25 ? 'Low risk' : risk < 50 ? 'Medium risk' : 'High risk'}</div>
        </div>`;
    }

    if (node.gitCommitCount !== undefined && node.gitCommitCount > 0) {
        const maxCommits = 30;
        const barCount = 8;
        const commitNorm = Math.min(1, node.gitCommitCount / maxCommits);
        let bars = '';
        for (let b = 0; b < barCount; b++) {
            const h = Math.max(2, Math.round(commitNorm * 22 * (0.3 + Math.random() * 0.7)));
            const heatHue = commitNorm > 0.5 ? '0' : '30';
            bars += `<div class="bar" style="height:${h}px;background:hsla(${heatHue},80%,${50 + b * 3}%,0.7)"></div>`;
        }
        html += `<div class="dp-section">
            <div class="dp-label">Activity</div>
            <div class="dp-activity-bar">${bars}</div>
            <div class="dp-risk-label">${node.gitCommitCount} commits — ${commitNorm > 0.6 ? 'Hot spot 🔥' : commitNorm > 0.3 ? 'Active' : 'Stable'}</div>
        </div>`;
    }

    detailContent.innerHTML = html;
    detailPanel.classList.add('visible');

    const focusPos = state.nodePositions.get(nodeId);
    if (focusPos) {
        _animateViewportTo(focusPos.x, focusPos.y);
    }

    const depLinks = detailContent.querySelectorAll('[data-node-id]');
    depLinks.forEach(el => {
        el.addEventListener('click', () => {
            const targetId = (el as HTMLElement).dataset.nodeId;
            if (targetId) {
                _summonNode(targetId);
                openDetailPanel(targetId);
            }
        });
    });

    sendMessage({
        type: 'CODE_PEEK_REQUEST',
        payload: { filePath: node.filePath, maxLines: 50 },
    });

    _renderGraph();
}

/** Code Peek 応答受信コールバック */
export function onCodePeekResponse(payload: { filePath: string; code: string; totalLines: number; language: string }) {
    if (!detailContent || !selectedNodeId) { return; }

    const currentNode = state.graph?.nodes.find(n => n.id === selectedNodeId);
    if (!currentNode || currentNode.filePath !== payload.filePath) { return; }

    const existing = detailContent.querySelector('.dp-code-section');
    if (existing) { existing.remove(); }

    const section = document.createElement('div');
    section.className = 'dp-section dp-code-section';

    const label = document.createElement('div');
    label.className = 'dp-label';
    label.textContent = `${t('dp.codePreview')} (${Math.min(50, payload.totalLines)}/${payload.totalLines} lines)`;
    section.appendChild(label);

    const codeContainer = document.createElement('div');
    codeContainer.className = 'dp-code-peek';

    const lines = payload.code.split('\n');
    const lineNums = document.createElement('div');
    lineNums.className = 'cp-line-nums';
    lineNums.textContent = lines.map((_, i) => String(i + 1)).join('\n');
    codeContainer.appendChild(lineNums);

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.innerHTML = simpleHighlight(payload.code, payload.language);
    pre.appendChild(code);
    codeContainer.appendChild(pre);

    section.appendChild(codeContainer);
    detailContent.appendChild(section);
}

function simpleHighlight(code: string, language: string): string {
    let escaped = escapeHtml(code);

    escaped = escaped.replace(/(\/\/[^\n]*)/g, '<span class="hl-comment">$1</span>');
    escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');

    escaped = escaped.replace(/(&quot;[^&]*?&quot;)/g, '<span class="hl-string">$1</span>');
    escaped = escaped.replace(/(&#x27;[^&]*?&#x27;)/g, '<span class="hl-string">$1</span>');

    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');

    if (language === 'typescript' || language === 'javascript') {
        const keywords = [
            'import', 'export', 'from', 'const', 'let', 'var', 'function',
            'class', 'interface', 'type', 'enum', 'return', 'if', 'else',
            'for', 'while', 'switch', 'case', 'break', 'default', 'new',
            'this', 'async', 'await', 'try', 'catch', 'throw', 'extends',
            'implements', 'readonly', 'public', 'private', 'protected',
            'static', 'abstract', 'as', 'of', 'in', 'typeof', 'keyof',
        ];
        const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
        escaped = escaped.replace(kwRegex, '<span class="hl-keyword">$1</span>');

        escaped = escaped.replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="hl-type">$1</span>');
    }

    return escaped;
}

export function closeDetailPanel() {
    if (detailPanel) {
        detailPanel.classList.remove('visible');
    }
    setSelectedNodeId(null);
    _renderGraph();
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
