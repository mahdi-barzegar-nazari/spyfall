/**
 * Which "how to install" hint the welcome screen shows, if any. This file is only the decision: it touches no
 * DOM, no storage and no global, so a test drives it with plain objects. `platform/install.js`
 * (`initInstallPrompt`) reads the browser, calls it, and shows or hides the hint in `index.html`.
 *
 * Why a hint at all: the install button only appears when the browser fires `beforeinstallprompt`, which is
 * Chromium alone. iPhone and iPad (Safari and every other iOS browser: they are all WebKit) install from the
 * Share menu, and Firefox for Android from its menu; neither ever fires the event, so those players would never
 * learn that the app can be installed.
 *
 * A third case is an iPhone or iPad where the page is open inside another app's built-in browser (Telegram,
 * Instagram, Facebook ...): that WebView usually has no "Add to Home Screen", so the hint there asks the person
 * to open the page in Safari instead. That is a HEURISTIC from the user agent, deliberately conservative
 * (see `looksLikeInAppWebView`): when it is not sure, the normal iOS hint is returned, never the in-app one.
 * It has not been verified on a real device.
 *
 * Pure: no imports, so it adds no edge to the module graph.
 */

/** The hint for iPhone, iPad and iPod: "Share, then Add to Home Screen". */
export const HINT_IOS = 'ios';

/** The hint for an iPhone or iPad inside another app's built-in browser: "To install, open this page in Safari". */
export const HINT_IOS_IN_APP = 'ios-in-app';

/** The hint for Firefox on Android: "Menu, then Install / Add to Home screen". */
export const HINT_FIREFOX_ANDROID = 'firefox-android';

/** localStorage key that remembers the person closed the hint (the value is `'true'`). */
export const INSTALL_HINT_DISMISSED_KEY = 'spy_install_hint_dismissed';

/** `value` if it is a string, else '' (a missing or odd `navigator` field must never throw). */
const textOf = (value) => (typeof value === 'string' ? value : '');

/** `value` as a number if it is a number or a numeric string, else NaN (never throws, whatever the value is). */
const numberOf = (value) => (typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN);

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
 * Tokens that the user agents of other apps' built-in browsers carry. Case-sensitive on purpose (they are
 * written like this in the real user agents) and matched as whole tokens, so `MyInstagramApp` or `Online/1`
 * is not one. `musical_ly` (TikTok's old name) is followed by a version (`musical_ly_32.5.0`), so it is only
 * anchored at its start.
 */
const IN_APP_TOKENS = [
    /\bInstagram\b/,
    /\bFBAN\b/,
    /\bFBAV\b/,
    /\bFB_IAB\b/,
    /\bFBIOS\b/,
    /\bLine\//,
    /\bTwitter\b/,
    /\bSnapchat\b/,
    /\bMicroMessenger\b/,
    /\bTikTok\b/,
    /\bmusical_ly/,
    /\bBytedanceWebview\b/,
    /\bWhatsApp\b/,
    /\bTelegram\b/
];

/**
 * Whether the user agent of an iOS device looks like an app's built-in browser (a WebView), not a browser.
 * Conservative: either a known token above, or an iPhone/iPod user agent with no `Safari/` token (Safari and
 * the full iOS browsers Chrome `CriOS`, Firefox `FxiOS`, Edge `EdgiOS` and Opera `OPiOS` all carry `Safari/`;
 * WebViews usually do not). The second rule is never applied to an iPad in desktop mode: its user agent is a
 * Mac's (`Macintosh`) and has no iPhone or iPod token, so for it only a known token can tell. The installed
 * home-screen app has no `Safari/` token either, which is why `detectInstallHint` looks at `standalone` first.
 */
function looksLikeInAppWebView(userAgent) {
    if (IN_APP_TOKENS.some((token) => token.test(userAgent))) return true;
    return /\b(?:iPhone|iPod)\b/.test(userAgent) && !/\bSafari\//.test(userAgent);
}

/**
 * The hint that applies, as `'ios'`, `'ios-in-app'`, `'firefox-android'` or `null` (show nothing).
 *
 * Nothing is shown (`null`) when the app already runs installed (`standalone`: the `display-mode: standalone`
 * media query or `navigator.standalone`) or when the install button is available (`beforeInstallPromptFired`):
 * there is nothing left to teach. On iOS the answer is `'ios-in-app'` when the user agent looks like another
 * app's built-in browser (`looksLikeInAppWebView`), else `'ios'`. Anything else that is not iOS or Firefox on
 * Android (Chrome, Edge and Samsung Internet on Android, every desktop browser) also gets `null`. A missing or
 * odd field counts as "not that": the function never throws, and a call with no argument returns `null`.
 *
 * @param {object} [environment]
 * @param {string} [environment.userAgent] `navigator.userAgent`
 * @param {string} [environment.platform] `navigator.platform`
 * @param {number} [environment.maxTouchPoints] `navigator.maxTouchPoints`
 * @param {boolean} [environment.standalone] the app runs installed (standalone display mode)
 * @param {boolean} [environment.beforeInstallPromptFired] the browser fired `beforeinstallprompt`
 * @returns {'ios' | 'ios-in-app' | 'firefox-android' | null}
 */
export function detectInstallHint(environment) {
    const env = environment && typeof environment === 'object' ? environment : {};
    if (env.standalone || env.beforeInstallPromptFired) return null;

    const userAgent = textOf(env.userAgent);
    if (isIos(userAgent, textOf(env.platform), numberOf(env.maxTouchPoints))) {
        return looksLikeInAppWebView(userAgent) ? HINT_IOS_IN_APP : HINT_IOS;
    }
    const isFirefoxOnAndroid = /\bAndroid\b/.test(userAgent) && /\bFirefox\//.test(userAgent);
    return isFirefoxOnAndroid ? HINT_FIREFOX_ANDROID : null;
}
