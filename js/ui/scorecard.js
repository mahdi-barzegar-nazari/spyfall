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
import { toPersianDigits } from '../utils/text.js';
import {
    computeScorecardLayout,
    computeHeaderLayout,
    computePodiumSlotLayout,
    computeRestRowLayout
} from './scorecard-layout.js';

const SCORECARD_THEME_ACCENTS = {
    default: { primary: '#06b6d4', secondary: '#a855f7', bg1: '#111827', bg2: '#020617' },
    noir:    { primary: '#f59e0b', secondary: '#d97706', bg1: '#1f160a', bg2: '#0a0704' },
    emerald: { primary: '#10b981', secondary: '#059669', bg1: '#0b241d', bg2: '#020807' },
    crimson: { primary: '#f43f5e', secondary: '#be123c', bg1: '#260a13', bg2: '#080203' },
    sunset:  { primary: '#fb923c', secondary: '#ec4899', bg1: '#271208', bg2: '#0a0503' },
    cyber:   { primary: '#e11d9c', secondary: '#00e5ff', bg1: '#170a2c', bg2: '#05010f' },
    ocean:   { primary: '#22d3ee', secondary: '#3b82f6', bg1: '#0b2c3c', bg2: '#04121a' }
};

function hexWithAlpha(hex, alpha) {
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

function truncateCanvasText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
        t = t.slice(0, -1);
    }
    return t + '…';
}

// Wraps text across up to maxLines lines (breaking on spaces), only
// truncating with "…" on the final line if it still doesn't fit. Used
// for podium names, where two tied players' combined names ("Alice و
// Bob") are much better shown on two lines than cut off mid-word.
function wrapCanvasText(ctx, text, maxWidth, maxLines) {
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

    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${h.titleFontPx}px ${fontFam}`;
    ctx.fillText(titleText, cx, h.titleY);

    ctx.font = `${h.metaFontPx}px ${fontFam}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(metaParts.join('   ·   '), cx, h.metaY);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, h.dividerY);
    ctx.lineTo(width - 50, h.dividerY);
    ctx.stroke();
}

function formatGroupNamesForCanvas(group) {
    const names = group.players.map(p => p.name);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} و ${names[1]}`;
    return `${names[0]} و ${toPersianDigits(names.length - 1)} نفر دیگر`;
}

// Podium (top 3 ranks — a rank slot may hold more than one tied player).
function drawPodium(ctx, layout, podiumGroups, fontFam) {
    if (podiumGroups.length === 0) return;
    const medalColors = ['#f59e0b', '#cbd5e1', '#d97706'];
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
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillText(toPersianDigits(g.rank), p.colX, p.rankY);

        if (g.rank === 1) {
            ctx.font = `${p.crownFontPx}px sans-serif`;
            ctx.fillText('👑', p.colX, p.crownY);
        }
        ctx.beginPath();
        ctx.arc(p.colX, p.avatarY, p.avatarR, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = medalColors[p.rankIdx];
        ctx.stroke();
        ctx.font = `${p.medalFontPx}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(medalEmoji[p.rankIdx], p.colX, p.avatarY + 2);
        ctx.textBaseline = 'alphabetic';

        ctx.font = `800 ${p.nameFontPx}px ${fontFam}`;
        ctx.fillStyle = '#f1f5f9';
        const rawName = formatGroupNamesForCanvas(g);
        const displayName = g.players.length > 1 ? `${rawName} (مشترک)` : rawName;
        const nameLines = wrapCanvasText(ctx, displayName, p.pedW - 8, 2);
        nameLines.forEach((line, li) => {
            ctx.fillText(`\u2067${line}\u2069`, p.colX, p.nameBaseY + li * p.nameLineH);
        });
        const lastNameY = p.nameBaseY + (nameLines.length - 1) * p.nameLineH;

        ctx.font = `800 ${p.scoreFontPx}px ${fontFam}`;
        ctx.fillStyle = medalColors[p.rankIdx];
        ctx.fillText(`${toPersianDigits(g.score)} امتیاز`, p.colX, lastNameY + p.scoreYOffset);
    });
}

