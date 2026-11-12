import { openSelectionPanel } from './panel';

const PILL_ID = 'oqb-selection-pill';
const MIN_CHARS = 3;

const isTypingContext = (node: Node | null): boolean => {
    if (!node) return false;
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return false;
    if (el.closest('input, textarea, select, [contenteditable="true"], #oqb-selection-root, #openchromebank-custom-card-root')) {
        return true;
    }
    return false;
};

const hidePill = () => {
    document.getElementById(PILL_ID)?.remove();
};

const showPill = (rect: DOMRect, text: string) => {
    hidePill();
    const pill = document.createElement('button');
    pill.id = PILL_ID;
    pill.type = 'button';
    pill.textContent = 'Make card';
    pill.setAttribute('aria-label', 'Make openQbank card from selection');
    pill.dataset.selection = text;
    const margin = 8;
    const left = Math.min(Math.max(rect.right - 90, margin), window.innerWidth - 100);
    const top = Math.min(Math.max(rect.bottom + 6, margin), window.innerHeight - 40);
    pill.style.cssText = `
        position: fixed;
        z-index: 2147483646;
        left: ${left}px;
        top: ${top}px;
        height: 28px;
        padding: 0 12px;
        border-radius: 9999px;
        border: 1px solid #fcd34d;
        background: #ffe5b4;
        color: #1f2937;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        font-family: ui-sans-serif, system-ui, sans-serif;
    `;
    pill.addEventListener('mousedown', (e) => e.preventDefault());
    pill.addEventListener('click', () => {
        const selection = pill.dataset.selection || '';
        hidePill();
        window.getSelection()?.removeAllRanges();
        openSelectionPanel(selection);
    });
    document.body.appendChild(pill);
};

const readSelection = (): { text: string; rect: DOMRect } | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    if (isTypingContext(sel.anchorNode) || isTypingContext(sel.focusNode)) return null;
    const text = sel.toString().trim();
    if (text.length < MIN_CHARS) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return { text, rect };
};

export const installSelectionButton = (): void => {
    const consider = () => {
        const picked = readSelection();
        if (!picked) {
            hidePill();
            return;
        }
        showPill(picked.rect, picked.text);
    };

    document.addEventListener('mouseup', () => setTimeout(consider, 10));
    document.addEventListener('keyup', () => setTimeout(consider, 10));
    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) hidePill();
    });
    document.addEventListener('scroll', hidePill, true);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hidePill();
    });
};
