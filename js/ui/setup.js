/**
 * Setup screen: settings validation, limit hints, name inputs, category and difficulty chips, and putting the
 * setup of the last match back into the form.
 */

import { RULES, getMaxSpiesAllowed, normalizeDifficulties, sanitizeSetupSettings } from '../core/config.js';
import { isMatchInProgress } from '../core/phase.js';
import { gameState } from '../core/state.js';
import { isDefaultPlayerNameOfOtherLanguage, loadSavedNames, loadSetupSettings, saveCurrentNames, saveSetupSettings } from '../core/storage.js';
import { flagFieldError, pulseInvalidField, showToast } from './feedback.js';
import { formatNumber, t, tn } from '../i18n/index.js';
import { generateId } from '../utils/random.js';
import { normalizeWord, toLatinDigits } from '../utils/text.js';

export function validateAndSaveSettings() {
    let c = parseInt(toLatinDigits(document.getElementById('setup-players-count').value), 10);
    let s = parseInt(toLatinDigits(document.getElementById('setup-spies-count').value), 10);
    let timerMinutes = parseInt(toLatinDigits(document.getElementById('setup-timer').value), 10);
    let isVoteLimitEnabled = document.getElementById('toggle-limit').checked;
    let maxV = parseInt(toLatinDigits(document.getElementById('setup-max-votes').value), 10);
    let isFool = document.getElementById('toggle-fool').checked;
    let isDetective = document.getElementById('toggle-detective').checked;

    if (isNaN(c) || c < RULES.players.min || c > RULES.players.max) {
        flagFieldError('setup-players-count', t('setup.error.players', { min: formatNumber(RULES.players.min), max: formatNumber(RULES.players.max) }));
        return false;
    }

    const maxSpiesAllowed = getMaxSpiesAllowed(c);
    if (isNaN(s) || s < RULES.spies.min || s > maxSpiesAllowed) {
        flagFieldError('setup-spies-count', tn('setup.error.spies', c, { max: formatNumber(maxSpiesAllowed) }));
        return false;
    }

    if (isNaN(timerMinutes) || timerMinutes < RULES.timerMinutes.min || timerMinutes > RULES.timerMinutes.max) {
        flagFieldError('setup-timer', t('setup.error.timer', { min: formatNumber(RULES.timerMinutes.min), max: formatNumber(RULES.timerMinutes.max) }));
        return false;
    }

    // Only enforce the range when the toggle is actually on — the field
    // is hidden and functionally unused otherwise, so a stale/empty
    // value shouldn't block starting the match.
    if (isVoteLimitEnabled && (isNaN(maxV) || maxV < RULES.emergencyVotes.min || maxV > RULES.emergencyVotes.max)) {
        flagFieldError('setup-max-votes', t('setup.error.maxVotes', { min: formatNumber(RULES.emergencyVotes.min), max: formatNumber(RULES.emergencyVotes.max) }));
        return false;
    }
    if (!isVoteLimitEnabled || isNaN(maxV)) maxV = 2;

    let totalSpecialRoles = s + (isFool ? 1 : 0) + (isDetective ? 1 : 0);
    if (c < totalSpecialRoles) {
        flagFieldError('setup-spies-count', t('setup.error.roles', { players: formatNumber(c), roles: formatNumber(totalSpecialRoles) }));
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

    // The chips never let the last one go (keepOneDifficultyChecked), so this is the same safety net as for the
    // categories above: nothing chosen reads as every level, and the chips are put back to say so.
    let selectedDiffs = Array.from(document.querySelectorAll('input[name="setup-diff"]:checked')).map(el => el.value);
    if (selectedDiffs.length === 0) {
        document.querySelectorAll('input[name="setup-diff"]').forEach(el => { el.checked = true; });
    }
    selectedDiffs = normalizeDifficulties(selectedDiffs);

    gameState.settings = {
        playersCount: c, spiesCount: s, timerMin: timerMinutes,
        cats: selectedCats,
        diff: selectedDiffs,
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
        spyLastChance: document.getElementById('toggle-last-chance').checked,
        detectiveUsed: false
    };

    let inputs = document.querySelectorAll('#name-inputs-container input'), names = [];
    for (let i = 0; i < inputs.length; i++) {
        let n = normalizeWord(inputs[i].value);
        if (!n) { showToast(t('toast.playerNameEmpty', { n: i + 1 })); pulseInvalidField(inputs[i]); return false; }
        if (names.includes(n)) { showToast(t('toast.playerNamesDuplicate')); pulseInvalidField(inputs[i]); return false; }
        names.push(n);
    }
    saveCurrentNames(Array.from(inputs).map(x => x.value));
    // The match starts: keep its plain options for the next visit (never the names, saved above on their own).
    saveSetupSettings(gameState.settings);
    return true;
}

/** The on/off switches of the form, by the setting each one holds. */
const SETUP_TOGGLE_IDS = {
    fool: 'toggle-fool',
    detective: 'toggle-detective',
    knownSpies: 'toggle-known',
    director: 'toggle-director',
    oneword: 'toggle-oneword',
    quests: 'toggle-quests',
    wager: 'toggle-wager',
    sudden: 'toggle-sudden',
    voteLimitEnabled: 'toggle-limit',
    roleRevealConfirm: 'toggle-role-reveal-confirm',
    voteConfirm: 'toggle-vote-confirm',
    quickVoting: 'toggle-quick-voting',
    spyLastChance: 'toggle-last-chance'
};

/** Tick exactly the chips of `name` whose value is in `values`. */
function tickChips(name, values) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(el => { el.checked = values.includes(el.value); });
}

