/**
 * End-to-end test of the build line on the welcome screen, in a real Chromium at 360x740:
 *  - on the PRODUCTION build it reads `v<package.json version> · <first 7 characters of VERSION in sw.js>`;
 *  - on the dev server (the source checkout, nothing stamped) it reads `dev`;
 *  - it is only on the welcome screen, reads left to right in both languages, looks like the credit line in all
 *    8 themes, fits at 360 px and never sits under the cover-mode or install buttons.
 * The line is hidden until a long press on the welcome title (tests/e2e/build-info-reveal.test.mjs covers that
 * gesture, with a real mouse, touch and pen). The tests here are about what the line says and how it looks, so
 * they show it with `showBuildLine` instead of pressing: a 6-second auto-hide must not race through 16 theme
 * switches, and a gesture that is tested elsewhere should not be repeated 30 times.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../scripts/serve.mjs';
import { PHONE, newPage, startApp } from './helpers/app.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
const SEP = ' · ';

let app;
let devServer;
let devBrowser;
let builtUrl;
let devUrl;

before(async () => {
    app = await startApp();
    builtUrl = app.baseUrl;
    devServer = await startServer(root, 0);
    devUrl = `http://localhost:${devServer.address().port}/`;
    devBrowser = await chromium.launch();
});

after(async () => {
    await devBrowser?.close();
    devServer?.close();
    await app?.stop();
});

/** Open `url` on a fresh phone-sized page (optionally in English), run `fn(page)`, and fail on any script error. */
async function withPage(browser, url, fn, { lang = 'fa', viewport = PHONE } = {}) {
    const context = await browser.newContext({ viewport });
    const { page, problems } = await newPage(context);
    try {
        if (lang !== 'fa') await page.addInitScript((value) => localStorage.setItem('spy_lang', value), lang);
        await page.goto(url);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const lineText = (page) => page.evaluate(() => document.getElementById('build-info').textContent);

/** Show the line the way the reveal does (the `hidden` class off), without the gesture and without the auto-hide timer. */
const showBuildLine = (page) => page.evaluate(() => document.getElementById('build-info').classList.remove('hidden'));

/** The `VERSION` the built service worker was stamped with, read the way the browser gets it. */
async function builtSwVersion() {
    const source = await (await fetch(`${builtUrl}sw.js`)).text();
    const version = source.match(/^const VERSION = '([^']*)';$/m)?.[1];
    assert.match(version ?? '', /^[0-9a-f]{12}$/, 'the built sw.js carries a 12-character hash');
    return version;
}

describe('build line, production build', () => {
    it('says v<package version> · <first 7 of the sw.js VERSION> in Persian and in English, hidden until it is revealed', async () => {
        const expected = `v${pkg.version}${SEP}${(await builtSwVersion()).slice(0, 7)}`;
        for (const lang of ['fa', 'en']) {
            await withPage(app.browser, builtUrl, async (page) => {
                assert.equal(await lineText(page), expected, `${lang}: the same text in both languages`);
                assert.equal(await page.isVisible('#build-info'), false, `${lang}: not visible until a long press on the title`);
                await showBuildLine(page);
                assert.ok(await page.isVisible('#build-info'), `${lang}: visible once revealed`);
            }, { lang });
        }
    });

    it('is language-neutral: left to right, no Persian letter, not translated by the page', async () => {
        for (const lang of ['fa', 'en']) {
            await withPage(app.browser, builtUrl, async (page) => {
                await showBuildLine(page);
                const info = await page.evaluate(() => {
                    const el = document.getElementById('build-info');
                    return { direction: getComputedStyle(el).direction, dir: el.getAttribute('dir'), translate: el.getAttribute('translate'), ariaHidden: el.getAttribute('aria-hidden'), htmlDir: document.documentElement.dir };
                });
                assert.equal(info.dir, 'ltr');
                assert.equal(info.direction, 'ltr', `${lang}: reads left to right even when the page is ${info.htmlDir}`);
                assert.equal(info.translate, 'no');
                assert.equal(info.ariaHidden, null, 'not aria-hidden');
                assert.doesNotMatch(await lineText(page), /[؀-ۿ]/);
            }, { lang });
        }
    });

    it('is written from the stamped module: its version and hash are the package version and the sw.js hash', async () => {
        await withPage(app.browser, builtUrl, async (page) => {
            const stamped = await page.evaluate(async () => {
                const module = await import('./js/core/buildInfo.js');
                return { version: module.APP_VERSION, hash: module.BUILD_HASH };
            });
            assert.equal(stamped.version, pkg.version);
            assert.equal(stamped.hash, await builtSwVersion(), 'the module and the service worker carry one hash');
            assert.equal(await lineText(page), `v${stamped.version}${SEP}${stamped.hash.slice(0, 7)}`);
        });
    });

    it('shows the same text offline, from the precached module, once the service worker controls the page', async () => {
        const expected = `v${pkg.version}${SEP}${(await builtSwVersion()).slice(0, 7)}`;
        const context = await app.browser.newContext({ viewport: PHONE });
        const page = await context.newPage();
        try {
            await page.goto(builtUrl);
            await page.evaluate(() => navigator.serviceWorker.ready);
            await page.reload();
            await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
            await context.setOffline(true);
            await page.reload();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.equal(await lineText(page), expected);
        } finally {
            await context.close();
        }
    });

    it('is on the welcome screen only: not on the setup screen, and not during a match', async () => {
        await withPage(app.browser, builtUrl, async (page) => {
            await showBuildLine(page);
            assert.ok(await page.isVisible('#build-info'));
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            assert.equal(await page.isVisible('#build-info'), false, 'setup screen');

            // Start a match with the default settings and go through the screens of a match.
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            assert.equal(await page.isVisible('#build-info'), false, 'role reveal');
            for (let i = 0; i < 4; i++) {
                await page.locator('#reveal-grid button:not([disabled])').first().click();
                await page.click('#handoff-action');
                await page.waitForSelector('#role-modal:not(.hidden)');
                await page.click('#btn-role-close');
                await page.waitForSelector('#role-modal.hidden', { state: 'attached' });
            }
            await page.click('#btn-start-discussion');
            await page.waitForSelector('#screen-timer:not(.hidden)');
            assert.equal(await page.isVisible('#build-info'), false, 'discussion timer');
            assert.equal(await page.evaluate(() => document.getElementById('build-info').closest('#screen-welcome') !== null), true, 'it lives inside the welcome screen');
        });
    });

    it('looks like the credit line in all 8 themes and both languages, and stays readable', async () => {
        for (const lang of ['fa', 'en']) {
            await withPage(app.browser, builtUrl, async (page) => {
                await showBuildLine(page);
                for (const theme of THEMES) {
                    await page.selectOption('#theme-selector', theme);
                    const r = await page.evaluate(() => {
                        const style = (el) => getComputedStyle(el);
                        const info = style(document.getElementById('build-info'));
                        const credit = style(document.querySelector('p.credit-line:not(#build-info)'));
                        const channel = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);
                        const card = style(document.getElementById('main-content-root')).backgroundColor;
                        return {
                            same: ['fontSize', 'color', 'opacity', 'textAlign', 'letterSpacing', 'fontFamily'].filter((k) => info[k] !== credit[k]),
                            color: channel(info.color),
                            opacity: Number(info.opacity),
                            card: channel(card),
                            fontSize: parseFloat(info.fontSize)
                        };
                    });
                    assert.deepEqual(r.same, [], `${lang}/${theme}: same style as .credit-line`);
                    // Effective colour = text colour at the credit line's opacity over the card; low contrast on purpose,
                    // but not lower than 2:1 in any theme.
                    const lum = ([red, green, blue]) => {
                        const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
                        return 0.2126 * lin(red) + 0.7152 * lin(green) + 0.0722 * lin(blue);
                    };
                    const effective = r.color.map((c, i) => r.opacity * c + (1 - r.opacity) * r.card[i]);
                    const [hi, lo] = [lum(effective), lum(r.card)].sort((a, b) => b - a);
                    const ratio = (hi + 0.05) / (lo + 0.05);
                    assert.ok(ratio >= 2, `${lang}/${theme}: contrast ${ratio.toFixed(2)}:1 is below 2:1`);
                    assert.ok(r.fontSize >= 10, `${lang}/${theme}: font size ${r.fontSize}px`);
                }
            }, { lang });
        }
    });

    it('fits at 360 px and clears the floating cover-mode and install buttons, on a tall and on a short screen scrolled to the end', async () => {
        for (const lang of ['fa', 'en']) {
            for (const height of [740, 480, 360]) {
                await withPage(app.browser, builtUrl, async (page) => {
                    // The install button only appears on `beforeinstallprompt`; show it to test the worst case.
                    await page.evaluate(() => document.getElementById('btn-install-app').classList.remove('hidden'));
                    await showBuildLine(page);
                    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
                    const g = await page.evaluate(() => {
                        const rect = (el) => {
                            const r = el.getBoundingClientRect();
                            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
                        };
                        const line = document.getElementById('build-info');
                        const text = document.createRange();
                        text.selectNodeContents(line);
                        return {
                            line: rect(line),
                            text: rect(text),
                            panic: rect(document.getElementById('btn-panic-open')),
                            install: rect(document.getElementById('btn-install-app')),
                            innerWidth: window.innerWidth,
                            innerHeight: window.innerHeight,
                            scrollWidth: document.documentElement.scrollWidth,
                            lineScrollWidth: line.scrollWidth,
                            lineClientWidth: line.clientWidth
                        };
                    });
                    const where = `${lang} 360x${height}`;
                    assert.ok(g.scrollWidth <= g.innerWidth, `${where}: no sideways scrolling`);
                    assert.ok(g.text.left >= 0 && g.text.right <= g.innerWidth, `${where}: the text is inside the screen`);
                    assert.ok(g.lineScrollWidth <= g.lineClientWidth, `${where}: the text is not cut off`);
                    assert.ok(g.text.top >= 0 && g.text.bottom <= g.innerHeight, `${where}: the end of the screen shows the line`);
                    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                    assert.ok(!overlaps(g.text, g.panic), `${where}: not under the cover-mode button`);
                    assert.ok(!overlaps(g.text, g.install), `${where}: not under the install button`);
                }, { lang, viewport: { width: PHONE.width, height } });
            }
        }
    });
});

describe('build line, dev server (source checkout)', () => {
    it('says just "dev", in Persian and in English, once revealed', async () => {
        for (const lang of ['fa', 'en']) {
            await withPage(devBrowser, devUrl, async (page) => {
                assert.equal(await lineText(page), 'dev');
                assert.equal(await page.isVisible('#build-info'), false, 'hidden by default');
                await showBuildLine(page);
                assert.ok(await page.isVisible('#build-info'));
            }, { lang });
        }
    });

    it('serves the unstamped module, so "dev" comes from the placeholders and not from a special case', async () => {
        const source = await (await fetch(`${devUrl}js/core/buildInfo.js`)).text();
        assert.match(source, /APP_VERSION = '__APP_VERSION__'/);
        assert.match(source, /BUILD_HASH = '__BUILD_HASH__'/);
        const sw = await (await fetch(`${devUrl}sw.js`)).text();
        assert.match(sw, /const VERSION = '__BUILD_VERSION__'/, 'sw.js is in dev mode too');
    });
});
