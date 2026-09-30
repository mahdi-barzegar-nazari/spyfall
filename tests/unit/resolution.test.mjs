/**
 * Characterization tests for game/resolution.js. It is driven through its three exports;
 * finalizeRound (not exported) is reached via processElimination and handleSpyGuessVerdict.
 * The elimination reveal in ui/wheel.js runs on the fake DOM: clicking its continue button plays the
 * "after the reveal" half of processElimination.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { HIDDEN_TIEBREAK, SCORING, getDifficultyMultiplier } from '../../js/core/config.js';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { freshStats, makePlayer, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleDetectiveQueryInternal, handleSpyGuessVerdict, processElimination } = await import(
    '../../js/game/resolution.js'
);
const { isTimerLoopActive, runTick, stopTimerLoop } = await import('../../js/game/timer.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');
const harness = useGameHarness(env, {
    setup: () => {
        for (const id of ['elim-icon', 'elim-name', 'elim-badge', 'elim-note', 'btn-elim-continue']) env.el(id);
        env.el('result-title');
        env.el('result-desc');
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());

// UI TEXT: the only interface strings this file depends on. They are short markers taken from
// game/resolution.js, one per way a round can end. Update them when the interface is translated;
// every other assertion here is about numbers, state and CSS classes.
const RESULT_TEXT = {
    spy_guess: 'کلمه رمز اصلی',
    sudden_death: 'حذف درجا',
    citizens_exhausted: 'ناکافی',
    spies_eliminated: 'شناسایی شدند'
};
const SPY_WON = { emoji: '😈', color: 'var(--brand-rose)' };
const CITIZENS_WON = { emoji: '🎉', color: 'var(--brand-emerald)' };

const spy = (id, rest) => ({ id, role: 'spy', ...rest });
const cit = (id, rest) => ({ id, ...rest });
const fool = (id, rest) => ({ id, role: 'fool', ...rest });
const byId = (id) => gameState.players.find((p) => p.id === id);
const points = (id) => gameState.round.pointsMap[id];

/**
 * Put a round in the middle of play. `seats` lists { id, role?, ...overrides }; names default to the
 * id and every player starts at 0 points. `votes` is hostSecretState.votesCast.
 */
function arrange({
    seats,
    target,
    votes = {},
    difficulty = null,
    prior = 0,
    timerMin = 4,
    pausedSec = 120,
    secretWord = 'Zebra',
    settings = {}
}) {
    gameState.players = seats.map(({ id, role = 'citizen', ...rest }) =>
        makePlayer(id, { name: id, role, team: role === 'spy' ? 'spy' : 'citizen', ...rest })
    );
    gameState.phase = 'vote';
    Object.assign(gameState.round, {
        num: 1,
        wordDifficulty: difficulty,
        eliminationsSoFar: prior,
        pointsMap: Object.fromEntries(gameState.players.map((p) => [p.id, 0]))
    });
    Object.assign(gameState.settings, { timerMin }, settings);
    gameState.timer.pausedSec = pausedSec;
    gameState.vote.targetId = target;
    hostSecretState.votesCast = votes;
    hostSecretState.secretWord = secretWord;
}

/** Press the reveal's continue button: the part of processElimination that follows the reveal. */
const continueAfterReveal = () => env.el('btn-elim-continue').onclick();

/** Check the result screen: which side won, and which of the four endings was shown. */
function assertResult(winner, reason) {
    assert.equal(gameState.phase, 'result');
    assert.ok(env.el('result-title').textContent.includes(winner.emoji));
    assert.equal(env.el('result-title').style.color, winner.color);
    const desc = env.el('result-desc').innerHTML;
    assert.ok(desc.includes(RESULT_TEXT[reason]), `${reason}: ${desc}`);
    for (const other of Object.keys(RESULT_TEXT).filter((r) => r !== reason)) {
        assert.ok(!desc.includes(RESULT_TEXT[other]), `${reason} also shows the ${other} text`);
    }
    assert.ok(desc.includes(hostSecretState.secretWord), desc);
}

