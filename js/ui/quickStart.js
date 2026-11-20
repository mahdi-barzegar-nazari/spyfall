/**
 * The welcome screen's "Quick start": a small dialog that asks only how many people play, then starts a match with
 * the settings the setup screen already holds (the last match's, or the defaults the first time) and the names in its
 * boxes (the saved ones, or "Player 1, 2, ..."). It is a way past the setup screen, not a second setup: the match is
 * started by the same START_MATCH action, on the same validation, so a setup that cannot start (say, only custom
 * words chosen and none written) shows the setup screen with the field that is wrong, exactly as the Start button
 * would.
 *
 * The count lives in the dialog's `<output>` (`data-count`); nothing here is saved.
 */

import { RULES } from '../core/config.js';
import { formatNumber } from '../i18n/index.js';
import { toLatinDigits } from '../utils/text.js';

const OUTPUT_ID = 'quick-count';

/** `value` as a whole number from RULES.players.min to RULES.players.max (the minimum for anything that is not a number). */
export function clampQuickCount(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return RULES.players.min;
    return Math.max(RULES.players.min, Math.min(RULES.players.max, n));
}

/** The count shown in the dialog. */
export function getQuickCount() {
    const out = document.getElementById(OUTPUT_ID);
    return clampQuickCount(out?.dataset.count);
}

/** Show `value` (clamped) in the dialog, in the digits of the active language, and keep the two step buttons honest at the ends. */
export function setQuickCount(value) {
    const n = clampQuickCount(value);
    const out = document.getElementById(OUTPUT_ID);
    out.dataset.count = String(n);
    out.textContent = formatNumber(n);
    document.getElementById('btn-quick-less').disabled = n <= RULES.players.min;
    document.getElementById('btn-quick-more').disabled = n >= RULES.players.max;
    return n;
}

/** Fill the dialog before it opens: the number of players the setup screen holds now (4 the first time). */
export function prepareQuickStart() {
    const field = parseInt(toLatinDigits(document.getElementById('setup-players-count').value), 10);
    return setQuickCount(Number.isNaN(field) ? 4 : field);
}

/** One step up or down. */
export function stepQuickCount(delta) {
    return setQuickCount(getQuickCount() + delta);
}
