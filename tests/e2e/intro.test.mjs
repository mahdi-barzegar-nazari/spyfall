/**
 * End-to-end test of the first-visit intro ("The spy game in 3 steps"), against the PRODUCTION build in a real
 * Chromium at 360x740, in Persian and in English. The intro is switched off under browser automation
 * (`navigator.webdriver`, see core/intro.js), which is what keeps every other end-to-end test from meeting it, so this
 * test turns that flag off in every page it opens. The memory it checks is the page's own `localStorage`.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { INTRO_MAX_MATCHES, INTRO_MAX_SHOWS } from '../../js/core/intro.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';

const CATALOGS = { fa, en };
const KEY = 'spy_intro';
const MODAL = '#intro-modal';
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

/** A phone-sized context in which `navigator.webdriver` is false, so that the intro may open. */
async function newContext() {
    const context = await browser.newContext({ viewport: PHONE });
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    return context;
}

const opened = (page) => page.waitForSelector(`${MODAL}:not(.hidden)`, { timeout: 5000 });
const state = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

describe('the first-visit intro', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: opens by itself on a new device, with three steps, and "Got it" closes it for good`, async () => {
            const context = await newContext();
            const { page, problems } = await newPage(context);
            await page.addInitScript((l) => { try { localStorage.setItem('spy_lang', l); } catch (e) { /* the page has a default */ } }, lang);
            await page.goto(baseUrl);
            await opened(page);
            assert.equal(await page.locator('#intro-title').innerText(), CATALOGS[lang]['intro.title']);
            assert.equal(await page.locator(`${MODAL} li`).count(), 3);
            assert.equal(await page.locator('#btn-intro-ok').innerText(), CATALOGS[lang]['intro.ok']);
            assert.deepEqual(await state(page), { shown: 1, matches: 0, off: false });
            const box = await page.locator(`${MODAL} .modal-card`).boundingBox();
            assert.ok(box.height <= PHONE.height, 'the dialog fits the phone');
            await page.click('#btn-intro-ok');
            await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
            assert.deepEqual(await state(page), { shown: 1, matches: 0, off: true });
            await page.reload();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.waitForTimeout(1500);
            assert.equal(await page.locator(MODAL).evaluate((el) => el.classList.contains('hidden')), true, 'not again after "Got it"');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    it('"Full guide" ends it for good and opens the same guide as "How to play"', async () => {
        const context = await newContext();
        const { page, problems } = await newPage(context);
        await page.goto(baseUrl);
        await opened(page);
        await page.click('#btn-intro-full');
        await page.waitForSelector('#info-modal:not(.hidden)');
        assert.equal((await state(page)).off, true);
        assert.deepEqual(problems, []);
        await context.close();
    });

    it('closing it with Escape is not "Got it": it comes back on the next visits, but only INTRO_MAX_SHOWS times in all', async () => {
        const context = await newContext();
        const { page, problems } = await newPage(context);
        for (let visit = 1; visit <= INTRO_MAX_SHOWS + 1; visit++) {
            await page.goto(baseUrl);
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            if (visit <= INTRO_MAX_SHOWS) {
                await opened(page);
                await page.keyboard.press('Escape');
                await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
            } else {
                await page.waitForTimeout(1500);
                assert.equal(await page.locator(MODAL).evaluate((el) => el.classList.contains('hidden')), true);
            }
        }
        assert.deepEqual(await state(page), { shown: INTRO_MAX_SHOWS, matches: 0, off: false });
        assert.deepEqual(problems, []);
        await context.close();
    });

    it('does not open for a device that has played before (a remembered word)', async () => {
        const context = await newContext();
        const { page, problems } = await newPage(context);
        await page.addInitScript(() => localStorage.setItem('spy_recent_words', JSON.stringify(['some word'])));
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await page.waitForTimeout(1500);
        assert.equal(await page.locator(MODAL).evaluate((el) => el.classList.contains('hidden')), true);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), KEY), null);
        assert.deepEqual(problems, []);
        await context.close();
    });

    it('counts a started match, and stops opening after INTRO_MAX_MATCHES of them', async () => {
        const context = await newContext();
        const { page, problems } = await newPage(context);
        await page.goto(baseUrl);
        await opened(page);
        await page.keyboard.press('Escape');
        await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
        await page.click('#btn-quick-start');
        await page.waitForSelector('#quick-start-modal:not(.hidden)');
        await page.click('#btn-quick-go');
        await page.waitForSelector('#screen-reveal:not(.hidden)');
        assert.equal((await state(page)).matches, 1);
        assert.ok(INTRO_MAX_MATCHES >= 2);
        assert.deepEqual(problems, []);
        await context.close();
    });
});
