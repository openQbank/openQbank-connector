import { useEffect, useState } from 'react';
import { ArrowUpCircle, Check, Loader2, LogIn, LogOut } from 'lucide-react';
import { AuthProvider, getPreferredOrigins, useAuth } from './context/AuthContext';
import {
    isHyGuruAccount,
    isOpenQbankFree,
    isOpenQbankPro,
    isOpenQbankTier,
} from './content/tierAccess';
import { DISCLAIMER_TEXT } from './disclaimer';
import './index.css';

/** openQbank CSS tokens per /openqbank-css skill */
const BTN_PRIMARY =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40 bg-[#ffe5b4] text-[#1f2937] hover:bg-[#ffdab9]';
const BTN_ACTION =
  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#fcd34d] bg-[#ffe5b4] px-3 text-xs font-bold uppercase tracking-wider text-[#1f2937] transition hover:bg-[#ffdab9] disabled:cursor-not-allowed disabled:opacity-50';

const CUSTOM_CARD_FAB_STORAGE_KEY = 'custom_card_fab_enabled';
const AI_FLASHCARDS_STORAGE_KEY = 'ai_flashcards_enabled';
const BYOK_KEY_STORAGE = 'oqb_byok_openai_key';
const BYOK_MODEL_STORAGE = 'oqb_byok_model';
const OPENHYGURU_STORE_URL = 'https://chromewebstore.google.com/detail/dgajpjanpcdochcadolmgdoeddckpnli';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';

function PopupContent() {
  const {
    isLoading,
    authenticated,
    has_access: hasAccess,
    email: accountEmail,
    tier,
    user_type: userType,
    exam_mode: initialExamMode,
    anki_prompt_mode: initialPromptMode,
    upgrade_required: upgradeRequired,
    min_version: minVersion,
    upgrade_url: upgradeUrl,
    checkStatus,
    logout,
  } = useAuth();

  const isHyGuruUser = isHyGuruAccount(userType, tier);
  const isOpenQbankUser = isOpenQbankTier(userType, tier);
  const isProUser = isOpenQbankPro(userType, tier);
  const isFreeUser = isOpenQbankFree(userType, tier);
  const tierPillLabel = tier || 'Standard';
  const tierPillClassName = 'border border-amber-200 bg-[#ffe5b4] text-[#1f2937] dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300';

  const [examMode, setExamMode] = useState<string>(initialExamMode || 'Step 1');
  const [promptMode, setPromptMode] = useState<'default' | 'vignette'>(initialPromptMode || 'default');
  const [customCardFabEnabled, setCustomCardFabEnabled] = useState<boolean>(true);
  const [aiFlashcardsEnabled, setAiFlashcardsEnabled] = useState<boolean>(true);
  const [customCardFabPrefLoaded, setCustomCardFabPrefLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [byokKey, setByokKey] = useState('');
  const [byokModel, setByokModel] = useState('');
  const [byokMessage, setByokMessage] = useState('');

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([BYOK_KEY_STORAGE, BYOK_MODEL_STORAGE], (res) => {
        if (typeof res?.[BYOK_KEY_STORAGE] === 'string') setByokKey(res[BYOK_KEY_STORAGE]);
        if (typeof res?.[BYOK_MODEL_STORAGE] === 'string') setByokModel(res[BYOK_MODEL_STORAGE]);
      });
    }
  }, []);

  const saveByokSettings = async () => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({
      [BYOK_KEY_STORAGE]: byokKey.trim(),
      [BYOK_MODEL_STORAGE]: byokModel.trim(),
    });
    setByokMessage('Developer settings saved.');
  };

  const clearByokSettings = async () => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.remove([BYOK_KEY_STORAGE, BYOK_MODEL_STORAGE]);
    setByokKey('');
    setByokModel('');
    setByokMessage('Developer settings cleared.');
  };

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([CUSTOM_CARD_FAB_STORAGE_KEY, AI_FLASHCARDS_STORAGE_KEY], (res) => {
        if (res && typeof res[CUSTOM_CARD_FAB_STORAGE_KEY] === 'boolean') {
          setCustomCardFabEnabled(res[CUSTOM_CARD_FAB_STORAGE_KEY]);
        }
        if (res && typeof res[AI_FLASHCARDS_STORAGE_KEY] === 'boolean') {
          setAiFlashcardsEnabled(res[AI_FLASHCARDS_STORAGE_KEY]);
        }
        setCustomCardFabPrefLoaded(true);
      });
    } else {
      setCustomCardFabPrefLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (initialExamMode) setExamMode(initialExamMode);
    if (initialPromptMode) setPromptMode(initialPromptMode);
  }, [initialExamMode, initialPromptMode]);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDarkMode);
    }
  }, [isDarkMode]);

  const API_BASE = 'https://openqbank-api.fly.dev';
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginStep, setLoginStep] = useState<'identifier' | 'password' | 'code'>('identifier');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const resetLoginFlow = () => {
    setLoginStep('identifier');
    setLoginPassword('');
    setLoginCode('');
    setLoginError('');
  };

  const completeTokenLogin = async (data: { access_token?: string; refresh_token?: string; error?: string }) => {
    if (!data.access_token) {
      setLoginError(data.error || 'Invalid email or password.');
      return;
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        openqbank_access_token: data.access_token,
        openqbank_refresh_token: data.refresh_token,
      });
    }
    const success = await checkStatus({ token: data.access_token, hard: true, showLoading: false });
    if (!success) {
      setLoginError(data.error || 'Login succeeded but access check failed.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLoading) return;
    const identifier = loginEmail.trim();
    if (!identifier) return;

    setLoginLoading(true);
    setLoginError('');

    try {
      if (loginStep === 'identifier') {
        const response = await fetch(`${API_BASE}/api/app/auth/lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ identifier }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 404 || data.next === 'not_found') {
          setLoginError('No account found.');
          return;
        }
        if (!response.ok) {
          setLoginError(data.error || 'Could not look up account.');
          return;
        }
        setLoginStep(data.next === 'code' ? 'code' : 'password');
        return;
      }

      if (loginStep === 'code') {
        const response = await fetch(`${API_BASE}/api/app/auth/code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ identifier, code: loginCode.trim() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setLoginError(data.error || 'Invalid verification code.');
          return;
        }
        await completeTokenLogin(data);
        return;
      }

      const response = await fetch(`${API_BASE}/api/app/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ identifier, password: loginPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoginError(data.error || 'Invalid email or password.');
        return;
      }
      await completeTokenLogin(data);
    } catch {
      setLoginError('Unable to connect to openQbank API.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (savingSettings) return;
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      let token = '';
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(['openqbank_access_token']);
        token = String(stored?.openqbank_access_token || '').trim();
      }

      const origins = await getPreferredOrigins();
      let res: Response | null = null;
      let data: Record<string, unknown> = {};
      for (const baseUrl of origins) {
        try {
          const attempt = await fetch(`${baseUrl}/api/extension/settings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: AbortSignal.timeout(8000),
            body: JSON.stringify({
              exam_mode: examMode,
              anki_prompt_mode: promptMode,
            }),
          });
          data = await attempt.json().catch(() => ({}));
          res = attempt;
          if (attempt.ok) break;
          if (attempt.status !== 401 && attempt.status !== 403) break;
        } catch {
          continue;
        }
      }

      if (!res?.ok) {
        setSettingsMessage(String(data.error || 'Failed to save settings.'));
      } else {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({
            [CUSTOM_CARD_FAB_STORAGE_KEY]: customCardFabEnabled,
            [AI_FLASHCARDS_STORAGE_KEY]: aiFlashcardsEnabled,
          });
        }
        setSettingsMessage('Settings saved!');
        await checkStatus({ hard: true, showLoading: false });
      }
    } catch {
      setSettingsMessage('Network error saving settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[340px] items-center justify-center bg-white dark:bg-slate-900 px-6">
        <Loader2 className="h-7 w-7 animate-spin text-[#3b82f6] dark:text-[#b4ceff]" />
      </div>
    );
  }

  if (upgradeRequired) {
    const downloadUrl = upgradeUrl || 'https://openqbank.com/setup';
    return (
      <div className="flex min-h-[340px] flex-col justify-center bg-white dark:bg-slate-900 px-6 py-6 text-slate-800 dark:text-slate-100 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#ffe5b4] text-[#1f2937] dark:bg-[#16233c] dark:text-[#e5e7eb]">
          <ArrowUpCircle className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
          Update Required
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
          A new version of the openQbank extension (v{minVersion || '11.3.1'}+) is required to continue syncing and generating cards.
        </p>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={BTN_PRIMARY}
        >
          Update Extension
        </a>
      </div>
    );
  }

  if (authenticated && isHyGuruUser) {
    return (
      <div className="flex min-h-[340px] flex-col justify-center bg-white dark:bg-slate-900 px-6 py-6 text-slate-800 dark:text-slate-100 text-center">
        <img src="/logo.png" alt="openQbank" className="mx-auto mb-4 h-10 w-10 object-contain opacity-40" />
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
          openHyGuru accounts use the openHyGuru Connector
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
          This extension is for openQbank accounts. Install the openHyGuru Connector to keep your current workflow.
        </p>
        <a href={OPENHYGURU_STORE_URL} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
          Get openHyGuru Connector
        </a>
        <button type="button" onClick={() => { void handleSignOut(); }} className={`${BTN_ACTION} mt-3`}>
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[340px] flex-col justify-center bg-white dark:bg-slate-900 px-6 py-6 text-slate-800 dark:text-slate-100">
        <div className="mb-4 flex items-center justify-center gap-2">
          <img src="/logo.png" alt="openQbank" className="h-7 w-7 object-contain" />
          <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
            open<span className="text-[#111827] dark:text-slate-100">Qbank</span><span className="text-[#ffe5b4]">.</span>
          </span>
        </div>
        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition focus:border-[#fcd34d] focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          {loginStep === 'password' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition focus:border-[#fcd34d] focus:outline-none"
                placeholder="Password"
              />
            </div>
          )}
          {loginStep === 'code' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Verification code
              </label>
              <input
                type="text"
                required
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition focus:border-[#fcd34d] focus:outline-none"
                placeholder="XXXXXX"
              />
            </div>
          )}
          {loginError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{loginError}</p>
          )}
          <button
            type="submit"
            disabled={loginLoading}
            className={`${BTN_PRIMARY} py-3 mt-1`}
          >
            {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            <span>{loginStep === 'identifier' ? 'Continue' : 'Log In'}</span>
          </button>
          {loginStep !== 'identifier' && (
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              {loginStep === 'password' && (
                <>
                  <a
                    href="https://openqbank.com/forgot-password"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#3b82f6] hover:underline dark:text-[#60a5fa]"
                  >
                    Forgot password
                  </a>
                  {' or '}
                </>
              )}
              <button
                type="button"
                onClick={resetLoginFlow}
                className="font-semibold text-[#3b82f6] hover:underline dark:text-[#60a5fa] bg-transparent border-0 p-0 cursor-pointer"
              >
                use different email
              </button>
            </p>
          )}
        </form>
        <p className="mt-5 text-center text-[9px] leading-4 text-slate-400 dark:text-slate-500">
          By signing up for or using openQbank, you agree to the{' '}
          <a href="https://openqbank.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-500 dark:hover:text-slate-300">Terms and Conditions</a>
          {' and '}
          <a href="https://openqbank.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-500 dark:hover:text-slate-300">Privacy Policy</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[340px] flex-col bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="openQbank" className="h-6 w-6 object-contain" />
          <span className="text-base tracking-tight text-slate-900 dark:text-white font-extrabold">
            open<span className="text-[#111827] dark:text-slate-100">Qbank</span><span className="text-[#ffe5b4]">.</span>
          </span>
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Settings</span>
      </div>

      <div className="flex-1 space-y-4 px-6 py-4">
        {!hasAccess && (
          <p className="rounded-xl border border-[#e5e7eb] dark:border-[#243047] bg-[#f9fafb] dark:bg-[#16233c] px-3.5 py-2.5 text-xs leading-5 text-[#4b5563] dark:text-[#cbd5e1]">
            {accountEmail ? `${accountEmail}, your account does not currently have extension access.` : 'Your account does not currently have extension access.'}
          </p>
        )}

        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 px-3.5 py-2.5">
          <div className="text-xs">
            <span className="text-slate-400 dark:text-slate-500 font-medium">email: </span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{accountEmail || 'User'}</span>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tierPillClassName}`}>
            {tierPillLabel}
          </span>
        </div>

        <div className="space-y-3.5 text-left">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Flashcard Prompt Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPromptMode('default')}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${promptMode === 'default' ? 'border-[#fcd34d] bg-[#ffe5b4] text-[#1f2937] shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setPromptMode('vignette')}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${promptMode === 'vignette' ? 'border-[#fcd34d] bg-[#ffe5b4] text-[#1f2937] shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  Vignette
                </button>
              </div>
            </div>

            {isOpenQbankUser && customCardFabPrefLoaded && (
              <div className="pt-1">
                <div className="flex items-center justify-between">
                  <div className="pr-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Manual Flashcards (+)
                    </label>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {isFreeUser
                        ? 'Always enabled for free accounts to receive and edit cards.'
                        : 'Show floating (+) button to write flashcards manually.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isFreeUser}
                    onClick={() => !isFreeUser && setCustomCardFabEnabled((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${customCardFabEnabled || isFreeUser ? 'bg-[#ffe5b4]' : 'bg-slate-200 dark:bg-slate-700'} ${isFreeUser ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                    role="switch"
                    aria-checked={customCardFabEnabled || isFreeUser}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow-sm ring-0 transition duration-200 ease-in-out ${customCardFabEnabled || isFreeUser ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              </div>
            )}

            {isOpenQbankUser && isProUser && customCardFabPrefLoaded && (
              <div className="pt-1">
                <div className="flex items-center justify-between">
                  <div className="pr-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      AI Flashcards
                    </label>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Show the inline Generate Flashcard action.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiFlashcardsEnabled((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${aiFlashcardsEnabled ? 'bg-[#ffe5b4]' : 'bg-slate-200 dark:bg-slate-700'}`}
                    role="switch"
                    aria-checked={aiFlashcardsEnabled}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow-sm ring-0 transition duration-200 ease-in-out ${aiFlashcardsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              </div>
            )}

            {isOpenQbankUser && !isProUser && (
              <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3.5">
                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Advanced: developer mode
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label htmlFor="byok-key" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      OpenAI API key
                    </label>
                    <input
                      id="byok-key"
                      type="password"
                      value={byokKey}
                      onChange={(e) => setByokKey(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="byok-model" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Model ID
                    </label>
                    <input
                      id="byok-model"
                      type="text"
                      value={byokModel}
                      onChange={(e) => setByokModel(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { void saveByokSettings(); }} className={BTN_ACTION}>
                      Save
                    </button>
                    <button type="button" onClick={() => { void clearByokSettings(); }} className={BTN_ACTION}>
                      Clear
                    </button>
                  </div>
                  {byokMessage && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{byokMessage}</p>
                  )}
                  <a
                    href="https://github.com/openQbank/openQbank-connector#bring-your-own-key"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#3b82f6] hover:underline dark:text-[#60a5fa]"
                  >
                    Setup guide
                  </a>
                </div>
              </details>
            )}
          </div>

        {settingsMessage && (
          <p className={`text-xs font-medium ${settingsMessage.includes('saved') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {settingsMessage}
            {!settingsMessage.includes('saved') && (
              <> Believe this is an error?{' '}
                <a
                  href="https://openqbank.com/support"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold"
                >
                  Contact us.
                </a>
              </>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => { void handleSaveSettings(); }}
            disabled={savingSettings}
            className={BTN_ACTION}
          >
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span>Save Settings</span>
          </button>
          <button
            type="button"
            onClick={() => { void handleSignOut(); }}
            className={BTN_ACTION}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 px-5 py-3 text-center text-[10px] leading-4 text-slate-400 dark:text-slate-500">
        <p>
          {DISCLAIMER_TEXT}
        </p>
        <p className="mt-2">
          openQbank (v{APP_VERSION}) is a product of openMedEd LLC.{' '}
          <a href="https://openqbank.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-500 dark:hover:text-slate-400">Terms</a>
          {' · '}
          <a href="https://openqbank.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-500 dark:hover:text-slate-400">Privacy</a>
          {' · '}
          <a href="https://openqbank.com/support?audience=hyguru" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-500 dark:hover:text-slate-400">Support</a>
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <PopupContent />
    </AuthProvider>
  );
}

export default App;
