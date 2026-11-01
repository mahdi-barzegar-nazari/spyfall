/**
 * Custom PWA install button (beforeinstallprompt) and, for the browsers that never fire that event, the install
 * hint on the welcome screen (`detectInstallHint` in `./installHint.js` decides which one applies).
 */

import {
    HINT_FIREFOX_ANDROID,
    HINT_IOS,
    HINT_IOS_IN_APP,
    INSTALL_HINT_DISMISSED_KEY,
    detectInstallHint
} from './installHint.js';

/**
 * The page as `detectInstallHint` needs it. `standalone` is true when the app runs installed: the standalone
 * display mode (Android, desktop) or `navigator.standalone` (iOS home-screen apps).
 */
function readEnvironment() {
    let standalone = false;
    try {
        standalone = window.matchMedia('(display-mode: standalone)').matches;
    } catch (e) {}
    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: standalone || navigator.standalone === true
    };
}

function readHintDismissed() {
    try {
        return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

function saveHintDismissed() {
    try {
        localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, 'true');
    } catch (e) {
        console.warn('Storage write restricted:', e);
    }
}

/**
 * The install hint inside the welcome screen (`#install-hint` in index.html): one line for the browser's own
 * install route and a close button. The box sits inside `#screen-welcome`, so it can only ever be seen there,
 * never during a match. Returns `{ installPromptFired }`, to be called when the browser fires
 * `beforeinstallprompt` (the install button is then available and the hint goes away).
 */
function initInstallHint() {
    const box = document.getElementById('install-hint');
    const closeBtn = document.getElementById('btn-install-hint-close');
    const lines = {
        [HINT_IOS]: document.getElementById('install-hint-ios'),
        [HINT_IOS_IN_APP]: document.getElementById('install-hint-ios-in-app'),
        [HINT_FIREFOX_ANDROID]: document.getElementById('install-hint-firefox-android')
    };
    if (!box || !closeBtn || Object.values(lines).some((line) => !line)) return { installPromptFired() {} };

    let promptFired = false;
    let dismissed = readHintDismissed();

    function sync() {
        const hint = dismissed
            ? null
            : detectInstallHint({ ...readEnvironment(), beforeInstallPromptFired: promptFired });
        box.classList.toggle('hidden', hint === null);
        for (const [name, line] of Object.entries(lines)) line.classList.toggle('hidden', name !== hint);
    }

    closeBtn.addEventListener('click', () => {
        // The button is about to disappear: a keyboard or screen-reader user would be left on <body>, so the
        // focus goes on to the next control of the screen. (Safari does not focus a button on a tap; then
        // nothing moves.)
        const hadFocus = document.activeElement === closeBtn;
        dismissed = true;
        saveHintDismissed();
        sync();
        if (hadFocus) document.getElementById('btn-nav-setup')?.focus();
    });

    sync();
    return {
        installPromptFired() {
            promptFired = true;
            sync();
        }
    };
}

export function initInstallPrompt() {
    // --- Native-like custom PWA install banner -----------------------------
    // Chrome/Edge/Android fire `beforeinstallprompt` when the app meets the
    // installability criteria (manifest + service worker). We intercept the
    // default mini-infobar, stash the event, and show our own themed button
    // instead so the install affordance matches the rest of the UI.
    let deferredInstallPrompt = null;

    const installBtn = document.getElementById('btn-install-app');
    const installHint = initInstallHint();

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (installBtn) installBtn.classList.remove('hidden');
        installHint.installPromptFired();
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            installBtn.classList.add('hidden');
            deferredInstallPrompt.prompt();
            try {
                await deferredInstallPrompt.userChoice;
            } catch (e) {}
            deferredInstallPrompt = null;
        });
    }

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        if (installBtn) installBtn.classList.add('hidden');
    });
}
