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
    }
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

    it('the two hints are distinct values, and they are the only two answers over every browser above', () => {
        assert.equal(HINT_IOS, 'ios');
        assert.equal(HINT_FIREFOX_ANDROID, 'firefox-android');
        const answers = new Set(Object.keys(BROWSERS).map((name) => hintFor(name)));
        assert.deepEqual([...answers].map(String).sort(), ['firefox-android', 'ios', 'null']);
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

    it('the box, its two lines and its close button are in the page', () => {
        for (const id of ['install-hint', 'install-hint-ios', 'install-hint-firefox-android', 'btn-install-hint-close']) {
            assert.ok(byId(id), `#${id} is missing`);
        }
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
        for (const id of ['install-hint', 'install-hint-ios', 'install-hint-firefox-android']) {
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
    });

    it('the close button is a typed button with an accessible name from the catalog', () => {
        const close = byId('btn-install-hint-close');
        assert.equal(close.tag, 'button');
        assert.equal(close.attrs.type, 'button');
        assert.equal(close.attrs['data-i18n-attr'], 'aria-label:install.hint.close.aria');
        assert.equal(normalizeText(close.attrs['aria-label']), normalizeText(fa['install.hint.close.aria']));
        assert.ok(normalizeText(close.attrs['aria-label']).length > 3);
    });

    it('both catalogs have the three texts: short, plain and in their own language', () => {
        const keys = ['install.hint.ios', 'install.hint.firefoxAndroid', 'install.hint.close.aria'];
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
    });
});
