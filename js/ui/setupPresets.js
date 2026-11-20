/**
 * The setup screen's presets (data/presets.js): applying one to the form, and showing which one (if any) the
 * switches are in right now. Only the form is written; nothing is saved until a match starts.
 */

import { MAX_VOTES_CONTROL, PRESET_CONTROLS, SETUP_PRESETS } from '../data/presets.js';
import { t } from '../i18n/index.js';
import { toLatinDigits } from '../utils/text.js';
import { refreshSetupGroupBadges } from './setupGroups.js';

const byId = (id) => document.getElementById(id);

/** The id of the preset the switches are in right now, or null when they match none of them. */
export function activeSetupPreset() {
    const maxVotes = parseInt(toLatinDigits(byId(MAX_VOTES_CONTROL)?.value ?? ''), 10);
    const limitOn = byId(PRESET_CONTROLS.voteLimitEnabled)?.checked === true;
    for (const preset of SETUP_PRESETS) {
        const switchesMatch = Object.entries(PRESET_CONTROLS).every(([key, id]) => byId(id)?.checked === preset.settings[key]);
        if (switchesMatch && (!limitOn || maxVotes === preset.settings.maxVotes)) return preset.id;
    }
    return null;
}

/** Light the chip of the active preset (pressed look and aria-pressed), and write its description, or the general hint, under the chips. */
export function refreshSetupPresets() {
    const active = activeSetupPreset();
    document.querySelectorAll('#setup-presets [data-preset]').forEach((chip) => {
        const on = chip.dataset.preset === active;
        chip.classList[on ? 'add' : 'remove']('active');
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const hint = byId('setup-presets-hint');
    if (hint) hint.textContent = active ? t(`setup.preset.${active}.desc`) : t('setup.presets.hint');
}

/** Set the form to the preset `id`; false (and nothing changed) for an id that is not one. */
export function applySetupPreset(id) {
    const preset = SETUP_PRESETS.find((p) => p.id === id);
    if (!preset) return false;
    for (const [key, controlId] of Object.entries(PRESET_CONTROLS)) {
        const toggle = byId(controlId);
        if (toggle) toggle.checked = preset.settings[key];
    }
    const maxVotes = byId(MAX_VOTES_CONTROL);
    if (maxVotes) maxVotes.value = String(preset.settings.maxVotes);
    // The same thing the switch does when it is tapped: the box of the alarm limit shows while its switch is on.
    const limitBox = byId('vote-limit-box');
    if (limitBox) limitBox.classList[preset.settings.voteLimitEnabled ? 'remove' : 'add']('hidden');
    refreshSetupGroupBadges();
    refreshSetupPresets();
    return true;
}
