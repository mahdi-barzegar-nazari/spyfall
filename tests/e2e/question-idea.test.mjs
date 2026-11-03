/**
 * End-to-end test of the discussion screen's "Question idea" button, against the PRODUCTION build in a real
 * Chromium at 360x740, in the style of smoke.test.mjs. Every step is a click a player would make.
 *
 * Pinned: the button is on the discussion screen only (not on welcome, setup, reveal, vote or result), in both
 * languages, a 44 px target with the catalog label; a press shows one question of the bank of the page language as
 * plain text in a polite live region and the button keeps the focus; the next press shows another; a full cycle
 * shows every question once and the bag refills; every question fits in two lines and the screen has no overflow
 * and does not jump; the saved match (and every other stored value) is not touched by a press, and no question ever
 * reaches the saved state; a new round, a new match and a language change clear the question; the question is
 * public (it never holds a player's name or the secret word); it works in every mode and after cover mode; the
 * Persian recorder leaves the button and the question out; a resumed match starts with no question.
 *
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getQuestionIdeas } from '../../js/data/banks.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { startApp } from './helpers/app.mjs';
import { PLAYERS, withPage } from './helpers/play.mjs';
import { persianIn, recordScreen } from './helpers/record.mjs';

const CATALOGS = { fa, en };
const IDEA = '#btn-question-idea';
const TEXT = '#question-idea-text';
const BOTH = ['fa', 'en'];

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

const run = (lang, fn) => withPage(browser, baseUrl, lang, fn);

/**
 * From the welcome screen: open the setup, leave the last chance off (a vote on the spy ends the round at once) and
 * tick `toggles` (ids of setup switches).
 */
async function openSetup(page, toggles = []) {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
    await page.evaluate((ids) => {
        document.getElementById('toggle-last-chance').checked = false;
        document.getElementById('toggle-quick-voting').checked = true;
        for (const id of ids) document.getElementById(id).checked = true;
    }, toggles);
}

/** From the welcome screen: set up and start a match. Ends on the role reveal. */
async function beginMatch(page, toggles = []) {
    await openSetup(page, toggles);
    await page.click('#btn-start-match');
    await page.waitForSelector('#screen-reveal:not(.hidden)');
}

/** On the role reveal: every player opens and closes his card, as in playRound (helpers/play.mjs). Returns the spy's name. */
async function readAllCards(page) {
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
    return spyName;
}

async function startDiscussion(page) {
    await page.click('#btn-start-discussion');
    await page.waitForSelector('#screen-timer:not(.hidden)');
    await settle(page);
}

/** The screen fades in over 0.38 s with a transform: measure it only once it has settled. */
async function settle(page) {
    await page.waitForFunction(() => document.getElementById('screen-timer').getAnimations().length === 0);
}

/** From the welcome screen to the discussion screen. Returns the spy's name. */
async function toDiscussion(page, toggles = []) {
    await beginMatch(page, toggles);
    const spyName = await readAllCards(page);
    await startDiscussion(page);
    return spyName;
}

/** On the vote screen: everybody votes for the spy (the spy for someone else). Ends on the round result. */
async function castVotes(page, spyName) {
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
}

/** From the discussion screen to the round result. */
async function endRound(page, spyName) {
    await page.click('#btn-emergency-vote');
    await castVotes(page, spyName);
}

/** Press the button as a player does and return the question now on the screen. */
async function press(page) {
    await page.click(IDEA);
    return page.textContent(TEXT);
}

const shownNow = (page) => page.textContent(TEXT);
const visible = (page, selector) => page.locator(selector).isVisible();
const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? '');