describe('processElimination: a spy is caught', () => {
    const SEATS = [spy('S1'), spy('S2'), cit('C1'), cit('C2'), cit('C3'), fool('F')];

    it('marks the spy out and pays the catch-time and survival stats (hard word, hand-worked)', () => {
        // Discussion time was 240 s and 100 s were left -> 140 s used. The spy survived 2 earlier
        // wrong eliminations on a hard word (x2): 1 * 2 * 2 = 4. Each citizen-team voter for the spy
        // gets 2 * 2 = 4. S2 is on the spy team, so their vote does not count.
        arrange({
            seats: SEATS,
            target: 'S1',
            difficulty: 'hard',
            prior: 2,
            pausedSec: 100,
            votes: { C1: 'S1', C2: 'S1', F: 'S1', S2: 'S1', C3: 'C1', S1: 'C1', ghost: 'S1' }
        });
        processElimination([]);
        assert.equal(byId('S1').isAlive, false);
        assert.equal(byId('S1').stats.vs, 1);
        assert.equal(byId('S1').stats.totalCatchTimeSec, 140);
        assert.equal(byId('S1').stats.hiddenTieBreakerScore, 4);
        for (const id of ['C1', 'C2', 'F']) {
            assert.equal(byId(id).stats.spiesCaught, 1, id);
            assert.equal(byId(id).stats.hiddenTieBreakerScore, 4, id);
        }
        for (const id of ['C3', 'S2']) {
            assert.equal(byId(id).stats.spiesCaught, 0, id);
            assert.equal(byId(id).stats.hiddenTieBreakerScore, 0, id);
        }
        assert.equal(gameState.round.eliminationsSoFar, 3);
        assert.ok(gameState.players.every((p) => p.score === 0 && points(p.id) === 0));
    });

    it('adds to the stats the players already have (medium word, hand-worked)', () => {
        // 60 s used up completely -> +60 on top of 30. Survival 1 * 1 * 1.5 = 1.5 on top of 0.5.
        // Citizen vote 2 * 1.5 = 3 on top of 1.
        arrange({
            seats: [spy('S1'), cit('C1'), cit('C2')],
            target: 'S1',
            votes: { C1: 'S1' },
            difficulty: 'medium',
            prior: 1,
            timerMin: 1,
            pausedSec: 0
        });
        byId('S1').stats = { ...freshStats(), totalCatchTimeSec: 30, hiddenTieBreakerScore: 0.5 };
        byId('C1').stats = { ...freshStats(), spiesCaught: 2, hiddenTieBreakerScore: 1 };
        processElimination([]);
        assert.equal(byId('S1').stats.totalCatchTimeSec, 90);
        assert.equal(byId('S1').stats.hiddenTieBreakerScore, 2);
        assert.equal(byId('C1').stats.spiesCaught, 3);
        assert.equal(byId('C1').stats.hiddenTieBreakerScore, 4);
    });

    for (const [difficulty, prior] of [[null, 0], ['easy', 3], ['medium', 2], ['hard', 1]]) {
        it(`scales the hidden bonuses by the word's difficulty (${difficulty}, ${prior} earlier)`, () => {
            const multiplier = getDifficultyMultiplier(difficulty);
            arrange({ seats: [spy('S1'), cit('C1')], target: 'S1', votes: { C1: 'S1' }, difficulty, prior });
            processElimination([]);
            assert.equal(byId('S1').stats.hiddenTieBreakerScore, HIDDEN_TIEBREAK.SPY_SURVIVAL_PER_ATTEMPT * prior * multiplier);
            assert.equal(byId('C1').stats.hiddenTieBreakerScore, HIDDEN_TIEBREAK.CITIZEN_CORRECT_VOTE * multiplier);
        });
    }

    it('counts time used as 0 when the clock shows more time left than the round had', () => {
        arrange({ seats: [spy('S1'), cit('C1')], target: 'S1', timerMin: 4, pausedSec: 500 });
        processElimination([]);
        assert.equal(byId('S1').stats.totalCatchTimeSec, 0);
    });

    it('counts the whole round as used when the caught spy is voted out at time-out', () => {
        arrange({ seats: [spy('S1'), cit('C1')], target: 'S1', timerMin: 4, pausedSec: 0 });
        processElimination([]);
        assert.equal(byId('S1').stats.totalCatchTimeSec, 240);
    });

    it('goes on to the spy\'s word guess after the reveal, in either game mode', () => {
        for (const sudden of [false, true]) {
            arrange({ seats: [spy('S1'), cit('C1'), cit('C2')], target: 'S1', settings: { sudden } });
            processElimination([]);
            assert.equal(gameState.phase, 'vote', 'the phase only changes after the reveal');
            continueAfterReveal();
            assert.equal(gameState.phase, 'guess');
        }
    });
});

