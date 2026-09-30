/**
 * Characterization tests for game/voting.js. The tie-breaker runs through the real ui/wheel.js on the
 * fake DOM, so the whole "tie -> wheel -> CONFIRM_VOTE" path is exercised.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayer, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { generateWagerOptionsHtml, getCurrentVoter, handleLocalVote } = await import('../../js/game/voting.js');
const harness = useGameHarness(env, {
    setup: () => {
        env.el('toast-container');
        for (const id of ['tie-announce-names', 'tie-announce-stage', 'tie-wheel-stage']) env.el(id);
        for (const id of ['tie-wheel-result', 'btn-tie-continue', 'wheel-segments', 'wheel-needle']) env.el(id);
    }
});
after(() => env.uninstall());

const NAMES = { A: 'Ali', B: 'Bita', C: 'Cyrus', D: 'Dara', E: 'Eli' };

/** Seat the players with the given ids (names from NAMES); `overrides` maps id to extra fields. */
function seat(ids, overrides = {}) {
    gameState.players = ids.map((id) => makePlayer(id, { name: NAMES[id] || id, ...overrides[id] }));
    gameState.phase = 'vote';
}

/** Cast one vote per entry: [voterId, suspectId]. Each voter must be the current voter. */
function castVotes(ballots) {
    for (const [voter, suspect] of ballots) {
        assert.equal(getCurrentVoter().id, voter, `expected ${voter} to vote next`);
        handleLocalVote(suspect);
    }
}

const confirmed = () => harness.actions.filter((a) => a.type === 'CONFIRM_VOTE');

/** Let the tie announcement run its course and the wheel finish: 3.8 s, 4.2 s, 1.6 s. */
function playTieWheel() {
    env.clock.tick(3800);
    env.clock.tick(4200);
    env.clock.tick(1600);
}

describe('getCurrentVoter', () => {
    it('returns the alive player at localVoteIndex', () => {
        seat(['A', 'B', 'C']);
        assert.equal(getCurrentVoter().id, 'A');
        gameState.localVoteIndex = 2;
        assert.equal(getCurrentVoter().id, 'C');
    });

    it('never counts eliminated players or spectators as voters', () => {
        seat(['A', 'B', 'C', 'D'], { B: { isAlive: false }, C: { isSpectator: true } });
        assert.equal(getCurrentVoter().id, 'A');
        gameState.localVoteIndex = 1;
        assert.equal(getCurrentVoter().id, 'D');
    });

    it('returns undefined once every voter has voted (no phantom extra voter)', () => {
        seat(['A', 'B', 'C']);
        gameState.localVoteIndex = 3;
        assert.equal(getCurrentVoter(), undefined);
        gameState.localVoteIndex = 7;
        assert.equal(getCurrentVoter(), undefined);
    });

    it('returns undefined when nobody is eligible to vote', () => {
        seat(['A', 'B'], { A: { isAlive: false }, B: { isSpectator: true } });
        assert.equal(getCurrentVoter(), undefined);
    });
});

describe('handleLocalVote', () => {
    it('rejects a vote for yourself: a toast, and no change to votes, index, screen or actions', () => {
        seat(['A', 'B', 'C']);
        handleLocalVote('A');
        assert.equal(env.toasts().length, 1);
        assert.deepEqual(hostSecretState.votesCast, {});
        assert.equal(gameState.localVoteIndex, 0);
        assert.deepEqual(harness.renders, []);
        assert.deepEqual(harness.actions, []);
    });

    it('records a valid vote, moves on to the next voter and redraws', () => {
        seat(['A', 'B', 'C']);
        handleLocalVote('B');
        assert.deepEqual(hostSecretState.votesCast, { A: 'B' });
        assert.equal(gameState.localVoteIndex, 1);
        assert.equal(getCurrentVoter().id, 'B');
        assert.deepEqual(harness.renders, ['vote']);
        assert.deepEqual(harness.actions, []);
        assert.deepEqual(env.toasts(), []);
    });

    it('only redraws until the last voter: nothing is resolved early', () => {
        seat(['A', 'B', 'C', 'D']);
        castVotes([['A', 'B'], ['B', 'C'], ['C', 'D']]);
        assert.equal(harness.renders.length, 3);
        assert.deepEqual(confirmed(), []);
        assert.equal(gameState.vote.pendingId, null);
    });

    it('skips eliminated players and spectators, and never records a vote for them as voters', () => {
        seat(['A', 'B', 'C', 'D'], { B: { isAlive: false }, D: { isSpectator: true } });
        castVotes([['A', 'C'], ['C', 'A']]);
        assert.deepEqual(hostSecretState.votesCast, { A: 'C', C: 'A' });
        assert.equal(getCurrentVoter(), undefined);
    });

    it('does nothing when every eligible voter has already voted', () => {
        seat(['A', 'B']);
        gameState.localVoteIndex = 2;
        handleLocalVote('B');
        assert.deepEqual(hostSecretState.votesCast, {});
        assert.equal(gameState.localVoteIndex, 2);
        assert.deepEqual(harness.renders, []);
        assert.deepEqual(harness.actions, []);
    });

    it('does nothing when nobody is eligible to vote', () => {
        seat(['A'], { A: { isAlive: false } });
        handleLocalVote('B');
        assert.deepEqual(hostSecretState.votesCast, {});
        assert.deepEqual(harness.actions, []);
    });

    it('a single top suspect is confirmed straight away, without a wheel', () => {
        seat(['A', 'B', 'C']);
        gameState.vote.tieNote = 'left over';
        castVotes([['A', 'C'], ['B', 'C'], ['C', 'A']]);
        assert.equal(gameState.vote.pendingId, 'C');
        assert.equal(gameState.vote.tieNote, '');
        assert.deepEqual(harness.actions, [{ type: 'CONFIRM_VOTE' }]);
        assert.equal(getCurrentVoter(), undefined, 'no phantom voter after the last vote');
        assert.equal(harness.renders.length, 2, 'the last vote is handed to CONFIRM_VOTE, not redrawn');
    });

    it('the suspect with the most votes wins even when the votes came early', () => {
        seat(['A', 'B', 'C', 'D']);
        castVotes([['A', 'B'], ['B', 'C'], ['C', 'B'], ['D', 'B']]);
        assert.equal(gameState.vote.pendingId, 'B');
        assert.equal(confirmed().length, 1);
    });
});

