/**
 * Pure layout math for the scorecard export — canvas size, scale, and the
 * position/size of every element (header band, podium columns, rest-of-
 * players rows). No ctx.* calls and no DOM here: every function takes
 * numbers in and returns numbers/objects, which is what makes this half of
 * scorecard.js unit-testable without a real <canvas>. Drawing (ctx.*) stays
 * in scorecard.js and only reads the numbers computed here.
 */

// --- Fixed 9:16 portrait canvas (mobile "story" ratio). The export is
// ALWAYS exactly this ratio, no matter how many players there are.
export const CANVAS_WIDTH = 720;
export const CANVAS_HEIGHT = Math.round((CANVAS_WIDTH * 16) / 9); // 1280 — exact 9:16
export const FOOTER_H = 54;

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
const RANK_TO_SLOT = { 1: 1, 2: 0, 3: 2 }; // silver-left, gold-center, bronze-right
const PEDESTAL_HEIGHT_FACTORS = [140, 100, 74]; // [رتبه ۱, رتبه ۲, رتبه ۳] — اول باید بلندترین باشد

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
        nameFontPx: Math.round(15 * s),
        scoreFontPx: Math.round(15 * s),
        rankFontPx: Math.round(13 * s),
        circleR: Math.min(16 * s, rowHeight / 2 - 2),
        cornerR: Math.min(14 * s, rowHeight / 2)
    };
}