describe('processElimination: an innocent player is eliminated', () => {
    it('charges the wrong voters and pays every live spy (hand-worked)', () => {
        arrange({
            seats: [spy('S1'), spy('S2'), cit('C1'), cit('C2'), cit('C3'), cit('C4')],
            target: 'C4',
            votes: { C1: 'C4', C2: 'C4', C3: 'S1', S1: 'C4', S2: 'C1', C4: 'C1' }
        });
        processElimination([]);
        assert.equal(byId('C4').isAlive, false);
        assert.equal(byId('C4').stats.innocentVotesReceived, 1);
        // Only citizen-team voters for C4 were wrong: C1 and C2. The spy S1 voted for C4 too.
        const wrong = Object.fromEntries(gameState.players.map((p) => [p.id, p.stats.wrongVotes]));
        assert.deepEqual(wrong, { S1: 0, S2: 0, C1: 1, C2: 1, C3: 0, C4: 0 });
        for (const id of ['S1', 'S2']) {
            assert.equal(byId(id).score, SCORING.SPY_SURVIVE_WRONG_VOTE, id);
            assert.equal(points(id), 1, id);
            assert.equal(byId(id).stats.citizensEliminatedBeforeCaught, 1, id);
            assert.equal(byId(id).stats.vs, 0, id);
        }
        for (const id of ['C1', 'C2', 'C3', 'C4']) assert.equal(byId(id).score, 0, id);
        assert.equal(gameState.round.eliminationsSoFar, 1);
    });

    it('pays only the spies who are still alive', () => {
        arrange({
            seats: [spy('S0', { isAlive: false }), spy('S1'), cit('C1'), cit('C2'), cit('C3')],
            target: 'C3'
        });
        processElimination([]);
        assert.equal(byId('S0').score, 0);
        assert.equal(byId('S1').score, 1);
        assert.equal(byId('S0').stats.citizensEliminatedBeforeCaught, 0);
    });

    it('carries on with the discussion when the spies are still outnumbered', () => {
        arrange({
            seats: [spy('S1'), spy('S2'), cit('C1'), cit('C2'), cit('C3'), cit('C4')],
            target: 'C4',
            pausedSec: 120
        });
        processElimination([]);
        continueAfterReveal();
        assert.equal(gameState.phase, 'timer');
        assert.equal(gameState.timer.running, true);
        assert.equal(gameState.timer.pausedSec, 120, 'resumes from the stored seconds');
        assert.equal(isTimerLoopActive(), true);
    });

    it('ends the round for the spies when they equal the citizens (>=, not >), hand-worked', () => {
        // 2 spies, 3 citizens, one citizen out: 2 v 2. Each spy: 1 (survived) + 2 (win) = 3 points,
        // and a hard word (x2) gives the never-caught bonus 4 * 2 = 8.
        arrange({
            seats: [spy('S1'), spy('S2'), cit('C1'), cit('C2'), cit('C3')],
            target: 'C3',
            difficulty: 'hard'
        });
        processElimination([]);
        continueAfterReveal();
        for (const id of ['S1', 'S2']) {
            assert.equal(byId(id).score, 3, id);
            assert.equal(points(id), 3, id);
            assert.equal(byId(id).stats.sw, 1, id);
            assert.equal(byId(id).stats.hiddenTieBreakerScore, 8, id);
        }
        assert.ok(['C1', 'C2', 'C3'].every((id) => byId(id).score === 0 && byId(id).stats.cw === 0));
        assertResult(SPY_WON, 'citizens_exhausted');
        assert.equal(isTimerLoopActive(), false);
    });

    it('sudden death: the spies win at once, dead spies score too but earn no evasion bonus', () => {
        arrange({
            seats: [spy('S0', { isAlive: false }), spy('S1'), cit('C1'), cit('C2'), cit('C3'), cit('C4')],
            target: 'C4',
            settings: { sudden: true }
        });
        processElimination([]);
        continueAfterReveal();
        assert.equal(byId('S0').score, SCORING.SPY_WIN_ROUND);
        assert.equal(points('S0'), 2);
        assert.equal(byId('S0').stats.sw, 1);
        assert.equal(byId('S0').stats.hiddenTieBreakerScore, 0);
        assert.equal(byId('S1').score, 3);
        assert.equal(byId('S1').stats.sw, 1);
        assert.equal(byId('S1').stats.hiddenTieBreakerScore, HIDDEN_TIEBREAK.SPY_FULL_ROUND_SURVIVAL);
        assert.ok(['C1', 'C2', 'C3', 'C4'].every((id) => byId(id).score === 0));
        assertResult(SPY_WON, 'sudden_death');
    });
});

