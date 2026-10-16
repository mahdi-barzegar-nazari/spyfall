/**
 * The winner title, the winner box and the score table of the round-result screen survive a restore.
 *
 * Before this was fixed, `buildHostRoundResult` wrote #result-title and #result-desc once, when the round
 * resolved, and nothing drew them again: a match resumed on the result screen showed the static Persian default
 * title of index.html and an empty winner box, even for an English match. Now one function in ui/results.js,
 * `renderRoundResult`, draws both, and it is called when the round resolves AND by `renderUI` every time the
 * result phase is drawn. What is pinned here:
 *  - the text of each of the four endings, in both languages (`describeRoundResult`, `formatRoundResultHtml`),
 *    with the escaping rules of the winner box unchanged;
 *  - what `renderRoundResult` reads (the stored outcome, the secret word, the player voted out, the tie note) and
 *    that it does nothing without a usable outcome (a save made before the outcome was stored);
 *  - the stored outcome: exactly `{ winner, reason }`, there only on the result screen, gone with the next round;
 *  - the real thing: a match is played to each ending in each language, saved, wiped, restored on a page in the
 *    OTHER language, and the screen must be identical (title, colour, description, table);
 *  - old and damaged saves restore without errors and without wrong text.
 * The real game code runs on the fake browser of helpers/fakeEnv.mjs, like tests/unit/result-round.test.mjs.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { setRenderer } from '../../js/core/phase.js';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { initMatchPlayers, startNextRound } = await import('../../js/game/rounds.js');
const { processElimination } = await import('../../js/game/resolution.js');
const { stopTimerLoop } = await import('../../js/game/timer.js');
const { fa } = await import('../../js/i18n/fa.js');
const { en } = await import('../../js/i18n/en.js');
const { getLang, setLang } = await import('../../js/i18n/index.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');
const { renderUI } = await import('../../js/ui/render.js');
const { describeRoundResult, formatRoundResultHtml, isRoundOutcome, renderRoundResult } = await import('../../js/ui/results.js');

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
const CATALOG = { fa, en };
const OTHER = { fa: 'en', en: 'fa' };

// ---- What the screen must say: an oracle built from the catalogs and a few lines of its own, not from the code.

const ROSE = 'var(--brand-rose)';
const EMERALD = 'var(--brand-emerald)';
const WINNER_OF = { spy_guess: 'spy', sudden_death: 'spy', citizens_exhausted: 'spy', spies_eliminated: 'citizen' };
const COLOR_OF = { spy: ROSE, citizen: EMERALD };
const TEXT_KEY = {
    spy_guess: 'result.spyGuessed',
    sudden_death: 'result.suddenDeath',
    citizens_exhausted: 'result.citizensExhausted',
    spies_eliminated: 'result.spiesEliminated'
};
const REASONS = Object.keys(TEXT_KEY);

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The winner box for `reason` in `lang`: the escaped catalog text with its placeholders filled. */
function expectedDesc(lang, reason, { name = 'Sara', word = 'Zebra', tieNote = '' } = {}) {
    const wordHtml = `<span class="color-amber">${esc(word)}</span>`;
    let html = esc(CATALOG[lang][TEXT_KEY[reason]])
        .replace('{suspect}', () => `<strong>${esc(name)}</strong>`)
        .replace('{word}', () => wordHtml)
        .replaceAll('{br}', '<br>');
    if (tieNote) html += `<br><span class="color-secondary u-fs-080">${esc(tieNote)}</span>`;
    return html;
}

const expectedTitle = (lang, winner) => CATALOG[lang][`result.title.${winner}`];

// ---- The pure part

