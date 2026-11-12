import { OPENQBANK_INJECTED_TOKEN_CSS } from '../content/openqbankTokens';
import { isOpenQbankPro, isHyGuruAccount } from '../content/tierAccess';
import { sendOpenQBankRequest } from '../shared/request';
import { buildQuestionDataPayload, getQuestionContent, getQuestionFingerprint } from '@extract';
import {
    type CustomCardFabOptions,
    openCustomCardModal,
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
        textarea { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; resize: vertical; min-height: 72px; }
        .actions { display: flex; gap: 8px; margin-top: 14px; align-items: center; }
        .btn-primary { flex: 1; height: 40px; border-radius: 12px; border: none; background: #ffe5b4; color: #1f2937; font-weight: 700; cursor: pointer; }
        .btn-ghost { height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid #e5e7eb; background: transparent; cursor: pointer; }
        .status { margin-top: 10px; font-size: 12px; color: #4b5563; min-height: 1.2em; }
        a { color: #2563eb; }
        </style>
        <div class="wrap" id="backdrop">
            <div class="panel" role="dialog" aria-modal="true" aria-labelledby="oqb-sel-title">
                <h2 id="oqb-sel-title" style="margin:0 0 12px;font-size:16px;font-weight:700;">Make openQbank card</h2>
                <label for="oqb-sel-text">Selection</label>
                <textarea id="oqb-sel-text"></textarea>
                <label for="oqb-sel-ground" style="margin-top:12px;">What did I get wrong? (optional)</label>
                <textarea id="oqb-sel-ground" rows="2" placeholder="Optional note"></textarea>
                <div class="actions">
                    <button type="button" class="btn-primary" id="oqb-sel-generate">Generate</button>
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

    if (selTa) selTa.value = selectionText;
    setTimeout(() => selTa?.focus(), 0);

    const close = () => {
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
                if (selection.length < 3) {
                    setStatus('Selection is too short.');
                    return;
                }
                genBtn.disabled = true;
                setStatus('Generating…');
                try {
                    if (isPro) {
                        const fp = getQuestionFingerprint();
                        const qData = await getQuestionContent();
                        const data = await sendOpenQBankRequest<{
                            success?: boolean;
                            count?: number;
                            library_url?: string;
                            error?: string;
                        }>(
                            '/api/extension/selection-card',
                            {
                                selection,
                                grounding,
                                question_id: fp?.questionId,
                                platform: fp?.platform || 'Web',
                                question_data: buildQuestionDataPayload(qData),
                            },
                            true,
                            'POST',
                            60000,
                        );
                        if (!data?.success) {
                            setStatus(data?.error || 'Generation failed.');
                            genBtn.disabled = false;
                            return;
                        }
                        const url = data.library_url || 'https://openqbank.com/me';
                        setStatus(
                            `Added ${data.count ?? 1} card(s) to your library. `
                            + `<a href="${url}" target="_blank" rel="noopener">View in library</a>`,
                        );
                        setTimeout(close, 4000);
                        return;
                    }
                    if (!hasByok) {
                        setStatus('Add an OpenAI key under Settings → Advanced, or upgrade to Pro.');
                        genBtn.disabled = false;
                        return;
                    }
                    const byok = await chrome.runtime.sendMessage({
                        type: 'byok_generate',
                        selection,
                        grounding,
                    }) as { ok?: boolean; error?: string; card?: { card_type: 'basic' | 'cloze'; front: string; back: string } };
                    if (!byok?.ok || !byok.card) {
                        setStatus(byok?.error || 'OpenAI generation failed.');
                        genBtn.disabled = false;
                        return;
                    }
                    close();
                    window.removeEventListener('keydown', onKey, true);
                    const opts = fabOptions ?? buildFabOptions(status);
                    openCustomCardModal(opts, {
                        cardType: byok.card.card_type,
                        front: byok.card.front,
                        back: byok.card.back,
                        notes: grounding || undefined,
                    });
                } catch (err) {
                    setStatus(err instanceof Error ? err.message : 'Request failed.');
                    genBtn.disabled = false;
                }
            });
        } catch (err) {
            setStatus(err instanceof Error ? err.message : 'Could not load account status.');
            genBtn?.setAttribute('disabled', 'true');
        }
    })();
};