describe('processElimination: wagers', () => {
    const SEATS = () => [
        spy('S1'),
        cit('C1', { score: 10 }),
        cit('C2', { score: 6 }),
        cit('C3'),
        cit('C4')
    ];
    const WAGERS = [{ pid: 'C1', amt: 3 }, { pid: 'C2', amt: 5 }];

    it('pays a winning wager back plus profit when the eliminated player was a spy (hand-worked)', () => {
        // C1: 10 - 3 + (3 + 3 * 1) = 13. C2: 6 - 5 + (5 + 5 * 1) = 11.
        arrange({ seats: SEATS(), target: 'S1' });
        processElimination(WAGERS);
        assert.equal(byId('C1').score, 13);
        assert.equal(points('C1'), 3);
        assert.equal(byId('C1').stats.bw, 1);
        assert.equal(byId('C1').stats.bl, 0);
        assert.equal(byId('C1').stats.wagerProfit, 3);
        assert.equal(byId('C2').score, 11);
        assert.equal(points('C2'), 5);
        assert.equal(byId('C2').stats.bw, 1);
        assert.equal(byId('C2').stats.wagerProfit, 5);
    });

    it('uses SCORING.WAGER_PROFIT_MULTIPLIER for the profit', () => {
        arrange({ seats: SEATS(), target: 'S1' });
        processElimination([{ pid: 'C1', amt: 4 }]);
        assert.equal(byId('C1').score, 10 - 4 + 4 + 4 * SCORING.WAGER_PROFIT_MULTIPLIER);
        assert.equal(byId('C1').stats.wagerProfit, 4 * SCORING.WAGER_PROFIT_MULTIPLIER);
    });

    it('takes a losing wager when the eliminated player was innocent (hand-worked)', () => {
        arrange({ seats: SEATS(), target: 'C4' });
        processElimination(WAGERS);
        assert.equal(byId('C1').score, 7);
        assert.equal(points('C1'), -3);
        assert.equal(byId('C1').stats.bl, 1);
        assert.equal(byId('C1').stats.bw, 0);
        assert.equal(byId('C1').stats.wagerProfit, -3);
        assert.equal(byId('C2').score, 1);
        assert.equal(points('C2'), -5);
        assert.equal(byId('C2').stats.bl, 1);
        assert.equal(byId('C2').stats.wagerProfit, -5);
    });

    it('ignores wagers of 0 or less, and wagers by unknown players', () => {
        arrange({ seats: SEATS(), target: 'S1' });
        processElimination([
            { pid: 'C1', amt: 0 },
            { pid: 'C2', amt: -4 },
            { pid: 'ghost', amt: 5 }
        ]);
        assert.equal(byId('C1').score, 10);
        assert.equal(byId('C2').score, 6);
        assert.deepEqual(byId('C1').stats, freshStats());
        assert.deepEqual(byId('C2').stats, freshStats());
    });
});

