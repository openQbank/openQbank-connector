import { OPENQBANK_ACTIVE_ORIGIN_KEY, OPENQBANK_API_ORIGIN, OPENQBANK_PROD_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN } from './apiOrigin';

const OPENQBANK_LOCAL_ORIGIN = 'http://localhost:5000';
const OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY = 'openChromeBankAllowLocalFallback';

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
        origin === OPENQBANK_API_ORIGIN
        || origin === OPENQBANK_LOCAL_ORIGIN
        || origin === OPENQBANK_PROD_ORIGIN
        || origin === OPENQBANK_PROD_WWW_ORIGIN
    );
};

const _isLocalOrigin = (origin: string): boolean => origin === OPENQBANK_LOCAL_ORIGIN;

const _isProdOrigin = (origin: string): boolean =>
    origin === OPENQBANK_API_ORIGIN || origin === OPENQBANK_PROD_ORIGIN || origin === OPENQBANK_PROD_WWW_ORIGIN;

const _defaultProdOrigins = (): string[] => [OPENQBANK_API_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN, OPENQBANK_PROD_ORIGIN];

const _allowLocalFallback = async (): Promise<boolean> => {
    try {
        const stored = await chrome.storage.local.get([OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY]);
        return Boolean(stored?.[OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY]);
    } catch {
        return false;
    }
};

export const preferredOriginsForSender = async (sender: chrome.runtime.MessageSender, path = ''): Promise<string[]> => {
    const senderUrl = sender.tab?.url || '';

    if (path.startsWith('/api/extension/')) {
        return _dedupeOrigins([
            OPENQBANK_API_ORIGIN,
            ..._defaultProdOrigins(),
        ]);
    }

    if (/^https?:\/\/localhost:5000\//i.test(senderUrl)) {
        return [OPENQBANK_LOCAL_ORIGIN, OPENQBANK_API_ORIGIN, OPENQBANK_PROD_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN];
    }

    if (/^https?:\/\/(?:[^/]+\.)?openqbank\.com\//i.test(senderUrl)) {
        try {
            const senderOrigin = new URL(senderUrl).origin;
            return _dedupeOrigins([
                OPENQBANK_API_ORIGIN,
                senderOrigin,
                OPENQBANK_PROD_ORIGIN,
                OPENQBANK_PROD_WWW_ORIGIN,
                OPENQBANK_LOCAL_ORIGIN,
            ]);
        } catch {
            return [OPENQBANK_API_ORIGIN, OPENQBANK_PROD_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN, OPENQBANK_LOCAL_ORIGIN];
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
                return _dedupeOrigins([OPENQBANK_API_ORIGIN, activeOrigin, ..._defaultProdOrigins()]);
            }
            if (_isLocalOrigin(activeOrigin) && allowLocalFallback) {
                return _dedupeOrigins([activeOrigin, OPENQBANK_API_ORIGIN, ..._defaultProdOrigins()]);
            }
        }
    } catch {
        // Fall through to default ordering.
    }

    return _defaultProdOrigins();
};

export const getPreferredOrigins = async (): Promise<string[]> => {
    const dedupe = (origins: string[]) => Array.from(new Set(origins));
    const defaultProdOrigins = () => [OPENQBANK_API_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN, OPENQBANK_PROD_ORIGIN];
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeUrl = tabs[0]?.url || '';
        if (/^https?:\/\/localhost:5000\//i.test(activeUrl)) {
            return [OPENQBANK_LOCAL_ORIGIN, ...defaultProdOrigins()];
        }
        if (/^https?:\/\/(?:[^/]+\.)?openqbank\.com\//i.test(activeUrl)) {
            const activeOrigin = new URL(activeUrl).origin;
            return dedupe([OPENQBANK_API_ORIGIN, activeOrigin, ...defaultProdOrigins()]);
        }

        const stored = await chrome.storage.local.get([
            OPENQBANK_ACTIVE_ORIGIN_KEY,
            OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY,
        ]);
        const activeOrigin = String(stored?.[OPENQBANK_ACTIVE_ORIGIN_KEY] || '').trim();
        const allowLocalFallback = Boolean(stored?.[OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY]);
        if (activeOrigin === OPENQBANK_API_ORIGIN || activeOrigin === OPENQBANK_PROD_ORIGIN || activeOrigin === OPENQBANK_PROD_WWW_ORIGIN) {
            return dedupe([OPENQBANK_API_ORIGIN, activeOrigin, ...defaultProdOrigins()]);
        }
        if (activeOrigin === OPENQBANK_LOCAL_ORIGIN && allowLocalFallback) {
            return dedupe([OPENQBANK_LOCAL_ORIGIN, OPENQBANK_API_ORIGIN, ...defaultProdOrigins()]);
        }
    } catch {
        // Fall through to default ordering.
    }
    return defaultProdOrigins();
};

export const isOpenQbankUrl = (url?: string) => {
    if (!url) return false;
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'localhost' || host === 'openqbank.com' || host.endsWith('.openqbank.com');
    } catch {
        return false;
    }
};
