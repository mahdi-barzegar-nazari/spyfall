/**
 * The install hint on the welcome screen: the pure decision (`detectInstallHint`) on real-looking user agents,
 * and the static side of it: the markup in index.html (inside the welcome screen, hidden until JS decides, a
 * close button with an accessible name) and the texts in both catalogs. Needs only Node: the function is
 * called with plain objects, it reads no browser global. The wiring (the dismissal that is remembered, the
 * hint that follows the screen, a blocked storage) is covered in a real browser by
 * tests/e2e/install-hint.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import {
    HINT_FIREFOX_ANDROID,
    HINT_IOS,
    HINT_IOS_IN_APP,
    INSTALL_HINT_DISMISSED_KEY,
    detectInstallHint
} from '../../js/platform/installHint.js';
import { closest, elements, innerText, normalizeText, parseHtml } from './helpers/htmlScan.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** What `navigator` says on each browser: user agent, platform and touch points (as the browsers report them). */
const BROWSERS = {
    iphoneSafari: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneChrome: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneFirefox: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneEdge: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/125.2535.60 Mobile/15E148 Safari/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    // iPadOS 13+ asks for the desktop site by default: the user agent is a Mac's, only the touch screen tells.
    ipadDesktopSafari: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5
    },
    ipadMobileSafari: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        platform: 'iPad',
        maxTouchPoints: 5
    },
    macSafari: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0
    },
    macChrome: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0
    },
    firefoxAndroid: {
        userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
        platform: 'Linux armv81',
        maxTouchPoints: 5
    },
    firefoxAndroidTablet: {
        userAgent: 'Mozilla/5.0 (Android 13; Tablet; rv:128.0) Gecko/128.0 Firefox/128.0',
        platform: 'Linux armv81',
        maxTouchPoints: 5
    },
    chromeAndroid: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv81',
        maxTouchPoints: 5
    },
    samsungInternet: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv81',
        maxTouchPoints: 5
    },
    desktopChromeWindows: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 0
    },
    desktopChromeWindowsTouch: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 10
    },
    desktopFirefoxWindows: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        platform: 'Win32',
        maxTouchPoints: 0
    },
    desktopFirefoxLinux: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
        platform: 'Linux x86_64',
        maxTouchPoints: 0
    },
    // The home-screen app of iOS drops "Version/... Safari/..." from the user agent.
    iphoneHomeScreenApp: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneOpera: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/16.0.15.124050 Mobile/15E148 Safari/9537.53',
        platform: 'iPhone',
        maxTouchPoints: 5
    },

    // ---- Built-in browsers of other apps on iOS. The shapes follow what these apps send; none of them has been
    // checked on a real device here, which is why the function is a conservative heuristic.
    iphoneInstagram: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 330.0.0.20.113 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 575238203)',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneFacebook: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/460.0.0.35.108;FBBV/579283000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    // Telegram (and other apps) hand the page a bare WebKit user agent: no app token, and no Safari/ either.
    iphoneTelegramLike: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneBareWebView: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneLine: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.7.0',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneWeChat: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003133) NetType/WIFI Language/en',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    iphoneTikTok: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_32.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    // Snapchat writes "Safari/" inside its own token, so the Safari/ rule alone would call it a browser.
    iphoneSnapchat: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.99.0.30 (like Safari/8617.1.17.10.9, panda)',
        platform: 'iPhone',
        maxTouchPoints: 5
    },
    // An iPad in desktop mode with an app token (the Safari/ rule can never apply to it).
    ipadDesktopFacebook: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) [FBAN/FBIOS;FBAV/460.0.0.35.108;FBDV/iPad13,8;FBMD/iPad;FBSN/iOS;FBSV/17.5]',
        platform: 'MacIntel',
        maxTouchPoints: 5
    },
    // An iPad in desktop mode, no Safari/ and no token: not provable, so the normal hint.
    ipadDesktopNoSafariToken: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
        platform: 'MacIntel',
        maxTouchPoints: 5
    },
    // The Safari/ rule is for iPhone and iPod user agents only.
    ipadMobileNoSafariToken: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        platform: 'iPad',
        maxTouchPoints: 5
    },
    ipodTouchNoSafariToken: {
        userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        platform: 'iPod touch',
        maxTouchPoints: 5
    },
    // Not iOS: an app token on another system changes nothing.
    androidInstagram: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240605.024; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 Instagram 330.0.0.40.99 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 600000000)',
        platform: 'Linux armv81',
        maxTouchPoints: 5
    },
    macSafariWithAppToken: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15 Telegram',
        platform: 'MacIntel',
        maxTouchPoints: 0
    }
};

