/**
 * The difficulty setting: which levels it stands for (`normalizeDifficulties`, core/config.js), how it filters the
 * word pool (`filterPoolByDifficulty` and `startNextRound`, game/rounds.js), and that a match saved when the
 * setting was still one string ('all', 'easy', 'medium' or 'hard') restores with the same meaning.
 * The setting narrows the built-in words only: a custom word (`_cat === 'custom'`) is in the pool whatever levels
 * are chosen.
 * Randomness is seeded (env.seedRandom), so every run replays the same sequences.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { DIFFICULTY_LEVELS, getDifficultyMultiplier, getSpyGuessPoints, normalizeDifficulties } from '../../js/core/config.js';
import { SAVE_VERSION, gameState, hostSecretState, serializeSecrets } from '../../js/core/state.js';
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { WORD_PACKS_EN } from '../../js/data/wordPacksEn.js';
import { setLang } from '../../js/i18n/index.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { filterPoolByDifficulty, startNextRound } = await import('../../js/game/rounds.js');
const { handleAction } = await import('../../js/app/actions.js');
const { stopTimerLoop } = await import('../../js/game/timer.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');
useGameHarness(env, {
    setup: () => {
        env.el('recovery-banner');
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

const BANKS = [
    { lang: 'fa', packs: WORD_PACKS },
    { lang: 'en', packs: WORD_PACKS_EN }
];

/** Every non-empty combination of the three levels, in the order the setting keeps them: 7 of them. */
const COMBINATIONS = [
    ['easy'],
    ['medium'],
    ['hard'],
    ['easy', 'medium'],
    ['easy', 'hard'],
    ['medium', 'hard'],
    ['easy', 'medium', 'hard']
];

/** The pool startNextRound builds for every category of `packs`. */
const poolOf = (packs) => Object.entries(packs).flatMap(([category, words]) => words.map((w) => ({ ...w, _cat: category })));

const ratingsOf = (words) => [...new Set(words.map((w) => w.diff))].sort();

const isCustom = (w) => w._cat === 'custom';

/** The pool entry of a stored custom word, as startNextRound builds it. */
const customEntries = (words) => words.map((w) => ({ ...w, _cat: 'custom' }));

/** What the app stores for every custom word a player types in: the internal rating 'medium'. */
const STORED_CUSTOM = [
    { word: 'Mike', foolWord: 'Mouse', hint: 'm', diff: 'medium' },
    { word: 'November', foolWord: 'Nut', hint: 'n', diff: 'medium' }
];

/** Custom words that carry the three ratings (cleanCustomWord keeps an 'easy' or 'hard' from an imported file). */
const RATED_CUSTOM = [
    { word: 'Echo', foolWord: 'Eagle', hint: 'e', diff: 'easy' },
    { word: 'Foxtrot', foolWord: 'Fox', hint: 'f', diff: 'medium' },
    { word: 'Golf', foolWord: 'Gulf', hint: 'g', diff: 'hard' }
];

/** Thirty custom words: enough that one category plus these draws both kinds within a few dozen rounds. */
const MANY_CUSTOM = Array.from({ length: 30 }, (_, i) => ({
    word: `Custom ${String(i + 1).padStart(2, '0')}`,
    foolWord: `Decoy ${i + 1}`,
    hint: 'c',
    diff: 'medium'
}));

