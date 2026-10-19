/**
 * Pure layout math for the scorecard export — canvas size, scale, and the
 * position/size of every element (header band, podium columns, rest-of-
 * players rows) — plus the pure decision of which player goes into which of
 * them (buildScorecardRows). No ctx.* calls and no DOM here: every function
 * takes numbers or plain objects in and returns numbers/objects, which is
 * what makes this half of scorecard.js unit-testable without a real
 * <canvas>. Drawing (ctx.*) stays in scorecard.js and only reads the
 * numbers computed here.
 */

// --- Fixed 9:16 portrait canvas (mobile "story" ratio). The export is
// ALWAYS exactly this ratio, no matter how many players there are.
export const CANVAS_WIDTH = 720;
export const CANVAS_HEIGHT = Math.round((CANVAS_WIDTH * 16) / 9); // 1280 — exact 9:16
export const FOOTER_H = 54;

// ---- Who goes where: podium slots and the "other players" list ---------------------------------------
// A podium slot has room for the names of at most two players ("A and B (tied)"). A bigger tie is written as
// "A and N others (tied)", which names only the first player, so the other N players must be listed by name
// somewhere else or they would be missing from the image: they go to the top of the rest list, ahead of the
// rank 4+ rows, because they outrank them.
const PODIUM_MAX_RANK = 3;
const PODIUM_NAMED_PAIR = 2;

/** How many players of a rank group of `groupSize` the podium slot names: all of one or two, else only the first. */
export function podiumNamedCount(groupSize) {
    return groupSize <= PODIUM_NAMED_PAIR ? groupSize : 1;
}

/**
 * Splits ranked groups (`getRankedStandings`: `{ rank, score, players }`, best first) into what the image draws.
 *   podiumGroups  the groups of rank 1-3, each as `{ ...group, named }` where `named` is the players the slot
 *                 writes out by name (`players` still holds the whole tie, which the slot's text counts)
 *   restRows      one `{ p, rank, tied }` per remaining player: first the tied players of a podium group that
 *                 the slot does not name (in rank order, with their real rank), then every rank 4+ player
 * Every player appears exactly once, as a podium `named` entry or as a rest row. Pure: the input is not changed.
 */
export function buildScorecardRows(groups) {
    const podiumGroups = [];
    const unnamedOnPodium = [];
    const lowerRanks = [];
    for (const group of groups) {
        const tied = group.players.length > 1;
        if (group.rank <= PODIUM_MAX_RANK) {
            const named = group.players.slice(0, podiumNamedCount(group.players.length));
            podiumGroups.push({ ...group, named });
            for (const p of group.players.slice(named.length)) unnamedOnPodium.push({ p, rank: group.rank, tied });
        } else {
            for (const p of group.players) lowerRanks.push({ p, rank: group.rank, tied });
        }
    }
    return { podiumGroups, restRows: [...unnamedOnPodium, ...lowerRanks] };
}

