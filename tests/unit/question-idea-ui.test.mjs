/**
 * The "Question idea" button of the discussion screen, below the click: its catalog label in both languages, its
 * markup in index.html (one ghost button and one polite live region, both inside #screen-timer and nowhere else),
 * the CSS that makes it a 44 px target, `showQuestionIdea` / `clearQuestionIdea` (ui/questionIdea.js), and the
 * actions around it (SHOW_QUESTION_IDEA, and NEXT_ROUND which clears the question). The click handler is one line
 * in ui/bindings.js and the real button, the live region, the layout at 360 px and the language switch are checked
 * in the browser by tests/e2e/question-idea.test.mjs.
 *
 * Everything runs on the fake browser of helpers/fakeEnv.mjs, with the real handleAction and the real banks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, describe, it } from 'node:test';
import { VALID_PHASES } from '../../js/core/config.js';
import { gameState, hostSecretState, session } from '../../js/core/state.js';
import { getQuestionIdeas } from '../../js/data/banks.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';
import { closest, elements, normalizeText, parseHtml, innerText } from './helpers/htmlScan.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { initMatchPlayers, startNextRound } = await import('../../js/game/rounds.js');
const { stopTimerLoop } = await import('../../js/game/timer.js');
const { setLang } = await import('../../js/i18n/index.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');
const { clearQuestionIdea, showQuestionIdea } = await import('../../js/ui/questionIdea.js');

const recorded = useGameHarness(env, {
    setup: () => {
        env.el('question-idea-text');
        env.el('recovery-banner');
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

const CATALOGS = { fa, en };
const PERSIAN_LETTER = /[\u0600-\u06FF]/;
const root = new URL('../../', import.meta.url);
const box = () => env.el('question-idea-text');
const shown = () => box().textContent;

describe('Question idea: the catalog label', () => {
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
        it(`${lang}: timer.idea.button exists, is short, and is a single line`, () => {
            const label = catalog['timer.idea.button'];
            assert.equal(typeof label, 'string');
            assert.ok(label.trim() && label === label.trim(), 'empty or untrimmed');
            assert.ok(label.length <= 24, `too long for a small button at 360 px: ${label}`);
            assert.doesNotMatch(label, /[\n<>{}]/);
        });
    }

    it('English never shows a Persian letter, and the Persian label is all Persian', () => {
        assert.doesNotMatch(en['timer.idea.button'], PERSIAN_LETTER);
        assert.match(fa['timer.idea.button'], PERSIAN_LETTER);
        assert.doesNotMatch(fa['timer.idea.button'], /[A-Za-z]/);
    });

    it('no catalog has an aria text for it that the other lacks (the keys of both catalogs are the same)', () => {
        const ideaKeys = (catalog) => Object.keys(catalog).filter((key) => key.startsWith('timer.idea.')).sort();
        assert.deepEqual(ideaKeys(fa), ideaKeys(en));
        assert.ok(ideaKeys(fa).includes('timer.idea.button'));
    });
});

describe('Question idea: index.html', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    const all = [...elements(parseHtml(html))];
    const byId = (id) => all.filter((el) => el.attrs.id === id);
    const screenOf = (el) => closest(el, (n) => n.tag === 'section' && (n.attrs.class ?? '').split(/\s+/).includes('screen-view'))?.attrs.id;
    const classes = (el) => (el.attrs.class ?? '').split(/\s+/);

    it('has exactly one button, a ghost button with its label from the catalog, on the discussion screen only', () => {
        const buttons = byId('btn-question-idea');
        assert.equal(buttons.length, 1);
        const [button] = buttons;
        assert.equal(button.tag, 'button');
        assert.equal(button.attrs.type, 'button');
        assert.equal(button.attrs['data-i18n'], 'timer.idea.button');
        assert.ok(classes(button).includes('btn') && classes(button).includes('btn-ghost'), 'a secondary (ghost) button');
        assert.equal(screenOf(button), 'screen-timer');
        assert.equal(normalizeText(innerText(button)), fa['timer.idea.button'], 'the text before JS runs is the Persian label');
        for (const forbidden of ['onclick', 'style', 'aria-hidden', 'hidden']) assert.ok(!(forbidden in button.attrs), `the button has ${forbidden}`);
        assert.ok(!classes(button).includes('hidden'));
    });

    it('has exactly one live region: an empty, always-rendered polite region on the discussion screen only', () => {
        const regions = byId('question-idea-text');
        assert.equal(regions.length, 1);
        const [region] = regions;
        assert.equal(region.attrs['aria-live'], 'polite');
        assert.equal(screenOf(region), 'screen-timer');
        assert.equal(normalizeText(innerText(region)), '', 'empty in the markup: no Persian default, no question before the first press');
        assert.equal(region.children.length, 0);
        // display:none (or aria-hidden) would hide the region from the screen reader, so it must not be hidden by markup.
        for (let n = region; n && n.attrs; n = n.parent) {
            assert.ok(!classes(n).includes('hidden') || n.attrs.id === 'screen-timer', `${n.tag}#${n.attrs.id} hides the region`);
            assert.ok(!('aria-hidden' in n.attrs) && !('hidden' in n.attrs), `${n.tag}#${n.attrs.id} hides the region`);
        }
        for (const forbidden of ['onclick', 'style']) assert.ok(!(forbidden in region.attrs));
    });

    it('is the only polite live region of the discussion screen, and nothing else in the page uses these ids or classes', () => {
        const screen = byId('screen-timer')[0];
        const live = all.filter((el) => el.attrs['aria-live'] && closest(el, (n) => n === screen));
        assert.deepEqual(live.map((el) => `${el.attrs.id}:${el.attrs['aria-live']}`), ['timer-text:off', 'question-idea-text:polite']);
        assert.equal(byId('question-idea').length, 1);
        assert.equal(all.filter((el) => classes(el).includes('question-idea-btn')).length, 1);
    });

    it('sits between the timer card and the alarm button, so the main action is not pushed above the idea', () => {
        const [card] = all.filter((el) => classes(el).includes('timer-card') && screenOf(el) === 'screen-timer');
        const [block] = byId('question-idea');
        const [alarm] = byId('btn-emergency-vote');
        assert.ok(card.start < block.start && block.start < alarm.start);
        assert.deepEqual(block.children.filter((c) => c.type === 'el').map((c) => c.attrs.id), ['btn-question-idea', 'question-idea-text']);
    });

    it('no other screen holds a button or a region of this block (the screens that exist are untouched)', () => {
        const screens = all.filter((el) => el.tag === 'section' && classes(el).includes('screen-view'));
        assert.ok(screens.length >= 8, `${screens.length} screens`);
        for (const screen of screens) {
            const inside = all.filter((el) => closest(el, (n) => n === screen) && ['question-idea', 'btn-question-idea', 'question-idea-text'].includes(el.attrs.id));
            assert.equal(inside.length, screen.attrs.id === 'screen-timer' ? 3 : 0, screen.attrs.id);
        }
    });
});

describe('Question idea: css', () => {
    const css = readFileSync(new URL('css/style.css', root), 'utf8');
    const rule = (selector) => {
        const escaped = selector.replace(/[.:()]/g, '\\$&');
        return [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ');
    };

    it('the button is a 44 px touch target', () => {
        assert.match(rule('.question-idea-btn'), /min-height:\s*44px/);
    });

    it('the live region is never display:none, takes no room while empty, and keeps two lines once it holds a question', () => {
        assert.doesNotMatch(rule('.question-idea-text'), /display:\s*none|visibility:\s*hidden/);
        assert.match(rule('.question-idea-text'), /margin:\s*0\b/);
        assert.match(rule('.question-idea-text:not(:empty)'), /min-height:\s*2\.9em/);
        assert.match(rule('.question-idea-text'), /line-height:\s*1\.45/);
        assert.match(rule('.question-idea-text'), /overflow-wrap:\s*anywhere/, 'a long question wraps inside the screen');
    });
});

describe('Question idea: showQuestionIdea and clearQuestionIdea', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: writes one question of the ${lang} bank as plain text (textContent, never innerHTML)`, () => {
            setLang(lang);
            showQuestionIdea();
            assert.ok(getQuestionIdeas(lang).includes(shown()), `"${shown()}" is not in the ${lang} bank`);
            assert.equal(box().innerHTML, '', 'the region was written as markup');
        });
    }

    it('the next press shows another question, and a question never comes twice in a row (also across a restart of the bag)', () => {
        setLang('en');
        let previous = null;
        for (let press = 0; press < getQuestionIdeas('en').length * 3; press++) {
            showQuestionIdea();
            assert.notEqual(shown(), previous, `press ${press}`);
            assert.ok(shown().length > 0);
            previous = shown();
        }
    });

    it('after a language change the next question is from the new language, and nothing from the old bank comes with it', () => {
        setLang('fa');
        showQuestionIdea();
        const persian = shown();
        setLang('en');
        showQuestionIdea();
        assert.ok(getQuestionIdeas('en').includes(shown()));
        assert.ok(!getQuestionIdeas('fa').includes(shown()));
        assert.notEqual(shown(), persian);
        setLang('fa');
        showQuestionIdea();
        assert.ok(getQuestionIdeas('fa').includes(shown()));
    });

    it('clearQuestionIdea empties the region, also when it is already empty, and a missing element is not an error', () => {
        showQuestionIdea();
        assert.notEqual(shown(), '');
        clearQuestionIdea();
        assert.equal(shown(), '');
        assert.doesNotThrow(() => clearQuestionIdea());
        env.reset();
        assert.doesNotThrow(() => showQuestionIdea());
        assert.doesNotThrow(() => clearQuestionIdea());
    });

    it('touches nothing but the region: no storage write, no change to the game, the secrets or the session', () => {
        gameState.phase = 'timer';
        env.storage.set('spy_full_state_master', '{"saved":"match"}');
        const before = {
            game: structuredClone(gameState),
            secrets: structuredClone({ ...hostSecretState, processedRequestIds: [...hostSecretState.processedRequestIds] }),
            session: structuredClone(session),
            storage: [...env.storage.entries()]
        };
        for (let press = 0; press < 5; press++) showQuestionIdea();
        clearQuestionIdea();
        assert.deepEqual(gameState, before.game);
        assert.deepEqual({ ...hostSecretState, processedRequestIds: [...hostSecretState.processedRequestIds] }, before.secrets);
        assert.deepEqual(session, before.session);
        assert.deepEqual([...env.storage.entries()], before.storage);
    });
});

describe('Question idea: the SHOW_QUESTION_IDEA action', () => {
    it('on the discussion screen it shows a question, and it commits nothing: no render, no save', () => {
        gameState.phase = 'timer';
        env.storage.set('spy_full_state_master', 'untouched');
        handleAction({ type: 'SHOW_QUESTION_IDEA' });
        assert.ok(getQuestionIdeas('fa').includes(shown()));
        assert.deepEqual(recorded.renders, [], 'commitState ran: the screen was redrawn and the match saved');
        assert.equal(env.storage.get('spy_full_state_master'), 'untouched');
    });

    it('in every other phase it is ignored', () => {
        for (const phase of [...VALID_PHASES].filter((p) => p !== 'timer')) {
            gameState.phase = phase;
            handleAction({ type: 'SHOW_QUESTION_IDEA' });
            assert.equal(shown(), '', phase);
        }
    });

    it('works with every option of a match (it reads no setting): director, one-word rule, detective, fool, quests', () => {
        gameState.phase = 'timer';
        Object.assign(gameState.settings, { director: true, oneword: true, detective: true, fool: true, quests: true, knownSpies: true, wager: true });
        for (const lang of ['fa', 'en']) {
            setLang(lang);
            handleAction({ type: 'SHOW_QUESTION_IDEA' });
            assert.ok(getQuestionIdeas(lang).includes(shown()), lang);
        }
    });
});

describe('Question idea: a new round clears the question', () => {
    /** A match as START_MATCH leaves it once the form is valid (see result-round.test.mjs), up to the first role reveal. */
    function startRound() {
        env.seedRandom(7);
        env.stubQuery('#name-inputs-container input', ['a', 'b', 'c', 'd'].map((id) => env.input(`Player ${id}`, id)));
        Object.assign(gameState.settings, { spyLastChance: false });
        gameState.match.usedWordKeys = [];
        gameState.round.num = 0;
        initMatchPlayers();
        assert.equal(startNextRound(), true);
    }

    it('NEXT_ROUND empties the region once the next round has started', () => {
        startRound();
        gameState.phase = 'timer';
        showQuestionIdea();
        assert.notEqual(shown(), '');
        gameState.phase = 'result';
        handleAction({ type: 'NEXT_ROUND' });
        assert.equal(gameState.phase, 'reveal');
        assert.equal(gameState.round.num, 2);
        assert.equal(shown(), '');
    });

    it('NEXT_ROUND in a phase where it does nothing leaves the question alone', () => {
        gameState.phase = 'timer';
        showQuestionIdea();
        const question = shown();
        handleAction({ type: 'NEXT_ROUND' });
        assert.equal(shown(), question);
    });

    it('a new round does not restart the bag: no question is repeated across rounds before the bank is used up', async () => {
        // A second copy of the module (its own picker, bag still empty): the other tests have drawn from the shared one.
        const { showQuestionIdea: showFromFreshBag } = await import('../../js/ui/questionIdea.js?fresh-bag');
        setLang('en');
        startRound();
        const seen = [];
        const bank = getQuestionIdeas('en');
        for (let round = 0; round < 4; round++) {
            gameState.phase = 'timer';
            for (let press = 0; press < 3; press++) {
                showFromFreshBag();
                seen.push(shown());
            }
            gameState.phase = 'result';
            handleAction({ type: 'NEXT_ROUND' });
            assert.equal(shown(), '');
        }
        assert.equal(seen.length, 12);
        assert.ok(seen.length < bank.length);
        assert.equal(new Set(seen).size, seen.length, 'a question came again before the bank was used up');
    });
});
