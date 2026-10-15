/**
 * End-to-end test of the round number on the round-result screen (#result-round, under #result-title), against
 * the PRODUCTION build in a real Chromium at 360x740, in both languages:
 *  - after two real rounds the screen shows the second round's number ("Round 2" / the Persian wording with a
 *    Persian digit), and the first round's number before that;
 *  - it is one small secondary line directly under the title, centred, inside the screen, readable in all 8 themes,
 *    and an empty one takes no room;
 *  - after a reload and "Resume match" the screen shows the number the match was saved with, and the next round
 *    goes on counting.
 * A round is played through the real screens: the roles are read from the role cards, every player votes for the
 * spy (the spy for someone else), "last chance" is off so the vote ends the round, quick voting is on.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { persianIn, recordScreen } from './helpers/record.mjs';

const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
const WANTED = {
    fa: { 1: 'دست ۱', 2: 'دست ۲', 3: 'دست ۳' },
    en: { 1: 'Round 1', 2: 'Round 2', 3: 'Round 3' }
};
const CITIZENS_WIN_TITLE = { fa: fa['result.title.citizen'], en: en['result.title.citizen'] };
const PLAYERS = 4;

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

/** From the welcome screen: set the options this test needs and start a match. Ends on the role reveal. */
async function startMatch(page) {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
    await page.evaluate(() => {
        document.getElementById('toggle-last-chance').checked = false;
        document.getElementById('toggle-quick-voting').checked = true;
    });
    await page.click('#btn-start-match');
}

/** From the role reveal of a round to its result screen. The spy is found by opening every role card. */
async function playRound(page) {
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
    await page.waitForSelector('#screen-result:not(.hidden)');
    // The screen fades in over 0.38 s (a transform): measure only once it has settled.
    await page.waitForFunction(() => document.getElementById('screen-result').getAnimations().length === 0);
}

const roundLine = (page) => page.textContent('#result-round');

/** Reload the page and press "Resume match" (and confirm), as a person coming back to the app would. */
async function reloadAndResume(page) {
    await page.reload();
    await page.waitForSelector('#recovery-banner:not(.hidden)');
    await page.click('#btn-restore-game');
    await page.waitForSelector('#confirm-modal:not(.hidden)');
    await page.click('#btn-confirm-yes');
    await page.waitForSelector('#screen-result:not(.hidden)');
    await page.waitForFunction(() => document.getElementById('screen-result').getAnimations().length === 0);
}

/** Size, place and colours of the line and of what is around it, as the browser draws them right now. */
const measure = (page) =>
    page.evaluate(() => {
        const style = (el) => getComputedStyle(el);
        const box = (el) => el.getBoundingClientRect();
        const line = document.getElementById('result-round');
        const title = document.getElementById('result-title');
        const winner = document.querySelector('#screen-result .secret-box');
        const text = document.createRange();
        text.selectNodeContents(line);
        // What an existing secondary text looks like in this theme.
        const probe = document.createElement('span');
        probe.className = 'color-secondary';
        document.body.appendChild(probe);
        const secondaryColor = style(probe).color;
        probe.remove();
        const channels = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);
        return {
            text: line.textContent,
            display: style(line).display,
            color: style(line).color,
            secondaryColor,
            channels: channels(style(line).color),
            card: channels(style(document.getElementById('main-content-root')).backgroundColor),
            fontSize: parseFloat(style(line).fontSize),
            titleFontSize: parseFloat(style(title).fontSize),
            direction: style(line).direction,
            htmlDir: document.documentElement.dir,
            textAlign: style(line).textAlign,
            line: box(line),
            ink: box(text),
            title: box(title),
            winner: box(winner),
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            nextOfTitle: title.nextElementSibling && title.nextElementSibling.id
        };
    });

/** WCAG contrast ratio of two sRGB colours given as [r, g, b]. */
function contrast(foreground, background) {
    const luminance = ([red, green, blue]) => {
        const linear = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    };
    const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
}

