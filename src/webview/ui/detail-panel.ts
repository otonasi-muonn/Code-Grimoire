// ─── Detail Panel + Code Peek (V3 Phase 3) ──────────────
import { state } from '../core/state.js';
import { sendMessage } from '../core/vscode-api.js';
import { t } from '../core/i18n.js';
import { selectedNodeId, setSelectedNodeId } from '../renderer/graph.js';
import type { BubbleGroup } from '../../shared/types.js';

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

    // v2 改修 (T-03): 巨大ファイル警告セクション
    if (node.hugeFileLevel === 'critical') {
        html += `<div class="dp-section">
            <div class="dp-warning" style="color:#ff7777;font-weight:bold">⚠ Critical: ${node.lineCount} lines (推奨: 500 行以下)</div>
        </div>`;
    } else if (node.hugeFileLevel === 'warning') {
        html += `<div class="dp-section">
            <div class="dp-warning" style="color:#ffaa33">⚠ Warning: ${node.lineCount} lines は分割を検討</div>
        </div>`;
    }

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

    const outEdges = state.edgesBySource.get(nodeId) || [];
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

    const inEdges = state.edgesByTarget.get(nodeId) || [];
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
        // v2 改修 (T-04): severity 別にバッジ色を変える + アイコン併用 (P6 二重符号化)
        const severityStyle = (sev: 'info' | 'warning' | 'critical') => {
            if (sev === 'critical') {
                return { color: '#ff7777', icon: '⛔' };
            } else if (sev === 'warning') {
                return { color: '#ffaa33', icon: '⚠' };
            } else {
                return { color: '#ffee66', icon: 'ⓘ' };
            }
        };

        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.securityWarnings')}</div>
            ${node.securityWarnings.map(w => {
                const s = severityStyle(w.severity);
                return `<div class="dp-warning" style="color:${s.color}">${s.icon} [${w.severity}] L${w.line}: ${escapeHtml(w.message)}</div>`;
            }).join('')}
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
        // v2 改修 (T-05): isHotSpot フラグを優先表示。フラグが立たない場合は従来の commit 数ベース表記
        const activityLabel = node.isHotSpot
            ? `${node.gitCommitCount} commits — Hot spot 🔥 (修正頻度上位)`
            : `${node.gitCommitCount} commits — ${commitNorm > 0.3 ? 'Active' : 'Stable'}`;
        html += `<div class="dp-section">
            <div class="dp-label">Activity</div>
            <div class="dp-activity-bar">${bars}</div>
            <div class="dp-risk-label">${activityLabel}</div>
        </div>`;
    }

    // データフロー情報 (分析モード向けだが常に表示)
    {
        const outSymbols = outEdges.filter(e => e.kind !== 'type-import' && e.importedSymbols.length > 0);
        const inSymbols = inEdges.filter(e => e.kind !== 'type-import' && e.importedSymbols.length > 0);
        const totalOut = outSymbols.reduce((s, e) => s + e.importedSymbols.length, 0);
        const totalIn = inSymbols.reduce((s, e) => s + e.importedSymbols.length, 0);
        if (totalOut > 0 || totalIn > 0) {
            html += `<div class="dp-section">
                <div class="dp-label">${t('dp.dataFlow')}</div>
                <div class="dp-value">
                    <span class="dp-badge" style="color:#66ddff">↑ ${totalOut} symbols out</span>
                    <span class="dp-badge" style="color:#66ddff">↓ ${totalIn} symbols in</span>
                </div>
            </div>`;
        }
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

// ─── フォルダ詳細パネル ──────────────────────────────────
export function openFolderDetailPanel(group: BubbleGroup) {
    const graph = state.graph;
    if (!graph || !detailPanel || !detailTitle || !detailContent) { return; }

    // 選択ノードはクリアしてフォルダモードにする
    setSelectedNodeId(null);

    detailTitle.textContent = `📁 ${group.label}`;

    // アクションボタン
    let existingActions = detailPanel.querySelector('.dp-actions');
    if (existingActions) { existingActions.remove(); }

    // 配下のファイルノードを収集
    const childNodes = group.childNodeIds
        .map(id => graph.nodes.find(n => n.id === id))
        .filter((n): n is NonNullable<typeof n> => n !== undefined);

    // 統計計算
    const totalLines = childNodes.reduce((s, n) => s + n.lineCount, 0);
    const totalExports = childNodes.reduce((s, n) => s + n.exports.length, 0);
    const kindsCount = new Map<string, number>();
    for (const n of childNodes) {
        kindsCount.set(n.kind, (kindsCount.get(n.kind) || 0) + 1);
    }

    // 外部への依存と外部からの依存
    const childIdSet = new Set(group.childNodeIds);
    const externalOutEdges = graph.edges.filter(e => childIdSet.has(e.source) && !childIdSet.has(e.target));
    const externalInEdges = graph.edges.filter(e => childIdSet.has(e.target) && !childIdSet.has(e.source));
    const internalEdges = graph.edges.filter(e => childIdSet.has(e.source) && childIdSet.has(e.target));

    let html = '';

    // フォルダ情報
    html += `<div class="dp-section">
        <div class="dp-label">${t('dp.folderStats')}</div>
        <div class="dp-value">
            <span class="dp-badge">${childNodes.length} files</span>
            <span class="dp-badge">${totalLines} lines</span>
            <span class="dp-badge">${totalExports} exports</span>
        </div>
    </div>`;

    // v2 改修 (T-06): ヒートマップメトリクス表示
    const metricBadges: string[] = [];
    if (group.cohesion !== undefined) {
        const cohesionPct = Math.round(group.cohesion * 100);
        const cohesionColor = group.cohesion >= 0.8 ? '#44dd66'
            : group.cohesion >= 0.5 ? '#ddcc44' : '#dd4444';
        metricBadges.push(`<span class="dp-badge" style="color:${cohesionColor}">🧬 凝集度 ${cohesionPct}%</span>`);
    }
    if (group.avgLineCount !== undefined) {
        const avg = Math.round(group.avgLineCount);
        const avgColor = avg < 200 ? '#44dd66' : avg < 500 ? '#ddcc44' : '#dd4444';
        metricBadges.push(`<span class="dp-badge" style="color:${avgColor}">📐 平均 ${avg} 行</span>`);
    }
    if (group.cycleCount !== undefined && group.cycleCount > 0) {
        const cyColor = group.cycleCount <= 2 ? '#ddcc44' : '#dd4444';
        metricBadges.push(`<span class="dp-badge" style="color:${cyColor}">⟳ 循環参照 ${group.cycleCount}</span>`);
    }
    if (metricBadges.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">Folder Metrics</div>
            <div class="dp-value">${metricBadges.join('')}</div>
        </div>`;
    }

    // ファイル種別の内訳
    if (kindsCount.size > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.info')}</div>
            <div class="dp-value">${[...kindsCount.entries()].map(([kind, count]) =>
                `<span class="dp-badge">${kind}: ${count}</span>`
            ).join('')}</div>
        </div>`;
    }

    // 内部接続
    if (internalEdges.length > 0) {
        html += `<div class="dp-section">
            <div class="dp-label">Internal Edges</div>
            <div class="dp-value">
                <span class="dp-badge" style="color:#6699ff">${internalEdges.length} connections</span>
            </div>
        </div>`;
    }

    // 外部への依存
    if (externalOutEdges.length > 0) {
        const extTargets = new Set(externalOutEdges.map(e => e.target));
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.imports')} (${externalOutEdges.length})</div>
            <ul class="dp-dep-list">${[...extTargets].map(tid => {
                const targetNode = graph.nodes.find(n => n.id === tid);
                const label = targetNode?.label || tid.split('/').pop() || tid;
                return `<li data-node-id="${escapeHtml(tid)}">${escapeHtml(label)}</li>`;
            }).join('')}</ul>
        </div>`;
    }

    // 外部からの依存
    if (externalInEdges.length > 0) {
        const extSources = new Set(externalInEdges.map(e => e.source));
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.importedBy')} (${externalInEdges.length})</div>
            <ul class="dp-dep-list">${[...extSources].map(sid => {
                const srcNode = graph.nodes.find(n => n.id === sid);
                const label = srcNode?.label || sid.split('/').pop() || sid;
                return `<li data-node-id="${escapeHtml(sid)}">${escapeHtml(label)}</li>`;
            }).join('')}</ul>
        </div>`;
    }

    // 配下ファイル一覧
    html += `<div class="dp-section">
        <div class="dp-label">${t('dp.folderFiles')} (${childNodes.length})</div>
        <ul class="dp-dep-list">${childNodes
            .sort((a, b) => b.lineCount - a.lineCount)
            .map(n =>
                `<li data-node-id="${escapeHtml(n.id)}">${escapeHtml(n.label)} <small style="color:rgba(100,140,200,0.5)">(${n.lineCount}L)</small></li>`
            ).join('')}</ul>
    </div>`;

    // セキュリティ警告があるファイル
    const warningFiles = childNodes.filter(n => n.securityWarnings && n.securityWarnings.length > 0);
    if (warningFiles.length > 0) {
        const totalWarnings = warningFiles.reduce((s, n) => s + (n.securityWarnings?.length || 0), 0);
        html += `<div class="dp-section">
            <div class="dp-label">${t('dp.securityWarnings')}</div>
            <div class="dp-value">
                <span class="dp-badge" style="color:#ff8800">${totalWarnings} warnings in ${warningFiles.length} files</span>
            </div>
        </div>`;
    }

    detailContent.innerHTML = html;
    detailPanel.classList.add('visible');

    // リンククリックハンドラ
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

    _renderGraph();
}

export function closeDetailPanel() {
    if (detailPanel) {
        detailPanel.classList.remove('visible');
    }
    setSelectedNodeId(null);
    _renderGraph();
}

function escapeHtml(str: string): string {
    // v2 改修: ' (シングルクォート) を含む属性値の注入を防ぐため &#x27; を追加。
    // 例: ファイルパスに ' が含まれる場合の data-node-id 属性注入対策。
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