/** What the user agents above must give (with no flag set). Every browser of the table is listed here once. */
const EXPECTED = {
    iphoneSafari: 'ios',
    iphoneChrome: 'ios',
    iphoneFirefox: 'ios',
    iphoneEdge: 'ios',
    iphoneOpera: 'ios',
    ipadDesktopSafari: 'ios',
    ipadMobileSafari: 'ios',
    macSafari: null,
    macChrome: null,
    firefoxAndroid: 'firefox-android',
    firefoxAndroidTablet: 'firefox-android',
    chromeAndroid: null,
    samsungInternet: null,
    desktopChromeWindows: null,
    desktopChromeWindowsTouch: null,
    desktopFirefoxWindows: null,
    desktopFirefoxLinux: null,
    iphoneHomeScreenApp: 'ios-in-app', // by user agent alone; `standalone` is what keeps the installed app from a hint
    iphoneInstagram: 'ios-in-app',
    iphoneFacebook: 'ios-in-app',
    iphoneTelegramLike: 'ios-in-app',
    iphoneBareWebView: 'ios-in-app',
    iphoneLine: 'ios-in-app',
    iphoneWeChat: 'ios-in-app',
    iphoneTikTok: 'ios-in-app',
    iphoneSnapchat: 'ios-in-app',
    ipadDesktopFacebook: 'ios-in-app',
    ipadDesktopNoSafariToken: 'ios',
    ipadMobileNoSafariToken: 'ios',
    ipodTouchNoSafariToken: 'ios-in-app',
    androidInstagram: null,
    macSafariWithAppToken: null
};

/** `detectInstallHint` for one of the browsers above, with the two flags the page adds. */
const hintFor = (browser, flags = {}) =>
    detectInstallHint({ ...BROWSERS[browser], standalone: false, beforeInstallPromptFired: false, ...flags });

