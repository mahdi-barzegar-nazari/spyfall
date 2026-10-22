/**
 * End-to-end test of remembering the match settings between visits, against the PRODUCTION build in a real
 * Chromium at 360x740: values are changed on the setup screen the way a player does it (typing, tapping the chips
 * and the switches), a match is started, the page is reloaded, and the setup screen must show the same values.
 *
 * Also in a real browser: a damaged saved setup falls back field by field, a blocked localStorage leaves the app
 * working with the defaults, a resumed match keeps its own settings while the setup for the next match stays
 * saved, and "new match" puts the saved setup back into the form.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { BUILT_IN_CATEGORIES, defaultSetupSettings } from '../../js/core/config.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { chooseCategories, chooseLevels } from './helpers/play.mjs';

const KEY = 'spy_setup_settings';
const TOGGLES = {
    fool: 'toggle-fool',
    detective: 'toggle-detective',
    knownSpies: 'toggle-known',
    director: 'toggle-director',
    oneword: 'toggle-oneword',
    quests: 'toggle-quests',
    wager: 'toggle-wager',
    sudden: 'toggle-sudden',
    voteLimitEnabled: 'toggle-limit',
    roleRevealConfirm: 'toggle-role-reveal-confirm',
    voteConfirm: 'toggle-vote-confirm',
    quickVoting: 'toggle-quick-voting',
    spyLastChance: 'toggle-last-chance'
};
const KEYS = Object.keys(defaultSetupSettings());

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

/** Run `fn(page, context)` on a fresh phone-sized page, and fail on any script error it raised. */
async function withApp(fn, { beforeLoad } = {}) {
    const context = await browser.newContext({ viewport: PHONE });
    const { page, problems } = await newPage(context);
    try {
        if (beforeLoad) await beforeLoad(context);
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page, context);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const openSetup = async (page) => {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
};

/** What the setup screen shows, as settings in the key order of the defaults, plus what the page does with it. */
const readSetup = (page) =>
    page.evaluate(
        ({ keys, toggles }) => {
            const ticked = (name) => [...document.querySelectorAll(`input[name="${name}"]`)].filter((el) => el.checked).map((el) => el.value);
            const shown = {
                playersCount: Number(document.getElementById('setup-players-count').value),
                spiesCount: Number(document.getElementById('setup-spies-count').value),
                timerMin: Number(document.getElementById('setup-timer').value),
                cats: ticked('setup-cat'),
                diff: ticked('setup-diff'),
                revealHold: document.getElementById('setup-reveal-mode').value === 'hold',
                hints: ticked('setup-hint'),
                maxVotes: Number(document.getElementById('setup-max-votes').value)
            };
            for (const [key, id] of Object.entries(toggles)) shown[key] = document.getElementById(id).checked;
            return Object.fromEntries(keys.map((key) => [key, shown[key]]));
        },
        { keys: KEYS, toggles: TOGGLES }
    );

/** The parts of the setup screen that follow the values: the look of the chips, the emergency-vote box, the name inputs. */
const readSetupLooks = (page) =>
    page.evaluate(() => {
        const lit = (id) => [...document.querySelectorAll(`#${id} input`)].filter((el) => el.closest('label').classList.contains('is-checked')).map((el) => el.value);
        return {
            litCats: lit('category-chips-container'),
            litDiffs: lit('difficulty-chips-container'),
            litHints: lit('hint-chips-container'),
            voteLimitBoxHidden: document.getElementById('vote-limit-box').classList.contains('hidden'),
            nameInputs: document.querySelectorAll('#name-inputs-container input').length,
            spiesHint: document.getElementById('spies-limit-hint').textContent
        };
    });

const storedRecord = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

const tapSwitch = (page, id) => page.locator('label.switch', { has: page.locator(`#${id}`) }).click();
const tapHint = (page, value) => page.locator('#hint-chips-container label', { has: page.locator(`input[value="${value}"]`) }).click();

/** Type into a number field and leave it, as a person does (the `change` event fires when the field loses focus). */
async function typeNumber(page, id, value) {
    await page.fill(`#${id}`, String(value));
    await page.press(`#${id}`, 'Tab');
}

/** On the setup screen: change the form until it shows `want`, from the defaults. Taps only, no scripts. */
async function chooseSetup(page, want) {
    await typeNumber(page, 'setup-players-count', want.playersCount);
    await typeNumber(page, 'setup-spies-count', want.spiesCount);
    await typeNumber(page, 'setup-timer', want.timerMin);
    await chooseCategories(page, want.cats);
    await chooseLevels(page, want.diff);
    if (want.revealHold) await page.selectOption('#setup-reveal-mode', 'hold');
    // Turn the default hint off last: the form must keep at least one hint chip on.
    for (const hint of want.hints) if (hint !== 'related_word') await tapHint(page, hint);
    if (!want.hints.includes('related_word')) await tapHint(page, 'related_word');
    const defaults = defaultSetupSettings();
    for (const [key, id] of Object.entries(TOGGLES)) if (want[key] !== defaults[key]) await tapSwitch(page, id);
    if (want.voteLimitEnabled) await typeNumber(page, 'setup-max-votes', want.maxVotes);
}

/** A setup that differs from the defaults in every field and starts with 6 players. */
const CHOSEN = {
    playersCount: 6,
    spiesCount: 2,
    timerMin: 7,
    cats: ['jobs', 'sports', 'events'],
    diff: ['medium', 'hard'],
    revealHold: true,
    hints: ['category', 'first_letter'],
    fool: true,
    detective: false,
    knownSpies: true,
    director: true,
    oneword: false,
    quests: true,
    wager: true,
    sudden: true,
    voteLimitEnabled: true,
    maxVotes: 5,
    roleRevealConfirm: false,
    voteConfirm: true,
    quickVoting: true,
    spyLastChance: false
};

/** Hand the phone round: every role card is opened once, then the discussion starts. */
async function revealAll(page, players) {
    await page.waitForSelector('#screen-reveal:not(.hidden)');
    for (let i = 0; i < players; i++) {
        await page.locator('#reveal-grid button:not([disabled])').first().click();
        await page.click('#handoff-action');
        await page.waitForSelector('#role-modal:not(.hidden)');
        await page.click('#btn-role-close');
        await page.waitForSelector('#role-modal.hidden', { state: 'attached' });
    }
    await page.click('#btn-start-discussion');
    await page.waitForSelector('#screen-timer:not(.hidden)');
}

/** From the discussion screen: end the match, confirm, and press "new match" on the final scoreboard. */
async function endMatchAndStartNew(page) {
    await page.click('#btn-confirm-end-1');
    await page.waitForSelector('#confirm-modal:not(.hidden)');
    await page.click('#btn-confirm-yes');
    await page.waitForSelector('#screen-leaderboard:not(.hidden)');
    await page.click('#btn-reset-match');
    await page.waitForSelector('#screen-welcome:not(.hidden)');
}

const savedMatchSettings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('spy_full_state_master')).state.settings);

