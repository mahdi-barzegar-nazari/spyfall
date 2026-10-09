/**
 * End-to-end test of the language switch (and of the name field that used to lose its first tap), against
 * the PRODUCTION build in a real Chromium at 360x740, in the style of smoke.test.mjs.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { getSideQuests, getWordPacks } from '../../js/data/banks.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { PERSIAN_LETTER, persianIn, recordModal, recordScreen } from './helpers/record.mjs';

/** The Persian welcome and setup screens as the zip BEFORE the switch showed them (see fixtures/make-persian-baseline.mjs). */
const baseline = JSON.parse(readFileSync(new URL('./fixtures/persian-baseline.json', import.meta.url), 'utf8'));

const ENGLISH_WORDS = new Set(Object.values(getWordPacks('en')).flat().flatMap((entry) => [entry.word, entry.foolWord, entry.hint]));
const ENGLISH_QUESTS = new Set(getSideQuests('en'));

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

/** Open the app on a fresh phone-sized page, run `fn(page, context)`, and fail on any script error. */
async function withPage(fn, options = {}) {
    const context = await browser.newContext({ viewport: PHONE, ...options });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page, context);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const htmlState = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
const pressed = (page) =>
    page.evaluate(() => ({ fa: document.getElementById('btn-lang-fa').getAttribute('aria-pressed'), en: document.getElementById('btn-lang-en').getAttribute('aria-pressed') }));
const savedLang = (page) => page.evaluate(() => localStorage.getItem('spy_lang'));

async function goSetup(page) {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
}
async function goWelcome(page) {
    await page.click('#btn-back-welcome-2');
    await page.waitForSelector('#screen-welcome:not(.hidden)');
}
async function openModal(page, buttonSelector, modalSelector) {
    await page.click(buttonSelector);
    await page.waitForSelector(`${modalSelector}:not(.hidden)`);
}
async function closeModal(page, buttonSelector, modalSelector) {
    await page.click(buttonSelector);
    await page.waitForSelector(`${modalSelector}.hidden`, { state: 'attached' });
}

/** Where the two buttons are, so the test can check order, size and that nothing sticks out of the phone. */
const switchGeometry = (page) =>
    page.evaluate(() => {
        const rect = (id) => document.getElementById(id).getBoundingClientRect();
        const fa = rect('btn-lang-fa');
        const en = rect('btn-lang-en');
        return {
            faLeft: fa.left,
            enLeft: en.left,
            minHeight: Math.min(fa.height, en.height),
            minLeft: Math.min(fa.left, en.left),
            maxRight: Math.max(fa.right, en.right),
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth
        };
    });

function assertSwitchFits(geometry, where) {
    assert.ok(geometry.faLeft < geometry.enLeft, `${where}: "فارسی" is left of "English" in both languages`);
    assert.ok(geometry.minHeight >= 44, `${where}: touch targets are at least 44px high (${geometry.minHeight})`);
    assert.ok(geometry.minLeft >= 0 && geometry.maxRight <= geometry.innerWidth, `${where}: the buttons stay inside the screen`);
    assert.ok(geometry.scrollWidth <= geometry.innerWidth, `${where}: no sideways scrolling`);
}

/** Open the first role card that has not been seen, return what it shows, and leave it open. */
async function openNextRoleCard(page) {
    await page.locator('#reveal-grid button:not([disabled])').first().click();
    await page.click('#handoff-action');
    await page.waitForSelector('#role-modal:not(.hidden)');
    return page.evaluate(() => {
        const quest = document.getElementById('modal-quest-box');
        return {
            word: document.getElementById('modal-secret-content').textContent,
            questShown: !quest.classList.contains('hidden'),
            quest: document.getElementById('modal-quest-text').textContent
        };
    });
}
async function closeRoleCard(page) {
    await page.click('#btn-role-close');
    await page.waitForSelector('#role-modal.hidden', { state: 'attached' });
}