describe('describeRoundResult / formatRoundResultHtml: each ending in both languages', () => {
    for (const lang of ['fa', 'en']) {
        for (const reason of REASONS) {
            it(`${lang}, ${reason}: title, colour and winner box`, () => {
                setLang(lang);
                const winner = WINNER_OF[reason];
                const data = { winner, reason, suspectName: 'Sara', secretWord: 'Zebra', tieNote: '' };
                const result = describeRoundResult(data);
                assert.equal(result.title, expectedTitle(lang, winner));
                assert.equal(result.color, COLOR_OF[winner]);
                assert.equal(result.html, expectedDesc(lang, reason));
                assert.equal(formatRoundResultHtml(data), result.html, 'the box is the one formatRoundResultHtml builds');
                if (lang === 'en') assert.doesNotMatch(`${result.title}${result.html}`, PERSIAN_LETTER, 'no Persian letter in English');
                else assert.match(result.title, PERSIAN_LETTER);
            });
        }
    }

    it('English, spelled out (a check on the oracle itself)', () => {
        setLang('en');
        const html = (reason) => formatRoundResultHtml({ winner: WINNER_OF[reason], reason, suspectName: 'Sara', secretWord: 'Zebra' });
        assert.equal(html('spy_guess'), '🎯 <strong>Sara</strong> guessed the secret word (<span class="color-amber">Zebra</span>)!');
        assert.equal(
            html('sudden_death'),
            'An innocent citizen was voted out!<br>Sudden death is on, so the spies win.<br>The secret word was: <span class="color-amber">Zebra</span>'
        );
        assert.equal(describeRoundResult({ winner: 'spy', reason: 'citizens_exhausted' }).title, '😈 Spies win!');
        assert.equal(describeRoundResult({ winner: 'citizen', reason: 'spies_eliminated' }).title, '🎉 Citizens win!');
    });

    it('the two languages really differ, and the same data gives the same result every time (nothing is remembered)', () => {
        const data = { winner: 'spy', reason: 'sudden_death', suspectName: 'Sara', secretWord: 'Zebra' };
        setLang('fa');
        const persian = describeRoundResult(data);
        setLang('en');
        const english = describeRoundResult(data);
        assert.notEqual(persian.title, english.title);
        assert.notEqual(persian.html, english.html);
        assert.deepEqual(describeRoundResult(data), english);
        setLang('fa');
        assert.deepEqual(describeRoundResult(data), persian);
    });

    it('escapes the secret word, the name and the tie note (rules unchanged); the catalog markup is only {br} and the two spans', () => {
        setLang('en');
        const name = '<img src=x onerror=alert(1)>';
        const word = `A&B "q" 'z' <b>`;
        const tieNote = '<script>x</script> & more';
        const html = formatRoundResultHtml({ winner: 'spy', reason: 'spy_guess', suspectName: name, secretWord: word, tieNote });
        assert.equal(html, expectedDesc('en', 'spy_guess', { name, word, tieNote }));
        assert.ok(!html.includes('<img') && !html.includes('<script') && !html.includes('<b>'), html);
        assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;') && html.includes('A&amp;B &quot;q&quot; &#39;z&#39; &lt;b&gt;'), html);
    });

    it('a missing secret word or name reads as the catalog default of the active language', () => {
        for (const lang of ['fa', 'en']) {
            setLang(lang);
            const html = formatRoundResultHtml({ winner: 'spy', reason: 'spy_guess', suspectName: '', secretWord: '' });
            assert.equal(
                html,
                expectedDesc(lang, 'spy_guess', { name: CATALOG[lang]['common.spy'], word: CATALOG[lang]['result.defaultWord'] }),
                lang
            );
        }
    });

    it('a tie note goes under the text in the secondary colour', () => {
        setLang('en');
        const html = formatRoundResultHtml({ winner: 'citizen', reason: 'spies_eliminated', secretWord: 'Zebra', tieNote: 'Decided by the wheel' });
        assert.equal(html, expectedDesc('en', 'spies_eliminated', { tieNote: 'Decided by the wheel' }));
        assert.ok(html.endsWith('<br><span class="color-secondary u-fs-080">Decided by the wheel</span>'));
    });

    it('reads nothing but its argument: it runs with no page at all', () => {
        env.reset();
        setLang('en');
        assert.doesNotThrow(() => describeRoundResult({ winner: 'citizen', reason: 'spies_eliminated', secretWord: 'Zebra' }));
    });
});

describe('isRoundOutcome', () => {
    it('accepts the four endings with their own winner', () => {
        for (const reason of REASONS) assert.equal(isRoundOutcome({ winner: WINNER_OF[reason], reason }), true, reason);
    });

    it('rejects everything else: no outcome, damaged values, a winner that does not fit the reason, prototype names', () => {
        const bad = [
            undefined,
            null,
            'spy',
            7,
            [],
            {},
            { winner: 'spy' },
            { reason: 'spy_guess' },
            { winner: 'citizen', reason: 'spy_guess' },
            { winner: 'spy', reason: 'spies_eliminated' },
            { winner: 'spy', reason: 'nope' },
            { winner: 'Spy', reason: 'spy_guess' },
            { winner: '__proto__', reason: 'spy_guess' },
            { winner: 'constructor', reason: 'constructor' },
            { winner: 'toString', reason: 'toString' }
        ];
        for (const outcome of bad) assert.equal(isRoundOutcome(outcome), false, JSON.stringify(outcome));
    });
});

