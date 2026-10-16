/**
 * The round number on the round-result screen ("Round 3"; in Persian the word for round and a Persian digit).
 * `renderRoundNumber()` in ui/results.js writes it into #result-round from `gameState.round.num` and nothing
 * else, and ui/render.js calls it every time the result phase is drawn. What is pinned here:
 *  - the text: both languages, rounds 1, 2 and 12, Persian digits in Persian and Latin digits in English;
 *  - the source of the number: the current `round.num`, drawn again on every render, so a restored match (its
 *    save holds the whole `round` object) shows the number it was saved with;
 *  - what the line must leave alone: the title, the winner text, the score table.
 * The real game code runs on the fake browser of helpers/fakeEnv.mjs: a match is started the way START_MATCH
 * does it once the form is valid, a round ends through processElimination, a restore is the RESTORE_GAME action.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, describe, it } from 'node:test';
import { setRenderer } from '../../js/core/phase.js';
import { gameState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { initMatchPlayers, startNextRound } = await import('../../js/game/rounds.js');
const { processElimination } = await import('../../js/game/resolution.js');
const { stopTimerLoop } = await import('../../js/game/timer.js');
const { fa } = await import('../../js/i18n/fa.js');
const { en } = await import('../../js/i18n/en.js');
const { setLang } = await import('../../js/i18n/index.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');
const { renderUI } = await import('../../js/ui/render.js');
const { renderRoundNumber } = await import('../../js/ui/results.js');

useGameHarness(env, {
    setup: () => {
        for (const id of ['result-round', 'result-title', 'result-desc', 'round-leaderboard-body', 'recovery-banner']) env.el(id);
        for (const id of ['elim-icon', 'elim-name', 'elim-badge', 'elim-note', 'btn-elim-continue']) env.el(id);
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

const NAME_INPUTS = '#name-inputs-container input';
const PERSIAN_LETTER = /[\u0600-\u06FF]/;
const PERSIAN_DIGIT = /[\u06F0-\u06F9]/;
const LATIN_DIGIT = /[0-9]/;

/** What the line must say, per language and round. */
const WANTED = {
    fa: { 1: 'دست ۱', 2: 'دست ۲', 12: 'دست ۱۲' },
    en: { 1: 'Round 1', 2: 'Round 2', 12: 'Round 12' }
};

const line = () => env.el('result-round');

/** Put `num` in the counter, draw the line, and return what it says. */
function lineFor(num) {
    gameState.round.num = num;
    renderRoundNumber();
    return line().textContent;
}

/** Render the screen of the phase that is current, but only the result phase: the others need a lot more DOM. */
function renderResultOnly() {
    if (gameState.phase === 'result') renderUI();
}

/** The start of a match, as START_MATCH does it once the setup form is valid: counter to 0, players, first round. */
function startMatch() {
    env.seedRandom(7);
    env.stubQuery(NAME_INPUTS, ['a', 'b', 'c', 'd'].map((id) => env.input(`Player ${id}`, id)));
    // No last chance for the caught spy, so a vote on the spy ends the round at once (no guess screen).
    Object.assign(gameState.settings, { spyLastChance: false });
    gameState.match.usedWordKeys = [];
    gameState.round.num = 0;
    initMatchPlayers();
    startNextRound();
}

/** End the round now showing: the vote falls on the spy, the elimination reveal is dismissed. Lands on 'result'. */
function endRoundByCatchingTheSpy() {
    gameState.vote.targetId = gameState.players.find((p) => p.role === 'spy').id;
    processElimination([]);
    env.el('btn-elim-continue').onclick();
    assert.equal(gameState.phase, 'result');
}

/** Wipe memory as a page reload does, keeping only the save that persist() wrote. */
function reloadKeepingTheSave() {
    const saved = env.storage.get('spy_full_state_master');
    assert.ok(saved, 'a save exists');
    resetSingletons();
    line().textContent = '';
    env.storage.set('spy_full_state_master', saved);
    return JSON.parse(saved);
}

