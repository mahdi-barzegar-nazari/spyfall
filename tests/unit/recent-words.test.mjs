/**
 * Tests for remembering the secret words of the last matches (`spy_recent_words`): the two storage functions in
 * core/storage.js, the pure selection rule `selectableWords` and `startNextRound` in game/rounds.js.
 *
 * Randomness is seeded (env.seedRandom), so every run replays the same sequences. A new match is started the way
 * START_MATCH does it for the word list (`usedWordKeys = []`, see `playMatch`); START_MATCH itself needs the whole
 * setup form and is not touched by this feature.
 *
 * About the numbers: the recent list is only used while the words that are neither used in this match nor recent are
 * at least half of the pool (`fresh * 2 >= pool.length`). With N words in the pool, a round is therefore protected
 * as long as the words used in the match plus the recent ones (they overlap) number at most N / 2; the tests that
 * promise "no repeat" stay inside that.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { WORD_PACKS_EN } from '../../js/data/wordPacksEn.js';
import { setLang } from '../../js/i18n/index.js';
import { normalizeWord } from '../../js/utils/text.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { selectableWords, startNextRound } = await import('../../js/game/rounds.js');
const { RECENT_WORDS_KEY, RECENT_WORDS_LIMIT, RECENT_WORD_MAX_LENGTH, loadRecentWords, rememberRecentWord } = await import(
    '../../js/core/storage.js'
);
useGameHarness(env);
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

/** The key of the i-th word of `customWords`: its text (already normalized). */
const keyOf = (i) => `w${String(i).padStart(3, '0')}`;

/** `n` custom words w000, w001, ... (custom words ignore the difficulty setting, so the pool is exactly these). */
const customWords = (n) => Array.from({ length: n }, (_, i) => ({ word: keyOf(i), foolWord: `f${i}`, hint: 'h', diff: 'medium' }));

/** Five players, the given custom words stored, and the settings on top of "custom words only". */
function arrange({ words, settings = {} } = {}) {
    if (words) env.storage.set('spy_custom_words', JSON.stringify(words));
    gameState.players = makePlayers(5);
    Object.assign(gameState.settings, { cats: ['custom'] }, settings);
}

/** A new match as START_MATCH leaves the word list (app/actions.js), then `rounds` rounds; the words, in draw order. */
function playMatch(rounds) {
    gameState.match.usedWordKeys = [];
    gameState.round.num = 0;
    const drawn = [];
    for (let round = 0; round < rounds; round++) {
        startNextRound();
        drawn.push(hostSecretState.secretWord);
    }
    return drawn;
}

/** What is in localStorage under the recent-words key, parsed. */
const stored = () => JSON.parse(env.storage.get(RECENT_WORDS_KEY));

/** Put keys (or any text) under the recent-words key. */
const seedRecent = (value) => env.storage.set(RECENT_WORDS_KEY, typeof value === 'string' ? value : JSON.stringify(value));

/** Keys 'k0'..'k{n-1}'. */
const keys = (n, prefix = 'k') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Pool entries for the pure rule: only `word` matters. */
const poolOf = (words) => words.map((word) => ({ word }));

const overlap = (a, b) => a.filter((word) => b.includes(word));

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
// core/storage.js
// ---------------------------------------------------------------------------------------------------------------