// ---- The DOM part, with the state arranged by hand

/** A result screen as the state would hold it: 3 players, Sara (p1) was voted out, the word is Zebra. */
function arrangeResult(outcome, { word = 'Zebra', tieNote = '' } = {}) {
    gameState.phase = 'result';
    gameState.players = makePlayers(3);
    gameState.players[0].name = 'Sara';
    gameState.round.num = 2;
    gameState.round.result = outcome;
    gameState.vote.targetId = 'p1';
    gameState.vote.tieNote = tieNote;
    hostSecretState.secretWord = word;
}

const title = () => env.el('result-title');
const desc = () => env.el('result-desc');

describe('renderRoundResult', () => {
    for (const lang of ['fa', 'en']) {
        for (const reason of REASONS) {
            it(`${lang}, ${reason}: writes the title, its colour and the winner box from the state`, () => {
                setLang(lang);
                arrangeResult({ winner: WINNER_OF[reason], reason });
                assert.equal(renderRoundResult(), true);
                assert.equal(title().textContent, expectedTitle(lang, WINNER_OF[reason]));
                assert.equal(title().style.color, COLOR_OF[WINNER_OF[reason]]);
                assert.equal(desc().innerHTML, expectedDesc(lang, reason));
            });
        }
    }

    it('the player voted out is named in the guess text, the tie note is kept, the word and the name default in the active language', () => {
        setLang('en');
        arrangeResult({ winner: 'spy', reason: 'spy_guess' }, { tieNote: 'Wheel decided' });
        renderRoundResult();
        assert.equal(desc().innerHTML, expectedDesc('en', 'spy_guess', { name: 'Sara', tieNote: 'Wheel decided' }));

        hostSecretState.secretWord = null;
        gameState.vote.targetId = 'nobody';
        gameState.vote.tieNote = '';
        renderRoundResult();
        assert.equal(desc().innerHTML, expectedDesc('en', 'spy_guess', { name: en['common.spy'], word: en['result.defaultWord'] }));
    });

    it('uses the active language each time it is called', () => {
        arrangeResult({ winner: 'citizen', reason: 'spies_eliminated' });
        setLang('en');
        renderRoundResult();
        assert.equal(title().textContent, en['result.title.citizen']);
        setLang('fa');
        renderRoundResult();
        assert.equal(title().textContent, fa['result.title.citizen']);
        assert.equal(desc().innerHTML, expectedDesc('fa', 'spies_eliminated'));
    });

    it('does nothing, and says so, without a usable outcome: the title and the box stay as they were', () => {
        setLang('en');
        arrangeResult(undefined);
        const bad = [undefined, null, 'spy', 7, [], {}, { winner: 'spy', reason: 'nope' }, { winner: 'citizen', reason: 'spy_guess' }, { winner: '__proto__', reason: 'x' }];
        for (const outcome of bad) {
            title().textContent = 'DEFAULT TITLE';
            title().style.color = '';
            desc().innerHTML = '';
            gameState.round.result = outcome;
            assert.equal(renderRoundResult(), false, JSON.stringify(outcome));
            assert.equal(title().textContent, 'DEFAULT TITLE');
            assert.equal(title().style.color, '');
            assert.equal(desc().innerHTML, '');
        }
    });

    it('does not throw when the round, the vote, the players or the elements are missing or damaged', () => {
        setLang('en');
        arrangeResult({ winner: 'spy', reason: 'spy_guess' });
        gameState.vote = undefined;
        assert.doesNotThrow(() => renderRoundResult());
        assert.equal(desc().innerHTML, expectedDesc('en', 'spy_guess', { name: en['common.spy'] }));

        gameState.players = undefined;
        assert.doesNotThrow(() => renderRoundResult());

        gameState.round = undefined;
        assert.equal(renderRoundResult(), false);

        resetSingletons();
        arrangeResult({ winner: 'spy', reason: 'spy_guess' });
        env.reset();
        assert.equal(renderRoundResult(), false, 'no elements: nothing to draw into');
    });
});

