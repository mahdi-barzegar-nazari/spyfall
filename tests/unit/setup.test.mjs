/**
 * Tests for the part of ui/setup.js that turns the setup form into gameState.settings.
 * The form is faked: each control is an element with `value` / `checked`, as the browser would give.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { gameState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { validateAndSaveSettings } = await import('../../js/ui/setup.js');
useGameHarness(env);
after(() => env.uninstall());

const TOGGLES = [
    'toggle-limit',
    'toggle-fool',
    'toggle-detective',
    'toggle-known',
    'toggle-director',
    'toggle-oneword',
    'toggle-quests',
    'toggle-wager',
    'toggle-sudden',
    'toggle-role-reveal-confirm',
    'toggle-vote-confirm',
    'toggle-quick-voting',
    'toggle-last-chance'
];

/** A valid 4-player form with every toggle off, except the ones named in `on`. */
function fillForm(on = []) {
    const values = {
        'setup-players-count': '4',
        'setup-spies-count': '1',
        'setup-timer': '4',
        'setup-max-votes': '2',
        'setup-difficulty': 'all',
        'setup-reveal-mode': 'tap'
    };
    for (const [id, value] of Object.entries(values)) env.el(id).value = value;
    for (const id of TOGGLES) env.el(id).checked = on.includes(id);
    env.stubQuery('input[name="setup-cat"]:checked', [{ value: 'places' }]);
    env.stubQuery('input[name="setup-hint"]:checked', [{ value: 'related_word' }]);
    env.stubQuery('#name-inputs-container input', ['Ali', 'Bita', 'Cyrus', 'Dara'].map((n) => env.input(n)));
}

describe('validateAndSaveSettings: the spy\'s last-chance toggle', () => {
    it('saves spyLastChance: true when #toggle-last-chance is on', () => {
        fillForm(['toggle-last-chance']);
        assert.equal(validateAndSaveSettings(), true);
        assert.equal(gameState.settings.spyLastChance, true);
    });

    it('saves spyLastChance: false when #toggle-last-chance is off', () => {
        fillForm([]);
        assert.equal(validateAndSaveSettings(), true);
        assert.equal(gameState.settings.spyLastChance, false);
    });

    it('reads its own toggle, not a neighbour (sudden death), and leaves the neighbours alone', () => {
        fillForm(['toggle-sudden']);
        validateAndSaveSettings();
        assert.equal(gameState.settings.spyLastChance, false);
        assert.equal(gameState.settings.sudden, true);

        fillForm(['toggle-last-chance']);
        validateAndSaveSettings();
        assert.equal(gameState.settings.spyLastChance, true);
        assert.equal(gameState.settings.sudden, false);
    });
});
