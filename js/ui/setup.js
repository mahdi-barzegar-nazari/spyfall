/**
 * Setup screen: settings validation, limit hints, name inputs, category chips.
 */

import { RULES, getMaxSpiesAllowed } from '../core/config.js';
import { gameState } from '../core/state.js';
import { loadSavedNames, saveCurrentNames } from '../core/storage.js';
import { flagFieldError, pulseInvalidField, showToast } from './feedback.js';
import { generateId } from '../utils/random.js';
import { normalizeWord, toLatinDigits, toPersianDigits } from '../utils/text.js';

export function validateAndSaveSettings() {
    let c = parseInt(toLatinDigits(document.getElementById('setup-players-count').value), 10);
    let s = parseInt(toLatinDigits(document.getElementById('setup-spies-count').value), 10);
    let t = parseInt(toLatinDigits(document.getElementById('setup-timer').value), 10);
    let isVoteLimitEnabled = document.getElementById('toggle-limit').checked;
    let maxV = parseInt(toLatinDigits(document.getElementById('setup-max-votes').value), 10);
    let isFool = document.getElementById('toggle-fool').checked;
    let isDetective = document.getElementById('toggle-detective').checked;

    if (isNaN(c) || c < RULES.players.min || c > RULES.players.max) {
        flagFieldError('setup-players-count', `تعداد بازیکنان باید بین ${toPersianDigits(RULES.players.min)} تا ${toPersianDigits(RULES.players.max)} نفر باشد!`);
        return false;
    }

    const maxSpiesAllowed = getMaxSpiesAllowed(c);
    if (isNaN(s) || s < RULES.spies.min || s > maxSpiesAllowed) {
        flagFieldError('setup-spies-count', `با ${toPersianDigits(c)} بازیکن، حداکثر ${toPersianDigits(maxSpiesAllowed)} جاسوس مجاز است (جاسوس‌ها باید کمتر از نصف بازیکنان باشند)!`);
        return false;
    }

    if (isNaN(t) || t < RULES.timerMinutes.min || t > RULES.timerMinutes.max) {
        flagFieldError('setup-timer', `زمان گفتگو باید بین ${toPersianDigits(RULES.timerMinutes.min)} تا ${toPersianDigits(RULES.timerMinutes.max)} دقیقه باشد!`);
        return false;
    }

    // Only enforce the range when the toggle is actually on — the field
    // is hidden and functionally unused otherwise, so a stale/empty
    // value shouldn't block starting the match.
    if (isVoteLimitEnabled && (isNaN(maxV) || maxV < RULES.emergencyVotes.min || maxV > RULES.emergencyVotes.max)) {
        flagFieldError('setup-max-votes', `سقف زنگ اضطراری باید بین ${toPersianDigits(RULES.emergencyVotes.min)} تا ${toPersianDigits(RULES.emergencyVotes.max)} بار باشد!`);
        return false;
    }
    if (!isVoteLimitEnabled || isNaN(maxV)) maxV = 2;

    let totalSpecialRoles = s + (isFool ? 1 : 0) + (isDetective ? 1 : 0);
    if (c < totalSpecialRoles) {
        flagFieldError('setup-spies-count', `تعداد کل بازیکنان (${toPersianDigits(c)}) کمتر از مجموع نقش‌های انتخابی (${toPersianDigits(totalSpecialRoles)}) است!`);
        return false;
    }

    let selectedCats = Array.from(document.querySelectorAll('input[name="setup-cat"]:checked')).map(el => el.value);
    if (selectedCats.length === 0) {
        selectedCats = ['places', 'jobs', 'foods', 'objects', 'vehicles', 'animals', 'sports', 'events'];
        document.querySelectorAll('input[name="setup-cat"]').forEach(el => {
            if (el.value !== 'custom') el.checked = true;
        });
    }

    let selectedHints = Array.from(document.querySelectorAll('input[name="setup-hint"]:checked')).map(el => el.value);
    if (selectedHints.length === 0) {
        selectedHints = ['related_word'];
        const defHint = document.querySelector('input[name="setup-hint"][value="related_word"]');
        if (defHint) defHint.checked = true;
    }

    gameState.settings = {
        playersCount: c, spiesCount: s, timerMin: t,
        cats: selectedCats,
        diff: document.getElementById('setup-difficulty').value,
        revealHold: document.getElementById('setup-reveal-mode').value === 'hold',
        hints: selectedHints,
        fool: isFool,
        detective: isDetective,
        knownSpies: document.getElementById('toggle-known').checked,
        director: document.getElementById('toggle-director').checked,
        oneword: document.getElementById('toggle-oneword').checked,
        quests: document.getElementById('toggle-quests').checked,
        wager: document.getElementById('toggle-wager').checked,
        sudden: document.getElementById('toggle-sudden').checked,
        voteLimitEnabled: document.getElementById('toggle-limit').checked,
        maxVotes: maxV,
        roleRevealConfirm: document.getElementById('toggle-role-reveal-confirm').checked,
        voteConfirm: document.getElementById('toggle-vote-confirm').checked,
        quickVoting: document.getElementById('toggle-quick-voting').checked,
        detectiveUsed: false
    };

    let inputs = document.querySelectorAll('#name-inputs-container input'), names = [];
    for (let i = 0; i < inputs.length; i++) {
        let n = normalizeWord(inputs[i].value);
        if (!n) { showToast(`نام بازیکن ${i+1} خالی است!`); pulseInvalidField(inputs[i]); return false; }
        if (names.includes(n)) { showToast(`اسامی بازیکنان نباید تکراری باشند!`); pulseInvalidField(inputs[i]); return false; }
        names.push(n);
    }
    saveCurrentNames(Array.from(inputs).map(x => x.value));
    return true;
}