describe('normalizeDifficulties', () => {
    it('keeps every combination of levels, in the order easy, medium, hard whatever order it was given in', () => {
        for (const combination of COMBINATIONS) {
            assert.deepEqual(normalizeDifficulties(combination), combination);
            assert.deepEqual(normalizeDifficulties([...combination].reverse()), combination, combination.join('+'));
        }
    });

    it('reads the strings older saves hold: \'all\' is all three levels, a level name is that level alone', () => {
        assert.deepEqual(normalizeDifficulties('all'), ['easy', 'medium', 'hard']);
        assert.deepEqual(normalizeDifficulties('easy'), ['easy']);
        assert.deepEqual(normalizeDifficulties('medium'), ['medium']);
        assert.deepEqual(normalizeDifficulties('hard'), ['hard']);
    });

    it('reads anything else as all three levels', () => {
        const garbage = [undefined, null, '', ' ', 'nope', 'EASY', 'easy,hard', 'easy+hard', 'constructor', '__proto__', 'toString', 0, 1, 42, true, false, {}, { easy: true }, [], [''], ['nope'], [null], [['easy']], [{}]];
        for (const value of garbage) {
            assert.deepEqual(normalizeDifficulties(value), ['easy', 'medium', 'hard'], JSON.stringify(value) ?? String(value));
        }
    });

    it('ignores unknown names next to a known level, and counts a level once', () => {
        assert.deepEqual(normalizeDifficulties(['nope', 'hard']), ['hard']);
        assert.deepEqual(normalizeDifficulties(['hard', 'hard', 'easy', 'hard']), ['easy', 'hard']);
        assert.deepEqual(normalizeDifficulties(['all', 'medium']), ['medium']);
    });

    it('returns a new array every time, so a caller cannot change the levels or the next answer', () => {
        const first = normalizeDifficulties(undefined);
        first.length = 0;
        assert.deepEqual(DIFFICULTY_LEVELS, ['easy', 'medium', 'hard']);
        assert.deepEqual(normalizeDifficulties(undefined), ['easy', 'medium', 'hard']);

        const input = ['hard', 'easy'];
        const output = normalizeDifficulties(input);
        assert.notEqual(output, input);
        assert.deepEqual(input, ['hard', 'easy']);
        assert.notEqual(normalizeDifficulties(DIFFICULTY_LEVELS), DIFFICULTY_LEVELS);
    });
});

describe('the default setting of a new game', () => {
    it('is all three levels, as an array that is not shared with DIFFICULTY_LEVELS', () => {
        assert.deepEqual(gameState.settings.diff, ['easy', 'medium', 'hard']);
        assert.notEqual(gameState.settings.diff, DIFFICULTY_LEVELS);
    });
});

