/**
 * Canvas scorecard image export.
 *
 * The geometry (scale, podium/row positions, header/footer sizes) lives in
 * ./scorecard-layout.js as plain pure functions. This file is only the
 * rendering half: small ctx.*-drawing functions that read those numbers,
 * plus exportScorecardImage() to wire it all together and trigger the PNG
 * download.
 */

import { gameState } from '../core/state.js';
import { getRankedStandings } from '../game/ranking.js';
import { formatDate, formatNumber, getDirection, isolate, t, tn } from '../i18n/index.js';
import {
    computeScorecardLayout,
    computeHeaderLayout,
    computePodiumSlotLayout,
    computeRestRowLayout,
    computeRestRowColumns,
    computeRestNameMaxWidth,
    balanceIsolates,
    buildScorecardRows,
    isolateLine
} from './scorecard-layout.js';

// The colours of the exported image, one entry per theme of css/style.css (a canvas cannot read the CSS variables
// in a unit test, so the table mirrors them and tests/unit/theme-colors.test.mjs keeps the two in step):
// primary / secondary = --brand-primary / --brand-secondary, text / muted = --text-primary / --text-secondary,
// panel = the colour of --surface-card (the row panels and the avatar discs). bg1 / bg2 are the two stops of the
// image background, which have no CSS variable of their own. Only the medal colours below stay the same in every
// theme: gold, silver and bronze say which rank a name has.
export const SCORECARD_THEME_ACCENTS = {
    default: { primary: '#06b6d4', secondary: '#a855f7', text: '#f8fafc', muted: '#a0aec0', panel: '#121826', bg1: '#111827', bg2: '#020617' },
    noir:    { primary: '#f59e0b', secondary: '#d97706', text: '#fef3c7', muted: '#fbbf24', panel: '#201812', bg1: '#1f160a', bg2: '#0a0704' },
    classic: { primary: '#d4d4cf', secondary: '#6e6e68', text: '#f4f4f2', muted: '#b3b3ad', panel: '#1a1a1a', bg1: '#1a1a1a', bg2: '#030303' },
    emerald: { primary: '#10b981', secondary: '#059669', text: '#ecfdf5', muted: '#a7f3d0', panel: '#061e1a', bg1: '#0b241d', bg2: '#020807' },
    crimson: { primary: '#f43f5e', secondary: '#be123c', text: '#fff1f2', muted: '#fecdd3', panel: '#1e0a0f', bg1: '#260a13', bg2: '#080203' },
    sunset:  { primary: '#fb923c', secondary: '#ec4899', text: '#fff7ed', muted: '#fdba9f', panel: '#23140e', bg1: '#271208', bg2: '#0a0503' },
    cyber:   { primary: '#e11d9c', secondary: '#00e5ff', text: '#fdf4ff', muted: '#e9b8fb', panel: '#10061e', bg1: '#170a2c', bg2: '#05010f' },
    ocean:   { primary: '#22d3ee', secondary: '#3b82f6', text: '#ecfeff', muted: '#a5f3fc', panel: '#081e28', bg1: '#0b2c3c', bg2: '#04121a' }
};
// The gold, silver and bronze of ranks 1 to 3: the same in every theme on purpose.
export const SCORECARD_MEDAL_COLORS = ['#f59e0b', '#cbd5e1', '#d97706'];

export function hexWithAlpha(hex, alpha) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
    ctx.lineTo(x + r.bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.arcTo(x, y, x + r.tl, y, r.tl);
    ctx.closePath();
}

export function truncateCanvasText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let clipped = text;
    while (clipped.length > 1 && ctx.measureText(clipped + '…').width > maxWidth) {
        clipped = clipped.slice(0, -1);
    }
    return clipped + '…';
}

// Wraps text across up to maxLines lines (breaking on spaces), only
// truncating with "…" on the final line if it still doesn't fit. Used
// for podium names, where two tied players' combined names ("Alice and
// Bob") are much better shown on two lines than cut off mid-word.
function wrapWords(ctx, text, maxWidth, maxLines) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
        const test = current ? current + ' ' + words[i] : words[i];
        if (!current || ctx.measureText(test).width <= maxWidth) {
            current = test;
            continue;
        }
        lines.push(current);
        current = words[i];
        if (lines.length === maxLines - 1) {
            const rest = [current].concat(words.slice(i + 1)).join(' ');
            lines.push(truncateCanvasText(ctx, rest, maxWidth));
            return lines;
        }
    }
    if (current) lines.push(current);
    return lines.slice(0, maxLines);
}

