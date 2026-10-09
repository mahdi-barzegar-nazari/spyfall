/**
 * Item "saved names and the custom-word hint": two kinds of stored text must not stay frozen in the language
 * they were written in.
 *
 *  - A player name that is just the default of its slot ("بازیکن 3" / "Player 3", built from
 *    `setup.player.default` of ANY supported language) is never saved, and a saved one is read as "no saved
 *    name", so the slot gets the default of the language that is active. A name the user typed is kept as is.
 *  - A custom word with no hint stores '' (not the "no hint" text of one language); the text is worded in the
 *    active language when it is shown or put on a role card. A legacy stored "no hint" text of any language
 *    reads the same way.
 *
 * Everything runs on the fake browser of helpers/fakeEnv.mjs: the setup form, the custom-word form and list,
 * and the role cards that startNextRound builds.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { hostSecretState, gameState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { cleanCustomWord, displayHint, getCustomWords, isDefaultPlayerName, isDefaultPlayerNameOfOtherLanguage, loadSavedNames, saveCurrentNames } =
    await import('../../js/core/storage.js');
const { renderNameInputs } = await import('../../js/ui/setup.js');
const { addCustomWordDOM, renderCustomWordsList } = await import('../../js/ui/customWords.js');
const { startNextRound } = await import('../../js/game/rounds.js');
const { setLang, t } = await import('../../js/i18n/index.js');

useGameHarness(env);
after(() => env.uninstall());
afterEach(() => setLang('fa'));

const NAMES_KEY = 'spy_saved_player_names';
const WORDS_KEY = 'spy_custom_words';
const storedNames = () => JSON.parse(env.storage.get(NAMES_KEY));

// ---------------------------------------------------------------------------------------------------------------
// the setup form on the fake DOM
// ---------------------------------------------------------------------------------------------------------------

/**
 * The name-input container and the player-count field of the setup screen, as `renderNameInputs` uses them.
 * Calling it again is a fresh page load: the container starts empty (draw twice on the same form to model a
 * re-draw within one page).
 */
function setupForm(count) {
    env.el('setup-players-count').value = String(count);
    const container = env.el('name-inputs-container');
    container.children = [];
    container.querySelectorAll = () => container.children;
    // `container.innerHTML = ''` empties the real container; do the same here.
    Object.defineProperty(container, 'innerHTML', {
        configurable: true,
        get: () => '',
        set: () => {
            container.children.forEach((child) => {
                child.parent = null;
            });
            container.children = [];
        }
    });
    return container;
}

const values = (container) => container.children.map((input) => input.value);
const ids = (container) => container.children.map((input) => input.dataset.playerId);

// ---------------------------------------------------------------------------------------------------------------
// what counts as a default name
// ---------------------------------------------------------------------------------------------------------------