describe('filterPoolByDifficulty: both word banks', () => {
    for (const { lang, packs } of BANKS) {
        describe(`the ${lang} bank`, () => {
            const pool = poolOf(packs);
            const countOf = (levels) => pool.filter((w) => levels.includes(w.diff)).length;

            it('has words of all three ratings, so every combination below means something', () => {
                assert.deepEqual(ratingsOf(pool), ['easy', 'hard', 'medium']);
            });

            it('one level keeps exactly the words of that rating', () => {
                for (const level of DIFFICULTY_LEVELS) {
                    const kept = filterPoolByDifficulty(pool, [level]);
                    assert.deepEqual(ratingsOf(kept), [level]);
                    assert.equal(kept.length, countOf([level]), level);
                }
            });

            it('two levels keep exactly the words of those two ratings, none of the third', () => {
                for (const levels of COMBINATIONS.filter((c) => c.length === 2)) {
                    const kept = filterPoolByDifficulty(pool, levels);
                    assert.deepEqual(ratingsOf(kept), [...levels].sort(), levels.join('+'));
                    assert.equal(kept.length, countOf(levels), levels.join('+'));
                    assert.ok(kept.length < pool.length);
                }
            });

            it('all three levels leave the pool exactly as it is', () => {
                const kept = filterPoolByDifficulty(pool, ['easy', 'medium', 'hard']);
                assert.equal(kept, pool);
                assert.equal(kept.length, pool.length);
            });

            it('a legacy string means what it meant: the same words as the array of that level', () => {
                assert.equal(filterPoolByDifficulty(pool, 'all'), pool);
                for (const level of DIFFICULTY_LEVELS) {
                    assert.deepEqual(filterPoolByDifficulty(pool, level), filterPoolByDifficulty(pool, [level]), level);
                    assert.deepEqual(ratingsOf(filterPoolByDifficulty(pool, level)), [level], level);
                }
            });

            it('a garbage value filters nothing', () => {
                for (const value of [undefined, null, '', 'nope', 'EASY', 42, {}, [], ['nope']]) {
                    assert.equal(filterPoolByDifficulty(pool, value), pool, JSON.stringify(value) ?? String(value));
                }
            });

            it('does not change the pool it is given', () => {
                const copy = structuredClone(pool);
                filterPoolByDifficulty(pool, ['medium', 'hard']);
                assert.deepEqual(pool, copy);
            });
        });
    }

    describe('when the choice matches no word at all', () => {
        const onlyHard = [
            { word: 'Zulu', foolWord: 'Zebra', hint: 'z', diff: 'hard' },
            { word: 'Yankee', foolWord: 'Yak', hint: 'y', diff: 'hard' }
        ];

        it('the pool is returned unfiltered, for an array and for a legacy string alike', () => {
            assert.equal(filterPoolByDifficulty(onlyHard, ['easy']), onlyHard);
            assert.equal(filterPoolByDifficulty(onlyHard, ['easy', 'medium']), onlyHard);
            assert.equal(filterPoolByDifficulty(onlyHard, 'easy'), onlyHard);
            assert.equal(filterPoolByDifficulty(onlyHard, 'medium'), onlyHard);
        });

        it('a choice that matches some word still filters', () => {
            assert.deepEqual(filterPoolByDifficulty(onlyHard, ['easy', 'hard']), onlyHard);
            const mixed = [...onlyHard, { word: 'Xray', foolWord: 'Xylophone', hint: 'x', diff: 'easy' }];
            assert.deepEqual(filterPoolByDifficulty(mixed, ['easy', 'medium']).map((w) => w.word), ['Xray']);
        });

        it('an empty pool stays empty and does not throw', () => {
            assert.deepEqual(filterPoolByDifficulty([], ['hard']), []);
            assert.deepEqual(filterPoolByDifficulty([], 'easy'), []);
        });
    });
});

