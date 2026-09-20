/**
 * Defense-in-depth against pinch/double-tap/ctrl-wheel zoom for an app-like feel.
 */

export function initAntiZoom() {
    // --- No-zoom, app-like feel -------------------------------------------
    // The viewport meta + touch-action:pan-y CSS handle most of this, but
    // some browsers (notably older iOS Safari) don't fully honor those, so
    // this is a defense-in-depth layer that blocks every remaining zoom path.
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    document.addEventListener('gesturechange', (e) => e.preventDefault());

    document.addEventListener('gestureend', (e) => e.preventDefault());

    document.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault(); // pinch
    }, { passive: false });

    let lastTouchEndTs = 0;

    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEndTs <= 300) e.preventDefault(); // double-tap zoom
        lastTouchEndTs = now;
    }, { passive: false });

    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) e.preventDefault(); // trackpad pinch / ctrl+wheel
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
    });
}
