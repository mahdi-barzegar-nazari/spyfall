/**
 * End-to-end test of the scorecard image against the PRODUCTION build in a real Chromium at 360x740: a finished
 * match of 20 players (1st, 2nd, a 9-way tie for 3rd, then 9 single ranks) is opened on the final leaderboard and
 * "Save the scorecard image" is pressed. The image is a canvas, so what it says is read from the text the page
 * draws (every `fillText` call is recorded), not from pixels (the pixels of the worst cases were looked at by eye).
 *
 * Before the fix the podium said "C and 8 others (tied)" and the other 8 tied players were in the image nowhere:
 * the list under the podium only held rank 4 and below. Now they come first in that list with rank 3 and the
 * tied marker, so every one of the 20 names is in the image. Both languages are checked (Persian is right to
 * left, English is the mirror image), and the on-screen leaderboard must list all 20 as well.
 * The match is not played through the screens (that is what the other tests do): a 4-player match is started
 * for real, its save is replaced by a finished 20-player one, and the page is reloaded and resumed, which is
 * how a person gets back to a finished match.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { startApp } from './helpers/app.mjs';
import { startMatch, withPage } from './helpers/play.mjs';

const CATALOG = { fa, en };
const NAMES = {
    en: ['Ava', 'Ben', 'Cleo', 'Dan', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kai', 'Lena', 'Milo', 'Nora', 'Otto', 'Pia', 'Quin', 'Rae', 'Sol', 'Tess'],
    fa: ['آوا', 'بهنام', 'کیمیا', 'دانیال', 'الهام', 'فرهاد', 'گلناز', 'هستی', 'ایمان', 'ژیلا', 'کامی', 'لیلی', 'مهران', 'نسیم', 'امید', 'پگاه', 'قاسم', 'یاسمن', 'سمیرا', 'تینا']
};
// Players in ranking order: 1st, 2nd, nine tied for 3rd, then nine more ranks (4th to 12th).
const SIZES = [1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1];
// The checks below find a name inside a drawn text, so no name may be part of another one ("Ann" in "Hannah").
for (const list of Object.values(NAMES)) {
    for (const a of list) for (const b of list) if (a !== b && b.includes(a)) throw new Error(`test data: \"${a}\" is inside \"${b}\"`);
}
const BIDI_MARKS = /[\u2066-\u2069]/g;
const toLatinDigits = (text) => text.replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

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

/** The save of the real 4-player match, turned into a finished match of `names.length` players on the leaderboard. */
function finishedSave(rawSave, names) {
    const save = JSON.parse(rawSave);
    const template = save.state.players[0];
    let index = 0;
    save.state.players = [];
    SIZES.forEach((size, group) => {
        for (let k = 0; k < size; k++, index++) {
            save.state.players.push({ ...structuredClone(template), id: `e2e${index}`, name: names[index], score: 100 - group * 3, stats: { ...template.stats, hiddenTieBreakerScore: 0 } });
        }
    });
    save.state.phase = 'leaderboard';
    save.state.round.num = 7;
    return JSON.stringify(save);
}

/** Start a match, swap in the finished save, reload, resume, open "Save the scorecard image" and return what it drew. */
async function drawScorecard(lang) {
    const names = NAMES[lang];
    const result = {};
    await withPage(browser, baseUrl, lang, async (page) => {
        await startMatch(page);
        await page.waitForSelector('#screen-reveal:not(.hidden)');
        const rawSave = await page.evaluate(() => localStorage.getItem('spy_full_state_master'));
        const save = finishedSave(rawSave, names);
        // Runs in the reloaded page before the app starts, so the app sees the finished match; and it records the canvas text.
        await page.addInitScript((value) => {
            localStorage.setItem('spy_full_state_master', value);
            window.__drawn = [];
            const proto = CanvasRenderingContext2D.prototype;
            const fillText = proto.fillText;
            proto.fillText = function (text, x, y, ...rest) {
                window.__drawn.push({ text: String(text), x, y, align: this.textAlign });
                return fillText.call(this, text, x, y, ...rest);
            };
            HTMLAnchorElement.prototype.click = function () {}; // no real download
        }, save);
        await page.reload();
        await page.waitForSelector('#recovery-banner:not(.hidden)');
        await page.click('#btn-restore-game');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        await page.click('#btn-confirm-yes');
        await page.waitForSelector('#screen-leaderboard:not(.hidden)');

        result.screenRows = await page.evaluate(() => [...document.querySelectorAll('#final-leaderboard-body tr')].map((tr) => tr.querySelector('th').textContent));

        await page.click('#btn-export-image');
        const footer = CATALOG[lang]['welcome.credit.author'];
        await page.waitForFunction((text) => window.__drawn.some((d) => d.text === text), footer);
        result.drawn = await page.evaluate(() => window.__drawn);
        result.size = await page.evaluate(() => {
            const canvas = document.getElementById('scorecard-canvas');
            return [canvas.width, canvas.height];
        });
    });
    return result;
}

for (const lang of ['en', 'fa']) {
    describe(`20 players, a 9-way tie for 3rd (${lang === 'en' ? 'English, left to right' : 'Persian, right to left'})`, () => {
        let shot;
        const names = NAMES[lang];
        const rtl = lang === 'fa';
        // The rest-list columns of the image: where a name, its rank circle and its score are drawn.
        const nameX = rtl ? 720 - 40 - 48 : 40 + 48;
        const circleX = rtl ? 720 - 40 - 24 : 40 + 24;
        const plain = (d) => toLatinDigits(d.text.replace(BIDI_MARKS, ''));

        before(async () => {
            shot = await drawScorecard(lang);
        });

        it('keeps the image at 720x1280 (device pixel ratio 1): it does not grow for a longer list', () => {
            assert.deepEqual(shot.size, [720, 1280]);
        });

        it('lists the 17 players the podium does not name, in order: the 8 tied for 3rd first, then ranks 4 to 12', () => {
            const rows = shot.drawn.filter((d) => d.x === nameX).sort((a, b) => a.y - b.y);
            const tied = (name) => CATALOG[lang]['scorecard.tied'].replace('{name}', name);
            const expected = [...names.slice(3, 11).map(tied), ...names.slice(11)];
            assert.deepEqual(rows.map(plain), expected);
        });

        it('draws each row with its real rank number: 3 for the tied players, then 4 to 12', () => {
            const ranks = shot.drawn.filter((d) => d.x === circleX).sort((a, b) => a.y - b.y).map(plain);
            assert.deepEqual(ranks, [...Array(8).fill('3'), '4', '5', '6', '7', '8', '9', '10', '11', '12']);
        });

        it('names every one of the 20 players somewhere in the image, and none of them twice', () => {
            const texts = shot.drawn.map(plain);
            for (const name of names) {
                const where = texts.filter((text) => text.includes(name));
                assert.equal(where.length, 1, `${name} is drawn ${where.length} times: ${where.join(' | ')}`);
            }
            // the podium names the first player of each slot (and the tie slot says how many others), the list the rest
            const podium = shot.drawn.filter((d) => d.align === 'center').map(plain);
            for (const name of names.slice(0, 3)) assert.ok(podium.some((text) => text.includes(name)), `${name} is on the podium`);
        });

        it('lists all 20 players on the on-screen leaderboard too', () => {
            assert.deepEqual([...shot.screenRows].map((text) => names.find((name) => text.includes(name))).sort(), [...names].sort());
        });
    });
}
