/**
 * Service worker registration and 'new version ready' notice.
 */

import { showToast } from '../ui/feedback.js';

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
                        showToast('نسخه جدید بازی آماده است. برنامه را ببندید و دوباره باز کنید.');
                    }
                });
            });
        }).catch(console.error);
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
}