describe('the result phase of renderUI', () => {
    it('draws the winner title and box from the state, next to the round line and the score table', () => {
        setLang('en');
        arrangeResult({ winner: 'spy', reason: 'sudden_death' });
        renderUI();
        assert.equal(title().textContent, en['result.title.spy']);
        assert.equal(title().style.color, ROSE);
        assert.equal(desc().innerHTML, expectedDesc('en', 'sudden_death'));
        assert.equal(env.el('result-round').textContent, 'Round 2');
        assert.equal(env.el('round-leaderboard-body').children.length, 3);
    });

    it('leaves the title and the box alone when no outcome is stored', () => {
        setLang('en');
        arrangeResult(undefined);
        title().textContent = 'DEFAULT TITLE';
        desc().innerHTML = '';
        renderUI();
        assert.equal(title().textContent, 'DEFAULT TITLE');
        assert.equal(desc().innerHTML, '');
        assert.equal(env.el('result-round').textContent, 'Round 2', 'the round line is drawn as before');
    });

    it('draws only in the result phase', () => {
        setLang('en');
        arrangeResult({ winner: 'spy', reason: 'sudden_death' });
        gameState.phase = 'welcome';
        renderUI();
        assert.equal(title().textContent, '');
        assert.equal(desc().innerHTML, '');
    });
});

// ---- Real matches: play to an ending, save, wipe memory, restore

/** The four endings, each reached the way a table reaches it. `names` are the player ids; the names read "Player <id>". */
const SCENARIOS = {
    spies_eliminated: {
        names: ['a', 'b', 'c', 'd'],
        settings: { spyLastChance: false },
        play: () => voteOut(spyOf())
    },
    spy_guess: {
        names: ['a', 'b', 'c', 'd'],
        settings: { spyLastChance: true },
        play: () => {
            voteOut(spyOf());
            assert.equal(gameState.phase, 'guess');
            handleAction({ type: 'SPY_GUESS_VERDICT', verdict: 'correct' });
        }
    },
    sudden_death: {
        names: ['a', 'b', 'c', 'd'],
        settings: { spyLastChance: false, sudden: true },
        play: () => voteOut(gameState.players.find((p) => p.role !== 'spy'))
    },
    citizens_exhausted: {
        // One spy and two citizens: voting out a citizen leaves one of each, and the spies win.
        names: ['a', 'b', 'c'],
        settings: { spyLastChance: false, sudden: false },
        play: () => voteOut(gameState.players.find((p) => p.role !== 'spy'))
    }
};

const spyOf = () => gameState.players.find((p) => p.role === 'spy');

/** The vote falls on `player` and the elimination reveal is dismissed. */
function voteOut(player) {
    gameState.vote.targetId = player.id;
    processElimination([]);
    env.el('btn-elim-continue').onclick();
}

/** Draw the result phase only: the other phases need a lot more DOM than the fake has. */
function renderResultOnly() {
    if (gameState.phase === 'result') renderUI();
}

/** A match as START_MATCH begins it once the form is valid, with `settings` on top of the defaults. */
function startMatch(names, settings) {
    env.seedRandom(7);
    env.stubQuery(NAME_INPUTS, names.map((id) => env.input(`Player ${id}`, id)));
    Object.assign(gameState.settings, { sudden: false, spyLastChance: true }, settings);
    gameState.match.usedWordKeys = [];
    gameState.round.num = 0;
    initMatchPlayers();
    startNextRound();
}

/** Play round 1 of `scenario` in `lang` until the result screen shows. */
function playToResult(scenario, lang) {
    setLang(lang);
    setRenderer(renderResultOnly);
    startMatch(scenario.names, scenario.settings);
    scenario.play();
    assert.equal(gameState.phase, 'result');
}

/** What a person reads on the result screen. */
const snapshot = () => ({
    title: title().textContent,
    color: title().style.color,
    desc: desc().innerHTML,
    round: env.el('result-round').textContent,
    rows: env.el('round-leaderboard-body').children.map((tr) => tr.innerHTML)
});

/** Empty the result screen the way a fresh page has it, except that index.html has a default title there. */
function blankResultScreen() {
    title().textContent = 'DEFAULT TITLE';
    title().style.color = '';
    desc().innerHTML = '';
    env.el('result-round').textContent = '';
    env.el('round-leaderboard-body').replaceChildren();
}

