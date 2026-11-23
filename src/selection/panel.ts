import { toPrefill, type SelectionDraft, type SelectionKind } from './byokPrompt';
import { OPENQBANK_INJECTED_TOKEN_CSS } from '../content/openqbankTokens';
import { isOpenQbankPro, isHyGuruAccount, calculateCardPollProgress } from '../content/tierAccess';
import { sendOpenQBankRequest } from '../shared/request';
import { buildQuestionDataPayload, getQuestionContent, getQuestionFingerprint } from '@extract';
import {
    type CustomCardFabOptions,
    openCustomCardDrafts,
} from '../content/customCardFab';
import { CANONICAL_ORGAN_SYSTEMS, resolveOrganSystem } from '../shared/organSystems';

const ROOT_ID = 'oqb-selection-root';

type ExtensionStatus = {
    authenticated?: boolean;
    has_access?: boolean;
    tier?: string;
    user_type?: string;
    custom_anki_enabled?: boolean;
    total_cards?: number;
    error?: string;
};

let fabOptions: CustomCardFabOptions | null = null;

const buildFabOptions = (status: ExtensionStatus): CustomCardFabOptions => ({
    getQuestionData: () => getQuestionContent(),
    getFingerprint: () => getQuestionFingerprint(),
    getStatus: () => ({
        isOpenQbankUser: true,
        isPro: isOpenQbankPro(status.user_type, status.tier),
        totalCards: status.total_cards ?? 0,
        customAnkiEnabled: Boolean(status.custom_anki_enabled),
    }),
    sendRequest: sendOpenQBankRequest,
    canonicalOrganSystems: CANONICAL_ORGAN_SYSTEMS,
    resolveOrganSystem,
    buildQuestionDataPayload,
});

const ensureRoot = (): HTMLElement => {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        document.body.appendChild(root);
    }
    return root;
};