describe('the "Question idea" button (360x740)', () => {
    for (const lang of BOTH) {
        it(`${lang}: it is on the discussion screen and on no other, with the catalog label, as a 44 px target`, async () => {
            await run(lang, async (page) => {
                assert.equal(await visible(page, IDEA), false, 'welcome');
                await openSetup(page);
                assert.equal(await visible(page, IDEA), false, 'setup');
                await page.click('#btn-start-match');
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                assert.equal(await visible(page, IDEA), false, 'role reveal');
                const spyName = await readAllCards(page);
                assert.equal(await visible(page, IDEA), false, 'role reveal, every card read');
                await startDiscussion(page);

                assert.equal(await visible(page, IDEA), true, 'discussion');
                const m = await page.evaluate(() => {
                    const button = document.getElementById('btn-question-idea');
                    const box = button.getBoundingClientRect();
                    return {
                        label: button.textContent.trim(),
                        count: document.querySelectorAll('#btn-question-idea').length,
                        screen: button.closest('.screen-view')?.id,
                        left: box.left,
                        right: box.right,
                        width: box.width,
                        height: box.height,
                        viewport: window.innerWidth,
                        disabled: button.disabled
                    };
                });
                assert.equal(m.count, 1);
                assert.equal(m.screen, 'screen-timer');
                assert.equal(m.label, CATALOGS[lang]['timer.idea.button']);
                assert.equal(m.disabled, false);
                assert.ok(m.height >= 44, `touch target ${m.height}px high`);
                assert.ok(m.width >= 44, `touch target ${m.width}px wide`);
                assert.ok(m.left >= 0 && m.right <= m.viewport, 'inside the screen');

                await page.click('#btn-emergency-vote');
                await page.waitForSelector('#screen-vote:not(.hidden)');
                assert.equal(await visible(page, IDEA), false, 'vote');
                await castVotes(page, spyName);
                assert.equal(await visible(page, IDEA), false, 'round result');
            });
        });
    }

    for (const lang of BOTH) {
        it(`${lang}: a press shows one question of the ${lang} bank as plain text in a polite live region; the next press shows another; the button keeps the focus`, async () => {
            await run(lang, async (page) => {
                await toDiscussion(page);
                const bank = getQuestionIdeas(lang);
                const otherBank = getQuestionIdeas(lang === 'fa' ? 'en' : 'fa');
                assert.equal(await shownNow(page), '', 'nothing is shown before the first press');
                // Plain text looks the same whether it is written as text or as markup, so watch the markup setter.
                await page.evaluate(() => {
                    window.__markupWrites = [];
                    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
                    Object.defineProperty(Element.prototype, 'innerHTML', {
                        ...descriptor,
                        set(value) {
                            if (this.id === 'question-idea-text') window.__markupWrites.push(String(value));
                            descriptor.set.call(this, value);
                        }
                    });
                });

                const first = await press(page);
                assert.ok(bank.includes(first), `"${first}" is not in the ${lang} bank`);
                assert.ok(!otherBank.includes(first));
                assert.equal(await activeId(page), 'btn-question-idea', 'the button keeps the focus');
                assert.equal(await visible(page, TEXT), true, 'the question can be seen');

                const region = await page.evaluate(() => {
                    const box = document.getElementById('question-idea-text');
                    const live = box.closest('[aria-live]');
                    return {
                        live: live?.getAttribute('aria-live'),
                        liveIsTheRegion: live === box,
                        atomic: box.getAttribute('aria-atomic'),
                        elementChildren: box.childElementCount,
                        textNodes: [...box.childNodes].filter((n) => n.nodeType === 3).length,
                        display: getComputedStyle(box).display,
                        ariaHidden: Boolean(box.closest('[aria-hidden="true"], [hidden], [inert]')),
                        insideScreen: box.closest('.screen-view')?.id
                    };
                });
                assert.equal(region.live, 'polite');
                assert.equal(region.liveIsTheRegion, true);
                assert.equal(region.atomic, 'true');
                assert.equal(region.elementChildren, 0, 'plain text, no markup');
                assert.equal(region.textNodes, 1);
                assert.notEqual(region.display, 'none');
                assert.equal(region.ariaHidden, false);
                assert.equal(region.insideScreen, 'screen-timer');

                const second = await press(page);
                assert.ok(bank.includes(second));
                assert.notEqual(second, first, 'the second press shows another question');
                assert.equal(await activeId(page), 'btn-question-idea');

                // The keyboard works too: focus stays on the button, Enter and Space both ask for the next question.
                await page.keyboard.press('Enter');
                const third = await shownNow(page);
                await page.keyboard.press('Space');
                const fourth = await shownNow(page);
                assert.ok(bank.includes(third) && bank.includes(fourth));
                assert.deepEqual(new Set([first, second, third, fourth]).size, 4, 'four presses, four different questions');
                assert.equal(await activeId(page), 'btn-question-idea');
                assert.deepEqual(await page.evaluate(() => window.__markupWrites), [], 'the question was written as markup (innerHTML), not as text');
            });
        });
    }

    for (const lang of BOTH) {
        it(`${lang}: a full cycle shows every question once and the bag refills; each fits two lines; nothing overflows or jumps; none is about a player or the word`, async () => {
            await run(lang, async (page) => {
                await toDiscussion(page);
                const bank = getQuestionIdeas(lang);
                const secrets = await page.evaluate(async () => {
                    const { gameState, hostSecretState } = await import('/js/core/state.js');
                    return { words: [hostSecretState.secretWord, hostSecretState.foolWord], names: gameState.players.map((p) => p.name) };
                });
                const measure = () =>
                    page.evaluate(() => {
                        const region = document.getElementById('question-idea-text');
                        const range = document.createRange();
                        range.selectNodeContents(region);
                        const tops = [...range.getClientRects()].map((r) => r.top).sort((a, b) => a - b);
                        const alarm = document.getElementById('btn-emergency-vote').getBoundingClientRect();
                        const idea = document.getElementById('btn-question-idea').getBoundingClientRect();
                        return {
                            text: region.textContent,
                            lines: tops.reduce((n, top, i) => (i === 0 || top - tops[i - 1] > 8 ? n + 1 : n), 0),
                            regionOverflow: region.scrollWidth > region.clientWidth,
                            pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
                            alarmTop: Math.round(alarm.top * 10) / 10,
                            ideaTop: Math.round(idea.top * 10) / 10
                        };
                    });

                const rows = [];
                for (let i = 0; i < bank.length * 2; i++) {
                    await page.click(IDEA);
                    rows.push(await measure());
                }
                const texts = rows.map((row) => row.text);
                for (const cycle of [texts.slice(0, bank.length), texts.slice(bank.length)]) {
                    assert.equal(new Set(cycle).size, bank.length, 'a question came twice in one cycle');
                    assert.deepEqual([...cycle].sort(), [...bank].sort(), 'a cycle is the whole bank');
                }
                texts.forEach((text, i) => {
                    if (i > 0) assert.notEqual(text, texts[i - 1], `the same question twice in a row at press ${i}`);
                });

                const tooLong = rows.filter((row) => row.lines > 2).map((row) => `${row.lines} lines: ${row.text}`);
                assert.deepEqual(tooLong, [], 'a question needs more than two lines at 360 px');
                assert.ok(rows.every((row) => row.lines >= 1));
                assert.equal(rows.filter((row) => row.regionOverflow || row.pageOverflow).length, 0, 'horizontal overflow');
                assert.equal(new Set(rows.map((row) => row.alarmTop)).size, 1, 'the alarm button moved between questions');
                assert.equal(new Set(rows.map((row) => row.ideaTop)).size, 1, 'the idea button moved between questions');

                // A public screen: no question holds a player's name or one of the words (whole words, any case).
                const words = (text) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
                const inside = (haystack, needle) => {
                    const h = words(haystack);
                    const n = words(needle);
                    return n.length > 0 && h.some((_, i) => n.every((w, k) => h[i + k] === w));
                };
                for (const text of texts) {
                    for (const secret of [...secrets.words, ...secrets.names]) assert.ok(!inside(text, secret), `"${text}" holds "${secret}"`);
                }
            });
        });
    }
});

