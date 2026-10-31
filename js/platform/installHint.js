/**
 * Which "how to install" hint the welcome screen shows, if any. This file is only the decision: it touches no
 * DOM, no storage and no global, so a test drives it with plain objects. `platform/install.js`
 * (`initInstallPrompt`) reads the browser, calls it, and shows or hides the hint in `index.html`.
 *
 * Why a hint at all: the install button only appears when the browser fires `beforeinstallprompt`, which is
 * Chromium alone. iPhone and iPad (Safari and every other iOS browser: they are all WebKit) install from the
 * Share menu, and Firefox for Android from its menu; neither ever fires the event, so those players would never
 * learn that the app can be installed. In-app browsers are deliberately not detected: their user agents are
 * not reliable.
 *
 * Pure: no imports, so it adds no edge to the module graph.
 */

/** The hint for iPhone, iPad and iPod: "Share, then Add to Home Screen". */
export const HINT_IOS = 'ios';

/** The hint for Firefox on Android: "Menu, then Install / Add to Home screen". */
export const HINT_FIREFOX_ANDROID = 'firefox-android';

/** localStorage key that remembers the person closed the hint (the value is `'true'`). */
export const INSTALL_HINT_DISMISSED_KEY = 'spy_install_hint_dismissed';

/** `value` if it is a string, else '' (a missing or odd `navigator` field must never throw). */
const textOf = (value) => (typeof value === 'string' ? value : '');

/**
 * True for iPhone, iPad and iPod. iPadOS 13 and later asks for the desktop version of a site by default and
 * then calls itself a Mac (`Macintosh` in the user agent, `MacIntel` as the platform); the one thing that
 * still tells it from a real Mac is the touch screen: an iPad reports 5 touch points, a Mac none.
 */
function isIos(userAgent, platform, maxTouchPoints) {
    if (/\b(?:iPhone|iPad|iPod)\b/.test(userAgent)) return true;
    const claimsToBeMac = platform === 'MacIntel' || /\bMacintosh\b/.test(userAgent);
    return claimsToBeMac && maxTouchPoints > 1;
}

/**
 * The hint that applies, as `'ios'`, `'firefox-android'` or `null` (show nothing).
 *
 * Nothing is shown (`null`) when the app already runs installed (`standalone`: the `display-mode: standalone`
 * media query or `navigator.standalone`) or when the install button is available (`beforeInstallPromptFired`):
 * there is nothing left to teach. Anything else that is not iOS or Firefox on Android (Chrome, Edge and
 * Samsung Internet on Android, every desktop browser) also gets `null`. A missing or odd field counts as
 * "not that": the function never throws, and a call with no argument returns `null`.
 *
 * @param {object} [environment]
 * @param {string} [environment.userAgent] `navigator.userAgent`
 * @param {string} [environment.platform] `navigator.platform`
 * @param {number} [environment.maxTouchPoints] `navigator.maxTouchPoints`
 * @param {boolean} [environment.standalone] the app runs installed (standalone display mode)
 * @param {boolean} [environment.beforeInstallPromptFired] the browser fired `beforeinstallprompt`
 * @returns {'ios' | 'firefox-android' | null}
 */
export function detectInstallHint(environment) {
    const env = environment && typeof environment === 'object' ? environment : {};
    if (env.standalone || env.beforeInstallPromptFired) return null;

    const userAgent = textOf(env.userAgent);
    if (isIos(userAgent, textOf(env.platform), Number(env.maxTouchPoints))) return HINT_IOS;
    const isFirefoxOnAndroid = /\bAndroid\b/.test(userAgent) && /\bFirefox\//.test(userAgent);
    return isFirefoxOnAndroid ? HINT_FIREFOX_ANDROID : null;
}