export const openSelectionPanel = (selectionText: string): void => {
    const host = ensureRoot();
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <style>${OPENQBANK_INJECTED_TOKEN_CSS}
        .wrap {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(15,23,42,0.45);
            font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .panel {
            width: min(480px, 92vw);
            max-height: 85vh;
            overflow: auto;
            background: var(--ocb-bg-surface, #fff);
            border: 1px solid var(--ocb-border, #e5e7eb);
            border-radius: 16px;
            padding: 18px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
        }
        label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 6px; }
        textarea { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; resize: vertical; min-height: 72px; font-family: inherit; }
        textarea:focus { outline: none; border-color: #fcd34d; box-shadow: 0 0 0 2px rgba(254, 211, 77, 0.25); }
        .actions { display: flex; gap: 8px; margin-top: 14px; align-items: center; }
        .btn-primary {
            flex: 1;
            height: 42px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.05);
            background: #ffe5b4;
            color: #1f2937;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            transition: all 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .btn-primary:hover {
            background: #ffdab9;
            transform: translateY(-1px);
        }
        .btn-primary:active {
            transform: translateY(1px);
        }
        .btn-primary:disabled {
            opacity: 0.6;
            pointer-events: none;
            filter: grayscale(1);
        }
        .btn-primary.ocb-button--countdown {
            position: relative !important;
            border: 2px solid #ffdab9 !important;
            background:
                linear-gradient(90deg, #ffe5b4, #ffb347, #3b82f6) left center / var(--ocb-progress, 0%) 100% no-repeat,
                #fff7ed !important;
            opacity: 0.95 !important;
            cursor: not-allowed !important;
            color: #1f2937 !important;
            transition: background-size 0.15s ease-out;
            pointer-events: none;
            filter: none !important;
            transform: none !important;
        }
        .btn-ghost {
            height: 42px;
            padding: 0 16px;
            border-radius: 12px;
            border: 1px solid var(--ocb-border, #e5e7eb);
            background: var(--ocb-bg-surface, #ffffff);
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            color: var(--ocb-text-secondary, #4b5563);
            transition: all 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .btn-ghost:hover {
            background: var(--ocb-bg-surface-alt, #f3f4f6);
            color: var(--ocb-text, #111827);
            transform: translateY(-1px);
        }
        .btn-ghost:active {
            transform: translateY(1px);
        }
        .status { margin-top: 10px; font-size: 12px; color: #4b5563; min-height: 1.2em; }
        a { color: #2563eb; }
        @media (prefers-color-scheme: dark) {
            #oqb-sel-title { color: #ffffff !important; }
            label { color: #94a3b8 !important; }
            .btn-ghost { color: #ffffff !important; border-color: rgba(255, 255, 255, 0.35) !important; background: transparent !important; }
            .btn-ghost:hover { background: rgba(255, 255, 255, 0.12) !important; border-color: rgba(255, 255, 255, 0.6) !important; }
        }
        </style>
        <div class="wrap" id="backdrop">
            <div class="panel" role="dialog" aria-modal="true" aria-labelledby="oqb-sel-title">
                <h2 id="oqb-sel-title" style="margin:0 0 12px;font-size:16px;font-weight:700;">Create openQbank card</h2>
                <label for="oqb-sel-text">Selection</label>
                <textarea id="oqb-sel-text"></textarea>
                <label for="oqb-sel-ground" style="margin-top:12px;">What did I get wrong? (optional)</label>
                <textarea id="oqb-sel-ground" rows="2" placeholder="Optional note"></textarea>
                <label style="margin-top:12px;">Card type</label>
                <div class="ocb-segment-toggle" id="oqb-sel-kind-toggle">
                    <button type="button" class="ocb-segment-btn ocb-segment-active" data-kind="default">High Yield</button>
                    <button type="button" class="ocb-segment-btn" data-kind="vignette">Vignette</button>
                </div>
                <div class="actions">
                    <button type="button" class="btn-primary" id="oqb-sel-generate">Create card</button>
                    <button type="button" class="btn-ghost" id="oqb-sel-close">Close</button>
                </div>
                <div class="status" id="oqb-sel-status" aria-live="polite"></div>
            </div>
        </div>
    `;

    const selTa = shadow.querySelector<HTMLTextAreaElement>('#oqb-sel-text');
    const groundTa = shadow.querySelector<HTMLTextAreaElement>('#oqb-sel-ground');
    const statusEl = shadow.querySelector<HTMLElement>('#oqb-sel-status');
    const genBtn = shadow.querySelector<HTMLButtonElement>('#oqb-sel-generate');
    const closeBtn = shadow.querySelector<HTMLButtonElement>('#oqb-sel-close');
    const backdrop = shadow.querySelector<HTMLElement>('#backdrop');
    const kindToggle = shadow.querySelector<HTMLElement>('#oqb-sel-kind-toggle');

    let currentKind: SelectionKind = 'default';
    kindToggle?.querySelectorAll<HTMLButtonElement>('.ocb-segment-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const kind = (btn.dataset.kind || 'default') as SelectionKind;
            currentKind = kind;
            kindToggle.querySelectorAll<HTMLButtonElement>('.ocb-segment-btn').forEach((b) => {
                b.classList.toggle('ocb-segment-active', b === btn);
            });
        });
    });

    if (selTa) selTa.value = selectionText;
    setTimeout(() => selTa?.focus(), 0);

    const close = () => {
        window.removeEventListener('keydown', onKey, true);
        host.remove();
    };

    closeBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });

    const setStatus = (msg: string) => {
        if (statusEl) statusEl.innerHTML = msg;
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey, true);

    void (async () => {
        try {
            const status = await sendOpenQBankRequest<ExtensionStatus>(
                '/api/extension/status',
                undefined,
                true,
                'GET',
            );
            if (!status?.authenticated) {
                setStatus('Sign in from the openQbank toolbar icon.');
                genBtn?.setAttribute('disabled', 'true');
                return;
            }
            if (isHyGuruAccount(status.user_type, status.tier)) {
                setStatus(
                    'openQbank accounts use the openQbank Connector. openHyGuru accounts use the '
                    + '<a href="https://chromewebstore.google.com/detail/dgajpjanpcdochcadolmgdoeddckpnli" target="_blank" rel="noopener">openHyGuru Connector</a>.',
                );
                genBtn?.setAttribute('disabled', 'true');
                return;
            }
            fabOptions = buildFabOptions(status);
            const stored = await chrome.storage.local.get(['oqb_byok_openai_key', 'oqb_byok_model']);
            const hasByok = Boolean(String(stored.oqb_byok_openai_key || '').trim()
                && String(stored.oqb_byok_model || '').trim());
            const isPro = isOpenQbankPro(status.user_type, status.tier);
            if (!isPro && !hasByok) {
                setStatus(
                    'AI card generation is part of openQbank Pro. '
                    + '<a href="https://openqbank.com/settings" target="_blank" rel="noopener">Upgrade</a>.'
                    + ' Developers: bring your own key under Settings → Advanced.',
                );
            }
            genBtn?.addEventListener('click', async () => {
                if (!genBtn || genBtn.disabled) return;
                const selection = (selTa?.value || '').trim();
                const grounding = (groundTa?.value || '').trim();
                const cardType: SelectionKind = currentKind;
                if (selection.length < 3) {
                    setStatus('Selection is too short.');
                    return;
                }

                let tickerId: number | null = null;
                const stopTicker = () => {
                    if (tickerId != null) {
                        window.clearInterval(tickerId);
                        tickerId = null;
                    }
                };
                const resetBtn = (errMsg?: string) => {
                    stopTicker();
                    genBtn.classList.remove('ocb-button--countdown');
                    genBtn.style.removeProperty('--ocb-progress');
                    genBtn.disabled = false;
                    genBtn.textContent = 'Create card';
                    if (errMsg) setStatus(errMsg);
                };

                genBtn.disabled = true;
                genBtn.classList.add('ocb-button--countdown');
                genBtn.style.setProperty('--ocb-progress', '0%');
                genBtn.textContent = 'Generating...';
                setStatus('');

                const startTime = Date.now();
                tickerId = window.setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const progress = calculateCardPollProgress(elapsed);
                    genBtn.style.setProperty('--ocb-progress', `${progress.toFixed(1)}%`);
                }, 100);

                try {
                    const question = buildQuestionDataPayload(await getQuestionContent());
                    const taxonomy = { organ_system: question?.system || '', subject: question?.subject || '', topic: question?.topic || '' };
                    if (isPro) {
                        const fp = getQuestionFingerprint();
                        const data = await sendOpenQBankRequest<{
                            success?: boolean;
                            cards?: SelectionDraft[];
                            error?: string;
                        }>(
                            '/api/extension/selection-card',
                            {
                                selection,
                                card_type: cardType,
                                grounding,
                                question_id: fp?.questionId,
                                platform: fp?.platform || 'Web',
                                question_data: question,
                            },
                            true,
                            'POST',
                            60000,
                        );
                        if (!data?.success || !data.cards?.length) {
                            resetBtn(data?.error || 'Generation failed.');
                            return;
                        }
                        stopTicker();
                        if (!host.isConnected) return;
                        genBtn.style.setProperty('--ocb-progress', '100%');
                        close();
                        const opts = fabOptions ?? buildFabOptions(status);
                        await openCustomCardDrafts(opts, data.cards.map(card => toPrefill(card, taxonomy)));
                        return;
                    }
                    if (!hasByok) {
                        resetBtn('Add an OpenAI key under Settings → Advanced, or upgrade to Pro.');
                        return;
                    }
                    const byok = await chrome.runtime.sendMessage({
                        type: 'byok_generate',
                        selection,
                        grounding,
                        cardType,
                    }) as { ok?: boolean; error?: string; cards?: SelectionDraft[] };
                    if (!byok?.ok || !byok.cards?.length) {
                        resetBtn(byok?.error || 'OpenAI generation failed.');
                        return;
                    }
                    stopTicker();
                    if (!host.isConnected) return;
                    close();
                    await openCustomCardDrafts(fabOptions ?? buildFabOptions(status), byok.cards.map(card => toPrefill(card, taxonomy)));
                } catch (err) {
                    resetBtn(err instanceof Error ? err.message : 'Request failed.');
                }
            });
        } catch (err) {
            setStatus(err instanceof Error ? err.message : 'Could not load account status.');
            genBtn?.setAttribute('disabled', 'true');
        }
    })();
};
