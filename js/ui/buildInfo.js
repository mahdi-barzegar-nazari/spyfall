/**
 * The build line on the welcome screen (`#build-info`): "v2.1.0 · 8f33eec" in an installed build, "dev" in a
 * source checkout. It is language-neutral (a version and a hash, never translated), so it is written once at
 * start-up and needs no refresh when the language changes. The numbers come from `core/buildInfo.js`, which
 * `scripts/build.mjs` stamps.
 */

import { APP_VERSION, BUILD_HASH } from '../core/buildInfo.js';

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
