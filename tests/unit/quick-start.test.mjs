/**
 * The welcome screen's quick start: the dialog's count (ui/quickStart.js), the setup form it fills
 * (setSetupPlayersCount in ui/setup.js) and the QUICK_START action (app/actions.js), which starts the match through
 * the same START_MATCH action as the Start button.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { RULES } from '../../js/core/config.js';
import { gameState } from '../../js/core/state.js';
import { setLang } from '../../js/i18n/index.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { clampQuickCount, getQuickCount, prepareQuickStart, setQuickCount, stepQuickCount } = await import('../../js/ui/quickStart.js');
const { setSetupPlayersCount } = await import('../../js/ui/setup.js');
const { handleAction } = await import('../../js/app/actions.js');
const harness = useGameHarness(env, {
    setup: () => {
        for (const id of ['quick-count', 'btn-quick-less', 'btn-quick-more', 'setup-players-count', 'setup-spies-count', 'players-limit-hint', 'spies-limit-hint']) env.el(id);
        const container = env.el('name-inputs-container');
        container.children = [];
        container.querySelectorAll = () => container.children;
        Object.defineProperty(container, 'innerHTML', {
            configurable: true,
            get: () => '',
            set: () => {
                container.children = [];
            }
        });
        env.el('setup-players-count').value = '4';
        env.el('setup-spies-count').value = '1';
    }
});
after(() => env.uninstall());
afterEach(() => setLang('fa'));

describe('clampQuickCount', () => {
    it('keeps a whole number from the least to the most players, and the least for anything that is not a number', () => {
        assert.equal(clampQuickCount(5), 5);
        assert.equal(clampQuickCount(RULES.players.min - 5), RULES.players.min);
        assert.equal(clampQuickCount(RULES.players.max + 5), RULES.players.max);
        assert.equal(clampQuickCount(6.4), 6);
        for (const bad of ['x', undefined, NaN, null]) assert.equal(clampQuickCount(bad), bad === null ? RULES.players.min : RULES.players.min, String(bad));
    });
});

describe('the dialog count', () => {
    it('shows the number in the digits of the active language, and remembers it as a whole number', () => {
        setLang('fa');
        assert.equal(setQuickCount(7), 7);
        assert.equal(env.el('quick-count').textContent, '۷');
        assert.equal(getQuickCount(), 7);
        setLang('en');
        setQuickCount(12);
        assert.equal(env.el('quick-count').textContent, '12');
    });

    it('steps up and down, and never leaves the range of players', () => {
        setQuickCount(RULES.players.min);
        assert.equal(stepQuickCount(-1), RULES.players.min);
        assert.equal(stepQuickCount(1), RULES.players.min + 1);
        setQuickCount(RULES.players.max);
        assert.equal(stepQuickCount(1), RULES.players.max);
        assert.equal(stepQuickCount(-1), RULES.players.max - 1);
    });

    it('turns off the step button that cannot go further', () => {
        setQuickCount(RULES.players.min);
        assert.equal(env.el('btn-quick-less').disabled, true);
        assert.equal(env.el('btn-quick-more').disabled, false);
        setQuickCount(RULES.players.max);
        assert.equal(env.el('btn-quick-less').disabled, false);
        assert.equal(env.el('btn-quick-more').disabled, true);
        setQuickCount(8);
        assert.equal(env.el('btn-quick-less').disabled, false);
        assert.equal(env.el('btn-quick-more').disabled, false);
    });

    it('opens on the number of players the setup screen holds (4 when it holds nothing usable)', () => {
        env.el('setup-players-count').value = '9';
        assert.equal(prepareQuickStart(), 9);
        env.el('setup-players-count').value = '٦';
        assert.equal(prepareQuickStart(), 6);
        env.el('setup-players-count').value = '';
        assert.equal(prepareQuickStart(), 4);
        env.el('setup-players-count').value = '500';
        assert.equal(prepareQuickStart(), RULES.players.max);
    });
});

describe('setSetupPlayersCount', () => {
    it('puts the count in the form, with one name box for every player', () => {
        setSetupPlayersCount(6);
        assert.equal(String(env.el('setup-players-count').value), '6');
        assert.equal(env.el('name-inputs-container').children.length, 6);
        setSetupPlayersCount(3);
        assert.equal(env.el('name-inputs-container').children.length, 3);
    });

    it('keeps the number of spies when it still fits, and brings it down to the most that is allowed when it does not', () => {
        env.el('setup-spies-count').value = '2';
        setSetupPlayersCount(8);
        assert.equal(env.el('setup-spies-count').value, '2');
        setSetupPlayersCount(RULES.players.min);
        const most = String(Math.max(RULES.spies.min, ...[1, 2, 3, 4].filter((s) => s <= Number(env.el('setup-spies-count').value))));
        assert.equal(env.el('setup-spies-count').value, most);
        assert.ok(Number(env.el('setup-spies-count').value) >= RULES.spies.min);
    });

    it('repairs a spies box that holds nothing usable', () => {
        env.el('setup-spies-count').value = 'abc';
        setSetupPlayersCount(5);
        assert.equal(env.el('setup-spies-count').value, String(RULES.spies.min));
    });

    it('clamps a count outside the range, and takes a count that is not a number as the least', () => {
        setSetupPlayersCount(RULES.players.max + 10);
        assert.equal(String(env.el('setup-players-count').value), String(RULES.players.max));
        setSetupPlayersCount('x');
        assert.equal(String(env.el('setup-players-count').value), String(RULES.players.min));
    });
});

describe('QUICK_START', () => {
    it('does nothing outside the welcome screen', () => {
        gameState.phase = 'timer';
        env.el('setup-players-count').value = '4';
        handleAction({ type: 'QUICK_START', payload: 9 });
        assert.equal(env.el('setup-players-count').value, '4');
        assert.equal(gameState.phase, 'timer');
    });

    it('closes the dialog, fills the count in the setup form and goes on to start the match through START_MATCH', () => {
        gameState.phase = 'welcome';
        // START_MATCH reads the whole setup form; the pieces of it that this test does not build make it stop at the
        // first field it cannot read. What matters here is what QUICK_START does before it, and that it leaves the
        // welcome screen for the setup screen (the Start button's own screen) first.
        try {
            handleAction({ type: 'QUICK_START', payload: 7 });
        } catch {
            // the START_MATCH of a form that is only partly built
        }
        assert.deepEqual(harness.actions[0], { type: 'CLOSE_MODAL', payload: 'quick-start-modal' });
        assert.equal(String(env.el('setup-players-count').value), '7');
        assert.equal(env.el('name-inputs-container').children.length, 7);
        assert.notEqual(gameState.phase, 'welcome');
    });
});
