import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES } from '../../js/core/config.js';
import { getRankedStandings } from '../../js/game/ranking.js';
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    FOOTER_H,
    buildScorecardRows,
    computeScorecardLayout,
    computeHeaderLayout,
    computePodiumSlotLayout,
    computeRestNameMaxWidth,
    computeRestRowColumns,
    computeRestRowLayout
} from '../../js/ui/scorecard-layout.js';
import { truncateCanvasText, wrapCanvasText } from '../../js/ui/scorecard.js';

describe('computeScorecardLayout', () => {
    it('always uses the fixed 9:16 canvas, regardless of player count', () => {
        for (const [podium, rest] of [[0, 0], [3, 0], [3, 5], [0, 20], [3, 40]]) {
            const layout = computeScorecardLayout(podium, rest);
            assert.equal(layout.width, CANVAS_WIDTH);
            assert.equal(layout.height, CANVAS_HEIGHT);
            assert.equal(layout.footerH, FOOTER_H);
        }
    });
    it('uses scale 1 when there is nothing to lay out', () => {
        const layout = computeScorecardLayout(0, 0);
        assert.equal(layout.scale, 1);
        assert.equal(layout.podiumH, 0);
        assert.equal(layout.restHeaderH, 0);
    });
    it('scales up (but caps) for a small podium-only game', () => {
        const layout = computeScorecardLayout(3, 0);
        assert.ok(layout.scale > 1, 'few players should scale the card up');
        assert.ok(layout.scale <= 1.7, 'scale never exceeds the configured max');
    });
    it('scales down (but floors) for a very large player list', () => {
        const layout = computeScorecardLayout(3, 60);
        assert.ok(layout.scale < 1, 'many players should scale the card down');
        assert.ok(layout.scale >= 0.62, 'scale never drops below the configured floor, so nothing clips');
    });
    it('keeps the scaled block within the available content height, for the game\'s supported player counts (up to 20)', () => {
        for (const [podium, rest] of [[3, 0], [3, 4], [3, 15], [3, 17], [1, 19], [0, 8], [0, 17]]) {
            const layout = computeScorecardLayout(podium, rest);
            const scaledBlockH = layout.podiumH + layout.restHeaderH + rest * layout.restRowStep;
            assert.ok(scaledBlockH <= layout.contentAvailableH + 1e-9);
            assert.ok(Math.abs(layout.blockBottom - layout.blockTop - scaledBlockH) < 1e-9);
            assert.ok(Math.abs(layout.bottomGap - (layout.contentBottom - layout.blockBottom)) < 1e-9);
        }
    });
    it('grows the header a little when there is slack to spare', () => {
        const tight = computeScorecardLayout(3, 40); // scale < 1: no bonus
        const roomy = computeScorecardLayout(3, 0); // scale > 1: gets a bonus
        assert.equal(tight.headerBonus, 0);
        assert.ok(roomy.headerBonus > 0);
        assert.ok(roomy.headerH > tight.headerH);
    });
});

describe('computeHeaderLayout', () => {
    it('derives badge/title/meta positions from the layout, unscaled at scale 1', () => {
        const layout = computeScorecardLayout(0, 0); // scale 1, headerBonus 0
        const header = computeHeaderLayout(layout);
        assert.equal(header.badgeR, 34);
        assert.equal(header.badgeCY, 62);
        assert.equal(header.titleY, 140);
        assert.equal(header.metaY, 174);
        assert.equal(header.dividerY, layout.headerH - 12);
    });
});

describe('computePodiumSlotLayout', () => {
    it('orders columns silver–gold–bronze (rank 2, 1, 3) left to right', () => {
        const layout = computeScorecardLayout(3, 0);
        const gold = computePodiumSlotLayout(1, layout);
        const silver = computePodiumSlotLayout(2, layout);
        const bronze = computePodiumSlotLayout(3, layout);
        assert.ok(silver.colX < gold.colX);
        assert.ok(gold.colX < bronze.colX);
    });
    it('gives rank 1 the tallest pedestal and rank 3 the shortest', () => {
        const layout = computeScorecardLayout(3, 0);
        const gold = computePodiumSlotLayout(1, layout);
        const silver = computePodiumSlotLayout(2, layout);
        const bronze = computePodiumSlotLayout(3, layout);
        assert.ok(gold.pedH > silver.pedH);
        assert.ok(silver.pedH > bronze.pedH);
    });
    it('scales every size with the shared layout scale', () => {
        const small = computePodiumSlotLayout(1, computeScorecardLayout(3, 60)); // scale < 1
        const big = computePodiumSlotLayout(1, computeScorecardLayout(3, 0)); // scale > 1
        assert.ok(big.pedH > small.pedH);
        assert.ok(big.avatarR > small.avatarR);
    });
});

