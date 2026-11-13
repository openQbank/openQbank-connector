import { BYOK_SCHEMA, BYOK_SYSTEM_PROMPT } from '../selection/byokPrompt';

console.log('Background service worker started.');

const OPENQBANK_LOCAL_ORIGIN = 'http://localhost:5000';
const OPENQBANK_FLY_API_ORIGIN = 'https://openqbank-api.fly.dev';
const OPENQBANK_PROD_ORIGIN = 'https://openqbank.com';
const OPENQBANK_PROD_WWW_ORIGIN = 'https://www.openqbank.com';
const OPENQBANK_ACTIVE_ORIGIN_KEY = 'openChromeBankActiveOrigin';
const OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY = 'openChromeBankAllowLocalFallback';
const CONTEXT_MENU_ID = 'oqb-make-card';

const _dedupeOrigins = (origins: string[]): string[] => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const origin of origins) {
        if (!origin || seen.has(origin)) continue;
        seen.add(origin);
        unique.push(origin);
    }
    return unique;
};

const _isSupportedOpenQBankOrigin = (origin: string): boolean => {
    return (
        origin === OPENQBANK_FLY_API_ORIGIN
        || origin === OPENQBANK_LOCAL_ORIGIN
        || origin === OPENQBANK_PROD_ORIGIN
        || origin === OPENQBANK_PROD_WWW_ORIGIN
    );
};

const _isLocalOrigin = (origin: string): boolean => origin === OPENQBANK_LOCAL_ORIGIN;

const _isProdOrigin = (origin: string): boolean =>
    origin === OPENQBANK_FLY_API_ORIGIN || origin === OPENQBANK_PROD_ORIGIN || origin === OPENQBANK_PROD_WWW_ORIGIN;

const _defaultProdOrigins = (): string[] => [OPENQBANK_FLY_API_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN, OPENQBANK_PROD_ORIGIN];

const _allowLocalFallback = async (): Promise<boolean> => {
    try {
        const stored = await chrome.storage.local.get([OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY]);
        return Boolean(stored?.[OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY]);
    } catch {
        return false;
    }
};

const preferredOriginsForSender = async (sender: chrome.runtime.MessageSender, path = ''): Promise<string[]> => {
    const senderUrl = sender.tab?.url || '';

    if (path.startsWith('/api/extension/')) {
        return _dedupeOrigins([
            OPENQBANK_FLY_API_ORIGIN,
            ..._defaultProdOrigins(),
        ]);
    }

    if (/^https?:\/\/localhost:5000\//i.test(senderUrl)) {
        return [OPENQBANK_LOCAL_ORIGIN, OPENQBANK_FLY_API_ORIGIN, OPENQBANK_PROD_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN];
    }

    if (/^https?:\/\/(?:[^/]+\.)?openqbank\.com\//i.test(senderUrl)) {
        try {
            const senderOrigin = new URL(senderUrl).origin;
            return _dedupeOrigins([
                OPENQBANK_FLY_API_ORIGIN,
                senderOrigin,
                OPENQBANK_PROD_ORIGIN,
                OPENQBANK_PROD_WWW_ORIGIN,
                OPENQBANK_LOCAL_ORIGIN,
            ]);
        } catch {
            return [OPENQBANK_FLY_API_ORIGIN, OPENQBANK_PROD_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN, OPENQBANK_LOCAL_ORIGIN];
        }
    }

    try {
        const [stored, allowLocalFallback] = await Promise.all([
            chrome.storage.local.get([OPENQBANK_ACTIVE_ORIGIN_KEY]),
            _allowLocalFallback(),
        ]);
        const activeOrigin = String(stored?.[OPENQBANK_ACTIVE_ORIGIN_KEY] || '').trim();
        if (_isSupportedOpenQBankOrigin(activeOrigin)) {
            if (_isProdOrigin(activeOrigin)) {
                return _dedupeOrigins([OPENQBANK_FLY_API_ORIGIN, activeOrigin, ..._defaultProdOrigins()]);
            }
            if (_isLocalOrigin(activeOrigin) && allowLocalFallback) {
                return _dedupeOrigins([activeOrigin, OPENQBANK_FLY_API_ORIGIN, ..._defaultProdOrigins()]);
            }
        }
    } catch {
        // Fall through to default ordering.
    }

    return _defaultProdOrigins();
};

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

type OpenQBankRequest = {
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
};