describe('the "Question idea" button: the saved match', () => {
    for (const lang of BOTH) {
        it(`${lang}: a press changes nothing that is stored or kept (checked in one synchronous step), and no question is ever saved`, async () => {
            await run(lang, async (page) => {
                await toDiscussion(page);
                const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
                assert.ok(keysBefore.includes('spy_full_state_master'), 'the match is saved');

                const outcome = await page.evaluate(async () => {
                    const { gameState, hostSecretState, session } = await import('/js/core/state.js');
                    const snapshot = () =>
                        JSON.stringify({
                            local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
                            tab: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]),
                            game: gameState,
                            secrets: { ...hostSecretState, processedRequestIds: [...hostSecretState.processedRequestIds] },
                            session
                        });
                    const writes = [];
                    const proto = Storage.prototype;
                    const original = { setItem: proto.setItem, removeItem: proto.removeItem, clear: proto.clear };
                    for (const name of Object.keys(original)) {
                        proto[name] = function (...args) {
                            writes.push(name);
                            return original[name].apply(this, args);
                        };
                    }
                    try {
                        const before = snapshot();
                        const button = document.getElementById('btn-question-idea');
                        button.click();
                        button.click();
                        button.click();
                        return { unchanged: before === snapshot(), writes, shown: document.getElementById('question-idea-text').textContent };
                    } finally {
                        Object.assign(proto, original);
                    }
                });
                assert.ok(outcome.shown, 'the presses did show a question');
                assert.deepEqual(outcome.writes, [], 'a press wrote to storage');
                assert.equal(outcome.unchanged, true, 'a press changed the saved match, the game state, the secrets or the session');

                // A later save (the alarm commits and saves the match) must not carry a question, and must add no key.
                for (let i = 0; i < 4; i++) await press(page);
                await page.click('#btn-emergency-vote');
                await page.waitForSelector('#screen-vote:not(.hidden)');
                const stored = await page.evaluate(() => ({ saved: localStorage.getItem('spy_full_state_master'), keys: Object.keys(localStorage).sort() }));
                for (const question of [...getQuestionIdeas('fa'), ...getQuestionIdeas('en')]) {
                    assert.ok(!stored.saved.includes(question), `the saved match holds a question: ${question}`);
                }
                assert.deepEqual(stored.keys, keysBefore, 'a key was added to localStorage');
            });
        });
    }

    it('a resumed match starts with no question, the bag is not saved, and the button works again', async () => {
        await run('en', async (page) => {
            await toDiscussion(page);
            const first = await press(page);
            await page.reload();
            await page.waitForSelector('#recovery-banner:not(.hidden)');
            await page.click('#btn-restore-game');
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            await page.click('#btn-confirm-yes');
            await page.waitForSelector('#screen-timer:not(.hidden)');
            assert.equal(await shownNow(page), '', 'the question is not part of the saved match');
            const again = await press(page);
            assert.ok(getQuestionIdeas('en').includes(again));
            assert.ok(first && again, 'both presses showed a question');
            assert.equal(await activeId(page), 'btn-question-idea');
        });
    });
});