describe('detectInstallHint: which browsers get which hint', () => {
    it('the tested browsers are real-looking: each user agent is a non-empty string of a known family', () => {
        for (const [name, { userAgent }] of Object.entries(BROWSERS)) {
            assert.ok(userAgent.startsWith('Mozilla/5.0 ('), name);
        }
    });

    it('iPhone Safari gets the iOS hint', () => {
        assert.equal(hintFor('iphoneSafari'), 'ios');
    });

    it('iPhone Chrome (CriOS), Firefox (FxiOS) and Edge (EdgiOS) get it too: every iOS browser installs from the Share menu', () => {
        assert.equal(hintFor('iphoneChrome'), 'ios');
        assert.equal(hintFor('iphoneFirefox'), 'ios');
        assert.equal(hintFor('iphoneEdge'), 'ios');
    });

    it('an iPad in its default desktop mode (it calls itself a Mac) gets the iOS hint: the touch screen gives it away', () => {
        assert.equal(hintFor('ipadDesktopSafari'), 'ios');
    });

    it('an iPad that asked for the mobile site gets it by its own user agent', () => {
        assert.equal(hintFor('ipadMobileSafari'), 'ios');
    });

    it('a real Mac (no touch points) does not, in Safari or in Chrome', () => {
        assert.equal(hintFor('macSafari'), null);
        assert.equal(hintFor('macChrome'), null);
    });

    it('Firefox on an Android phone or tablet gets the Firefox Android hint', () => {
        assert.equal(hintFor('firefoxAndroid'), 'firefox-android');
        assert.equal(hintFor('firefoxAndroidTablet'), 'firefox-android');
    });

    it('Chrome and Samsung Internet on Android get nothing: they fire beforeinstallprompt', () => {
        assert.equal(hintFor('chromeAndroid'), null);
        assert.equal(hintFor('samsungInternet'), null);
    });

    it('desktop Chrome and desktop Firefox get nothing, with or without a touch screen', () => {
        assert.equal(hintFor('desktopChromeWindows'), null);
        assert.equal(hintFor('desktopChromeWindowsTouch'), null);
        assert.equal(hintFor('desktopFirefoxWindows'), null);
        assert.equal(hintFor('desktopFirefoxLinux'), null);
    });

    it('the three hints are distinct values, and they are the only answers over every browser above', () => {
        assert.equal(HINT_IOS, 'ios');
        assert.equal(HINT_IOS_IN_APP, 'ios-in-app');
        assert.equal(HINT_FIREFOX_ANDROID, 'firefox-android');
        const answers = new Set(Object.keys(BROWSERS).map((name) => hintFor(name)));
        assert.deepEqual([...answers].map(String).sort(), ['firefox-android', 'ios', 'ios-in-app', 'null']);
    });

    it('is not fooled by a Mac-looking device that has one touch point (the iPad reports five)', () => {
        const mac = BROWSERS.ipadDesktopSafari;
        assert.equal(detectInstallHint({ ...mac, maxTouchPoints: 0 }), null);
        assert.equal(detectInstallHint({ ...mac, maxTouchPoints: 1 }), null);
        assert.equal(detectInstallHint({ ...mac, maxTouchPoints: 2 }), 'ios');
        assert.equal(detectInstallHint({ ...mac, maxTouchPoints: 5 }), 'ios');
    });

    it('a Mac-looking user agent alone is enough when the platform is missing, and the platform alone when the user agent is', () => {
        assert.equal(detectInstallHint({ userAgent: BROWSERS.ipadDesktopSafari.userAgent, maxTouchPoints: 5 }), 'ios');
        assert.equal(detectInstallHint({ platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
        assert.equal(detectInstallHint({ platform: 'Win32', userAgent: BROWSERS.desktopChromeWindows.userAgent, maxTouchPoints: 5 }), null);
    });

    it('Firefox needs Android: Firefox for iOS is iOS, and "Android" without Firefox is not Firefox', () => {
        assert.equal(hintFor('iphoneFirefox'), 'ios');
        assert.equal(hintFor('desktopFirefoxLinux'), null);
        assert.equal(hintFor('chromeAndroid'), null);
    });
});

describe('detectInstallHint: when nothing is shown although the browser qualifies', () => {
    const qualifying = ['iphoneSafari', 'iphoneChrome', 'ipadDesktopSafari', 'firefoxAndroid'];

    it('the app already runs installed (standalone): nothing, for every browser that would get a hint', () => {
        for (const name of qualifying) {
            assert.notEqual(hintFor(name), null, `${name} qualifies without the flag`);
            assert.equal(hintFor(name, { standalone: true }), null, name);
        }
        assert.equal(hintFor('iphoneHomeScreenApp', { standalone: true }), null);
    });

    it('the install button is available (beforeinstallprompt fired): nothing', () => {
        for (const name of qualifying) assert.equal(hintFor(name, { beforeInstallPromptFired: true }), null, name);
    });

    it('both at once is still nothing, and the flags do not turn a browser without a hint into one that has it', () => {
        assert.equal(hintFor('iphoneSafari', { standalone: true, beforeInstallPromptFired: true }), null);
        assert.equal(hintFor('chromeAndroid', { standalone: false, beforeInstallPromptFired: false }), null);
        assert.equal(hintFor('desktopChromeWindows', { standalone: true }), null);
    });

    it('a flag that is left out counts as "no", so a browser that qualifies gets its hint', () => {
        const { userAgent, platform, maxTouchPoints } = BROWSERS.iphoneSafari;
        assert.equal(detectInstallHint({ userAgent, platform, maxTouchPoints }), 'ios');
        assert.equal(detectInstallHint({ userAgent, platform, maxTouchPoints, standalone: undefined, beforeInstallPromptFired: undefined }), 'ios');
    });
});

describe('detectInstallHint: odd input never throws and never shows a hint', () => {
    it('no argument, null, and values that are not an object', () => {
        for (const value of [undefined, null, '', 'iPhone', 0, 5, true, [], () => {}]) {
            assert.equal(detectInstallHint(value), null, String(value));
        }
        assert.equal(detectInstallHint(), null);
        assert.equal(detectInstallHint({}), null);
    });

    it('fields of the wrong type count as missing', () => {
        assert.equal(detectInstallHint({ userAgent: 123, platform: {}, maxTouchPoints: 'many' }), null);
        assert.equal(detectInstallHint({ userAgent: null, platform: null, maxTouchPoints: null }), null);
        assert.equal(detectInstallHint({ userAgent: ['iPhone'], platform: ['MacIntel'], maxTouchPoints: [5] }), null);
        assert.equal(detectInstallHint({ platform: 'MacIntel', maxTouchPoints: NaN }), null);
        assert.equal(detectInstallHint({ platform: 'MacIntel', maxTouchPoints: undefined }), null);
    });

    it('does not change what it is given', () => {
        const input = Object.freeze({ ...BROWSERS.iphoneSafari, standalone: false, beforeInstallPromptFired: false });
        assert.equal(detectInstallHint(input), 'ios');
        assert.deepEqual(Object.keys(input).sort(), ['beforeInstallPromptFired', 'maxTouchPoints', 'platform', 'standalone', 'userAgent']);
    });

    it('decides from its argument only: the same input gives the same answer, whatever `navigator` is in this runtime', () => {
        const first = hintFor('iphoneSafari');
        const second = hintFor('iphoneSafari');
        assert.equal(first, second);
        assert.equal(first, 'ios');
        assert.equal(hintFor('desktopChromeWindows'), null);
    });
});

describe('detectInstallHint: an iPhone or iPad inside another app\'s built-in browser', () => {
    const IPHONE_SAFARI = BROWSERS.iphoneSafari;
    const IPAD_DESKTOP_SAFARI = BROWSERS.ipadDesktopSafari;
    const withToken = (browser, token) => ({ ...browser, userAgent: `${browser.userAgent} ${token}` });

    /** The known tokens, each as the user agents write it. */
    const TOKENS = {
        Instagram: 'Instagram 330.0.0.20.113',
        FBAN: '[FBAN/FBIOS;FBAV/460.0.0.35.108]',
        FBAV: 'FBAV/460.0.0.35.108',
        FB_IAB: 'FB_IAB/FB4A;FBAV/460.0.0.35.108',
        FBIOS: 'FBIOS',
        'Line/': 'Line/14.7.0',
        Twitter: 'Twitter for iPhone/10.34',
        Snapchat: 'Snapchat/12.99.0.30',
        MicroMessenger: 'MicroMessenger/8.0.49(0x18003133)',
        TikTok: 'TikTok/32.5.0',
        musical_ly: 'musical_ly_32.5.0',
        BytedanceWebview: 'BytedanceWebview/d8a21c6',
        WhatsApp: 'WhatsApp/2.24.10',
        Telegram: 'Telegram-iOS/10.12'
    };

    it('the table says what every user agent above must give', () => {
        assert.deepEqual(Object.keys(EXPECTED).sort(), Object.keys(BROWSERS).sort(), 'one expectation per browser');
        for (const [name, expected] of Object.entries(EXPECTED)) assert.equal(hintFor(name), expected, name);
    });

    it('real Safari and the full iOS browsers (Chrome, Firefox, Edge, Opera) keep the normal hint: they carry Safari/', () => {
        for (const name of ['iphoneSafari', 'iphoneChrome', 'iphoneFirefox', 'iphoneEdge', 'iphoneOpera']) {
            assert.match(BROWSERS[name].userAgent, /\bSafari\//, `${name} has Safari/`);
            assert.equal(hintFor(name), 'ios', name);
        }
    });

    it('Instagram, Facebook, Line, WeChat, TikTok and Snapchat on an iPhone get the in-app hint', () => {
        for (const name of ['iphoneInstagram', 'iphoneFacebook', 'iphoneLine', 'iphoneWeChat', 'iphoneTikTok', 'iphoneSnapchat']) {
            assert.equal(hintFor(name), 'ios-in-app', name);
        }
    });

    it('a user agent with no Safari/ token (what Telegram and other WebViews send) gets the in-app hint', () => {
        for (const name of ['iphoneTelegramLike', 'iphoneBareWebView', 'ipodTouchNoSafariToken']) {
            assert.doesNotMatch(BROWSERS[name].userAgent, /\bSafari\//, `${name} has no Safari/`);
            assert.equal(hintFor(name), 'ios-in-app', name);
        }
    });

    it('every known token on its own is enough, even with a Safari/ token in the same user agent', () => {
        for (const [name, token] of Object.entries(TOKENS)) {
            assert.equal(detectInstallHint(withToken(IPHONE_SAFARI, token)), 'ios-in-app', `iPhone + ${name}`);
            assert.equal(detectInstallHint(withToken(IPAD_DESKTOP_SAFARI, token)), 'ios-in-app', `iPad desktop mode + ${name}`);
            assert.equal(detectInstallHint(withToken(BROWSERS.ipadMobileSafari, token)), 'ios-in-app', `iPad + ${name}`);
        }
        assert.equal(Object.keys(TOKENS).length, 14, 'the whole list of the task is covered');
        assert.equal(hintFor('iphoneSnapchat'), 'ios-in-app', 'Snapchat carries "like Safari/", the token list is what catches it');
    });

    it('a token is a whole token and is case-sensitive: look-alikes keep the normal hint', () => {
        const lookAlikes = [
            'MyInstagramApp/1.0', 'Instagrams', 'FBANX', 'XFBAV/1', 'XFB_IAB', 'FBIOSX', 'Online/1.0', 'Linear/2', 'Line 14.7.0', 'Line;', 'Twittering',
            'Snapchatter', 'MicroMessengers', 'TikToks', 'XBytedanceWebview', 'WhatsAppish', 'Telegrams',
            'instagram', 'fban', 'line/1', 'twitter', 'snapchat', 'micromessenger', 'tiktok', 'whatsapp', 'telegram', 'MUSICAL_LY'
        ];
        for (const token of lookAlikes) {
            assert.equal(detectInstallHint(withToken(IPHONE_SAFARI, token)), 'ios', `iPhone + ${token}`);
            assert.equal(detectInstallHint(withToken(IPAD_DESKTOP_SAFARI, token)), 'ios', `iPad desktop mode + ${token}`);
        }
    });

    it('an iPad in desktop mode is told only by a known token: the Safari/ rule never applies to it', () => {
        assert.equal(hintFor('ipadDesktopNoSafariToken'), 'ios', 'no Safari/ and no token: the normal hint');
        assert.equal(hintFor('ipadDesktopFacebook'), 'ios-in-app', 'a token: in-app');
        assert.equal(hintFor('ipadDesktopSafari'), 'ios');
    });

    it('the Safari/ rule is for iPhone and iPod user agents: an iPad user agent without it keeps the normal hint', () => {
        assert.equal(hintFor('ipadMobileNoSafariToken'), 'ios');
        assert.equal(hintFor('ipadMobileSafari'), 'ios');
        assert.equal(hintFor('ipodTouchNoSafariToken'), 'ios-in-app');
    });

    it('when it cannot tell, it gives the normal iOS hint, never the in-app one', () => {
        // iOS recognised from the touch screen alone: there is no user agent to read.
        assert.equal(detectInstallHint({ platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
        assert.equal(detectInstallHint({ userAgent: '', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
        assert.equal(detectInstallHint({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
        // An iPhone user agent that is just "iPhone" and carries Safari/ is a browser.
        assert.equal(detectInstallHint({ userAgent: 'iPhone Safari/604.1' }), 'ios');
        // A user agent that mentions Safari/ anywhere is not proven to be a WebView.
        assert.equal(detectInstallHint({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604.1' }), 'ios');
    });

    it('an iPhone user agent with no Safari/ is in-app even when it is nothing but "iPhone"', () => {
        assert.equal(detectInstallHint({ userAgent: 'iPhone' }), 'ios-in-app');
        assert.equal(detectInstallHint({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' }), 'ios-in-app');
    });

    it('the installed iPhone app and a bare WebView send the same user agent: standalone is what separates them', () => {
        assert.equal(BROWSERS.iphoneHomeScreenApp.userAgent.replace('15E148', ''), BROWSERS.iphoneBareWebView.userAgent.replace('15E148', ''));
        assert.equal(hintFor('iphoneHomeScreenApp', { standalone: true }), null, 'installed: nothing');
        assert.equal(hintFor('iphoneBareWebView', { standalone: true }), null);
    });

    it('standalone or an available install button beat the in-app answer, for every in-app user agent', () => {
        const inApp = Object.keys(EXPECTED).filter((name) => EXPECTED[name] === 'ios-in-app');
        assert.ok(inApp.length >= 10, `${inApp.length} in-app user agents`);
        for (const name of inApp) {
            assert.equal(hintFor(name, { standalone: true }), null, `${name} standalone`);
            assert.equal(hintFor(name, { beforeInstallPromptFired: true }), null, `${name} prompt fired`);
            assert.equal(hintFor(name, { standalone: true, beforeInstallPromptFired: true }), null, `${name} both`);
        }
        for (const [token, text] of Object.entries(TOKENS)) {
            assert.equal(detectInstallHint({ ...withToken(IPAD_DESKTOP_SAFARI, text), standalone: true }), null, `iPad + ${token} standalone`);
            assert.equal(detectInstallHint({ ...withToken(IPAD_DESKTOP_SAFARI, text), beforeInstallPromptFired: true }), null, `iPad + ${token} prompt`);
        }
    });

    it('nothing outside iOS changes: an app token on Android or on a Mac gives what the system gave before', () => {
        assert.equal(hintFor('androidInstagram'), null);
        assert.equal(hintFor('macSafariWithAppToken'), null);
        assert.equal(hintFor('chromeAndroid'), null);
        assert.equal(hintFor('firefoxAndroid'), 'firefox-android');
        assert.equal(detectInstallHint({ ...BROWSERS.firefoxAndroid, userAgent: `${BROWSERS.firefoxAndroid.userAgent} Instagram 330.0` }), 'firefox-android');
        assert.equal(hintFor('desktopChromeWindows'), null);
        assert.equal(hintFor('macSafari'), null);
        assert.equal(hintFor('macChrome'), null);
    });

    it('odd or missing fields never throw, and a browser that carries Safari/ never turns into the in-app hint', () => {
        const odd = [undefined, null, 0, 5, NaN, true, false, [], ['Instagram'], {}, { toString: () => 'Instagram' }, () => 'Instagram', Symbol('Instagram')];
        for (const value of odd) {
            for (const field of ['userAgent', 'platform', 'maxTouchPoints', 'standalone', 'beforeInstallPromptFired']) {
                let answer;
                assert.doesNotThrow(() => {
                    answer = detectInstallHint({ ...IPHONE_SAFARI, [field]: value });
                }, `${field}: ${String(typeof value)}`);
                assert.ok([null, 'ios'].includes(answer), `${field}: ${String(answer)}`);
            }
            assert.notEqual(detectInstallHint({ userAgent: value, platform: 'MacIntel', maxTouchPoints: 5 }), 'ios-in-app');
        }
        // A user agent that is not text is not read: it is not an in-app one.
        assert.equal(detectInstallHint({ userAgent: ['Instagram', 'iPhone'], platform: 'iPhone', maxTouchPoints: 5 }), null);
        assert.equal(detectInstallHint({ userAgent: { toString: () => 'iPhone Instagram' } }), null);
        assert.equal(detectInstallHint({ userAgent: 'x'.repeat(300000) + ' iPhone' }), 'ios-in-app');
    });
});

describe('the dismissal key', () => {
    it('is a spy_ key of its own: it is not one of the keys that hold a match, the names, the language or the settings', () => {
        assert.equal(INSTALL_HINT_DISMISSED_KEY, 'spy_install_hint_dismissed');
        for (const other of ['spy_full_state_master', 'spy_saved_player_names', 'spy_setup_settings', 'spy_recent_words', 'spy_lang', 'spy_selected_theme', 'spy_muted', 'spy_custom_words']) {
            assert.notEqual(INSTALL_HINT_DISMISSED_KEY, other);
        }
    });
});

describe('the hint in index.html and in the catalogs', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const all = [...elements(parseHtml(html))];
    const byId = (id) => all.find((el) => el.attrs.id === id);
    const classesOf = (el) => (el.attrs.class || '').split(/\s+/);

    it('the box, its three lines and its close button are in the page', () => {
        for (const id of ['install-hint', 'install-hint-ios', 'install-hint-ios-in-app', 'install-hint-firefox-android', 'btn-install-hint-close']) {
            assert.ok(byId(id), `#${id} is missing`);
        }
        const lines = all.filter((el) => classesOf(el).includes('install-hint-text'));
        assert.deepEqual(
            lines.map((el) => el.attrs.id).sort(),
            ['install-hint-firefox-android', 'install-hint-ios', 'install-hint-ios-in-app'],
            'three lines, one per hint'
        );
        assert.ok(lines.every((el) => el.parent === byId('install-hint')), 'each line is a direct child of the box');
    });

    it('it sits inside the welcome screen, so no other screen can show it, and not in the header that every screen has', () => {
        const box = byId('install-hint');
        assert.equal(closest(box, (n) => n.attrs.id === 'screen-welcome')?.attrs.id, 'screen-welcome');
        assert.equal(closest(box, (n) => n.tag === 'header'), null);
        assert.equal(closest(box, (n) => n.attrs.id === 'main-content-root')?.tag, 'main');
        const floating = ['btn-panic-open', 'btn-install-app', 'panic-shield'];
        for (const id of floating) assert.ok(!closest(box, (n) => n.attrs.id === id), `inside #${id}`);
    });

    it('everything starts hidden, so a browser that gets no hint never sees one (and no layout jump)', () => {
        for (const id of ['install-hint', 'install-hint-ios', 'install-hint-ios-in-app', 'install-hint-firefox-android']) {
            assert.ok(classesOf(byId(id)).includes('hidden'), `#${id} must carry the hidden class in index.html`);
        }
    });

    it('each line is translated by its own key and the Persian default equals the catalog', () => {
        const ios = byId('install-hint-ios');
        const firefox = byId('install-hint-firefox-android');
        assert.equal(ios.attrs['data-i18n'], 'install.hint.ios');
        assert.equal(firefox.attrs['data-i18n'], 'install.hint.firefoxAndroid');
        assert.equal(normalizeText(innerText(ios)), normalizeText(fa['install.hint.ios']));
        assert.equal(normalizeText(innerText(firefox)), normalizeText(fa['install.hint.firefoxAndroid']));
        const inApp = byId('install-hint-ios-in-app');
        assert.equal(inApp.attrs['data-i18n'], 'install.hint.iosInApp');
        assert.equal(normalizeText(innerText(inApp)), normalizeText(fa['install.hint.iosInApp']));
        assert.equal(new Set([ios, firefox, inApp].map((el) => el.attrs['data-i18n'])).size, 3, 'three different keys');
    });

    it('the close button is a typed button with an accessible name from the catalog', () => {
        const close = byId('btn-install-hint-close');
        assert.equal(close.tag, 'button');
        assert.equal(close.attrs.type, 'button');
        assert.equal(close.attrs['data-i18n-attr'], 'aria-label:install.hint.close.aria');
        assert.equal(normalizeText(close.attrs['aria-label']), normalizeText(fa['install.hint.close.aria']));
        assert.ok(normalizeText(close.attrs['aria-label']).length > 3);
    });

    it('both catalogs have the four texts: short, plain and in their own language', () => {
        const keys = ['install.hint.ios', 'install.hint.iosInApp', 'install.hint.firefoxAndroid', 'install.hint.close.aria'];
        for (const key of keys) {
            for (const [lang, catalog] of [['fa', fa], ['en', en]]) {
                assert.equal(typeof catalog[key], 'string', `${lang}: ${key}`);
                assert.ok(catalog[key].trim().length > 0, `${lang}: ${key} is empty`);
                assert.ok(catalog[key].length <= 60, `${lang}: ${key} is not short`);
            }
            assert.doesNotMatch(en[key], /[\u0600-\u06FF]/, `en: ${key} has a Persian letter`);
            assert.match(fa[key], /[\u0600-\u06FF]/, `fa: ${key} is not Persian`);
        }
    });

    it('the English texts are the agreed wording', () => {
        assert.equal(en['install.hint.ios'], 'Share, then Add to Home Screen');
        assert.equal(en['install.hint.firefoxAndroid'], 'Menu, then Install / Add to Home screen');
        assert.equal(en['install.hint.iosInApp'], 'To install, open this page in Safari');
        assert.equal(fa['install.hint.iosInApp'], 'برای نصب، این صفحه را در Safari باز کنید');
    });

    it('the in-app text names the browser by its real name in both languages: Safari', () => {
        assert.match(fa['install.hint.iosInApp'], /\bSafari\b/);
        assert.match(en['install.hint.iosInApp'], /\bSafari\b/);
        assert.doesNotMatch(en['install.hint.iosInApp'], /Home Screen/i, 'it is not the menu hint');
    });
});