/**
 * Put `settings` into the setup form: the three number fields, every chip, the card-reveal select and every
 * switch, with the parts of the page that follow them (the pressed look of the chips, the emergency-vote box
 * that only shows while its switch is on). `settings` goes through `sanitizeSetupSettings` first, so a damaged
 * value can never reach the form. Only the form is written: `gameState` is not touched, and neither are the
 * name inputs (`renderNameInputs` follows the player count).
 */
export function applySetupSettingsToForm(settings) {
    const s = sanitizeSetupSettings(settings);
    const field = (id) => document.getElementById(id);

    field('setup-players-count').value = String(s.playersCount);
    field('setup-spies-count').value = String(s.spiesCount);
    field('setup-timer').value = String(s.timerMin);
    field('setup-max-votes').value = String(s.maxVotes);
    field('setup-reveal-mode').value = s.revealHold ? 'hold' : 'click';

    tickChips('setup-cat', s.cats);
    tickChips('setup-diff', s.diff);
    tickChips('setup-hint', s.hints);
    for (const [key, id] of Object.entries(SETUP_TOGGLE_IDS)) {
        const toggle = field(id);
        if (toggle) toggle.checked = s[key];
    }

    // The same thing bindings.js does when the switch is tapped.
    const voteLimitBox = field('vote-limit-box');
    if (voteLimitBox) voteLimitBox.classList[s.voteLimitEnabled ? 'remove' : 'add']('hidden');
    syncCheckboxChipVisuals('category-chips-container', 'chip-item');
    syncCheckboxChipVisuals('difficulty-chips-container', 'chip-item');
    syncCheckboxChipVisuals('hint-chips-container', 'hint-chip');
}

/**
 * Put the setup of the last match that was started back into the form, at start-up and after "new match".
 * Returns true when something was restored.
 *
 * Nothing usable saved (see `loadSetupSettings`) leaves the form exactly as it is, so a person whose storage
 * is blocked keeps what they typed this session. The form is the NEXT match's, and nothing here reads or
 * writes `gameState`, so a match that is running or has been resumed keeps its own settings; while one is
 * running (every phase but welcome and setup) this does not even touch the form.
 */
export function restoreSavedSetup() {
    if (isMatchInProgress()) return false;
    const saved = loadSetupSettings();
    if (!saved) return false;
    applySetupSettingsToForm(saved);
    // The number of name inputs and the spies hint follow the restored player count.
    renderNameInputs();
    updateSetupLimitHints();
    return true;
}

