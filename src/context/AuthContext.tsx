import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ANKI_PROMPT_MODE_KEY = 'openChromeBankAnkiPromptMode';
export const OPENQBANK_PROD_ORIGIN = 'https://openqbank.com';
export const OPENQBANK_PROD_WWW_ORIGIN = 'https://www.openqbank.com';
export const OPENQBANK_FLY_API_ORIGIN = 'https://openqbank-api.fly.dev';
export const OPENQBANK_LOCAL_ORIGIN = 'http://localhost:5000';
export const OPENQBANK_ACTIVE_ORIGIN_KEY = 'openChromeBankActiveOrigin';
export const OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY = 'openChromeBankAllowLocalFallback';
export const AUTH_STATUS_STORAGE_KEY = 'ocb_extension_auth_status';

export const getPreferredOrigins = async (): Promise<string[]> => {
    const dedupe = (origins: string[]) => Array.from(new Set(origins));
    const defaultProdOrigins = () => [OPENQBANK_FLY_API_ORIGIN, OPENQBANK_PROD_WWW_ORIGIN, OPENQBANK_PROD_ORIGIN];
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeUrl = tabs[0]?.url || '';
        if (/^https?:\/\/localhost:5000\//i.test(activeUrl)) {
            return [OPENQBANK_LOCAL_ORIGIN, ...defaultProdOrigins()];
        }
        if (/^https?:\/\/(?:[^/]+\.)?openqbank\.com\//i.test(activeUrl)) {
            const activeOrigin = new URL(activeUrl).origin;
            return dedupe([OPENQBANK_FLY_API_ORIGIN, activeOrigin, ...defaultProdOrigins()]);
        }

        const stored = await chrome.storage.local.get([
            OPENQBANK_ACTIVE_ORIGIN_KEY,
            OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY,
        ]);
        const activeOrigin = String(stored?.[OPENQBANK_ACTIVE_ORIGIN_KEY] || '').trim();
        const allowLocalFallback = Boolean(stored?.[OPENQBANK_ALLOW_LOCAL_FALLBACK_KEY]);
        if (activeOrigin === OPENQBANK_FLY_API_ORIGIN || activeOrigin === OPENQBANK_PROD_ORIGIN || activeOrigin === OPENQBANK_PROD_WWW_ORIGIN) {
            return dedupe([OPENQBANK_FLY_API_ORIGIN, activeOrigin, ...defaultProdOrigins()]);
        }
        if (activeOrigin === OPENQBANK_LOCAL_ORIGIN && allowLocalFallback) {
            return dedupe([OPENQBANK_LOCAL_ORIGIN, OPENQBANK_FLY_API_ORIGIN, ...defaultProdOrigins()]);
        }
    } catch {
        // Fall through to default ordering.
    }
    return defaultProdOrigins();
};

interface AuthState {
    authenticated: boolean;
    email?: string;
    tier?: string;
    user_type?: string | null;
    exam_mode?: string;
    anki_prompt_mode?: 'default' | 'vignette';
    has_access: boolean;
    custom_anki_enabled: boolean;
    hyguru_settings_locked?: boolean;
    hyguru_exam_mode_locked?: boolean;
    message?: string;
    upgrade_required?: boolean;
    update_available?: boolean;
    min_version?: string;
    latest_version?: string;
    upgrade_url?: string;
}

interface AuthContextType extends AuthState {
    isLoading: boolean;
    checkStatus: (options?: { hard?: boolean; showLoading?: boolean; token?: string }) => Promise<boolean>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AuthState>({
        authenticated: false,
        has_access: false,
        custom_anki_enabled: false,
    });
    const [isLoading, setIsLoading] = useState(true);