describe('loadRecentWords / rememberRecentWord', () => {
    it('the key and the limit are what the feature promises', () => {
        assert.equal(RECENT_WORDS_KEY, 'spy_recent_words');
        assert.equal(RECENT_WORDS_LIMIT, 300);
    });

    it('nothing stored reads as an empty list', () => {
        assert.deepEqual(loadRecentWords(), []);
    });

    it('keeps the keys as a JSON array, the newest last', () => {
        rememberRecentWord('one');
        rememberRecentWord('two');
        rememberRecentWord('three');
        assert.deepEqual(stored(), ['one', 'two', 'three']);
        assert.deepEqual(loadRecentWords(), ['one', 'two', 'three']);
    });

    it('a key that is already there moves to the end, and is in the list once', () => {
        seedRecent(['a', 'b', 'c']);
        rememberRecentWord('a');
        assert.deepEqual(stored(), ['b', 'c', 'a']);
        rememberRecentWord('a');
        assert.deepEqual(stored(), ['b', 'c', 'a']);
    });

    it('is cut to the newest 300 when written: 305 keys leave the last 300, in order', () => {
        const all = keys(305);
        all.forEach(rememberRecentWord);
        const raw = stored();
        assert.equal(raw.length, RECENT_WORDS_LIMIT);
        assert.deepEqual(raw, all.slice(5));
    });

    it('a key written to a list of exactly 300 pushes out only the oldest', () => {
        seedRecent(keys(300));
        rememberRecentWord('fresh');
        const raw = stored();
        assert.equal(raw.length, 300);
        assert.equal(raw[0], 'k1');
        assert.equal(raw[299], 'fresh');
    });

    it('a list that is too long in the store (written by something else) reads as its newest 300', () => {
        seedRecent(keys(450));
        const list = loadRecentWords();
        assert.equal(list.length, RECENT_WORDS_LIMIT);
        assert.deepEqual(list, keys(450).slice(150));
    });

    it('a repeated key in the store counts once, at its newest place', () => {
        seedRecent(['a', 'b', 'a', 'c']);
        assert.deepEqual(loadRecentWords(), ['b', 'a', 'c']);
    });

    it('anything that is not a JSON array reads as an empty list', () => {
        for (const text of ['not json', '{', '', '{"a":1}', '42', '"abc"', 'null', 'true', '[', '["a"']) {
            seedRecent(text);
            assert.deepEqual(loadRecentWords(), [], JSON.stringify(text));
        }
    });

    it('inside an array, entries that are not short non-empty strings are skipped and the others are kept', () => {
        const longest = 'x'.repeat(RECENT_WORD_MAX_LENGTH);
        seedRecent([1, null, '', 'a', {}, 'y'.repeat(RECENT_WORD_MAX_LENGTH + 1), ['q'], longest, true, 'b']);
        assert.deepEqual(loadRecentWords(), ['a', longest, 'b']);
    });

    it('an array of nothing but garbage reads as an empty list', () => {
        seedRecent([1, 2, null, {}, [], '', false]);
        assert.deepEqual(loadRecentWords(), []);
    });

    it('writing on top of a corrupted store replaces it with the new key', () => {
        seedRecent('{{{ garbage');
        assert.doesNotThrow(() => rememberRecentWord('fresh'));
        assert.deepEqual(stored(), ['fresh']);
    });

    it('a key that cannot be a word key is not written at all', () => {
        for (const key of ['', 'z'.repeat(RECENT_WORD_MAX_LENGTH + 1), null, undefined, 7, {}, ['a']]) {
            rememberRecentWord(key);
        }
        assert.equal(env.storage.has(RECENT_WORDS_KEY), false);
    });

    it('a storage whose methods throw gives an empty list and swallows the write', () => {
        rememberRecentWord('kept');
        withThrowingStorage(() => {
            assert.deepEqual(loadRecentWords(), []);
            assert.doesNotThrow(() => rememberRecentWord('lost'));
        });
        assert.deepEqual(stored(), ['kept'], 'what was stored is untouched, and it works again afterwards');
    });

    it('a storage that throws as soon as it is asked for (blocked cookies) is survived too', () => {
        const real = globalThis.localStorage;
        const warn = console.warn;
        console.warn = () => {};
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('SecurityError');
            }
        });
        try {
            assert.deepEqual(loadRecentWords(), []);
            assert.doesNotThrow(() => rememberRecentWord('lost'));
        } finally {
            Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, enumerable: true, value: real });
            console.warn = warn;
        }
        assert.deepEqual(loadRecentWords(), []);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// The rule, with no randomness
// ---------------------------------------------------------------------------------------------------------------

