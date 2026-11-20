/**
 * End-to-end test of the welcome screen's "Quick start", against the PRODUCTION build in a real Chromium at 360x740, in
 * the style of how-to-play.test.mjs: the button sits beside "How to play" without making the welcome screen taller or
 * wider than the phone, opens a dialog (focus goes into it and the cancel button gives it back), the dialog counts
 * players between the least and the most the game allows, and "Start game" starts a match with that many players, in
 * Persian and in English. The Persian baseline of the welcome screen leaves this button out (helpers/record.mjs).
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { RULES } from '../../js/core/config.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';

const CATALOGS = { fa, en };
const BUTTON = '#btn-quick-start';
const MODAL = '#quick-start-modal';

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

/** Open the app on a fresh phone-sized page in `lang`, run `fn(page)`, and fail on any script error. */
async function withPage(lang, fn) {
    const context = await browser.newContext({ viewport: PHONE });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        if (lang === 'en') await page.click('#btn-lang-en');
        await fn(page);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const countText = (page) => page.locator('#quick-count').innerText();
const digits = (text) => Number(String(text).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));

describe('the quick start button', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: is beside "How to play", with its own label, and the welcome screen still fits the phone`, async () => {
            await withPage(lang, async (page) => {
                assert.equal(await page.locator(BUTTON).innerText(), CATALOGS[lang]['welcome.quickStart']);
                const quick = await page.locator(BUTTON).boundingBox();
                const how = await page.locator('#btn-how-to-play').boundingBox();
                const play = await page.locator('#btn-nav-setup').boundingBox();
                assert.ok(quick.y >= play.y + play.height - 1, 'under the play button');
                assert.ok(Math.abs(quick.y - how.y) < 4, 'in the same row as "How to play"');
                const fit = await page.evaluate(() => ({
                    scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                    bottom: document.getElementById('btn-open-words').getBoundingClientRect().bottom,
                    height: window.innerHeight
                }));
                assert.equal(fit.scrolls, false, 'no sideways scroll');
                assert.ok(fit.bottom <= fit.height, `the custom words button ends at ${fit.bottom}px of ${fit.height}px`);
            });
        });

        it(`${lang}: opens a dialog with the texts of the language, the count 4 the first time, and gives the focus back on cancel`, async () => {
            await withPage(lang, async (page) => {
                await page.click(BUTTON);
                await page.waitForSelector(`${MODAL}:not(.hidden)`);
                assert.equal(await page.locator('#quick-start-title').innerText(), CATALOGS[lang]['quick.title']);
                assert.equal(await page.locator(`${MODAL} p`).innerText(), CATALOGS[lang]['quick.text']);
                assert.equal(digits(await countText(page)), 4);
                assert.equal(await page.locator('#quick-count').getAttribute('aria-label'), CATALOGS[lang]['quick.count.label']);
                assert.equal(await page.evaluate(() => document.getElementById('quick-start-modal').contains(document.activeElement)), true);
                await page.click('#btn-quick-cancel');
                await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
                assert.equal(await page.evaluate(() => document.activeElement?.id), 'btn-quick-start');
                assert.equal(await page.locator('#screen-welcome').isVisible(), true);
            });
        });
    }

    it('counts players between the least and the most, and turns off the step button that cannot go further', async () => {
        await withPage('fa', async (page) => {
            await page.click(BUTTON);
            await page.waitForSelector(`${MODAL}:not(.hidden)`);
            for (let i = 0; i < RULES.players.max + 2; i++) await page.click('#btn-quick-more', { force: true }).catch(() => {});
            assert.equal(digits(await countText(page)), RULES.players.max);
            assert.equal(await page.locator('#btn-quick-more').isDisabled(), true);
            for (let i = 0; i < RULES.players.max + 2; i++) await page.click('#btn-quick-less', { force: true }).catch(() => {});
            assert.equal(digits(await countText(page)), RULES.players.min);
            assert.equal(await page.locator('#btn-quick-less').isDisabled(), true);
            assert.equal(await page.locator('#btn-quick-more').isDisabled(), false);
        });
    });

    it('opens on the number of players the setup screen holds', async () => {
        await withPage('fa', async (page) => {
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            await page.fill('#setup-players-count', '6');
            await page.dispatchEvent('#setup-players-count', 'change');
            await page.click('#btn-back-welcome-2');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.click(BUTTON);
            await page.waitForSelector(`${MODAL}:not(.hidden)`);
            assert.equal(digits(await countText(page)), 6);
        });
    });

    for (const lang of ['fa', 'en']) {
        it(`${lang}: "Start game" starts a match with the chosen number of players, on the role reveal`, async () => {
            await withPage(lang, async (page) => {
                await page.click(BUTTON);
                await page.waitForSelector(`${MODAL}:not(.hidden)`);
                await page.click('#btn-quick-more');
                await page.click('#btn-quick-more');
                assert.equal(digits(await countText(page)), 6);
                await page.click('#btn-quick-go');
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                assert.equal(await page.locator('#reveal-grid button').count(), 6);
                assert.equal(await page.locator(MODAL).evaluate((el) => el.classList.contains('hidden')), true);
            });
        });
    }
});
