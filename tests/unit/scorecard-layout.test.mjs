import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    FOOTER_H,
    computeScorecardLayout,
    computeHeaderLayout,
    computePodiumSlotLayout,
    computeRestRowLayout
} from '../../js/ui/scorecard-layout.js';

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
        for (const [podium, rest] of [[3, 0], [3, 4], [3, 15], [3, 17], [0, 8], [0, 17]]) {
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