describe('remembering the match settings (production build)', () => {
    it('a first visit shows the defaults and has saved nothing', async () => {
        await withApp(async (page) => {
            assert.equal(await storedRecord(page), null);
            await openSetup(page);
            assert.deepEqual(await readSetup(page), defaultSetupSettings());
            assert.equal(await storedRecord(page), null, 'looking at the setup saves nothing');
        });
    });

    it('changes several values, starts a match, reloads: the setup screen shows them', async () => {
        await withApp(async (page) => {
            await openSetup(page);
            await chooseSetup(page, CHOSEN);
            assert.deepEqual(await readSetup(page), CHOSEN, 'the form shows what was chosen before starting');
            await page.fill('#name-inputs-container input >> nth=0', 'Zahra');
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');

            const raw = await storedRecord(page);
            assert.deepEqual(JSON.parse(raw), { version: 1, settings: CHOSEN });
            assert.ok(!raw.includes('Zahra'), 'the player names are not part of the record');
            assert.deepEqual(
                (await page.evaluate(() => JSON.parse(localStorage.getItem('spy_saved_player_names'))))[0],
                'Zahra',
                'they are still saved on their own, as before'
            );

            await page.reload();
            await page.waitForSelector('#recovery-banner:not(.hidden)');
            await openSetup(page);
            assert.deepEqual(await readSetup(page), CHOSEN, 'after the reload');
            assert.deepEqual(await readSetupLooks(page), {
                litCats: CHOSEN.cats,
                litDiffs: CHOSEN.diff,
                litHints: CHOSEN.hints,
                voteLimitBoxHidden: false,
                nameInputs: CHOSEN.playersCount,
                // 6 players allow 2 spies, written in Persian digits: the hint follows the restored player count.
                spiesHint: fa['setup.limit.spies.other'].replace('{count}', '۶').replace('{max}', '۲')
            });
            assert.equal(await page.locator('#name-inputs-container input').first().inputValue(), 'Zahra');
            assert.equal(await page.isVisible('#vote-limit-box'), true);
            assert.equal(await page.locator('#setup-max-votes').inputValue(), '5');
        });
    });

    it('the values come back in English too, and the language is not part of them', async () => {
        await withApp(async (page) => {
            await page.click('#btn-lang-en');
            await openSetup(page);
            await chooseSetup(page, CHOSEN);
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            assert.deepEqual(Object.keys(JSON.parse(await storedRecord(page)).settings), KEYS);

            await page.reload();
            await page.waitForSelector('#recovery-banner:not(.hidden)');
            await openSetup(page);
            assert.deepEqual(await readSetup(page), CHOSEN);
        });
    });

    it('"new match" puts the saved setup back into the form', async () => {
        await withApp(async (page) => {
            await openSetup(page);
            await typeNumber(page, 'setup-timer', 9);
            await tapSwitch(page, 'toggle-wager');
            await page.click('#btn-start-match');
            await revealAll(page, 4);
            const saved = { ...defaultSetupSettings(), timerMin: 9, wager: true };
            assert.deepEqual(JSON.parse(await storedRecord(page)).settings, saved);

            // The hidden form is changed behind the match's back; what "new match" shows must be the saved setup.
            await page.evaluate(() => {
                document.getElementById('setup-timer').value = '13';
                document.getElementById('toggle-director').checked = true;
                document.getElementById('toggle-wager').checked = false;
                document.querySelector('input[name="setup-diff"][value="easy"]').checked = false;
            });
            await endMatchAndStartNew(page);
            await openSetup(page);
            assert.deepEqual(await readSetup(page), saved);
            assert.equal(await storedRecord(page), JSON.stringify({ version: 1, settings: saved }), 'and nothing was rewritten');
        });
    });

    it('a resumed match keeps its own settings; the setup saved for the next match stays as it is', async () => {
        await withApp(async (page) => {
            const match = { ...defaultSetupSettings(), playersCount: 5, spiesCount: 2, timerMin: 9, wager: true, cats: ['animals'], diff: ['hard'] };
            await openSetup(page);
            await chooseSetup(page, match);
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            const matchSettings = await savedMatchSettings(page);
            assert.deepEqual(matchSettings, { ...match, detectiveUsed: false });

            // Another setup is saved for the next match (as if an earlier visit had left it), then the page is reloaded.
            const next = { ...defaultSetupSettings(), playersCount: 8, spiesCount: 3, timerMin: 2, cats: ['events'], diff: ['easy'], director: true };
            await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, JSON.stringify({ version: 1, settings: next })]);
            const rawNext = await storedRecord(page);
            await page.reload();
            await page.waitForSelector('#recovery-banner:not(.hidden)');

            await openSetup(page);
            assert.deepEqual(await readSetup(page), next, 'the setup screen shows the saved setup');
            assert.equal((await readSetupLooks(page)).nameInputs, 8);
            await page.click('#btn-back-welcome-2');
            await page.click('#btn-restore-game');
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            await page.click('#btn-confirm-yes');
            await page.waitForSelector('#screen-reveal:not(.hidden)');

            assert.equal(await page.locator('#reveal-grid button').count(), 5, 'the resumed match has its own 5 players, not the 8 of the saved setup');
            assert.deepEqual(await savedMatchSettings(page), matchSettings, 'and its own settings');
            assert.equal(await storedRecord(page), rawNext, 'the saved setup was not touched by resuming');

            await revealAll(page, 5);
            assert.deepEqual(await savedMatchSettings(page), matchSettings, 'also once the discussion runs');
            await endMatchAndStartNew(page);
            await openSetup(page);
            assert.deepEqual(await readSetup(page), next, 'after the resumed match, new match shows the saved setup, not the match\'s');
        });
    });

    it('a damaged saved setup falls back field by field and keeps the good fields', async () => {
        await withApp(async (page) => {
            const damaged = {
                version: 1,
                settings: {
                    playersCount: 99,
                    spiesCount: 9,
                    timerMin: 'abc',
                    cats: ['atlantis', 'jobs'],
                    diff: [],
                    hints: ['telepathy'],
                    wager: 'yes',
                    director: true,
                    voteLimitEnabled: true,
                    maxVotes: 77,
                    names: ['Zahra'],
                    unknownOption: 1
                }
            };
            await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, JSON.stringify(damaged)]);
            await page.reload();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await openSetup(page);
            assert.deepEqual(
                await readSetup(page),
                { ...defaultSetupSettings(), playersCount: 20, spiesCount: 5, cats: ['jobs'], director: true, voteLimitEnabled: true, maxVotes: 10 }
            );
            assert.equal((await readSetupLooks(page)).nameInputs, 20);
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            assert.equal(await page.locator('#reveal-grid button').count(), 20);
        });
    });

    it('a saved setup that is not usable at all (not JSON, another version, not a record) leaves the defaults', async () => {
        for (const bad of ['{oops', 'null', '[]', JSON.stringify({ version: 2, settings: CHOSEN }), JSON.stringify(CHOSEN)]) {
            await withApp(async (page) => {
                await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, bad]);
                await page.reload();
                await page.waitForSelector('#screen-welcome:not(.hidden)');
                await openSetup(page);
                assert.deepEqual(await readSetup(page), defaultSetupSettings(), bad);
                assert.deepEqual((await readSetupLooks(page)).litCats, BUILT_IN_CATEGORIES, bad);
                await page.click('#btn-start-match');
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                assert.deepEqual(JSON.parse(await storedRecord(page)), { version: 1, settings: defaultSetupSettings() }, `${bad}: the next start writes a good record`);
            });
        }
    });

    it('a localStorage that throws leaves the app working with the defaults', async () => {
        await withApp(
            async (page) => {
                await openSetup(page);
                assert.deepEqual(await readSetup(page), defaultSetupSettings());
                await typeNumber(page, 'setup-timer', 6);
                await page.click('#btn-start-match');
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                await page.reload();
                await page.waitForSelector('#screen-welcome:not(.hidden)');
                await openSetup(page);
                assert.deepEqual(await readSetup(page), defaultSetupSettings(), 'nothing could be saved, so the defaults come back');
            },
            {
                beforeLoad: (context) =>
                    context.addInitScript(() => {
                        Object.defineProperty(window, 'localStorage', {
                            configurable: true,
                            get() {
                                throw new DOMException('blocked', 'SecurityError');
                            }
                        });
                    })
            }
        );
    });
});
