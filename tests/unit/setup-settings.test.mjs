/**
 * Tests for remembering the match settings between visits: the defaults and the validator in core/config.js, the
 * `spy_setup_settings` record in core/storage.js, saving it when a match starts (ui/setup.js), putting it back
 * into the setup form at start-up and after "new match", and the rule that a resumed match keeps its own settings.
 *
 * What is read back from localStorage is untrusted, so most of the tests feed it damaged input and check that only the
 * damaged FIELD falls back to its default. The form is faked: each control is an element with `value` / `checked`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import {
    BUILT_IN_CATEGORIES,
    CATEGORY_IDS,
    DIFFICULTY_LEVELS,
    HINT_TYPES,
    RULES,
    defaultSetupSettings,
    getMaxSpiesAllowed,
    sanitizeSetupSettings
} from '../../js/core/config.js';
import { SAVE_VERSION, gameState, serializeSecrets } from '../../js/core/state.js';
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { WORD_PACKS_EN } from '../../js/data/wordPacksEn.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { elements, parseHtml } from './helpers/htmlScan.mjs';
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { SETUP_SETTINGS_KEY, SETUP_SETTINGS_VERSION, loadSetupSettings, saveSetupSettings } = await import('../../js/core/storage.js');
const { applySetupSettingsToForm, restoreSavedSetup, validateAndSaveSettings } = await import('../../js/ui/setup.js');
const { stopTimerLoop } = await import('../../js/game/timer.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');

/** The setup form of the page, rebuilt before every test (see `buildForm`). */
let form;
useGameHarness(env, {
    setup: () => {
        env.el('recovery-banner');
        env.el('toast-container');
        form = buildForm();
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const KEYS = Object.keys(defaultSetupSettings());

/** Same as the defaults, with `patch` on top. */
const settingsWith = (patch) => ({ ...defaultSetupSettings(), ...patch });

/** A setup that differs from the defaults in EVERY field, and is valid. */
const NON_DEFAULT = {
    playersCount: 9,
    spiesCount: 3,
    timerMin: 11,
    cats: ['jobs', 'sports', 'custom'],
    diff: ['medium', 'hard'],
    revealHold: true,
    hints: ['category', 'first_letter'],
    fool: true,
    detective: true,
    knownSpies: true,
    director: true,
    oneword: true,
    quests: true,
    wager: true,
    sudden: true,
    voteLimitEnabled: true,
    maxVotes: 6,
    roleRevealConfirm: false,
    voteConfirm: true,
    quickVoting: true,
    spyLastChance: false
};

// ---------------------------------------------------------------------------------------------------------------
// A fake setup form
// ---------------------------------------------------------------------------------------------------------------

const TOGGLE_IDS = {
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
const FIELD_IDS = ['setup-players-count', 'setup-spies-count', 'setup-timer', 'setup-max-votes', 'setup-reveal-mode'];
const CHIP_GROUPS = [
    { name: 'setup-cat', values: CATEGORY_IDS, container: 'category-chips-container' },
    { name: 'setup-diff', values: DIFFICULTY_LEVELS, container: 'difficulty-chips-container' },
    { name: 'setup-hint', values: HINT_TYPES, container: 'hint-chips-container' }
];

/**
 * The controls the setup code looks for, as fakes in the fake `document`: three groups of chips, the number
 * fields, the select, the switches, the emergency-vote box and the container of the name inputs. A fresh form
 * shows the defaults.
 */
function buildForm() {
    const chips = {};
    for (const { name, values, container } of CHIP_GROUPS) {
        chips[name] = values.map((value) => {
            const wrap = {
                classes: new Set(),
                classList: { toggle: (cls, on) => (on ? wrap.classes.add(cls) : wrap.classes.delete(cls)) }
            };
            return { name, value, checked: false, wrap, closest: () => wrap };
        });
        env.stubQuery(`input[name="${name}"]`, chips[name]);
        env.el(container).querySelectorAll = () => chips[name];
    }
    for (const id of FIELD_IDS) env.el(id).focus = () => {};
    for (const id of Object.values(TOGGLE_IDS)) env.el(id);
    env.el('vote-limit-box');
    const names = env.el('name-inputs-container');
    names.querySelectorAll = () => names.children.filter((child) => child.tagName === 'INPUT');
    const fakeForm = { chips };
    applySetupSettingsToForm(defaultSetupSettings());
    return fakeForm;
}

/** What the form shows, read the way `validateAndSaveSettings` reads it (as settings, in the default key order). */
function readForm() {
    const ticked = (name) => form.chips[name].filter((chip) => chip.checked).map((chip) => chip.value);
    const settings = {
        playersCount: Number(env.el('setup-players-count').value),
        spiesCount: Number(env.el('setup-spies-count').value),
        timerMin: Number(env.el('setup-timer').value),
        cats: ticked('setup-cat'),
        diff: ticked('setup-diff'),
        revealHold: env.el('setup-reveal-mode').value === 'hold',
        hints: ticked('setup-hint'),
        maxVotes: Number(env.el('setup-max-votes').value)
    };
    for (const [key, id] of Object.entries(TOGGLE_IDS)) settings[key] = env.el(id).checked;
    return Object.fromEntries(KEYS.map((key) => [key, settings[key]]));
}

/** Make the `:checked` queries of `validateAndSaveSettings` see what the chips show now, and give it name inputs. */
function readyToValidate(names = ['Ali', 'Bita', 'Cyrus', 'Dara']) {
    for (const [name, chips] of Object.entries(form.chips)) {
        env.stubQuery(`input[name="${name}"]:checked`, chips.filter((chip) => chip.checked));
    }
    const inputs = names.map((n) => Object.assign(env.input(n), { focus() {} }));
    env.stubQuery('#name-inputs-container input', inputs);
}

/** Fill the form with `settings` (valid ones: the form's own checks must pass) and the first `count` of four names. */
function fillAndValidate(settings, names) {
    applySetupSettingsToForm(settings);
    readyToValidate(names ?? Array.from({ length: settings.playersCount }, (_, i) => `Name${i + 1}`));
    return validateAndSaveSettings();
}

/** The record as it sits in localStorage, parsed. */
const storedRecord = () => JSON.parse(env.storage.get(SETUP_SETTINGS_KEY));

/** Put a record (an object, or already-text) under the key. */
const store = (value) => env.storage.set(SETUP_SETTINGS_KEY, typeof value === 'string' ? value : JSON.stringify(value));
const record = (settings, version = SETUP_SETTINGS_VERSION) => ({ version, settings });

/** Run `fn` with a localStorage whose every method throws (the browser blocks storage); the real one comes back after. */
function withThrowingStorage(fn) {
    const real = globalThis.localStorage;
    const warn = console.warn;
    const deny = () => {
        throw new Error('storage blocked');
    };
    console.warn = () => {};
    globalThis.localStorage = { getItem: deny, setItem: deny, removeItem: deny, clear: deny };
    try {
        return fn();
    } finally {
        globalThis.localStorage = real;
        console.warn = warn;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// The defaults
// ---------------------------------------------------------------------------------------------------------------

describe('defaultSetupSettings', () => {
    it('are the values the app has always started with', () => {
        assert.deepEqual(defaultSetupSettings(), {
            playersCount: 4,
            spiesCount: 1,
            timerMin: 4,
            cats: ['places', 'jobs', 'foods', 'objects', 'vehicles', 'animals', 'sports', 'events'],
            diff: ['easy', 'medium', 'hard'],
            revealHold: false,
            hints: ['related_word'],
            fool: false,
            detective: false,
            knownSpies: false,
            director: false,
            oneword: false,
            quests: false,
            wager: false,
            sudden: false,
            voteLimitEnabled: false,
            maxVotes: 2,
            roleRevealConfirm: true,
            voteConfirm: false,
            quickVoting: false,
            spyLastChance: true
        });
    });

    it('are what core/state.js starts the match settings from (plus detectiveUsed, which is the match\'s)', () => {
        assert.deepEqual(gameState.settings, { ...defaultSetupSettings(), detectiveUsed: false });
    });

    it('come as a new object with new arrays every time, so nobody can change the defaults for the next caller', () => {
        const first = defaultSetupSettings();
        first.cats.push('custom');
        first.diff.length = 0;
        first.hints.push('none');
        first.playersCount = 20;
        assert.deepEqual(defaultSetupSettings(), settingsWith({}));
        assert.equal(defaultSetupSettings().cats.length, 8);
        assert.deepEqual(defaultSetupSettings().diff, ['easy', 'medium', 'hard']);
        assert.deepEqual(defaultSetupSettings().hints, ['related_word']);
    });

    it('every default is itself valid (sanitizing them changes nothing)', () => {
        assert.deepEqual(sanitizeSetupSettings(defaultSetupSettings()), defaultSetupSettings());
    });
});

describe('the ids the validator accepts match the page and the data', () => {
    const inputs = (name) => [...elements(parseHtml(html))].filter((el) => el.tag === 'input' && el.attrs.name === name);

    it('CATEGORY_IDS are the category chips of index.html, in order, and the keys of both word banks plus "custom"', () => {
        assert.deepEqual(inputs('setup-cat').map((el) => el.attrs.value), CATEGORY_IDS);
        assert.deepEqual(Object.keys(WORD_PACKS), BUILT_IN_CATEGORIES);
        assert.deepEqual(Object.keys(WORD_PACKS_EN), BUILT_IN_CATEGORIES);
        assert.deepEqual(CATEGORY_IDS, [...BUILT_IN_CATEGORIES, 'custom']);
    });

    it('HINT_TYPES and DIFFICULTY_LEVELS are the hint and difficulty chips of index.html, in order', () => {
        assert.deepEqual(inputs('setup-hint').map((el) => el.attrs.value), HINT_TYPES);
        assert.deepEqual(inputs('setup-diff').map((el) => el.attrs.value), DIFFICULTY_LEVELS);
    });

    it('index.html shows the defaults before anything is restored (so "nothing saved" leaves the form at them)', () => {
        const all = [...elements(parseHtml(html))];
        const byId = (id) => all.find((el) => el.attrs.id === id);
        const defaults = defaultSetupSettings();
        assert.equal(byId('setup-players-count').attrs.value, String(defaults.playersCount));
        assert.equal(byId('setup-spies-count').attrs.value, String(defaults.spiesCount));
        assert.equal(byId('setup-timer').attrs.value, String(defaults.timerMin));
        assert.equal(byId('setup-max-votes').attrs.value, String(defaults.maxVotes));
        for (const [key, id] of Object.entries(TOGGLE_IDS)) {
            assert.equal('checked' in byId(id).attrs, defaults[key], `${id} is ${defaults[key] ? 'on' : 'off'} in the page`);
        }
        const ticked = (name) => inputs(name).filter((el) => 'checked' in el.attrs).map((el) => el.attrs.value);
        assert.deepEqual(ticked('setup-cat'), defaults.cats);
        assert.deepEqual(ticked('setup-diff'), defaults.diff);
        assert.deepEqual(ticked('setup-hint'), defaults.hints);
        const select = byId('setup-reveal-mode');
        const options = all.filter((el) => el.tag === 'option' && el.parent === select);
        assert.equal(options[0].attrs.value, defaults.revealHold ? 'hold' : 'click', 'the first option is the one shown');
        assert.ok(!options.some((el) => 'selected' in el.attrs));
    });
});

// ---------------------------------------------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------------------------------------------

describe('sanitizeSetupSettings: a valid setup', () => {
    it('is kept whole, field by field (every field of NON_DEFAULT differs from its default, so none is skipped)', () => {
        for (const key of KEYS) assert.notDeepEqual(NON_DEFAULT[key], defaultSetupSettings()[key], key);
        assert.deepEqual(sanitizeSetupSettings(NON_DEFAULT), NON_DEFAULT);
    });

    it('does not change its input and returns a new object each time', () => {
        const input = structuredClone(NON_DEFAULT);
        const out = sanitizeSetupSettings(input);
        assert.deepEqual(input, NON_DEFAULT);
        assert.notEqual(out, input);
        assert.notEqual(out.cats, input.cats);
        out.cats.push('x');
        assert.deepEqual(input.cats, NON_DEFAULT.cats);
    });
});

describe('sanitizeSetupSettings: anything that is not an object gives the defaults', () => {
    for (const [label, value] of [['undefined', undefined], ['null', null], ['a string', '{"playersCount":9}'], ['a number', 7], ['true', true], ['an array', [NON_DEFAULT]]]) {
        it(label, () => assert.deepEqual(sanitizeSetupSettings(value), defaultSetupSettings()));
    }
});

describe('sanitizeSetupSettings: the numbers', () => {
    const numberCases = [
        { key: 'playersCount', range: RULES.players, fallback: 4 },
        { key: 'timerMin', range: RULES.timerMinutes, fallback: 4 },
        { key: 'maxVotes', range: RULES.emergencyVotes, fallback: 2 }
    ];
    for (const { key, range, fallback } of numberCases) {
        it(`${key}: a whole number in range is kept, outside it is clamped to the nearest limit`, () => {
            assert.equal(sanitizeSetupSettings({ [key]: range.min })[key], range.min);
            assert.equal(sanitizeSetupSettings({ [key]: range.max })[key], range.max);
            assert.equal(sanitizeSetupSettings({ [key]: range.min - 1 })[key], range.min);
            assert.equal(sanitizeSetupSettings({ [key]: range.max + 1 })[key], range.max);
            assert.equal(sanitizeSetupSettings({ [key]: -50 })[key], range.min);
            assert.equal(sanitizeSetupSettings({ [key]: 0 })[key], range.min);
            assert.equal(sanitizeSetupSettings({ [key]: 10 ** 12 })[key], range.max);
        });

        it(`${key}: a wrong type or a number that is not whole is the default (${fallback})`, () => {
            for (const bad of ['7', '', 'abc', 4.5, 0.2, Number.NaN, Infinity, -Infinity, null, undefined, true, false, [], [5], {}, { n: 5 }]) {
                assert.equal(sanitizeSetupSettings({ [key]: bad })[key], fallback, `${key} = ${JSON.stringify(bad)}`);
            }
        });
    }

    it('spiesCount: clamped to 1 and to what the restored player count allows', () => {
        for (let players = RULES.players.min; players <= RULES.players.max; players++) {
            const max = getMaxSpiesAllowed(players);
            for (let spies = -2; spies <= 9; spies++) {
                const out = sanitizeSetupSettings({ playersCount: players, spiesCount: spies });
                assert.equal(out.playersCount, players);
                assert.equal(out.spiesCount, Math.min(max, Math.max(RULES.spies.min, spies)), `${players} players, ${spies} spies`);
                assert.ok(out.spiesCount >= RULES.spies.min && out.spiesCount <= getMaxSpiesAllowed(out.playersCount));
            }
        }
    });

    it('spiesCount: judged against the player count AFTER it was clamped or defaulted', () => {
        // 99 players clamps to 20, which allows 5 spies; 1 player clamps to 3, which allows 1.
        assert.equal(sanitizeSetupSettings({ playersCount: 99, spiesCount: 5 }).spiesCount, 5);
        assert.equal(sanitizeSetupSettings({ playersCount: 1, spiesCount: 5 }).spiesCount, 1);
        // A player count that is not usable is the default 4, which allows one spy.
        assert.equal(sanitizeSetupSettings({ playersCount: 'many', spiesCount: 3 }).spiesCount, 1);
        assert.equal(sanitizeSetupSettings({ spiesCount: 3 }).spiesCount, 1);
        // With the player count of a saved setup that has no spies field at all, the default spy is kept.
        assert.equal(sanitizeSetupSettings({ playersCount: 12 }).spiesCount, 1);
    });

    it('spiesCount: a wrong type is the default (1), also when the players would allow more', () => {
        for (const bad of ['2', 2.5, null, true, [2], Number.NaN]) {
            assert.equal(sanitizeSetupSettings({ playersCount: 12, spiesCount: bad }).spiesCount, 1, JSON.stringify(bad));
        }
    });
});

describe('sanitizeSetupSettings: the lists', () => {
    it('categories: unknown ids are dropped, the rest are kept once, in the order of the setup screen', () => {
        assert.deepEqual(sanitizeSetupSettings({ cats: ['sports', 'bogus', 'places', 'sports', 'custom'] }).cats, ['places', 'sports', 'custom']);
        assert.deepEqual(sanitizeSetupSettings({ cats: ['events'] }).cats, ['events']);
        assert.deepEqual(sanitizeSetupSettings({ cats: ['custom'] }).cats, ['custom']);
    });

    it('categories: nothing known left (empty, only unknown ids, wrong types, inherited names) is the default list', () => {
        for (const bad of [[], ['bogus'], ['Places'], [' places'], [1, 2], [null], [['places']], 'places', 7, null, {}, { 0: 'places', length: 1 }, ['constructor', '__proto__', 'toString']]) {
            assert.deepEqual(sanitizeSetupSettings({ cats: bad }).cats, BUILT_IN_CATEGORIES, JSON.stringify(bad));
        }
    });

    it('the default category list has no "custom" in it', () => {
        assert.ok(!sanitizeSetupSettings({ cats: [] }).cats.includes('custom'));
    });

    it('hints: unknown ids are dropped and the rest kept once in the order of the chips; nothing left is related_word', () => {
        assert.deepEqual(sanitizeSetupSettings({ hints: ['none', 'bogus', 'category', 'none'] }).hints, ['category', 'none']);
        assert.deepEqual(sanitizeSetupSettings({ hints: ['none'] }).hints, ['none']);
        for (const bad of [[], ['bogus'], 'category', 3, null, {}, [7]]) {
            assert.deepEqual(sanitizeSetupSettings({ hints: bad }).hints, ['related_word'], JSON.stringify(bad));
        }
    });

    it('difficulty: the array it is stored as is kept, in the order easy, medium, hard', () => {
        for (const levels of [['easy'], ['medium'], ['hard'], ['easy', 'medium'], ['easy', 'hard'], ['medium', 'hard'], ['easy', 'medium', 'hard']]) {
            assert.deepEqual(sanitizeSetupSettings({ diff: levels }).diff, levels, levels.join('+'));
        }
        assert.deepEqual(sanitizeSetupSettings({ diff: ['hard', 'easy'] }).diff, ['easy', 'hard']);
        assert.deepEqual(sanitizeSetupSettings({ diff: ['hard', 'bogus', 'hard'] }).diff, ['hard']);
    });

    it('difficulty: the single string older data holds is still read ("all", or one level)', () => {
        assert.deepEqual(sanitizeSetupSettings({ diff: 'all' }).diff, ['easy', 'medium', 'hard']);
        assert.deepEqual(sanitizeSetupSettings({ diff: 'easy' }).diff, ['easy']);
        assert.deepEqual(sanitizeSetupSettings({ diff: 'medium' }).diff, ['medium']);
        assert.deepEqual(sanitizeSetupSettings({ diff: 'hard' }).diff, ['hard']);
    });

    it('difficulty: an empty or unknown choice is all three levels, as the default', () => {
        for (const bad of [[], ['bogus'], 'bogus', '', 'Hard', 3, null, {}, [1], undefined]) {
            assert.deepEqual(sanitizeSetupSettings({ diff: bad }).diff, ['easy', 'medium', 'hard'], JSON.stringify(bad));
        }
    });
});

describe('sanitizeSetupSettings: the switches', () => {
    for (const key of KEYS.filter((k) => typeof defaultSetupSettings()[k] === 'boolean')) {
        it(`${key}: true and false are kept, anything else is its default (${defaultSetupSettings()[key]})`, () => {
            assert.equal(sanitizeSetupSettings({ [key]: true })[key], true);
            assert.equal(sanitizeSetupSettings({ [key]: false })[key], false);
            for (const bad of ['true', 'false', 'yes', 1, 0, null, [], {}, undefined, Number.NaN]) {
                assert.equal(sanitizeSetupSettings({ [key]: bad })[key], defaultSetupSettings()[key], `${key} = ${JSON.stringify(bad)}`);
            }
        });
    }
});

describe('sanitizeSetupSettings: fields are judged one at a time', () => {
    it('one damaged field takes its default and the others are kept', () => {
        const damaged = { ...NON_DEFAULT, timerMin: 'soon' };
        assert.deepEqual(sanitizeSetupSettings(damaged), { ...NON_DEFAULT, timerMin: 4 });
        assert.deepEqual(sanitizeSetupSettings({ ...NON_DEFAULT, cats: ['bogus'] }), { ...NON_DEFAULT, cats: BUILT_IN_CATEGORIES });
        assert.deepEqual(sanitizeSetupSettings({ ...NON_DEFAULT, diff: [] }), { ...NON_DEFAULT, diff: ['easy', 'medium', 'hard'] });
        assert.deepEqual(sanitizeSetupSettings({ ...NON_DEFAULT, wager: 'on' }), { ...NON_DEFAULT, wager: false });
    });

    it('a missing field is its default, so a record from an older app that has fewer fields still restores', () => {
        assert.deepEqual(sanitizeSetupSettings({ timerMin: 8 }), settingsWith({ timerMin: 8 }));
        assert.deepEqual(sanitizeSetupSettings({}), defaultSetupSettings());
    });
});

describe('sanitizeSetupSettings: keys that are not setup options', () => {
    it('are left out: detectiveUsed, names, language, theme, sound, custom words, anything unknown', () => {
        const out = sanitizeSetupSettings({
            ...NON_DEFAULT,
            detectiveUsed: true,
            names: ['Ali', 'Bita'],
            lang: 'en',
            theme: 'noir',
            muted: true,
            customWords: [{ word: 'x' }],
            extra: 1
        });
        assert.deepEqual(Object.keys(out), KEYS);
        assert.deepEqual(out, NON_DEFAULT);
    });

    it('an inherited or "__proto__" key is not read as a setting and pollutes nothing', () => {
        const parsed = JSON.parse('{"__proto__": {"playersCount": 9, "polluted": true}, "constructor": {"timerMin": 9}}');
        assert.deepEqual(sanitizeSetupSettings(parsed), defaultSetupSettings());
        assert.equal({}.polluted, undefined);
        const inherited = Object.create({ playersCount: 9, timerMin: 9 });
        assert.deepEqual(sanitizeSetupSettings(inherited), defaultSetupSettings());
    });
});

// ---------------------------------------------------------------------------------------------------------------
// The record in localStorage
// ---------------------------------------------------------------------------------------------------------------

describe('saveSetupSettings: what is written', () => {
    it('is one record under spy_setup_settings: { version: 1, settings }, with exactly the setup options', () => {
        assert.equal(SETUP_SETTINGS_KEY, 'spy_setup_settings');
        assert.equal(SETUP_SETTINGS_VERSION, 1);
        saveSetupSettings(NON_DEFAULT);
        assert.deepEqual([...env.storage.keys()], [SETUP_SETTINGS_KEY], 'and no other key');
        const written = storedRecord();
        assert.deepEqual(Object.keys(written), ['version', 'settings']);
        assert.equal(written.version, 1);
        assert.deepEqual(Object.keys(written.settings), KEYS);
        assert.deepEqual(written.settings, NON_DEFAULT);
    });

    it('never writes what is kept elsewhere or belongs to the running match', () => {
        saveSetupSettings({
            ...NON_DEFAULT,
            detectiveUsed: true,
            names: ['Ali', 'Bita'],
            playerNames: ['Ali'],
            customWords: [{ word: 'secret-word' }],
            lang: 'en',
            theme: 'noir',
            muted: true
        });
        const text = env.storage.get(SETUP_SETTINGS_KEY);
        assert.deepEqual(Object.keys(storedRecord().settings), KEYS);
        for (const leaked of ['detectiveUsed', 'Ali', 'Bita', 'secret-word', 'names', 'lang', 'theme', 'muted']) {
            assert.ok(!text.includes(leaked), `${leaked} must not be in the record`);
        }
    });

    it('cleans what it writes: a value that is not valid is never stored', () => {
        saveSetupSettings({ playersCount: 99, spiesCount: 9, timerMin: 'x', cats: ['bogus'], diff: 'nope' });
        assert.deepEqual(storedRecord().settings, settingsWith({ playersCount: 20, spiesCount: 5 }));
    });

    it('does not touch the keys of the names, the custom words, the language, the theme or the saved match', () => {
        const others = { spy_saved_player_names: '["Ali"]', spy_custom_words: '[]', spy_lang: 'en', spy_selected_theme: 'noir', spy_full_state_master: '{"x":1}' };
        for (const [key, value] of Object.entries(others)) env.storage.set(key, value);
        saveSetupSettings(NON_DEFAULT);
        for (const [key, value] of Object.entries(others)) assert.equal(env.storage.get(key), value, key);
    });

    it('a storage that throws does not throw out of it', () => {
        assert.doesNotThrow(() => withThrowingStorage(() => saveSetupSettings(NON_DEFAULT)));
        assert.equal(env.storage.has(SETUP_SETTINGS_KEY), false);
    });
});

describe('loadSetupSettings: a record that is usable', () => {
    it('reads back what was saved', () => {
        saveSetupSettings(NON_DEFAULT);
        assert.deepEqual(loadSetupSettings(), NON_DEFAULT);
        saveSetupSettings(defaultSetupSettings());
        assert.deepEqual(loadSetupSettings(), defaultSetupSettings());
    });

    it('validates what it reads: out-of-range numbers are clamped, spies fit the players, unknown ids are dropped', () => {
        store(record({
            playersCount: 500,
            spiesCount: 40,
            timerMin: 0,
            maxVotes: -3,
            cats: ['jobs', 'atlantis'],
            hints: ['category', 'telepathy'],
            diff: ['hard', 'impossible']
        }));
        assert.deepEqual(loadSetupSettings(), settingsWith({ playersCount: 20, spiesCount: 5, timerMin: 1, maxVotes: 1, cats: ['jobs'], hints: ['category'], diff: ['hard'] }));

        store(record({ playersCount: 5, spiesCount: 4 }));
        assert.equal(loadSetupSettings().spiesCount, getMaxSpiesAllowed(5));
        store(record({ playersCount: 3, spiesCount: 2 }));
        assert.equal(loadSetupSettings().spiesCount, 1);
    });

    it('wrong types fall back field by field and keep the good fields', () => {
        store(record({ playersCount: '8', timerMin: 7, cats: 'jobs', diff: 5, fool: 'yes', wager: true, maxVotes: null }));
        assert.deepEqual(loadSetupSettings(), settingsWith({ timerMin: 7, wager: true }));
    });

    it('an empty category or difficulty choice is that field\'s default, and nothing else changes', () => {
        store(record({ ...NON_DEFAULT, cats: [], diff: [] }));
        assert.deepEqual(loadSetupSettings(), { ...NON_DEFAULT, cats: BUILT_IN_CATEGORIES, diff: ['easy', 'medium', 'hard'] });
    });

    it('unknown keys are ignored (also next to the record: { version, settings, extra })', () => {
        store({ version: 1, settings: { ...NON_DEFAULT, names: ['Ali'], nonsense: 1 }, extra: 'x', names: ['Ali'] });
        assert.deepEqual(loadSetupSettings(), NON_DEFAULT);
    });

    it('difficulty stored the way older data holds it (one string) is still read', () => {
        store(record({ diff: 'hard' }));
        assert.deepEqual(loadSetupSettings().diff, ['hard']);
        store(record({ diff: 'all' }));
        assert.deepEqual(loadSetupSettings().diff, ['easy', 'medium', 'hard']);
    });

    it('a record whose settings are not an object is a record of defaults, not "nothing saved"', () => {
        for (const bad of [null, 'x', 7, [], undefined]) {
            store({ version: 1, settings: bad });
            assert.deepEqual(loadSetupSettings(), defaultSetupSettings(), JSON.stringify(bad));
        }
    });

    it('numbers JSON cannot hold but JSON.parse can produce (1e999 is Infinity) are not trusted', () => {
        store('{"version":1,"settings":{"playersCount":1e999,"timerMin":-1e999,"maxVotes":7}}');
        assert.deepEqual(loadSetupSettings(), settingsWith({ maxVotes: 7 }));
    });

    it('"__proto__" in the record does not pollute anything or reach the settings', () => {
        store('{"version":1,"__proto__":{"polluted":true},"settings":{"__proto__":{"playersCount":9,"polluted":true},"timerMin":6}}');
        assert.deepEqual(loadSetupSettings(), settingsWith({ timerMin: 6 }));
        assert.equal({}.polluted, undefined);
    });
});

describe('loadSetupSettings: nothing usable is null', () => {
    it('nothing saved', () => {
        assert.equal(loadSetupSettings(), null);
    });

    it('text that is not JSON, or JSON that is not a record', () => {
        for (const bad of ['{not json', '', '{"version":1,"settings":{', 'undefined', 'null', '[]', '[1,2]', '"text"', '42', 'true', '{}']) {
            env.storage.set(SETUP_SETTINGS_KEY, bad);
            assert.equal(loadSetupSettings(), null, JSON.stringify(bad));
        }
    });

    it('a record of another version (older, newer, missing, or not a number) is ignored whole', () => {
        for (const version of [0, 2, 99, -1, '1', null, true, undefined, [1]]) {
            store({ version, settings: NON_DEFAULT });
            assert.equal(loadSetupSettings(), null, `version ${JSON.stringify(version)}`);
        }
        store({ settings: NON_DEFAULT });
        assert.equal(loadSetupSettings(), null, 'no version at all');
    });

    it('a flat object of the settings (no record around it) is not accepted either', () => {
        store(NON_DEFAULT);
        assert.equal(loadSetupSettings(), null);
    });

    it('a storage that throws (reading it throws, or even asking for it)', () => {
        saveSetupSettings(NON_DEFAULT);
        assert.equal(withThrowingStorage(() => loadSetupSettings()), null);
        const real = globalThis.localStorage;
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('SecurityError');
            }
        });
        try {
            assert.equal(loadSetupSettings(), null);
        } finally {
            Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, enumerable: true, value: real });
        }
        assert.deepEqual(loadSetupSettings(), NON_DEFAULT, 'and it works again afterwards');
    });
});

// ---------------------------------------------------------------------------------------------------------------
// Saving when a match starts (ui/setup.js)
// ---------------------------------------------------------------------------------------------------------------

describe('validateAndSaveSettings: saving the setup', () => {
    it('saves the validated settings, and only them, when the form is valid', () => {
        assert.equal(fillAndValidate(NON_DEFAULT), true);
        const written = storedRecord();
        assert.equal(written.version, 1);
        assert.deepEqual(written.settings, NON_DEFAULT);
        const { detectiveUsed, ...fromState } = gameState.settings;
        assert.equal(detectiveUsed, false);
        assert.deepEqual(written.settings, fromState, 'the record is what gameState.settings now holds');
    });

    it('does not save the player names (they have their own key), nor anything of them', () => {
        assert.equal(fillAndValidate(NON_DEFAULT, ['Ali', 'Bita', 'Cyrus', 'Dara', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo']), true);
        const text = env.storage.get(SETUP_SETTINGS_KEY);
        for (const name of ['Ali', 'Bita', 'Cyrus', 'Dara', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo']) assert.ok(!text.includes(name), name);
        assert.deepEqual(Object.keys(storedRecord().settings), KEYS);
        assert.equal(JSON.parse(env.storage.get('spy_saved_player_names')).includes('Ali'), true, 'the names are still saved, in their own key');
    });

    it('saves what the player chose for every field, including the categories and the difficulty', () => {
        const chosen = settingsWith({ cats: ['events', 'custom'], diff: ['easy'], hints: ['none'], timerMin: 9 });
        assert.equal(fillAndValidate(chosen), true);
        assert.deepEqual(storedRecord().settings, chosen);
    });

    it('with no category ticked, saves the default list that the validation put back (never an empty one)', () => {
        applySetupSettingsToForm(defaultSetupSettings());
        for (const chip of form.chips['setup-cat']) chip.checked = false;
        readyToValidate();
        assert.equal(validateAndSaveSettings(), true);
        assert.deepEqual(storedRecord().settings.cats, BUILT_IN_CATEGORIES);
    });

    it('the emergency-vote limit is saved as the code stores it: the typed number only while its switch is on', () => {
        applySetupSettingsToForm(settingsWith({ voteLimitEnabled: true, maxVotes: 7 }));
        readyToValidate();
        assert.equal(validateAndSaveSettings(), true);
        assert.deepEqual([storedRecord().settings.voteLimitEnabled, storedRecord().settings.maxVotes], [true, 7]);

        applySetupSettingsToForm(settingsWith({ voteLimitEnabled: false, maxVotes: 7 }));
        readyToValidate();
        assert.equal(validateAndSaveSettings(), true);
        assert.deepEqual([storedRecord().settings.voteLimitEnabled, storedRecord().settings.maxVotes], [false, 2]);
    });

    it('a second match that starts replaces the record', () => {
        fillAndValidate(settingsWith({ timerMin: 3 }));
        fillAndValidate(settingsWith({ timerMin: 12, wager: true }));
        assert.deepEqual(storedRecord().settings, settingsWith({ timerMin: 12, wager: true }));
    });

    it('writes nothing when the validation fails (players, spies, timer, emergency votes, an empty or a repeated name)', () => {
        const fails = [
            ['players too few', () => { applySetupSettingsToForm(defaultSetupSettings()); env.el('setup-players-count').value = '2'; readyToValidate(); }],
            ['players too many', () => { applySetupSettingsToForm(defaultSetupSettings()); env.el('setup-players-count').value = '21'; readyToValidate(); }],
            ['spies too many', () => { applySetupSettingsToForm(defaultSetupSettings()); env.el('setup-spies-count').value = '2'; readyToValidate(); }],
            ['timer out of range', () => { applySetupSettingsToForm(defaultSetupSettings()); env.el('setup-timer').value = '16'; readyToValidate(); }],
            ['emergency votes out of range', () => { applySetupSettingsToForm(settingsWith({ voteLimitEnabled: true })); env.el('setup-max-votes').value = '11'; readyToValidate(); }],
            ['an empty name', () => { applySetupSettingsToForm(defaultSetupSettings()); readyToValidate(['Ali', '', 'Cyrus', 'Dara']); }],
            ['a repeated name', () => { applySetupSettingsToForm(defaultSetupSettings()); readyToValidate(['Ali', 'Bita', 'Ali', 'Dara']); }]
        ];
        for (const [label, arrange] of fails) {
            env.storage.clear();
            arrange();
            assert.equal(validateAndSaveSettings(), false, label);
            assert.equal(env.storage.has(SETUP_SETTINGS_KEY), false, `${label}: nothing is saved`);
        }
    });

    it('a failed attempt leaves the record of the last good start as it was', () => {
        fillAndValidate(settingsWith({ timerMin: 6 }));
        const before = env.storage.get(SETUP_SETTINGS_KEY);
        applySetupSettingsToForm(defaultSetupSettings());
        env.el('setup-timer').value = '99';
        readyToValidate();
        assert.equal(validateAndSaveSettings(), false);
        assert.equal(env.storage.get(SETUP_SETTINGS_KEY), before);
    });

    it('a storage that throws still lets the match start', () => {
        applySetupSettingsToForm(NON_DEFAULT);
        readyToValidate(Array.from({ length: 9 }, (_, i) => `N${i}`));
        assert.equal(withThrowingStorage(() => validateAndSaveSettings()), true);
        assert.deepEqual({ ...gameState.settings, detectiveUsed: undefined }, { ...NON_DEFAULT, detectiveUsed: undefined });
    });
});

describe('START_MATCH saves the setup', () => {
    it('a match that starts through the action leaves the record behind', () => {
        gameState.phase = 'setup';
        applySetupSettingsToForm(settingsWith({ playersCount: 5, spiesCount: 2, timerMin: 8, wager: true, cats: ['animals'] }));
        readyToValidate(['A', 'B', 'C', 'D', 'E']);
        handleAction({ type: 'START_MATCH' });
        assert.equal(gameState.phase, 'reveal');
        assert.deepEqual(storedRecord().settings, settingsWith({ playersCount: 5, spiesCount: 2, timerMin: 8, wager: true, cats: ['animals'] }));
    });

    it('a start that is refused saves nothing', () => {
        gameState.phase = 'setup';
        applySetupSettingsToForm(defaultSetupSettings());
        env.el('setup-players-count').value = '1';
        readyToValidate();
        handleAction({ type: 'START_MATCH' });
        assert.equal(gameState.phase, 'setup');
        assert.equal(env.storage.has(SETUP_SETTINGS_KEY), false);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// Putting the setup back into the form
// ---------------------------------------------------------------------------------------------------------------

describe('applySetupSettingsToForm', () => {
    it('shows every field of the settings in the form (and reading the form gives them back)', () => {
        applySetupSettingsToForm(NON_DEFAULT);
        assert.deepEqual(readForm(), NON_DEFAULT);
        assert.equal(env.el('setup-reveal-mode').value, 'hold');
        applySetupSettingsToForm(defaultSetupSettings());
        assert.deepEqual(readForm(), defaultSetupSettings());
        assert.equal(env.el('setup-reveal-mode').value, 'click');
    });

    it('writes the numbers as plain digits', () => {
        applySetupSettingsToForm(NON_DEFAULT);
        assert.deepEqual(
            ['setup-players-count', 'setup-spies-count', 'setup-timer', 'setup-max-votes'].map((id) => env.el(id).value),
            ['9', '3', '11', '6']
        );
    });

    it('gives the chips their pressed look and shows the emergency-vote box only while its switch is on', () => {
        applySetupSettingsToForm(NON_DEFAULT);
        const looks = (name) => form.chips[name].map((chip) => chip.wrap.classes.has('is-checked'));
        assert.deepEqual(looks('setup-cat'), CATEGORY_IDS.map((id) => NON_DEFAULT.cats.includes(id)));
        assert.deepEqual(looks('setup-diff'), DIFFICULTY_LEVELS.map((id) => NON_DEFAULT.diff.includes(id)));
        assert.deepEqual(looks('setup-hint'), HINT_TYPES.map((id) => NON_DEFAULT.hints.includes(id)));
        assert.equal(env.el('vote-limit-box').classList.contains('hidden'), false);
        applySetupSettingsToForm(defaultSetupSettings());
        assert.equal(env.el('vote-limit-box').classList.contains('hidden'), true);
    });

    it('sanitizes what it is given, so damaged settings can never reach the form', () => {
        applySetupSettingsToForm({ playersCount: 400, spiesCount: 400, timerMin: 'x', cats: ['bogus'], diff: [], hints: [], fool: 'yes' });
        assert.deepEqual(readForm(), settingsWith({ playersCount: 20, spiesCount: 5 }));
    });
});

describe('restoreSavedSetup: at start-up and after "new match"', () => {
    it('puts the saved setup into the form, with one name input per restored player', () => {
        store(record(NON_DEFAULT));
        assert.equal(restoreSavedSetup(), true);
        assert.deepEqual(readForm(), NON_DEFAULT);
        assert.equal(env.el('name-inputs-container').children.length, NON_DEFAULT.playersCount);
    });

    it('does not read or write the match: gameState is the same before and after', () => {
        store(record(NON_DEFAULT));
        const before = structuredClone(gameState);
        assert.equal(restoreSavedSetup(), true);
        assert.deepEqual(gameState, before);
        assert.deepEqual(gameState.settings, { ...defaultSetupSettings(), detectiveUsed: false });
    });

    it('with nothing saved, a corrupted record, another version or a throwing storage, leaves the form exactly as it is', () => {
        const typed = settingsWith({ playersCount: 7, spiesCount: 2, timerMin: 13, cats: ['foods'] });
        const arrange = () => applySetupSettingsToForm(typed);

        arrange();
        assert.equal(restoreSavedSetup(), false, 'nothing saved');
        assert.deepEqual(readForm(), typed);

        for (const bad of ['{broken', '[]', 'null', JSON.stringify({ version: 2, settings: NON_DEFAULT })]) {
            env.storage.set(SETUP_SETTINGS_KEY, bad);
            arrange();
            assert.equal(restoreSavedSetup(), false, bad);
            assert.deepEqual(readForm(), typed, bad);
        }

        store(record(NON_DEFAULT));
        arrange();
        assert.equal(withThrowingStorage(() => restoreSavedSetup()), false, 'a storage that throws');
        assert.deepEqual(readForm(), typed);
    });

    it('a record with some damaged fields restores the good ones and gives the damaged ones their defaults', () => {
        applySetupSettingsToForm(settingsWith({ timerMin: 13, cats: ['foods'], diff: ['easy'] }));
        store(record({ playersCount: 6, spiesCount: 9, timerMin: 'soon', cats: ['atlantis'], diff: [], wager: true }));
        assert.equal(restoreSavedSetup(), true);
        assert.deepEqual(readForm(), settingsWith({ playersCount: 6, spiesCount: 2, wager: true }));
    });

    it('never touches the form while a match is running, in any phase after setup', () => {
        const typed = settingsWith({ playersCount: 7, timerMin: 13 });
        store(record(NON_DEFAULT));
        for (const phase of ['reveal', 'timer', 'vote', 'wager', 'guess', 'result', 'leaderboard', 'not-a-phase']) {
            applySetupSettingsToForm(typed);
            gameState.phase = phase;
            assert.equal(restoreSavedSetup(), false, phase);
            assert.deepEqual(readForm(), typed, phase);
        }
        for (const phase of ['welcome', 'setup']) {
            applySetupSettingsToForm(typed);
            gameState.phase = phase;
            assert.equal(restoreSavedSetup(), true, phase);
            assert.deepEqual(readForm(), NON_DEFAULT, phase);
        }
    });

    it('the whole round trip: a match that starts, then the page is opened again', () => {
        assert.equal(fillAndValidate(NON_DEFAULT), true);
        const savedNames = env.storage.get('spy_saved_player_names');
        // A new page: the form is back at the page's own values, memory is empty, storage stays.
        resetSingletons();
        form = buildForm();
        assert.deepEqual(readForm(), defaultSetupSettings());
        assert.equal(restoreSavedSetup(), true);
        assert.deepEqual(readForm(), NON_DEFAULT);
        assert.equal(env.storage.get('spy_saved_player_names'), savedNames, 'the names were not rewritten by the restore');
    });
});

// ---------------------------------------------------------------------------------------------------------------
// A match that is already running or resumed keeps its own settings
// ---------------------------------------------------------------------------------------------------------------

/** Save a running match whose settings are `matchSettings`, wipe memory as a reload does, and press "resume". */
function resumeMatchWith(matchSettings) {
    gameState.players = makePlayers(matchSettings.playersCount);
    gameState.phase = 'reveal';
    gameState.settings = { ...matchSettings, detectiveUsed: false };
    const savedMatch = JSON.stringify({ version: SAVE_VERSION, state: gameState, secrets: serializeSecrets() });
    resetSingletons();
    env.storage.set('spy_full_state_master', savedMatch);
    handleAction({ type: 'RESTORE_GAME' });
}

describe('RESTORE_GAME and the saved setup', () => {
    const MATCH = settingsWith({ playersCount: 5, spiesCount: 2, timerMin: 9, cats: ['animals'], diff: ['hard'], wager: true, quickVoting: true });
    const NEXT = settingsWith({ playersCount: 12, spiesCount: 4, timerMin: 2, cats: ['events'], diff: ['easy'], director: true, spyLastChance: false });

    it('a resumed match keeps the settings it was saved with, whatever setup is saved for the next one', () => {
        store(record(NEXT));
        const recordBefore = env.storage.get(SETUP_SETTINGS_KEY);
        resumeMatchWith(MATCH);
        assert.equal(gameState.phase, 'reveal');
        assert.deepEqual(gameState.settings, { ...MATCH, detectiveUsed: false });
        assert.equal(env.storage.get(SETUP_SETTINGS_KEY), recordBefore, 'and the saved setup is not touched by the resume');
        assert.equal(gameState.players.length, MATCH.playersCount);
    });

    it('nothing after the resume puts the saved setup over the running match either', () => {
        store(record(NEXT));
        resumeMatchWith(MATCH);
        applySetupSettingsToForm(MATCH);
        assert.equal(restoreSavedSetup(), false, 'restoring the form is refused while the resumed match runs');
        assert.deepEqual(readForm(), MATCH, 'the form is untouched');
        assert.deepEqual(gameState.settings, { ...MATCH, detectiveUsed: false });
    });

    it('resuming with no saved setup, or a corrupted one, works the same', () => {
        resumeMatchWith(MATCH);
        assert.deepEqual(gameState.settings, { ...MATCH, detectiveUsed: false });
        env.storage.set(SETUP_SETTINGS_KEY, '{broken');
        resumeMatchWith(MATCH);
        assert.deepEqual(gameState.settings, { ...MATCH, detectiveUsed: false });
    });
});

describe('RESET_MATCH ("new match") puts the saved setup back and keeps it', () => {
    function arrangeFinishedMatch() {
        gameState.players = makePlayers(4);
        gameState.phase = 'leaderboard';
    }

    it('the form shows the saved setup again after the match, not what the form last held', () => {
        saveSetupSettings(NON_DEFAULT);
        applySetupSettingsToForm(settingsWith({ playersCount: 6, timerMin: 14 }));
        arrangeFinishedMatch();
        handleAction({ type: 'RESET_MATCH' });
        assert.equal(gameState.phase, 'welcome');
        assert.deepEqual(gameState.players, []);
        assert.deepEqual(readForm(), NON_DEFAULT);
        assert.equal(env.el('name-inputs-container').children.length, NON_DEFAULT.playersCount);
    });

    it('with nothing usable saved it leaves the form as the player had it', () => {
        const typed = settingsWith({ playersCount: 6, spiesCount: 2, timerMin: 14 });
        applySetupSettingsToForm(typed);
        arrangeFinishedMatch();
        handleAction({ type: 'RESET_MATCH' });
        assert.deepEqual(readForm(), typed);
        applySetupSettingsToForm(typed);
        env.storage.set(SETUP_SETTINGS_KEY, '{broken');
        arrangeFinishedMatch();
        handleAction({ type: 'RESET_MATCH' });
        assert.deepEqual(readForm(), typed);
    });

    it('ending, discarding or resetting a match does not delete the saved setup', () => {
        saveSetupSettings(NON_DEFAULT);
        env.storage.set('spy_full_state_master', '{}');
        for (const type of ['END_MATCH', 'DISCARD_GAME', 'RESET_MATCH']) {
            arrangeFinishedMatch();
            handleAction({ type });
            assert.deepEqual(loadSetupSettings(), NON_DEFAULT, type);
        }
        assert.equal(env.storage.has('spy_full_state_master'), false, 'while the saved match itself is deleted');
    });
});
