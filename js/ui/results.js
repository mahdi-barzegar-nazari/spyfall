/**
 * Podium, per-player detail cards and accolades.
 */

import { gameState } from '../core/state.js';
import { formatDuration, formatNumber, rawHtml, t, tHtml, tn, tnHtml } from '../i18n/index.js';
import { escapeHtml } from '../utils/text.js';

export const PODIUM_RANK_META = {
    1: { icon: '👑' },
    2: { icon: '🥈' },
    3: { icon: '🥉' }
};

function formatGroupNames(group) {
    const names = group.players.map(p => `<bdi>${escapeHtml(p.name)}</bdi>`);
    if (names.length === 1) return names[0];
    if (names.length === 2) return tHtml('names.pair', { a: rawHtml(names[0]), b: rawHtml(names[1]) });
    return tnHtml('names.more', names.length - 1, { a: rawHtml(names[0]) });
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
        const tieBadge = g.players.length > 1 ? `<span class="podium-tie-badge">${escapeHtml(t('leaderboard.podiumTied'))}</span>` : '';
        el.innerHTML = `
                <div class="podium-pillar">
                    <div class="podium-card">
                        <span class="podium-icon" aria-hidden="true">${meta.icon}</span>
                        <span class="podium-name">${formatGroupNames(g)}</span>
                        ${tieBadge}
                        <span class="podium-score">${escapeHtml(tn('score.points', g.score, { count: g.score }))}</span>
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
    return `<div class="detail-row"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;
}

// Builds the full "player details" list — one card per player with every
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

        rows += `<div class="detail-section-title">${escapeHtml(t('details.section.overall'))}</div>`;
        rows += statRow(t('leaderboard.col.score'), formatNumber(Number(p.score) || 0));
        rows += statRow(t('details.stat.citizenWins'), formatNumber(st.cw || 0));
        rows += statRow(t('details.stat.votesRight'), formatNumber(st.spiesCaught || 0));
        rows += statRow(t('details.stat.votesWrong'), formatNumber(st.wrongVotes || 0));
        rows += statRow(t('details.stat.wrongfullyEjected'), formatNumber(st.innocentVotesReceived || 0));

        if ((st.timesFool || 0) > 0) {
            rows += `<div class="detail-section-title">${escapeHtml(t('details.section.fool'))}</div>`;
            rows += statRow(t('details.stat.foolTimes'), formatNumber(st.timesFool));
            rows += statRow(t('details.stat.foolEscapes'), formatNumber(st.foolEscaped || 0));
        }

        if ((st.timesSpy || 0) > 0) {
            rows += `<div class="detail-section-title">${escapeHtml(t('details.section.spy'))}</div>`;
            rows += statRow(t('details.stat.spyTimes'), formatNumber(st.timesSpy));
            rows += statRow(t('details.stat.spyWins'), formatNumber(st.sw || 0));
            rows += statRow(t('details.stat.spyCaught'), formatNumber(st.vs || 0));
            rows += statRow(t('details.stat.spyCitizensEjected'), formatNumber(st.citizensEliminatedBeforeCaught || 0));
            rows += statRow(t('details.stat.spyCatchTime'), formatDuration(st.totalCatchTimeSec));
            rows += statRow(t('details.stat.spyGuesses'), formatNumber(st.spyGuesses || 0));
        }

        if (((st.bw || 0) + (st.bl || 0)) > 0) {
            rows += `<div class="detail-section-title">${escapeHtml(t('details.section.wager'))}</div>`;
            rows += statRow(t('details.stat.wagersWon'), formatNumber(st.bw || 0));
            rows += statRow(t('details.stat.wagersLost'), formatNumber(st.bl || 0));
            const wp = Math.round(st.wagerProfit || 0);
            rows += statRow(t('details.stat.wagerProfit'), `${wp > 0 ? '+' : ''}${formatNumber(wp)}`);
        }

        rows += `<div class="detail-section-title">${escapeHtml(t('details.section.hidden'))}</div>`;
        rows += statRow(t('details.stat.hiddenTieBreaker'), formatNumber(Math.round((st.hiddenTieBreakerScore || 0) * 10) / 10));

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

// "a, b and c": the names are joined with the language's own "and" (see `names.pair`).
function joinNames(players) {
    return players
        .map(p => `<bdi>${escapeHtml(p.name)}</bdi>`)
        .reduce((joined, next) => tHtml('names.pair', { a: rawHtml(joined), b: rawHtml(next) }));
}

function accoladeCard(icon, colorClass, titleKey, descKey, players) {
    const title = tHtml(titleKey, { names: rawHtml(joinNames(players)) });
    return `<div class="accolade-card"><div class="accolade-icon">${icon}</div><div><div class="${colorClass} u-bold">${title}</div><div class="color-secondary u-fs-075">${escapeHtml(t(descKey))}</div></div></div>`;
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

    if (topSpies) acc.innerHTML += accoladeCard('🕵️', 'color-rose', 'leaderboard.accolade.ghost.title', 'leaderboard.accolade.ghost.desc', topSpies);
    if (topGuessers) acc.innerHTML += accoladeCard('🧠', 'color-amber', 'leaderboard.accolade.mindreader.title', 'leaderboard.accolade.mindreader.desc', topGuessers);
    if (topDetectives) acc.innerHTML += accoladeCard('🔍', 'color-emerald', 'leaderboard.accolade.sherlock.title', 'leaderboard.accolade.sherlock.desc', topDetectives);
    if (topWagerers) acc.innerHTML += accoladeCard('🐺', 'color-primary', 'leaderboard.accolade.wolf.title', 'leaderboard.accolade.wolf.desc', topWagerers);
    if (topVictims) acc.innerHTML += accoladeCard('🕊️', 'color-violet', 'leaderboard.accolade.victim.title', 'leaderboard.accolade.victim.desc', topVictims);
    if (topFools) acc.innerHTML += accoladeCard('🎭', 'color-amber', 'leaderboard.accolade.mask.title', 'leaderboard.accolade.mask.desc', topFools);
}
