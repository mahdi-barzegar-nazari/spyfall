/**
 * End-to-end test of the difficulty chips on the setup screen (#difficulty-chips-container), against the
 * PRODUCTION build in a real Chromium, in both languages:
 *  - the three levels are one named group (fieldset + legend with the existing label), all ticked at first, each
 *    chip a 44 px or larger target inside the screen at 360 px and 320 px, in the reading order of the language
 *    (right to left in Persian), and styled exactly like the category chips in all 8 themes;
 *  - the last ticked chip cannot be unticked (by tap or by keyboard), a short message says why, and the
 *    unticked chips can be ticked again;
 *  - with medium + hard chosen, a real round is played and its word has one of those two ratings, which the saved
 *    match also records; the browser's random source is pinned to its lowest value for that, so the draw is the
 *    FIRST word of the filtered pool and a filter that is ignored would draw an easy word (every category of both
 *    banks starts with one);
 *  - a match saved with the old single-string setting ('hard') is resumed and its next round still draws only
 *    hard words;
 *  - a custom word is in the pool whatever levels are ticked: with only 'hard' ticked (medium, the rating a custom
 *    word carries, is not), the random source pinned to the LAST word of the pool draws the custom word, and a
 *    filter that dropped it would draw a built-in word instead.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getWordPacks } from '../../js/data/banks.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { playRound, reloadAndResume, startMatch } from './helpers/play.mjs';

const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
const CATALOG = { fa, en };
const LEVELS = ['easy', 'medium', 'hard'];

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
 * Open the app on a fresh page in `lang` (width `width`), run `fn(page)`, and fail on any script error.
 * `pinRandom` makes crypto.getRandomValues return zeros, so every random pick is the first candidate; a number
 * makes it return that number instead (a pick among n candidates is then that number modulo n).
 * `customWords` (a list of stored custom words) is put in the page's storage before the app starts.
 */
async function withPage(lang, fn, { width = PHONE.width, pinRandom = false, customWords } = {}) {
    const context = await browser.newContext({ viewport: { width, height: PHONE.height } });
    if (pinRandom !== false) {
        await context.addInitScript((value) => {
            crypto.getRandomValues = (array) => {
                array.fill(value);
                return array;
            };
        }, pinRandom === true ? 0 : pinRandom);
    }
    if (customWords) {
        await context.addInitScript((words) => {
            try {
                localStorage.setItem('spy_custom_words', JSON.stringify(words));
            } catch (e) {
                // storage is blocked: the test then fails on the missing word
            }
        }, customWords);
    }
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

async function openSetup(page) {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
}

/** The chip label (the tap target) of `level`. */
const chipOf = (page, level) => page.locator('#difficulty-chips-container label', { has: page.locator(`input[value="${level}"]`) });

/** Which of the three levels are ticked, and which chips the page draws as ticked. */
const tickedLevels = (page) =>
    page.evaluate(() => ({
        inputs: [...document.querySelectorAll('input[name="setup-diff"]')].filter((el) => el.checked).map((el) => el.value),
        drawn: [...document.querySelectorAll('#difficulty-chips-container label')].filter((el) => el.classList.contains('is-checked')).map((el) => el.querySelector('input').value)
    }));

/** The saved match: its difficulty setting, the secret word, and the rating the round recorded. */
const savedMatch = (page) =>
    page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('spy_full_state_master'));
        return { diff: saved.state.settings.diff, word: saved.secrets.secretWord, rating: saved.state.round.wordDifficulty };
    });

/** The rating the word bank of `lang` gives `word` (found by its text). */
function ratingInBank(lang, word) {
    const matches = Object.values(getWordPacks(lang)).flat().filter((entry) => entry.word === word);
    assert.equal(matches.length > 0, true, `"${word}" is a word of the ${lang} bank`);
    return matches[0].diff;
}

