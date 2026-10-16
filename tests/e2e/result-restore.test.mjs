/**
 * End-to-end test of the round-result screen after a reload, against the PRODUCTION build in a real Chromium at
 * 360x740: a round is played through the real screens to the result, the page is reloaded, "Resume match" is
 * pressed, and what a person can read on the result screen (the winner title and its colour, the winner box, the
 * round line, the score table) must be the same as before the reload, in the language of the match.
 *
 * Before the fix the restored screen showed the static Persian default title of index.html and an empty winner
 * box, also for an English match. Three rounds are played for the cases below, and one more for the last test, to keep the run short:
 *  - English, the vote catches the only spy and the classic rule ends the round (citizens win);
 *  - English, the caught spy gets a last chance and the table records a correct guess (spies win; the box names
 *    the guesser, which no other ending does);
 *  - Persian, citizens win (the same breakage showed in Persian too: the default title is not the winner's).
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { startApp } from './helpers/app.mjs';
import { playRound, reloadAndResume, startMatch, withPage } from './helpers/play.mjs';
import { persianIn, recordScreen } from './helpers/record.mjs';

const CATALOG = { fa, en };
const COLOR_VAR = { spy: '--brand-rose', citizen: '--brand-emerald' };

const CASES = [
    {
        lang: 'en',
        label: 'English, citizens win (every spy caught)',
        lastChance: false,
        winner: 'citizen',
        reason: 'spies_eliminated',
        says: /Every spy has been caught\. You win!\s*The secret word was:/
    },
    {
        lang: 'en',
        label: 'English, the caught spy guessed the word (spies win)',
        lastChance: true,
        winner: 'spy',
        reason: 'spy_guess',
        says: /guessed the secret word/
    },
    {
        lang: 'fa',
        label: 'Persian, citizens win (every spy caught)',
        lastChance: false,
        winner: 'citizen',
        reason: 'spies_eliminated',
        says: /تمام جاسوس‌ها شناسایی شدند/
    }
];

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

/** What a person reads on the result screen, plus the title's colour as the browser draws it. */
const readResult = (page) =>
    page.evaluate((colorVar) => {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const title = document.getElementById('result-title');
        // The colour a theme variable gives, as the browser computes it (a probe, like the theme tests do).
        const probe = (name) => {
            const el = document.createElement('span');
            el.style.color = `var(${name})`;
            document.body.appendChild(el);
            const color = getComputedStyle(el).color;
            el.remove();
            return color;
        };
        return {
            htmlLang: document.documentElement.lang,
            htmlDir: document.documentElement.dir,
            title: title.textContent,
            titleColor: getComputedStyle(title).color,
            wantedColors: { spy: probe(colorVar.spy), citizen: probe(colorVar.citizen) },
            descHtml: document.getElementById('result-desc').innerHTML,
            roundLine: document.getElementById('result-round').textContent,
            visibleText: document.getElementById('screen-result').innerText.split('\n').map(norm).filter(Boolean),
            rows: [...document.querySelectorAll('#round-leaderboard-body tr')].map((tr) => norm(tr.innerText))
        };
    }, COLOR_VAR);

for (const c of CASES) {
    describe(`the result screen after a reload and "Resume match": ${c.label} (production build, 360x740)`, () => {
        it('shows the same winner title, colour, winner box and score table as before the reload', async () => {
            await withPage(browser, baseUrl, c.lang, async (page) => {
                await startMatch(page, { lastChance: c.lastChance });
                const { spyName } = await playRound(page, { verdict: 'correct' });

                // ---- Before: the screen is what the catalog says for this ending.
                const shown = await readResult(page);
                const { winner, reason, lang } = c;
                assert.equal(shown.title, CATALOG[lang][`result.title.${winner}`], 'the winner title of the match language');
                assert.equal(shown.titleColor, shown.wantedColors[winner], 'in the colour of the winner');
                assert.notEqual(shown.wantedColors.spy, shown.wantedColors.citizen, 'the two colours differ, so the check above means something');
                assert.match(shown.visibleText.join(' '), c.says, 'the winner box says how the round ended');
                assert.equal(shown.rows.length, 4, 'one table row per player');
                if (reason === 'spy_guess') assert.ok(shown.descHtml.includes(`<strong>${spyName}</strong>`), 'the guesser is named');
                if (lang === 'en') assert.deepEqual(persianIn(await recordScreen(page)), [], 'no Persian letter on the English screen');

                // The save holds the outcome, and nothing else new with it.
                const saved = await page.evaluate(() => {
                    const { state } = JSON.parse(localStorage.getItem('spy_full_state_master'));
                    return { phase: state.phase, result: state.round.result };
                });
                assert.deepEqual(saved, { phase: 'result', result: { winner, reason } });
                const recordedBefore = await recordScreen(page);

                // ---- After: reload, resume, and look again.
                await reloadAndResume(page);
                const restored = await readResult(page);
                assert.deepEqual(restored, shown, 'the restored screen is the screen that was saved');
                assert.equal(restored.htmlLang, lang, 'in the language of the match');
                assert.equal(restored.title, CATALOG[lang][`result.title.${winner}`], 'not the static default title of index.html');
                assert.notEqual(restored.descHtml, '', 'and not an empty winner box');
                assert.deepEqual(await recordScreen(page), recordedBefore, 'every visible text of the page, the way the Persian baseline records it');
            });
        });
    });
}

describe('an English match resumed on a page that opened in Persian (production build, 360x740)', () => {
    it('is drawn in English: the title and the winner box follow the saved match, not the page language', async () => {
        await withPage(browser, baseUrl, 'en', async (page) => {
            await startMatch(page, { lastChance: false });
            await playRound(page);
            const shown = await readResult(page);

            // A fresh page reads its language from `spy_lang`; make it Persian while the saved match stays English.
            await page.evaluate(() => localStorage.setItem('spy_lang', 'fa'));
            await reloadAndResume(page);
            const restored = await readResult(page);
            assert.equal(restored.htmlLang, 'en', 'resume switched the page to the language of the match');
            assert.equal(restored.title, en['result.title.citizen']);
            assert.deepEqual(restored, shown);
            assert.deepEqual(persianIn(await recordScreen(page)), [], 'no Persian letter anywhere on the restored English screen');
        });
    });
});