describe('the "Question idea" button: when the question goes away', () => {
    for (const lang of BOTH) {
        it(`${lang}: it stays while the round goes on (a cancelled vote), is cleared when the next round starts, and the bag goes on across rounds`, async () => {
            await run(lang, async (page) => {
                const spyName = await toDiscussion(page);
                const seen = [await press(page)];

                // A vote that is called off returns to the same discussion: the question is still there.
                await page.click('#btn-emergency-vote');
                await page.waitForSelector('#screen-vote:not(.hidden)');
                await page.click('#btn-cancel-vote');
                await page.waitForSelector('#screen-timer:not(.hidden)');
                assert.equal(await shownNow(page), seen[0], 'a cancelled vote does not end the round');

                await endRound(page, spyName);
                await page.click('#btn-next-round');
                await page.waitForSelector('#screen-reveal:not(.hidden)');
                assert.equal(await shownNow(page), '', 'the new round starts with no question');

                await readAllCards(page);
                await startDiscussion(page);
                assert.equal(await shownNow(page), '', 'and still none on its discussion screen');
                for (let i = 0; i < 3; i++) seen.push(await press(page));
                assert.equal(new Set(seen).size, seen.length, 'a question came again in the next round, before the bank was used up');
                assert.ok(seen.every((question) => getQuestionIdeas(lang).includes(question)));
            });
        });
    }

    it('a new match starts with no question (without any language change)', async () => {
        await run('fa', async (page) => {
            await toDiscussion(page);
            await press(page);
            await page.click('#btn-confirm-end-1');
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            await page.click('#btn-confirm-yes');
            await page.waitForSelector('#screen-leaderboard:not(.hidden)');
            await page.click('#btn-reset-match');
            await page.waitForSelector('#screen-welcome:not(.hidden)');

            await beginMatch(page);
            assert.equal(await shownNow(page), '', 'the first round of the new match shows no question');
            await readAllCards(page);
            await startDiscussion(page);
            assert.equal(await shownNow(page), '');
            assert.ok(getQuestionIdeas('fa').includes(await press(page)));
        });
    });

    it('a language change clears it, and the bag then uses the bank of the new language', async () => {
        await run('fa', async (page) => {
            await toDiscussion(page);
            const persian = await press(page);
            assert.ok(getQuestionIdeas('fa').includes(persian));
            await page.click('#btn-confirm-end-1');
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            await page.click('#btn-confirm-yes');
            await page.waitForSelector('#screen-leaderboard:not(.hidden)');
            await page.click('#btn-reset-match');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.equal(await shownNow(page), persian, 'leaving the match does not clear it by itself (the next match or a language change does)');

            await page.click('#btn-lang-en');
            await page.waitForFunction(() => document.documentElement.lang === 'en');
            assert.equal(await shownNow(page), '', 'the Persian question is cleared when the language changes');

            await toDiscussion(page);
            const english = await press(page);
            assert.ok(getQuestionIdeas('en').includes(english), `"${english}" is not in the English bank`);
            assert.deepEqual(persianIn([english]), []);

            // And back: the Persian bank again (its own bag).
            await page.click('#btn-confirm-end-1');
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            await page.click('#btn-confirm-yes');
            await page.waitForSelector('#screen-leaderboard:not(.hidden)');
            await page.click('#btn-reset-match');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.click('#btn-lang-fa');
            await page.waitForFunction(() => document.documentElement.lang === 'fa');
            assert.equal(await shownNow(page), '');
            await toDiscussion(page);
            assert.ok(getQuestionIdeas('fa').includes(await press(page)));
        });
    });
});