describe('processElimination: the elimination reveal', () => {
    it('shows who was eliminated, as a spy or as an innocent, and opens then closes the modal', () => {
        arrange({ seats: [spy('S1', { name: 'Sara' }), cit('C1'), cit('C2')], target: 'S1' });
        processElimination([]);
        assert.ok(env.el('elim-name').textContent.includes('Sara'));
        assert.ok(env.el('elim-badge').classList.contains('role-spy'));
        assert.deepEqual(harness.actions, [{ type: 'OPEN_MODAL', payload: 'elimination-reveal' }]);
        const spyNote = env.el('elim-note').textContent;
        continueAfterReveal();
        assert.deepEqual(harness.actions[1], { type: 'CLOSE_MODAL', payload: 'elimination-reveal' });

        arrange({
            seats: [spy('S1'), spy('S2'), cit('C1', { name: 'Cyrus' }), cit('C2'), cit('C3')],
            target: 'C1'
        });
        env.el('elim-badge').className = '';
        processElimination([]);
        assert.ok(env.el('elim-name').textContent.includes('Cyrus'));
        assert.ok(env.el('elim-badge').classList.contains('role-citizen'));
        assert.ok(!env.el('elim-badge').classList.contains('role-spy'));
        assert.ok(env.el('elim-note').textContent);
        assert.notEqual(env.el('elim-note').textContent, spyNote);
    });

    it('continues by itself after 3.8 s, and the button cannot run the follow-up a second time', () => {
        arrange({ seats: [spy('S1'), cit('C1'), cit('C2')], target: 'S1' });
        processElimination([]);
        const staleClick = env.el('btn-elim-continue').onclick;
        env.clock.tick(3799);
        assert.equal(gameState.phase, 'vote');
        env.clock.tick(1);
        assert.equal(gameState.phase, 'guess');
        const rendersAfterAuto = harness.renders.length;
        staleClick();
        assert.equal(harness.renders.length, rendersAfterAuto);
    });

    it('does nothing when the voted-out player does not exist', () => {
        arrange({ seats: [spy('S1'), cit('C1'), cit('C2')], target: 'nobody' });
        processElimination([{ pid: 'C1', amt: 2 }]);
        assert.deepEqual(harness.renders, []);
        assert.deepEqual(harness.actions, []);
        assert.equal(env.el('elim-name').textContent, '');
        assert.ok(gameState.players.every((p) => p.isAlive && p.score === 0));
        assert.equal(gameState.round.eliminationsSoFar, 0);
    });
});

