import { QBANK_HOSTS } from '../shared/hosts';
import { installSelectionButton } from './trigger';
import { openSelectionPanel } from './panel';

declare global {
    interface Window {
        __oqbSelectionLoaded?: boolean;
    }
}

if (window.__oqbSelectionLoaded) {
    // Already injected in this frame.
} else {
    window.__oqbSelectionLoaded = true;

    const isTrustedHost = QBANK_HOSTS.some((re) => re.test(window.location.hostname));
    let installed = false;

    const checkAndInstall = () => {
        if (installed) return;
        chrome.storage?.local?.get(['trusted_sites_only'], (res) => {
            const trustedSitesOnly = res?.trusted_sites_only !== false;
            if ((isTrustedHost || !trustedSitesOnly) && !installed) {
                installed = true;
                installSelectionButton();
            }
        });
    };

    checkAndInstall();

    try {
        chrome.storage?.onChanged?.addListener((changes, area) => {
            if (area === 'local' && changes.trusted_sites_only) {
                checkAndInstall();
            }
        });
    } catch {
        // Ignore API unavailable
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.action === 'OQB_OPEN_SELECTION_PANEL') {
            const text = String(message.selectionText || '').trim();
            if (text) openSelectionPanel(text);
            sendResponse({ ok: true });
            return true;
        }
        return false;
    });
}