describe('the catalog text result.round', () => {
    it('exists in Persian and English with exactly one {count} placeholder and no digit of its own', () => {
        for (const [lang, catalog] of [['fa', fa], ['en', en]]) {
            assert.equal(typeof catalog['result.round'], 'string', `${lang}: the key is missing`);
            assert.deepEqual(catalog['result.round'].match(/\{[^}]*\}/g), ['{count}'], `${lang}: placeholders`);
            assert.doesNotMatch(catalog['result.round'], /[0-9\u06F0-\u06F9]/, `${lang}: the digits come from formatNumber`);
        }
    });

    it('is written in its own language', () => {
        assert.match(fa['result.round'], PERSIAN_LETTER);
        assert.doesNotMatch(en['result.round'], PERSIAN_LETTER);
        assert.match(en['result.round'], /[A-Za-z]/);
    });
});

describe('renderRoundNumber: the text', () => {
    for (const lang of ['fa', 'en']) {
        for (const [round, text] of Object.entries(WANTED[lang])) {
            it(`${lang}, round ${round}: "${text}"`, () => {
                setLang(lang);
                assert.equal(lineFor(Number(round)), text);
            });
        }
    }

    it('Persian writes Persian digits (and only those), English writes Latin digits (and only those)', () => {
        for (const round of [1, 2, 12]) {
            setLang('fa');
            const persian = lineFor(round);
            assert.match(persian, PERSIAN_DIGIT, `fa ${round}`);
            assert.doesNotMatch(persian, LATIN_DIGIT, `fa ${round}: a Latin digit`);
            const digits = [...persian].filter((c) => PERSIAN_DIGIT.test(c)).map((c) => c.charCodeAt(0) - 0x06f0);
            assert.equal(digits.join(''), String(round), 'the Persian digits spell the round number');

            setLang('en');
            const english = lineFor(round);
            assert.match(english, LATIN_DIGIT, `en ${round}`);
            assert.doesNotMatch(english, PERSIAN_DIGIT, `en ${round}: a Persian digit`);
            assert.doesNotMatch(english, PERSIAN_LETTER, `en ${round}: a Persian letter`);
            assert.equal(english.replace(/\D/g, ''), String(round));
        }
    });
});

describe('renderRoundNumber: the source of the number', () => {
    it('shows the current round.num every time, also when it goes down or the language changes in between', () => {
        setLang('en');
        assert.equal(lineFor(2), 'Round 2');
        assert.equal(lineFor(3), 'Round 3');
        assert.equal(lineFor(1), 'Round 1', 'a smaller number replaces a larger one: nothing is remembered');
        setLang('fa');
        renderRoundNumber();
        assert.equal(line().textContent, 'دست ۱', 'the same number, drawn again in the new language');
    });

    it('writes with textContent, never innerHTML', () => {
        line().innerHTML = '<i>untouched</i>';
        setLang('en');
        assert.equal(lineFor(5), 'Round 5');
        assert.equal(line().innerHTML, '<i>untouched</i>');
    });

    it('leaves the line empty (the CSS hides an empty line) when the counter is not a whole number of at least 1', () => {
        setLang('en');
        for (const bad of [0, -1, 1.5, NaN, Infinity, undefined, null, '3', {}]) {
            line().textContent = 'stale text';
            assert.equal(lineFor(bad), '', `round.num = ${String(bad)}`);
        }
    });

    it('does not throw when the round object or the element is missing', () => {
        line().textContent = 'stale text';
        gameState.round = undefined;
        renderRoundNumber();
        assert.equal(line().textContent, '');
        env.reset();
        assert.doesNotThrow(() => renderRoundNumber());
    });
});

