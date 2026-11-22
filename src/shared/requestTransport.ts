import { OPENQBANK_ACTIVE_ORIGIN_KEY } from '../apiOrigin';

export type OpenQBankRequest = {
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
};

type OpenQBankWorkerResponse = {
    ok: boolean;
    status?: number;
    error?: string;
    data?: unknown;
};

export const handleOpenQBankRequest = async (
    request: OpenQBankRequest,
    origins: readonly string[],
    timeoutMs: number,
): Promise<OpenQBankWorkerResponse> => {
    let lastError: string | null = null;
    let lastFailedResult: OpenQBankWorkerResponse | null = null;

    let authToken = '';
    try {
        const storedToken = await chrome.storage.local.get(['openqbank_access_token']);
        authToken = String(storedToken?.['openqbank_access_token'] || '').trim();
    } catch {
        // Token storage lookup fallback
    }

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

export async function sendExtensionRequest(request: OpenQBankRequest): Promise<OpenQBankWorkerResponse> {
    if (!chrome?.runtime?.id) {
        throw new Error('Extension context invalidated. Please refresh the page.');
    }

    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({ type: 'openqbank_request', request }, (response: OpenQBankWorkerResponse) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'Request failed.'));
                    return;
                }
                resolve(response);
            });
        } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}