describe('selectableWords', () => {
    const pool10 = poolOf(keys(10));
    const texts = (result) => result.words.map((w) => w.word);

    it('with nothing used and nothing recent, the whole pool is available', () => {
        const result = selectableWords(pool10, [], []);
        assert.deepEqual(texts(result), keys(10));
        assert.equal(result.startOver, false);
    });

    it('leaves out the words used in this match', () => {
        const result = selectableWords(pool10, ['k0', 'k3'], []);
        assert.deepEqual(texts(result), ['k1', 'k2', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']);
        assert.equal(result.startOver, false);
    });

    it('leaves out the recent words as well while at least half of the pool stays', () => {
        const result = selectableWords(pool10, [], ['k0', 'k1', 'k2', 'k3']);
        assert.deepEqual(texts(result), ['k4', 'k5', 'k6', 'k7', 'k8', 'k9']);
    });

    it('exactly half of the pool left is still enough: the recent list is used', () => {
        const result = selectableWords(pool10, [], keys(5));
        assert.deepEqual(texts(result), ['k5', 'k6', 'k7', 'k8', 'k9']);
    });

    it('one word fewer than half: the recent list is ignored, the whole pool (minus used words) is available', () => {
        const result = selectableWords(pool10, [], keys(6));
        assert.deepEqual(texts(result), keys(10));
        assert.equal(result.startOver, false);
    });

    it('when the recent list is ignored, the words used in this match are still left out', () => {
        const result = selectableWords(pool10, ['k9', 'k8'], keys(7));
        assert.deepEqual(texts(result), ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']);
    });

    it('"half" is half of the WHOLE pool, not half of what is left after the used words', () => {
        // 4 used, 3 of the 6 words left are recent: fresh = 3. 3 * 2 = 6 < 10, so the recent list is ignored
        // (half of what is left would be 3, and 3 would have been enough).
        const result = selectableWords(pool10, ['k0', 'k1', 'k2', 'k3'], ['k4', 'k5', 'k6']);
        assert.deepEqual(texts(result), ['k4', 'k5', 'k6', 'k7', 'k8', 'k9']);
    });

    it('an odd pool: 3 words need 2 fresh ones, 1 is not enough', () => {
        const pool = poolOf(['a', 'b', 'c']);
        assert.deepEqual(texts(selectableWords(pool, [], ['a'])), ['b', 'c']);
        assert.deepEqual(texts(selectableWords(pool, [], ['a', 'b'])), ['a', 'b', 'c']);
    });

    it('recent keys that are not in the pool do not count (the list holds words of every category and language)', () => {
        const result = selectableWords(pool10, [], [...keys(50, 'other'), 'k0']);
        assert.deepEqual(texts(result), keys(10).slice(1));
    });

    it('when every word is used in this match, the whole pool is back and `startOver` says so, whatever is recent', () => {
        const result = selectableWords(pool10, keys(10), keys(10));
        assert.deepEqual(texts(result), keys(10));
        assert.equal(result.startOver, true);
        const noRecent = selectableWords(pool10, keys(10), []);
        assert.equal(noRecent.startOver, true);
    });

    it('when every word is used in this match, a recent list that covers only part of the pool plays no part either', () => {
        // Rule 1 ("as before"): the whole pool is back. The recent words are not left out of it, however few they are.
        for (const recent of [keys(1), keys(3), keys(7), [...keys(50, 'other'), 'k4']]) {
            const result = selectableWords(pool10, keys(10), recent);
            assert.deepEqual(texts(result), keys(10), JSON.stringify(recent));
            assert.equal(result.startOver, true, JSON.stringify(recent));
        }
    });

    it('used words from another pool do not count as using this pool up', () => {
        const result = selectableWords(pool10, [...keys(30, 'old'), 'k0'], []);
        assert.equal(result.startOver, false);
        assert.deepEqual(texts(result), keys(10).slice(1));
    });

    it('compares normalized keys: case, punctuation and extra spaces in the word do not matter', () => {
        const pool = poolOf(['Hot-Dog', 'ICE  Cream', 'Café', 'Tea']);
        const result = selectableWords(pool, [normalizeWord('hot dog')], [normalizeWord('ice cream')]);
        assert.deepEqual(texts(result), ['Café', 'Tea']);
    });

    it('never offers nothing, and never a used word, for every pool up to 6 words and every used / recent set', () => {
        for (let size = 1; size <= 6; size++) {
            const all = keys(size);
            const pool = poolOf(all);
            for (let usedMask = 0; usedMask < 2 ** size; usedMask++) {
                const used = all.filter((_, i) => usedMask & (1 << i));
                for (let recentMask = 0; recentMask < 2 ** size; recentMask++) {
                    const recent = all.filter((_, i) => recentMask & (1 << i));
                    const { words, startOver } = selectableWords(pool, used, recent);
                    const label = `size ${size} used [${used}] recent [${recent}]`;
                    assert.ok(words.length > 0, label);
                    assert.equal(startOver, used.length === size, label);
                    if (!startOver) assert.deepEqual(overlap(words.map((w) => w.word), used), [], label);
                }
            }
        }
    });

    it('does not change its arguments', () => {
        const pool = poolOf(keys(6));
        const used = ['k0'];
        const recent = ['k1', 'k2'];
        selectableWords(pool, used, recent);
        assert.deepEqual(pool, poolOf(keys(6)));
        assert.deepEqual(used, ['k0']);
        assert.deepEqual(recent, ['k1', 'k2']);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// startNextRound, with seeded randomness
// ---------------------------------------------------------------------------------------------------------------

describe('startNextRound remembers the words it chooses', () => {
    it('writes one key per round, normalized, the newest last', () => {
        env.seedRandom(101);
        arrange({ words: [{ word: 'Hot-Dog', foolWord: 'x', hint: 'h', diff: 'easy' }, { word: 'ICE Cream', foolWord: 'y', hint: 'h', diff: 'easy' }] });
        const drawn = playMatch(2);
        assert.deepEqual(stored(), drawn.map(normalizeWord));
        assert.deepEqual([...stored()].sort(), ['hot dog', 'ice cream']);
    });

    it('keeps what an earlier match left: a new match adds to the list instead of starting it over', () => {
        env.seedRandom(102);
        arrange({ words: customWords(40) });
        const first = playMatch(5);
        const second = playMatch(5);
        assert.deepEqual(stored(), [...first, ...second].map(normalizeWord));
    });

    it('is cut to the last 300 chosen words: 305 rounds leave the keys of the last 300, in order', () => {
        env.seedRandom(103);
        arrange({ words: customWords(350) });
        const drawn = playMatch(305);
        assert.equal(new Set(drawn).size, 305);
        assert.equal(stored().length, RECENT_WORDS_LIMIT);
        assert.deepEqual(stored(), drawn.slice(-300).map(normalizeWord));
    });
});

describe('startNextRound across matches', () => {
    it('two matches in a row share no word (custom words, pool of 40)', () => {
        for (let seed = 1; seed <= 20; seed++) {
            env.reset();
            env.seedRandom(seed);
            arrange({ words: customWords(40) });
            const first = playMatch(10);
            const second = playMatch(10);
            assert.equal(new Set(first).size, 10, `seed ${seed}`);
            assert.deepEqual(overlap(first, second), [], `seed ${seed}`);
        }
    });

    for (const lang of ['fa', 'en']) {
        const packs = lang === 'fa' ? WORD_PACKS : WORD_PACKS_EN;
        it(`two matches in a row share no word (${lang} word bank, one category of ${packs.places.length} words)`, () => {
            for (let seed = 1; seed <= 10; seed++) {
                env.reset();
                setLang(lang);
                env.seedRandom(200 + seed);
                arrange({ settings: { cats: ['places'] } });
                const first = playMatch(20);
                const second = playMatch(20);
                assert.deepEqual(overlap(first, second), [], `${lang} seed ${seed}`);
                assert.ok(second.every((word) => packs.places.some((w) => w.word === word)), lang);
            }
        });
    }

    it('three matches in a row: the third avoids the words of both earlier ones', () => {
        for (let seed = 1; seed <= 10; seed++) {
            env.reset();
            env.seedRandom(300 + seed);
            arrange({ words: customWords(60) });
            const first = playMatch(8);
            const second = playMatch(8);
            const third = playMatch(8);
            assert.deepEqual(overlap(first, third), [], `seed ${seed}`);
            assert.deepEqual(overlap(second, third), [], `seed ${seed}`);
        }
    });

    it('last night\'s word does not open the next match (a stored list from an earlier visit is read)', () => {
        for (let seed = 1; seed <= 30; seed++) {
            env.reset();
            env.seedRandom(400 + seed);
            arrange({ words: customWords(20) });
            seedRecent(['w003', 'w007']);
            const drawn = playMatch(1);
            assert.ok(!['w003', 'w007'].includes(drawn[0]), `seed ${seed}: ${drawn[0]}`);
        }
    });

    it('words of the recent list that are not in the pool (other category, other language) change nothing', () => {
        for (let seed = 1; seed <= 10; seed++) {
            env.reset();
            env.seedRandom(500 + seed);
            arrange({ words: customWords(10) });
            seedRecent([...keys(99, 'elsewhere'), 'w000']);
            const drawn = playMatch(9);
            assert.equal(new Set(drawn).size, 9, `seed ${seed}`);
            assert.ok(!drawn.slice(0, 5).includes('w000'), `seed ${seed}: w000 is held back while the other 9 are at least half`);
        }
    });
});

describe('startNextRound with a small pool', () => {
    it('with more than half of the pool recent, the recent list is ignored: recent words can be drawn', () => {
        // 16 words, 12 of them recent: only 4 are fresh (less than half), so the first draw is over all 16.
        const recent = Array.from({ length: 12 }, (_, i) => keyOf(i));
        let recentDrawn = 0;
        for (let seed = 1; seed <= 60; seed++) {
            env.reset();
            env.seedRandom(600 + seed);
            arrange({ words: customWords(16) });
            seedRecent(recent);
            const [word] = playMatch(1);
            if (recent.includes(word)) recentDrawn++;
        }
        assert.ok(recentDrawn > 20, `${recentDrawn} of 60 first draws were recent words (about 45 expected)`);
    });

    it('with exactly half of the pool recent, the recent list still holds: no first draw is a recent word', () => {
        const recent = Array.from({ length: 8 }, (_, i) => keyOf(i));
        for (let seed = 1; seed <= 60; seed++) {
            env.reset();
            env.seedRandom(700 + seed);
            arrange({ words: customWords(16) });
            seedRecent(recent);
            const [word] = playMatch(1);
            assert.ok(!recent.includes(word), `seed ${seed}: ${word}`);
        }
    });

    it('with one word more than half recent, the recent list is dropped', () => {
        const recent = Array.from({ length: 9 }, (_, i) => keyOf(i));
        let recentDrawn = 0;
        for (let seed = 1; seed <= 60; seed++) {
            env.reset();
            env.seedRandom(800 + seed);
            arrange({ words: customWords(16) });
            seedRecent(recent);
            const [word] = playMatch(1);
            if (recent.includes(word)) recentDrawn++;
        }
        assert.ok(recentDrawn > 0, 'a recent word is drawn at least once');
    });

    it('a pool of 16 gets full variety in every match: each match of 16 rounds draws all 16 words, match after match', () => {
        const pool = customWords(16).map((w) => w.word);
        for (let seed = 1; seed <= 10; seed++) {
            env.reset();
            env.seedRandom(900 + seed);
            arrange({ words: customWords(16) });
            for (let match = 1; match <= 4; match++) {
                const drawn = playMatch(16);
                assert.deepEqual([...drawn].sort(), pool, `seed ${seed}, match ${match}`);
            }
        }
    });

    for (const lang of ['fa', 'en']) {
        it(`one category and one difficulty of the ${lang} bank: every match draws every word of it once`, () => {
            setLang(lang);
            const packs = lang === 'fa' ? WORD_PACKS : WORD_PACKS_EN;
            const expected = packs.vehicles.filter((w) => w.diff === 'hard').map((w) => w.word).sort();
            assert.ok(expected.length >= 16 && expected.length <= 18, `${expected.length} words`);
            env.seedRandom(950);
            arrange({ settings: { cats: ['vehicles'], diff: ['hard'] } });
            for (let match = 1; match <= 3; match++) {
                const drawn = playMatch(expected.length);
                assert.deepEqual([...drawn].sort(), expected, `${lang}, match ${match}`);
            }
        });
    }

    it('a pool of one word: that word, every round of every match', () => {
        env.seedRandom(960);
        arrange({ words: customWords(1) });
        for (let match = 1; match <= 3; match++) {
            assert.deepEqual(playMatch(3), ['w000', 'w000', 'w000'], `match ${match}`);
        }
        assert.deepEqual(stored(), ['w000']);
    });

    it('a pool of two words: each match draws both, whatever the first match left behind', () => {
        for (let seed = 1; seed <= 20; seed++) {
            env.reset();
            env.seedRandom(970 + seed);
            arrange({ words: customWords(2) });
            for (let match = 1; match <= 3; match++) {
                assert.deepEqual([...playMatch(2)].sort(), ['w000', 'w001'], `seed ${seed}, match ${match}`);
            }
        }
    });

    it('when the match uses the pool up the list starts over as before, and the round still gets a word', () => {
        env.seedRandom(990);
        arrange({ words: customWords(3) });
        playMatch(3);
        assert.deepEqual([...gameState.match.usedWordKeys].sort(), ['w000', 'w001', 'w002']);
        startNextRound();
        assert.equal(gameState.match.usedWordKeys.length, 1);
        assert.deepEqual(gameState.match.usedWordKeys, [normalizeWord(hostSecretState.secretWord)]);
    });
});

describe('startNextRound when a match uses a pool of more than 300 words up', () => {
    it('the round after the reset is drawn from the whole pool: the recent list (cut to 300, so it covers only part of it) plays no part', () => {
        // 320 words, one match of 320 rounds: no word twice, every word once. The recent list then holds the last 300
        // of them, so 20 words are "not recent". Round 321 starts the used list over (rule 1) and may draw any word,
        // the recent ones included; if the recent list were still applied after the reset, only those 20 could be drawn.
        let fromRecent = 0;
        for (let seed = 1; seed <= 10; seed++) {
            env.reset();
            env.seedRandom(1400 + seed);
            arrange({ words: customWords(320) });
            const drawn = playMatch(320);
            assert.equal(new Set(drawn).size, 320, `seed ${seed}: no word twice before the pool is used up`);
            const recent = new Set(stored());
            assert.equal(recent.size, RECENT_WORDS_LIMIT, `seed ${seed}`);
            startNextRound();
            assert.deepEqual(gameState.match.usedWordKeys, [normalizeWord(hostSecretState.secretWord)], `seed ${seed}: the list started over`);
            if (recent.has(normalizeWord(hostSecretState.secretWord))) fromRecent++;
        }
        assert.ok(fromRecent > 0, `${fromRecent} of 10 draws after the reset were recent words (about 9 expected)`);
    });
});

describe('startNextRound with a bad or blocked store', () => {
    it('a corrupted list does not stop the round: a word is drawn and the list is rewritten', () => {
        for (const garbage of ['not json', '{"a":1}', '[1,null,{}]', '"text"', '[']) {
            env.reset();
            env.seedRandom(1000);
            arrange({ words: customWords(5) });
            seedRecent(garbage);
            const [word] = playMatch(1);
            assert.ok(word.startsWith('w'), garbage);
            assert.deepEqual(stored(), [word], garbage);
        }
    });

    it('a corrupted list behaves like an empty one: all the words stay available', () => {
        const seen = new Set();
        for (let seed = 1; seed <= 40; seed++) {
            env.reset();
            env.seedRandom(1100 + seed);
            arrange({ words: customWords(4) });
            seedRecent('{{{');
            seen.add(playMatch(1)[0]);
        }
        assert.deepEqual([...seen].sort(), ['w000', 'w001', 'w002', 'w003']);
    });

    it('a storage that throws does not stop the round (built-in words, as custom words live in the same storage)', () => {
        env.seedRandom(1200);
        arrange({ settings: { cats: ['places'] } });
        withThrowingStorage(() => {
            assert.doesNotThrow(() => startNextRound());
        });
        assert.equal(gameState.phase, 'reveal');
        assert.ok(WORD_PACKS.places.some((w) => w.word === hostSecretState.secretWord));
        assert.equal(env.storage.has(RECENT_WORDS_KEY), false, 'nothing could be written');
        assert.equal(gameState.match.usedWordKeys.length, 1, 'the match still remembers its own words');
    });

    it('a storage that throws keeps the rule inside the match: no word twice until the pool is used up', () => {
        env.seedRandom(1300);
        arrange({ settings: { cats: ['vehicles'], diff: ['hard'] } });
        const size = WORD_PACKS.vehicles.filter((w) => w.diff === 'hard').length;
        const drawn = [];
        withThrowingStorage(() => {
            for (let round = 0; round < size; round++) {
                startNextRound();
                drawn.push(hostSecretState.secretWord);
            }
        });
        assert.equal(new Set(drawn).size, size);
    });
});