describe('filterPoolByDifficulty: a custom word ignores the difficulty and every level setting keeps it', () => {
    for (const { lang, packs } of BANKS) {
        describe(`the ${lang} bank with custom words in the pool`, () => {
            const builtIn = poolOf(packs);
            const custom = customEntries(STORED_CUSTOM);
            const pool = [...builtIn, ...custom];
            const builtInCount = (levels) => builtIn.filter((w) => levels.includes(w.diff)).length;

            for (const levels of COMBINATIONS) {
                const what = levels.length === 1 ? `only ${levels[0]}` : levels.join(' + ');
                it(`${what} chosen: every custom word stays, the built-in words are filtered as before`, () => {
                    const kept = filterPoolByDifficulty(pool, levels);
                    for (const word of custom) assert.ok(kept.includes(word), `${word.word} was dropped`);
                    const keptBuiltIn = kept.filter((w) => !isCustom(w));
                    assert.equal(keptBuiltIn.length, builtInCount(levels), what);
                    assert.deepEqual(ratingsOf(keptBuiltIn), [...levels].sort(), what);
                    assert.equal(kept.length, builtInCount(levels) + custom.length, what);
                    if (levels.length === DIFFICULTY_LEVELS.length) assert.equal(kept, pool, 'all three levels leave the pool as it is');
                });
            }

            it('a legacy string keeps the custom words too: the same words as the array of that level', () => {
                assert.equal(filterPoolByDifficulty(pool, 'all'), pool);
                for (const level of DIFFICULTY_LEVELS) {
                    const kept = filterPoolByDifficulty(pool, level);
                    assert.deepEqual(kept, filterPoolByDifficulty(pool, [level]), level);
                    for (const word of custom) assert.ok(kept.includes(word), `${level}: ${word.word} was dropped`);
                    assert.deepEqual(ratingsOf(kept.filter((w) => !isCustom(w))), [level], level);
                }
            });

            it('a garbage value filters nothing, custom words included', () => {
                for (const value of [undefined, null, '', 'nope', 42, {}, [], ['nope']]) {
                    assert.equal(filterPoolByDifficulty(pool, value), pool, JSON.stringify(value) ?? String(value));
                }
            });

            it('does not change the pool it is given', () => {
                const copy = structuredClone(pool);
                // Looked at after each call: a change made in place twice could cancel itself out.
                filterPoolByDifficulty(pool, ['easy']);
                assert.deepEqual(pool, copy);
                filterPoolByDifficulty(pool, 'hard');
                assert.deepEqual(pool, copy);
                filterPoolByDifficulty(pool, ['medium', 'hard']);
                assert.deepEqual(pool, copy);
            });
        });
    }

    describe('the rule is about being a custom word, not about a rating', () => {
        const builtIn = (word, diff, _cat = 'places') => ({ word, foolWord: `${word}-decoy`, hint: 'h', diff, _cat });

        it('a custom word is kept whatever rating it holds: easy, medium, hard, none or garbage', () => {
            const ratings = ['easy', 'medium', 'hard', undefined, null, '', 'bogus'];
            for (const diff of ratings) {
                const word = { word: 'Kilo', foolWord: 'Kite', hint: 'k', diff, _cat: 'custom' };
                const pool = [word, builtIn('Lima', 'hard')];
                for (const levels of COMBINATIONS.filter((c) => c.length < 3)) {
                    assert.ok(filterPoolByDifficulty(pool, levels).includes(word), `${diff} with ${levels.join('+')}`);
                }
            }
        });

        it('a built-in medium word is dropped when medium is not chosen: the rule does not follow the \'medium\' rating', () => {
            const medium = builtIn('Oscar', 'medium');
            const mediumWithoutCategory = { word: 'Papa', foolWord: 'Pear', hint: 'p', diff: 'medium' };
            const pool = [medium, mediumWithoutCategory, builtIn('Quebec', 'easy'), builtIn('Romeo', 'hard')];
            for (const levels of [['easy', 'hard'], ['easy'], ['hard']]) {
                const kept = filterPoolByDifficulty(pool, levels);
                assert.ok(!kept.includes(medium) && !kept.includes(mediumWithoutCategory), levels.join('+'));
                assert.deepEqual(kept.map((w) => w.word), pool.filter((w) => levels.includes(w.diff)).map((w) => w.word), levels.join('+'));
            }
        });

        it('a built-in word of a category that happens to be named like the custom one is not special: only \'custom\' exactly is', () => {
            const near = [builtIn('Sierra', 'medium', 'Custom'), builtIn('Tango', 'medium', 'customs'), builtIn('Uniform', 'medium', 'custom ')];
            const pool = [...near, builtIn('Victor', 'easy')];
            assert.deepEqual(filterPoolByDifficulty(pool, ['easy']).map((w) => w.word), ['Victor']);
        });

        it('the custom words keep their place among the kept words (the pool order is the order they are drawn from)', () => {
            const pool = [builtIn('Alpha', 'easy'), builtIn('Bravo', 'medium'), customEntries([STORED_CUSTOM[0]])[0], builtIn('Charlie', 'hard'), customEntries([STORED_CUSTOM[1]])[0], builtIn('Delta', 'easy')];
            assert.deepEqual(filterPoolByDifficulty(pool, ['easy']).map((w) => w.word), ['Alpha', 'Mike', 'November', 'Delta']);
            assert.deepEqual(filterPoolByDifficulty(pool, ['hard']).map((w) => w.word), ['Mike', 'Charlie', 'November']);
        });
    });

    describe('a pool of only custom words', () => {
        it('stays whole for every choice of levels, also when the words carry different ratings', () => {
            for (const stored of [STORED_CUSTOM, RATED_CUSTOM]) {
                const pool = customEntries(stored);
                for (const levels of COMBINATIONS) {
                    const kept = filterPoolByDifficulty(pool, levels);
                    assert.deepEqual(kept.map((w) => w.word), pool.map((w) => w.word), levels.join('+'));
                }
                for (const level of DIFFICULTY_LEVELS) {
                    assert.deepEqual(filterPoolByDifficulty(pool, level).map((w) => w.word), pool.map((w) => w.word), level);
                }
            }
        });
    });

    describe('the "no word left" fallback with custom words around', () => {
        const hardOnly = [
            { word: 'Zulu', foolWord: 'Zebra', hint: 'z', diff: 'hard', _cat: 'events' },
            { word: 'Yankee', foolWord: 'Yak', hint: 'y', diff: 'hard', _cat: 'events' }
        ];

        it('cannot happen while the pool holds a custom word: the custom words are the whole result, not the unfiltered pool', () => {
            const pool = [...hardOnly, ...customEntries([STORED_CUSTOM[0]])];
            for (const levels of [['easy'], ['medium'], ['easy', 'medium']]) {
                const kept = filterPoolByDifficulty(pool, levels);
                assert.deepEqual(kept.map((w) => w.word), ['Mike'], levels.join('+'));
                assert.notEqual(kept, pool);
            }
            assert.deepEqual(filterPoolByDifficulty(pool, 'easy').map((w) => w.word), ['Mike']);
        });

        it('still happens for a pool with no custom word and no built-in word of a chosen rating', () => {
            assert.equal(filterPoolByDifficulty(hardOnly, ['easy']), hardOnly);
            assert.equal(filterPoolByDifficulty(hardOnly, 'medium'), hardOnly);
            assert.deepEqual(filterPoolByDifficulty([], ['hard']), []);
        });
    });
});