// Keeps the small hint text under players/spies/timer/max-votes fields
// in sync with the actual RULES so the limits are visible before an
// error ever needs to fire.
export function updateSetupLimitHints() {
    const playersHint = document.getElementById('players-limit-hint');
    if (playersHint) playersHint.textContent = `بین ${toPersianDigits(RULES.players.min)} تا ${toPersianDigits(RULES.players.max)} نفر`;

    const timerHint = document.getElementById('timer-limit-hint');
    if (timerHint) timerHint.textContent = `بین ${toPersianDigits(RULES.timerMinutes.min)} تا ${toPersianDigits(RULES.timerMinutes.max)} دقیقه`;

    const maxVotesHint = document.getElementById('maxvotes-limit-hint');
    if (maxVotesHint) maxVotesHint.textContent = `بین ${toPersianDigits(RULES.emergencyVotes.min)} تا ${toPersianDigits(RULES.emergencyVotes.max)} بار`;

    const spiesHint = document.getElementById('spies-limit-hint');
    if (spiesHint) {
        let c = parseInt(toLatinDigits(document.getElementById('setup-players-count').value), 10);
        if (isNaN(c)) c = RULES.players.min;
        const maxSpies = getMaxSpiesAllowed(c);
        spiesHint.textContent = `حداکثر مجاز با ${toPersianDigits(c)} بازیکن: ${toPersianDigits(maxSpies)} جاسوس`;
    }
}

export function renderNameInputs(forceDefault = false) {
    let countInput = document.getElementById('setup-players-count');
    let count = parseInt(toLatinDigits(countInput.value), 10) || 4;
    if (count < RULES.players.min) count = RULES.players.min;
    if (count > RULES.players.max) count = RULES.players.max;
    countInput.value = count;

    let container = document.getElementById('name-inputs-container');
    let currentInputs = Array.from(container.querySelectorAll('input')).map(inp => ({
        name: inp.value.trim(),
        pId: inp.dataset.playerId
    }));
    let saved = loadSavedNames();
    container.innerHTML = '';

    for (let i = 1; i <= count; i++) {
        let input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-control mb-6';
        input.placeholder = `نام بازیکن ${i}`;
        input.setAttribute('aria-label', `نام بازیکن شماره ${i}`);

        if (forceDefault) {
            input.value = `بازیکن ${i}`;
            input.dataset.playerId = generateId();
        } else if (currentInputs[i - 1] && currentInputs[i - 1].name) {
            input.value = currentInputs[i - 1].name;
            input.dataset.playerId = currentInputs[i - 1].pId || generateId();
        } else if (saved[i - 1]) {
            input.value = saved[i - 1];
            input.dataset.playerId = generateId();
        } else {
            input.value = `بازیکن ${i}`;
            input.dataset.playerId = generateId();
        }
        container.appendChild(input);
    }
}

export function syncCheckboxChipVisuals(containerId, chipClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const wrap = cb.closest(`.${chipClass}`);
        if (wrap) wrap.classList.toggle('is-checked', cb.checked);
    });
}
