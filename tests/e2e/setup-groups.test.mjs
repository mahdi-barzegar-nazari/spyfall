/**
 * End-to-end test of the four collapsible groups of the setup screen (`#setup-group-<id>`: roles, discussion,
 * stakes, speed), against the PRODUCTION build in a real Chromium at 360x740, in both languages:
 *  - the five core fields are visible at once and the options are not; the groups start closed, open and close with a
 *    click and with Enter and Space on the header, and the header is a 44 px full-width target with a visible focus ring;
 *  - every control sits in its group (the table in helpers/setupGroups.mjs), and the badge on each header counts the
 *    controls that are on, live, for every kind of control, after a restored setup (with the groups closed), after
 *    "new match", after a language switch and after the hint fallback of a start, in Persian and English digits;
 *  - the vote-limit box shows and hides right under its switch; an invalid number in it opens its group (a bad core
 *    field does not open anything);
 *  - the stored setup and the settings of the match are byte-for-byte what they were before the groups, and the open
 *    state is kept for the visit only (no storage key, nothing in the records);
 *  - no horizontal overflow at 360 px in all 8 themes in both languages, the closed screen is clearly shorter than
 *    the old flat one, the chevron turns and mirrors, reduced motion stops it, wide screens get two columns;
 *  - the recorder (helpers/record.mjs) opens the groups to read them, leaves their headers out and puts them back.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { defaultSetupSettings } from '../../js/core/config.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { persianIn, recordScreen } from './helpers/record.mjs';
import { CORE_CHIP_NAMES, CORE_FIELDS, GROUP_IDS, GROUP_OF_CONTROL, badges, groupStates, isGroupOpen, openAllSetupGroups, openSetupGroup } from './helpers/setupGroups.mjs';

const CATALOG = { fa, en };
const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
const SETUP_KEY = 'spy_setup_settings';
const MASTER_KEY = 'spy_full_state_master';
const TITLE_KEYS = { roles: 'setup.group.roles', discussion: 'setup.group.discussion', stakes: 'setup.group.stakes', speed: 'setup.group.speed' };

/** Height of `#screen-setup` in the build BEFORE the groups (measured at 360x740: one flat list of 13 switches). */
const OLD_SCREEN_HEIGHT = { fa: 2959, en: 2957 };

/** Which group each setting belongs to (the tests' own table, in terms of settings). */
const GROUP_OF_SETTING = {
    fool: 'roles', detective: 'roles', knownSpies: 'roles',
    director: 'discussion', oneword: 'discussion', quests: 'discussion', voteLimitEnabled: 'discussion',
    wager: 'stakes', sudden: 'stakes', spyLastChance: 'stakes',
    revealHold: 'speed', roleRevealConfirm: 'speed', voteConfirm: 'speed', quickVoting: 'speed'
};

/** What each badge should say for `settings`: the switches that are on, each hint chip that is on, and the hold mode. */
function expectedCounts(settings) {
    const counts = { roles: settings.hints.length, discussion: 0, stakes: 0, speed: 0 };
    for (const [key, group] of Object.entries(GROUP_OF_SETTING)) if (settings[key]) counts[group] += 1;
    return counts;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const inDigits = (lang, n) => (lang === 'fa' ? String(n).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[d]) : String(n));
const badgeText = (lang, n) => CATALOG[lang]['setup.group.badge'].replace('{n}', inDigits(lang, n));
const badgeTexts = (lang, counts) => Object.fromEntries(GROUP_IDS.map((id) => [id, badgeText(lang, counts[id])]));
const countsAsStrings = (counts) => Object.fromEntries(GROUP_IDS.map((id) => [id, String(counts[id])]));

/** A setup that differs from the defaults in many switches: counts 4, 3, 2 and 3. */
const CHOSEN = {
    ...defaultSetupSettings(),
    playersCount: 6, spiesCount: 2, timerMin: 7,
    cats: ['jobs', 'sports', 'events'], diff: ['medium', 'hard'],
    revealHold: true, hints: ['category', 'first_letter'],
    fool: true, knownSpies: true, director: true, quests: true,
    wager: true, sudden: true, voteLimitEnabled: true, maxVotes: 5,
    roleRevealConfirm: false, voteConfirm: true, quickVoting: true, spyLastChance: false
};
const DEFAULTS = defaultSetupSettings();

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
 * Open the app on a fresh page in `lang`, run `fn(page, context)`, and fail on any script error. `seed` (a settings
 * object) is put in the storage as the saved setup before the page starts; `width`/`height` size the phone.
 */