/** Seat five players and pick the settings; the custom bank holds `words` (what the real app stores). */
function arrange({ settings = {}, words = [] } = {}) {
    env.storage.set('spy_custom_words', JSON.stringify(words));
    gameState.players = makePlayers(5);
    Object.assign(gameState.settings, settings);
}

describe('startNextRound with a chosen set of levels', () => {
    for (const { lang, packs } of BANKS) {
        const bank = Object.values(packs).flat();
        const ratingOf = (word) => bank.find((w) => w.word === word)?.diff;

        describe(`the ${lang} bank`, () => {
            for (const levels of COMBINATIONS) {
                it(`${levels.join(' + ')}: only words of ${levels.length === 1 ? 'that rating' : 'those ratings'}, and each one is drawn`, () => {
                    env.seedRandom(71);
                    setLang(lang);
                    arrange({ settings: { cats: Object.keys(packs), diff: levels } });
                    const seen = new Set();
                    for (let round = 0; round < 90; round++) {
                        startNextRound();
                        const word = hostSecretState.secretWord;
                        assert.ok(levels.includes(ratingOf(word)), `${word} is rated ${ratingOf(word)}`);
                        assert.equal(gameState.round.wordDifficulty, ratingOf(word));
                        seen.add(gameState.round.wordDifficulty);
                    }
                    assert.deepEqual([...seen].sort(), [...levels].sort());
                });
            }

            it('a legacy string in the settings draws what it always drew', () => {
                const wanted = { all: ['easy', 'hard', 'medium'], easy: ['easy'], medium: ['medium'], hard: ['hard'] };
                for (const [legacy, ratings] of Object.entries(wanted)) {
                    env.seedRandom(72);
                    setLang(lang);
                    arrange({ settings: { cats: Object.keys(packs), diff: legacy } });
                    const seen = new Set();
                    for (let round = 0; round < 90; round++) {
                        startNextRound();
                        seen.add(ratingOf(hostSecretState.secretWord));
                    }
                    assert.deepEqual([...seen].sort(), ratings, legacy);
                }
            });

            it('a garbage setting draws every rating and does not throw', () => {
                for (const diff of ['bogus', 7, null, [], ['bogus']]) {
                    env.seedRandom(73);
                    setLang(lang);
                    arrange({ settings: { cats: Object.keys(packs), diff } });
                    const seen = new Set();
                    for (let round = 0; round < 90; round++) {
                        startNextRound();
                        seen.add(ratingOf(hostSecretState.secretWord));
                    }
                    assert.deepEqual([...seen].sort(), ['easy', 'hard', 'medium'], JSON.stringify(diff));
                }
            });
        });
    }

    for (const { lang, packs } of BANKS) {
        it(`${lang}: a used word is not drawn again until the filtered pool runs out, then the list starts over (custom words are in that pool)`, () => {
            const hardEvents = packs.events.filter((w) => w.diff === 'hard').map((w) => w.word);
            const customWords = STORED_CUSTOM.map((w) => w.word);
            const poolWords = [...hardEvents, ...customWords].sort();
            env.seedRandom(74);
            setLang(lang);
            arrange({ settings: { cats: ['events', 'custom'], diff: ['hard'] }, words: STORED_CUSTOM });
            const drawn = [];
            for (let round = 0; round < poolWords.length * 2; round++) {
                startNextRound();
                drawn.push(hostSecretState.secretWord);
            }
            // Every word of the pool (the hard events words and the two custom ones) once before any comes back, twice over.
            assert.deepEqual(drawn.slice(0, poolWords.length).sort(), poolWords, drawn.join());
            assert.deepEqual(drawn.slice(poolWords.length).sort(), poolWords, drawn.join());
            assert.ok(drawn.every((word) => poolWords.includes(word)), 'no easy or medium built-in word was drawn');
        });
    }
});