describe('handleSpyGuessVerdict: the spy guessed correctly', () => {
    it('scores the guess and the win for the spy team, and shows the spy-guess ending (hand-worked)', () => {
        // Caught spy S1: 3 (guess) + 2 (win) = 5. Live spy S2: 2, plus 4 * 1.5 = 6 for never being caught.
        arrange({
            seats: [spy('S1', { name: 'Sara', isAlive: false }), spy('S2'), cit('C1'), cit('C2'), cit('C3')],
            target: 'S1',
            difficulty: 'medium'
        });
        gameState.phase = 'guess';
        handleSpyGuessVerdict('correct');
        assert.equal(hostSecretState.guessVerdict, 'correct');
        assert.equal(byId('S1').score, 5);
        assert.equal(points('S1'), 5);
        assert.equal(byId('S1').stats.spyGuesses, 1);
        assert.equal(byId('S1').stats.sw, 1);
        assert.equal(byId('S1').stats.hiddenTieBreakerScore, 0);
        assert.equal(byId('S2').score, 2);
        assert.equal(points('S2'), 2);
        assert.equal(byId('S2').stats.spyGuesses, 0);
        assert.equal(byId('S2').stats.hiddenTieBreakerScore, 6);
        assert.ok(['C1', 'C2', 'C3'].every((id) => byId(id).score === 0 && byId(id).stats.cw === 0));
        assertResult(SPY_WON, 'spy_guess');
        assert.ok(env.el('result-desc').innerHTML.includes('Sara'));
        assert.ok(env.el('result-desc').innerHTML.includes('Zebra'));
    });

    it('uses SCORING for the guess and the win', () => {
        arrange({
            seats: [spy('S1', { isAlive: false }), spy('S2'), cit('C1'), cit('C2')],
            target: 'S1'
        });
        handleSpyGuessVerdict('correct');
        assert.equal(byId('S1').score, SCORING.SPY_CORRECT_GUESS + SCORING.SPY_WIN_ROUND);
    });

    it('SUSPECTED BUG: if the guessing spy was the last one alive, the citizens win instead', () => {
        // finalizeRound checks "no spy left" before it looks at forceSpyWin, so in a one-spy game
        // (the default) a correct guess pays the spy 3 points but the round is still a citizen win:
        // everyone on the citizen team scores, the spy team gets no win, and the result screen shows
        // the citizens' ending, not the spy-guess one. The spy-guess ending is only reachable while
        // another spy is still alive (previous tests). Update this test if that order is changed.
        arrange({ seats: [spy('S1', { isAlive: false }), cit('C1'), cit('C2')], target: 'S1' });
        handleSpyGuessVerdict('correct');
        assert.equal(byId('S1').score, SCORING.SPY_CORRECT_GUESS);
        assert.equal(byId('S1').stats.spyGuesses, 1);
        assert.equal(byId('S1').stats.sw, 0);
        for (const id of ['C1', 'C2']) {
            assert.equal(byId(id).score, SCORING.CITIZEN_WIN_ROUND, id);
            assert.equal(byId(id).stats.cw, 1, id);
        }
        assertResult(CITIZENS_WON, 'spies_eliminated');
    });

    it('still ends the round for the spies when the guessing spy cannot be found', () => {
        arrange({ seats: [spy('S1', { isAlive: false }), spy('S2'), cit('C1'), cit('C2')], target: 'nobody' });
        handleSpyGuessVerdict('correct');
        assert.equal(byId('S1').score, SCORING.SPY_WIN_ROUND);
        assert.equal(byId('S2').score, SCORING.SPY_WIN_ROUND);
        assert.equal(gameState.phase, 'result');
    });

    it('stops the countdown when the round ends and plays the victory vibration', () => {
        arrange({ seats: [spy('S1', { isAlive: false }), cit('C1'), cit('C2')], target: 'S1' });
        runTick();
        assert.equal(isTimerLoopActive(), true);
        handleSpyGuessVerdict('correct');
        assert.equal(isTimerLoopActive(), false);
        assert.deepEqual(env.logs.vibrations[env.logs.vibrations.length - 1], [150, 100, 250]);
    });
});

