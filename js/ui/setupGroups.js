/**
 * The collapsible groups of the setup screen and the small "N on" badge on each header.
 *
 * Under the five core fields (players, spies, categories, difficulty, discussion timer) the options sit in four
 * native `<details>` groups (index.html, `#setup-group-<id>`). Opening and closing needs no code at all: the
 * browser does it, with the keyboard and with a screen reader. The groups start closed, and whether one is open
 * is only the state of its `<details>` element for as long as the page lives: nothing about it is stored, and it
 * is not part of the saved setup or of a match. This module only writes the badges.
 *
 * What counts as "on" (the badge of a group is the number of its controls that are on):
 *  - a switch is on when it is ticked;
 *  - a hint chip (the spy's hint types) is on when it is ticked, each chip counting as one;
 *  - the card-reveal select is on when it holds "hold" (press and hold), the one value that adds something to the
 *    plain tap, and off when it holds "click".
 * It is the plain state of the controls, not a comparison with the defaults, so it reads the way the badge is
 * worded ("2 on") and it never says "on" about something that was switched off. At the defaults the badges
 * therefore read 1, 0, 1, 1: the related-word hint, the spy's last chance, and the role-reveal confirmation.
 *
 * Nothing here changes a setting: it reads the form and writes the text of the badges. The controls keep their
 * ids and names, and the setup code finds them by those, not through the groups.
 *
 * Imports only the translator, so any module of the setup screen (and `feedback.js`) can use it without a cycle.
 */

import { formatNumber, t } from '../i18n/index.js';

/**
 * The groups, in screen order, and the controls each one counts. A control is `{ id }` (a switch, by the id of its
 * checkbox), `{ chips: name }` (every checkbox with that name) or `{ select: id, on: value }`. This table is the
 * single place that says which control belongs to which group's badge; index.html puts the same controls in the
 * same groups, and tests/unit/setup-groups.test.mjs checks that the two agree.
 */
export const SETUP_GROUPS = [
    { id: 'roles', controls: [{ chips: 'setup-hint' }, { id: 'toggle-detective' }, { id: 'toggle-known' }, { id: 'toggle-fool' }] },
    { id: 'discussion', controls: [{ id: 'toggle-director' }, { id: 'toggle-oneword' }, { id: 'toggle-quests' }, { id: 'toggle-limit' }] },
    { id: 'stakes', controls: [{ id: 'toggle-wager' }, { id: 'toggle-sudden' }, { id: 'toggle-last-chance' }] },
    { id: 'speed', controls: [{ select: 'setup-reveal-mode', on: 'hold' }, { id: 'toggle-role-reveal-confirm' }, { id: 'toggle-vote-confirm' }, { id: 'toggle-quick-voting' }] }
];

/** How the controls are read: the real form. A test can pass its own probe to `countOn`. */
const formProbe = {
    switchOn: (id) => {
        const control = document.getElementById(id);
        return Boolean(control && control.checked);
    },
    chipsOn: (name) => document.querySelectorAll(`input[name="${name}"]:checked`).length,
    selectIs: (id, value) => {
        const control = document.getElementById(id);
        return Boolean(control && control.value === value);
    }
};

/** How many of the controls of `group` are on, by the rule at the top of this file. */
export function countOn(group, probe = formProbe) {
    let count = 0;
    for (const control of group.controls) {
        if (control.chips) count += probe.chipsOn(control.chips);
        else if (control.select) count += probe.selectIs(control.select, control.on) ? 1 : 0;
        else count += probe.switchOn(control.id) ? 1 : 0;
    }
    return count;
}

/**
 * Write the badge of every group from the state of the form, in the active language and its digits. The text
 * is written only when it changed. Call it whenever the form or the language changes by code (a restored
 * setup, a language switch, the start-up); a change the person makes is caught by the `change` listener in
 * `bindings.js`.
 */
export function refreshSetupGroupBadges() {
    for (const group of SETUP_GROUPS) {
        const badge = document.getElementById(`setup-group-${group.id}-badge`);
        if (!badge) continue;
        const count = countOn(group);
        const text = t('setup.group.badge', { n: formatNumber(count) });
        if (badge.textContent !== text) badge.textContent = text;
        if (badge.dataset.count !== String(count)) badge.dataset.count = String(count);
    }
}
