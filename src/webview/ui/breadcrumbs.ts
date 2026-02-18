// ─── Breadcrumbs (探索履歴パネル) ────────────────────────
import { Graphics, Container } from 'pixi.js';
import { state } from '../core/state.js';
import { createSmartText } from '../utils/font.js';
import { TOOLBAR_PAD, TOOLBAR_Y, TOOLBAR_BTN_SIZE } from './toolbar.js';

let breadcrumbContainer: Container;
let _uiContainer: Container;
let _summonNode: (nodeId: string) => void;

export function setBreadcrumbContext(ctx: {
    uiContainer: Container;
    summonNode: (nodeId: string) => void;
}) {
    _uiContainer = ctx.uiContainer;
    _summonNode = ctx.summonNode;
}

export function initBreadcrumbs() {
    breadcrumbContainer = new Container();
    breadcrumbContainer.position.set(TOOLBAR_PAD, TOOLBAR_Y + TOOLBAR_BTN_SIZE + 8);
    _uiContainer.addChild(breadcrumbContainer);
}

export function getBreadcrumbContainer() { return breadcrumbContainer; }

export function refreshBreadcrumbs() {
    breadcrumbContainer.removeChildren();
    if (state.breadcrumbs.length <= 1) { return; }

    let xOffset = 0;
    const crumbHeight = 22;
    const isSmall = window.innerWidth < 600;
    const maxLabelLen = isSmall ? 8 : 14;

    // 小画面: 最新3件 + 先頭「…」で省略表示
    const crumbs = state.breadcrumbs;
    const maxVisible = isSmall ? 3 : crumbs.length;
    const startIdx = Math.max(0, crumbs.length - maxVisible);

    // 省略インジケータ
    if (startIdx > 0) {
        const ellipsis = createSmartText('…', { fontSize: 12, fill: 0x445588 });
        ellipsis.anchor.set(0, 0.5);
        ellipsis.position.set(xOffset, crumbHeight / 2);
        breadcrumbContainer.addChild(ellipsis);
        xOffset += 16;
    }

    for (let i = startIdx; i < crumbs.length; i++) {
        const crumb = crumbs[i];
        const isCurrent = i === state.breadcrumbs.length - 1;
        const displayLabel = crumb.label.length > maxLabelLen
            ? crumb.label.substring(0, maxLabelLen - 1) + '…'
            : crumb.label;

        if (i > startIdx) {
            const arrow = createSmartText('›', { fontSize: 12, fill: 0x445588 });
            arrow.anchor.set(0, 0.5);
            arrow.position.set(xOffset, crumbHeight / 2);
            breadcrumbContainer.addChild(arrow);
            xOffset += 14;
        }

        const btnC = new Container();
        btnC.position.set(xOffset, 0);
        btnC.eventMode = 'static';
        btnC.cursor = 'pointer';

        const labelColor = isCurrent ? 0x66ddff : 0x5588aa;
        const bg = new Graphics();
        const labelWidth = displayLabel.length * 7 + 12;
        bg.roundRect(0, 0, labelWidth, crumbHeight, 4);
        bg.fill({ color: isCurrent ? 0x1a2855 : 0x101530, alpha: 0.7 });
        bg.stroke({ width: 1, color: labelColor, alpha: isCurrent ? 0.6 : 0.2 });
        btnC.addChild(bg);

        const text = createSmartText(displayLabel, { fontSize: 10, fill: labelColor });
        text.anchor.set(0, 0.5);
        text.position.set(6, crumbHeight / 2);
        btnC.addChild(text);

        const crumbNodeId = crumb.nodeId;
        btnC.on('pointertap', () => {
            _summonNode(crumbNodeId);
        });

        btnC.on('pointerover', () => { bg.alpha = 1.0; });
        btnC.on('pointerout', () => { bg.alpha = 0.7; });

        breadcrumbContainer.addChild(btnC);
        xOffset += labelWidth + 4;
    }

    breadcrumbContainer.position.set(TOOLBAR_PAD, TOOLBAR_Y + TOOLBAR_BTN_SIZE + 8);
}
