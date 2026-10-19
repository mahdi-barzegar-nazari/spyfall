/**
 * Which player goes where on the scorecard image: podium slots (rank 1-3) and the "other players" list.
 *
 * A podium slot names at most two players ("A and B (tied)"); a bigger tie is written "A and N others (tied)",
 * which names only the first. Before `buildScorecardRows` the other N players of such a tie were in the image
 * nowhere (the list only had rank 4 and below). These tests pin the rule on real `getRankedStandings` output,
 * with no canvas.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getRankedStandings } from '../../js/game/ranking.js';
import { buildScorecardRows, podiumNamedCount } from '../../js/ui/scorecard-layout.js';

/** Players P1..Pn in group order: the group `i` has `sizes[i]` players with the same score, each group scoring lower. */
function playersFor(sizes) {
    const players = [];
    sizes.forEach((size, group) => {
        for (let k = 0; k < size; k++) {
            players.push({ id: `p${players.length + 1}`, name: `P${players.length + 1}`, score: 100 - group * 3, stats: { hiddenTieBreakerScore: 0 } });
        }
    });
    return players;
}

/** The real ranked groups for `sizes`, and what buildScorecardRows makes of them. */
function build(sizes) {
    const groups = getRankedStandings(playersFor(sizes));
    return { groups, ...buildScorecardRows(groups) };
}

const nameOf = (player) => player.name;
const ranksOf = (rows) => rows.map((row) => row.rank);

/** Every player of `sizes` exactly once across the podium's named players and the rest rows. */
function assertEveryPlayerOnce(sizes, result) {
    const shown = [...result.podiumGroups.flatMap((g) => g.named.map(nameOf)), ...result.restRows.map((row) => row.p.name)];
    const total = sizes.reduce((sum, n) => sum + n, 0);
    assert.equal(shown.length, total, `${shown.length} entries for ${total} players (${sizes.join(',')})`);
    assert.equal(new Set(shown).size, total, `a player appears twice or is missing (${sizes.join(',')}): ${shown.join(' ')}`);
}

describe('podiumNamedCount', () => {
    it('names all of one or two players and only the first of a bigger tie', () => {
        assert.deepEqual([0, 1, 2, 3, 4, 9, 20].map(podiumNamedCount), [0, 1, 2, 1, 1, 1, 1]);
    });
});

