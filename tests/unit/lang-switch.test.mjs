/**
 * The language switch, below the click: the SET_LANG action (app/actions.js), the rule behind it
 * (`isMatchInProgress` in core/phase.js) and the pressed state of the two buttons (`syncLangSwitch` in
 * ui/langSwitch.js). The click handler itself is one line in ui/bindings.js and the real buttons are checked
 * in the browser by tests/e2e/lang-switch.test.mjs.
 *
 * Everything runs on the fake browser of helpers/fakeEnv.mjs, with the real handleAction.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { SAVE_VERSION, gameState, serializeSecrets } from '../../js/core/state.js';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { isMatchInProgress } = await import('../../js/core/phase.js');
const { getLang, onLangChange, setLang } = await import('../../js/i18n/index.js');
const { syncLangSwitch } = await import('../../js/ui/langSwitch.js');
const { VALID_PHASES } = await import('../../js/core/config.js');

useGameHarness(env, {
    setup: () => {
        env.el('recovery-banner');
    }
});
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

const LANG_KEY = 'spy_lang';
const savedLang = () => env.storage.get(LANG_KEY);

/** Put the app in `phase` with a match behind it (players exist from the first role card on). */
function arrange(phase) {
    gameState.phase = phase;
    if (phase !== 'welcome' && phase !== 'setup') gameState.players = makePlayers(4);
}

/** The language changes the app announced while `fn` ran. */
function watchLang(fn) {
    const seen = [];
    const stop = onLangChange((lang) => seen.push(lang));
    try {
        fn();
    } finally {
        stop();
    }
    return seen;
}

const OUTSIDE_A_MATCH = ['welcome', 'setup'];
const INSIDE_A_MATCH = [...VALID_PHASES].filter((phase) => !OUTSIDE_A_MATCH.includes(phase));

describe('isMatchInProgress', () => {
    it('is false on the welcome screen and the setup form, true in every phase of a match', () => {
        for (const phase of OUTSIDE_A_MATCH) {
            gameState.phase = phase;
            assert.equal(isMatchInProgress(), false, phase);
        }
        for (const phase of INSIDE_A_MATCH) {
            gameState.phase = phase;
            assert.equal(isMatchInProgress(), true, phase);
        }
    });

    it('covers every phase the game knows (a new phase has to be placed on purpose)', () => {
        assert.deepEqual(INSIDE_A_MATCH, ['reveal', 'timer', 'vote', 'wager', 'guess', 'result', 'leaderboard']);
    });

    it('counts a phase it does not know as a match in progress, so a damaged state can never unlock the switch', () => {
        for (const phase of ['bogus', '', undefined, null, 42, ['welcome']]) {
            gameState.phase = phase;
            assert.equal(isMatchInProgress(), true, String(phase));
        }
    });
});

describe('SET_LANG: accepted', () => {
    it('switches to English on the welcome screen, saves the choice in spy_lang and tells the listeners once', () => {
        arrange('welcome');
        const seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'en' }));
        assert.equal(getLang(), 'en');
        assert.equal(savedLang(), 'en');
        assert.deepEqual(seen, ['en']);
    });

    it('switches back to Persian, and the saved choice follows', () => {
        arrange('welcome');
        handleAction({ type: 'SET_LANG', payload: 'en' });
        const seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'fa' }));
        assert.equal(getLang(), 'fa');
        assert.equal(savedLang(), 'fa');
        assert.deepEqual(seen, ['fa']);
    });

    it('is also accepted on the setup form (no match exists yet)', () => {
        arrange('setup');
        handleAction({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'en');
        assert.equal(savedLang(), 'en');
    });

    it('is accepted on the welcome screen while the recovery banner offers a saved match', () => {
        const saved = JSON.stringify({ version: SAVE_VERSION, state: { ...structuredClone(gameState), phase: 'reveal', players: makePlayers(4), match: { usedWordKeys: [], lang: 'fa' } }, secrets: serializeSecrets() });
        env.storage.set('spy_full_state_master', saved);
        env.el('recovery-banner').classList.remove('hidden');
        arrange('welcome');
        handleAction({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'en');
    });
});

