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
const { keepOneDifficultyChecked, validateAndSaveSettings } = await import('../../js/ui/setup.js');
const { t } = await import('../../js/i18n/index.js');
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

/** The three difficulty chips as the form has them: `checked` is the levels that are ticked. */
function difficultyChips(checked) {
    return ['easy', 'medium', 'hard'].map((level) => Object.assign(env.input(level), { checked: checked.includes(level) }));
}

/** Stub both ways the code looks at the chips: all of them, and only the ticked ones (in the order given). */
function stubDifficultyChips(checked) {
    const chips = difficultyChips(['easy', 'medium', 'hard']);
    for (const chip of chips) chip.checked = checked.includes(chip.value);
    env.stubQuery('input[name="setup-diff"]', chips);
    env.stubQuery('input[name="setup-diff"]:checked', checked.map((level) => chips.find((chip) => chip.value === level)));
    return chips;
}

/** A valid 4-player form with every toggle off, except the ones named in `on`, and the levels in `levels` ticked. */
function fillForm(on = [], levels = ['easy', 'medium', 'hard']) {
    const values = {
        'setup-players-count': '4',
        'setup-spies-count': '1',
        'setup-timer': '4',
        'setup-max-votes': '2',
        'setup-reveal-mode': 'tap'
    };
    for (const [id, value] of Object.entries(values)) env.el(id).value = value;
    for (const id of TOGGLES) env.el(id).checked = on.includes(id);
    stubDifficultyChips(levels);
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

describe('validateAndSaveSettings: the difficulty chips', () => {
    it('saves the ticked levels as an array, in the order easy, medium, hard', () => {
        for (const levels of [['easy', 'medium', 'hard'], ['easy'], ['medium'], ['hard'], ['easy', 'medium'], ['easy', 'hard'], ['medium', 'hard']]) {
            fillForm([], levels);
            assert.equal(validateAndSaveSettings(), true);
            assert.deepEqual(gameState.settings.diff, levels, levels.join('+'));
        }
    });

    it('keeps that order whatever order the browser lists the ticked chips in', () => {
        fillForm();
        stubDifficultyChips(['hard', 'easy']);
        assert.equal(validateAndSaveSettings(), true);
        assert.deepEqual(gameState.settings.diff, ['easy', 'hard']);
    });

    it('saves a new array each time, not one that the next form reads would change', () => {
        fillForm([], ['medium', 'hard']);
        validateAndSaveSettings();
        const first = gameState.settings.diff;
        fillForm([], ['easy']);
        validateAndSaveSettings();
        assert.deepEqual(first, ['medium', 'hard']);
        assert.deepEqual(gameState.settings.diff, ['easy']);
    });

    it('with no chip ticked (the page never lets that happen) saves all three levels and ticks the chips again', () => {
        fillForm([], []);
        const chips = stubDifficultyChips([]);
        assert.ok(chips.every((chip) => !chip.checked));
        assert.equal(validateAndSaveSettings(), true);
        assert.deepEqual(gameState.settings.diff, ['easy', 'medium', 'hard']);
        assert.ok(chips.every((chip) => chip.checked), 'the chips show what was saved');
    });

    it('does not touch the other settings: the categories and the hints are read as before', () => {
        fillForm(['toggle-fool'], ['hard']);
        validateAndSaveSettings();
        assert.deepEqual(gameState.settings.cats, ['places']);
        assert.deepEqual(gameState.settings.hints, ['related_word']);
        assert.equal(gameState.settings.fool, true);
        assert.deepEqual(gameState.settings.diff, ['hard']);
    });
});

describe('keepOneDifficultyChecked: the last chip stays ticked', () => {
    it('a change that leaves a chip ticked is kept, with no message', () => {
        const chips = stubDifficultyChips(['medium', 'hard']);
        env.el('toast-container');
        chips[0].checked = false; // easy was ticked off, medium and hard remain
        assert.equal(keepOneDifficultyChecked(chips[0]), true);
        assert.deepEqual(chips.map((chip) => chip.checked), [false, true, true]);
        assert.deepEqual(env.toasts(), []);
    });

    it('unticking one of two leaves one, and that one is then the last', () => {
        const chips = stubDifficultyChips(['easy', 'hard']);
        env.el('toast-container');
        chips[0].checked = false;
        assert.equal(keepOneDifficultyChecked(chips[0]), true);
        assert.deepEqual(chips.map((chip) => chip.checked), [false, false, true]);

        chips[2].checked = false; // the last one
        assert.equal(keepOneDifficultyChecked(chips[2]), false);
        assert.deepEqual(chips.map((chip) => chip.checked), [false, false, true], 'the last chip is ticked again');
    });

    it('says why in the active language, once per refused tap', () => {
        const chips = stubDifficultyChips(['medium']);
        env.el('toast-container');
        chips[1].checked = false;
        assert.equal(keepOneDifficultyChecked(chips[1]), false);
        assert.deepEqual(env.toasts(), [t('setup.difficulty.keepOne')]);
        assert.ok(t('setup.difficulty.keepOne') !== 'setup.difficulty.keepOne', 'the text exists');
    });
});