describe('the "Question idea" button: layout and modes', () => {
    it('at 360 px, on the fullest discussion screen (both banners on), a question leaves nothing overflowing and every control reachable', async () => {
        for (const lang of BOTH) {
            await run(lang, async (page) => {
                await toDiscussion(page, ['toggle-director', 'toggle-oneword']);
                await press(page);
                await press(page);

                const m = await page.evaluate(() => {
                    const box = (selector) => {
                        const r = document.querySelector(selector).getBoundingClientRect();
                        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
                    };
                    return {
                        viewport: window.innerWidth,
                        pageScrollWidth: document.documentElement.scrollWidth,
                        bodyScrollWidth: document.body.scrollWidth,
                        banner: !document.getElementById('oneword-banner').classList.contains('hidden'),
                        director: !document.getElementById('director-box').classList.contains('hidden'),
                        card: box('.timer-card'),
                        idea: box('#btn-question-idea'),
                        text: box('#question-idea-text'),
                        alarm: box('#btn-emergency-vote'),
                        end: box('#btn-confirm-end-1'),
                        next: box('#btn-next-director')
                    };
                });
                assert.ok(m.banner && m.director, 'both banners are on, so this is the tallest layout');
                assert.ok(m.pageScrollWidth <= m.viewport && m.bodyScrollWidth <= m.viewport, `horizontal overflow: ${m.pageScrollWidth}px of ${m.viewport}px`);
                for (const [name, r] of Object.entries({ idea: m.idea, text: m.text, alarm: m.alarm, end: m.end, next: m.next })) {
                    assert.ok(r.left >= 0 && r.right <= m.viewport, `${name} leaves the screen sideways`);
                }
                // The block sits between the timer card and the alarm button, and nothing is on top of anything else.
                assert.ok(m.card.bottom <= m.idea.top, 'the idea button is under the timer card');
                assert.ok(m.idea.bottom <= m.text.top, 'the question is under the button');
                assert.ok(m.text.bottom <= m.alarm.top, 'the alarm button is under the question');
                assert.ok(m.alarm.bottom <= m.end.top, 'the end button is under the alarm button');

                // Every control can really be reached and pressed: visible, stable, enabled, and nothing covers it.
                for (const selector of ['#btn-next-director', IDEA, '#btn-emergency-vote', '#btn-confirm-end-1', '#btn-panic-open']) {
                    await page.click(selector, { trial: true });
                }
            });
        }
    });

    it('works with every option of the match on (director, one-word rule, detective, fool, side quests) and after cover mode', async () => {
        await run('en', async (page) => {
            await toDiscussion(page, ['toggle-director', 'toggle-oneword', 'toggle-detective', 'toggle-fool', 'toggle-quests']);
            const bank = getQuestionIdeas('en');
            assert.ok(bank.includes(await press(page)), 'with every option on');

            await page.click('#btn-panic-open');
            await page.waitForSelector('#panic-shield:not(.hidden)');
            assert.equal(await page.evaluate(() => document.getElementById('main-content-root').inert), true, 'cover mode shuts the screen');
            await page.keyboard.press('Enter');
            await page.waitForSelector('#panic-shield.hidden', { state: 'attached' });
            assert.equal(await page.evaluate(() => document.getElementById('main-content-root').inert), false);
            const afterCover = await press(page);
            assert.ok(bank.includes(afterCover), 'after cover mode');
            assert.equal(await shownNow(page), afterCover);

            // The director button and the question button live side by side without disturbing each other.
            const turn = await page.textContent('#director-text');
            await page.click('#btn-next-director');
            assert.ok((await page.textContent('#director-text')).length > 0 && turn.length > 0);
            assert.equal(await shownNow(page), afterCover, 'the next turn does not touch the question');
        });
    });
});

