/**
 * The build line on the welcome screen (`#build-info`): "v2.1.0 · 8f33eec" in an installed build, "dev" in a
 * source checkout. It is language-neutral (a version and a hash, never translated), so it is written once at
 * start-up and needs no refresh when the language changes. The numbers come from `core/buildInfo.js`, which
 * `scripts/build.mjs` stamps.
 *
 * The line is hidden by default (the `hidden` class is in `index.html`, so it is not even drawn on the first
 * paint) and a long press on the welcome title (`#welcome-title`) shows it for a few seconds. When and for how
 * long is decided by the pure controller in `ui/buildInfoReveal.js`; `initBuildInfoReveal()` below only connects
 * it to the page.
 */

import { APP_VERSION, BUILD_HASH } from '../core/buildInfo.js';
import { createBuildInfoReveal } from './buildInfoReveal.js';

/** How many characters of the build hash are shown. */
export const SHORT_HASH_LENGTH = 7;

/** True while the placeholders are untouched (a source checkout): the same test as `DEV` in sw.js. */
function isDevBuild(version, hash) {
    return typeof version !== 'string' || typeof hash !== 'string' || version.startsWith('__') || hash.startsWith('__');
}

/** The text of the build line for a version and a full build hash. */
export function formatBuildInfo(version = APP_VERSION, hash = BUILD_HASH) {
    if (isDevBuild(version, hash)) return 'dev';
    return `v${version} · ${hash.slice(0, SHORT_HASH_LENGTH)}`;
}

/** Write the build line into `#build-info` (textContent, never HTML). Does nothing if the element is missing. */
export function renderBuildInfo(version = APP_VERSION, hash = BUILD_HASH) {
    const element = document.getElementById('build-info');
    if (element) element.textContent = formatBuildInfo(version, hash);
}

/**
 * Let a long press on the welcome title reveal the build line. Call once at start-up, after `renderBuildInfo()`.
 * Only a primary pointer with the main button counts (touch, pen and the left mouse button; not a second
 * finger and not a right click). The press is ended by a release, a cancelled pointer, the pointer leaving the
 * title and a move of more than a few pixels (all inside the controller), and by the welcome screen being
 * hidden, which also hides the line again, so it never comes back with the screen.
 *
 * While a press is held, the title's `contextmenu` is cancelled, so a touch long press cannot open the
 * browser's menu (or start a text selection, which `user-select: none` on the title already refuses) and
 * cancel the press under the person's finger. Nothing else is touched: no other element gets a listener.
 *
 * Does nothing, and returns `null`, if the title or the line is missing. Otherwise returns the controller and
 * a `destroy()` that removes every listener and hides the line.
 */
export function initBuildInfoReveal() {
    const title = document.getElementById('welcome-title');
    const line = document.getElementById('build-info');
    if (!title || !line) return null;

    const controller = createBuildInfoReveal({
        show: () => line.classList.remove('hidden'),
        hide: () => line.classList.add('hidden')
    });

    const onPointerDown = (event) => {
        if (event.isPrimary && event.button === 0) controller.pressStart(event.clientX, event.clientY);
    };
    const onPointerMove = (event) => controller.pressMove(event.clientX, event.clientY);
    const onPressEnd = () => controller.cancelPress();
    const onContextMenu = (event) => {
        if (controller.isPressing()) event.preventDefault();
    };

    title.addEventListener('pointerdown', onPointerDown);
    title.addEventListener('pointermove', onPointerMove);
    title.addEventListener('pointerup', onPressEnd);
    title.addEventListener('pointercancel', onPressEnd);
    title.addEventListener('pointerleave', onPressEnd);
    title.addEventListener('contextmenu', onContextMenu);

    // The screen changes by `renderUI` toggling the `hidden` class of the sections.
    const screen = document.getElementById('screen-welcome');
    let observer = null;
    if (screen && typeof MutationObserver === 'function') {
        observer = new MutationObserver(() => {
            if (screen.classList.contains('hidden')) controller.reset();
        });
        observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    return {
        controller,
        destroy() {
            title.removeEventListener('pointerdown', onPointerDown);
            title.removeEventListener('pointermove', onPointerMove);
            title.removeEventListener('pointerup', onPressEnd);
            title.removeEventListener('pointercancel', onPressEnd);
            title.removeEventListener('pointerleave', onPressEnd);
            title.removeEventListener('contextmenu', onContextMenu);
            observer?.disconnect();
            controller.destroy();
        }
    };
}