const HEADER_BASE = 196;
const IDEAL_PODIUM_H = 272;
const IDEAL_ROW_STEP = 60;
const IDEAL_REST_HEADER_H = 46;
const MIN_SCALE = 0.62;
const MAX_SCALE = 1.7;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A single scale factor is applied uniformly to the header, podium and row
// list together:
//  • few players → scale > 1, so the podium/header/rows are genuinely
//    bigger and bolder — not just padding around a small fixed design.
//  • many players → scale < 1 (never below a safe floor), so the list
//    always fits without ever clipping.
// Nothing is ever stretched non-uniformly, so nothing distorts.
export function computeScorecardLayout(podiumCount, restRowCount) {
    const naturalListH = restRowCount > 0 ? IDEAL_REST_HEADER_H + restRowCount * IDEAL_ROW_STEP : 0;
    const naturalBlockH = (podiumCount > 0 ? IDEAL_PODIUM_H : 0) + naturalListH;

    // Pass 1: estimate the scale using the base header height.
    let scale =
        naturalBlockH > 0
            ? clamp((CANVAS_HEIGHT - HEADER_BASE - FOOTER_H) / naturalBlockH, MIN_SCALE, MAX_SCALE)
            : 1;
    // When there's slack (scale > 1), let the header claim a modest share
    // of it too, so the title/badge grow a bit and the whole card reads as
    // one deliberately-scaled composition.
    const headerBonus = scale > 1 ? Math.min(34, (scale - 1) * 60) : 0;
    const headerH = HEADER_BASE + headerBonus;
    const contentTop = headerH;
    const contentBottom = CANVAS_HEIGHT - FOOTER_H;
    const contentAvailableH = Math.max(0, contentBottom - contentTop);
    // Pass 2: settle the final scale against the (possibly taller) header.
    scale = naturalBlockH > 0 ? clamp(contentAvailableH / naturalBlockH, MIN_SCALE, MAX_SCALE) : 1;
    const headerTextScale = 1 + Math.min(0.25, Math.max(0, scale - 1) * 0.15);

    const podiumH = podiumCount > 0 ? IDEAL_PODIUM_H * scale : 0;
    const restHeaderH = restRowCount > 0 ? IDEAL_REST_HEADER_H * scale : 0;
    const restRowStep = IDEAL_ROW_STEP * scale;

    // Center whatever slack remains after scaling (small by design, since
    // scaling absorbs most of it) rather than leaving a dead gap glued to
    // the bottom.
    const scaledBlockH = podiumH + restHeaderH + restRowCount * restRowStep;
    const slack = Math.max(0, contentAvailableH - scaledBlockH);
    const blockTop = contentTop + slack / 2;
    const blockBottom = blockTop + scaledBlockH;

    return {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        footerH: FOOTER_H,
        scale,
        headerBonus,
        headerH,
        headerTextScale,
        contentTop,
        contentBottom,
        contentAvailableH,
        podiumH,
        restHeaderH,
        restRowStep,
        blockTop,
        blockBottom,
        bottomGap: contentBottom - blockBottom
    };
}

// Header badge/title/meta-line positions & font sizes — all driven by the
// headerBonus/headerTextScale that computeScorecardLayout() worked out.
export function computeHeaderLayout(layout) {
    const { headerBonus, headerTextScale, headerH } = layout;
    return {
        badgeR: 34 * headerTextScale,
        badgeCY: 62 + headerBonus * 0.15,
        badgeFontPx: Math.round(34 * headerTextScale),
        titleFontPx: Math.round(25 * headerTextScale),
        titleY: 140 + headerBonus * 0.45,
        metaFontPx: Math.round(13 * headerTextScale),
        metaY: 174 + headerBonus * 0.35,
        dividerY: headerH - 12
    };
}

// Podium column layout for one rank (1, 2 or 3) — pedestal box, avatar
// circle, and every text baseline stacked underneath it, all in terms of
// the shared scale for this export.
// The podium reads silver, gold, bronze from the physical left to the physical right in both directions.
const RANK_TO_SLOT = { 1: 1, 2: 0, 3: 2 }; // silver-left, gold-center, bronze-right
const PEDESTAL_HEIGHT_FACTORS = [140, 100, 74]; // [rank 1, rank 2, rank 3]: the first must be the tallest

export function computePodiumSlotLayout(rank, layout) {
    const s = layout.scale;
    const rankIdx = rank - 1; // 0,1,2
    const slot = RANK_TO_SLOT[rank];
    const colW = (layout.width - 80) / 3;
    const colX = 40 + slot * colW + colW / 2;
    const pedH = PEDESTAL_HEIGHT_FACTORS[rankIdx] * s;
    const baseY = layout.blockTop + layout.podiumH - 34 * s;
    const pedTop = baseY - pedH;
    const pedW = colW - 26;
    const avatarY = pedTop - 40 * s;
    const nameBaseY = avatarY + 46 * s;

    return {
        rankIdx,
        colX,
        colW,
        pedH,
        pedTop,
        pedW,
        baseY,
        avatarY,
        avatarR: 28 * s,
        rankFontPx: Math.round(30 * s),
        rankY: baseY - 14 * s,
        crownFontPx: Math.round(22 * s),
        crownY: avatarY - 34 * s,
        medalFontPx: Math.round(24 * s),
        nameFontPx: Math.round(15 * s),
        nameLineH: 15 * s * 1.15,
        nameBaseY,
        scoreFontPx: Math.round(13 * s),
        scoreYOffset: 20 * s
    };
}