describe('startNextRound: custom words ignore the difficulty and score as neutral', () => {
    /** Draw `rounds` rounds and record what each one drew. */
    function draw(rounds) {
        const drawn = [];
        for (let round = 0; round < rounds; round++) {
            startNextRound();
            drawn.push({ word: hostSecretState.secretWord, difficulty: gameState.round.wordDifficulty });
        }
        return drawn;
    }

    for (const { lang, packs } of BANKS) {
        const bank = Object.values(packs).flat();
        const ratingOf = (word) => bank.find((w) => w.word === word)?.diff;
        const customNames = new Set(MANY_CUSTOM.map((w) => w.word));

        describe(`the ${lang} bank`, () => {
            for (const levels of COMBINATIONS) {
                const what = levels.length === 1 ? `only ${levels[0]}` : levels.join(' + ');
                it(`${what} chosen, one built-in category and the custom category: custom words are drawn as well as built-in words of the chosen levels`, () => {
                    env.seedRandom(75);
                    setLang(lang);
                    arrange({ settings: { cats: ['events', 'custom'], diff: levels }, words: MANY_CUSTOM });
                    const drawn = draw(40);
                    const custom = drawn.filter((d) => customNames.has(d.word));
                    const builtIn = drawn.filter((d) => !customNames.has(d.word));
                    assert.ok(custom.length > 0, `no custom word in 40 rounds with ${what}`);
                    assert.ok(builtIn.length > 0, `no built-in word in 40 rounds with ${what}`);
                    for (const d of custom) {
                        assert.equal(d.difficulty, null, 'a custom word has no difficulty for scoring');
                        assert.equal(getDifficultyMultiplier(d.difficulty), 1);
                        assert.equal(getSpyGuessPoints(d.difficulty), 2);
                    }
                    for (const d of builtIn) {
                        assert.ok(levels.includes(ratingOf(d.word)), `${d.word} is rated ${ratingOf(d.word)}`);
                        assert.equal(d.difficulty, ratingOf(d.word));
                    }
                });
            }

            it('every built-in category ticked and the custom one: the custom words are in the pool when medium is not chosen', () => {
                // 30 custom words among 700+ built-in ones: draw until the pool is likely to hand one out.
                env.seedRandom(76);
                setLang(lang);
                arrange({ settings: { cats: [...Object.keys(packs), 'custom'], diff: ['easy', 'hard'] }, words: MANY_CUSTOM });
                const drawn = draw(250);
                assert.ok(drawn.some((d) => customNames.has(d.word)), 'a custom word is drawn');
                for (const d of drawn.filter((x) => !customNames.has(x.word))) assert.ok(['easy', 'hard'].includes(ratingOf(d.word)), d.word);
            });

            for (const levels of COMBINATIONS) {
                const what = levels.length === 1 ? `only ${levels[0]}` : levels.join(' + ');
                it(`${what} chosen, built-in categories unchecked and only the custom category: every custom word is drawn and none scores a difficulty`, () => {
                    env.seedRandom(77);
                    setLang(lang);
                    arrange({ settings: { cats: ['custom'], diff: levels }, words: STORED_CUSTOM });
                    const drawn = draw(12);
                    assert.deepEqual([...new Set(drawn.map((d) => d.word))].sort(), ['Mike', 'November'], what);
                    assert.ok(drawn.every((d) => d.difficulty === null));
                });

                // With all three levels nothing is filtered at all, so only a narrower choice can tell a rule from none.
                if (levels.length < DIFFICULTY_LEVELS.length) {
                    it(`${what} chosen, only the custom category, words that carry an easy, a medium and a hard rating: all three are drawn`, () => {
                        env.seedRandom(78);
                        setLang(lang);
                        arrange({ settings: { cats: ['custom'], diff: levels }, words: RATED_CUSTOM });
                        const drawn = draw(30);
                        assert.deepEqual([...new Set(drawn.map((d) => d.word))].sort(), ['Echo', 'Foxtrot', 'Golf'], what);
                        assert.ok(drawn.every((d) => d.difficulty === null), 'whatever rating a custom word holds, it scores as neutral');
                    });
                }
            }
        });
    }
});

