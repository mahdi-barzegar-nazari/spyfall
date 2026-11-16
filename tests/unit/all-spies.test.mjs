/**
 * The all-spies surprise round (the `allSpies` setting): when a round turns into one (game/rounds.js), what the
 * players are given in it, and how it ends (game/resolution.js, ui/results.js). Randomness is seeded
 * (env.seedRandom), so every run replays the same sequences.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { ALL_SPIES_MIN_PLAYERS, ALL_SPIES_ONE_IN } from '../../js/core/config.js';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { setLang } from '../../js/i18n/index.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayer, makePlayers, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { startNextRound } = await import('../../js/game/rounds.js');
const { processElimination } = await import('../../js/game/resolution.js');
const { isRoundOutcome } = await import('../../js/ui/results.js');
const { stopTimerLoop } = await import('../../js/game/timer.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');
const harness = useGameHarness(env, {
    setup: () => {
        for (const id of ['elim-icon', 'elim-name', 'elim-badge', 'elim-note', 'btn-elim-continue', 'result-title', 'result-desc']) env.el(id);
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());
afterEach(() => setLang('fa'));

const WORDS = [
    { word: 'Alpha', foolWord: 'Apple', hint: 'greek', diff: 'easy' },
    { word: 'Bravo', foolWord: 'Banana', hint: 'cheer', diff: 'medium' },
    { word: 'Charlie', foolWord: 'Cherry', hint: 'chaplin', diff: 'hard' }
];

/** Seat `players` players with the all-spies option as given; the pool is the three WORDS above. */
function arrange({ players = 5, allSpies = true, settings = {} } = {}) {
    env.storage.set('spy_custom_words', JSON.stringify(WORDS));
    gameState.players = makePlayers(players);
    Object.assign(gameState.settings, { cats: ['custom'], allSpies, fool: true, detective: true }, settings);
}

/** Play `rounds` rounds in a row and list, for each one, whether it was an all-spies round. */
function playRounds(rounds) {
    const flags = [];
    for (let i = 0; i < rounds; i++) {
        startNextRound();
        flags.push(gameState.round.allSpies === true);
    }
    return flags;
}

describe('when a round is an all-spies round', () => {
    it('never without the option, however many rounds are played', () => {
        env.seedRandom(7);
        arrange({ allSpies: false });
        assert.ok(playRounds(120).every((flag) => flag === false));
    });

    it('with the option, about once in ALL_SPIES_ONE_IN rounds', () => {
        env.seedRandom(7);
        arrange();
        const flags = playRounds(240);
        const count = flags.filter(Boolean).length;
        assert.ok(count >= 240 / ALL_SPIES_ONE_IN / 3, `${count} all-spies rounds in 240`);
        assert.ok(count <= (240 / ALL_SPIES_ONE_IN) * 2, `${count} all-spies rounds in 240`);
    });

    it('never the first round, and never two rounds in a row', () => {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
            env.seedRandom(seed);
            arrange();
            const flags = playRounds(80);
            assert.equal(flags[0], false, `seed ${seed}`);
            for (let i = 1; i < flags.length; i++) assert.ok(!(flags[i] && flags[i - 1]), `seed ${seed}: rounds ${i} and ${i + 1}`);
        }
    });

    it('not with fewer than ALL_SPIES_MIN_PLAYERS players', () => {
        env.seedRandom(7);
        arrange({ players: ALL_SPIES_MIN_PLAYERS - 1 });
        assert.ok(playRounds(120).every((flag) => flag === false));
    });

    it('a first round draws the same random numbers with the option on and off (the chance is only drawn when it could matter)', () => {
        const drawsInFirstRound = (allSpies) => {
            let calls = 0;
            env.stubCrypto(() => {
                calls++;
                return 12345;
            });
            arrange({ allSpies });
            gameState.round.num = 0;
            gameState.round.allSpies = false;
            startNextRound();
            return calls;
        };
        const off = drawsInFirstRound(false);
        assert.ok(off > 0);
        assert.equal(drawsInFirstRound(true), off);
    });
});

/** The second round of a match, with the chance of an all-spies round forced to come up (every random draw is 0). */
function forcedAllSpiesRound(options) {
    env.stubCrypto(() => 0);
    arrange(options);
    gameState.round.num = 1;
    gameState.round.allSpies = false;
    startNextRound();
}