const handleOpenQBankRequest = async (request: OpenQBankRequest, origins: string[]) => {
    let lastError: string | null = null;
    let lastFailedResult: { ok: boolean; status?: number; error?: string; data?: unknown } | null = null;

    let authToken = '';
    try {
        const storedToken = await chrome.storage.local.get(['openqbank_access_token']);
        authToken = String(storedToken?.['openqbank_access_token'] || '').trim();
    } catch {
        // Token storage lookup fallback
    }

    const timeoutMs = request?.timeoutMs ?? 15000;

    for (const origin of origins) {
        try {
            const url = new URL(request?.path || '/', origin);
            const extensionVersion = chrome.runtime?.getManifest?.()?.version || '';
            const reqHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(extensionVersion ? { 'X-Extension-Version': extensionVersion } : {}),
                ...(request?.headers || {}),
            };

            if (authToken && !reqHeaders.Authorization) {
                reqHeaders.Authorization = `Bearer ${authToken}`;
            }

            const response = await fetch(url.toString(), {
                method: request?.method || 'GET',
                headers: reqHeaders,
                credentials: 'include',
                signal: AbortSignal.timeout(timeoutMs),
                body: request?.body ? JSON.stringify(request.body) : undefined,
            });

            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');
            const payload = isJson ? await response.json().catch(() => null) : await response.text();

            if (!response.ok) {
                let errorMessage =
                    (payload &&
                        typeof payload === 'object' &&
                        'error' in payload &&
                        typeof payload.error === 'string' &&
                        payload.error.trim()) ||
                    (typeof payload === 'string' && payload.trim()) ||
                    `Server error: ${response.status}`;

                if (typeof errorMessage === 'string' && (errorMessage.includes('<html') || errorMessage.includes('<!doctype'))) {
                    errorMessage = response.status === 404
                        ? `Endpoint not found on server (404): ${request?.path || '/'}`
                        : `Server error (${response.status})`;
                }

                if (response.status === 404) {
                    try {
                        const stored = await chrome.storage.local.get([OPENQBANK_ACTIVE_ORIGIN_KEY]);
                        if (stored?.[OPENQBANK_ACTIVE_ORIGIN_KEY] === origin) {
                            await chrome.storage.local.remove([OPENQBANK_ACTIVE_ORIGIN_KEY]);
                        }
                    } catch {
                        // Ignore storage error
                    }
                }

                if (response.status === 401 || response.status === 403) {
                    return {
                        ok: false,
                        status: response.status,
                        error: errorMessage,
                        data: payload,
                    };
                }

                lastFailedResult = {
                    ok: false,
                    status: response.status,
                    error: errorMessage,
                    data: payload,
                };
                continue;
            }

            try {
                await chrome.storage.local.set({ [OPENQBANK_ACTIVE_ORIGIN_KEY]: origin });
            } catch {
                // Ignore storage errors.
            }

            return {
                ok: true,
                status: response.status,
                data: payload,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
    }

    if (lastFailedResult) {
        return lastFailedResult;
    }

    return {
        ok: false,
        error: lastError || 'Unable to reach openQbank backend.',
    };
};

const handleByokGenerate = async (selection: string, grounding: string) => {
    const stored = await chrome.storage.local.get(['oqb_byok_openai_key', 'oqb_byok_model']);
    const key = String(stored.oqb_byok_openai_key || '').trim();
    const model = String(stored.oqb_byok_model || '').trim();
    if (!key || !model) {
        return { ok: false, error: 'Add an OpenAI key and model under Settings → Advanced.' };
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(45000),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: BYOK_SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: `SELECTION:\n${selection}\n\nWHAT_I_GOT_WRONG:\n${grounding || 'none'}`,
                    },
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: { name: 'flashcard', strict: true, schema: BYOK_SCHEMA },
                },
            }),
        });

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
        const parsed = JSON.parse(content) as { cloze: string; notes?: string };
        const card = {
            card_type: 'cloze' as const,
            front: (parsed.cloze || '').trim(),
            back: '',
            notes: (parsed.notes || '').trim(),
        };
        return { ok: true, card };
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
            sendResponse(await handleByokGenerate(selection, grounding));
        })();
        return true;
    }

    if (message?.type !== 'openqbank_request') {
        return false;
    }

    (async () => {
        try {
            const origins = await preferredOriginsForSender(sender, message?.request?.path);
            const response = await handleOpenQBankRequest(message.request, origins);
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
