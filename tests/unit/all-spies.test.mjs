/**
 * The all-spies surprise round (the `allSpies` setting): when a round turns into one (the countdown kept on the
 * device, see drawAllSpiesRound in game/rounds.js), what the players are given in it, and how it ends
 * (game/resolution.js, ui/results.js). Randomness is seeded (env.seedRandom), so every run replays the same sequences.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import {
    ALL_SPIES_FIRST_GAP_MAX, ALL_SPIES_FIRST_GAP_MIN, ALL_SPIES_GAP_MAX, ALL_SPIES_GAP_MIN, ALL_SPIES_MIN_PLAYERS
} from '../../js/core/config.js';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { ALL_SPIES_COUNTDOWN_KEY, loadAllSpiesCountdown, saveAllSpiesCountdown } from '../../js/core/storage.js';
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

/** The countdown as it is stored on the device (undefined before anything was stored). */
const stored = () => (env.storage.has(ALL_SPIES_COUNTDOWN_KEY) ? JSON.parse(env.storage.get(ALL_SPIES_COUNTDOWN_KEY)) : undefined);

/** Start a new match on the same device: the round counter starts again, the countdown stays. */
function newMatch() {
    gameState.round.num = 0;
    gameState.round.allSpies = false;
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

/** The 1-based numbers of the rounds that were all-spies rounds. */
const positions = (flags) => flags.flatMap((flag, i) => (flag ? [i + 1] : []));

describe('when a round is an all-spies round', () => {
    it('never without the option, and the device memory is not even touched', () => {
        env.seedRandom(7);
        arrange({ allSpies: false });
        assert.ok(playRounds(120).every((flag) => flag === false));
        assert.equal(stored(), undefined);
    });

    it('the first one comes after a short countdown, then they are spread out: never closer than ALL_SPIES_GAP_MIN rounds', () => {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
            env.storage.delete(ALL_SPIES_COUNTDOWN_KEY);
            env.seedRandom(seed);
            arrange();
            newMatch();
            const at = positions(playRounds(120));
            assert.ok(at.length >= 120 / ALL_SPIES_GAP_MAX - 1, `seed ${seed}: ${at.length} all-spies rounds in 120`);
            assert.ok(at[0] >= ALL_SPIES_FIRST_GAP_MIN && at[0] <= ALL_SPIES_FIRST_GAP_MAX, `seed ${seed}: first at ${at[0]}`);
            for (let i = 1; i < at.length; i++) {
                const gap = at[i] - at[i - 1];
                assert.ok(gap >= ALL_SPIES_GAP_MIN && gap <= ALL_SPIES_GAP_MAX, `seed ${seed}: gap ${gap}`);
            }
        }
    });

    it('stores the rounds left, and starts the countdown anew after an all-spies round', () => {
        env.storage.set(ALL_SPIES_COUNTDOWN_KEY, '2');
        arrange();
        gameState.round.num = 1;
        startNextRound();
        assert.equal(gameState.round.allSpies, false);
        assert.equal(stored(), 1);
        startNextRound();
        assert.equal(gameState.round.allSpies, true);
        assert.ok(stored() >= ALL_SPIES_GAP_MIN && stored() <= ALL_SPIES_GAP_MAX, `${stored()} rounds to the next`);
        startNextRound();
        assert.equal(gameState.round.allSpies, false);
    });

    it('is counted across matches: a new match goes on with the countdown of the last one', () => {
        env.storage.set(ALL_SPIES_COUNTDOWN_KEY, '5');
        arrange();
        gameState.round.num = 0;
        playRounds(2);
        assert.equal(stored(), 3);
        newMatch();
        playRounds(1);
        assert.equal(stored(), 2);
    });

    it('never the first round of a match: a countdown that ends there waits for the second', () => {
        env.storage.set(ALL_SPIES_COUNTDOWN_KEY, '1');
        arrange();
        newMatch();
        startNextRound();
        assert.equal(gameState.round.allSpies, false);
        assert.equal(stored(), 0);
        startNextRound();
        assert.equal(gameState.round.allSpies, true);
    });

    it('not with fewer than ALL_SPIES_MIN_PLAYERS players: the countdown waits until there are enough', () => {
        env.storage.set(ALL_SPIES_COUNTDOWN_KEY, '1');
        arrange({ players: ALL_SPIES_MIN_PLAYERS - 1 });
        gameState.round.num = 3;
        assert.ok(playRounds(30).every((flag) => flag === false));
        assert.equal(stored(), 0);
        gameState.players = makePlayers(ALL_SPIES_MIN_PLAYERS);
        startNextRound();
        assert.equal(gameState.round.allSpies, true);
    });

    it('a stored value that cannot be a countdown is ignored, and a first one is drawn', () => {
        for (const bad of ['-1', '99', '2.5', '"7"', 'null', 'abc', '[]', '{"left":3}']) {
            env.storage.set(ALL_SPIES_COUNTDOWN_KEY, bad);
            env.seedRandom(5);
            arrange();
            gameState.round.num = 1;
            startNextRound();
            assert.ok(stored() >= ALL_SPIES_FIRST_GAP_MIN - 1 && stored() <= ALL_SPIES_FIRST_GAP_MAX - 1, `${bad} -> ${stored()}`);
        }
    });

    it('a first round draws the same random numbers with the option off as it always did (nothing is drawn for it)', () => {
        const drawsInFirstRound = (allSpies) => {
            env.storage.delete(ALL_SPIES_COUNTDOWN_KEY);
            let calls = 0;
            env.stubCrypto(() => {
                calls++;
                return 12345;
            });
            arrange({ allSpies });
            newMatch();
            startNextRound();
            return calls;
        };
        const off = drawsInFirstRound(false);
        assert.ok(off > 0);
        assert.equal(drawsInFirstRound(true), off + 1, 'the option adds only the draw of the first countdown');
    });
});

describe('the countdown in the device memory', () => {
    it('reads back what was saved, and nothing else', () => {
        assert.equal(loadAllSpiesCountdown(), null);
        for (const n of [0, 1, ALL_SPIES_GAP_MAX]) {
            saveAllSpiesCountdown(n);
            assert.equal(loadAllSpiesCountdown(), n);
        }
    });

    it('refuses to save a number that cannot be a countdown', () => {
        saveAllSpiesCountdown(4);
        for (const bad of [-1, ALL_SPIES_GAP_MAX + 1, 2.5, '3', NaN, null, undefined]) {
            saveAllSpiesCountdown(bad);
            assert.equal(loadAllSpiesCountdown(), 4, String(bad));
        }
    });
});

/** The second round of a match, with the countdown at its last round, so that the round is an all-spies round. */
function forcedAllSpiesRound(options) {
    env.storage.set(ALL_SPIES_COUNTDOWN_KEY, '1');
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