describe('a match saved before the difficulty chips existed', () => {
    /** Write the game as the build before the chips wrote it (`diff` is whatever the test puts there), wipe memory, press "restore". */
    function saveThenRestoreWith(lang, diff, { cats, words } = {}) {
        setLang(lang);
        const packs = lang === 'en' ? WORD_PACKS_EN : WORD_PACKS;
        arrange({ settings: { cats: cats ?? Object.keys(packs) }, words });
        gameState.phase = 'reveal';
        gameState.match = { usedWordKeys: [], lang };
        gameState.settings.diff = diff;
        const saved = JSON.stringify({ version: SAVE_VERSION, state: gameState, secrets: serializeSecrets() });
        resetSingletons();
        env.storage.set('spy_full_state_master', saved);
        handleAction({ type: 'RESTORE_GAME' });
    }

    const ratingsDrawn = (lang, rounds = 90) => {
        const bank = Object.values(lang === 'en' ? WORD_PACKS_EN : WORD_PACKS).flat();
        const seen = new Set();
        for (let round = 0; round < rounds; round++) {
            startNextRound();
            seen.add(bank.find((w) => w.word === hostSecretState.secretWord)?.diff);
        }
        return [...seen].sort();
    };

    for (const lang of ['fa', 'en']) {
        it(`${lang}: the save is still accepted (SAVE_VERSION is the same), and 'all', 'easy', 'medium' and 'hard' keep their meaning in the next rounds`, () => {
            const wanted = { all: ['easy', 'hard', 'medium'], easy: ['easy'], medium: ['medium'], hard: ['hard'] };
            for (const [legacy, ratings] of Object.entries(wanted)) {
                saveThenRestoreWith(lang, legacy);
                assert.equal(gameState.players.length, 5, 'the save was restored, not discarded');
                assert.equal(gameState.settings.diff, legacy, 'the restored setting is what was saved');
                env.seedRandom(78);
                assert.deepEqual(ratingsDrawn(lang), ratings, legacy);
            }
        });

        it(`${lang}: a garbage setting in a save reads as all three levels`, () => {
            for (const garbage of ['bogus', '', 7, null, [], ['bogus'], { easy: true }]) {
                saveThenRestoreWith(lang, garbage);
                assert.equal(gameState.players.length, 5);
                env.seedRandom(79);
                assert.deepEqual(ratingsDrawn(lang), ['easy', 'hard', 'medium'], JSON.stringify(garbage));
            }
        });

        it(`${lang}: a legacy 'easy', 'medium' or 'hard' save keeps the custom words in the pool, and 'all' draws both kinds`, () => {
            const bank = Object.values(lang === 'en' ? WORD_PACKS_EN : WORD_PACKS).flat();
            const names = new Set(MANY_CUSTOM.map((w) => w.word));
            const wanted = { all: ['easy', 'hard', 'medium'], easy: ['easy'], medium: ['medium'], hard: ['hard'] };
            for (const [legacy, ratings] of Object.entries(wanted)) {
                saveThenRestoreWith(lang, legacy, { cats: ['events', 'custom'], words: MANY_CUSTOM });
                assert.equal(gameState.players.length, 5, 'the save was restored, not discarded');
                assert.equal(gameState.settings.diff, legacy, 'the restored setting is what was saved');
                env.seedRandom(82);
                const drawn = [];
                for (let round = 0; round < 40; round++) {
                    startNextRound();
                    drawn.push({ word: hostSecretState.secretWord, difficulty: gameState.round.wordDifficulty });
                }
                const custom = drawn.filter((d) => names.has(d.word));
                const builtIn = drawn.filter((d) => !names.has(d.word));
                assert.ok(custom.length > 0, `${legacy}: no custom word in 40 rounds`);
                assert.ok(builtIn.length > 0, `${legacy}: no built-in word in 40 rounds`);
                assert.ok(custom.every((d) => d.difficulty === null), legacy);
                for (const d of builtIn) assert.ok(ratings.includes(bank.find((w) => w.word === d.word)?.diff), `${legacy}: ${d.word}`);
            }
        });

        it(`${lang}: a legacy 'easy' save with only the custom category still draws every custom word`, () => {
            saveThenRestoreWith(lang, 'easy', { cats: ['custom'], words: RATED_CUSTOM });
            assert.equal(gameState.players.length, 5);
            env.seedRandom(83);
            const names = new Set();
            for (let round = 0; round < 30; round++) {
                startNextRound();
                names.add(hostSecretState.secretWord);
            }
            assert.deepEqual([...names].sort(), ['Echo', 'Foxtrot', 'Golf']);
        });

        it(`${lang}: the new array form survives a save and a restore, and the next rounds follow it`, () => {
            for (const levels of COMBINATIONS) {
                saveThenRestoreWith(lang, levels);
                assert.deepEqual(gameState.settings.diff, levels);
                env.seedRandom(80);
                assert.deepEqual(ratingsDrawn(lang), [...levels].sort(), levels.join('+'));
            }
        });
    }

    it('a save written by the current build carries the array, and the version did not change for it', () => {
        setLang('fa');
        arrange({ settings: { cats: Object.keys(WORD_PACKS), diff: ['medium', 'hard'] } });
        env.seedRandom(81);
        startNextRound();
        const saved = JSON.parse(env.storage.get('spy_full_state_master'));
        assert.deepEqual(saved.state.settings.diff, ['medium', 'hard']);
        assert.equal(saved.version, SAVE_VERSION);
        assert.equal(saved.state.version, SAVE_VERSION);
    });
});