describe('the language switch (production build, 360x740)', () => {
    it('is Persian by default; English leaves no Persian on the welcome screen, the setup screen, the words modal or a help text; English survives a reload', async () => {
        await withPage(async (page) => {
            assert.deepEqual(await htmlState(page), { lang: 'fa', dir: 'rtl' });
            assert.deepEqual(await pressed(page), { fa: 'true', en: 'false' });
            assert.equal(await savedLang(page), null, 'nothing is saved until someone chooses');
            assertSwitchFits(await switchGeometry(page), 'Persian');

            await page.click('#btn-lang-en');

            assert.deepEqual(await htmlState(page), { lang: 'en', dir: 'ltr' });
            assert.deepEqual(await pressed(page), { fa: 'false', en: 'true' });
            assert.equal(await savedLang(page), 'en');
            assertSwitchFits(await switchGeometry(page), 'English');
            assert.equal(await page.textContent('#btn-lang-fa'), 'فارسی', 'the labels are fixed text in their own language');
            assert.equal(await page.textContent('#btn-lang-en'), 'English');
            assert.equal(await page.getAttribute('#btn-lang-fa', 'lang'), 'fa');
            assert.equal(await page.getAttribute('#btn-lang-en', 'lang'), 'en');
            assert.equal(await page.getAttribute('.lang-switch', 'aria-label'), 'Language');

            // Only the two language labels may hold a Persian letter, and they are left out of the recording.
            const welcome = await recordScreen(page);
            assert.deepEqual(persianIn(welcome), [], 'welcome screen');
            assert.ok(welcome.text.some((line) => /Start game/.test(line)), 'and it really is English');

            await goSetup(page);
            const setup = await recordScreen(page);
            assert.deepEqual(persianIn(setup), [], 'setup screen (text, attributes, fields, select options, title)');
            assert.ok(setup.fields.some((field) => field.endsWith('=Player 1')), 'default names are English');

            await openModal(page, '.info-btn[data-info="detective"]', '#info-modal');
            assert.deepEqual(persianIn(await recordModal(page, '#info-modal')), [], 'a help text is built when it opens');
            await closeModal(page, '#btn-info-modal-close', '#info-modal');

            await goWelcome(page);
            await openModal(page, '#btn-open-words', '#custom-words-modal');
            assert.deepEqual(persianIn(await recordModal(page, '#custom-words-modal')), [], 'custom words modal');
            await closeModal(page, '#btn-close-words-modal', '#custom-words-modal');

            await page.reload();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.deepEqual(await htmlState(page), { lang: 'en', dir: 'ltr' }, 'English is kept after a reload');
            assert.deepEqual(await pressed(page), { fa: 'false', en: 'true' });
            assert.ok(!PERSIAN_LETTER.test(await page.title()), 'the page title is English');
            assert.deepEqual(persianIn(await recordScreen(page)), []);
        });
    });

    it('clicking the language that is already active changes nothing', async () => {
        await withPage(async (page) => {
            await page.click('#btn-lang-fa');
            assert.deepEqual(await htmlState(page), { lang: 'fa', dir: 'rtl' });
            assert.equal(await savedLang(page), null, 'Persian was already active: nothing is saved');
            await page.click('#btn-lang-en');
            await page.click('#btn-lang-en');
            assert.deepEqual(await pressed(page), { fa: 'false', en: 'true' });
        });
    });

    it('round trip: Persian -> English -> Persian shows exactly what the first Persian recording showed, and exactly what the original zip showed', async () => {
        await withPage(async (page) => {
            // Welcome and setup, with the switch itself included (it is the same in both Persian recordings).
            const snap = async (options) => {
                const welcome = await recordScreen(page, options);
                await goSetup(page);
                const setup = await recordScreen(page, options);
                await goWelcome(page);
                return { welcome, setup };
            };

            const persianFirst = await snap({ includeSwitch: true });
            await page.click('#btn-lang-en');
            const english = await snap({ includeSwitch: true });
            await page.click('#btn-lang-fa');
            const persianAgain = await snap({ includeSwitch: true });

            // Not vacuous: English really was different on every part that is recorded.
            for (const screen of ['welcome', 'setup']) {
                assert.notDeepEqual(english[screen].text, persianFirst[screen].text, `${screen}: text changed`);
                assert.notDeepEqual(english[screen].attrs, persianFirst[screen].attrs, `${screen}: attributes changed`);
            }
            assert.notDeepEqual(english.setup.fields, persianFirst.setup.fields, 'names changed');
            assert.notDeepEqual(english.setup.selects, persianFirst.setup.selects, 'select options changed');
            assert.notEqual(english.welcome.title, persianFirst.welcome.title);
            assert.notEqual(english.welcome.description, persianFirst.welcome.description);

            // Nothing stale from English is left: identical to the first recording, part by part.
            assert.deepEqual(persianAgain.welcome, persianFirst.welcome);
            assert.deepEqual(persianAgain.setup, persianFirst.setup);
            assert.deepEqual(await pressed(page), { fa: 'true', en: 'false' });

            // And identical to the zip we were given, with the switch left out (it is the one new element).
            assert.deepEqual(await recordScreen(page), baseline.welcome);
            await goSetup(page);
            assert.deepEqual(await recordScreen(page), baseline.setup);
        });
    });

    it('the Persian welcome and setup screens do not differ from the original zip', async () => {
        await withPage(async (page) => {
            assert.deepEqual(await recordScreen(page), baseline.welcome);
            await goSetup(page);
            assert.deepEqual(await recordScreen(page), baseline.setup);
        });
    });

    it('a name the user typed is never changed by a switch; a slot with the other language\'s default follows it and keeps its player', async () => {
        await withPage(async (page) => {
            await goSetup(page);
            const inputs = page.locator('#name-inputs-container input');
            await inputs.nth(1).fill('Ali');
            await inputs.nth(2).fill('سارا');
            const snapshot = () => page.evaluate(() => [...document.querySelectorAll('#name-inputs-container input')].map((el) => ({ value: el.value, id: el.dataset.playerId })));
            const typed = await snapshot();

            await goWelcome(page);
            await page.click('#btn-lang-en');
            const english = await snapshot();
            assert.deepEqual(english.map((s) => s.value), ['Player 1', 'Ali', 'سارا', 'Player 4']);

            await page.click('#btn-lang-fa');
            const persian = await snapshot();
            assert.deepEqual(persian.map((s) => s.value), ['بازیکن 1', 'Ali', 'سارا', 'بازیکن 4']);
            for (const after of [english, persian]) assert.deepEqual(after.map((s) => s.id), typed.map((s) => s.id), 'the same players keep their ids');
        });
    });

    it('an English match: the role card has an English word; after a reload the banner appears; switching to Persian and pressing "Resume match" brings English back', async () => {
        await withPage(async (page) => {
            await page.click('#btn-lang-en');
            await goSetup(page);
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');

            const first = await openNextRoleCard(page);
            assert.ok(/[A-Za-z]/.test(first.word) && !PERSIAN_LETTER.test(first.word), `English word on the card: "${first.word}"`);
            assert.ok(ENGLISH_WORDS.has(first.word), `"${first.word}" comes from the English bank`);
            assert.deepEqual(persianIn(await recordModal(page, '#role-modal')), [], 'nothing on the role card is Persian');
            await closeRoleCard(page);

            await page.reload();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.waitForSelector('#recovery-banner:not(.hidden)');
            assert.deepEqual(await htmlState(page), { lang: 'en', dir: 'ltr' });
            assert.ok(!PERSIAN_LETTER.test(await page.textContent('#recovery-banner')), 'the banner is English');

            // The welcome screen with the banner is not "a match in progress": the language can be changed here.
            await page.click('#btn-lang-fa');
            assert.deepEqual(await htmlState(page), { lang: 'fa', dir: 'rtl' });
            assert.deepEqual(await pressed(page), { fa: 'true', en: 'false' });
            assert.ok(PERSIAN_LETTER.test(await page.textContent('#recovery-banner')), 'the banner followed the switch');

            // "Resume match" asks first.
            await page.click('#btn-restore-game');
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            assert.equal(await page.isVisible('#screen-reveal'), false, 'nothing is restored before the answer');
            await page.click('#btn-confirm-yes');
            await page.waitForSelector('#screen-reveal:not(.hidden)');

            assert.deepEqual(await htmlState(page), { lang: 'en', dir: 'ltr' }, 'the app is English again');
            assert.deepEqual(await pressed(page), { fa: 'false', en: 'true' }, 'and the control shows English as selected');
            assert.equal(await savedLang(page), 'en');
            assert.equal(await page.isVisible('#recovery-banner'), false);
            assert.deepEqual(persianIn(await recordScreen(page)), [], 'the restored screen is English');

            const second = await openNextRoleCard(page);
            assert.ok(ENGLISH_WORDS.has(second.word), `"${second.word}" comes from the English bank`);
            assert.deepEqual(persianIn(await recordModal(page, '#role-modal')), []);
            await closeRoleCard(page);
        });
    });

    it('a toast that is still on screen does not outlive a switch in the old language', async () => {
        await withPage(async (page) => {
            await goSetup(page);
            await page.locator('#name-inputs-container input').nth(0).fill('');
            await page.click('#btn-start-match');
            await page.waitForSelector('#toast-container .toast');
            assert.ok(PERSIAN_LETTER.test(await page.textContent('#toast-container')), 'the toast is Persian');
            await goWelcome(page);
            await page.click('#btn-lang-en');
            assert.equal(await page.locator('#toast-container .toast').count(), 0, 'no Persian toast is left on an English screen');
        });
    });

    it('English side quests: with the option on, the role card shows an English quest', async () => {
        await withPage(async (page) => {
            await page.click('#btn-lang-en');
            await goSetup(page);
            await page.evaluate(() => {
                document.getElementById('toggle-quests').checked = true;
            });
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            const card = await openNextRoleCard(page);
            assert.equal(card.questShown, true, 'the quest box is shown');
            assert.ok(/[A-Za-z]/.test(card.quest) && !PERSIAN_LETTER.test(card.quest), `English quest: "${card.quest}"`);
            assert.ok(ENGLISH_QUESTS.has(card.quest), 'it comes from the English quest pool');
            assert.deepEqual(persianIn(await recordModal(page, '#role-modal')), []);
        });
    });
});

