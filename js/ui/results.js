/**
 * Podium, per-player detail cards and accolades.
 */

import { gameState } from '../core/state.js';
import { escapeHtml, formatSecondsFa, toPersianDigits } from '../utils/text.js';

export const PODIUM_RANK_META = {
    1: { icon: '👑' },
    2: { icon: '🥈' },
    3: { icon: '🥉' }
};

function formatGroupNames(group) {
    const names = group.players.map(p => escapeHtml(p.name));
    if (names.length === 1) return `<bdi>${names[0]}</bdi>`;
    if (names.length === 2) return `<bdi>${names[0]}</bdi> و <bdi>${names[1]}</bdi>`;
    return `<bdi>${names[0]}</bdi> و ${toPersianDigits(names.length - 1)} نفر دیگر`;
}

export function renderPodium(container, groups) {
    if (!container) return;
    container.innerHTML = '';
    const top = groups.filter(g => g.rank <= 3);
    top.forEach(g => {
        const meta = PODIUM_RANK_META[g.rank] || { icon: '🏅' };
        const el = document.createElement('div');
        el.className = 'podium-item';
        el.dataset.rank = String(g.rank);
        const tieBadge = g.players.length > 1 ? `<span class="podium-tie-badge">مشترک</span>` : '';
        el.innerHTML = `
                <div class="podium-pillar">
                    <div class="podium-card">
                        <span class="podium-icon" aria-hidden="true">${meta.icon}</span>
                        <span class="podium-name">${formatGroupNames(g)}</span>
                        ${tieBadge}
                        <span class="podium-score">${g.score} امتیاز</span>
                    </div>
                    <div class="podium-riser" aria-hidden="true"></div>
                </div>
            `;
        container.appendChild(el);
    });

    // A fixed riser height alone doesn't guarantee 1st > 2nd > 3rd overall
    // height — a tied name wrapping to 2 lines can make a lower rank's
    // CARD taller than a higher rank's, overtaking it in total height.
    // Fix: measure the actual rendered card heights, then top up each
    // riser so every column's total height (card + riser) reduces to
    // the SAME baseline plus a fixed per-rank step — content differences
    // cancel out, so the staircase always holds.
    requestAnimationFrame(() => {
        const items = Array.from(container.querySelectorAll('.podium-item'));
        if (!items.length) return;
        const isCompact = window.innerWidth <= 380;
        const STEP = isCompact ? { 1: 54, 2: 36, 3: 18 } : { 1: 66, 2: 44, 3: 22 };
        const cardHeights = items.map(el => el.querySelector('.podium-card').offsetHeight);
        const maxCardH = Math.max(...cardHeights);
        items.forEach((el, i) => {
            const rank = Number(el.dataset.rank);
            const riser = el.querySelector('.podium-riser');
            const extra = maxCardH - cardHeights[i];
            riser.style.height = `${(STEP[rank] || 0) + extra}px`;
        });
    });
}

function statRow(label, value) {
    return `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`;
}

// Builds the full "دیدن جزئیات" list — one card per player with every
// behind-the-scenes stat the game secretly tracked this match. Sections
// that never applied to a given player (never spy, never fool, never
// wagered) are skipped for them rather than showing a wall of zeros.
export function renderPlayerDetails() {
    const container = document.getElementById('player-details-list');
    if (!container) return;
    container.innerHTML = '';
    container.scrollTop = 0;
    const sorted = [...gameState.players].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

    sorted.forEach(p => {
        const st = p.stats || {};
        let rows = '';

        rows += `<div class="detail-section-title">🎖️ کلی</div>`;
        rows += statRow('امتیاز نهایی', toPersianDigits(Number(p.score) || 0));
        rows += statRow('بردها به‌عنوان شهروند', toPersianDigits(st.cw || 0));
        rows += statRow('رای‌های درست (هنگام شهروند بودن)', toPersianDigits(st.spiesCaught || 0));
        rows += statRow('رای‌های غلط (هنگام شهروند بودن)', toPersianDigits(st.wrongVotes || 0));
        rows += statRow('دفعاتی که به اشتباه اخراج شد', toPersianDigits(st.innocentVotesReceived || 0));

        if ((st.timesFool || 0) > 0) {
            rows += `<div class="detail-section-title">🎭 به‌عنوان ساده‌لوح</div>`;
            rows += statRow('دفعاتی که این نقش را داشت', toPersianDigits(st.timesFool));
            rows += statRow('فرارهای موفق (بدون شناسایی)', toPersianDigits(st.foolEscaped || 0));
        }

        if ((st.timesSpy || 0) > 0) {
            rows += `<div class="detail-section-title">🕵️ به‌عنوان جاسوس</div>`;
            rows += statRow('دفعاتی که جاسوس شد', toPersianDigits(st.timesSpy));
            rows += statRow('بردها به‌عنوان جاسوس', toPersianDigits(st.sw || 0));
            rows += statRow('دفعاتی که شناسایی و اخراج شد', toPersianDigits(st.vs || 0));
            rows += statRow('شهروندانی که قبل از خودش اخراج کرد', toPersianDigits(st.citizensEliminatedBeforeCaught || 0));
            rows += statRow('مجموع زمان طول‌کشیدن تا لو رفتن', formatSecondsFa(st.totalCatchTimeSec));
            rows += statRow('حدس‌های درست کلمه رمز', toPersianDigits(st.spyGuesses || 0));
        }

        if (((st.bw || 0) + (st.bl || 0)) > 0) {
            rows += `<div class="detail-section-title">🎲 شرط‌بندی</div>`;
            rows += statRow('شرط‌های برنده', toPersianDigits(st.bw || 0));
            rows += statRow('شرط‌های بازنده', toPersianDigits(st.bl || 0));
            const wp = Math.round(st.wagerProfit || 0);
            rows += statRow('سود/زیان خالص شرط‌بندی', `${wp > 0 ? '+' : ''}${toPersianDigits(wp)}`);
        }

        rows += `<div class="detail-section-title">🔒 امتیاز مخفی پشت‌صحنه</div>`;
        rows += statRow('امتیاز مخفی تساوی‌شکن (فقط برای شکستن تساوی، در امتیاز نهایی دیده نمی‌شود)', toPersianDigits(Math.round((st.hiddenTieBreakerScore || 0) * 10) / 10));

        const card = document.createElement('div');
        card.className = 'detail-player-card';
        card.innerHTML = `<h4>${escapeHtml(p.name)}</h4>${rows}`;
        container.appendChild(card);
    });
}