describe('what the players get in an all-spies round', () => {
    it('everyone is a spy on the spy team, with a hint instead of the word, and nobody is a decoy or a detective', () => {
        forcedAllSpiesRound({ players: 6 });
        assert.equal(gameState.round.allSpies, true);
        assert.ok(gameState.players.every((p) => p.role === 'spy' && p.team === 'spy'));
        for (const p of gameState.players) {
            assert.equal(hostSecretState.roles[p.id].role, 'spy');
            assert.ok(hostSecretState.roles[p.id].hint, `${p.name} has a hint`);
        }
        assert.ok(gameState.players.every((p) => p.isAlive && !p.isSpectator));
    });

    it('does not count as a round as a spy in anyone\'s statistics', () => {
        forcedAllSpiesRound({ players: 6 });
        assert.ok(gameState.players.every((p) => p.stats.timesSpy === 0));
    });

    it('the round after it is an ordinary one again, with the usual number of spies', () => {
        forcedAllSpiesRound({ players: 6, settings: { spiesCount: 2 } });
        assert.equal(gameState.round.allSpies, true);
        env.stubCrypto(() => 0);
        startNextRound();
        assert.equal(gameState.round.allSpies, false);
        assert.equal(gameState.players.filter((p) => p.role === 'spy').length, 2);
    });
});

/** Put an all-spies round at the end of its vote: the voted player is `target`. */
function arrangeVoteEnd() {
    gameState.players = ['A', 'B', 'C', 'D'].map((id) => makePlayer(id, { name: id, role: 'spy', team: 'spy', score: 5 }));
    gameState.phase = 'vote';
    Object.assign(gameState.round, {
        num: 3,
        allSpies: true,
        eliminationsSoFar: 0,
        pointsMap: { A: 0, B: 0, C: 0, D: 0 }
    });
    Object.assign(gameState.settings, { wager: true, sudden: true, spyLastChance: true });
    gameState.vote.targetId = 'B';
    hostSecretState.votesCast = { A: 'B', B: 'C', C: 'B', D: 'B' };
    hostSecretState.secretWord = 'Zebra';
}

describe('the end of an all-spies round', () => {
    it('reads the voted name out as a spy, then says that everybody was one', () => {
        arrangeVoteEnd();
        processElimination([]);
        assert.equal(env.el('elim-badge').textContent.length > 0, true);
        assert.equal(env.el('elim-icon').textContent, '🕵️');
        assert.equal(gameState.phase, 'vote');
        env.el('btn-elim-continue').onclick();
        assert.equal(gameState.phase, 'result');
        assert.deepEqual(gameState.round.result, { winner: 'all_spies', reason: 'everyone_spy' });
        assert.ok(isRoundOutcome(gameState.round.result));
        assert.ok(env.el('result-title').textContent.includes('🎭'));
        assert.equal(env.el('result-title').style.color, 'var(--brand-amber)');
        assert.ok(env.el('result-desc').innerHTML.includes('Zebra'));
    });

    it('gives nobody points, removes nobody, and changes no statistic', () => {
        arrangeVoteEnd();
        const before = JSON.stringify(gameState.players);
        processElimination([{ pid: 'A', amt: 3 }]);
        env.el('btn-elim-continue').onclick();
        assert.equal(JSON.stringify(gameState.players), before);
        assert.deepEqual(gameState.round.pointsMap, { A: 0, B: 0, C: 0, D: 0 });
    });

    it('does not offer the spy a last guess, and stops the countdown', () => {
        arrangeVoteEnd();
        processElimination([]);
        env.el('btn-elim-continue').onclick();
        assert.notEqual(gameState.phase, 'guess');
        assert.equal(gameState.timer.running, false);
    });

    it('is the same screen after the match is reloaded: the stored outcome is one the result screen can draw', () => {
        arrangeVoteEnd();
        processElimination([]);
        env.el('btn-elim-continue').onclick();
        const saved = JSON.parse(JSON.stringify(gameState.round.result));
        assert.ok(isRoundOutcome(saved));
        assert.ok(!isRoundOutcome({ winner: 'all_spies', reason: 'spy_guess' }));
    });
});
