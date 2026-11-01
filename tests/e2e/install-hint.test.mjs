/**
 * End-to-end test of the install hint on the welcome screen, against the PRODUCTION build in a real Chromium at
 * 360x740, with the user agent (and, where needed, `navigator.platform`, `navigator.standalone` and the
 * display-mode media query) of other browsers emulated. The decision itself is covered on its own in
 * tests/unit/install-hint.test.mjs; this file covers what only a browser can show: the hint appears for iOS and
 * Firefox Android only, the close button hides it and the choice survives a reload, it never shows during a
 * match, a blocked storage does not break it, and it fits (44px target, one line, both directions, 8 themes,
 * clear of the floating buttons).
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { INSTALL_HINT_DISMISSED_KEY } from '../../js/platform/installHint.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { PERSIAN_LETTER, recordScreen } from './helpers/record.mjs';

const AGENTS = {
    iphoneSafari:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    iphoneChrome:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
    ipadDesktopMode:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    iphoneFirefox:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
    iphoneEdge:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/125.2535.60 Mobile/15E148 Safari/605.1.15',
    // Built-in browsers of other apps (the shapes these apps send; not checked on a real device).
    iphoneInstagram:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 330.0.0.20.113 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 575238203)',
    iphoneFacebook:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/460.0.0.35.108;FBBV/579283000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]',
    // An iPad in desktop mode with no Safari/ and no app token: not provably a WebView, so the normal hint.
    ipadDesktopNoSafariToken:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
    iphoneBareWebView:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90',
    iphoneSnapchat:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.99.0.30 (like Safari/8617.1.17.10.9, panda)',
    ipadDesktopFacebook:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) [FBAN/FBIOS;FBAV/460.0.0.35.108;FBDV/iPad13,8;FBMD/iPad;FBSN/iOS;FBSV/17.5]',
    firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
    chromeAndroid:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    samsungInternet:
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
    desktopChrome:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
};

const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];

/** What an iPad in its default "desktop website" mode says about itself, besides the user agent. */
const IPAD_AS_MAC = `
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
`;

let app;
let browser;
let baseUrl;

before(async () => {
    app = await startApp();
    ({ browser, baseUrl } = app);
});

after(async () => {
    await app?.stop();
});

/**
 * Open the app as `userAgent` on a fresh phone-sized page and run `fn(page, context)`. `lang` is stored before the
 * page loads, `script` runs before the page's own scripts, `viewport` replaces the phone. Fails on any script error.
 */
