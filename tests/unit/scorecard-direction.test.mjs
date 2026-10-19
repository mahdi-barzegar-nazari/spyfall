/**
 * The scorecard image follows the reading direction: the pure column layout of the "other players" rows
 * mirrors for LTR and is exactly the old Persian placement for RTL, and scorecard.js no longer hard-codes
 * a direction, a date locale or an RTL isolate. (The pixels themselves are checked in a real browser.)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CANVAS_WIDTH, balanceIsolates, computePodiumSlotLayout, computeRestNameMaxWidth, computeRestRowColumns, computeScorecardLayout, isolateLine, lineMark } from '../../js/ui/scorecard-layout.js';

const source = readFileSync(fileURLToPath(new URL('../../js/ui/scorecard.js', import.meta.url)), 'utf8');
const layout = computeScorecardLayout(3, 5);

describe('computeRestRowColumns', () => {
    const rtl = computeRestRowColumns(layout, 'rtl');
    const ltr = computeRestRowColumns(layout, 'ltr');

    it('RTL is the placement the Persian image has always had', () => {
        assert.equal(CANVAS_WIDTH, 720);
        assert.deepEqual(rtl, {
            direction: 'rtl',
            headerX: 720 - 40,
            headerAlign: 'right',
            circleX: 720 - 40 - 24,
            nameX: 720 - 40 - 48,
            nameAlign: 'right',
            scoreX: 56,
            scoreAlign: 'left'
        });
    });

    it('LTR is the exact mirror image: every x flips around the centre and every alignment swaps', () => {
        for (const key of ['headerX', 'circleX', 'nameX', 'scoreX']) assert.equal(rtl[key] + ltr[key], layout.width, key);
        for (const key of ['headerAlign', 'nameAlign', 'scoreAlign']) assert.notEqual(rtl[key], ltr[key], key);
        assert.deepEqual([ltr.headerAlign, ltr.nameAlign, ltr.scoreAlign], ['left', 'left', 'right']);
    });

    it('anything but an explicit ltr keeps the right-to-left placement', () => {
        for (const value of [undefined, null, '', 'rtl', 'auto', 'RTL']) assert.deepEqual(computeRestRowColumns(layout, value), rtl, String(value));
    });

    it('stays pure: the same input gives the same output and nothing is mutated', () => {
        const before = JSON.stringify(layout);
        assert.deepEqual(computeRestRowColumns(layout, 'ltr'), computeRestRowColumns(layout, 'ltr'));
        assert.equal(JSON.stringify(layout), before);
    });

    it('keeps every x inside the canvas, with the name column clear of the rank circle', () => {
        for (const cols of [rtl, ltr]) {
            for (const key of ['headerX', 'circleX', 'nameX', 'scoreX']) assert.ok(cols[key] > 0 && cols[key] < layout.width, key);
            assert.ok(Math.abs(cols.nameX - cols.circleX) >= 24, 'name starts clear of the circle');
        }
    });
});

describe('the longest list (20 players all tied for 1st: 19 rows) in both directions', () => {
    const crowded = computeScorecardLayout(1, 19);

    it('has the same columns as any other list, mirrored exactly', () => {
        for (const direction of ['rtl', 'ltr']) assert.deepEqual(computeRestRowColumns(crowded, direction), computeRestRowColumns(layout, direction), direction);
        const rtl = computeRestRowColumns(crowded, 'rtl');
        const ltr = computeRestRowColumns(crowded, 'ltr');
        for (const key of ['headerX', 'circleX', 'nameX', 'scoreX']) assert.equal(rtl[key] + ltr[key], crowded.width, key);
    });

    it('leaves the same room for a name between the name column and the score, whichever side they are on', () => {
        for (const scoreWidth of [60, 90, 140]) {
            const rtl = computeRestNameMaxWidth(crowded, computeRestRowColumns(crowded, 'rtl'), scoreWidth);
            const ltr = computeRestNameMaxWidth(crowded, computeRestRowColumns(crowded, 'ltr'), scoreWidth);
            assert.equal(rtl, ltr, `score ${scoreWidth}px wide`);
            // RTL: the name grows leftwards from nameX, the score grows rightwards from scoreX; LTR is the mirror image
            const cols = computeRestRowColumns(crowded, 'rtl');
            assert.ok(cols.scoreX + scoreWidth <= cols.nameX - rtl, 'RTL: the name stops before the score');
        }
    });
});

describe('the podium reads silver, gold, bronze from the physical left in both directions', () => {
    it('does not depend on the direction', () => {
        const xs = [2, 1, 3].map((rank) => computePodiumSlotLayout(rank, layout).colX);
        assert.ok(xs[0] < xs[1] && xs[1] < xs[2]);
    });
});

describe('scorecard.js has no hard-coded direction', () => {
    it('takes the direction, date and isolates from the active language', () => {
        assert.match(source, /getDirection\(\)/);
        assert.match(source, /formatDate\(/);
        assert.match(source, /isolate\(/);
        assert.doesNotMatch(source, /ctx\.direction\s*=\s*'rtl'/, 'ctx.direction must follow the language');
        assert.doesNotMatch(source, /fa-IR/, 'the date locale comes from i18n');
        assert.doesNotMatch(source, /`\\u2067\$\{/, 'a line is wrapped with isolateLine(line, direction), not a hard-coded RLI');
        assert.match(source, /isolate\(p\.name\)/, 'each name is isolated on its own');
        assert.doesNotMatch(source, /width - 40/, 'row columns come from computeRestRowColumns');
        assert.doesNotMatch(source, /textAlign = '(left|right)'/, 'row alignment comes from computeRestRowColumns');
    });
});

describe('bidi marks for canvas lines', () => {
    it('the line mark follows the direction; Persian keeps the RLI the image has always used', () => {
        assert.equal(lineMark('rtl'), '\u2067');
        assert.equal(lineMark('ltr'), '\u2066');
        assert.equal(lineMark(undefined), '\u2067');
        assert.equal(isolateLine('x', 'rtl'), '\u2067x\u2069');
        assert.equal(isolateLine('x', 'ltr'), '\u2066x\u2069');
    });

    it('balanceIsolates leaves balanced lines alone', () => {
        assert.deepEqual(balanceIsolates(['a \u2068Sara\u2069 b', 'plain']), ['a \u2068Sara\u2069 b', 'plain']);
        assert.deepEqual(balanceIsolates([]), []);
    });

    it('balanceIsolates closes a name cut by a line break and reopens it on the next line', () => {
        const lines = ['and \u2068Dr.', 'Ali!\u2069 (tied)'];
        assert.deepEqual(balanceIsolates(lines), ['and \u2068Dr.\u2069', '\u2068Ali!\u2069 (tied)']);
    });

    it('balanceIsolates closes an isolate that truncation cut and ignores a stray closer', () => {
        assert.deepEqual(balanceIsolates(['\u2068Sar\u2026']), ['\u2068Sar\u2026\u2069']);
        assert.deepEqual(balanceIsolates(['x\u2069 y']), ['x\u2069 y']);
    });

    it('never changes the visible text, only the marks', () => {
        const strip = (s) => s.replace(/[\u2066-\u2069]/g, '');
        const lines = ['a \u2068Dr.', 'Ali!\u2069 b'];
        assert.equal(balanceIsolates(lines).map(strip).join('|'), lines.map(strip).join('|'));
    });
});

describe('scorecard.js draws every player, through the pure row builder', () => {
    it('takes the podium groups and the list rows from buildScorecardRows, not from its own rank filters', () => {
        assert.match(source, /buildScorecardRows\(/);
        assert.doesNotMatch(source, /restGroups/, 'the list is no longer "rank 4 and below"');
        assert.doesNotMatch(source, /rank\s*(<=|>)\s*3/, 'the rank 3 cut-off lives in buildScorecardRows');
    });

    it('writes only the players the podium slot names; the rest of a tie goes to the list', () => {
        assert.match(source, /group\.named\.map\(/);
        assert.doesNotMatch(source, /group\.players\.map\(/, 'a podium slot must not name players that the builder moved to the list');
    });

    it('cuts a rest-row name to the room between it and the score, not to a fixed width', () => {
        assert.match(source, /computeRestNameMaxWidth\(/);
        assert.doesNotMatch(source, /width - 220/);
    });
});
