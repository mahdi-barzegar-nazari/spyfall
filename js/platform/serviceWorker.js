/**
 * Service worker registration and 'new version ready' notice.
 */

import { showToast } from '../ui/feedback.js';
import { t } from '../i18n/index.js';

/** Longest the registration waits for the page's 'load' event. */
const REGISTER_FALLBACK_MS = 3000;

/** Register the service worker (production builds only do real caching; see sw.js). */
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
        navigator.serviceWorker.register('./sw.js').then(registration => {
            if (!registration) return;
            registration.addEventListener('updatefound', () => {
                const installing = registration.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                    // An existing controller means this is an update, not the first install.
                    if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                        showToast(t('toast.updateReady'));
                    }
                });
            });
        }).catch(console.error);
    };

    // Not only on 'load': the load event also waits for web fonts, and on a network that drops packets a
    // font request can hang for 20-40 s. The timer means the worker is registered a few seconds after
    // start-up whatever a slow file is doing; whichever comes first wins and the other one is ignored.
    let registered = false;
    const registerOnce = () => {
        if (registered) return;
        registered = true;
        register();
    };
    if (document.readyState === 'complete') registerOnce();
    else {
        window.addEventListener('load', registerOnce);
        setTimeout(registerOnce, REGISTER_FALLBACK_MS);
    }
}