// Keeps the small hint text under players/spies/timer/max-votes fields
// in sync with the actual RULES so the limits are visible before an
// error ever needs to fire.
export function updateSetupLimitHints() {
    const playersHint = document.getElementById('players-limit-hint');
    if (playersHint) playersHint.textContent = t('setup.limit.players', { min: formatNumber(RULES.players.min), max: formatNumber(RULES.players.max) });

    const timerHint = document.getElementById('timer-limit-hint');
    if (timerHint) timerHint.textContent = t('setup.limit.timer', { min: formatNumber(RULES.timerMinutes.min), max: formatNumber(RULES.timerMinutes.max) });

    const maxVotesHint = document.getElementById('maxvotes-limit-hint');
    if (maxVotesHint) maxVotesHint.textContent = t('setup.limit.maxVotes', { min: formatNumber(RULES.emergencyVotes.min), max: formatNumber(RULES.emergencyVotes.max) });

    const spiesHint = document.getElementById('spies-limit-hint');
    if (spiesHint) {
        let c = parseInt(toLatinDigits(document.getElementById('setup-players-count').value), 10);
        if (isNaN(c)) c = RULES.players.min;
        const maxSpies = getMaxSpiesAllowed(c);
        spiesHint.textContent = tn('setup.limit.spies', c, { max: formatNumber(maxSpies) });
    }
}

/**
 * Bring the name inputs in line with the player count. The inputs that already exist are updated IN PLACE: the
 * element, its value and its player id stay, and only the slots that changed are added (at the end) or removed
 * (from the end). This matters on a phone: the count field's `change` event fires when it loses focus, which
 * is the very moment the person taps a name input, so replacing the inputs there would delete the one that
 * was tapped and the tap would focus nothing.
 *
 * `forceDefault` puts the default name (and a new player id) in every slot. `relocalize` is for a language
 * change: an input that still holds the default name of ANOTHER language ("Player 3" after switching to
 * Persian) is given the active language's default (or the saved typed name); it keeps its player id. Names
 * the user typed, and the active language's own defaults, are kept (only surrounding spaces are trimmed, as
 * they always were). The placeholder and the accessible name of every input follow the active language each
 * time.
 */
export function renderNameInputs(forceDefault = false, relocalize = false) {
    let countInput = document.getElementById('setup-players-count');
    let count = parseInt(toLatinDigits(countInput.value), 10) || 4;
    if (count < RULES.players.min) count = RULES.players.min;
    if (count > RULES.players.max) count = RULES.players.max;
    countInput.value = count;

    let container = document.getElementById('name-inputs-container');
    const existing = Array.from(container.querySelectorAll('input'));
    let saved = loadSavedNames();

    // Fewer players: drop the slots at the end. Nothing before them is touched.
    existing.slice(count).forEach(inp => inp.remove());

    for (let i = 1; i <= count; i++) {
        let input = existing[i - 1];
        const isNew = !input;
        if (isNew) {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'input-control name-input mb-6';
        }

        const placeholder = t('setup.player.placeholder', { n: i });
        if (input.placeholder !== placeholder) input.placeholder = placeholder;
        const ariaLabel = t('setup.player.aria', { n: i });
        if (input.getAttribute('aria-label') !== ariaLabel) input.setAttribute('aria-label', ariaLabel);

        const currentName = isNew ? '' : input.value.trim();
        const currentId = isNew ? undefined : input.dataset.playerId;
        // The default of another language is "no name" when the language has just changed; the slot stays
        // the same player, so its id is kept.
        const staleDefault = relocalize && currentName && isDefaultPlayerNameOfOtherLanguage(currentName);

        let nextValue = null;
        let nextId = currentId || generateId();
        if (forceDefault) {
            nextValue = t('setup.player.default', { n: i });
            nextId = generateId();
        } else if (currentName && !staleDefault) {
            // A typed name (or a default of the active language) stays. It is trimmed, as it always was when
            // the inputs were redrawn; an input with nothing to trim is not written at all.
            nextValue = currentName;
        } else if (saved[i - 1]) {
            nextValue = saved[i - 1];
        } else {
            nextValue = t('setup.player.default', { n: i });
        }
        // Only write what changes: setting the value of a focused field moves its caret.
        if (nextValue !== null && input.value !== nextValue) input.value = nextValue;
        if (input.dataset.playerId !== nextId) input.dataset.playerId = nextId;

        if (isNew) container.appendChild(input);
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

/**
 * Called when a difficulty chip changes. At least one level must stay chosen: when the change left none, the
 * chip that was just switched off is switched on again and a short toast says why (a chip that silently
 * refuses a tap looks broken). Returns true when the change was kept.
 */
export function keepOneDifficultyChecked(changed) {
    const boxes = Array.from(document.querySelectorAll('input[name="setup-diff"]'));
    if (boxes.some(b => b.checked)) return true;
    changed.checked = true;
    showToast(t('setup.difficulty.keepOne'));
    return false;
}
