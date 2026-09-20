/**
 * Elimination reveal and the SVG tie-breaker wheel.
 */

import { dispatch } from '../core/dispatch.js';
import { gameState } from '../core/state.js';
import { playCardFlip } from '../platform/audio.js';
import { getRandomCryptoInt } from '../utils/random.js';
import { escapeHtml } from '../utils/text.js';

let elimRevealTimeoutId = null;

export function showEliminationReveal(player, wasSpy, note, onDone) {
    const icon = document.getElementById('elim-icon');
    const nameEl = document.getElementById('elim-name');
    const badge = document.getElementById('elim-badge');
    const noteEl = document.getElementById('elim-note');

    nameEl.textContent = `«${player.name}» از بازی حذف شد`;
    if (wasSpy) {
        icon.textContent = '🕵️';
        badge.className = 'role-badge role-spy';
        badge.textContent = '🕵️ جاسوس بود!';
        noteEl.textContent = 'حالا نوبت حدس‌زدن کلمه رمز است...';
    } else {
        icon.textContent = '😇';
        badge.className = 'role-badge role-citizen';
        badge.textContent = '😇 شهروند بی‌گناه بود!';
        noteEl.textContent = note || 'اخراج اشتباه بود!';
    }

    playCardFlip();
    dispatch({type: 'OPEN_MODAL', payload: 'elimination-reveal'});

    const btnContinue = document.getElementById('btn-elim-continue');
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(elimRevealTimeoutId);
        btnContinue.onclick = null;
        dispatch({type: 'CLOSE_MODAL', payload: 'elimination-reveal'});
        onDone();
    };
    btnContinue.onclick = finish;
    elimRevealTimeoutId = setTimeout(finish, 3800);
}

// --- Vote-tie wheel -----------------------------------------------------
// When two (or more) suspects end up with the exact same vote count, the
// winner is still decided by a single fair crypto-random pick (same as
// before) — but now that pick is REVEALED with a spinning wheel instead
// of a silent, invisible dice roll.
function polarPoint(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function pieSlicePath(cx, cy, r, a1, a2) {
    const p1 = polarPoint(cx, cy, r, a1);
    const p2 = polarPoint(cx, cy, r, a2);
    const largeArc = (a2 - a1) > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
}

function truncateWheelName(name, segCount) {
    const maxLen = segCount <= 2 ? 12 : (segCount <= 4 ? 9 : 6);
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 1) + '…';
}

const WHEEL_COLORS = ['#f43f5e', '#06b6d4', '#f59e0b', '#a855f7', '#10b981', '#3b82f6', '#ec4899', '#84cc16'];

function spinWheel(names, winnerIndex, onDone) {
    const n = names.length;
    const segAngle = 360 / n;
    const segGroup = document.getElementById('wheel-segments');
    segGroup.innerHTML = '';

    for (let i = 0; i < n; i++) {
        const a1 = i * segAngle, a2 = (i + 1) * segAngle;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pieSlicePath(150, 150, 140, a1, a2));
        path.setAttribute('fill', WHEEL_COLORS[i % WHEEL_COLORS.length]);
        path.setAttribute('fill-opacity', '0.32');
        path.setAttribute('stroke', 'rgba(255,255,255,0.4)');
        path.setAttribute('stroke-width', '1.5');
        segGroup.appendChild(path);

        const mid = a1 + segAngle / 2;
        const pt = polarPoint(150, 150, n <= 2 ? 92 : 102, mid);
        let rot = mid;
        if (rot > 90 && rot < 270) rot += 180; // keep text upright, never upside-down
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(pt.x));
        text.setAttribute('y', String(pt.y));
        text.setAttribute('transform', `rotate(${rot}, ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('class', 'wheel-label');
        text.textContent = truncateWheelName(names[i], n);
        segGroup.appendChild(text);
    }

    const needle = document.getElementById('wheel-needle');
    needle.style.transition = 'none';
    needle.style.transform = 'rotate(0deg)';
    needle.getBoundingClientRect();

    const targetMid = winnerIndex * segAngle + segAngle / 2;
    const extraSpins = 4 + Math.floor(Math.random() * 2); // a few full turns for suspense
    const finalDeg = extraSpins * 360 + targetMid;

    let doneCalled = false;
    const finishSpin = () => {
        if (doneCalled) return;
        doneCalled = true;
        needle.removeEventListener('transitionend', finishSpin);
        onDone();
    };
    needle.addEventListener('transitionend', finishSpin);
    // Fallback in case transitionend doesn't fire (e.g. element hidden mid-transition)
    setTimeout(finishSpin, 4200);

    requestAnimationFrame(() => {
        needle.style.transition = 'transform 3.4s cubic-bezier(0.22, 0.61, 0.18, 1)';
        needle.style.transform = `rotate(${finalDeg}deg)`;
    });
}

let tieAnnounceTimeoutId = null;

export function runTieBreakerWheel(candidateIds, onResolved) {
    const names = candidateIds.map(id => gameState.players.find(p => p.id === id)?.name || '؟');
    const winnerIndex = getRandomCryptoInt(candidateIds.length);
    const winnerId = candidateIds[winnerIndex];

    document.getElementById('tie-announce-names').innerHTML = `رای‌های ${names.map(n => `«${escapeHtml(n)}»`).join(' و ')} مساوی شد`;
    document.getElementById('tie-announce-stage').classList.remove('hidden');
    document.getElementById('tie-wheel-stage').classList.add('hidden');
    document.getElementById('tie-wheel-result').textContent = '';

    playCardFlip();
    dispatch({type: 'OPEN_MODAL', payload: 'tie-breaker-modal'});

    const btnContinue = document.getElementById('btn-tie-continue');
    let advanced = false;
    const goToWheel = () => {
        if (advanced) return;
        advanced = true;
        clearTimeout(tieAnnounceTimeoutId);
        btnContinue.onclick = null;
        document.getElementById('tie-announce-stage').classList.add('hidden');
        document.getElementById('tie-wheel-stage').classList.remove('hidden');
        spinWheel(names, winnerIndex, () => {
            document.getElementById('tie-wheel-result').textContent = `🎯 «${names[winnerIndex]}» انتخاب شد!`;
            setTimeout(() => {
                dispatch({type: 'CLOSE_MODAL', payload: 'tie-breaker-modal'});
                onResolved(winnerId);
            }, 1600);
        });
    };
    btnContinue.onclick = goToWheel;
    tieAnnounceTimeoutId = setTimeout(goToWheel, 3800);
}