// Remaining players (rank 4 onward — shared ranks stay in sync with the
// podium). Row step (and, only if truly necessary, font size) compress to
// guarantee everything fits inside the fixed canvas without clipping.
function drawRestRows(ctx, layout, restRows, accent, fontFam) {
    if (restRows.length === 0) return;
    const { width } = layout;
    const row = computeRestRowLayout(layout);

    let y = layout.blockTop + layout.podiumH;
    ctx.textAlign = 'right';
    ctx.font = `700 13px ${fontFam}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText('سایر بازیکنان', width - 40, y + 28);
    y += layout.restHeaderH;

    restRows.forEach((r) => {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        drawRoundedRectPath(ctx, 40, y, width - 80, row.rowHeight, row.cornerR);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(width - 40 - 24, y + row.rowHeight / 2, row.circleR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
        ctx.font = `700 ${row.rankFontPx}px ${fontFam}`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(toPersianDigits(r.rank), width - 40 - 24, y + row.rowHeight / 2 + 1);
        ctx.textBaseline = 'alphabetic';

        ctx.textAlign = 'right';
        ctx.font = `700 ${row.nameFontPx}px ${fontFam}`;
        ctx.fillStyle = '#e2e8f0';
        const displayName = r.tied ? `${r.p.name} (مشترک)` : r.p.name;
        const truncatedName = truncateCanvasText(ctx, displayName, width - 220);
        ctx.fillText(`\u2067${truncatedName}\u2069`, width - 40 - 48, y + row.rowHeight / 2 + 5);

        ctx.textAlign = 'left';
        ctx.fillStyle = accent.primary;
        ctx.font = `800 ${row.scoreFontPx}px ${fontFam}`;
        ctx.fillText(`${toPersianDigits(r.p.score)} امتیاز`, 56, y + row.rowHeight / 2 + 5);

        y += layout.restRowStep;
    });
}

// If there's still a meaningful gap between the content and the footer
// (typical with only a few players), fill it with an actual closing line
// instead of leaving it blank.
function drawClosingLine(ctx, layout, fontFam) {
    if (layout.bottomGap <= 90) return;
    ctx.textAlign = 'center';
    ctx.font = `700 16px ${fontFam}`;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.fillText('🎉 امیدوارم از بازی لذت برده باشید', layout.width / 2, layout.blockBottom + layout.bottomGap / 2);
}

// Footer credit — subtle divider + small, low-opacity, non-bold signature,
// always pinned to the very bottom of the fixed canvas.
function drawFooter(ctx, layout, fontFam) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.width / 2 - 60, layout.height - layout.footerH + 16);
    ctx.lineTo(layout.width / 2 + 60, layout.height - layout.footerH + 16);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = `400 10px ${fontFam}`;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.fillText('ساخته شده توسط مهدی', layout.width / 2, layout.height - 20);
}

export function exportScorecardImage() {
    const renderCanvas = () => {
        const canvas = document.getElementById('scorecard-canvas');
        const ctx = canvas.getContext('2d');
        if ('direction' in ctx) {
            ctx.direction = 'rtl';
        }
        const themeName = document.body.getAttribute('data-theme') || 'default';
        const accent = SCORECARD_THEME_ACCENTS[themeName] || SCORECARD_THEME_ACCENTS.default;
        const fontFam = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";

        const groups = getRankedStandings(gameState.players);
        const podiumGroups = groups.filter(g => g.rank <= 3);
        const restGroups = groups.filter(g => g.rank > 3);
        const restRows = [];
        restGroups.forEach(g => g.players.forEach(p => restRows.push({ p, rank: g.rank, tied: g.players.length > 1 })));
        const totalPlayers = gameState.players.length;

        const layout = computeScorecardLayout(podiumGroups.length, restRows.length);

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = layout.width * dpr;
        canvas.height = layout.height * dpr;
        ctx.scale(dpr, dpr);

        drawBackground(ctx, layout, accent);
        drawSparkles(ctx, layout, accent);

        let dateStr = '';
        try { dateStr = new Date().toLocaleDateString('fa-IR'); } catch(e) {}
        const metaParts = [
            dateStr,
            `${toPersianDigits(gameState.round.num)} دست`,
            `${toPersianDigits(totalPlayers)} بازیکن`
        ].filter(Boolean);
        drawHeader(ctx, layout, accent, fontFam, { titleText: 'کارنامه نهایی بازی جاسوس', metaParts });

        drawPodium(ctx, layout, podiumGroups, fontFam);
        drawRestRows(ctx, layout, restRows, accent, fontFam);
        drawClosingLine(ctx, layout, fontFam);
        drawFooter(ctx, layout, fontFam);

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
