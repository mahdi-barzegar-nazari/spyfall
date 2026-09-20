import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comparePlayersForRank, getRankedStandings } from '../../js/game/ranking.js';

const player = (name, score, hidden) => ({ name, score, stats: hidden === undefined ? {} : { hiddenTieBreakerScore: hidden } });

describe('comparePlayersForRank', () => {
    it('orders by visible score, highest first', () => {
        assert.ok(comparePlayersForRank(player('a', 5), player('b', 3)) < 0);
    });
    it('falls back to the hidden tie-breaker when scores are equal', () => {
        assert.ok(comparePlayersForRank(player('a', 5, 1), player('b', 5, 4)) > 0);
    });
    it('returns 0 only when both are equal', () => {
        assert.equal(comparePlayersForRank(player('a', 5, 2), player('b', 5, 2)), 0);
    });
    it('tolerates missing or non-numeric fields', () => {
        assert.equal(comparePlayersForRank({}, { score: 'x', stats: null }), 0);
    });
});

describe('getRankedStandings', () => {
    it('uses dense ranking: a tie never skips the next rank', () => {
        const groups = getRankedStandings([player('a', 10), player('b', 7, 1), player('c', 7, 1), player('d', 5)]);
        assert.deepEqual(groups.map((g) => g.rank), [1, 2, 3]);
        assert.deepEqual(groups[1].players.map((p) => p.name), ['b', 'c']);
    });
    it('splits equal visible scores using the hidden tie-breaker', () => {
        const groups = getRankedStandings([player('a', 7, 1), player('b', 7, 9)]);
        assert.deepEqual(groups.map((g) => g.players[0].name), ['b', 'a']);
    });
    it('does not mutate the input array', () => {
        const input = [player('a', 1), player('b', 9)];
        getRankedStandings(input);
        assert.deepEqual(input.map((p) => p.name), ['a', 'b']);
    });
    it('returns no groups for no players', () => {
        assert.deepEqual(getRankedStandings([]), []);
    });
});