// Row box/text geometry shared by every "rest of players" row — only the
// row's own y (blockTop + podiumH + restHeaderH + i * restRowStep, worked
// out by the caller while it iterates) changes per row.
export function computeRestRowLayout(layout) {
    const s = layout.scale;
    const rowGap = Math.max(3, 9 * s);
    const rowHeight = Math.max(20, layout.restRowStep - rowGap);
    return {
        rowGap,
        rowHeight,
        // Baseline of the (fixed 13px) list header: 28px into its band, or 7px above the band's bottom edge when
        // many rows squeeze the band, so the text never touches the first row.
        headerBaselineY: Math.max(0, Math.min(28, layout.restHeaderH - 7)),
        nameFontPx: Math.round(15 * s),
        scoreFontPx: Math.round(15 * s),
        rankFontPx: Math.round(13 * s),
        circleR: Math.min(16 * s, rowHeight / 2 - 2),
        cornerR: Math.min(14 * s, rowHeight / 2)
    };
}

// Horizontal placement of the "rest of players" rows, mirrored for the reading direction. The distances
// are the ones the Persian image has always used: 40px from the outer edge, the rank circle 24px in, the
// name 48px in, and the score 56px in from the opposite edge. `direction` is passed in (the layout stays
// pure); anything but an explicit 'ltr' keeps the right-to-left placement.
//   RTL: header and name right-aligned at the right, rank circle at the right, score at the left edge.
//   LTR: the mirror image.
export function computeRestRowColumns(layout, direction) {
    const { width } = layout;
    if (direction === 'ltr') {
        return {
            direction: 'ltr',
            headerX: 40,
            headerAlign: 'left',
            circleX: 40 + 24,
            nameX: 40 + 48,
            nameAlign: 'left',
            scoreX: width - 56,
            scoreAlign: 'right'
        };
    }
    return {
        direction: 'rtl',
        headerX: width - 40,
        headerAlign: 'right',
        circleX: width - 40 - 24,
        nameX: width - 40 - 48,
        nameAlign: 'right',
        scoreX: 56,
        scoreAlign: 'left'
    };
}

// Widest a rest-row name may be: the long-standing 500px (the canvas width minus 220), or less when the score text
// is wider than the 12px/bold size it has in a crowded list (few rows are scaled up, so their score is big). The
// name column and the score column sit at opposite ends of the row in either direction, so the room between them
// is the same distance in RTL and LTR. `scoreTextWidth` is measured by the caller (it needs a canvas).
const REST_NAME_SCORE_GAP = 12;

export function computeRestNameMaxWidth(layout, columns, scoreTextWidth) {
    const between = Math.abs(columns.nameX - columns.scoreX);
    return Math.max(0, Math.min(layout.width - 220, between - scoreTextWidth - REST_NAME_SCORE_GAP));
}

// ---- Bidi marks for canvas text (pure string helpers) ----------------------------------------------
// A line of canvas text is wrapped in one isolate that carries the reading direction of the UI (RLI for
// RTL, LRI for LTR), and every player name inside it is isolated on its own (first-strong, see
// i18n `isolate`). So the line reads in the UI direction while a name keeps its own direction and cannot
// reorder the words or punctuation around it. For Persian the line mark is the RLI the image has always used.
const FSI = '\u2068';
const PDI = '\u2069';
const LINE_MARKS = { rtl: '\u2067', ltr: '\u2066' };

/** The isolate-opening mark for a whole line in `direction` (anything but 'ltr' is right-to-left). */
export function lineMark(direction) {
    return direction === 'ltr' ? LINE_MARKS.ltr : LINE_MARKS.rtl;
}

/** `line` wrapped in a line-level isolate for `direction`. */
export function isolateLine(line, direction) {
    return `${lineMark(direction)}${line}${PDI}`;
}

/**
 * Make the first-strong isolates of every wrapped line balanced. Wrapping cuts a text on spaces, so a name
 * that contains a space can be split over two lines: the first line is closed with PDI and the next one
 * reopens with FSI. Line breaks stay exactly where the unmarked text put them (the marks have no width).
 */
export function balanceIsolates(lines) {
    let open = 0;
    return lines.map((line) => {
        let text = FSI.repeat(open) + line;
        let depth = open;
        for (const ch of line) {
            if (ch === FSI) depth++;
            else if (ch === PDI && depth > 0) depth--;
        }
        open = depth;
        return text + PDI.repeat(depth);
    });
}
