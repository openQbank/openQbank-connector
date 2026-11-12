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

    if (QBANK_HOSTS.some((re) => re.test(window.location.hostname))) {
        installSelectionButton();
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
