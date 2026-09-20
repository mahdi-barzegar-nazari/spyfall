/**
 * Custom PWA install button (beforeinstallprompt).
 */

export function initInstallPrompt() {
    // --- Native-like custom PWA install banner -----------------------------
    // Chrome/Edge/Android fire `beforeinstallprompt` when the app meets the
    // installability criteria (manifest + service worker). We intercept the
    // default mini-infobar, stash the event, and show our own themed button
    // instead so the install affordance matches the rest of the UI.
    let deferredInstallPrompt = null;

    const installBtn = document.getElementById('btn-install-app');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (installBtn) installBtn.classList.remove('hidden');
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