async function withApp(fn, { lang = 'fa', seed, width = PHONE.width, height = PHONE.height, reducedMotion } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, ...(reducedMotion ? { reducedMotion } : {}) });
    const { page, problems } = await newPage(context);
    try {
        if (seed) await context.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [SETUP_KEY, JSON.stringify({ version: 1, settings: seed })]);
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        if (lang === 'en') await page.click('#btn-lang-en');
        await fn(page, context);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

/** To the setup screen, and wait until its entry animation (a short fade and slide) is over, so that measurements are exact. */
const goSetup = async (page) => {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
    await page.evaluate(() => Promise.all(document.getElementById('screen-setup').getAnimations({ subtree: true }).filter((a) => a.effect.getComputedTiming().iterations !== Infinity).map((a) => a.finished)));
};
const summary = (id) => `#setup-group-${id} > summary`;
const tapSwitch = (page, id) => page.locator('label.switch', { has: page.locator(`#${id}`) }).click();
const tapHint = (page, value) => page.locator('#hint-chips-container label', { has: page.locator(`input[value="${value}"]`) }).click();
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const storageSnapshot = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])));
const visible = (page, selector) => page.isVisible(selector);
/**
 * Can the person see control `id`? A switch's checkbox is drawn as a slider and is never "visible" itself, so for a switch it is
 * its row that counts.
 */
const controlVisible = (page, id) => page.isVisible(id.startsWith('toggle-') ? `.toggle-item:has(#${id})` : `#${id}`);

/** The values the setup form holds, as settings, whether or not its groups are open. */
const readForm = (page) =>
    page.evaluate(() => {
        const ticked = (name) => [...document.querySelectorAll(`input[name="${name}"]`)].filter((el) => el.checked).map((el) => el.value);
        const box = (id) => document.getElementById(id).checked;
        return {
            playersCount: Number(document.getElementById('setup-players-count').value),
            spiesCount: Number(document.getElementById('setup-spies-count').value),
            timerMin: Number(document.getElementById('setup-timer').value),
            cats: ticked('setup-cat'),
            diff: ticked('setup-diff'),
            revealHold: document.getElementById('setup-reveal-mode').value === 'hold',
            hints: ticked('setup-hint'),
            fool: box('toggle-fool'), detective: box('toggle-detective'), knownSpies: box('toggle-known'), director: box('toggle-director'),
            oneword: box('toggle-oneword'), quests: box('toggle-quests'), wager: box('toggle-wager'), sudden: box('toggle-sudden'),
            voteLimitEnabled: box('toggle-limit'), maxVotes: Number(document.getElementById('setup-max-votes').value),
            roleRevealConfirm: box('toggle-role-reveal-confirm'), voteConfirm: box('toggle-vote-confirm'), quickVoting: box('toggle-quick-voting'),
            spyLastChance: box('toggle-last-chance')
        };
    });

async function typeNumber(page, id, value) {
    await page.fill(`#${id}`, String(value));
    await page.press(`#${id}`, 'Tab');
}

/** On the setup screen with the groups open: change the form, by taps and typing only, until it shows `want`. */
async function chooseSetup(page, want) {
    await typeNumber(page, 'setup-players-count', want.playersCount);
    await typeNumber(page, 'setup-spies-count', want.spiesCount);
    await typeNumber(page, 'setup-timer', want.timerMin);
    const cats = await page.locator('#category-chips-container input').evaluateAll((inputs) => inputs.map((input) => input.value));
    for (const value of cats) {
        const chip = page.locator('#category-chips-container label', { has: page.locator(`input[value="${value}"]`) });
        if ((await chip.locator('input').isChecked()) !== want.cats.includes(value)) await chip.click();
    }
    for (const level of ['easy', 'medium', 'hard']) {
        const chip = page.locator('#difficulty-chips-container label', { has: page.locator(`input[value="${level}"]`) });
        if ((await chip.locator('input').isChecked()) !== want.diff.includes(level)) await chip.click();
    }
    if (want.revealHold) await page.selectOption('#setup-reveal-mode', 'hold');
    for (const hint of want.hints) if (hint !== 'related_word') await tapHint(page, hint);
    if (!want.hints.includes('related_word')) await tapHint(page, 'related_word');
    const ids = { fool: 'toggle-fool', detective: 'toggle-detective', knownSpies: 'toggle-known', director: 'toggle-director', oneword: 'toggle-oneword', quests: 'toggle-quests', wager: 'toggle-wager', sudden: 'toggle-sudden', voteLimitEnabled: 'toggle-limit', roleRevealConfirm: 'toggle-role-reveal-confirm', voteConfirm: 'toggle-vote-confirm', quickVoting: 'toggle-quick-voting', spyLastChance: 'toggle-last-chance' };
    for (const [key, id] of Object.entries(ids)) if (want[key] !== DEFAULTS[key]) await tapSwitch(page, id);
    if (want.voteLimitEnabled) await typeNumber(page, 'setup-max-votes', want.maxVotes);
}

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