describe('handleLocalVote: ties', () => {
    // A->B, B->A, C->A, D->B is a 2-2 tie. Candidates come out in order of first vote: B, then A.
    const TWO_WAY = [['A', 'B'], ['B', 'A'], ['C', 'A'], ['D', 'B']];

    it('opens the tie announcement for exactly the tied suspects and waits for the wheel', () => {
        seat(['A', 'B', 'C', 'D', 'E']);
        castVotes([['A', 'B'], ['B', 'A'], ['C', 'A'], ['D', 'B'], ['E', 'C']]);
        const announced = env.el('tie-announce-names').innerHTML;
        assert.ok(announced.includes('Ali') && announced.includes('Bita'));
        assert.ok(!announced.includes('Cyrus'), 'a suspect with fewer votes is not in the tie');
        assert.deepEqual(harness.actions, [{ type: 'OPEN_MODAL', payload: 'tie-breaker-modal' }]);
        assert.equal(gameState.vote.pendingId, null);
        assert.equal(env.el('tie-announce-stage').classList.contains('hidden'), false);
    });

    it('confirms the wheel winner: second candidate', () => {
        env.stubCrypto(() => 1);
        seat(['A', 'B', 'C', 'D']);
        gameState.vote.tieNote = 'left over';
        castVotes(TWO_WAY);
        playTieWheel();
        assert.equal(gameState.vote.pendingId, 'A');
        assert.equal(gameState.vote.tieNote, '');
        assert.deepEqual(
            harness.actions.map((a) => [a.type, a.payload]),
            [['OPEN_MODAL', 'tie-breaker-modal'], ['CLOSE_MODAL', 'tie-breaker-modal'], ['CONFIRM_VOTE', undefined]]
        );
    });

    it('confirms the wheel winner: first candidate', () => {
        env.stubCrypto(() => 0);
        seat(['A', 'B', 'C', 'D']);
        castVotes(TWO_WAY);
        playTieWheel();
        assert.equal(gameState.vote.pendingId, 'B');
        assert.equal(confirmed().length, 1);
    });

    it('does not confirm anything before the wheel has finished', () => {
        env.stubCrypto(() => 0);
        seat(['A', 'B', 'C', 'D']);
        castVotes(TWO_WAY);
        env.clock.tick(3800);
        assert.equal(gameState.vote.pendingId, null);
        env.clock.tick(4200);
        assert.equal(gameState.vote.pendingId, null);
        assert.deepEqual(confirmed(), []);
        env.clock.tick(1600);
        assert.equal(confirmed().length, 1);
    });

    it('the continue button skips the announcement wait', () => {
        env.stubCrypto(() => 0);
        seat(['A', 'B', 'C', 'D']);
        castVotes(TWO_WAY);
        env.el('btn-tie-continue').onclick();
        assert.equal(env.el('tie-wheel-stage').classList.contains('hidden'), false);
        env.clock.tick(4200);
        env.clock.tick(1600);
        assert.equal(gameState.vote.pendingId, 'B');
    });

    it('a three-way tie puts all three suspects on the wheel', () => {
        env.stubCrypto(() => 2);
        seat(['A', 'B', 'C']);
        castVotes([['A', 'B'], ['B', 'C'], ['C', 'A']]);
        const announced = env.el('tie-announce-names').innerHTML;
        assert.ok(['Ali', 'Bita', 'Cyrus'].every((name) => announced.includes(name)));
        playTieWheel();
        assert.equal(gameState.vote.pendingId, 'A', 'candidates are B, C, A and index 2 is A');
        assert.equal(env.el('tie-wheel-result').textContent.includes('Ali'), true);
    });

    it('escapes player names in the tie announcement', () => {
        seat(['A', 'B', 'C', 'D'], {
            A: { name: '<img src=x onerror=alert(1)>' },
            B: { name: '<b>Bita</b>' }
        });
        castVotes(TWO_WAY);
        const announced = env.el('tie-announce-names').innerHTML;
        assert.ok(!announced.includes('<img') && !announced.includes('<b>'));
        assert.ok(announced.includes('&lt;img') && announced.includes('&lt;b&gt;'));
    });

    it('KNOWN BUG: a leftover vote from an eliminated player still counts in a later ballot', () => {
        // After an earlier ballot in the same round, the timer-out path (game/timer.js) opens a new
        // ballot without emptying votesCast. Here X was eliminated earlier and voted for A. The four
        // alive players split 1-1-1-1, but X's stale vote makes A win outright and skips the wheel.
        // Fixing it would turn this into a four-way tie: update this test when that is fixed.
        seat(['A', 'B', 'C', 'D', 'X'], { X: { isAlive: false } });
        hostSecretState.votesCast = { X: 'A' };
        castVotes([['A', 'B'], ['B', 'A'], ['C', 'D'], ['D', 'C']]);
        assert.equal(gameState.vote.pendingId, 'A');
        assert.equal(confirmed().length, 1);
        assert.ok(!harness.actions.some((a) => a.type === 'OPEN_MODAL'));
    });
});