describe('handleSpyGuessVerdict: the guess was not correct', () => {
    /** S1 was caught and guessed wrong. Dead and spectating citizens still share in a citizen win. */
    const CITIZEN_WIN_SEATS = () => [
        spy('S1', { isAlive: false }),
        cit('C1'),
        cit('C2'),
        cit('D', { isAlive: false }),
        fool('F'),
        fool('F2', { isAlive: false }),
        cit('X', { isSpectator: true })
    ];

    for (const verdict of ['wrong', 'pass', undefined]) {
        it(`verdict ${String(verdict)}, no spy left: every citizen-team player scores the win`, () => {
            arrange({ seats: CITIZEN_WIN_SEATS(), target: 'S1' });
            handleSpyGuessVerdict(verdict);
            assert.equal(hostSecretState.guessVerdict, verdict);
            for (const id of ['C1', 'C2', 'D', 'F', 'F2']) {
                assert.equal(byId(id).score, SCORING.CITIZEN_WIN_ROUND, id);
                assert.equal(points(id), 2, id);
                assert.equal(byId(id).stats.cw, 1, id);
            }
            assert.equal(byId('F').stats.foolEscaped, 1, 'a fool who is still in the game escaped');
            assert.equal(byId('F2').stats.foolEscaped, 0, 'an eliminated fool did not');
            assert.ok(['S1', 'X'].every((id) => byId(id).score === 0 && byId(id).stats.cw === 0));
            assert.equal(byId('S1').stats.sw, 0);
            assertResult(CITIZENS_WON, 'spies_eliminated');
        });
    }

    it('spies win when they equal the citizens who are left (>=, not >), hand-worked', () => {
        // S1 is caught, S2 and C1 are alive: 1 v 1. S1 and S2 both share the win (2 each); only the
        // live S2 earns the never-caught bonus 4 * 2 = 8 on a hard word.
        arrange({
            seats: [spy('S1', { isAlive: false }), spy('S2'), cit('C1'), cit('C2', { isAlive: false })],
            target: 'S1',
            difficulty: 'hard'
        });
        handleSpyGuessVerdict('wrong');
        assert.equal(byId('S1').score, 2);
        assert.equal(byId('S1').stats.hiddenTieBreakerScore, 0);
        assert.equal(byId('S2').score, 2);
        assert.equal(points('S2'), 2);
        assert.equal(byId('S2').stats.sw, 1);
        assert.equal(byId('S2').stats.hiddenTieBreakerScore, 8);
        assert.ok(['C1', 'C2'].every((id) => byId(id).score === 0));
        assertResult(SPY_WON, 'citizens_exhausted');
    });

    it('does not count a spectator as a live citizen', () => {
        arrange({
            seats: [spy('S1', { isAlive: false }), spy('S2'), cit('C1'), cit('X', { isSpectator: true })],
            target: 'S1'
        });
        handleSpyGuessVerdict('wrong');
        assertResult(SPY_WON, 'citizens_exhausted');
    });

    it('resumes the discussion when the citizens still outnumber the spies', () => {
        arrange({
            seats: [spy('S1', { isAlive: false }), spy('S2'), cit('C1'), cit('C2')],
            target: 'S1',
            pausedSec: 87
        });
        gameState.phase = 'guess';
        handleSpyGuessVerdict('wrong');
        assert.equal(gameState.phase, 'timer');
        assert.equal(gameState.timer.running, true);
        assert.equal(gameState.timer.pausedSec, 87);
        assert.equal(isTimerLoopActive(), true);
        assert.ok(gameState.players.every((p) => p.score === 0));
        assert.equal(hostSecretState.guessVerdict, 'wrong');
        assert.equal(env.el('result-desc').innerHTML, '');
    });
});

describe('round result screen', () => {
    it('escapes the suspect name, the secret word and the tie note', () => {
        arrange({
            seats: [
                spy('S1', { name: '<img src=x onerror=alert(1)>', isAlive: false }),
                spy('S2'),
                cit('C1'),
                cit('C2')
            ],
            target: 'S1',
            secretWord: '<script>alert(2)</script>'
        });
        gameState.vote.tieNote = '<i>tie</i>';
        handleSpyGuessVerdict('correct');
        const desc = env.el('result-desc').innerHTML;
        assert.ok(!desc.includes('<img') && !desc.includes('<script') && !desc.includes('<i>'));
        assert.ok(desc.includes('&lt;img src=x onerror=alert(1)&gt;'));
        assert.ok(desc.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));
        assert.ok(desc.includes('&lt;i&gt;tie&lt;/i&gt;'));
    });

    it('escapes the secret word in every ending', () => {
        arrange({
            seats: [spy('S1', { isAlive: false }), cit('C1')],
            target: 'S1',
            secretWord: '<b>x</b>'
        });
        handleSpyGuessVerdict('pass');
        assert.ok(!env.el('result-desc').innerHTML.includes('<b>'));
    });
});