async function endMatchAndStartNew(page) {
    await page.click('#btn-confirm-end-1');
    await page.waitForSelector('#confirm-modal:not(.hidden)');
    await page.click('#btn-confirm-yes');
    await page.waitForSelector('#screen-leaderboard:not(.hidden)');
    await page.click('#btn-reset-match');
    await page.waitForSelector('#screen-welcome:not(.hidden)');
}

describe('the groups on the setup screen (production build)', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: the five core fields are visible at once, the options are not, and every group starts closed`, async () => {
            await withApp(async (page) => {
                await goSetup(page);
                assert.deepEqual(await groupStates(page), { roles: false, discussion: false, stakes: false, speed: false });
                for (const id of CORE_FIELDS) assert.equal(await visible(page, `#${id}`), true, id);
                for (const name of CORE_CHIP_NAMES) assert.equal(await page.locator(`input[name="${name}"]:visible`).count() > 0, true, name);
                assert.equal(await visible(page, '#category-chips-container'), true);
                assert.equal(await visible(page, '#difficulty-chips-container'), true);
                for (const id of Object.keys(GROUP_OF_CONTROL)) assert.equal(await controlVisible(page, id), false, `#${id} is hidden while its group is closed`);
                assert.equal(await page.locator('#hint-chips-container label:visible').count(), 0, 'the hint chips too');
                for (const id of ['names-section-container', 'btn-start-match', 'btn-back-welcome-2']) assert.equal(await visible(page, `#${id}`), true, id);
                // The four headers, with the titles of the language, and the badge of the defaults.
                for (const id of GROUP_IDS) {
                    assert.equal(await page.locator(`${summary(id)} .setup-group-title`).textContent(), CATALOG[lang][TITLE_KEYS[id]], `${id} title`);
                }
                assert.deepEqual((await badges(page)).text, badgeTexts(lang, expectedCounts(DEFAULTS)));
            }, { lang });
        });
    }

    it('every control is inside the group it is meant to be in, and each occurs once', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            const found = await page.evaluate((ids) => {
                const result = {};
                for (const id of ids) {
                    const matches = document.querySelectorAll(`[id="${id}"]`);
                    const details = matches[0] && matches[0].closest('details');
                    result[id] = { count: matches.length, group: details ? details.id.replace('setup-group-', '') : null };
                }
                const chips = [...document.querySelectorAll('input[name="setup-hint"]')].map((el) => el.closest('details')?.id);
                return { result, chips };
            }, Object.keys(GROUP_OF_CONTROL));
            for (const [id, group] of Object.entries(GROUP_OF_CONTROL)) assert.deepEqual(found.result[id], { count: 1, group }, id);
            assert.deepEqual(found.chips, Array(4).fill('setup-group-roles'));
            const core = await page.evaluate(() => {
                const root = document.getElementById('setup-core');
                const keys = [...root.querySelectorAll('input, select, textarea')].map((el) => el.id || `name:${el.name}`);
                return { keys: keys.filter((k, i) => keys.indexOf(k) === i), details: root.querySelectorAll('details').length };
            });
            assert.deepEqual(core, { keys: ['setup-players-count', 'setup-spies-count', 'name:setup-cat', 'name:setup-diff', 'setup-timer'], details: 0 });
        });
    });

    it('a header opens and closes with a click, with Enter and with Space, and the groups are independent', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            await page.click(summary('roles'));
            assert.deepEqual(await groupStates(page), { roles: true, discussion: false, stakes: false, speed: false });
            assert.equal(await controlVisible(page, 'toggle-detective'), true, 'the options show once the group is open');
            assert.equal(await page.locator('#hint-chips-container label:visible').count(), 4, 'and the hint chips');
            await page.click(summary('stakes'));
            assert.deepEqual(await groupStates(page), { roles: true, discussion: false, stakes: true, speed: false }, 'not an accordion');
            await page.click(summary('roles'));
            assert.equal(await isGroupOpen(page, 'roles'), false);
            assert.equal(await controlVisible(page, 'toggle-detective'), false);
            await page.click(summary('stakes'));

            for (const key of ['Enter', ' ']) {
                await page.focus(summary('discussion'));
                await page.keyboard.press(key);
                assert.equal(await isGroupOpen(page, 'discussion'), true, `open with ${JSON.stringify(key)}`);
                assert.equal(await controlVisible(page, 'toggle-director'), true);
                await page.keyboard.press(key);
                assert.equal(await isGroupOpen(page, 'discussion'), false, `closed with ${JSON.stringify(key)}`);
            }
            // Tab reaches a header from the last core field.
            await page.focus('#setup-timer');
            await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(() => document.activeElement.matches('#setup-group-roles > summary')), true);
        });
    });

    it('the header is a 44 px full-width target, with a visible focus ring when reached by keyboard', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            const geometry = await page.evaluate(() => {
                const rect = (el) => el.getBoundingClientRect();
                const core = rect(document.getElementById('setup-timer'));
                return {
                    core: { left: core.left, width: core.width },
                    headers: [...document.querySelectorAll('summary.setup-group-summary')].map((el) => ({ height: rect(el).height, left: rect(el).left, width: rect(el).width }))
                };
            });
            assert.equal(geometry.headers.length, 4);
            for (const header of geometry.headers) {
                assert.ok(header.height >= 44, `height ${header.height}`);
                assert.ok(Math.abs(header.width - geometry.core.width) <= 1 && Math.abs(header.left - geometry.core.left) <= 1, 'as wide as a core field');
            }
            await page.focus('#setup-timer');
            await page.keyboard.press('Tab');
            const ring = await page.evaluate(() => {
                const style = getComputedStyle(document.activeElement);
                return { tag: document.activeElement.tagName, style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
            });
            assert.deepEqual({ tag: ring.tag, style: ring.style }, { tag: 'SUMMARY', style: 'solid' });
            assert.ok(ring.width >= 2, `ring width ${ring.width}`);
        });
    });

    for (const lang of ['fa', 'en']) {
        it(`${lang}: the badge follows every kind of control, live: a switch, a hint chip, the card-reveal select, the vote limit`, async () => {
            await withApp(async (page) => {
                await goSetup(page);
                await openAllSetupGroups(page);
                const counts = expectedCounts(DEFAULTS);
                assert.deepEqual(await badges(page), { text: badgeTexts(lang, counts), counts: countsAsStrings(counts) });

                // Every switch: one tap changes its own badge by one (down when it was on) and no other badge.
                const switches = Object.keys(GROUP_OF_CONTROL).filter((id) => id.startsWith('toggle-'));
                assert.equal(switches.length, 13);
                for (const id of switches) {
                    const group = GROUP_OF_CONTROL[id];
                    const wasOn = await page.locator(`#${id}`).isChecked();
                    await tapSwitch(page, id);
                    const changed = { ...counts, [group]: counts[group] + (wasOn ? -1 : 1) };
                    assert.deepEqual(await badges(page), { text: badgeTexts(lang, changed), counts: countsAsStrings(changed) }, `${id} tapped`);
                    await tapSwitch(page, id);
                    assert.deepEqual(await badges(page), { text: badgeTexts(lang, counts), counts: countsAsStrings(counts) }, `${id} tapped back`);
                }

                // The hint chips: each chip that is on counts one.
                await tapHint(page, 'category');
                await tapHint(page, 'first_letter');
                assert.equal((await badges(page)).counts.roles, '3');
                await tapHint(page, 'related_word');
                assert.equal((await badges(page)).counts.roles, '2');
                await tapHint(page, 'related_word');
                await tapHint(page, 'category');
                await tapHint(page, 'first_letter');
                assert.equal((await badges(page)).counts.roles, '1');

                // The select: "hold" is on, "click" is off.
                await page.selectOption('#setup-reveal-mode', 'hold');
                assert.equal((await badges(page)).counts.speed, String(counts.speed + 1));
                await page.selectOption('#setup-reveal-mode', 'click');
                assert.equal((await badges(page)).counts.speed, String(counts.speed));
                assert.deepEqual(await badges(page), { text: badgeTexts(lang, counts), counts: countsAsStrings(counts) });
            }, { lang });
        });
    }

    for (const lang of ['fa', 'en']) {
        it(`${lang}: a saved setup is restored with every group closed, and the badges and the controls show it`, async () => {
            await withApp(async (page) => {
                await goSetup(page);
                assert.deepEqual(await groupStates(page), { roles: false, discussion: false, stakes: false, speed: false }, 'still closed after the restore');
                assert.deepEqual(await readForm(page), CHOSEN, 'the controls hold the saved values although nothing is rendered');
                const counts = expectedCounts(CHOSEN);
                assert.deepEqual(counts, { roles: 4, discussion: 3, stakes: 2, speed: 3 });
                assert.deepEqual(await badges(page), { text: badgeTexts(lang, counts), counts: countsAsStrings(counts) });
                // The vote-limit box follows its switch even though it cannot be seen yet.
                assert.equal(await page.locator('#vote-limit-box').evaluate((el) => el.classList.contains('hidden')), false);
                await openSetupGroup(page, 'discussion');
                assert.equal(await visible(page, '#vote-limit-box'), true);
                assert.equal(await page.inputValue('#setup-max-votes'), '5');
                assert.deepEqual(await readForm(page), CHOSEN);
            }, { lang, seed: CHOSEN });
        });
    }

    it('"new match" puts the saved setup back, and the badges with it', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            await openAllSetupGroups(page);
            await tapSwitch(page, 'toggle-director');
            await tapSwitch(page, 'toggle-wager');
            await page.click('#btn-start-match');
            await revealAll(page, 4);
            const saved = { ...DEFAULTS, director: true, wager: true };

            // The hidden form is changed behind the match's back, and its badges follow (they listen to the changes). The
            // switches are flipped so that the badges of three groups really differ from those of the saved setup.
            const flipped = { director: 'toggle-director', wager: 'toggle-wager', sudden: 'toggle-sudden', quests: 'toggle-quests', oneword: 'toggle-oneword', fool: 'toggle-fool', detective: 'toggle-detective', spyLastChance: 'toggle-last-chance' };
            await page.evaluate((ids) => {
                for (const id of ids) {
                    const box = document.getElementById(id);
                    box.checked = !box.checked;
                    box.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, Object.values(flipped));
            const tampered = expectedCounts(Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, key in flipped ? !saved[key] : value])));
            const savedCounts = expectedCounts(saved);
            assert.deepEqual(tampered, { roles: 3, discussion: 2, stakes: 1, speed: 1 });
            assert.deepEqual(savedCounts, { roles: 1, discussion: 1, stakes: 2, speed: 1 });
            assert.deepEqual((await badges(page)).counts, countsAsStrings(tampered), 'the badges followed the hidden form');

            await endMatchAndStartNew(page);
            await goSetup(page);
            const counts = savedCounts;
            assert.deepEqual(await readForm(page), saved);
            assert.deepEqual(await badges(page), { text: badgeTexts('fa', counts), counts: countsAsStrings(counts) }, 'after "new match" the badges show the saved setup');
        });
    });

    it('a language switch rewrites the badges in the other language and its digits, and keeps the numbers', async () => {
        await withApp(async (page) => {
            const counts = expectedCounts(CHOSEN);
            await goSetup(page);
            assert.deepEqual((await badges(page)).text, badgeTexts('fa', counts));
            await page.click('#btn-back-welcome-2');
            await page.click('#btn-lang-en');
            await goSetup(page);
            assert.deepEqual(await badges(page), { text: badgeTexts('en', counts), counts: countsAsStrings(counts) });
            assert.equal(await page.locator('#setup-group-roles-badge').textContent(), '4 on');
            for (const id of GROUP_IDS) assert.equal(await page.locator(`${summary(id)} .setup-group-title`).textContent(), en[TITLE_KEYS[id]]);
            await page.click('#btn-back-welcome-2');
            await page.click('#btn-lang-fa');
            await goSetup(page);
            assert.deepEqual(await badges(page), { text: badgeTexts('fa', counts), counts: countsAsStrings(counts) });
            assert.equal(await page.locator('#setup-group-roles-badge').textContent(), '۴ فعال');
        }, { seed: CHOSEN });
    });

    it('the hint fallback of a start (no chip ticked reads as the related word) updates the badge too', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            await openAllSetupGroups(page);
            await tapHint(page, 'category');
            await tapHint(page, 'related_word');
            await tapHint(page, 'category');
            assert.equal((await badges(page)).counts.roles, '0', 'no hint chip is on');
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            assert.equal((await badges(page)).counts.roles, '1', 'the fallback ticked the related word');
            assert.deepEqual(JSON.parse(await stored(page, SETUP_KEY)).settings.hints, ['related_word']);
        });
    });

    it('the vote-limit box appears right under its switch when the switch is on, and goes away when it is off', async () => {
        for (const width of [PHONE.width, 800]) {
            await withApp(async (page) => {
                await goSetup(page);
                await openSetupGroup(page, 'discussion');
                assert.equal(await visible(page, '#vote-limit-box'), false, 'hidden at first');
                await tapSwitch(page, 'toggle-limit');
                assert.equal(await visible(page, '#vote-limit-box'), true);
                const place = await page.evaluate(() => {
                    const row = document.getElementById('toggle-limit').closest('.toggle-item');
                    const box = document.getElementById('vote-limit-box');
                    const r = row.getBoundingClientRect();
                    const b = box.getBoundingClientRect();
                    return { nextIsBox: row.nextElementSibling === box, sameGrid: row.parentElement === box.parentElement, gap: b.top - r.bottom, inGroup: box.closest('details').id, boxWithinRowSpan: b.left <= r.left + 1 };
                });
                assert.equal(place.nextIsBox, true);
                assert.equal(place.sameGrid, true);
                assert.equal(place.inGroup, 'setup-group-discussion');
                assert.ok(place.gap >= -1 && place.gap <= 24, `the box starts ${place.gap}px below the switch row (width ${width})`);
                assert.equal(place.boxWithinRowSpan, true);
                await tapSwitch(page, 'toggle-limit');
                assert.equal(await visible(page, '#vote-limit-box'), false, 'hidden again');
            }, { width, height: 900 });
        }
    });

    it('an invalid vote-limit number opens its closed group and focuses the field; a bad core field opens nothing', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            await openSetupGroup(page, 'discussion');
            await tapSwitch(page, 'toggle-limit');
            await typeNumber(page, 'setup-max-votes', 99);
            await page.click(summary('discussion'));
            assert.equal(await isGroupOpen(page, 'discussion'), false, 'closed again, with the bad number inside');
            await page.click('#btn-start-match');
            await page.waitForFunction(() => document.getElementById('setup-group-discussion').open);
            assert.deepEqual(await groupStates(page), { roles: false, discussion: true, stakes: false, speed: false }, 'only that group opened');
            assert.equal(await page.evaluate(() => document.activeElement.id), 'setup-max-votes');
            assert.equal(await page.getAttribute('#setup-max-votes', 'aria-invalid'), 'true');
            assert.equal(await visible(page, '#setup-max-votes'), true);
            assert.equal(await page.isVisible('#screen-setup'), true, 'no match was started');
            assert.ok((await page.locator('#toast-container .toast').count()) >= 1, 'with its message');
        });
        await withApp(async (page) => {
            await goSetup(page);
            // Typing a bad number would be put right when the field is left (it is clamped), so the bad value is set directly.
            await page.evaluate(() => { document.getElementById('setup-players-count').value = '1'; });
            await page.click('#btn-start-match');
            await page.waitForFunction(() => document.activeElement.id === 'setup-players-count');
            assert.equal(await page.isVisible('#screen-setup'), true, 'no match was started');
            assert.deepEqual(await groupStates(page), { roles: false, discussion: false, stakes: false, speed: false }, 'a core field is already on screen: nothing opens');
        });
    });

    it('starting a match from the default state with every group closed works, and the records are exactly the defaults', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            assert.equal(await stored(page, SETUP_KEY), JSON.stringify({ version: 1, settings: DEFAULTS }), 'byte for byte the saved setup of the defaults');
            const master = JSON.parse(await stored(page, MASTER_KEY));
            assert.equal(JSON.stringify(master.state.settings), JSON.stringify({ ...DEFAULTS, detectiveUsed: false }), 'and the settings of the match');
            assert.equal(await page.locator('#reveal-grid button').count(), 4);
        });
    });

    it('the saved setup and the match settings of a chosen setup are byte for byte what the options mean', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            await openAllSetupGroups(page);
            await chooseSetup(page, CHOSEN);
            assert.deepEqual(await readForm(page), CHOSEN);
            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            assert.equal(await stored(page, SETUP_KEY), JSON.stringify({ version: 1, settings: CHOSEN }));
            const master = JSON.parse(await stored(page, MASTER_KEY));
            assert.equal(JSON.stringify(master.state.settings), JSON.stringify({ ...CHOSEN, detectiveUsed: false }));
        });
    });

    it('whether a group is open is kept for the visit only: nothing in the storage, nothing in the records, closed again after a reload', async () => {
        await withApp(async (page) => {
            await goSetup(page);
            const before = await storageSnapshot(page);
            await openAllSetupGroups(page);
            await page.click(summary('roles'));
            await page.click(summary('stakes'));
            assert.deepEqual(await groupStates(page), { roles: false, discussion: true, stakes: false, speed: true });
            assert.deepEqual(await storageSnapshot(page), before, 'opening and closing wrote nothing');

            // The open groups stay as they are while the person goes to the welcome screen and back.
            await page.click('#btn-back-welcome-2');
            await goSetup(page);
            assert.deepEqual(await groupStates(page), { roles: false, discussion: true, stakes: false, speed: true });

            await page.click('#btn-start-match');
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            const record = JSON.parse(await stored(page, SETUP_KEY));
            assert.deepEqual(Object.keys(record), ['version', 'settings']);
            assert.deepEqual(Object.keys(record.settings), Object.keys(DEFAULTS), 'no group or open key in the saved setup');
            const everything = JSON.stringify(await storageSnapshot(page));
            assert.doesNotMatch(everything, /setup-group|"open"/, 'nothing about the groups anywhere in the storage');

            await page.reload();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await goSetup(page);
            assert.deepEqual(await groupStates(page), { roles: false, discussion: false, stakes: false, speed: false }, 'all closed again');
        });
    });

    for (const lang of ['fa', 'en']) {
        it(`${lang}: no horizontal scroll at 360 px in any of the 8 themes: closed, with every group open, and with the vote limit box shown`, async () => {
            await withApp(async (page) => {
                await goSetup(page);
                const overflow = () =>
                    page.evaluate(() => {
                        const limit = window.innerWidth;
                        const wide = [];
                        for (const el of document.querySelectorAll('#screen-setup *')) {
                            const r = el.getBoundingClientRect();
                            if (r.width === 0 || r.height <= 1) continue;
                            if (r.right > limit + 0.5 || r.left < -0.5) wide.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
                        }
                        return { scroll: document.documentElement.scrollWidth - limit, bodyScroll: document.body.scrollWidth - limit, wide: wide.slice(0, 5) };
                    });
                for (const theme of THEMES) {
                    await page.selectOption('#theme-selector', theme);
                    assert.equal(await page.evaluate(() => document.body.getAttribute('data-theme')), theme);
                    for (const group of GROUP_IDS) if (await isGroupOpen(page, group)) await page.click(summary(group));
                    assert.deepEqual(await overflow(), { scroll: 0, bodyScroll: 0, wide: [] }, `${theme}: closed`);
                    await openAllSetupGroups(page);
                    if (!(await page.locator('#toggle-limit').isChecked())) await tapSwitch(page, 'toggle-limit');
                    assert.equal(await visible(page, '#vote-limit-box'), true);
                    assert.deepEqual(await overflow(), { scroll: 0, bodyScroll: 0, wide: [] }, `${theme}: every group open`);
                }
            }, { lang });
        });
    }

    for (const lang of ['fa', 'en']) {
        it(`${lang}: the closed screen is clearly shorter than the old flat one`, async () => {
            await withApp(async (page) => {
                await goSetup(page);
                const height = () => page.evaluate(() => document.getElementById('screen-setup').getBoundingClientRect().height);
                const closed = await height();
                assert.ok(closed < OLD_SCREEN_HEIGHT[lang] * 0.7, `closed ${Math.round(closed)}px against ${OLD_SCREEN_HEIGHT[lang]}px before`);
                await openAllSetupGroups(page);
                assert.ok((await height()) > closed + 300, 'and the groups do hold the options');
            }, { lang });
        });
    }

    it('the chevron points to the end when closed, down when open, mirrors in RTL, and does not animate with reduced motion', async () => {
        const matrix = (page, id) => page.locator(`${summary(id)} .setup-group-chevron`).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform));
        const angle = (m) => Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
        const angles = {};
        for (const lang of ['fa', 'en']) {
            await withApp(async (page) => {
                await goSetup(page);
                const closed = angle(await matrix(page, 'roles'));
                await page.click(summary('roles'));
                await page.waitForTimeout(400);
                const open = angle(await matrix(page, 'roles'));
                angles[lang] = { closed, open };
            }, { lang });
        }
        assert.deepEqual(angles.en, { closed: -45, open: 45 }, 'LTR: points right when closed, down when open');
        assert.deepEqual(angles.fa, { closed: 45, open: -45 }, 'RTL: the mirror image');

        await withApp(async (page) => {
            await goSetup(page);
            const duration = () => page.locator(`${summary('roles')} .setup-group-chevron`).evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
            assert.ok(Math.abs((await duration()) - 0.2) < 1e-6);
        });
        await withApp(async (page) => {
            await goSetup(page);
            const duration = await page.locator(`${summary('roles')} .setup-group-chevron`).evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
            assert.ok(duration <= 0.001, `reduced motion: ${duration}s`);
        }, { reducedMotion: 'reduce' });
    });

    it('a wide screen gets two columns of switches, a phone one', async () => {
        const columns = async (page) => {
            await goSetup(page);
            await openSetupGroup(page, 'stakes');
            return page.evaluate(() => [...document.querySelectorAll('#setup-group-stakes .toggle-item')].map((el) => Math.round(el.getBoundingClientRect().top)));
        };
        await withApp(async (page) => {
            const tops = await columns(page);
            assert.equal(new Set(tops).size, 3, `one column at 360 px: ${tops}`);
        });
        await withApp(async (page) => {
            const tops = await columns(page);
            assert.equal(tops[0], tops[1], `two columns on a wide screen: ${tops}`);
            assert.ok(tops[2] > tops[0]);
        }, { width: 900, height: 900 });
    });

    for (const lang of ['fa', 'en']) {
        it(`${lang}: the recorder opens the groups to read them, leaves their headers out, and puts them back as they were`, async () => {
            await withApp(async (page) => {
                await goSetup(page);
                await page.click(summary('stakes'));
                const catalog = CATALOG[lang];
                const recording = await recordScreen(page);
                assert.deepEqual(await groupStates(page), { roles: false, discussion: false, stakes: true, speed: false }, 'the open state is restored');
                assert.equal(await page.evaluate(() => [...document.querySelectorAll('summary.setup-group-summary')].every((el) => el.style.display === '')), true, 'and so are the headers');
                for (const key of ['setup.toggle.detective', 'setup.toggle.wager', 'setup.toggle.quickVoting', 'setup.reveal.label', 'setup.hints.label']) {
                    assert.ok(recording.text.includes(catalog[key]), `${key} is in the recording although its group is closed`);
                }
                for (const title of Object.values(TITLE_KEYS)) assert.ok(!recording.text.includes(catalog[title]), `the header "${catalog[title]}" is not in the recording`);
                for (const n of [0, 1]) assert.ok(!recording.text.includes(badgeText(lang, n)), `the badge "${badgeText(lang, n)}" is not in the recording`);
                assert.ok(recording.attrs.every((a) => !a.startsWith('summary')));
                if (lang === 'en') assert.deepEqual(persianIn(recording), [], 'no Persian letter anywhere in the English setup screen, groups included');

                const asSeen = await recordScreen(page, { openGroups: false });
                assert.ok(asSeen.text.includes(catalog['setup.toggle.wager']), 'the open group is in the screen as it is');
                assert.ok(!asSeen.text.includes(catalog['setup.toggle.detective']), 'a closed group is not');
                assert.deepEqual(await groupStates(page), { roles: false, discussion: false, stakes: true, speed: false });
            }, { lang });
        });
    }
});