/** Options of generateWagerOptionsHtml as [value, label] pairs. */
function wagerOptions(score) {
    const html = generateWagerOptionsHtml(score);
    return [...html.matchAll(/<option value="(-?\d+)">([^<]*)<\/option>/g)].map((m) => [Number(m[1]), m[2]]);
}
const wagerValues = (score) => wagerOptions(score).map(([value]) => value);

describe('generateWagerOptionsHtml', () => {
    it('always offers "no wager" (0) first', () => {
        for (const score of [0, 1, 20, 21, 100]) assert.equal(wagerValues(score)[0], 0);
    });

    it('offers only "no wager" for a score of 0, a negative score or a non-number', () => {
        for (const score of [0, -5, -1, 'abc', '', null, undefined, NaN, {}]) {
            assert.deepEqual(wagerValues(score), [0], String(score));
        }
    });

    it('steps by 1 up to a score of 20', () => {
        assert.deepEqual(wagerValues(1), [0, 1]);
        assert.deepEqual(wagerValues(7), [0, 1, 2, 3, 4, 5, 6, 7]);
        assert.deepEqual(wagerValues(20), Array.from({ length: 21 }, (_, i) => i));
    });

    it('above 20 steps by ceil(score / 10) and adds the maximum as a final option', () => {
        assert.deepEqual(wagerValues(21), [0, 1, 4, 7, 10, 13, 16, 19, 21]);
        assert.deepEqual(wagerValues(30), [0, 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 30]);
        assert.deepEqual(wagerValues(45), [0, 1, 6, 11, 16, 21, 26, 31, 36, 41, 45]);
    });

    it('does not repeat the maximum when the steps land on it', () => {
        assert.deepEqual(wagerValues(91), [0, 1, 11, 21, 31, 41, 51, 61, 71, 81, 91]);
    });

    it('caps the maximum at 100', () => {
        const expected = [0, 1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 100];
        assert.deepEqual(wagerValues(100), expected);
        assert.deepEqual(wagerValues(150), expected);
        assert.deepEqual(wagerValues(100000), expected);
    });

    it('accepts numeric strings and drops decimals', () => {
        assert.deepEqual(wagerValues('5'), [0, 1, 2, 3, 4, 5]);
        assert.deepEqual(wagerValues('5.9'), [0, 1, 2, 3, 4, 5]);
        assert.deepEqual(wagerValues(5.9), [0, 1, 2, 3, 4, 5]);
    });

    it('for every score: ascending, no duplicates, ends on min(score, 100), labels show the value', () => {
        for (let score = 0; score <= 150; score++) {
            const options = wagerOptions(score);
            const values = options.map(([value]) => value);
            assert.equal(new Set(values).size, values.length, `duplicates for ${score}`);
            assert.deepEqual(values, [...values].sort((a, b) => a - b), `order for ${score}`);
            assert.equal(values[values.length - 1], Math.min(score, 100), `maximum for ${score}`);
            assert.ok(values.length <= (score <= 20 ? score + 1 : 12), `too many options for ${score}`);
            for (const [value, label] of options.slice(1)) assert.ok(label.includes(String(value)), label);
        }
    });
});