describe('buildScorecardRows', () => {
    it('20 players: 1st, 2nd, a 9-way tie for 3rd, then 9 singles: the 8 unnamed tied players come first, with rank 3', () => {
        const sizes = [1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        const { groups, podiumGroups, restRows } = build(sizes);
        assert.deepEqual(groups.map((g) => g.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'dense ranking, as in game/ranking.js');
        assert.deepEqual(podiumGroups.map((g) => g.rank), [1, 2, 3]);
        assert.deepEqual(podiumGroups.map((g) => g.named.map(nameOf)), [['P1'], ['P2'], ['P3']]);
        assert.equal(podiumGroups[2].players.length, 9, 'the slot still counts the whole tie ("and 8 others")');

        assert.equal(restRows.length, 17);
        assert.deepEqual(restRows.slice(0, 8).map((row) => row.p.name), ['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11']);
        assert.deepEqual(ranksOf(restRows.slice(0, 8)), Array(8).fill(3));
        assert.ok(restRows.slice(0, 8).every((row) => row.tied === true), 'the tied marker stays');
        assert.deepEqual(restRows.slice(8).map((row) => row.p.name), ['P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20']);
        assert.deepEqual(ranksOf(restRows.slice(8)), [4, 5, 6, 7, 8, 9, 10, 11, 12]);
        assert.ok(restRows.slice(8).every((row) => row.tied === false));
        assertEveryPlayerOnce(sizes, { podiumGroups, restRows });
    });

    it('20 players all tied for 1st: one podium slot naming the first, the other 19 listed with rank 1', () => {
        const { podiumGroups, restRows } = build([20]);
        assert.equal(podiumGroups.length, 1);
        assert.equal(podiumGroups[0].rank, 1);
        assert.deepEqual(podiumGroups[0].named.map(nameOf), ['P1']);
        assert.deepEqual(restRows.map((row) => row.p.name), Array.from({ length: 19 }, (_, i) => `P${i + 2}`));
        assert.ok(restRows.every((row) => row.rank === 1 && row.tied === true));
        assertEveryPlayerOnce([20], { podiumGroups, restRows });
    });

    it('3 or more tied for 1st or 2nd are handled like 3rd, and the extras are ordered by rank', () => {
        const sizes = [3, 3, 3, 1, 1];
        const { podiumGroups, restRows } = build(sizes);
        assert.deepEqual(podiumGroups.map((g) => g.named.map(nameOf)), [['P1'], ['P4'], ['P7']]);
        assert.deepEqual(restRows.map((row) => `${row.rank}:${row.p.name}`), ['1:P2', '1:P3', '2:P5', '2:P6', '3:P8', '3:P9', '4:P10', '5:P11']);
        assertEveryPlayerOnce(sizes, { podiumGroups, restRows });
    });

    it('20 players with no ties: three podium names and rank 4-20 below, exactly as before', () => {
        const sizes = Array(20).fill(1);
        const { groups, podiumGroups, restRows } = build(sizes);
        assert.deepEqual(podiumGroups.map((g) => g.named.map(nameOf)), [['P1'], ['P2'], ['P3']]);
        assert.deepEqual(restRows, groups.slice(3).map((g) => ({ p: g.players[0], rank: g.rank, tied: false })));
        assert.equal(restRows.length, 17);
        assertEveryPlayerOnce(sizes, { podiumGroups, restRows });
    });

    it('3 players: a podium and no list', () => {
        const { podiumGroups, restRows } = build([1, 1, 1]);
        assert.equal(podiumGroups.length, 3);
        assert.deepEqual(restRows, []);
    });

    it('a two-way tie is named on the podium as a pair and adds no rows (no change from before)', () => {
        const sizes = [1, 2, 1, 1];
        const { podiumGroups, restRows } = build(sizes);
        assert.deepEqual(podiumGroups.map((g) => g.named.map(nameOf)), [['P1'], ['P2', 'P3'], ['P4']]);
        assert.deepEqual(restRows.map((row) => [row.p.name, row.rank, row.tied]), [['P5', 4, false]]);
        assertEveryPlayerOnce(sizes, { podiumGroups, restRows });
    });

    it('a tied pair below the podium keeps its tied marker, as before', () => {
        const { restRows } = build([1, 1, 1, 2]);
        assert.deepEqual(restRows.map((row) => [row.p.name, row.rank, row.tied]), [['P4', 4, true], ['P5', 4, true]]);
    });

    it('keeps the shape the drawing code reads: podium groups keep rank, score and the whole tie; rows are { p, rank, tied }', () => {
        const { groups, podiumGroups, restRows } = build([1, 4, 1]);
        podiumGroups.forEach((g, i) => {
            assert.equal(g.rank, groups[i].rank);
            assert.equal(g.score, groups[i].score);
            assert.deepEqual(g.players, groups[i].players);
        });
        assert.deepEqual(Object.keys(restRows[0]).sort(), ['p', 'rank', 'tied']);
    });

    it('is pure: the input groups and players are not changed, and the same input gives the same output', () => {
        const groups = getRankedStandings(playersFor([1, 5, 2, 1]));
        const frozen = JSON.stringify(groups);
        groups.forEach((g) => {
            Object.freeze(g);
            Object.freeze(g.players);
        });
        const first = buildScorecardRows(groups);
        assert.equal(JSON.stringify(groups), frozen);
        assert.deepEqual(buildScorecardRows(groups), first);
        assert.deepEqual(buildScorecardRows([]), { podiumGroups: [], restRows: [] });
    });

    it('puts every player in the image exactly once, for every way 10 or fewer players can tie', () => {
        // Every composition of n players into consecutive tie groups: 2^(n-1) of them for each n.
        let checked = 0;
        for (let n = 1; n <= 10; n++) {
            for (let mask = 0; mask < 1 << (n - 1); mask++) {
                const sizes = [];
                let run = 1;
                for (let bit = 0; bit < n - 1; bit++) {
                    if (mask & (1 << bit)) {
                        sizes.push(run);
                        run = 1;
                    } else run++;
                }
                sizes.push(run);
                const { groups, podiumGroups, restRows } = build(sizes);
                assertEveryPlayerOnce(sizes, { podiumGroups, restRows });
                // the podium slot names at most two players, and the rows say the same rank the groups do
                assert.ok(podiumGroups.every((g) => g.named.length <= 2 && g.named.length === podiumNamedCount(g.players.length)));
                const rankOf = new Map(groups.flatMap((g) => g.players.map((p) => [p.name, g.rank])));
                assert.ok(restRows.every((row) => row.rank === rankOf.get(row.p.name)), 'real rank numbers');
                // outranking players come first: ranks never go down along the list
                assert.deepEqual(ranksOf(restRows), [...ranksOf(restRows)].sort((a, b) => a - b), `order for ${sizes.join(',')}`);
                // and when no podium group has 3 or more players, the rows are exactly what the old code drew (rank 4 and below)
                if (sizes.slice(0, 3).every((size) => size <= 2)) {
                    const legacy = groups.filter((g) => g.rank > 3).flatMap((g) => g.players.map((p) => ({ p, rank: g.rank, tied: g.players.length > 1 })));
                    assert.deepEqual(restRows, legacy, `unchanged for ${sizes.join(',')}`);
                }
                checked++;
            }
        }
        assert.equal(checked, 1023, 'the loop really covered every composition');
    });
});