/** Wipe memory as a page reload does, keeping only the save that persist() wrote. Returns the parsed save. */
function reloadKeepingTheSave(edit) {
    const saved = env.storage.get('spy_full_state_master');
    assert.ok(saved, 'a save exists');
    const parsed = JSON.parse(saved);
    if (edit) edit(parsed);
    resetSingletons();
    blankResultScreen();
    env.storage.set('spy_full_state_master', JSON.stringify(parsed));
    return parsed;
}

describe('a real match: the result screen is the stored outcome drawn, by the same function, every time', () => {
    for (const lang of ['fa', 'en']) {
        for (const [reason, scenario] of Object.entries(SCENARIOS)) {
            it(`${lang}, ${reason}: what the round shows is what the catalog says, and drawing it again changes nothing`, () => {
                playToResult(scenario, lang);
                const winner = WINNER_OF[reason];
                const shown = snapshot();
                assert.equal(shown.title, expectedTitle(lang, winner));
                assert.equal(shown.color, COLOR_OF[winner]);
                const name = reason === 'spy_guess' ? `Player ${spyOf().id}` : undefined;
                assert.equal(shown.desc, expectedDesc(lang, reason, { name, word: hostSecretState.secretWord }));
                assert.equal(shown.rows.length, scenario.names.length);
                assert.deepEqual(gameState.round.result, { winner, reason });

                // The restore path in miniature: blank the screen, draw the phase again from the state.
                blankResultScreen();
                renderUI();
                assert.deepEqual(snapshot(), shown);
            });
        }
    }
});

describe('RESTORE_GAME: a result-phase save brings back the same screen, in the language of the saved match', () => {
    for (const lang of ['fa', 'en']) {
        for (const [reason, scenario] of Object.entries(SCENARIOS)) {
            it(`${lang} match, ${reason}, restored on a ${OTHER[lang]} page: same title, colour, description and table`, () => {
                playToResult(scenario, lang);
                const before = snapshot();
                const save = reloadKeepingTheSave();
                assert.equal(save.state.phase, 'result');
                assert.equal(save.state.match.lang, lang);

                setLang(OTHER[lang]);
                handleAction({ type: 'RESTORE_GAME' });

                assert.equal(gameState.phase, 'result');
                assert.equal(getLang(), lang, 'the page switched to the language of the match');
                assert.deepEqual(snapshot(), before);
                assert.equal(title().textContent, expectedTitle(lang, WINNER_OF[reason]));
                if (lang === 'en') {
                    const text = `${title().textContent}${desc().innerHTML}`;
                    assert.doesNotMatch(text, PERSIAN_LETTER, 'an English match restored on a Persian page shows no Persian text');
                }
            });
        }
    }

    it('an English match restored on a page that is already English shows the same screen', () => {
        playToResult(SCENARIOS.spy_guess, 'en');
        const before = snapshot();
        reloadKeepingTheSave();
        setLang('en');
        handleAction({ type: 'RESTORE_GAME' });
        assert.deepEqual(snapshot(), before);
    });

    it('a restore of a result screen goes on: the next round clears the outcome and the next result draws again', () => {
        playToResult(SCENARIOS.spies_eliminated, 'en');
        reloadKeepingTheSave();
        setLang('fa');
        handleAction({ type: 'RESTORE_GAME' });

        handleAction({ type: 'NEXT_ROUND' });
        assert.equal(gameState.round.num, 2);
        assert.ok(!Object.hasOwn(gameState.round, 'result'), 'the outcome of round 1 is gone');
        voteOut(spyOf());
        assert.equal(gameState.phase, 'result');
        assert.equal(title().textContent, en['result.title.citizen'], 'the match is English, whatever the page was');
        assert.equal(desc().innerHTML, expectedDesc('en', 'spies_eliminated', { word: hostSecretState.secretWord }));
        assert.equal(env.el('result-round').textContent, 'Round 2');
    });
});

