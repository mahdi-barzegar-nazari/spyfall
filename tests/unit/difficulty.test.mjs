/**
 * The difficulty setting: which levels it stands for (`normalizeDifficulties`, core/config.js), how it filters the
 * word pool (`filterPoolByDifficulty` and `startNextRound`, game/rounds.js), and that a match saved when the
 * setting was still one string ('all', 'easy', 'medium' or 'hard') restores with the same meaning.
 * Randomness is seeded (env.seedRandom), so every run replays the same sequences.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { DIFFICULTY_LEVELS, normalizeDifficulties } from '../../js/core/config.js';
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

    it('a used word is not drawn again until the filtered pool runs out, then the list starts over', () => {
        const words = [
            { word: 'Alpha', foolWord: 'Apple', hint: 'greek', diff: 'easy' },
            { word: 'Bravo', foolWord: 'Banana', hint: 'cheer', diff: 'medium' },
            { word: 'Charlie', foolWord: 'Cherry', hint: 'chaplin', diff: 'hard' }
        ];
        env.seedRandom(74);
        arrange({ settings: { cats: ['custom'], diff: ['easy', 'hard'] }, words });
        const drawn = [];
        for (let round = 0; round < 6; round++) {
            startNextRound();
            drawn.push(hostSecretState.secretWord);
        }
        // Bravo (medium) is never in the pool; the other two take turns, each once before either comes back.
        for (let i = 0; i < 6; i += 2) assert.deepEqual(drawn.slice(i, i + 2).sort(), ['Alpha', 'Charlie'], drawn.join());
        assert.ok(!drawn.includes('Bravo'));
    });
});

describe('custom words keep the rating they carry (\'medium\' for every word the app saves) and score as neutral', () => {
    const custom = [
        { word: 'Mike', foolWord: 'Mouse', hint: 'm', diff: 'medium' },
        { word: 'November', foolWord: 'Nut', hint: 'n', diff: 'medium' }
    ];
    const everyBuiltIn = () => Object.keys(WORD_PACKS);

    it('with medium chosen they are drawn', () => {
        for (const levels of [['medium'], ['easy', 'medium'], ['medium', 'hard'], ['easy', 'medium', 'hard']]) {
            env.seedRandom(75);
            arrange({ settings: { cats: ['custom'], diff: levels }, words: custom });
            const drawn = new Set();
            for (let round = 0; round < 12; round++) {
                startNextRound();
                drawn.add(hostSecretState.secretWord);
                assert.equal(gameState.round.wordDifficulty, null, 'a custom word has no difficulty for scoring');
            }
            assert.deepEqual([...drawn].sort(), ['Mike', 'November'], levels.join('+'));
        }
    });

    it('with medium not chosen they are left out of a pool that has other words, like any medium word', () => {
        for (const levels of [['easy', 'hard'], ['easy'], ['hard']]) {
            env.seedRandom(76);
            arrange({ settings: { cats: [...everyBuiltIn(), 'custom'], diff: levels }, words: custom });
            for (let round = 0; round < 60; round++) {
                startNextRound();
                assert.ok(!['Mike', 'November'].includes(hostSecretState.secretWord), `${levels.join('+')}: ${hostSecretState.secretWord}`);
                assert.ok(levels.includes(gameState.round.wordDifficulty));
            }
        }
    });

    it('with medium not chosen and nothing else in the pool, the empty filter falls back to them', () => {
        env.seedRandom(77);
        arrange({ settings: { cats: ['custom'], diff: ['easy', 'hard'] }, words: custom });
        const drawn = new Set();
        for (let round = 0; round < 12; round++) {
            startNextRound();
            drawn.add(hostSecretState.secretWord);
            assert.equal(gameState.round.wordDifficulty, null);
        }
        assert.deepEqual([...drawn].sort(), ['Mike', 'November']);
    });
});

describe('a match saved before the difficulty chips existed', () => {
    /** Write the game as the build before the chips wrote it (`diff` is whatever the test puts there), wipe memory, press "restore". */
    function saveThenRestoreWith(lang, diff) {
        setLang(lang);
        const packs = lang === 'en' ? WORD_PACKS_EN : WORD_PACKS;
        arrange({ settings: { cats: Object.keys(packs) } });
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
