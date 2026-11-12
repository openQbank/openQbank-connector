export type OpenQBankWorkerResponse = {
    ok: boolean;
    status?: number;
    error?: string;
    data?: unknown;
};

export const showUpdateRequiredModal = (minVersion?: string, upgradeUrl?: string) => {
    let modal = document.getElementById('ocb-update-required-modal');
    if (modal) modal.remove();

    const targetUrl = upgradeUrl || 'https://openqbank.com/setup';
    const targetVer = minVersion || '11.3.1';

    modal = document.createElement('div');
    modal.id = 'ocb-update-required-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.5);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
    `;

    modal.innerHTML = `
        <div style="background: #ffffff; border: 2px solid transparent; background: linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(120deg, #3b82f6, #fb7185, #ffb347) border-box; border-radius: 20px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04); width: min(440px, 92vw); padding: 28px 24px; text-align: center; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing: border-box;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: var(--ocb-brand, #ffe5b4); color: var(--ocb-text-on-brand, #1f2937); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="16 12 12 8 8 12"></polyline>
                    <line x1="12" y1="16" x2="12" y2="8"></line>
                </svg>
            </div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #111827;">Update Required</h3>
            <p style="font-size: 13px; color: #4b5563; line-height: 1.5; margin: 0 0 20px;">
                A new version of the openQbank extension (v${targetVer}+) is required to continue syncing and generating cards. Please update your extension to keep studying without interruption.
            </p>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center; height: 42px; width: 100%; border-radius: 12px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: #ffe5b4; color: #1f2937; text-decoration: none; transition: background 0.15s ease;">
                    Update Extension
                </a>
                <button type="button" id="ocb-update-modal-close" style="height: 36px; background: transparent; border: none; font-size: 12px; font-weight: 600; color: #6b7280; cursor: pointer;">
                    Dismiss
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#ocb-update-modal-close')?.addEventListener('click', () => modal?.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
};

export const sendOpenQBankRequest = async <T = void>(
    path: string,
    body?: Record<string, unknown>,
    expectData = false,
    method: 'GET' | 'POST' = 'POST',
    timeoutMs?: number,
): Promise<T | null> => {
    if (!chrome?.runtime?.id) {
        throw new Error('Extension context invalidated. Please refresh the page.');
    }

    const response = await new Promise<OpenQBankWorkerResponse>((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(
                {
                    type: 'openqbank_request',
                    request: {
                        path,
                        method,
                        body,
                        timeoutMs,
                    },
                },
                (messageResponse: OpenQBankWorkerResponse) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message || 'Request failed.'));
                        return;
                    }

                    resolve(messageResponse);
                },
            );
        } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });

    if (!response?.ok) {
        const dataObj = response?.data && typeof response.data === 'object'
            ? (response.data as Record<string, unknown>)
            : undefined;
        if (response?.status === 426 || dataObj?.code === 'UPGRADE_REQUIRED') {
            const minV = typeof dataObj?.min_version === 'string' ? dataObj.min_version : undefined;
            const upUrl = typeof dataObj?.upgrade_url === 'string' ? dataObj.upgrade_url : undefined;
            showUpdateRequiredModal(minV, upUrl);
        }
        throw new Error(response?.error || 'Request failed.');
    }

    return expectData ? (response.data as T) : null;
};