// wrapWords can only break between words, so one word wider than the column (a long name with no space in
// it) would run over the neighbouring slot and off the canvas: every line is cut to the width.
export function wrapCanvasText(ctx, text, maxWidth, maxLines) {
    return wrapWords(ctx, text, maxWidth, maxLines).map(line => truncateCanvasText(ctx, line, maxWidth));
}

function drawBackground(ctx, layout, accent) {
    const { width, height } = layout;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, accent.bg1 || '#111827');
    bgGrad.addColorStop(1, accent.bg2 || '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Ambient glow (tasteful, matches in-app lighting)
    function glow(x, y, r, color) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = 0.26;
    glow(width * 0.16, 30, 210, accent.primary);
    glow(width * 0.88, 80, 190, accent.secondary);
    glow(width * 0.5, height * 0.94, 260, accent.secondary);
    ctx.restore();
}

// Sparkle accents — a few in the header band, plus a scattering down the
// side margins so the taller fixed canvas never looks half-empty when
// there are only a few players.
function drawSparkles(ctx, layout, accent) {
    const { width, contentTop, contentBottom } = layout;
    ctx.save();
    ctx.globalAlpha = 0.35;
    [[0.053, 26], [0.932, 42], [0.103, 132], [0.879, 140], [0.488, 16], [0.206, 74], [0.765, 88]]
        .forEach(([fx, sy], i) => {
            ctx.fillStyle = i % 2 === 0 ? accent.primary : accent.secondary;
            ctx.beginPath();
            ctx.arc(fx * width, sy, 2 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        });
    ctx.globalAlpha = 0.16;
    const marginDots = 9;
    for (let i = 0; i < marginDots; i++) {
        const dy = contentTop + 20 + (i * (contentBottom - contentTop - 40)) / Math.max(1, marginDots - 1);
        const sideX = i % 2 === 0 ? 22 : width - 22;
        ctx.fillStyle = i % 2 === 0 ? accent.secondary : accent.primary;
        ctx.beginPath();
        ctx.arc(sideX, dy, 2 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// Header badge, title & meta line (date / round / player count), plus the
// divider that closes off the header band.
function drawHeader(ctx, layout, accent, fontFam, { titleText, metaParts }) {
    const { width } = layout;
    const h = computeHeaderLayout(layout);
    const cx = width / 2;

    const badgeGrad = ctx.createLinearGradient(cx - h.badgeR, h.badgeCY - h.badgeR, cx + h.badgeR, h.badgeCY + h.badgeR);
    badgeGrad.addColorStop(0, accent.primary);
    badgeGrad.addColorStop(1, accent.secondary);
    ctx.fillStyle = badgeGrad;
    ctx.beginPath();
    ctx.arc(cx, h.badgeCY, h.badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${h.badgeFontPx}px sans-serif`;
    ctx.fillText('🕵️', cx, h.badgeCY + 3);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = accent.text;
    ctx.font = `800 ${h.titleFontPx}px ${fontFam}`;
    ctx.fillText(titleText, cx, h.titleY);

    ctx.font = `${h.metaFontPx}px ${fontFam}`;
    ctx.fillStyle = accent.muted;
    ctx.fillText(metaParts.join('   ·   '), cx, h.metaY);

    ctx.strokeStyle = hexWithAlpha(accent.text, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, h.dividerY);
    ctx.lineTo(width - 50, h.dividerY);
    ctx.stroke();
}

// The slot names the players of `group.named` (buildScorecardRows decides who they are); a bigger tie is
// "A and N others", and those N players are written out in the rest list instead.
function formatGroupNamesForCanvas(group) {
    // Each name is isolated on its own, so a name in the other script cannot reorder its neighbours.
    const names = group.named.map(p => isolate(p.name));
    if (group.players.length === 1) return names[0];
    if (names.length === 2) return t('names.pair', { a: names[0], b: names[1] });
    return tn('names.more', group.players.length - 1, { a: names[0] });
}

// Podium (top 3 ranks — a rank slot may hold more than one tied player).
function drawPodium(ctx, layout, podiumGroups, accent, fontFam, direction) {
    if (podiumGroups.length === 0) return;
    const medalColors = SCORECARD_MEDAL_COLORS;
    const medalEmoji = ['🥇', '🥈', '🥉'];

    podiumGroups.forEach(g => {
        const p = computePodiumSlotLayout(g.rank, layout);

        const pedGrad = ctx.createLinearGradient(0, p.pedTop, 0, p.baseY);
        pedGrad.addColorStop(0, hexWithAlpha(medalColors[p.rankIdx], 0.28));
        pedGrad.addColorStop(1, hexWithAlpha(medalColors[p.rankIdx], 0.08));
        ctx.fillStyle = pedGrad;
        drawRoundedRectPath(ctx, p.colX - p.pedW / 2, p.pedTop, p.pedW, p.pedH, { tl: 14, tr: 14, br: 4, bl: 4 });
        ctx.fill();
        ctx.strokeStyle = hexWithAlpha(medalColors[p.rankIdx], 0.55);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.font = `800 ${p.rankFontPx}px ${fontFam}`;
        ctx.fillStyle = hexWithAlpha(accent.text, 0.16);
        ctx.fillText(formatNumber(g.rank), p.colX, p.rankY);

        if (g.rank === 1) {
            ctx.font = `${p.crownFontPx}px sans-serif`;
            ctx.fillText('👑', p.colX, p.crownY);
        }
        ctx.beginPath();
        ctx.arc(p.colX, p.avatarY, p.avatarR, 0, Math.PI * 2);
        ctx.fillStyle = accent.panel;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = medalColors[p.rankIdx];
        ctx.stroke();
        ctx.font = `${p.medalFontPx}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(medalEmoji[p.rankIdx], p.colX, p.avatarY + 2);
        ctx.textBaseline = 'alphabetic';

        ctx.font = `800 ${p.nameFontPx}px ${fontFam}`;
        ctx.fillStyle = accent.text;
        const rawName = formatGroupNamesForCanvas(g);
        const displayName = g.players.length > 1 ? t('scorecard.tied', { name: rawName }) : rawName;
        const nameLines = balanceIsolates(wrapCanvasText(ctx, displayName, p.pedW - 8, 2));
        nameLines.forEach((line, li) => {
            ctx.fillText(isolateLine(line, direction), p.colX, p.nameBaseY + li * p.nameLineH);
        });
        const lastNameY = p.nameBaseY + (nameLines.length - 1) * p.nameLineH;

        ctx.font = `800 ${p.scoreFontPx}px ${fontFam}`;
        ctx.fillStyle = medalColors[p.rankIdx];
        ctx.fillText(tn('score.points', g.score), p.colX, lastNameY + p.scoreYOffset);
    });
}

// Every player the podium does not name: first the tied players of a podium slot that only says "A and N
// others" (rank 1-3, with their real rank and the tied marker), then rank 4 onward — shared ranks stay in
// sync with the podium. Row step (and, only if truly necessary, font size) compress to guarantee everything
// fits inside the fixed canvas without clipping.
function drawRestRows(ctx, layout, restRows, accent, fontFam, direction) {
    if (restRows.length === 0) return;
    const { width } = layout;
    const row = computeRestRowLayout(layout);
    const col = computeRestRowColumns(layout, direction);

    let y = layout.blockTop + layout.podiumH;
    ctx.textAlign = col.headerAlign;
    ctx.font = `700 13px ${fontFam}`;
    ctx.fillStyle = hexWithAlpha(accent.muted, 0.7);
    ctx.fillText(t('scorecard.others'), col.headerX, y + row.headerBaselineY);
    y += layout.restHeaderH;

    restRows.forEach((r) => {
        ctx.fillStyle = hexWithAlpha(accent.panel, 0.75);
        ctx.strokeStyle = hexWithAlpha(accent.text, 0.08);
        ctx.lineWidth = 1;
        drawRoundedRectPath(ctx, 40, y, width - 80, row.rowHeight, row.cornerR);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(col.circleX, y + row.rowHeight / 2, row.circleR, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(accent.text, 0.06);
        ctx.fill();
        ctx.font = `700 ${row.rankFontPx}px ${fontFam}`;
        ctx.fillStyle = accent.muted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatNumber(r.rank), col.circleX, y + row.rowHeight / 2 + 1);
        ctx.textBaseline = 'alphabetic';

        // The score is measured first: a long name is cut so that it never runs into it.
        const scoreText = tn('score.points', r.p.score);
        ctx.font = `800 ${row.scoreFontPx}px ${fontFam}`;
        const nameMaxWidth = computeRestNameMaxWidth(layout, col, ctx.measureText(scoreText).width);

        ctx.textAlign = col.nameAlign;
        ctx.font = `700 ${row.nameFontPx}px ${fontFam}`;
        ctx.fillStyle = accent.text;
        const displayName = r.tied ? t('scorecard.tied', { name: isolate(r.p.name) }) : isolate(r.p.name);
        const [truncatedName] = balanceIsolates([truncateCanvasText(ctx, displayName, nameMaxWidth)]);
        ctx.fillText(isolateLine(truncatedName, direction), col.nameX, y + row.rowHeight / 2 + 5);

        ctx.textAlign = col.scoreAlign;
        ctx.fillStyle = accent.primary;
        ctx.font = `800 ${row.scoreFontPx}px ${fontFam}`;
        ctx.fillText(scoreText, col.scoreX, y + row.rowHeight / 2 + 5);

        y += layout.restRowStep;
    });
}

// If there's still a meaningful gap between the content and the footer
// (typical with only a few players), fill it with an actual closing line
// instead of leaving it blank.
function drawClosingLine(ctx, layout, accent, fontFam) {
    if (layout.bottomGap <= 90) return;
    ctx.textAlign = 'center';
    ctx.font = `700 16px ${fontFam}`;
    ctx.fillStyle = hexWithAlpha(accent.text, 0.55);
    ctx.fillText(t('scorecard.closing'), layout.width / 2, layout.blockBottom + layout.bottomGap / 2);
}

// Footer credit — subtle divider + small, low-opacity, non-bold signature,
// always pinned to the very bottom of the fixed canvas.
function drawFooter(ctx, layout, accent, fontFam) {
    ctx.strokeStyle = hexWithAlpha(accent.text, 0.06);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.width / 2 - 60, layout.height - layout.footerH + 16);
    ctx.lineTo(layout.width / 2 + 60, layout.height - layout.footerH + 16);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = `400 10px ${fontFam}`;
    ctx.fillStyle = hexWithAlpha(accent.muted, 0.45);
    ctx.fillText(t('welcome.credit.author'), layout.width / 2, layout.height - 20);
}

export function exportScorecardImage() {
    const renderCanvas = () => {
        const canvas = document.getElementById('scorecard-canvas');
        const ctx = canvas.getContext('2d');
        // The text direction of the canvas follows the active language (names are isolated one by one).
        const direction = getDirection();
        if ('direction' in ctx) {
            ctx.direction = direction;
        }
        const themeName = document.body.getAttribute('data-theme') || 'default';
        const accent = SCORECARD_THEME_ACCENTS[themeName] || SCORECARD_THEME_ACCENTS.default;
        const fontFam = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";

        const { podiumGroups, restRows } = buildScorecardRows(getRankedStandings(gameState.players));
        const totalPlayers = gameState.players.length;

        const layout = computeScorecardLayout(podiumGroups.length, restRows.length);

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = layout.width * dpr;
        canvas.height = layout.height * dpr;
        ctx.scale(dpr, dpr);

        drawBackground(ctx, layout, accent);
        drawSparkles(ctx, layout, accent);

        const dateStr = formatDate(new Date());
        const metaParts = [
            dateStr,
            tn('scorecard.meta.rounds', gameState.round.num),
            tn('scorecard.meta.players', totalPlayers)
        ].filter(Boolean);
        drawHeader(ctx, layout, accent, fontFam, { titleText: t('scorecard.title'), metaParts });

        drawPodium(ctx, layout, podiumGroups, accent, fontFam, direction);
        drawRestRows(ctx, layout, restRows, accent, fontFam, direction);
        drawClosingLine(ctx, layout, accent, fontFam);
        drawFooter(ctx, layout, accent, fontFam);

        const link = document.createElement('a');
        link.download = `SpyGame-Scorecard-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(renderCanvas);
    } else {
        renderCanvas();
    }
}