describe('difficulty chips (production build)', () => {
    for (const lang of ['fa', 'en']) {
        const texts = CATALOG[lang];

        it(`${lang}: one named group of three ticked chips, no select, 44 px targets inside the screen at 360 and 320 px`, async () => {
            for (const width of [360, 320]) {
                await withPage(lang, async (page) => {
                    await openSetup(page);
                    assert.equal(await page.locator('#setup-difficulty').count(), 0, 'the select is gone');

                    const group = page.getByRole('group', { name: texts['setup.difficulty.label'] });
                    assert.equal(await group.count(), 1, 'one group named by the difficulty label');
                    const boxes = group.getByRole('checkbox');
                    assert.equal(await boxes.count(), 3);
                    for (const level of LEVELS) {
                        const box = group.getByRole('checkbox', { name: texts[`setup.difficulty.${level}`] });
                        assert.equal(await box.count(), 1, level);
                        assert.equal(await box.isChecked(), true, `${level} is ticked at first`);
                    }
                    assert.deepEqual(await tickedLevels(page), { inputs: LEVELS, drawn: LEVELS });

                    const geometry = await page.evaluate(() => {
                        const rect = (level) => {
                            const label = document.querySelector(`#difficulty-chips-container input[value="${level}"]`).closest('label');
                            const r = label.getBoundingClientRect();
                            return { left: r.left, right: r.right, width: r.width, height: r.height, top: r.top };
                        };
                        return {
                            dir: document.documentElement.dir,
                            easy: rect('easy'), medium: rect('medium'), hard: rect('hard'),
                            viewport: document.documentElement.clientWidth,
                            scrollWidth: document.documentElement.scrollWidth
                        };
                    });
                    const where = `${lang} at ${width}px`;
                    for (const level of LEVELS) {
                        const r = geometry[level];
                        assert.ok(r.width >= 44 && r.height >= 44, `${where}: ${level} chip is ${r.width}x${r.height}`);
                        assert.ok(r.left >= 0 && r.right <= geometry.viewport, `${where}: ${level} chip is inside the screen`);
                    }
                    assert.ok(geometry.scrollWidth <= geometry.viewport, `${where}: no sideways scroll`);
                    // Same row, in reading order: right to left in Persian, left to right in English.
                    assert.ok(Math.abs(geometry.easy.top - geometry.hard.top) < 1, `${where}: one row`);
                    if (lang === 'fa') {
                        assert.equal(geometry.dir, 'rtl');
                        assert.ok(geometry.easy.left > geometry.medium.left && geometry.medium.left > geometry.hard.left, `${where}: right to left`);
                    } else {
                        assert.equal(geometry.dir, 'ltr');
                        assert.ok(geometry.easy.left < geometry.medium.left && geometry.medium.left < geometry.hard.left, `${where}: left to right`);
                    }
                }, { width });
            }
        });

        it(`${lang}: the chips look like the category chips, ticked and unticked, in all 8 themes`, async () => {
            await withPage(lang, async (page) => {
                await openSetup(page);
                await chipOf(page, 'easy').click(); // easy is unticked now; medium and hard stay ticked
                await page.mouse.move(0, 0); // not hovering any chip: a hovered chip has its own look
                // The chips fade between their two looks: read the colours only once nothing is moving.
                const still = () => page.waitForFunction(() => [...document.querySelectorAll('.chip-item')].every((chip) => chip.getAnimations().length === 0));
                for (const theme of THEMES) {
                    await page.selectOption('#theme-selector', theme);
                    await still();
                    const look = await page.evaluate(() => {
                        const read = (label) => {
                            const s = getComputedStyle(label);
                            const box = label.getBoundingClientRect();
                            return {
                                color: s.color, backgroundColor: s.backgroundColor, backgroundImage: s.backgroundImage,
                                borderColor: s.borderTopColor, borderWidth: s.borderTopWidth, borderRadius: s.borderTopLeftRadius,
                                fontSize: s.fontSize, minHeight: s.minHeight, height: Math.round(box.height)
                            };
                        };
                        const diff = (level) => document.querySelector(`#difficulty-chips-container input[value="${level}"]`).closest('label');
                        const cat = (value) => document.querySelector(`#category-chips-container input[value="${value}"]`).closest('label');
                        return {
                            tickedDiff: read(diff('medium')), tickedCat: read(cat('places')),
                            unticked: read(diff('easy')), untickedCat: read(cat('custom'))
                        };
                    });
                    assert.deepEqual(look.tickedDiff, look.tickedCat, `${lang}/${theme}: a ticked chip`);
                    assert.deepEqual(look.unticked, look.untickedCat, `${lang}/${theme}: an unticked chip`);
                    assert.notEqual(look.tickedDiff.borderColor, look.unticked.borderColor, `${lang}/${theme}: ticked and unticked differ`);
                }
            });
        });

        it(`${lang}: the last ticked chip cannot be unticked (tap or keyboard), a message says why, and the others can be ticked again`, async () => {
            await withPage(lang, async (page) => {
                await openSetup(page);
                await chipOf(page, 'easy').click();
                await chipOf(page, 'medium').click();
                assert.deepEqual(await tickedLevels(page), { inputs: ['hard'], drawn: ['hard'] });
                assert.equal(await page.locator('#toast-container .toast').count(), 0, 'no message while a chip could be unticked');

                // The last one: a tap on it changes nothing.
                await chipOf(page, 'hard').click();
                assert.deepEqual(await tickedLevels(page), { inputs: ['hard'], drawn: ['hard'] });
                const toast = page.locator('#toast-container .toast');
                await toast.first().waitFor();
                assert.equal(await toast.first().textContent(), texts['setup.difficulty.keepOne']);

                // The same from the keyboard.
                await page.locator('#difficulty-chips-container input[value="hard"]').focus();
                await page.keyboard.press('Space');
                assert.deepEqual(await tickedLevels(page), { inputs: ['hard'], drawn: ['hard'] });

                // Ticking another chip frees the first one again.
                await chipOf(page, 'medium').click();
                assert.deepEqual(await tickedLevels(page), { inputs: ['medium', 'hard'], drawn: ['medium', 'hard'] });
                await chipOf(page, 'hard').click();
                assert.deepEqual(await tickedLevels(page), { inputs: ['medium'], drawn: ['medium'] });

                // What is left is what the match is saved with.
                await page.click('#btn-start-match');
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                assert.deepEqual((await savedMatch(page)).diff, ['medium']);
            });
        });

        it(`${lang}: with medium + hard chosen, a real round is played and its word is a medium or a hard one`, async () => {
            await withPage(lang, async (page) => {
                await startMatch(page, { levels: ['medium', 'hard'] });
                await playRound(page);
                const saved = await savedMatch(page);
                assert.deepEqual(saved.diff, ['medium', 'hard']);
                const rating = ratingInBank(lang, saved.word);
                assert.ok(['medium', 'hard'].includes(rating), `"${saved.word}" is rated ${rating}`);
                assert.equal(saved.rating, rating, 'the round recorded the rating of its word');
            }, { pinRandom: true });
        });
    }

    for (const lang of ['fa', 'en']) {
        it(`${lang}: with only hard chosen, a custom word is still in the pool (it is drawn when the random source picks the last word)`, async () => {
            const custom = [{ word: 'Mike', foolWord: 'Mouse', hint: 'm', diff: 'medium' }];
            // The pool is the hard words of 'events' (that chip comes before the custom one) and then the custom word.
            const hardEvents = getWordPacks(lang).events.filter((entry) => entry.diff === 'hard');
            assert.ok(hardEvents.length > 1);
            const lastIndex = hardEvents.length; // 0-based position of the custom word in a pool of hardEvents.length + 1 words
            await withPage(lang, async (page) => {
                await startMatch(page, { levels: ['hard'], cats: ['events', 'custom'] });
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                const saved = await savedMatch(page);
                assert.deepEqual(saved.diff, ['hard']);
                assert.equal(saved.word, 'Mike', 'the custom word was in the pool and was the one drawn');
                assert.equal(saved.rating, null, 'a custom word scores as neutral');
            }, { pinRandom: lastIndex, customWords: custom });
        });

        it(`${lang}: with only hard chosen, the built-in words around a custom word are still filtered (the first pick is a hard word)`, async () => {
            const custom = [{ word: 'Mike', foolWord: 'Mouse', hint: 'm', diff: 'medium' }];
            await withPage(lang, async (page) => {
                await startMatch(page, { levels: ['hard'], cats: ['events', 'custom'] });
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                const saved = await savedMatch(page);
                assert.equal(ratingInBank(lang, saved.word), 'hard', `"${saved.word}" is a hard word`);
                assert.equal(saved.rating, 'hard');
            }, { pinRandom: true, customWords: custom });
        });
    }

    it('a match saved with the old string setting \'hard\' is resumed and its next round draws a hard word only', async () => {
        await withPage('en', async (page) => {
            await startMatch(page);
            await playRound(page);
            const first = await savedMatch(page);
            assert.deepEqual(first.diff, ['easy', 'medium', 'hard']);
            assert.equal(ratingInBank('en', first.word), 'easy', 'the pinned draw of an unfiltered pool is an easy word');

            // Make the save look like the one the build before the chips wrote. The page saves its own state again
            // when it is left, which would overwrite this edit: that one key is not written until the reload.
            await page.evaluate(() => {
                const key = 'spy_full_state_master';
                const saved = JSON.parse(localStorage.getItem(key));
                saved.state.settings.diff = 'hard';
                localStorage.setItem(key, JSON.stringify(saved));
                const write = Storage.prototype.setItem;
                Storage.prototype.setItem = function (name, value) {
                    if (name !== key) write.call(this, name, value);
                };
            });
            await reloadAndResume(page);
            await page.click('#btn-next-round');
            await playRound(page);
            const second = await savedMatch(page);
            assert.equal(ratingInBank('en', second.word), 'hard', `"${second.word}" is a hard word`);
            assert.equal(second.rating, 'hard');
        }, { pinRandom: true });
    });
});
