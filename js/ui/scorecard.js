/**
 * Canvas scorecard image export.
 */

import { gameState } from '../core/state.js';
import { getRankedStandings } from '../game/ranking.js';
import { toPersianDigits } from '../utils/text.js';

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

        // --- Fixed 9:16 portrait canvas (mobile "story" ratio). The
        // export is ALWAYS exactly this ratio, no matter how many
        // players there are. A single scale factor is applied uniformly
        // to the header, podium and row list together:
        //  • few players → scale > 1, so the podium/header/rows are
        //    genuinely bigger and bolder — not just padding around a
        //    small fixed design.
        //  • many players → scale < 1 (never below a safe floor), so
        //    the list always fits without ever clipping.
        // Nothing is ever stretched non-uniformly, so nothing distorts.
        const logicalWidth = 720;
        const logicalHeight = Math.round(logicalWidth * 16 / 9); // 1280 — exact 9:16
        const footerH = 54;
        const HEADER_BASE = 196;
        const IDEAL_PODIUM_H = 272;
        const IDEAL_ROW_STEP = 60;
        const IDEAL_REST_HEADER_H = 46;
        const MIN_SCALE = 0.62;
        const MAX_SCALE = 1.7;

        const naturalListH = restRows.length > 0 ? (IDEAL_REST_HEADER_H + restRows.length * IDEAL_ROW_STEP) : 0;
        const naturalBlockH = (podiumGroups.length > 0 ? IDEAL_PODIUM_H : 0) + naturalListH;
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

        // Pass 1: estimate the scale using the base header height.
        let scale = naturalBlockH > 0 ? clamp((logicalHeight - HEADER_BASE - footerH) / naturalBlockH, MIN_SCALE, MAX_SCALE) : 1;
        // When there's slack (scale > 1), let the header claim a modest
        // share of it too, so the title/badge grow a bit and the whole
        // card reads as one deliberately-scaled composition.
        const headerBonus = scale > 1 ? Math.min(34, (scale - 1) * 60) : 0;
        const headerH = HEADER_BASE + headerBonus;
        const contentTop = headerH;
        const contentBottom = logicalHeight - footerH;
        const contentAvailableH = Math.max(0, contentBottom - contentTop);
        // Pass 2: settle the final scale against the (possibly taller) header.
        scale = naturalBlockH > 0 ? clamp(contentAvailableH / naturalBlockH, MIN_SCALE, MAX_SCALE) : 1;
        const headerTextScale = 1 + Math.min(0.25, Math.max(0, scale - 1) * 0.15);

        const podiumH = podiumGroups.length > 0 ? IDEAL_PODIUM_H * scale : 0;
        const restHeaderH = restRows.length > 0 ? IDEAL_REST_HEADER_H * scale : 0;
        const restRowStep = IDEAL_ROW_STEP * scale;
        const podiumScale = scale;

        // Center whatever slack remains after scaling (small by design,
        // since scaling absorbs most of it) rather than leaving a dead
        // gap glued to the bottom.
        const scaledBlockH = podiumH + restHeaderH + restRows.length * restRowStep;
        const slack = Math.max(0, contentAvailableH - scaledBlockH);
        const blockTop = contentTop + slack / 2;
        const blockBottom = blockTop + scaledBlockH;

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = logicalWidth * dpr;
        canvas.height = logicalHeight * dpr;
        ctx.scale(dpr, dpr);

        // Background — reflects the active theme's own palette
        const bgGrad = ctx.createLinearGradient(0, 0, 0, logicalHeight);
        bgGrad.addColorStop(0, accent.bg1 || '#111827');
        bgGrad.addColorStop(1, accent.bg2 || '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);

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
        glow(logicalWidth * 0.16, 30, 210, accent.primary);
        glow(logicalWidth * 0.88, 80, 190, accent.secondary);
        glow(logicalWidth * 0.5, logicalHeight * 0.94, 260, accent.secondary);
        ctx.restore();

        // Sparkle accents — a few in the header band, plus a scattering
        // down the side margins so the taller fixed canvas never looks
        // half-empty when there are only a few players.
        ctx.save();
        ctx.globalAlpha = 0.35;
        [[0.053, 26], [0.932, 42], [0.103, 132], [0.879, 140], [0.488, 16], [0.206, 74], [0.765, 88]]
            .forEach(([fx, sy], i) => {
                ctx.fillStyle = i % 2 === 0 ? accent.primary : accent.secondary;
                ctx.beginPath();
                ctx.arc(fx * logicalWidth, sy, 2 + (i % 3), 0, Math.PI * 2);
                ctx.fill();
            });
        ctx.globalAlpha = 0.16;
        const marginDots = 9;
        for (let i = 0; i < marginDots; i++) {
            const dy = contentTop + 20 + (i * (contentBottom - contentTop - 40) / Math.max(1, marginDots - 1));
            const sideX = i % 2 === 0 ? 22 : logicalWidth - 22;
            ctx.fillStyle = i % 2 === 0 ? accent.secondary : accent.primary;
            ctx.beginPath();
            ctx.arc(sideX, dy, 2 + (i % 2), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Header badge
        const badgeR = 34 * headerTextScale;
        const badgeCY = 62 + headerBonus * 0.15;
        const badgeGrad = ctx.createLinearGradient(logicalWidth / 2 - badgeR, badgeCY - badgeR, logicalWidth / 2 + badgeR, badgeCY + badgeR);
        badgeGrad.addColorStop(0, accent.primary);
        badgeGrad.addColorStop(1, accent.secondary);
        ctx.fillStyle = badgeGrad;
        ctx.beginPath();
        ctx.arc(logicalWidth / 2, badgeCY, badgeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(34 * headerTextScale)}px sans-serif`;
        ctx.fillText('🕵️', logicalWidth / 2, badgeCY + 3);
        ctx.textBaseline = 'alphabetic';

        // Title (names the game once) & meta line
        ctx.fillStyle = '#f8fafc';
        ctx.font = `800 ${Math.round(25 * headerTextScale)}px ${fontFam}`;
        ctx.fillText('کارنامه نهایی بازی جاسوس', logicalWidth / 2, 140 + headerBonus * 0.45);

        let dateStr = '';
        try { dateStr = new Date().toLocaleDateString('fa-IR'); } catch(e) {}
        const metaParts = [
            dateStr,
            `${toPersianDigits(gameState.round.num)} دست`,
            `${toPersianDigits(totalPlayers)} بازیکن`
        ].filter(Boolean);
        ctx.font = `${Math.round(13 * headerTextScale)}px ${fontFam}`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(metaParts.join('   ·   '), logicalWidth / 2, 174 + headerBonus * 0.35);

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(50, headerH - 12);
        ctx.lineTo(logicalWidth - 50, headerH - 12);
        ctx.stroke();

        // Podium (top 3 ranks — a rank slot may hold more than one tied player)
        if (podiumGroups.length > 0) {
            const s = podiumScale;
            const medalColors = ['#f59e0b', '#cbd5e1', '#d97706'];
            const medalEmoji = ['🥇', '🥈', '🥉'];
            const pedestalHeights = [140 * s, 100 * s, 74 * s]; // [رتبه ۱, رتبه ۲, رتبه ۳] — اول باید بلندترین باشد
            const RANK_TO_SLOT = { 1: 1, 2: 0, 3: 2 }; // silver-left, gold-center, bronze-right
            const colW = (logicalWidth - 80) / 3;
            const baseY = blockTop + podiumH - 34 * s;

            function formatGroupNamesForCanvas(group) {
                const names = group.players.map(p => p.name);
                if (names.length === 1) return names[0];
                if (names.length === 2) return `${names[0]} و ${names[1]}`;
                return `${names[0]} و ${toPersianDigits(names.length - 1)} نفر دیگر`;
            }

            podiumGroups.forEach(g => {
                const rankIdx = g.rank - 1; // 0,1,2
                const slot = RANK_TO_SLOT[g.rank];
                const colX = 40 + slot * colW + colW / 2;
                const pedH = pedestalHeights[rankIdx];
                const pedTop = baseY - pedH;
                const pedW = colW - 26;

                const pedGrad = ctx.createLinearGradient(0, pedTop, 0, baseY);
                pedGrad.addColorStop(0, hexWithAlpha(medalColors[rankIdx], 0.28));
                pedGrad.addColorStop(1, hexWithAlpha(medalColors[rankIdx], 0.08));
                ctx.fillStyle = pedGrad;
                drawRoundedRectPath(ctx, colX - pedW / 2, pedTop, pedW, pedH, { tl: 14, tr: 14, br: 4, bl: 4 });
                ctx.fill();
                ctx.strokeStyle = hexWithAlpha(medalColors[rankIdx], 0.55);
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.textAlign = 'center';
                ctx.font = `800 ${Math.round(30 * s)}px ${fontFam}`;
                ctx.fillStyle = 'rgba(255,255,255,0.16)';
                ctx.fillText(toPersianDigits(g.rank), colX, baseY - 14 * s);

                const avatarY = pedTop - 40 * s;
                if (g.rank === 1) {
                    ctx.font = `${Math.round(22 * s)}px sans-serif`;
                    ctx.fillText('👑', colX, avatarY - 34 * s);
                }
                ctx.beginPath();
                ctx.arc(colX, avatarY, 28 * s, 0, Math.PI * 2);
                ctx.fillStyle = '#1e293b';
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = medalColors[rankIdx];
                ctx.stroke();
                ctx.font = `${Math.round(24 * s)}px sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.fillText(medalEmoji[rankIdx], colX, avatarY + 2);
                ctx.textBaseline = 'alphabetic';

                ctx.font = `800 ${Math.round(15 * s)}px ${fontFam}`;
                ctx.fillStyle = '#f1f5f9';
                const rawName = formatGroupNamesForCanvas(g);
                const displayName = g.players.length > 1 ? `${rawName} (مشترک)` : rawName;
                const nameLines = wrapCanvasText(ctx, displayName, pedW - 8, 2);
                const nameLineH = 15 * s * 1.15;
                const nameBaseY = avatarY + 46 * s;
                nameLines.forEach((line, li) => {
                    ctx.fillText(`\u2067${line}\u2069`, colX, nameBaseY + li * nameLineH);
                });
                const lastNameY = nameBaseY + (nameLines.length - 1) * nameLineH;

                ctx.font = `800 ${Math.round(13 * s)}px ${fontFam}`;
                ctx.fillStyle = medalColors[rankIdx];
                ctx.fillText(`${toPersianDigits(g.score)} امتیاز`, colX, lastNameY + 20 * s);
            });
        }

        // Remaining players (rank 4 onward — shared ranks stay in sync
        // with the podium/table). Row step (and, only if truly
        // necessary, font size) compress to guarantee everything fits
        // inside the fixed canvas without clipping or overlap.
        if (restRows.length > 0) {
            let y = blockTop + podiumH;
            ctx.textAlign = 'right';
            ctx.font = `700 13px ${fontFam}`;
            ctx.fillStyle = '#64748b';
            ctx.fillText('سایر بازیکنان', logicalWidth - 40, y + 28);
            y += restHeaderH;

            const rowGap = Math.max(3, 9 * scale);
            const rh = Math.max(20, restRowStep - rowGap);
            const nameFontPx = Math.round(15 * scale);
            const scoreFontPx = Math.round(15 * scale);
            const rankFontPx = Math.round(13 * scale);
            const circleR = Math.min(16 * scale, rh / 2 - 2);
            const cornerR = Math.min(14 * scale, rh / 2);

            restRows.forEach((row) => {
                ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                drawRoundedRectPath(ctx, 40, y, logicalWidth - 80, rh, cornerR);
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(logicalWidth - 40 - 24, y + rh / 2, circleR, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fill();
                ctx.font = `700 ${rankFontPx}px ${fontFam}`;
                ctx.fillStyle = '#94a3b8';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(toPersianDigits(row.rank), logicalWidth - 40 - 24, y + rh / 2 + 1);
                ctx.textBaseline = 'alphabetic';

                ctx.textAlign = 'right';
                ctx.font = `700 ${nameFontPx}px ${fontFam}`;
                ctx.fillStyle = '#e2e8f0';
                const displayName = row.tied ? `${row.p.name} (مشترک)` : row.p.name;
                const truncatedName = truncateCanvasText(ctx, displayName, logicalWidth - 220);
                ctx.fillText(`\u2067${truncatedName}\u2069`, logicalWidth - 40 - 48, y + rh / 2 + 5);

                ctx.textAlign = 'left';
                ctx.fillStyle = accent.primary;
                ctx.font = `800 ${scoreFontPx}px ${fontFam}`;
                ctx.fillText(`${toPersianDigits(row.p.score)} امتیاز`, 56, y + rh / 2 + 5);

                y += restRowStep;
            });
        }

        // If there's still a meaningful gap between the content and the
        // footer (typical with only a few players), fill it with an
        // actual closing line instead of leaving it blank.
        const bottomGap = contentBottom - blockBottom;
        if (bottomGap > 90) {
            ctx.textAlign = 'center';
            ctx.font = `700 16px ${fontFam}`;
            ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
            ctx.fillText('🎉 امیدوارم از بازی لذت برده باشید', logicalWidth / 2, blockBottom + bottomGap / 2);
        }

        // Footer credit — subtle divider + small, low-opacity, non-bold
        // signature, always pinned to the very bottom of the fixed canvas.
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(logicalWidth / 2 - 60, logicalHeight - footerH + 16);
        ctx.lineTo(logicalWidth / 2 + 60, logicalHeight - footerH + 16);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.font = `400 10px ${fontFam}`;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.fillText('ساخته شده توسط مهدی', logicalWidth / 2, logicalHeight - 20);

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