describe('computeRestRowLayout', () => {
    it('never shrinks the row below the readable floor, even with many rows', () => {
        const layout = computeScorecardLayout(3, 60);
        const row = computeRestRowLayout(layout);
        assert.ok(row.rowHeight >= 20);
    });
    it('keeps the rank circle and corner radius from overflowing the row', () => {
        for (const [podium, rest] of [[3, 0], [3, 4], [3, 60]]) {
            const layout = computeScorecardLayout(podium, rest || 1);
            const row = computeRestRowLayout(layout);
            assert.ok(row.circleR <= row.rowHeight / 2);
            assert.ok(row.cornerR <= row.rowHeight / 2);
        }
    });
});

// ---- The worst cases of the game (20 players at most), built the way scorecard.js builds them -------------------
// Group sizes, best group first. Ranks are the dense ones of game/ranking.js, so a tie never skips a rank.
const WORST_CASES = [
    ['9-way tie for 3rd, then 9 singles', [1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ['all 20 tied for 1st', [20]],
    ['20 players, no ties', Array(20).fill(1)],
    ['3 players', [1, 1, 1]],
    ['3 tied for 1st, 4 for 2nd, 5 for 3rd, then 8 singles', [3, 4, 5, 1, 1, 1, 1, 1, 1, 1, 1]],
    ['1st, 19 tied for 2nd', [1, 19]]
];
const FLOOR = 0.62; // MIN_SCALE in scorecard-layout.js
const MIN_READABLE_NAME_PX = 11; // the smallest name size any of the cases above is drawn at

function layoutFor(sizes) {
    const players = [];
    sizes.forEach((size, group) => {
        for (let k = 0; k < size; k++) players.push({ id: `p${players.length}`, name: `P${players.length}`, score: 100 - group * 3, stats: { hiddenTieBreakerScore: 0 } });
    });
    const { podiumGroups, restRows } = buildScorecardRows(getRankedStandings(players));
    return { podium: podiumGroups.length, rest: restRows.length, layout: computeScorecardLayout(podiumGroups.length, restRows.length) };
}

describe('the scorecard fits the worst cases without overlap or clipping', () => {
    for (const [label, sizes] of WORST_CASES) {
        it(label, () => {
            const { rest, layout } = layoutFor(sizes);
            const row = computeRestRowLayout(layout);

            // the canvas never grows: still exactly 9:16
            assert.equal(layout.width, CANVAS_WIDTH);
            assert.equal(layout.height, CANVAS_HEIGHT);
            assert.equal(layout.height, Math.round((CANVAS_WIDTH * 16) / 9));
            // everything is inside the content area, so nothing reaches the footer or runs off the bottom
            assert.ok(layout.scale >= FLOOR, `scale ${layout.scale} must stay above the floor, or the block would be taller than the canvas`);
            const lastRowBottom = layout.blockTop + layout.podiumH + layout.restHeaderH + (rest ? (rest - 1) * layout.restRowStep + row.rowHeight : 0);
            assert.ok(lastRowBottom <= layout.contentBottom + 1e-9, `last row ends at ${lastRowBottom}, content ends at ${layout.contentBottom}`);
            assert.ok(layout.bottomGap >= -1e-9);
            if (rest > 0) {
                // rows are separate boxes: each is shorter than its step, with a gap, and never below the readable floor
                assert.ok(row.rowGap >= 3 && Math.abs(row.rowHeight + row.rowGap - layout.restRowStep) < 1e-9, 'rows do not overlap each other');
                assert.ok(row.rowHeight >= 20);
                assert.ok(row.circleR <= row.rowHeight / 2 && row.cornerR <= row.rowHeight / 2);
                // the 13px list header keeps 7px (about 4px of descenders and a visible gap) between its baseline and the first row
                assert.ok(layout.restHeaderH - row.headerBaselineY >= 7 - 1e-9, `header baseline ${row.headerBaselineY} in a ${layout.restHeaderH}px band`);
                assert.ok(row.nameFontPx >= MIN_READABLE_NAME_PX, `names are drawn at ${row.nameFontPx}px`);
            }
        });
    }

    it('the longest list the game can make (one podium name, everyone else a row) still fits above the floor', () => {
        const layout = computeScorecardLayout(1, RULES.players.max - 1);
        assert.ok(layout.scale >= FLOOR);
        assert.ok(layout.podiumH + layout.restHeaderH + (RULES.players.max - 1) * layout.restRowStep <= layout.contentAvailableH + 1e-9);
    });

    it('a squeezed list is the only thing that changed: with 17 rows the picture is exactly the old one', () => {
        assert.equal(computeRestRowLayout(computeScorecardLayout(3, 17)).headerBaselineY, 28);
        assert.equal(computeRestRowLayout(computeScorecardLayout(3, 5)).headerBaselineY, 28);
    });
});

describe('computeRestRowLayout headerBaselineY', () => {
    it('is 28 in a roomy band and moves up, keeping 7px below it, in a squeezed one', () => {
        const squeezed = computeScorecardLayout(1, 19);
        assert.ok(squeezed.restHeaderH < 35);
        assert.equal(computeRestRowLayout(squeezed).headerBaselineY, squeezed.restHeaderH - 7);
        assert.equal(computeRestRowLayout(computeScorecardLayout(3, 4)).headerBaselineY, 28);
    });
    it('is never negative, also when there is no list', () => {
        assert.equal(computeRestRowLayout(computeScorecardLayout(3, 0)).headerBaselineY, 0);
    });
});

describe('computeRestNameMaxWidth', () => {
    const layout = computeScorecardLayout(1, 19);

    it('keeps the long-standing 500px while the score is narrow (up to 64px), in both directions', () => {
        for (const direction of ['rtl', 'ltr']) {
            assert.equal(computeRestNameMaxWidth(layout, computeRestRowColumns(layout, direction), 60), CANVAS_WIDTH - 220);
            assert.equal(computeRestNameMaxWidth(layout, computeRestRowColumns(layout, direction), 64), CANVAS_WIDTH - 220);
        }
    });

    it('shrinks with a wide score (a small game draws big rows) and is the same in both directions', () => {
        const rtl = computeRestNameMaxWidth(layout, computeRestRowColumns(layout, 'rtl'), 137);
        const ltr = computeRestNameMaxWidth(layout, computeRestRowColumns(layout, 'ltr'), 137);
        assert.equal(rtl, ltr);
        assert.ok(rtl < CANVAS_WIDTH - 220);
        // the name column starts at nameX and the score at the far end: name plus score plus a gap fit in between
        const cols = computeRestRowColumns(layout, 'ltr');
        assert.ok(cols.nameX + rtl + 137 <= cols.scoreX, 'the name ends before the score starts');
    });

    it('never goes below zero', () => {
        assert.equal(computeRestNameMaxWidth(layout, computeRestRowColumns(layout, 'ltr'), 5000), 0);
    });
});

describe('long names are cut to the room they have', () => {
    // A fake canvas that measures 10px per character, which is all these helpers ask of it.
    const ctx = { measureText: (text) => ({ width: [...text].length * 10 }) };
    const widest = (lines) => Math.max(...lines.map((line) => ctx.measureText(line).width));

    it('text that fits is left alone', () => {
        assert.equal(truncateCanvasText(ctx, 'Alice (tied)', 200), 'Alice (tied)');
        assert.deepEqual(wrapCanvasText(ctx, 'Alice and Bob (tied)', 200, 2), ['Alice and Bob (tied)']);
        assert.deepEqual(wrapCanvasText(ctx, 'aaaa bbbb cccc dddd', 90, 2), ['aaaa bbbb', 'cccc dddd']);
    });

    it('one word wider than the column (a long name with no space) is cut with an ellipsis instead of running over its neighbours', () => {
        const lines = wrapCanvasText(ctx, 'W'.repeat(40), 100, 2);
        assert.equal(lines.length, 1);
        assert.ok(widest(lines) <= 100);
        assert.ok(lines[0].endsWith('\u2026'));
    });

    it('a long first word followed by more words: every line fits and there are at most maxLines of them', () => {
        const lines = wrapCanvasText(ctx, `${'W'.repeat(40)} and 8 others (tied)`, 120, 2);
        assert.ok(lines.length <= 2);
        assert.ok(widest(lines) <= 120);
        assert.ok(lines[0].startsWith('WWW'));
    });
});