    const logout = useCallback(async () => {
        setIsLoading(true);
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                await chrome.storage.local.clear();
            }
        } catch {
            // ignore
        }
        setState({ authenticated: false, has_access: false, custom_anki_enabled: false });
        setIsLoading(false);
    }, []);

    const checkStatus = useCallback(async (options?: { hard?: boolean; showLoading?: boolean; token?: string }): Promise<boolean> => {
        const hard = options?.hard ?? false;
        const showLoading = options?.showLoading ?? true;

        if (showLoading) setIsLoading(true);
        try {
            const origins = await getPreferredOrigins();
            let successfulOrigin: string | null = null;
            let resolvedData: Record<string, unknown> | null = null;

            let token = (options?.token || '').trim();
            if (!token) {
                try {
                    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                        const stored = await chrome.storage.local.get(['openqbank_access_token']);
                        token = String(stored?.openqbank_access_token || '').trim();
                    }
                } catch {
                    // ignore
                }
            }

            const extensionVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
                ? (chrome.runtime.getManifest()?.version || '')
                : '';
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            if (extensionVersion) {
                headers['X-Extension-Version'] = extensionVersion;
            }

            for (const baseUrl of origins) {
                const queryParts: string[] = [];
                if (hard) queryParts.push(`t=${Date.now()}`);
                if (extensionVersion) queryParts.push(`v=${encodeURIComponent(extensionVersion)}`);
                const qs = queryParts.length ? `?${queryParts.join('&')}` : '';
                const endpoint = `${baseUrl}/api/extension/status${qs}`;
                try {
                    const res = await fetch(endpoint, {
                        headers,
                        credentials: 'include',
                        cache: hard ? 'no-store' : 'default',
                        signal: AbortSignal.timeout(4000),
                    });
                    if (res.ok) {
                        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
                        if (data) {
                            resolvedData = data;
                            if (data.authenticated) {
                                successfulOrigin = baseUrl;
                            }
                            // Valid response received from backend (authenticated or not), stop looping
                            break;
                        }
                    }
                } catch {
                    // Try next origin on network / timeout error
                }
            }

            const data = (resolvedData || {}) as Record<string, unknown>;
            const isAuthenticated = Boolean(data.authenticated);

            const promptMode = data.anki_prompt_mode === 'vignette' ? 'vignette' : 'default';
            setState({
                authenticated: isAuthenticated,
                email: typeof data.email === 'string' ? data.email : undefined,
                tier: typeof data.tier === 'string' ? data.tier : undefined,
                user_type:
                    typeof data.user_type === 'string' && data.user_type.trim()
                        ? data.user_type.trim().toLowerCase()
                        : null,
                exam_mode: typeof data.exam_mode === 'string' ? data.exam_mode : 'Step 1',
                anki_prompt_mode: promptMode,
                has_access: Boolean(data.has_access),
                custom_anki_enabled: Boolean(data.custom_anki_enabled),
                hyguru_settings_locked: Boolean(data.hyguru_settings_locked),
                hyguru_exam_mode_locked: Boolean(data.hyguru_exam_mode_locked),
                message: typeof data.message === 'string' ? data.message : undefined,
                upgrade_required: Boolean(data.upgrade_required),
                update_available: Boolean(data.update_available),
                min_version: typeof data.min_version === 'string' ? data.min_version : undefined,
                latest_version: typeof data.latest_version === 'string' ? data.latest_version : undefined,
                upgrade_url: typeof data.upgrade_url === 'string' ? data.upgrade_url : undefined,
            });
            if (isAuthenticated) {
                try {
                    window.localStorage.setItem(ANKI_PROMPT_MODE_KEY, promptMode);
                } catch {
                    // Ignore localStorage failures.
                }
                if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                    const storagePayload: Record<string, string> = {
                        [ANKI_PROMPT_MODE_KEY]: promptMode,
                        [AUTH_STATUS_STORAGE_KEY]: JSON.stringify({
                            authenticated: true,
                            tier: typeof data.tier === 'string' ? data.tier : null,
                            user_type:
                                typeof data.user_type === 'string' && data.user_type.trim()
                                    ? data.user_type.trim().toLowerCase()
                                    : null,
                            cache_identity: typeof data.cache_identity === 'string' ? data.cache_identity : null,
                            content_scope: typeof data.content_scope === 'string' ? data.content_scope : null,
                            ts: Date.now(),
                        }),
                    };
                    if (successfulOrigin) {
                        storagePayload[OPENQBANK_ACTIVE_ORIGIN_KEY] = successfulOrigin;
                    }
                    chrome.storage.local.set(storagePayload).catch(() => {
                        // Ignore storage sync failures and keep localStorage as fallback.
                    });
                }
            } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({
                    [AUTH_STATUS_STORAGE_KEY]: JSON.stringify({
                        authenticated: false,
                        tier: null,
                        user_type: null,
                        cache_identity: null,
                        content_scope: null,
                        ts: Date.now(),
                    }),
                }).catch(() => {
                    // ignore
                });
            }
            return isAuthenticated;
        } catch (error) {
            console.error('Failed to check auth status:', error);
            setState({ authenticated: false, has_access: false, custom_anki_enabled: false });
            return false;
        } finally {
            if (showLoading) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void checkStatus();
        // Failsafe timer so popup never stays in loading state indefinitely
        const timer = window.setTimeout(() => {
            setIsLoading(false);
        }, 4000);
        return () => window.clearTimeout(timer);
    }, [checkStatus]);

    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome.tabs?.onUpdated || !chrome.tabs?.onActivated) return;

        const isOpenQbankUrl = (url?: string) => {
            if (!url) return false;
            try {
                const host = new URL(url).hostname.toLowerCase();
                return host === 'localhost' || host === 'openqbank.com' || host.endsWith('.openqbank.com');
            } catch {
                return false;
            }
        };

        let timerId: number | null = null;
        const queueStatusCheck = (hard = false) => {
            if (timerId) window.clearTimeout(timerId);
            timerId = window.setTimeout(() => {
                void checkStatus({ hard, showLoading: false });
            }, 350);
        };

        const handleActivated = async (activeInfo: { tabId: number }) => {
            try {
                const tab = await chrome.tabs.get(activeInfo.tabId);
                if (isOpenQbankUrl(tab.url)) {
                    queueStatusCheck();
                }
            } catch {
                // Ignore - tab can disappear before it is fetched.
            }
        };

        const handleUpdated = (
            _tabId: number,
            changeInfo: chrome.tabs.OnUpdatedInfo,
            tab: chrome.tabs.Tab
        ) => {
            const currentUrl = changeInfo.url ?? tab.url;
            if (!isOpenQbankUrl(currentUrl)) return;

            if (changeInfo.url || changeInfo.status === 'complete') {
                queueStatusCheck(true);
            }
        };

        chrome.tabs.onActivated.addListener(handleActivated);
        chrome.tabs.onUpdated.addListener(handleUpdated);

        return () => {
            if (timerId) window.clearTimeout(timerId);
            chrome.tabs.onActivated.removeListener(handleActivated);
            chrome.tabs.onUpdated.removeListener(handleUpdated);
        };
    }, [checkStatus]);

    useEffect(() => {
        const handleFocus = () => {
            void checkStatus({ showLoading: false });
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                void checkStatus({ showLoading: false });
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [checkStatus]);

    return (
        <AuthContext.Provider value={{ ...state, isLoading, checkStatus, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