describe('the result phase of renderUI', () => {
    it('draws the line from the current round next to the score table', () => {
        gameState.phase = 'result';
        gameState.players = makePlayers(3);
        gameState.round.num = 2;
        renderUI();
        assert.equal(line().textContent, WANTED.fa[2]);
        assert.equal(env.el('round-leaderboard-body').children.length, 3, 'the table is drawn as before');

        setLang('en');
        gameState.round.num = 12;
        renderUI();
        assert.equal(line().textContent, WANTED.en[12]);
    });

    it('does not touch the title or the winner text when no outcome is stored (tests/unit/result-restore.test.mjs covers the drawing)', () => {
        gameState.phase = 'result';
        gameState.players = makePlayers(3);
        gameState.round.num = 2;
        env.el('result-title').textContent = '🎉 title';
        env.el('result-title').style.color = 'var(--brand-emerald)';
        env.el('result-desc').innerHTML = '<span>winner text</span>';
        renderUI();
        assert.equal(env.el('result-title').textContent, '🎉 title');
        assert.equal(env.el('result-title').style.color, 'var(--brand-emerald)');
        assert.equal(env.el('result-desc').innerHTML, '<span>winner text</span>');
    });
});

describe('a real match: the result screen shows the number of the round that just ended', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: round 1, then after "next round" round 2; a new match starts at 1 again`, () => {
            setLang(lang);
            setRenderer(renderResultOnly);

            startMatch();
            assert.equal(gameState.round.num, 1);
            endRoundByCatchingTheSpy();
            assert.equal(line().textContent, WANTED[lang][1]);

            handleAction({ type: 'NEXT_ROUND' });
            assert.equal(gameState.round.num, 2);
            endRoundByCatchingTheSpy();
            assert.equal(line().textContent, WANTED[lang][2], 'the second round shows the second number');

            startMatch();
            endRoundByCatchingTheSpy();
            assert.equal(line().textContent, WANTED[lang][1], 'the counter was reset by the new match');
        });
    }
});

describe('RESTORE_GAME: what round.num holds, and what the result screen then shows', () => {
    /** Play a match in `matchLang` to the result of round 2, wipe memory, make `pageLang` the page language, restore. */
    function playSaveRestore(matchLang, pageLang) {
        setLang(matchLang);
        setRenderer(renderResultOnly);
        startMatch();
        endRoundByCatchingTheSpy();
        handleAction({ type: 'NEXT_ROUND' });
        endRoundByCatchingTheSpy();

        const save = reloadKeepingTheSave();
        assert.equal(save.state.round.num, 2, 'the counter is part of the save already');
        assert.equal(gameState.round.num, 0, 'memory was wiped');
        setLang(pageLang);
        handleAction({ type: 'RESTORE_GAME' });
    }

    it('a save made on the result screen of round 2 comes back as round 2 (the saved value, not re-counted)', () => {
        playSaveRestore('fa', 'fa');
        assert.equal(gameState.round.num, 2);
        assert.equal(gameState.phase, 'result');
        assert.equal(line().textContent, WANTED.fa[2]);
    });

    it('an English match restored on a Persian page shows "Round 2": the language is switched before the render', () => {
        playSaveRestore('en', 'fa');
        assert.equal(gameState.round.num, 2);
        assert.equal(line().textContent, WANTED.en[2]);
    });

    it('a Persian match restored on an English page shows the Persian line with Persian digits', () => {
        playSaveRestore('fa', 'en');
        assert.equal(gameState.round.num, 2);
        assert.equal(line().textContent, WANTED.fa[2]);
    });

    it('the next round after a restore goes on counting: 3', () => {
        playSaveRestore('en', 'en');
        handleAction({ type: 'NEXT_ROUND' });
        assert.equal(gameState.round.num, 3);
        endRoundByCatchingTheSpy();
        assert.equal(line().textContent, 'Round 3');
    });
});

describe('the Persian baseline (tests/e2e/fixtures/persian-baseline.json)', () => {
    it('covers only the welcome and setup screens, so the round line needs no exclusion in the recorder', () => {
        const baseline = JSON.parse(readFileSync(new URL('../e2e/fixtures/persian-baseline.json', import.meta.url), 'utf8'));
        const screens = Object.keys(baseline).filter((key) => !key.startsWith('_'));
        assert.deepEqual(
            screens,
            ['welcome', 'setup'],
            'the baseline now covers another screen: if it is the result screen, leave #result-round out of recordScreen in tests/e2e/helpers/record.mjs, the way the language switch is left out'
        );
    });
});