describe('isDefaultPlayerName', () => {
    it('recognises the default of every supported language, whichever language is active', () => {
        for (const active of ['fa', 'en']) {
            setLang(active);
            for (const name of ['Player 1', 'Player 3', 'Player 20', 'بازیکن 1', 'بازیکن 3', 'بازیکن 20']) {
                assert.equal(isDefaultPlayerName(name), true, `${name} while ${active} is active`);
            }
        }
    });

    it('accepts Persian and Arabic-Indic digits and ignores surrounding spaces', () => {
        for (const name of ['بازیکن ۳', 'Player ۳', 'Player ٣', '  Player 3  ', '\tبازیکن 12\n']) {
            assert.equal(isDefaultPlayerName(name), true, JSON.stringify(name));
        }
    });

    it('never takes a name the user typed for a default', () => {
        for (const name of ['Ali', 'سارا', 'Player', 'بازیکن', 'Player 3 the Great', 'The Player 3', 'player 3', 'PLAYER 3', 'Player 3.5', 'Player a', 'Player 3b', 'Player  3', 'Player-3', 'بازیکن سوم', 'Player ', '', '   ']) {
            assert.equal(isDefaultPlayerName(name), false, JSON.stringify(name));
        }
        for (const notText of [null, undefined, 3, {}, ['Player 3'], true]) assert.equal(isDefaultPlayerName(notText), false, String(notText));
    });

    it('"of another language" leaves out the active language\'s own default', () => {
        setLang('en');
        assert.equal(isDefaultPlayerNameOfOtherLanguage('بازیکن 3'), true);
        assert.equal(isDefaultPlayerNameOfOtherLanguage('Player 3'), false);
        assert.equal(isDefaultPlayerNameOfOtherLanguage('Ali'), false);
        setLang('fa');
        assert.equal(isDefaultPlayerNameOfOtherLanguage('Player 3'), true);
        assert.equal(isDefaultPlayerNameOfOtherLanguage('بازیکن 3'), false);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// saving and loading names
// ---------------------------------------------------------------------------------------------------------------

describe('saveCurrentNames', () => {
    it('does not save a default name, in either language, whichever language is active: the slot keeps its place', () => {
        for (const active of ['fa', 'en']) {
            setLang(active);
            saveCurrentNames(['Player 1', 'Ali', 'بازیکن 3', 'Bita', 'Player 5']);
            assert.deepEqual(storedNames(), ['', 'Ali', '', 'Bita', ''], active);
        }
    });

    it('keeps a name the user typed exactly as it is, including spaces and look-alikes of a default', () => {
        saveCurrentNames([' Ali ', 'Player 3 the Great', 'سارا', 'player 3', 'Player']);
        assert.deepEqual(storedNames(), [' Ali ', 'Player 3 the Great', 'سارا', 'player 3', 'Player']);
    });

    it('a form of only default names saves no name at all', () => {
        setLang('en');
        saveCurrentNames(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
        assert.deepEqual(storedNames(), ['', '', '', '']);
    });
});

describe('loadSavedNames', () => {
    it('reads a default name of ANY language as "no saved name" (legacy data), and keeps typed names', () => {
        env.storage.set(NAMES_KEY, JSON.stringify(['بازیکن 1', 'Ali', 'Player 3', 'بازیکن ۴', 'Player 3 the Great']));
        for (const active of ['fa', 'en']) {
            setLang(active);
            assert.deepEqual(loadSavedNames(), ['', 'Ali', '', '', 'Player 3 the Great'], active);
        }
    });

    it('still returns [] for missing, broken or non-list data, and leaves other entries alone', () => {
        assert.deepEqual(loadSavedNames(), []);
        env.storage.set(NAMES_KEY, '{not json');
        assert.deepEqual(loadSavedNames(), []);
        env.storage.set(NAMES_KEY, JSON.stringify({ 0: 'Player 1' }));
        assert.deepEqual(loadSavedNames(), []);
        env.storage.set(NAMES_KEY, JSON.stringify([null, 5, 'Ali']));
        assert.deepEqual(loadSavedNames(), [null, 5, 'Ali']);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// drawing the inputs
// ---------------------------------------------------------------------------------------------------------------

describe('renderNameInputs: a saved default takes the language of the page (both directions)', () => {
    it('legacy Persian defaults saved earlier: an English page shows English defaults and keeps typed names', () => {
        env.storage.set(NAMES_KEY, JSON.stringify(['بازیکن 1', 'Ali', 'بازیکن 3', 'بازیکن 4']));
        setLang('en');
        const form = setupForm(4);
        renderNameInputs();
        assert.deepEqual(values(form), ['Player 1', 'Ali', 'Player 3', 'Player 4']);
    });

    it('legacy English defaults saved earlier: a Persian page shows Persian defaults and keeps typed names', () => {
        env.storage.set(NAMES_KEY, JSON.stringify(['Player 1', 'سارا', 'Player 3', 'Player 4']));
        setLang('fa');
        const form = setupForm(4);
        renderNameInputs();
        assert.deepEqual(values(form), ['بازیکن 1', 'سارا', 'بازیکن 3', 'بازیکن 4']);
    });

    it('names saved by the new code in one language read in the other: a typed name stays, a default follows the page', () => {
        setLang('en');
        saveCurrentNames(['Player 1', 'Ali', 'Player 3']);
        setLang('fa');
        const form = setupForm(3);
        renderNameInputs();
        assert.deepEqual(values(form), ['بازیکن 1', 'Ali', 'بازیکن 3']);

        saveCurrentNames(values(form));
        setLang('en');
        const again = setupForm(3);
        renderNameInputs();
        assert.deepEqual(values(again), ['Player 1', 'Ali', 'Player 3']);
    });

    it('more slots than saved names: the rest get the default of the active language', () => {
        saveCurrentNames(['Ali', 'Bita']);
        setLang('en');
        const form = setupForm(4);
        renderNameInputs();
        assert.deepEqual(values(form), ['Ali', 'Bita', 'Player 3', 'Player 4']);
    });

    it('with Persian active and nothing saved the form is what it always was', () => {
        const form = setupForm(5);
        renderNameInputs();
        assert.deepEqual(values(form), ['بازیکن 1', 'بازیکن 2', 'بازیکن 3', 'بازیکن 4', 'بازیکن 5']);
        assert.ok(ids(form).every(Boolean) && new Set(ids(form)).size === 5);
    });

    it('"defaults" (forceDefault) writes the default of the active language in every slot', () => {
        env.storage.set(NAMES_KEY, JSON.stringify(['Ali', 'Bita', 'Cyrus']));
        setLang('en');
        const form = setupForm(3);
        renderNameInputs(true);
        assert.deepEqual(values(form), ['Player 1', 'Player 2', 'Player 3']);
    });
});

describe('renderNameInputs: a language change (relocalize)', () => {
    it('without it, drawing again keeps what the inputs hold, as before (a count change must not touch names)', () => {
        setLang('en');
        const form = setupForm(3);
        renderNameInputs();
        form.children[1].value = 'Ali';
        setLang('fa');
        renderNameInputs();
        assert.deepEqual(values(form), ['Player 1', 'Ali', 'Player 3']);
    });

    it('with it, a default of the other language becomes the default of the new one; typed names and ids stay', () => {
        setLang('en');
        const form = setupForm(4);
        renderNameInputs();
        form.children[1].value = 'Ali';
        form.children[3].value = 'بازیکن 4 ';
        const before = ids(form);
        setLang('fa');
        renderNameInputs(false, true);
        assert.deepEqual(values(form), ['بازیکن 1', 'Ali', 'بازیکن 3', 'بازیکن 4']);
        assert.deepEqual(ids(form), before, 'the same players keep their ids');
    });

    it('works from Persian to English too, and leaves the active language\'s own defaults and typed look-alikes alone', () => {
        setLang('fa');
        const form = setupForm(4);
        renderNameInputs();
        form.children[1].value = 'Player 3 the Great';
        form.children[2].value = 'Zed';
        setLang('en');
        renderNameInputs(false, true);
        assert.deepEqual(values(form), ['Player 1', 'Player 3 the Great', 'Zed', 'Player 4']);

        // Already English: nothing is another language's default, so nothing changes.
        const snapshot = values(form);
        renderNameInputs(false, true);
        assert.deepEqual(values(form), snapshot);
    });

    it('a swapped slot takes a typed saved name before the default', () => {
        setLang('en');
        const form = setupForm(3);
        renderNameInputs();
        const before = ids(form);
        saveCurrentNames(['Ali', 'Player 2', 'Player 3']);
        setLang('fa');
        renderNameInputs(false, true);
        assert.deepEqual(values(form), ['Ali', 'بازیکن 2', 'بازیکن 3']);
        assert.deepEqual(ids(form), before, 'the slot that took a saved name and the slots that took a default keep their ids');
    });
});

// ---------------------------------------------------------------------------------------------------------------
// drawing the inputs IN PLACE: the count field's `change` fires while a name input is being tapped, so the
// tapped element must survive (the "first tap does nothing" bug)
// ---------------------------------------------------------------------------------------------------------------

describe('renderNameInputs: updates the existing inputs in place', () => {
    /** The count the person types, then the draw that the count field's `change` event runs. */
    function changeCount(form, count) {
        env.el('setup-players-count').value = String(count);
        renderNameInputs(false);
    }

    it('more players: the old inputs are the same elements with the same values and ids, new ones are added at the end', () => {
        const form = setupForm(4);
        renderNameInputs();
        form.children[1].value = 'Ali';
        const before = [...form.children];
        const beforeIds = ids(form);

        changeCount(form, 6);

        assert.equal(form.children.length, 6);
        before.forEach((input, i) => assert.equal(form.children[i], input, `slot ${i + 1} is the same element`));
        assert.deepEqual(ids(form).slice(0, 4), beforeIds, 'the same players keep their ids');
        assert.deepEqual(values(form), ['بازیکن 1', 'Ali', 'بازیکن 3', 'بازیکن 4', 'بازیکن 5', 'بازیکن 6']);
        assert.ok(ids(form).every(Boolean) && new Set(ids(form)).size === 6, 'the new slots have their own ids');
        assert.ok(form.children.every((input) => input.parent === form), 'every input is attached to the container');
    });

    it('fewer players: only the slots at the end are removed; the others are untouched elements', () => {
        const form = setupForm(5);
        renderNameInputs();
        form.children[0].value = 'Sara';
        const before = [...form.children];
        const beforeIds = ids(form);

        changeCount(form, 3);

        assert.equal(form.children.length, 3);
        before.slice(0, 3).forEach((input, i) => assert.equal(form.children[i], input, `slot ${i + 1} is the same element`));
        assert.deepEqual(ids(form), beforeIds.slice(0, 3));
        assert.deepEqual(values(form), ['Sara', 'بازیکن 2', 'بازیکن 3']);
        before.slice(3).forEach((input) => assert.equal(input.parent, null, 'a removed slot is detached'));
    });

    it('the same count again changes nothing: no element is replaced and no value is written', () => {
        const form = setupForm(4);
        renderNameInputs();
        form.children[2].value = 'Zed ';
        const writes = [];
        form.children.forEach((input, i) => {
            let current = input.value;
            Object.defineProperty(input, 'value', {
                configurable: true,
                get: () => current,
                set: (v) => {
                    writes.push(`${i}:${v}`);
                    current = v;
                }
            });
        });
        const before = [...form.children];

        changeCount(form, 4);

        before.forEach((input, i) => assert.equal(form.children[i], input));
        // Only the one value that has something to trim is written (as it always was); the rest keep their caret.
        assert.deepEqual(writes, ['2:Zed']);
    });

    it('a typed name and its element survive any number of count changes', () => {
        const form = setupForm(4);
        renderNameInputs();
        const second = form.children[1];
        second.value = 'Ali';
        const secondId = second.dataset.playerId;
        for (const count of [10, 3, 20, 4, 7]) {
            changeCount(form, count);
            assert.equal(form.children[1], second, `still the same element at ${count} players`);
            assert.equal(second.value, 'Ali');
            assert.equal(second.dataset.playerId, secondId);
        }
    });

    it('a slot that was emptied is refilled (a saved name first, else the default), as before, and keeps its element and id', () => {
        saveCurrentNames(['', 'Bita']);
        const form = setupForm(3);
        renderNameInputs();
        const [first, second] = form.children;
        const firstId = first.dataset.playerId;
        first.value = '   ';
        second.value = '';

        changeCount(form, 3);

        assert.equal(form.children[0], first);
        assert.equal(first.value, 'بازیکن 1');
        assert.equal(first.dataset.playerId, firstId);
        assert.equal(second.value, 'Bita');
    });

    it('"defaults" (forceDefault) resets every slot to the default with a new id, wherever the names came from', () => {
        const form = setupForm(4);
        renderNameInputs();
        form.children[0].value = 'Ali';
        form.children[3].value = 'Cyrus';
        const beforeIds = ids(form);

        renderNameInputs(true);

        assert.deepEqual(values(form), ['بازیکن 1', 'بازیکن 2', 'بازیکن 3', 'بازیکن 4']);
        const after = ids(form);
        assert.ok(after.every(Boolean) && new Set(after).size === 4, 'unique ids');
        assert.ok(after.every((id, i) => id !== beforeIds[i]), 'every slot is a new player');
    });

    it('a language change redraws the placeholder and the accessible name of EVERY input, typed names included', () => {
        setLang('en');
        const form = setupForm(3);
        renderNameInputs();
        form.children[1].value = 'Ali';
        const before = [...form.children];

        setLang('fa');
        renderNameInputs(false, true);

        before.forEach((input, i) => assert.equal(form.children[i], input));
        assert.deepEqual(
            form.children.map((input) => input.placeholder),
            [1, 2, 3].map((n) => t('setup.player.placeholder', { n }))
        );
        assert.deepEqual(
            form.children.map((input) => input.getAttribute('aria-label')),
            [1, 2, 3].map((n) => t('setup.player.aria', { n }))
        );
        assert.ok(form.children.every((input) => !/[A-Za-z]/.test(input.placeholder)), 'the placeholders are Persian now');
        assert.equal(form.children[1].value, 'Ali');
    });

    it('a count outside the allowed range is clamped, and a Persian digit is read, exactly as before', () => {
        const form = setupForm(4);
        renderNameInputs();
        env.el('setup-players-count').value = '99';
        renderNameInputs();
        assert.equal(form.children.length, 20);
        assert.equal(env.el('setup-players-count').value, 20);
        env.el('setup-players-count').value = '۵';
        renderNameInputs();
        assert.equal(form.children.length, 5);
        env.el('setup-players-count').value = '1';
        renderNameInputs();
        assert.equal(form.children.length, 3);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// the custom-word hint
// ---------------------------------------------------------------------------------------------------------------

describe('cleanCustomWord: no hint is stored as an empty string', () => {
    it('stores "" when the hint is missing, empty or only spaces, in either language', () => {
        for (const active of ['fa', 'en']) {
            setLang(active);
            for (const hint of [undefined, null, '', '   ', 0, false]) {
                const word = cleanCustomWord({ word: 'Zulu', foolWord: 'Zebra', hint });
                assert.equal(word.hint, '', `${active}: ${JSON.stringify(hint)}`);
                assert.deepEqual(Object.keys(word).sort(), ['diff', 'foolWord', 'hint', 'word']);
            }
        }
    });

    it('keeps a hint that was given, and every other rule as before', () => {
        assert.deepEqual(cleanCustomWord({ word: ' Zulu ', foolWord: '', hint: ' z ', diff: 'hard' }), { word: 'Zulu', foolWord: 'Zulu', hint: 'z', diff: 'hard' });
        assert.deepEqual(cleanCustomWord({ word: 'Zulu' }), { word: 'Zulu', foolWord: 'Zulu', hint: '', diff: 'medium' });
        assert.equal(cleanCustomWord({ word: 'x'.repeat(31) }), null);
        assert.equal(cleanCustomWord({ word: 'a', hint: 'h'.repeat(31) }), null);
        assert.equal(cleanCustomWord(null), null);
    });

    it('leaves a legacy stored "no hint" text as it is stored (it is worded when shown, not rewritten)', () => {
        setLang('en');
        assert.equal(cleanCustomWord({ word: 'Zulu', hint: 'بدون راهنما' }).hint, 'بدون راهنما');
    });
});

describe('displayHint', () => {
    it('words an empty hint, and a legacy "no hint" text of ANY language, in the active language', () => {
        for (const stored of ['', '   ', undefined, null, 'بدون راهنما', 'No hint', '  No hint ']) {
            setLang('fa');
            assert.equal(displayHint(stored), 'بدون راهنما', JSON.stringify(stored));
            setLang('en');
            assert.equal(displayHint(stored), 'No hint', JSON.stringify(stored));
        }
    });

    it('shows a hint the user wrote as it is, in either language', () => {
        for (const active of ['fa', 'en']) {
            setLang(active);
            assert.equal(displayHint('Pen'), 'Pen');
            assert.equal(displayHint('قلم'), 'قلم');
            assert.equal(displayHint('No hint at all'), 'No hint at all');
        }
    });
});

describe('the custom-word form and list', () => {
    function customForm({ word, fool = '', hint = '' }) {
        env.el('cust-word').value = word;
        env.el('cust-fool').value = fool;
        env.el('cust-hint').value = hint;
        env.el('cust-count-label');
        env.el('toast-container');
        const list = env.el('custom-words-list');
        Object.defineProperty(list, 'innerHTML', {
            configurable: true,
            get: () => '',
            set: () => {
                list.children = [];
            }
        });
        return list;
    }
    /** The hint text of the first row of the list, "(…)" without the brackets. */
    const shownHint = (list) => list.children[0].children[0].innerHTML.match(/<span[^>]*>\((.*)\)<\/span>/)[1];

    it('a word added with no hint is stored with "" and listed with the "no hint" text of the active language', () => {
        setLang('en');
        const list = customForm({ word: 'Zulu', fool: 'Zebra' });
        addCustomWordDOM();
        assert.deepEqual(JSON.parse(env.storage.get(WORDS_KEY)), [{ word: 'Zulu', foolWord: 'Zebra', hint: '', diff: 'medium' }]);
        assert.equal(shownHint(list), 'No hint');

        setLang('fa');
        renderCustomWordsList();
        assert.equal(shownHint(list), 'بدون راهنما');
    });

    it('Persian looks as it always did: a word with no hint is listed as "(بدون راهنما)"', () => {
        const list = customForm({ word: 'قلم', fool: 'مداد' });
        addCustomWordDOM();
        assert.equal(shownHint(list), 'بدون راهنما');
        assert.equal(getCustomWords()[0].hint, '');
    });

    it('a word added with a hint keeps it, and a hint that is too long is still refused', () => {
        setLang('en');
        const list = customForm({ word: 'Zulu', hint: 'Warrior' });
        addCustomWordDOM();
        assert.equal(getCustomWords()[0].hint, 'Warrior');
        assert.equal(shownHint(list), 'Warrior');

        customForm({ word: 'Other', hint: 'h'.repeat(31) });
        addCustomWordDOM();
        assert.equal(getCustomWords().length, 1);
    });

    it('a legacy stored "no hint" text is listed in the active language', () => {
        env.storage.set(WORDS_KEY, JSON.stringify([{ word: 'قلم', foolWord: 'مداد', hint: 'بدون راهنما', diff: 'medium' }]));
        setLang('en');
        const list = customForm({ word: '' });
        renderCustomWordsList();
        assert.equal(shownHint(list), 'No hint');
    });
});

describe('role cards: a custom word with no hint', () => {
    const arrange = (words, settings = {}) => {
        env.storage.set(WORDS_KEY, JSON.stringify(words));
        gameState.players = makePlayers(5);
        Object.assign(gameState.settings, { cats: ['custom'], hints: ['related_word'] }, settings);
    };
    const spyHint = () => {
        const spy = gameState.players.find((p) => p.role === 'spy');
        return hostSecretState.roles[spy.id];
    };
    const NO_HINT = { fa: 'بدون راهنما', en: 'No hint' };

    it('shows the "no hint" text of the active language for an empty hint', () => {
        for (const lang of ['fa', 'en']) {
            setLang(lang);
            arrange([{ word: 'Zulu', foolWord: 'Zebra', hint: '', diff: 'medium' }]);
            startNextRound();
            assert.equal(spyHint().hint, NO_HINT[lang], lang);
            assert.equal(hostSecretState.hint, NO_HINT[lang], lang);
        }
    });

    it('shows it for a word stored with no hint field at all', () => {
        setLang('en');
        arrange([{ word: 'Zulu', foolWord: 'Zebra' }]);
        startNextRound();
        assert.equal(spyHint().hint, 'No hint');
    });

    it('a legacy stored word: the "no hint" text of the OTHER language is worded in the active one, both ways', () => {
        setLang('en');
        arrange([{ word: 'Zulu', foolWord: 'Zebra', hint: 'بدون راهنما', diff: 'medium' }]);
        startNextRound();
        assert.equal(spyHint().hint, 'No hint');

        setLang('fa');
        arrange([{ word: 'Zulu', foolWord: 'Zebra', hint: 'No hint', diff: 'medium' }]);
        startNextRound();
        assert.equal(spyHint().hint, 'بدون راهنما');
    });

    it('a legacy word saved in Persian and played in Persian is exactly what it was', () => {
        setLang('fa');
        arrange([{ word: 'قلم', foolWord: 'مداد', hint: 'بدون راهنما', diff: 'medium' }]);
        startNextRound();
        assert.equal(spyHint().hint, 'بدون راهنما');
        assert.equal(spyHint().hintTitle, 'کلمه مرتبط راهنما:');
        assert.equal(hostSecretState.secretWord, 'قلم');
    });

    it('a hint the user wrote is shown as written, in either language', () => {
        for (const lang of ['fa', 'en']) {
            setLang(lang);
            arrange([{ word: 'Zulu', foolWord: 'Zebra', hint: 'Warrior', diff: 'medium' }]);
            startNextRound();
            assert.equal(spyHint().hint, 'Warrior', lang);
        }
    });

    it('the other hint types do not depend on the stored hint at all', () => {
        setLang('en');
        arrange([{ word: 'Zulu', foolWord: 'Zebra', hint: '', diff: 'medium' }], { hints: ['first_letter'] });
        startNextRound();
        assert.equal(spyHint().hint, '“Z”');
    });
});