describe('the "Question idea" button: the Persian recorder', () => {
    for (const lang of BOTH) {
        it(`${lang}: recordScreen leaves the button and the question out of the recorded text, whether one is shown or not`, async () => {
            await run(lang, async (page) => {
                await toDiscussion(page);
                const label = CATALOGS[lang]['timer.idea.button'];
                const emptyRecording = await recordScreen(page);
                const question = await press(page);
                const recording = await recordScreen(page);

                // Not vacuous: the label and the question really are on the screen a person sees.
                const onScreen = await page.innerText('#question-idea');
                assert.ok(onScreen.includes(label), 'the label is on the screen');
                assert.ok(onScreen.includes(question), 'the question is on the screen');
                assert.ok((await page.innerText('#main-content-root')).includes(question));

                for (const [name, shot] of [['before the first press', emptyRecording], ['after a press', recording]]) {
                    assert.ok(!shot.text.some((line) => line.includes(label)), `${name}: the label is in the recorded text`);
                    assert.ok(!shot.text.some((line) => line.includes(question)), `${name}: the question is in the recorded text`);
                    assert.ok(!shot.attrs.some((attr) => attr.includes('question-idea')), `${name}: an attribute of the block is recorded`);
                }
                assert.deepEqual(recording, emptyRecording, 'the recording does not change when a question appears');
                if (lang === 'en') assert.deepEqual(persianIn(recording), [], 'no Persian on the English discussion screen');

                // The block has no text attribute today. If one is added (a title, an aria-label), the recorder must ignore it too.
                const probed = await page.evaluate(() => {
                    document.getElementById('btn-question-idea').setAttribute('title', 'probe title');
                    document.getElementById('question-idea-text').setAttribute('aria-label', 'probe label');
                    return document.querySelectorAll('#question-idea [title], #question-idea [aria-label]').length;
                });
                assert.equal(probed, 2, 'the probe attributes are on the page, where a recorder that does not exclude the block would see them');
                const withAttributes = await recordScreen(page);
                assert.ok(!withAttributes.attrs.some((attr) => attr.includes('question-idea')), 'an attribute of the block is recorded');
                assert.deepEqual(withAttributes, recording, 'attributes on the block change the recording');
            });
        });
    }
});
