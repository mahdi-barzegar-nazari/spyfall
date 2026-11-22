/**
 * The first-visit intro: the memory and the rule (core/intro.js), and the moment it opens (ui/intro.js). Time only
 * moves when a test ticks the manual clock; the page is faked.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { gameState } from '../../js/core/state.js';
import { fa } from '../../js/i18n/fa.js';
import { en } from '../../js/i18n/en.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { elements, parseHtml } from './helpers/htmlScan.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const intro = await import('../../js/core/intro.js');
const ui = await import('../../js/ui/intro.js');
const { INTRO_KEY, INTRO_MAX_MATCHES, INTRO_MAX_SHOWS, defaultIntroState, loadIntroState, markIntroDone, recordMatchStarted, sanitizeIntroState, saveIntroState, shouldShowIntro } = intro;
const harness = useGameHarness(env, {});
after(() => env.uninstall());

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const setWebdriver = (value) => Object.defineProperty(globalThis, 'navigator', { value: { webdriver: value }, configurable: true, writable: true });
afterEach(() => {
    if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
    else delete globalThis.navigator;
});

const stored = () => (env.storage.has(INTRO_KEY) ? JSON.parse(env.storage.get(INTRO_KEY)) : undefined);
const opened = () => harness.actions.filter((a) => a.type === 'OPEN_MODAL' && a.payload === 'intro-modal').length;

describe('sanitizeIntroState', () => {
    it('keeps a clean state as it is', () => {
        assert.deepEqual(sanitizeIntroState({ shown: 2, matches: 1, off: true }), { shown: 2, matches: 1, off: true });
    });

    it('makes anything else a fresh state, or the nearest usable one', () => {
        for (const junk of [null, undefined, 'x', 5, [], true]) assert.deepEqual(sanitizeIntroState(junk), defaultIntroState());
        assert.deepEqual(sanitizeIntroState({ shown: -4, matches: 2.5, off: 'yes' }), { shown: 0, matches: 0, off: false });
        assert.deepEqual(sanitizeIntroState({ shown: 99, matches: 99, off: true }), { shown: INTRO_MAX_SHOWS, matches: INTRO_MAX_MATCHES, off: true });
        assert.deepEqual(sanitizeIntroState({ shown: '1', matches: null }), defaultIntroState());
    });
});

describe('the memory on the device', () => {
    it('reads back what was saved, and a fresh state when nothing usable is stored', () => {
        assert.deepEqual(loadIntroState(), defaultIntroState());
        assert.equal(saveIntroState({ shown: 1, matches: 0, off: false }), true);
        assert.deepEqual(loadIntroState(), { shown: 1, matches: 0, off: false });
        env.storage.set(INTRO_KEY, '{not json');
        assert.deepEqual(loadIntroState(), defaultIntroState());
    });

    it('says false when the storage refuses to write, and never throws', () => {
        const real = globalThis.localStorage;
        globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('full'); } };
        try {
            assert.equal(saveIntroState(defaultIntroState()), false);
        } finally {
            globalThis.localStorage = real;
        }
    });

    it('markIntroDone turns it off for good and keeps the counts', () => {
        saveIntroState({ shown: 2, matches: 1, off: false });
        markIntroDone();
        assert.deepEqual(stored(), { shown: 2, matches: 1, off: true });
    });

    it('recordMatchStarted counts matches, and stops writing at the limit', () => {
        for (let i = 1; i <= INTRO_MAX_MATCHES; i++) {
            recordMatchStarted();
            assert.equal(stored().matches, i);
        }
        const before = env.storage.get(INTRO_KEY);
        recordMatchStarted();
        assert.equal(env.storage.get(INTRO_KEY), before);
    });
});

describe('shouldShowIntro', () => {
    it('is true for a new person, and false for each reason to stay quiet', () => {
        assert.equal(shouldShowIntro(defaultIntroState(), false), true);
        assert.equal(shouldShowIntro(defaultIntroState(), true), false, 'played here before');
        assert.equal(shouldShowIntro({ shown: 0, matches: 0, off: true }, false), false, 'said it understood');
        assert.equal(shouldShowIntro({ shown: INTRO_MAX_SHOWS, matches: 0, off: false }, false), false, 'shown enough times');
        assert.equal(shouldShowIntro({ shown: 0, matches: INTRO_MAX_MATCHES, off: false }, false), false, 'started enough matches');
    });

    it('is still true after fewer than the limit of showings and matches', () => {
        assert.equal(shouldShowIntro({ shown: INTRO_MAX_SHOWS - 1, matches: INTRO_MAX_MATCHES - 1, off: false }, false), true);
    });
});

describe('playedBeforeTheIntro', () => {
    it('is false on a device with nothing stored', () => {
        assert.equal(ui.playedBeforeTheIntro(), false);
    });

    it('is true for a remembered word, a saved setup, or a saved match, while the device has no record of the intro', () => {
        env.storage.set('spy_recent_words', JSON.stringify(['k1']));
        assert.equal(ui.playedBeforeTheIntro(), true);
        env.storage.clear();
        env.storage.set('spy_full_state_master', '{}');
        assert.equal(ui.playedBeforeTheIntro(), true);
        env.storage.clear();
        env.storage.set('spy_setup_settings', JSON.stringify({ version: 1, settings: {} }));
        assert.equal(ui.playedBeforeTheIntro(), true);
    });

    it('is false once the intro has a record: the signs of play then belong to a person still being shown the first steps', () => {
        saveIntroState({ shown: 1, matches: 0, off: false });
        env.storage.set('spy_recent_words', JSON.stringify(['k1']));
        env.storage.set('spy_setup_settings', JSON.stringify({ version: 1, settings: {} }));
        env.storage.set('spy_full_state_master', '{}');
        assert.equal(ui.playedBeforeTheIntro(), false);
    });
});

describe('maybeShowIntro', () => {
    const welcome = () => {
        gameState.phase = 'welcome';
    };

    it('opens the dialog after a short wait, on the welcome screen of a new person, and counts the showing', () => {
        welcome();
        assert.equal(ui.maybeShowIntro(), true);
        assert.equal(opened(), 0, 'not at once');
        env.clock.tick(ui.INTRO_DELAY_MS);
        assert.equal(opened(), 1);
        assert.equal(stored().shown, 1);
    });

    it('opens the dialog at most INTRO_MAX_SHOWS times, one in each visit', () => {
        welcome();
        for (let visit = 1; visit <= INTRO_MAX_SHOWS + 2; visit++) {
            ui.maybeShowIntro();
            env.clock.tick(ui.INTRO_DELAY_MS);
        }
        assert.equal(opened(), INTRO_MAX_SHOWS);
    });

    it('does not open for someone who has played here, or who said it understood, or who started enough matches', () => {
        welcome();
        env.storage.set('spy_recent_words', JSON.stringify(['k1']));
        assert.equal(ui.maybeShowIntro(), false);
        env.storage.clear();
        markIntroDone();
        assert.equal(ui.maybeShowIntro(), false);
        env.storage.clear();
        for (let i = 0; i < INTRO_MAX_MATCHES; i++) recordMatchStarted();
        assert.equal(ui.maybeShowIntro(), false);
        env.clock.tick(5000);
        assert.equal(opened(), 0);
    });

    it('still opens after a first match (it saved a setup and a word), until the matches or the showings are used up', () => {
        welcome();
        recordMatchStarted();
        env.storage.set('spy_recent_words', JSON.stringify(['k1']));
        env.storage.set('spy_setup_settings', JSON.stringify({ version: 1, settings: {} }));
        assert.equal(ui.maybeShowIntro(), true);
        env.clock.tick(ui.INTRO_DELAY_MS);
        assert.equal(opened(), 1);
        recordMatchStarted();
        recordMatchStarted();
        assert.equal(ui.maybeShowIntro(), false, 'three matches started');
    });

    it('does nothing outside the welcome screen, and gives up if the screen changed while it waited', () => {
        gameState.phase = 'setup';
        assert.equal(ui.maybeShowIntro(), false);
        welcome();
        assert.equal(ui.maybeShowIntro(), true);
        gameState.phase = 'setup';
        env.clock.tick(ui.INTRO_DELAY_MS);
        assert.equal(opened(), 0);
        assert.equal(stored(), undefined, 'a showing that did not happen is not counted');
    });

    it('does not open on top of another dialog', () => {
        welcome();
        const other = env.el('some-modal');
        other.className = 'modal-overlay';
        env.stubQuery('.modal-overlay:not(.hidden)', [other]);
        ui.maybeShowIntro();
        env.clock.tick(ui.INTRO_DELAY_MS);
        assert.equal(opened(), 0);
    });

    it('stays shut when the storage refuses to write (so a broken storage cannot open it at every visit)', () => {
        welcome();
        const real = globalThis.localStorage;
        globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('full'); } };
        try {
            ui.maybeShowIntro();
            env.clock.tick(ui.INTRO_DELAY_MS);
        } finally {
            globalThis.localStorage = real;
        }
        assert.equal(opened(), 0);
    });
});

describe('under browser automation', () => {
    it('is switched off: nothing opens, nothing is counted, nothing is stored', () => {
        setWebdriver(true);
        gameState.phase = 'welcome';
        assert.equal(intro.isAutomated(), true);
        assert.equal(ui.maybeShowIntro(), false);
        recordMatchStarted();
        markIntroDone();
        env.clock.tick(5000);
        assert.equal(opened(), 0);
        assert.equal(stored(), undefined);
    });

    it('is on again when the flag is off (what the intro\'s own end-to-end test does)', () => {
        setWebdriver(false);
        gameState.phase = 'welcome';
        assert.equal(ui.maybeShowIntro(), true);
    });
});

describe('the dialog in index.html', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const page = [...elements(parseHtml(readFileSync(`${root}index.html`, 'utf8')))];
    const byId = (id) => page.find((el) => el.attrs.id === id);

    it('is a modal dialog with a title and three steps, a "Got it" button and a full guide button', () => {
        const modal = byId('intro-modal');
        assert.ok(modal);
        assert.equal(modal.attrs.role, 'dialog');
        assert.equal(modal.attrs['aria-modal'], 'true');
        assert.equal(modal.attrs['aria-labelledby'], 'intro-title');
        assert.ok((modal.attrs.class || '').split(/\s+/).includes('hidden'), 'starts closed');
        assert.equal(page.filter((el) => el.tag === 'li' && [...elements(byId('intro-modal'))].includes(el)).length, 3);
        for (const id of ['btn-intro-ok', 'btn-intro-full']) {
            assert.equal(byId(id).tag, 'button');
            assert.equal(byId(id).attrs.type, 'button');
        }
    });

    it('has every text in both catalogs, with three steps of a sentence each', () => {
        for (const cat of [fa, en]) {
            for (const key of ['intro.title', 'intro.step1', 'intro.step2', 'intro.step3', 'intro.ok', 'intro.full', 'intro.note']) {
                assert.ok(cat[key] && cat[key].length > 3, key);
            }
        }
    });
});