for (const lang of ['fa', 'en']) {
    describe(`the round number on the result screen, ${lang === 'fa' ? 'Persian' : 'English'} (production build, 360x740)`, () => {
        it('shows the first round\'s number, and after two rounds the second round\'s, without touching the title', async () => {
            await withPage(lang, async (page) => {
                await startMatch(page);
                await playRound(page);
                assert.equal(await roundLine(page), WANTED[lang][1], 'after round 1');
                assert.equal(await page.textContent('#result-title'), CITIZENS_WIN_TITLE[lang], 'the title is the winner title, as before');
                assert.equal(await page.evaluate(() => document.getElementById('result-title').nextElementSibling.id), 'result-round', 'the line is directly after the title');

                await page.click('#btn-next-round');
                await playRound(page);
                assert.equal(await roundLine(page), WANTED[lang][2], 'after round 2');
                assert.equal(await page.textContent('#result-title'), CITIZENS_WIN_TITLE[lang]);
                assert.ok(await page.isVisible('#result-round'));

                if (lang === 'en') {
                    assert.deepEqual(persianIn(await recordScreen(page)), [], 'the English result screen has no Persian letter');
                } else {
                    assert.doesNotMatch(await roundLine(page), /[0-9]/, 'Persian digits only');
                }
            });
        });

        it('is one small secondary line directly under the title, centred and inside the screen, in all 8 themes; an empty one takes no room', async () => {
            await withPage(lang, async (page) => {
                await startMatch(page);
                await playRound(page);
                for (const theme of THEMES) {
                    await page.selectOption('#theme-selector', theme);
                    const m = await measure(page);
                    const where = `${lang}/${theme}`;
                    assert.equal(m.text, WANTED[lang][1], `${where}: text`);
                    assert.notEqual(m.display, 'none', `${where}: visible`);
                    assert.equal(m.color, m.secondaryColor, `${where}: the colour of the existing secondary text`);
                    assert.ok(contrast(m.channels, m.card) >= 4.5, `${where}: contrast ${contrast(m.channels, m.card).toFixed(2)}:1 is below 4.5:1`);
                    assert.ok(m.fontSize >= 12 && m.fontSize <= 14, `${where}: small text, ${m.fontSize}px`);
                    assert.ok(m.fontSize < m.titleFontSize / 1.5, `${where}: much smaller than the title (${m.fontSize}px vs ${m.titleFontSize}px)`);
                    // Directly under the title, and clear of the winner box below.
                    const gap = m.line.top - m.title.bottom;
                    assert.ok(gap >= 0 && gap <= 8, `${where}: ${gap}px between title and line (the heading alone would leave 12)`);
                    assert.ok(m.winner.top - m.line.bottom >= 8, `${where}: room above the winner box (${m.winner.top - m.line.bottom}px)`);
                    // Inside a 360 px screen, no sideways scrolling, centred in either direction.
                    assert.ok(m.ink.left >= 0 && m.ink.right <= m.innerWidth, `${where}: the text is inside the screen`);
                    assert.ok(m.scrollWidth <= m.innerWidth, `${where}: no sideways scrolling`);
                    assert.equal(m.textAlign, 'center', `${where}: centred`);
                    const lineCentre = (m.line.left + m.line.right) / 2;
                    const inkCentre = (m.ink.left + m.ink.right) / 2;
                    assert.ok(Math.abs(lineCentre - inkCentre) <= 1.5, `${where}: the text sits in the middle (${inkCentre} vs ${lineCentre})`);
                    assert.equal(m.direction, m.htmlDir, `${where}: the line follows the page direction`);
                }

                // A line with no text (a damaged save has no usable round number) takes no room.
                const gapOf = () => page.evaluate(() => document.querySelector('#screen-result .secret-box').getBoundingClientRect().top - document.getElementById('result-title').getBoundingClientRect().bottom);
                const withLine = await gapOf();
                await page.evaluate(() => (document.getElementById('result-round').textContent = ''));
                assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('result-round')).display), 'none', 'an empty line is hidden');
                assert.ok((await gapOf()) < withLine, 'and the winner box moves up by the height of the line');
            });
        });

        it('after a reload and "Resume match" shows the saved round number, and the next round goes on counting', async () => {
            await withPage(lang, async (page) => {
                await startMatch(page);
                await playRound(page);
                await page.click('#btn-next-round');
                await playRound(page);
                assert.equal(await roundLine(page), WANTED[lang][2]);
                const saved = await page.evaluate(() => {
                    const { state } = JSON.parse(localStorage.getItem('spy_full_state_master'));
                    return { phase: state.phase, num: state.round.num };
                });
                assert.deepEqual(saved, { phase: 'result', num: 2 }, 'the counter is in the save');

                await reloadAndResume(page);
                assert.equal(await roundLine(page), WANTED[lang][2], 'the restored result screen shows round 2, not round 1 or 3');
                assert.equal(await page.evaluate(() => document.documentElement.lang), lang);

                await page.click('#btn-next-round');
                await playRound(page);
                assert.equal(await roundLine(page), WANTED[lang][3], 'round 3 after the restore');
            });
        });
    });
}