describe('SET_LANG: ignored', () => {
    const NOT_A_LANGUAGE = ['de', '__proto__', 'constructor', 'toString', 'EN', ' en', 'en ', 'en-US', '', undefined, null, 0, 1, true, {}, ['en'], ['fa'], ['en', 'fa'], { toString: () => 'en' }];

    it('ignores a value that is not a supported language code, and saves and announces nothing', () => {
        arrange('welcome');
        for (const payload of NOT_A_LANGUAGE) {
            const seen = watchLang(() => handleAction({ type: 'SET_LANG', payload }));
            assert.equal(getLang(), 'fa', String(payload));
            assert.deepEqual(seen, [], String(payload));
        }
        assert.equal(savedLang(), undefined, 'nothing was written to spy_lang');
    });

    it('ignores a missing payload', () => {
        arrange('welcome');
        handleAction({ type: 'SET_LANG' });
        assert.equal(getLang(), 'fa');
        assert.equal(savedLang(), undefined);
    });

    it('a bad value does not disturb English either (it is not read as "the default")', () => {
        arrange('welcome');
        handleAction({ type: 'SET_LANG', payload: 'en' });
        for (const payload of NOT_A_LANGUAGE) handleAction({ type: 'SET_LANG', payload });
        assert.equal(getLang(), 'en');
        assert.equal(savedLang(), 'en');
    });

    it('ignores the request in every phase of a match, whatever the language', () => {
        for (const phase of INSIDE_A_MATCH) {
            for (const [from, to] of [['fa', 'en'], ['en', 'fa']]) {
                setLang(from);
                env.storage.delete(LANG_KEY);
                arrange(phase);
                const seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: to }));
                assert.equal(getLang(), from, `${phase}: ${from} -> ${to}`);
                assert.deepEqual(seen, [], `${phase}: ${from} -> ${to}`);
                assert.equal(savedLang(), undefined, `${phase}: nothing saved`);
            }
        }
    });

    it('ignores the request when the phase is damaged or unknown', () => {
        for (const phase of ['bogus', undefined]) {
            gameState.phase = phase;
            handleAction({ type: 'SET_LANG', payload: 'en' });
            assert.equal(getLang(), 'fa', String(phase));
        }
    });

    it('is a no-op for the language that is already active: nothing is saved and nobody is told', () => {
        arrange('welcome');
        let seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'fa' }));
        assert.deepEqual(seen, []);
        assert.equal(savedLang(), undefined, 'Persian, already active: spy_lang is not written');

        handleAction({ type: 'SET_LANG', payload: 'en' });
        env.storage.delete(LANG_KEY);
        seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'en' }));
        assert.deepEqual(seen, []);
        assert.equal(savedLang(), undefined, 'English, already active: spy_lang is not written again');
    });

    it('is accepted again as soon as the match is over and the welcome screen is back', () => {
        arrange('leaderboard');
        handleAction({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'fa');
        gameState.players = [];
        arrange('welcome');
        handleAction({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'en');
    });
});

describe('the switch and a saved match', () => {
    /** A saved English match in the reveal phase; the page itself is then wiped and starts in `pageLang`. */
    function saveEnglishMatchThenReload(pageLang) {
        gameState.players = makePlayers(4);
        gameState.phase = 'reveal';
        gameState.match = { usedWordKeys: [], lang: 'en' };
        const saved = JSON.stringify({ version: SAVE_VERSION, state: gameState, secrets: serializeSecrets() });
        resetSingletons();
        env.storage.set('spy_full_state_master', saved);
        setLang(pageLang);
        env.storage.delete(LANG_KEY);
    }

    it('on the welcome screen the language can be changed freely; "Resume match" then brings back the match language', () => {
        saveEnglishMatchThenReload('fa');
        handleAction({ type: 'SET_LANG', payload: 'en' });
        handleAction({ type: 'SET_LANG', payload: 'fa' });
        assert.equal(getLang(), 'fa');

        handleAction({ type: 'RESTORE_GAME' });
        assert.equal(gameState.phase, 'reveal');
        assert.equal(getLang(), 'en', 'the saved match is English, so the app is English again');
        assert.equal(savedLang(), 'en');

        handleAction({ type: 'SET_LANG', payload: 'fa' });
        assert.equal(getLang(), 'en', 'and now that the match is running the switch is locked');
    });
});

describe('syncLangSwitch: the pressed state follows the active language', () => {
    function twoButtons() {
        const make = (code) => {
            const button = new FakeElement(`btn-lang-${code}`, 'button');
            button.dataset.lang = code;
            button.setAttribute('aria-pressed', 'false');
            return button;
        };
        const fa = make('fa');
        const en = make('en');
        env.stubQuery('.lang-btn', [fa, en]);
        return { fa, en, pressed: () => [fa.getAttribute('aria-pressed'), en.getAttribute('aria-pressed')] };
    }

    it('marks exactly the active language as pressed', () => {
        const { pressed } = twoButtons();
        syncLangSwitch();
        assert.deepEqual(pressed(), ['true', 'false']);
        setLang('en');
        syncLangSwitch();
        assert.deepEqual(pressed(), ['false', 'true']);
        setLang('fa');
        syncLangSwitch();
        assert.deepEqual(pressed(), ['true', 'false']);
    });

    it('follows a click (SET_LANG) and a restored match alike when it listens to the language, as main.js does', () => {
        const { pressed } = twoButtons();
        const stop = onLangChange(syncLangSwitch);
        try {
            syncLangSwitch();
            assert.deepEqual(pressed(), ['true', 'false']);

            arrange('welcome');
            handleAction({ type: 'SET_LANG', payload: 'en' });
            assert.deepEqual(pressed(), ['false', 'true'], 'after a click');

            handleAction({ type: 'SET_LANG', payload: 'fa' });
            assert.deepEqual(pressed(), ['true', 'false']);

            gameState.players = makePlayers(4);
            gameState.phase = 'reveal';
            gameState.match = { usedWordKeys: [], lang: 'en' };
            const saved = JSON.stringify({ version: SAVE_VERSION, state: gameState, secrets: serializeSecrets() });
            resetSingletons();
            env.storage.set('spy_full_state_master', saved);
            handleAction({ type: 'RESTORE_GAME' });
            assert.equal(getLang(), 'en');
            assert.deepEqual(pressed(), ['false', 'true'], 'after restoring an English match');
        } finally {
            stop();
        }
    });

    it('a button for a language that is not active is never pressed, and nothing else is touched', () => {
        const { fa, en } = twoButtons();
        fa.setAttribute('aria-label', 'x');
        en.textContent = 'English';
        setLang('en');
        syncLangSwitch();
        assert.equal(fa.getAttribute('aria-label'), 'x');
        assert.equal(en.textContent, 'English');
        assert.equal(fa.getAttribute('aria-pressed'), 'false');
    });
});
