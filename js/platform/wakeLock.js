/**
 * Screen Wake Lock so the phone does not sleep mid-game.
 */

let wakeLockSentinel = null;

export async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            if (!wakeLockSentinel || wakeLockSentinel.released) {
                wakeLockSentinel = await navigator.wakeLock.request('screen');
                wakeLockSentinel.addEventListener('release', () => {
                    wakeLockSentinel = null;
                    if (document.visibilityState === 'visible') {
                        requestWakeLock();
                    }
                });
            }
        }
    } catch(e) {}
}
