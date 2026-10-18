/**
 * Plays real rounds through the real screens of the production build, for the browser tests that need a
 * round-result screen to look at. Every step is a click a player would make: the roles are read from the role
 * cards (the spy is the card with the spy badge), every player votes for the spy (the spy for someone else),
 * quick voting is on, and the round ends with the spy caught.
 *
 * With `lastChance` off (the classic rule) the vote ends the round at once. With it on, the caught spy gets the
 * guess screen and `verdict` says which button the table presses ('correct', 'wrong' or 'pass').
 */
import assert from 'node:assert/strict';
import { PHONE, newPage } from './app.mjs';

export const PLAYERS = 4;

/** Open the app on a fresh phone-sized page in `lang`, run `fn(page)`, and fail on any script error. */
export async function withPage(browser, baseUrl, lang, fn) {
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

/**
 * From the welcome screen: set the options these tests need and start a match. Ends on the role reveal.
 * `levels` (optional) is the difficulty levels to leave ticked, e.g. ['medium', 'hard']: the other chips are
 * tapped off, as a player would. Left out, the three chips keep their default (all ticked).
 * `cats` (optional) is the category chips to leave ticked, e.g. ['events', 'custom'], the same way. Left out, the
 * category chips keep their default (the eight built-in ones ticked, the custom one not).
 */
export async function startMatch(page, { lastChance = false, levels, cats } = {}) {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
    if (levels) await chooseLevels(page, levels);
    if (cats) await chooseCategories(page, cats);
    await page.evaluate((lastChanceOn) => {
        document.getElementById('toggle-last-chance').checked = lastChanceOn;
        document.getElementById('toggle-quick-voting').checked = true;
    }, lastChance);
    await page.click('#btn-start-match');
}

/** On the setup screen: tap the difficulty chips until exactly the levels in `levels` are ticked. */
export async function chooseLevels(page, levels) {
    for (const level of ['easy', 'medium', 'hard']) {
        const chip = page.locator('#difficulty-chips-container label', { has: page.locator(`input[value="${level}"]`) });
        const ticked = await chip.locator('input').isChecked();
        if (ticked !== levels.includes(level)) await chip.click();
    }
}

/** On the setup screen: tap the category chips until exactly the categories in `cats` are ticked. */
export async function chooseCategories(page, cats) {
    const values = await page.locator('#category-chips-container input').evaluateAll((inputs) => inputs.map((input) => input.value));
    for (const value of values) {
        const chip = page.locator('#category-chips-container label', { has: page.locator(`input[value="${value}"]`) });
        const ticked = await chip.locator('input').isChecked();
        if (ticked !== cats.includes(value)) await chip.click();
    }
}

/**
 * From the role reveal of a round to its result screen. Returns `{ spyName }`, the name on the spy's role card.
 * `verdict` is only used when the caught spy gets a last chance.
 */
export async function playRound(page, { verdict = 'correct' } = {}) {
    await page.waitForSelector('#screen-reveal:not(.hidden)');
    let spyName = null;
    for (let i = 0; i < PLAYERS; i++) {
        await page.locator('#reveal-grid button:not([disabled])').first().click();
        await page.click('#handoff-action');
        await page.waitForSelector('#role-modal:not(.hidden)');
        const card = await page.evaluate(() => ({
            isSpy: document.getElementById('modal-role-badge').classList.contains('role-spy'),
            name: document.getElementById('modal-player-name').textContent
        }));
        if (card.isSpy) spyName = card.name;
        await page.click('#btn-role-close');
        await page.waitForSelector('#role-modal.hidden', { state: 'attached' });
    }
    assert.ok(spyName, 'one of the cards was the spy');

    await page.click('#btn-start-discussion');
    await page.waitForSelector('#screen-timer:not(.hidden)');
    await page.click('#btn-emergency-vote');
    await page.waitForSelector('#screen-vote:not(.hidden)');

    for (let i = 0; i < PLAYERS; i++) {
        const own = await page.locator('#vote-grid button[disabled]').first().textContent();
        const targets = await page.locator('#vote-grid button:not([disabled])').allTextContents();
        const target = targets.includes(spyName) ? spyName : targets[0];
        await page.locator('#vote-grid button:not([disabled])', { hasText: target }).first().click();
        // The grid is drawn again for the next voter: wait until it names someone else as "you".
        if (i < PLAYERS - 1) {
            await page.waitForFunction((previous) => {
                const mine = document.querySelector('#vote-grid button[disabled]');
                return mine && mine.textContent !== previous;
            }, own);
        }
    }
    await page.waitForSelector('#elimination-reveal:not(.hidden)');
    await page.click('#btn-elim-continue');
    if (await page.evaluate(() => JSON.parse(localStorage.getItem('spy_full_state_master')).state.settings.spyLastChance !== false)) {
        await page.waitForSelector('#screen-guess:not(.hidden)');
        await page.click(`#btn-guess-${verdict}`);
    }
    await page.waitForSelector('#screen-result:not(.hidden)');
    await settle(page);
    return { spyName };
}

/** The screen fades in over 0.38 s (a transform): look at it only once it has settled. */
export async function settle(page) {
    await page.waitForFunction(() => document.getElementById('screen-result').getAnimations().length === 0);
}

/** Reload the page and press "Resume match" (and confirm), as a person coming back to the app would. */
export async function reloadAndResume(page) {
    await page.reload();
    await page.waitForSelector('#recovery-banner:not(.hidden)');
    await page.click('#btn-restore-game');
    await page.waitForSelector('#confirm-modal:not(.hidden)');
    await page.click('#btn-confirm-yes');
    await page.waitForSelector('#screen-result:not(.hidden)');
    await settle(page);
}