describe('the name field after the player count was edited (it used to lose its first tap)', () => {
    for (const touch of [false, true]) {
        const how = touch ? 'a touch tap' : 'a mouse click';
        it(`${how} on a name input focuses it, keeps the element and keeps what is typed`, async () => {
            await withPage(
                async (page) => {
                    await goSetup(page);
                    const names = '#name-inputs-container input';
                    // Tag the four inputs that exist, so a replaced element is noticed.
                    await page.evaluate((selector) => document.querySelectorAll(selector).forEach((el, i) => (el.__slot = `slot${i}`)), names);

                    const count = page.locator('#setup-players-count');
                    await (touch ? count.tap() : count.click());
                    await page.keyboard.press('ControlOrMeta+A');
                    await page.keyboard.type('6');
                    assert.equal(await page.evaluate(() => document.activeElement.id), 'setup-players-count', 'the count field still has focus: its change event has not fired');
                    assert.equal(await page.locator(names).count(), 4, 'and the inputs have not been redrawn yet');

                    // Longer than the page's double-tap guard (300 ms), so the tap itself cannot be swallowed by it.
                    await page.waitForTimeout(400);
                    const target = page.locator(names).nth(1);
                    await (touch ? target.tap() : target.click());

                    const focus = await page.evaluate((selector) => {
                        const active = document.activeElement;
                        const all = [...document.querySelectorAll(selector)];
                        return { index: all.indexOf(active), slot: active.__slot, slots: all.map((el) => el.__slot ?? null) };
                    }, names);
                    assert.equal(focus.index, 1, 'the tapped name input is the focused element');
                    assert.equal(focus.slot, 'slot1', 'and it is the very element that was tapped, not a new one');
                    assert.deepEqual(focus.slots, ['slot0', 'slot1', 'slot2', 'slot3', null, null], 'the old inputs were kept; the two new slots were added');

                    await page.keyboard.press('ControlOrMeta+A');
                    await page.keyboard.type('Zed');
                    assert.equal(await page.locator(names).nth(1).inputValue(), 'Zed', 'a typed name stays in the input');
                    assert.equal(await page.evaluate((selector) => [...document.querySelectorAll(selector)].indexOf(document.activeElement), names), 1, 'and it keeps the focus');
                },
                touch ? { hasTouch: true } : {}
            );
        });
    }
});