describe('the stored outcome', () => {
    const lastSave = () => JSON.parse(env.storage.get('spy_full_state_master'));

    it('is exactly { winner, reason }, present only on the result screen: no save made during play carries it', () => {
        setLang('en');
        setRenderer(renderResultOnly);
        startMatch(SCENARIOS.spies_eliminated.names, SCENARIOS.spies_eliminated.settings);
        // A save made right after the round starts (reveal phase), and one made while the vote is resolved.
        assert.equal(gameState.phase, 'reveal');
        let save = lastSave();
        assert.ok(!Object.hasOwn(save.state.round, 'result'), 'reveal: no outcome yet');

        voteOutWithoutContinue(spyOf());
        save = lastSave();
        assert.ok(!Object.hasOwn(save.state.round, 'result'), 'the elimination is on screen, the round is not over: no outcome yet');

        env.el('btn-elim-continue').onclick();
        assert.equal(gameState.phase, 'result');
        save = lastSave();
        assert.equal(save.state.phase, 'result');
        assert.deepEqual(save.state.round.result, { winner: 'citizen', reason: 'spies_eliminated' });
        assert.deepEqual(Object.keys(save.state.round.result).sort(), ['reason', 'winner'], 'nothing else is stored with it');
    });

    it('is removed by the next round, in memory and in the save', () => {
        playToResult(SCENARIOS.spies_eliminated, 'en');
        assert.ok(Object.hasOwn(gameState.round, 'result'));
        handleAction({ type: 'NEXT_ROUND' });
        assert.ok(!Object.hasOwn(gameState.round, 'result'), 'in memory');
        assert.ok(!Object.hasOwn(lastSave().state.round, 'result'), 'in the save');
    });

    it('does not change the version of the save: the same SAVE_VERSION restores a save with and without it', () => {
        playToResult(SCENARIOS.spies_eliminated, 'en');
        const withOutcome = lastSave();
        const withoutOutcome = structuredClone(withOutcome);
        delete withoutOutcome.state.round.result;
        assert.equal(withOutcome.version, withoutOutcome.version);
        assert.equal(withOutcome.state.version, withoutOutcome.state.version);
    });
});

/** Like `voteOut`, but stops at the elimination reveal: the continue button is not pressed. */
function voteOutWithoutContinue(player) {
    gameState.vote.targetId = player.id;
    processElimination([]);
}

describe('RESTORE_GAME: a save from before the outcome was stored, and a damaged one', () => {
    /** Restore the result-phase save of an English match after `edit` changed it; the page starts Persian. */
    function restoreEdited(edit) {
        playToResult(SCENARIOS.spies_eliminated, 'en');
        reloadKeepingTheSave(edit);
        setLang('fa');
        handleAction({ type: 'RESTORE_GAME' });
    }

    it('an old save (no round.result) restores without errors, with the round line and the table, and the title and box as index.html has them', () => {
        assert.doesNotThrow(() => restoreEdited((save) => delete save.state.round.result));
        assert.equal(gameState.phase, 'result');
        assert.equal(getLang(), 'en');
        assert.equal(title().textContent, 'DEFAULT TITLE', 'untouched, as before this fix');
        assert.equal(title().style.color, '');
        assert.equal(desc().innerHTML, '');
        assert.equal(env.el('result-round').textContent, 'Round 1', 'the round line works as before');
        assert.equal(env.el('round-leaderboard-body').children.length, 4, 'and so does the table');
    });

    it('an old save still plays on: the next round resolves and draws its own result', () => {
        restoreEdited((save) => delete save.state.round.result);
        handleAction({ type: 'NEXT_ROUND' });
        voteOut(spyOf());
        assert.equal(gameState.phase, 'result');
        assert.equal(title().textContent, en['result.title.citizen']);
        assert.equal(desc().innerHTML, expectedDesc('en', 'spies_eliminated', { word: hostSecretState.secretWord }));
    });

    it('a damaged round.result restores without errors and shows no wrong text', () => {
        const damaged = [null, 'spy', 7, [], {}, { winner: 'spy' }, { winner: 'spy', reason: 'nope' }, { winner: 'citizen', reason: 'spy_guess' }, { winner: '__proto__', reason: 'x' }];
        for (const value of damaged) {
            resetSingletons();
            assert.doesNotThrow(() => restoreEdited((save) => (save.state.round.result = value)), JSON.stringify(value));
            assert.equal(gameState.phase, 'result');
            assert.equal(title().textContent, 'DEFAULT TITLE', JSON.stringify(value));
            assert.equal(desc().innerHTML, '', JSON.stringify(value));
        }
    });
});
