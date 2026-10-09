/**
 * First paint for a person who chose English, against the PRODUCTION build in a real Chromium at 360x740.
 * js/preinit.js sets <html lang dir> and a class before the first paint, and the page stays hidden until
 * initI18n() has translated it; the CSS alone shows it again after about a second if no script ever runs.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { persianIn, recordScreen } from './helpers/record.mjs';

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

/** A phone-sized page with no service worker (so the requests below are really held back); `lang` is saved before any script runs. */
async function openContext(lang) {
    const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block' });
    if (lang) await context.addInitScript((value) => localStorage.setItem('spy_lang', value), lang);
    return context;
}

/** What is on screen right now: the page state a person would be looking at. */
const snapshot = (page) =>
    page.evaluate(() => ({
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        pending: document.documentElement.classList.contains('i18n-pending'),
        visibility: getComputedStyle(document.body).visibility
    }));

async function commit(page) {
    await page.goto(baseUrl, { waitUntil: 'commit' });
    await page.waitForSelector('#screen-welcome', { state: 'attached' });
}

describe('first paint (production build, 360x740)', () => {
    it('an English user never sees the Persian page: while main.js is still loading the page is hidden and <html> is already English and LTR', async () => {
        const context = await openContext('en');
        const { page, problems } = await newPage(context);
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        try {
            await page.route('**/js/main.js', async (route) => {
                await gate;
                await route.continue();
            });
            await commit(page);
            await page.waitForTimeout(300);

            assert.deepEqual(await snapshot(page), { lang: 'en', dir: 'ltr', pending: true, visibility: 'hidden' }, 'before main.js has run');
            assert.equal(await page.isVisible('#btn-nav-setup'), false, 'nothing of the page is shown yet, in any language');

            release();
            await page.waitForFunction(() => !document.documentElement.classList.contains('i18n-pending'));
            assert.deepEqual(await snapshot(page), { lang: 'en', dir: 'ltr', pending: false, visibility: 'visible' }, 'once initI18n has run');
            assert.equal(await page.isVisible('#btn-nav-setup'), true);
            assert.deepEqual(persianIn(await recordScreen(page)), [], 'and what appears is English');
            assert.equal(await page.textContent('#screen-welcome h1'), '🕵️ The Spy Game');
        } finally {
            release();
            await context.close();
        }
        assert.deepEqual(problems, []);
    });

    it('safety net: when main.js never runs (fails to load, or throws) the CSS alone shows the page after about a second', async () => {
        const failures = {
            'cannot be loaded': (route) => route.abort(),
            'throws on its first line': (route) => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("boom");' })
        };
        for (const [name, fail] of Object.entries(failures)) {
            const context = await openContext('en');
            const { page } = await newPage(context);
            try {
                await page.route('**/js/main.js', fail);
                const started = Date.now();
                await commit(page);
                await page.waitForTimeout(200);
                assert.equal((await snapshot(page)).visibility, 'hidden', `${name}: hidden at first`);

                await page.waitForSelector('#btn-nav-setup', { state: 'visible', timeout: 4000 });
                const waited = Date.now() - started;
                assert.ok(waited >= 800, `${name}: it came back after the one-second animation, not by accident (${waited} ms)`);
                assert.ok(waited < 3500, `${name}: and not much later (${waited} ms)`);
                const after = await snapshot(page);
                assert.equal(after.visibility, 'visible', `${name}: the page is shown`);
                assert.equal(after.pending, true, `${name}: no script ever removed the class: this was CSS only`);
                assert.equal(await page.isVisible('#screen-welcome h1'), true);
            } finally {
                await context.close();
            }
        }
    });

    it('the Persian path is untouched: with no saved language nothing is hidden, even while main.js is still loading', async () => {
        const context = await openContext(null);
        const { page, problems } = await newPage(context);
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        try {
            await page.route('**/js/main.js', async (route) => {
                await gate;
                await route.continue();
            });
            await commit(page);
            await page.waitForTimeout(300);
            assert.deepEqual(await snapshot(page), { lang: 'fa', dir: 'rtl', pending: false, visibility: 'visible' });
            assert.equal(await page.isVisible('#btn-nav-setup'), true, 'the Persian page is there at once, as before');
            release();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
        } finally {
            release();
            await context.close();
        }
        assert.deepEqual(problems, []);
    });

    it('an English user with a fast network: no pending class is left, the page is English and visible', async () => {
        const context = await openContext('en');
        const { page, problems } = await newPage(context);
        try {
            await page.goto(baseUrl);
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.deepEqual(await snapshot(page), { lang: 'en', dir: 'ltr', pending: false, visibility: 'visible' });
            assert.deepEqual(await page.evaluate(() => document.getElementById('btn-lang-en').getAttribute('aria-pressed')), 'true');
        } finally {
            await context.close();
        }
        assert.deepEqual(problems, []);
    });

    it('preinit.js is part of the offline shell (listed in the service worker precache)', async () => {
        const sw = await (await fetch(`${baseUrl}sw.js`)).text();
        assert.ok(sw.includes('./js/preinit.js'));
    });
});
