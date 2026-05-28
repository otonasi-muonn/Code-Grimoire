// ─── Onboarding Tour (v2: T-08) ─────────────────────────
// 初回起動ユーザー向けの 5 ステップツアー。
// 日本語固定 (ユーザー判断によりスコープ外: i18n 化)。
// CSP / XSS 対策のため DOM 操作は createElement / textContent のみ使用し、
// innerHTML 直代入は禁止。
import { sendMessage } from '../core/vscode-api.js';

/** 5 ステップのツアー文言 (仕様書 v2 §TASK-08 STEPS を踏襲) */
const STEPS: string[] = [
    'Code Grimoire はファイルの依存関係を「魔方陣」として可視化し、コードの設計の癖を一目で掴むツールです。',
    '中心の輝くノードが、現在のフォーカスファイルです。',
    'キーボード 1〜5 で 5 つのルーン（解析モード）を切り替えられます。',
    'Q / W / E で 3 つの宇宙（レイアウト）を切り替えられます。',
    'ノードをクリックすると、そのファイルが中心に来て依存先が周りに再配置されます（Summoning）。',
    '? キーで詳細ヘルプを開けます。よい探索を！',
];

let currentStep = 0;
let tooltip: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let progressEl: HTMLElement | null = null;
let dismissed = false;
/**
 * v2 改修 (レビュー指摘): 多重初期化ガード。
 * INSTANT_STRUCTURE は解析中に複数回送信されるため、initOnboarding が複数回呼ばれる。
 * このフラグで初期化を 1 回に限定し、addEventListener の多重登録を防ぐ。
 */
let initialized = false;

/**
 * ツアーを初期化する。
 * @param alreadyShown true なら表示せず、すぐに完了状態にする
 */
export function initOnboarding(alreadyShown: boolean): void {
    if (initialized) {
        return; // 多重初期化を防ぐ
    }

    tooltip = document.getElementById('onboarding-tooltip');
    textEl = document.getElementById('ob-text');
    progressEl = document.getElementById('ob-progress');
    const skipBtn = document.getElementById('ob-skip');
    const nextBtn = document.getElementById('ob-next');

    if (!tooltip || !textEl || !progressEl || !skipBtn || !nextBtn) {
        return;
    }

    initialized = true;

    // v2 改修 (レビュー): リスナーは alreadyShown の値にかかわらず必ず登録する。
    // ヘルプから showOnboardingAgain() で再表示した時にも Skip / Next が動く必要があるため。
    skipBtn.addEventListener('click', () => dismiss());
    nextBtn.addEventListener('click', () => {
        currentStep++;
        if (currentStep >= STEPS.length) {
            dismiss();
        } else {
            updateStep();
        }
    });

    // v2 改修 (レビュー指摘): ツアー表示中の数字キー (1-5) / Q/W/E が
    // 裏でルーン・レイアウト切替を発火しないよう、capturing phase で抑制する。
    // dismissed フラグで非表示中は素通しになる。
    window.addEventListener('keydown', (e) => {
        if (dismissed) { return; }
        // Tab / Enter / Escape / 矢印は通す (ボタンのフォーカス操作のため)
        if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape' ||
            e.key.startsWith('Arrow')) {
            return;
        }
        // それ以外のキー (1-5, Q/W/E など) はツアー表示中は抑制
        e.stopImmediatePropagation();
    }, true);

    if (alreadyShown) {
        // 既に表示済み: 非表示のままにする。リスナーは登録済みなので再表示時に動く。
        tooltip.style.display = 'none';
        dismissed = true;
        return;
    }

    currentStep = 0;
    updateStep();
    tooltip.style.display = 'block';
}

function updateStep(): void {
    if (!textEl || !progressEl) { return; }
    // P2 (CSP): innerHTML 禁止 → textContent で安全に挿入
    textEl.textContent = STEPS[currentStep];
    progressEl.textContent = `${currentStep + 1} / ${STEPS.length}`;
}

function dismiss(): void {
    if (dismissed) { return; }
    dismissed = true;
    if (tooltip) {
        tooltip.style.display = 'none';
    }
    // Extension へ通知し、globalState に永続化させる
    sendMessage({ type: 'ONBOARDING_DISMISS' });
}

/**
 * ヘルプ画面などから手動で再表示する場合のエントリ。
 * globalState は更新しない (永続的な再表示は別タスク)。
 */
export function showOnboardingAgain(): void {
    if (!tooltip) { return; }
    currentStep = 0;
    dismissed = false;
    updateStep();
    tooltip.style.display = 'block';
}