function getTopPlayersForAccolade(statKey) {
    if (!gameState.players || gameState.players.length === 0) return null;
    const valid = gameState.players.filter(p => (Number(p.stats?.[statKey]) || 0) > 0);
    if (valid.length === 0) return null;
    const maxVal = Math.max(...valid.map(p => Number(p.stats[statKey]) || 0));
    if (maxVal <= 0) return null;
    const tops = valid.filter(p => (Number(p.stats[statKey]) || 0) === maxVal);
    if ((tops.length / gameState.players.length) > 0.4) return null;
    return tops;
}

export function renderAccolades() {
    const acc = document.getElementById('accolades-container');
    acc.innerHTML = '';
    
    const topSpies = getTopPlayersForAccolade('sw');
    const topDetectives = getTopPlayersForAccolade('spiesCaught');
    const topGuessers = getTopPlayersForAccolade('spyGuesses');
    const topWagerers = getTopPlayersForAccolade('wagerProfit');
    const topVictims = getTopPlayersForAccolade('innocentVotesReceived');
    const topFools = getTopPlayersForAccolade('foolEscaped');

    if (topSpies) {
        const names = topSpies.map(p => `<bdi>${escapeHtml(p.name)}</bdi>`).join(' و ');
        acc.innerHTML += `<div class="accolade-card"><div class="accolade-icon">🕵️</div><div><div class="color-rose" style="font-weight:bold;">شبح سیاه: ${names}</div><div class="color-secondary" style="font-size:0.75rem;">زیرک‌ترین جاسوس با بیشترین فرار از شناسایی</div></div></div>`;
    }
    if (topGuessers) {
        const names = topGuessers.map(p => `<bdi>${escapeHtml(p.name)}</bdi>`).join(' و ');
        acc.innerHTML += `<div class="accolade-card"><div class="accolade-icon">🧠</div><div><div class="color-amber" style="font-weight:bold;">ذهن‌خوان برجسته: ${names}</div><div class="color-secondary" style="font-size:0.75rem;">حدس صحیح کلمه رمز اصلی در نقش جاسوس</div></div></div>`;
    }
    if (topDetectives) {
        const names = topDetectives.map(p => `<bdi>${escapeHtml(p.name)}</bdi>`).join(' و ');
        acc.innerHTML += `<div class="accolade-card"><div class="accolade-icon">🔍</div><div><div class="color-emerald" style="font-weight:bold;">شرلوک هلمز: ${names}</div><div class="color-secondary" style="font-size:0.75rem;">بیشترین شکار جاسوس‌ها در جلسات رای‌گیری</div></div></div>`;
    }
    if (topWagerers) {
        const names = topWagerers.map(p => `<bdi>${escapeHtml(p.name)}</bdi>`).join(' و ');
        acc.innerHTML += `<div class="accolade-card"><div class="accolade-icon">🐺</div><div><div class="color-primary" style="font-weight:bold;">گرگ وال‌استریت: ${names}</div><div class="color-secondary" style="font-size:0.75rem;">کسب بیشترین سود از شرط‌بندی روی مظنونین</div></div></div>`;
    }
    if (topVictims) {
        const names = topVictims.map(p => `<bdi>${escapeHtml(p.name)}</bdi>`).join(' و ');
        acc.innerHTML += `<div class="accolade-card"><div class="accolade-icon">🕊️</div><div><div style="font-weight:bold; color:#a855f7;">قربانی بی‌گناه: ${names}</div><div class="color-secondary" style="font-size:0.75rem;">مظلوم‌ترین شهروند که بیشترین اتهام اشتباه را خورد</div></div></div>`;
    }
    if (topFools) {
        const names = topFools.map(p => `<bdi>${escapeHtml(p.name)}</bdi>`).join(' و ');
        acc.innerHTML += `<div class="accolade-card"><div class="accolade-icon">🎭</div><div><div class="color-amber" style="font-weight:bold;">بازیگر نقاب‌دار: ${names}</div><div class="color-secondary" style="font-size:0.75rem;">ساده‌لوحی که بدون سوءظن موفق به فرار شد</div></div></div>`;
    }
}
