/**
 * End-to-end test of the welcome screen's "How to play" button, against the PRODUCTION build in a real Chromium
 * at 360x740, in the style of smoke.test.mjs: the button sits under the play button without crowding the screen,
 * opens the same help modal as the (i) buttons (focus goes into it and stays there, the close button shuts it,
 * the focus comes back to the button), and shows the right text in Persian and in English.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { persianIn, recordModal } from './helpers/record.mjs';

const CATALOGS = { fa, en };
const BUTTON = '#btn-how-to-play';
const MODAL = '#info-modal';
const CLOSE = '#btn-info-modal-close';

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

/** Open the app on a fresh phone-sized page, run `fn(page)`, and fail on any script error. */
async function withPage(fn) {
    const context = await browser.newContext({ viewport: PHONE });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? '');
const modalState = (page) =>
    page.evaluate(() => ({
        hidden: document.getElementById('info-modal').classList.contains('hidden'),
        inert: document.getElementById('main-content-root').inert,
        title: document.getElementById('info-modal-title').textContent,
        text: document.getElementById('info-modal-desc').textContent,
        welcomeShown: !document.getElementById('screen-welcome').classList.contains('hidden'),
        setupShown: !document.getElementById('screen-setup').classList.contains('hidden')
    }));
const useLanguage = async (page, lang) => {
    await page.click(`#btn-lang-${lang}`);
    await page.waitForFunction((l) => document.documentElement.lang === l, lang);
};

describe('the welcome screen "How to play" button (360x740)', () => {
    it('is a small second action under the play button and the screen still fits the phone', async () => {
        for (const lang of ['fa', 'en']) {
            await withPage(async (page) => {
                if (lang === 'en') await useLanguage(page, 'en');
                const m = await page.evaluate(() => {
                    const box = (selector) => {
                        const r = document.querySelector(selector).getBoundingClientRect();
                        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
                    };
                    const play = document.getElementById('btn-nav-setup');
                    const how = document.getElementById('btn-how-to-play');
                    return {
                        label: how.textContent.trim(),
                        play: box('#btn-nav-setup'),
                        how: box('#btn-how-to-play'),
                        words: box('#btn-open-words'),
                        playFirst: Boolean(play.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING),
                        scrollWidth: document.documentElement.scrollWidth,
                        scrollHeight: document.documentElement.scrollHeight,
                        innerWidth: window.innerWidth,
                        innerHeight: window.innerHeight
                    };
                });
                const where = `[${lang}]`;
                assert.equal(m.label, CATALOGS[lang]['welcome.howToPlay'], `${where} label`);
                assert.ok(m.playFirst, `${where} the play button comes first in the page, so it is first in the tab order`);
                assert.ok(m.how.top >= m.play.bottom, `${where} the button is below the play button`);
                assert.ok(m.how.bottom <= m.words.top, `${where} and above the custom words button`);
                assert.ok(m.how.height >= 40, `${where} a finger can hit it (${m.how.height}px high)`);
                assert.ok(m.how.width < m.words.width / 2, `${where} it is a small pill, not a second full-width button (${m.how.width}px)`);
                assert.ok(m.play.width * m.play.height > 2 * m.how.width * m.how.height, `${where} the play button is still the main action`);
                assert.ok(m.how.left >= 0 && m.how.right <= m.innerWidth, `${where} nothing sticks out of the phone`);
                assert.ok(m.scrollWidth <= m.innerWidth, `${where} no sideways scroll`);
                assert.ok(m.scrollHeight <= m.innerHeight, `${where} the welcome screen still fits one 740px screen (${m.scrollHeight} > ${m.innerHeight})`);
            });
        }
    });

    for (const lang of ['fa', 'en']) {
        it(`${lang}: opens the help modal, keeps the focus inside it and gives the focus back on close`, async () => {
            await withPage(async (page) => {
                if (lang === 'en') await useLanguage(page, 'en');
                const catalog = CATALOGS[lang];

                // Mouse path.
                await page.click(BUTTON);
                await page.waitForSelector(`${MODAL}:not(.hidden)`);
                let state = await modalState(page);
                assert.equal(state.title, catalog['info.howToPlay.title']);
                assert.equal(state.text, catalog['info.howToPlay.text']);
                assert.equal(state.text.split('\n').length, 6, 'about six lines');
                assert.equal(state.inert, true, 'the page behind is inert');
                assert.deepEqual([state.welcomeShown, state.setupShown], [true, false], 'it does not start the game or leave the welcome screen');
                assert.equal(await activeId(page), 'btn-info-modal-close', 'the focus moved into the modal');

                // The trap: Tab and Shift+Tab stay on the only control of the modal.
                await page.keyboard.press('Tab');
                assert.equal(await activeId(page), 'btn-info-modal-close', 'Tab stays inside');
                await page.keyboard.press('Shift+Tab');
                assert.equal(await activeId(page), 'btn-info-modal-close', 'Shift+Tab stays inside');

                // The text is in the page language and, in English, the modal has no Persian letter.
                if (lang === 'en') assert.deepEqual(persianIn(await recordModal(page, MODAL)), []);

                await page.click(CLOSE);
                await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
                state = await modalState(page);
                assert.equal(state.inert, false, 'the page is usable again');
                assert.equal(await activeId(page), 'btn-how-to-play', 'the focus is back on the button that opened it');

                // Keyboard path: Enter opens, Enter on the focused close button closes, the focus returns again.
                await page.keyboard.press('Enter');
                await page.waitForSelector(`${MODAL}:not(.hidden)`);
                assert.equal(await activeId(page), 'btn-info-modal-close');
                await page.keyboard.press('Enter');
                await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
                assert.equal(await activeId(page), 'btn-how-to-play');
            });
        });
    }

    it('uses the language of the moment each time it opens', async () => {
        await withPage(async (page) => {
            const text = async () => {
                await page.click(BUTTON);
                await page.waitForSelector(`${MODAL}:not(.hidden)`);
                const { title, text: body } = await modalState(page);
                await page.click(CLOSE);
                await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
                return { title, body };
            };
            assert.deepEqual(await text(), { title: fa['info.howToPlay.title'], body: fa['info.howToPlay.text'] });
            await useLanguage(page, 'en');
            assert.deepEqual(await text(), { title: en['info.howToPlay.title'], body: en['info.howToPlay.text'] });
            await useLanguage(page, 'fa');
            assert.deepEqual(await text(), { title: fa['info.howToPlay.title'], body: fa['info.howToPlay.text'] });
        });
    });

    it('the (i) buttons of the setup screen still open their own help (the wiring was generalised)', async () => {
        await withPage(async (page) => {
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            await page.click('.info-btn[data-info="detective"]');
            await page.waitForSelector(`${MODAL}:not(.hidden)`);
            const state = await modalState(page);
            assert.equal(state.title, fa['info.detective.title']);
            assert.equal(state.text, fa['info.detective.text']);
            await page.click(CLOSE);
            await page.waitForSelector(`${MODAL}.hidden`, { state: 'attached' });
        });
    });
});
