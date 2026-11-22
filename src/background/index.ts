import { OPENQBANK_PROD_ORIGIN } from '../apiOrigin';
import { preferredOriginsForSender } from '../origins';
import { handleOpenQBankRequest } from '../shared/requestTransport';
import { BYOK_PROMPTS, type SelectionDraft, type SelectionKind } from '../selection/byokPrompt';

console.log('Background service worker started.');

const CONTEXT_MENU_ID = 'oqb-make-card';

chrome.runtime.onInstalled.addListener((details) => {
    try {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: CONTEXT_MENU_ID,
                title: 'Make openQbank card',
                contexts: ['selection'],
            });
        });
    } catch {
        // ignore
    }
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: `${OPENQBANK_PROD_ORIGIN}/setup`,
        });
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
    const selectionText = info.selectionText || '';
    if (!selectionText.trim()) return;
    const tabId = tab.id;
    const frameId = info.frameId ?? 0;
    (async () => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId, frameIds: [frameId] },
                files: ['selection.js'],
            });
            await chrome.tabs.sendMessage(
                tabId,
                { action: 'OQB_OPEN_SELECTION_PANEL', selectionText },
                { frameId },
            );
        } catch {
            // Restricted pages (chrome://, etc.)
        }
    })();
});

const handleByokGenerate = async (selection: string, grounding: string, kind: SelectionKind) => {
    const stored = await chrome.storage.local.get([
        'oqb_byok_openai_key',
        'oqb_byok_model',
        'oqb_byok_thinking_level',
        'oqb_byok_service_tier',
    ]);
    const key = String(stored.oqb_byok_openai_key || '').trim();
    const model = String(stored.oqb_byok_model || '').trim();
    const thinkingLevel = (stored.oqb_byok_thinking_level as 'low' | 'medium' | 'high' | undefined) || 'medium';
    const serviceTier = (stored.oqb_byok_service_tier as 'fast' | 'flex' | 'regular' | undefined) || 'fast';
    if (!key || !model) {
        return { ok: false, error: 'Add an OpenAI key and model under Settings → Advanced.' };
    }

    try {
        const serviceTierValue = serviceTier === 'regular' ? 'default' : serviceTier;
        const requestBody: Record<string, unknown> = {
            model,
            messages: [
                { role: 'system', content: BYOK_PROMPTS[kind] },
                {
                    role: 'user',
                    content: `SELECTION:\n${selection}\n\nWHAT_I_GOT_WRONG:\n${grounding || 'none'}`,
                },
            ],
            response_format: {
                type: 'json_object',
            },
            service_tier: serviceTierValue,
            reasoning_effort: thinkingLevel,
        };

        let response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(45000),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(requestBody),
        });

        // Graceful fallback if model doesn't support reasoning_effort or service_tier
        if (response.status === 400 && (requestBody.reasoning_effort || requestBody.service_tier)) {
            const errorClone = response.clone();
            const errData = await errorClone.json().catch(() => null) as { error?: { message?: string; param?: string } } | null;
            const errMsg = errData?.error?.message?.toLowerCase() || '';
            const errParam = errData?.error?.param?.toLowerCase() || '';
            let shouldRetry = false;
            if (requestBody.reasoning_effort && (errParam === 'reasoning_effort' || errMsg.includes('reasoning_effort') || errMsg.includes('reasoning'))) {
                delete requestBody.reasoning_effort;
                shouldRetry = true;
            }
            if (requestBody.service_tier && (errParam === 'service_tier' || errMsg.includes('service_tier'))) {
                delete requestBody.service_tier;
                shouldRetry = true;
            }
            if (shouldRetry) {
                response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    signal: AbortSignal.timeout(45000),
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${key}`,
                    },
                    body: JSON.stringify(requestBody),
                });
            }
        }

        if (response.status === 401) {
            return { ok: false, error: 'OpenAI rejected your API key.' };
        }
        if (response.status === 404) {
            return { ok: false, error: 'Model ID not found for this key.' };
        }
        if (response.status === 429) {
            return { ok: false, error: 'OpenAI rate limit or quota exceeded.' };
        }
        if (!response.ok) {
            return { ok: false, error: `OpenAI request failed (${response.status}).` };
        }

        const payload = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) {
            return { ok: false, error: 'OpenAI returned an empty response.' };
        }
        const { cards } = JSON.parse(content) as { cards?: SelectionDraft[] };
        if (!Array.isArray(cards) || !cards.length || cards.length > (kind === 'vignette' ? 1 : 2)
            || cards.some((card) => !card || typeof card.front !== 'string' || !card.front.trim()
                || (kind === 'vignette'
                    ? !Array.isArray(card.steps) || card.steps.length < 2 || card.steps.length > 12
                        || card.steps.some((step) => !step || typeof step.label !== 'string' || !step.label.trim()
                            || typeof step.value !== 'string' || !step.value.trim())
                    : !/\{\{c\d+::.+?\}\}/s.test(card.front)))) {
            return { ok: false, error: 'OpenAI did not return a usable draft. Try again.' };
        }
        const cardType = kind === 'vignette' ? 'sequential' : 'cloze';
        return { ok: true, cards: cards.map((card) => ({
            card_type: cardType,
            front: card.front.trim(),
            notes: typeof card.notes === 'string' ? card.notes.trim() : '',
            steps: kind === 'vignette' ? card.steps : undefined,
        })) };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'OpenAI request failed.',
        };
    }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'byok_generate') {
        (async () => {
            const selection = String(message.selection || '').trim();
            const grounding = String(message.grounding || '').trim();
            sendResponse(await handleByokGenerate(selection, grounding, message.cardType === 'vignette' ? 'vignette' : 'default'));
        })();
        return true;
    }

    if (message?.type !== 'openqbank_request') {
        return false;
    }

    (async () => {
        try {
            const origins = await preferredOriginsForSender(sender, message?.request?.path);
            const response = await handleOpenQBankRequest(message.request, origins, message.request?.timeoutMs ?? 15000);
            sendResponse(response);
        } catch (error) {
            sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    })();

    return true;
});