describe('handleDetectiveQueryInternal', () => {
    const SEATS = () => [
        makePlayer('Q', { name: 'Detective', role: 'detective' }),
        spy('S1', { name: 'Sara' }),
        cit('C1', { name: 'Cyrus' }),
        fool('F', { name: 'Farid' }),
        cit('D', { name: 'Dead', isAlive: false }),
        spy('DS', { name: 'DeadSpy', isAlive: false })
    ];
    const arrangeInquiry = (extra = {}) => {
        arrange({ seats: SEATS(), target: null, ...extra });
        env.el('detective-result-box');
        env.el('btn-detective-inquiry');
        env.el('detective-target-select');
    };

    it('ignores a target who is eliminated or does not exist', () => {
        arrangeInquiry();
        handleDetectiveQueryInternal('D');
        handleDetectiveQueryInternal('DS');
        handleDetectiveQueryInternal('nobody');
        assert.equal(hostSecretState.detectiveUsed, false);
        assert.equal(gameState.settings.detectiveUsed, false);
        assert.equal(hostSecretState.detectiveInquiryResult, null);
        assert.equal(env.el('detective-result-box').innerHTML, '');
        assert.equal(env.el('btn-detective-inquiry').disabled, false);
        assert.deepEqual(harness.renders, []);
    });

    it('tells the detective a spy is a spy, uses up the inquiry and locks the controls', () => {
        arrangeInquiry();
        handleDetectiveQueryInternal('S1');
        assert.equal(hostSecretState.detectiveUsed, true);
        assert.equal(gameState.settings.detectiveUsed, true);
        assert.ok(hostSecretState.detectiveInquiryResult.includes('Sara'));
        const box = env.el('detective-result-box').innerHTML;
        assert.ok(box.includes('color-rose') && box.includes('Sara'));
        assert.ok(!box.includes('color-emerald'));
        assert.equal(env.el('btn-detective-inquiry').disabled, true);
        assert.equal(env.el('detective-target-select').disabled, true);
        assert.deepEqual(harness.renders, ['vote']);
    });

    it('tells the detective a citizen or a fool is innocent, in a different style and wording', () => {
        arrangeInquiry();
        handleDetectiveQueryInternal('C1');
        const citizenText = hostSecretState.detectiveInquiryResult;
        const citizenBox = env.el('detective-result-box').innerHTML;
        assert.ok(citizenBox.includes('color-emerald') && citizenBox.includes('Cyrus'));
        assert.ok(!citizenBox.includes('color-rose'));

        arrangeInquiry();
        handleDetectiveQueryInternal('S1');
        const spyText = hostSecretState.detectiveInquiryResult;
        assert.notEqual(spyText.replace('Sara', '#'), citizenText.replace('Cyrus', '#'));

        arrangeInquiry();
        handleDetectiveQueryInternal('F');
        assert.ok(env.el('detective-result-box').innerHTML.includes('color-emerald'));
        assert.equal(hostSecretState.detectiveInquiryResult.replace('Farid', '#'), citizenText.replace('Cyrus', '#'));
    });

    it('works when the inquiry button and the target select are not on the page', () => {
        arrange({ seats: SEATS(), target: null });
        env.el('detective-result-box');
        handleDetectiveQueryInternal('S1');
        assert.equal(hostSecretState.detectiveUsed, true);
    });

    it('escapes the name in the on-screen result, for a spy and for an innocent; the stored text keeps the raw name', () => {
        // The stored text is escaped later, when ui/render.js redraws the role card.
        const evil = '<img src=x onerror=alert(1)>';
        for (const target of [spy('T', { name: evil }), cit('T', { name: evil })]) {
            arrange({ seats: [makePlayer('Q', { role: 'detective' }), target], target: null });
            env.el('detective-result-box');
            handleDetectiveQueryInternal('T');
            const box = env.el('detective-result-box').innerHTML;
            assert.ok(!box.includes('<img') && box.includes('&lt;img src=x onerror=alert(1)&gt;'), target.role);
            assert.ok(hostSecretState.detectiveInquiryResult.includes(evil), target.role);
        }
    });
});