async function withPage(fn, { userAgent, lang, script, viewport = PHONE } = {}) {
    const context = await browser.newContext({ viewport, userAgent, hasTouch: true, isMobile: true });
    const { page, problems } = await newPage(context);
    try {
        if (lang) await context.addInitScript((value) => localStorage.setItem('spy_lang', value), lang);
        if (script) await context.addInitScript(script);
        await open(page);
        await fn(page, context);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

/** Load (or reload) the app and wait until its start-up has run: the build line is written at the end of it. */
async function open(page, reload = false) {
    if (reload) await page.reload();
    else await page.goto(baseUrl);
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    await page.waitForFunction(() => document.getElementById('build-info').textContent.trim() !== '');
}

const hintShown = (page) => page.locator('#install-hint').isVisible();
const LINE_IDS = {
    ios: 'install-hint-ios',
    inApp: 'install-hint-ios-in-app',
    firefox: 'install-hint-firefox-android'
};
const linesShown = async (page) => ({
    ios: await page.locator(`#${LINE_IDS.ios}`).isVisible(),
    inApp: await page.locator(`#${LINE_IDS.inApp}`).isVisible(),
    firefox: await page.locator(`#${LINE_IDS.firefox}`).isVisible()
});
/** The ids of the hint lines that are on screen: at most one. */
const visibleLineIds = (page) =>
    page.evaluate(() => [...document.querySelectorAll('.install-hint-text')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.id));

/** The iPhone browsers the dismissal, focus, match, layout and theme checks run for: a real browser and an app's WebView. */
const IOS_VARIANTS = { 'iPhone Safari': AGENTS.iphoneSafari, 'iPhone Instagram': AGENTS.iphoneInstagram };
const box = (page, selector) => page.locator(selector).boundingBox();
const storedFlag = (page) => page.evaluate((key) => localStorage.getItem(key), INSTALL_HINT_DISMISSED_KEY);

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('install hint (production build)', () => {
    it('iPhone Safari, Persian: the iOS line appears with a named 44px close button, on one line, close button on the inline-end side', async () => {
        await withPage(
            async (page) => {
                assert.equal(await hintShown(page), true);
                assert.deepEqual(await linesShown(page), { ios: true, inApp: false, firefox: false });
                assert.equal((await page.locator('#install-hint-ios').innerText()).trim(), fa['install.hint.ios']);

                const close = page.getByRole('button', { name: fa['install.hint.close.aria'] });
                assert.equal(await close.count(), 1, 'the close button is found by its accessible name');
                const closeBox = await box(page, '#btn-install-hint-close');
                assert.ok(closeBox.width >= 44 && closeBox.height >= 44, `${closeBox.width}x${closeBox.height}`);

                const hintBox = await box(page, '#install-hint');
                assert.ok(hintBox.height < 60, `one line of text, not two (box is ${hintBox.height}px high)`);
                assert.ok(hintBox.x >= 0 && hintBox.x + hintBox.width <= PHONE.width, 'inside the screen');
                const textBox = await box(page, '#install-hint-ios');
                assert.ok(closeBox.x < textBox.x, 'Persian reads right to left: the close button is on the left');
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width, 'no sideways scroll');
            },
            { userAgent: AGENTS.iphoneSafari }
        );
    });

    it('iPhone Safari, English: English text and name, no Persian letter, close button on the right', async () => {
        await withPage(
            async (page) => {
                assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
                assert.deepEqual(await linesShown(page), { ios: true, inApp: false, firefox: false });
                const text = (await page.locator('#install-hint-ios').innerText()).trim();
                const name = await page.locator('#btn-install-hint-close').getAttribute('aria-label');
                assert.equal(text, en['install.hint.ios']);
                assert.equal(name, en['install.hint.close.aria']);
                assert.doesNotMatch(`${text} ${name}`, PERSIAN_LETTER);
                assert.equal(await page.getByRole('button', { name: en['install.hint.close.aria'] }).count(), 1);

                const hintBox = await box(page, '#install-hint');
                assert.ok(hintBox.height < 60, `one line (${hintBox.height}px)`);
                const textBox = await box(page, '#install-hint-ios');
                assert.ok((await box(page, '#btn-install-hint-close')).x > textBox.x, 'the close button is on the right');
            },
            { userAgent: AGENTS.iphoneSafari, lang: 'en' }
        );
    });

    it('other iOS browsers and an iPad in desktop mode get the iOS line too', async () => {
        await withPage(async (page) => assert.deepEqual(await linesShown(page), { ios: true, inApp: false, firefox: false }), { userAgent: AGENTS.iphoneChrome });
        await withPage(async (page) => assert.deepEqual(await linesShown(page), { ios: true, inApp: false, firefox: false }), {
            userAgent: AGENTS.ipadDesktopMode,
            script: IPAD_AS_MAC
        });
    });

    it('a Mac with the same user agent but no touch screen gets nothing', async () => {
        await withPage(async (page) => assert.equal(await hintShown(page), false), {
            userAgent: AGENTS.ipadDesktopMode,
            script: `Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });`
        });
    });

    it('Firefox on Android gets its own line, in both languages', async () => {
        await withPage(
            async (page) => {
                assert.deepEqual(await linesShown(page), { ios: false, inApp: false, firefox: true });
                assert.equal((await page.locator('#install-hint-firefox-android').innerText()).trim(), fa['install.hint.firefoxAndroid']);
                assert.ok((await box(page, '#install-hint')).height < 60, 'one line');
            },
            { userAgent: AGENTS.firefoxAndroid }
        );
        await withPage(
            async (page) => {
                assert.deepEqual(await linesShown(page), { ios: false, inApp: false, firefox: true });
                const text = (await page.locator('#install-hint-firefox-android').innerText()).trim();
                assert.equal(text, en['install.hint.firefoxAndroid']);
                assert.doesNotMatch(text, PERSIAN_LETTER);
                assert.ok((await box(page, '#install-hint')).height < 60, 'one line');
            },
            { userAgent: AGENTS.firefoxAndroid, lang: 'en' }
        );
    });

    it('an iPhone inside Instagram, Persian: the "open in Safari" line appears, on one line, and the iOS menu line does not', async () => {
        await withPage(
            async (page) => {
                assert.equal(await hintShown(page), true);
                assert.deepEqual(await linesShown(page), { ios: false, inApp: true, firefox: false });
                assert.equal((await page.locator(`#${LINE_IDS.inApp}`).innerText()).trim(), fa['install.hint.iosInApp']);
                assert.match(fa['install.hint.iosInApp'], /Safari/);

                const hintBox = await box(page, '#install-hint');
                assert.ok(hintBox.height < 60, `one line of text, not two (box is ${hintBox.height}px high)`);
                const lineBox = await box(page, `#${LINE_IDS.inApp}`);
                const closeBox = await box(page, '#btn-install-hint-close');
                assert.ok(closeBox.width >= 44 && closeBox.height >= 44, `${closeBox.width}x${closeBox.height}`);
                assert.ok(closeBox.x < lineBox.x, 'Persian reads right to left: the close button is on the left');
                assert.equal(await page.getByRole('button', { name: fa['install.hint.close.aria'] }).count(), 1);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width, 'no sideways scroll');
            },
            { userAgent: AGENTS.iphoneInstagram }
        );
    });

    it('an iPhone inside Instagram, English: "To install, open this page in Safari", on one line, no Persian letter', async () => {
        await withPage(
            async (page) => {
                assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
                assert.deepEqual(await linesShown(page), { ios: false, inApp: true, firefox: false });
                const text = (await page.locator(`#${LINE_IDS.inApp}`).innerText()).trim();
                assert.equal(text, en['install.hint.iosInApp']);
                assert.equal(text, 'To install, open this page in Safari');
                assert.doesNotMatch(text, PERSIAN_LETTER);
                assert.ok((await box(page, '#install-hint')).height < 60, 'one line');
                assert.equal(await page.getByRole('button', { name: en['install.hint.close.aria'] }).count(), 1);
                assert.ok((await box(page, '#btn-install-hint-close')).x > (await box(page, `#${LINE_IDS.inApp}`)).x, 'close on the right');
            },
            { userAgent: AGENTS.iphoneInstagram, lang: 'en' }
        );
    });

    it('other app browsers get the same line: Facebook, a bare WebView with no Safari/, Snapchat, and an iPad in desktop mode with an app token', async () => {
        for (const name of ['iphoneFacebook', 'iphoneBareWebView', 'iphoneSnapchat']) {
            await withPage(async (page) => assert.deepEqual(await visibleLineIds(page), [LINE_IDS.inApp], name), { userAgent: AGENTS[name] });
        }
        await withPage(async (page) => assert.deepEqual(await visibleLineIds(page), [LINE_IDS.inApp], 'iPad in desktop mode'), {
            userAgent: AGENTS.ipadDesktopFacebook,
            script: IPAD_AS_MAC
        });
    });

    it('real browsers on iPhone keep the old iOS line: Safari, Chrome, Firefox and Edge, and an iPad in desktop mode', async () => {
        for (const name of ['iphoneSafari', 'iphoneChrome', 'iphoneFirefox', 'iphoneEdge']) {
            await withPage(async (page) => assert.deepEqual(await visibleLineIds(page), [LINE_IDS.ios], name), { userAgent: AGENTS[name] });
        }
        await withPage(async (page) => assert.deepEqual(await visibleLineIds(page), [LINE_IDS.ios], 'iPad in desktop mode'), {
            userAgent: AGENTS.ipadDesktopMode,
            script: IPAD_AS_MAC
        });
        // The Safari/ rule is not applied to an iPad in desktop mode: no Safari/ and no token is not proof of a WebView.
        await withPage(async (page) => assert.deepEqual(await visibleLineIds(page), [LINE_IDS.ios], 'iPad in desktop mode, no Safari/'), {
            userAgent: AGENTS.ipadDesktopNoSafariToken,
            script: IPAD_AS_MAC
        });
    });

    it('exactly one line is on screen for a browser that has a hint, none for one that has not', async () => {
        const wanted = {
            iphoneSafari: [LINE_IDS.ios],
            iphoneInstagram: [LINE_IDS.inApp],
            iphoneBareWebView: [LINE_IDS.inApp],
            firefoxAndroid: [LINE_IDS.firefox],
            chromeAndroid: [],
            desktopChrome: []
        };
        for (const [name, ids] of Object.entries(wanted)) {
            for (const lang of ['fa', 'en']) {
                await withPage(async (page) => assert.deepEqual(await visibleLineIds(page), ids, `${name} ${lang}`), { userAgent: AGENTS[name], lang });
            }
        }
    });

    it('the language switch changes the text of the line that is showing and keeps it the only one', async () => {
        await withPage(
            async (page) => {
                assert.equal((await page.locator(`#${LINE_IDS.inApp}`).innerText()).trim(), fa['install.hint.iosInApp']);
                await page.click('#btn-lang-en');
                assert.deepEqual(await visibleLineIds(page), [LINE_IDS.inApp]);
                assert.equal((await page.locator(`#${LINE_IDS.inApp}`).innerText()).trim(), en['install.hint.iosInApp']);
                assert.ok((await box(page, '#install-hint')).height < 60, 'still one line in English');
                await page.click('#btn-lang-fa');
                assert.equal((await page.locator(`#${LINE_IDS.inApp}`).innerText()).trim(), fa['install.hint.iosInApp']);
            },
            { userAgent: AGENTS.iphoneInstagram }
        );
    });

    it('nothing is shown inside an app browser when the app already runs installed or the install button is there', async () => {
        await withPage(async (page) => assert.equal(await hintShown(page), false, 'navigator.standalone'), {
            userAgent: AGENTS.iphoneInstagram,
            script: `Object.defineProperty(navigator, 'standalone', { get: () => true });`
        });
        await withPage(
            async (page) => {
                assert.deepEqual(await visibleLineIds(page), [LINE_IDS.inApp]);
                await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
                assert.equal(await page.locator('#btn-install-app').isVisible(), true);
                assert.deepEqual(await visibleLineIds(page), [], 'never both');
            },
            { userAgent: AGENTS.iphoneInstagram }
        );
    });

    it('the browsers that have their own install button, and the desktop ones, get nothing', async () => {
        for (const name of ['chromeAndroid', 'samsungInternet', 'desktopChrome', 'desktopFirefox']) {
            await withPage(async (page) => assert.equal(await hintShown(page), false, name), { userAgent: AGENTS[name] });
        }
        // The Chromium that runs these tests, with its own user agent.
        await withPage(async (page) => assert.equal(await hintShown(page), false, 'plain Chromium'));
    });

    it('nothing is shown when the app already runs installed: navigator.standalone (iOS) or the standalone display mode', async () => {
        await withPage(async (page) => assert.equal(await hintShown(page), false, 'navigator.standalone'), {
            userAgent: AGENTS.iphoneSafari,
            script: `Object.defineProperty(navigator, 'standalone', { get: () => true });`
        });
        await withPage(async (page) => assert.equal(await hintShown(page), false, 'display-mode: standalone'), {
            userAgent: AGENTS.firefoxAndroid,
            script: `
                const realMatchMedia = window.matchMedia.bind(window);
                window.matchMedia = (query) => {
                    const real = realMatchMedia(query);
                    return /display-mode:\\s*standalone/.test(query) ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : real;
                };
            `
        });
        // The same two scripts are not what hides it: with navigator.standalone false the iPhone still gets its hint.
        await withPage(async (page) => assert.equal(await hintShown(page), true, 'not installed'), {
            userAgent: AGENTS.iphoneSafari,
            script: `Object.defineProperty(navigator, 'standalone', { get: () => false });`
        });
    });

    it('when the browser does fire beforeinstallprompt the install button takes over and the hint goes away', async () => {
        await withPage(
            async (page) => {
                assert.equal(await hintShown(page), true);
                assert.equal(await page.locator('#btn-install-app').isVisible(), false);
                await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
                assert.equal(await page.locator('#btn-install-app').isVisible(), true);
                assert.equal(await hintShown(page), false, 'never both');
            },
            { userAgent: AGENTS.iphoneSafari }
        );
    });

    for (const [label, userAgent] of Object.entries(IOS_VARIANTS)) it(`${label}: the close button hides the hint, the choice is remembered, and a reload keeps it hidden`, async () => {
        await withPage(
            async (page) => {
                assert.equal(await hintShown(page), true);
                assert.equal(await storedFlag(page), null, 'nothing is stored before the first close');

                await page.click('#btn-install-hint-close');
                assert.equal(await hintShown(page), false, 'hidden at once');
                assert.equal(await storedFlag(page), 'true', 'and remembered');
                assert.equal(await page.getByRole('button', { name: fa['install.hint.close.aria'] }).count(), 0, 'out of the accessibility tree too');

                await open(page, true);
                assert.equal(await hintShown(page), false, 'still hidden after a reload');
                await open(page, true);
                assert.equal(await hintShown(page), false, 'and after another one');

                // Not a vacuous pass: forgetting the choice brings the hint back, so the reload alone does not hide it.
                await page.evaluate((key) => localStorage.removeItem(key), INSTALL_HINT_DISMISSED_KEY);
                await open(page, true);
                assert.equal(await hintShown(page), true, 'back once the stored choice is gone');
            },
            { userAgent }
        );
    });

    it('the choice holds in the other language and for the other browser too (one stored flag)', async () => {
        await withPage(
            async (page) => {
                await page.click('#btn-install-hint-close');
                await page.click('#btn-lang-en');
                assert.equal(await hintShown(page), false);
                await open(page, true);
                assert.equal(await hintShown(page), false);
            },
            { userAgent: AGENTS.firefoxAndroid }
        );
    });

    for (const [label, userAgent] of Object.entries(IOS_VARIANTS)) it(`${label}: a keyboard user who closes it lands on the start button, not on <body>`, async () => {
        await withPage(
            async (page) => {
                await page.focus('#btn-install-hint-close');
                await page.keyboard.press('Enter');
                assert.equal(await hintShown(page), false);
                assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-nav-setup');
            },
            { userAgent }
        );
    });

    it('a storage that throws on read does not break it: the hint shows, and closing it still hides it', async () => {
        await withPage(
            async (page) => {
                assert.equal(await hintShown(page), true);
                await page.click('#btn-install-hint-close');
                assert.equal(await hintShown(page), false);
            },
            {
                userAgent: AGENTS.iphoneSafari,
                script: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });`
            }
        );
    });

    it('a storage that throws on write does not break it either: it is hidden for the visit, and shown again next time', async () => {
        await withPage(
            async (page) => {
                assert.equal(await hintShown(page), true);
                await page.click('#btn-install-hint-close');
                assert.equal(await hintShown(page), false, 'hidden for this visit');
                assert.equal(await storedFlag(page), null, 'nothing could be saved');
                await open(page, true);
                assert.equal(await hintShown(page), true, 'so it comes back');
            },
            {
                userAgent: AGENTS.iphoneSafari,
                script: `const realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === '${INSTALL_HINT_DISMISSED_KEY}') throw new DOMException('full', 'QuotaExceededError'); return realSetItem.call(this, key, value); };`
            }
        );
    });

    for (const [label, userAgent] of Object.entries(IOS_VARIANTS)) it(`${label}: it is on the welcome screen only: not on the setup screen and not during a match`, async () => {
        await withPage(
            async (page) => {
                assert.equal(await page.evaluate(() => !!document.getElementById('install-hint').closest('#screen-welcome')), true);
                assert.equal(await hintShown(page), true);

                await page.click('#btn-nav-setup');
                await page.waitForSelector('#screen-setup:not(.hidden)');
                assert.equal(await hintShown(page), false, 'setup');

                await page.click('#btn-start-match');
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                assert.equal(await hintShown(page), false, 'role reveal');
                assert.equal(await page.getByRole('button', { name: fa['install.hint.close.aria'] }).count(), 0);
            },
            { userAgent }
        );
    });

    for (const [label, userAgent] of Object.entries(IOS_VARIANTS)) it(`${label}: it keeps clear of the cover-mode and install buttons: phone and short phone, both directions, top and end of the page`, async () => {
        for (const lang of ['fa', 'en']) {
            for (const viewport of [PHONE, { width: 360, height: 520 }]) {
                await withPage(
                    async (page) => {
                        // The install button is never shown together with the hint; un-hide it only to measure where it would be.
                        await page.evaluate(() => document.getElementById('btn-install-app').classList.remove('hidden'));
                        for (const position of ['top', 'end']) {
                            await page.evaluate((where) => window.scrollTo(0, where === 'top' ? 0 : document.documentElement.scrollHeight), position);
                            const hint = await box(page, '#install-hint');
                            for (const button of ['#btn-panic-open', '#btn-install-app']) {
                                assert.equal(overlap(hint, await box(page, button)), false, `${lang} ${viewport.height}px ${position}: hint over ${button}`);
                            }
                        }
                    },
                    { userAgent, lang, viewport }
                );
            }
        }
    });

    for (const [label, userAgent] of Object.entries(IOS_VARIANTS)) it(`${label}: in every one of the 8 themes it follows the theme colours, keeps its size and stays inside the screen`, async () => {
        for (const lang of ['fa', 'en']) {
            await withPage(
                async (page) => {
                    for (const theme of THEMES) {
                        await page.selectOption('#theme-selector', theme);
                        const found = await page.evaluate(() => {
                            const colorOf = (value) => {
                                const probe = document.createElement('div');
                                document.body.appendChild(probe);
                                probe.style.color = value;
                                const color = getComputedStyle(probe).color;
                                probe.remove();
                                return color;
                            };
                            const line = [...document.querySelectorAll('.install-hint-text')].find((el) => getComputedStyle(el).display !== 'none');
                            return {
                                theme: document.body.dataset.theme,
                                text: getComputedStyle(line).color,
                                textWanted: colorOf('var(--text-primary)'),
                                close: getComputedStyle(document.getElementById('btn-install-hint-close')).color,
                                closeWanted: colorOf('var(--text-secondary)'),
                                scrollWidth: document.documentElement.scrollWidth
                            };
                        });
                        assert.equal(found.theme, theme);
                        assert.equal(found.text, found.textWanted, `${lang} ${theme}: text colour`);
                        assert.equal(found.close, found.closeWanted, `${lang} ${theme}: close colour`);
                        assert.equal(found.scrollWidth, PHONE.width, `${lang} ${theme}: no sideways scroll`);
                        const hint = await box(page, '#install-hint');
                        const close = await box(page, '#btn-install-hint-close');
                        assert.ok(hint.height >= 44 && hint.height < 60, `${lang} ${theme}: ${hint.height}px`);
                        assert.ok(close.width >= 44 && close.height >= 44, `${lang} ${theme}: close ${close.width}x${close.height}`);
                        assert.ok(hint.x >= 0 && hint.x + hint.width <= PHONE.width, `${lang} ${theme}: inside the screen`);
                    }
                },
                { userAgent, lang }
            );
        }
    });

    it('the screen recorder leaves every line of the hint out, so a shown hint does not change a recording of the welcome screen', async () => {
        let plain;
        await withPage(async (page) => {
            plain = await recordScreen(page);
        });
        for (const name of ['iphoneSafari', 'iphoneInstagram', 'firefoxAndroid']) {
            await withPage(
                async (page) => {
                    assert.equal(await hintShown(page), true, name);
                    assert.deepEqual(await recordScreen(page), plain, name);
                },
                { userAgent: AGENTS[name] }
            );
        }
    });

});
