import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { sideQuestsPool } from '../../js/data/sideQuests.js';
import { sideQuestsPoolEn } from '../../js/data/sideQuestsEn.js';
import { DATA_LANGS, getSideQuests, getWordPacks } from '../../js/data/banks.js';
import { WORD_PACKS_EN } from '../../js/data/wordPacksEn.js';
import { normalizeWord } from '../../js/utils/text.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const categories = Object.keys(WORD_PACKS);

describe('word bank', () => {
    it('has a category for every setup checkbox (except custom)', () => {
        const boxes = [...html.matchAll(/name="setup-cat" value="([a-z]+)"/g)].map((m) => m[1]).filter((v) => v !== 'custom');
        assert.deepEqual(boxes.sort(), [...categories].sort());
    });
    it('has more than 500 entries, as the UI label promises', () => {
        const total = categories.reduce((n, c) => n + WORD_PACKS[c].length, 0);
        assert.ok(total > 500, `only ${total} words`);
    });
    for (const category of categories) {
        it(`"${category}": entries are well-formed`, () => {
            for (const entry of WORD_PACKS[category]) {
                assert.deepEqual(Object.keys(entry).sort(), ['diff', 'foolWord', 'hint', 'word']);
                assert.ok(entry.word.trim() && entry.foolWord.trim() && entry.hint.trim(), JSON.stringify(entry));
                assert.ok(['easy', 'medium', 'hard'].includes(entry.diff), `${entry.word}: ${entry.diff}`);
            }
        });
        it(`"${category}": no duplicates, and the fool word differs from the real word`, () => {
            const seen = new Set();
            for (const { word, foolWord } of WORD_PACKS[category]) {
                const key = normalizeWord(word);
                assert.ok(!seen.has(key), `duplicate word "${word}"`);
                seen.add(key);
                assert.notEqual(normalizeWord(foolWord), key, `foolWord equals word for "${word}"`);
            }
        });
    }
    it('offers every difficulty level selectable in setup at least once, and easy words everywhere', () => {
        const all = categories.flatMap((c) => WORD_PACKS[c]);
        for (const level of ['easy', 'medium', 'hard']) {
            assert.ok(all.some((e) => e.diff === level), `no "${level}" words at all`);
        }
        for (const category of categories) {
            assert.ok(WORD_PACKS[category].some((e) => e.diff === 'easy'), `${category} has no easy words`);
        }
    });
    // Known imbalance, tracked in the README roadmap: only a handful of words are rated "hard".
    // This guard fails if the situation gets worse (fewer than 3 hard words in the whole bank).
    it('keeps at least 3 "hard" words so the difficulty filter stays meaningful', () => {
        const hard = categories.flatMap((c) => WORD_PACKS[c]).filter((e) => e.diff === 'hard');
        assert.ok(hard.length >= 3, `only ${hard.length} hard words`);
    });
});

describe('side quests', () => {
    it('is a list of unique, non-empty Persian sentences', () => {
        assert.ok(Array.isArray(sideQuestsPool) && sideQuestsPool.length > 0);
        assert.ok(sideQuestsPool.every((q) => typeof q === 'string' && q.trim().length > 10));
        assert.equal(new Set(sideQuestsPool).size, sideQuestsPool.length);
    });
});

// ---------------------------------------------------------------------------------------------------------
// One word bank and one side quest pool per language (js/data/banks.js). The Persian rules above stay as
// they are; the rules below are the structural ones every language follows, plus what English promises.
// ---------------------------------------------------------------------------------------------------------

/**
 * What the English bank has to hold. These numbers are meant to be raised as the bank grows; nothing else in
 * this file needs to change.
 *
 * A category that is FINISHED (written in full) has its entry in EN_MIN_WORDS_BY_CATEGORY at
 * EN_FINISHED_MIN_WORDS and must meet EN_MIN_BY_DIFFICULTY. A category that is NOT finished yet still holds
 * only its 8-word seed, so it keeps the seed floors (EN_SEED_MIN_WORDS words, EN_SEED_MIN_BY_DIFFICULTY per
 * difficulty); that keeps every intermediate version of the project green. Once every category is finished
 * the total floor EN_MIN_WORDS_TOTAL applies as well.
 */
const EN_SEED_MIN_WORDS = 6;
const EN_SEED_MIN_BY_DIFFICULTY = 2;
const EN_FINISHED_MIN_WORDS = 60;
const EN_MIN_WORDS_BY_CATEGORY = {
    // Finished categories:
    places: EN_FINISHED_MIN_WORDS,
    jobs: EN_FINISHED_MIN_WORDS,
    // NOT finished yet (seed floors). Raise each one to EN_FINISHED_MIN_WORDS when that category is written.
    foods: EN_SEED_MIN_WORDS,
    objects: EN_SEED_MIN_WORDS,
    vehicles: EN_SEED_MIN_WORDS,
    animals: EN_SEED_MIN_WORDS,
    sports: EN_SEED_MIN_WORDS,
    events: EN_SEED_MIN_WORDS
};
/** Per difficulty, for a finished category. */
const EN_MIN_BY_DIFFICULTY = { easy: 20, medium: 16, hard: 16 };
/** The whole English bank, once every category is finished. */
const EN_MIN_WORDS_TOTAL = 650;
/** No hint (case-insensitive) may be used by more entries than this, in the whole bank. */
const EN_MAX_HINT_REUSE = 4;
/** The English side quests: at least this many. */
const EN_MIN_SIDE_QUESTS = 20;

/** The longest a word, fool word or hint may be (the custom-word form enforces the same limit). */
const MAX_TEXT_LENGTH = 30;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
/** Persian and Arabic letters and digits (U+0600-06FF). */
const PERSIAN = /[\u0600-\u06FF]/;
const ARTICLE_AT_START = /^(the|a|an)(\s|$)/i;
const STARTS_UPPERCASE = /^\p{Lu}/u;
/** A word or fool word: letters, digits, spaces and a few marks. */
const PHRASE_SHAPE = /^[\p{L}\p{N} '’.&-]+$/u;
/** A hint: ONE capitalised word, letters, apostrophe or hyphen only. */
const HINT_SHAPE = /^\p{Lu}[\p{L}'’-]*$/u;
const MAX_WORDS_IN_PHRASE = 3;
/** A stem shorter than this is ignored by the containment check (too short to mean anything). */
const MIN_STEM_LENGTH = 4;

const readSource = (name) => readFileSync(new URL(`../../js/data/${name}`, import.meta.url), 'utf8');
const entriesOf = (packs) => Object.values(packs).flat();

describe('getWordPacks and getSideQuests', () => {
    it('serve the Persian bank and quests untouched for fa, and the English ones for en', () => {
        assert.equal(getWordPacks('fa'), WORD_PACKS);
        assert.equal(getSideQuests('fa'), sideQuestsPool);
        assert.equal(getWordPacks('en'), WORD_PACKS_EN);
        assert.equal(getSideQuests('en'), sideQuestsPoolEn);
        assert.deepEqual([...DATA_LANGS].sort(), ['en', 'fa']);
    });

    it('fall back to Persian for a language with no data, including odd values', () => {
        for (const lang of ['de', '', undefined, null, 5, {}, 'EN', '__proto__', 'constructor', 'toString']) {
            assert.equal(getWordPacks(lang), WORD_PACKS, String(lang));
            assert.equal(getSideQuests(lang), sideQuestsPool, String(lang));
        }
    });

    it('the data files themselves do not import anything (the language is a parameter)', () => {
        for (const file of ['banks.js', 'wordPacksEn.js', 'sideQuestsEn.js']) {
            const imports = [...readSource(file).matchAll(/^\s*import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
            assert.ok(imports.every((target) => /^\.\/[A-Za-z]+\.js$/.test(target)), `${file}: ${imports}`);
        }
    });
});

for (const lang of DATA_LANGS) {
    describe(`word bank (${lang}): structure every language follows`, () => {
        const packs = getWordPacks(lang);
        const all = entriesOf(packs);

        it('has the same eight category ids as the Persian bank', () => {
            assert.deepEqual(Object.keys(packs).sort(), Object.keys(WORD_PACKS).sort());
        });

        it('has well-formed entries: exactly { word, foolWord, hint, diff }, a known difficulty, trimmed text', () => {
            for (const entry of all) {
                assert.deepEqual(Object.keys(entry).sort(), ['diff', 'foolWord', 'hint', 'word'], JSON.stringify(entry));
                for (const field of ['word', 'foolWord', 'hint']) {
                    assert.equal(typeof entry[field], 'string', `${entry.word}.${field}`);
                    assert.ok(entry[field].trim() && entry[field] === entry[field].trim(), `${entry.word}.${field} is empty or untrimmed`);
                }
                assert.ok(DIFFICULTIES.includes(entry.diff), `${entry.word}: ${entry.diff}`);
            }
        });

        it(`keeps word, foolWord and hint at ${MAX_TEXT_LENGTH} characters or fewer`, () => {
            for (const entry of all) {
                for (const field of ['word', 'foolWord', 'hint']) {
                    assert.ok(entry[field].length <= MAX_TEXT_LENGTH, `${entry.word}.${field} is ${entry[field].length} characters`);
                }
            }
        });

        it('has no word twice anywhere in the bank (compared the way the used-words rule compares them)', () => {
            const seen = new Map();
            for (const [category, list] of Object.entries(packs)) {
                for (const { word } of list) {
                    const key = normalizeWord(word);
                    assert.ok(!seen.has(key), `"${word}" (${category}) is already in ${seen.get(key)}`);
                    seen.set(key, category);
                }
            }
        });

        it('has a fool word that differs from the word, and a hint that differs from the word', () => {
            for (const { word, foolWord, hint } of all) {
                assert.notEqual(normalizeWord(foolWord), normalizeWord(word), `foolWord equals word for "${word}"`);
                assert.notEqual(normalizeWord(hint), normalizeWord(word), `hint equals word for "${word}"`);
            }
        });
    });
}

describe('English word bank', () => {
    const categories = Object.keys(WORD_PACKS_EN);
    const isFinished = (category) => EN_MIN_WORDS_BY_CATEGORY[category] > EN_SEED_MIN_WORDS;
    const everyEntry = () => categories.flatMap((category) => WORD_PACKS_EN[category].map((entry) => ({ category, ...entry })));
    const where = ({ word, category }) => `"${word}" (${category})`;

    it('has a floor for exactly the categories of the bank', () => {
        assert.deepEqual(Object.keys(EN_MIN_WORDS_BY_CATEGORY).sort(), [...categories].sort());
    });

    for (const category of categories) {
        const finished = isFinished(category);
        const minWords = EN_MIN_WORDS_BY_CATEGORY[category];
        it(`"${category}" (${finished ? 'finished' : 'seed'}): at least ${minWords} words and the per-difficulty floors`, () => {
            const list = WORD_PACKS_EN[category];
            assert.ok(list.length >= minWords, `${category} has only ${list.length} words (floor ${minWords})`);
            for (const level of DIFFICULTIES) {
                const floor = finished ? EN_MIN_BY_DIFFICULTY[level] : EN_SEED_MIN_BY_DIFFICULTY;
                const count = list.filter((e) => e.diff === level).length;
                assert.ok(count >= floor, `${category} has only ${count} "${level}" words (floor ${floor})`);
            }
        });
    }

    it('has enough words in total (the full floor once every category is finished)', () => {
        const total = everyEntry().length;
        const everythingFinished = categories.every(isFinished);
        const floor = everythingFinished ? EN_MIN_WORDS_TOTAL : categories.reduce((n, c) => n + EN_MIN_WORDS_BY_CATEGORY[c], 0);
        assert.ok(total >= floor, `only ${total} words in total (floor ${floor}${everythingFinished ? '' : ', sum of the category floors'})`);
    });

    it('writes word, foolWord and hint in the agreed shape: uppercase start, allowed characters, at most 3 words, one-word hint', () => {
        for (const entry of everyEntry()) {
            for (const field of ['word', 'foolWord', 'hint']) {
                assert.match(entry[field], STARTS_UPPERCASE, `${where(entry)}: ${field} "${entry[field]}" does not start with an uppercase letter`);
            }
            for (const field of ['word', 'foolWord']) {
                assert.match(entry[field], PHRASE_SHAPE, `${where(entry)}: ${field} "${entry[field]}" has a character that is not a letter, digit, space or one of ' ’ . & -`);
                assert.doesNotMatch(entry[field], / {2,}/, `${where(entry)}: ${field} "${entry[field]}" has a double space`);
                const count = entry[field].split(' ').length;
                assert.ok(count <= MAX_WORDS_IN_PHRASE, `${where(entry)}: ${field} "${entry[field]}" has ${count} words (at most ${MAX_WORDS_IN_PHRASE})`);
            }
            assert.match(entry.hint, HINT_SHAPE, `${where(entry)}: hint "${entry.hint}" is not one word of letters, apostrophe or hyphen`);
        }
    });

    /** The normalised text, plus the simple stems a plain "contains" check would miss (plural, -ing, -ed). */
    function forms(text) {
        const base = normalizeWord(text);
        const out = new Set([base]);
        const add = (stem) => {
            if (stem.length >= MIN_STEM_LENGTH) out.add(stem);
        };
        if (base.endsWith('ies')) add(`${base.slice(0, -3)}y`);
        if (base.endsWith('es')) add(base.slice(0, -2));
        if (base.endsWith('s')) add(base.slice(0, -1));
        for (const suffix of ['ing', 'ed']) {
            if (!base.endsWith(suffix)) continue;
            const stem = base.slice(0, -suffix.length);
            add(stem);
            add(`${stem}e`);
        }
        return out;
    }
    /** Why `a` and `b` contain each other (as written or after stripping an ending), or null. */
    function overlap(a, b) {
        for (const x of forms(a)) {
            for (const y of forms(b)) {
                if (x.includes(y) || y.includes(x)) return x === y ? `both read "${x}"` : `"${x}" and "${y}" contain each other`;
            }
        }
        return null;
    }

    it('never lets the hint contain the word or the word contain the hint (also after stripping -s, -es, -ing, -ed)', () => {
        for (const entry of everyEntry()) {
            const reason = overlap(entry.word, entry.hint);
            assert.equal(reason, null, `${where(entry)}: hint "${entry.hint}" gives the word away: ${reason}`);
        }
    });

    it('never lets the foolWord contain the word or the word contain the foolWord (also after stripping -s, -es, -ing, -ed)', () => {
        for (const entry of everyEntry()) {
            const reason = overlap(entry.word, entry.foolWord);
            assert.equal(reason, null, `${where(entry)}: foolWord "${entry.foolWord}" is a variant of the word: ${reason}`);
        }
    });

    it(`uses no hint (case-insensitive) in more than ${EN_MAX_HINT_REUSE} entries of the whole bank`, () => {
        const wordsByHint = new Map();
        for (const { word, hint } of everyEntry()) {
            const key = hint.toLowerCase();
            wordsByHint.set(key, [...(wordsByHint.get(key) ?? []), word]);
        }
        const overused = [...wordsByHint].filter(([, words]) => words.length > EN_MAX_HINT_REUSE);
        const message = overused.map(([hint, words]) => `hint "${hint}" is used by ${words.length} entries: ${words.join(', ')}`).join('; ');
        assert.equal(overused.length, 0, `${message} (at most ${EN_MAX_HINT_REUSE})`);
    });

    it('has a foolWord that differs from the entry\'s own hint', () => {
        for (const entry of everyEntry()) {
            assert.notEqual(normalizeWord(entry.foolWord), normalizeWord(entry.hint), `${where(entry)}: foolWord "${entry.foolWord}" equals the hint`);
        }
    });

    it('has no Persian or Arabic letter or digit in any word, in the data file, or in its comments', () => {
        for (const { word, foolWord, hint } of entriesOf(WORD_PACKS_EN)) {
            assert.doesNotMatch(`${word}|${foolWord}|${hint}`, PERSIAN, word);
        }
        assert.doesNotMatch(readSource('wordPacksEn.js'), PERSIAN);
    });

    it('never starts a word, fool word or hint with an article', () => {
        for (const { word, foolWord, hint } of entriesOf(WORD_PACKS_EN)) {
            for (const text of [word, foolWord, hint]) assert.doesNotMatch(text, ARTICLE_AT_START, `"${text}" (word "${word}")`);
        }
    });

    it('gives the spy ONE hint word, and one that is not hidden inside the word itself', () => {
        for (const { word, hint } of entriesOf(WORD_PACKS_EN)) {
            assert.doesNotMatch(hint, /\s/, `hint "${hint}" of "${word}" is more than one word`);
            assert.ok(!word.toLowerCase().includes(hint.toLowerCase()), `hint "${hint}" is part of "${word}"`);
        }
    });
});

describe('English side quests', () => {
    it(`has at least ${EN_MIN_SIDE_QUESTS} quests, all different (case-insensitive)`, () => {
        assert.ok(Array.isArray(sideQuestsPoolEn));
        assert.ok(sideQuestsPoolEn.length >= EN_MIN_SIDE_QUESTS, `only ${sideQuestsPoolEn.length} quests`);
        assert.equal(new Set(sideQuestsPoolEn.map((q) => q.toLowerCase())).size, sideQuestsPoolEn.length);
    });

    it('is plain English: no Persian letters in a quest or in the file', () => {
        for (const quest of sideQuestsPoolEn) assert.doesNotMatch(quest, PERSIAN, quest);
        assert.doesNotMatch(readSource('sideQuestsEn.js'), PERSIAN);
    });

    it('is one trimmed sentence per quest: it ends with a full stop and has no other sentence end inside', () => {
        for (const quest of sideQuestsPoolEn) {
            assert.equal(typeof quest, 'string');
            assert.ok(quest === quest.trim() && quest.trim().length > 10, quest);
            assert.ok(quest.endsWith('.'), `"${quest}" does not end with a full stop`);
            assert.doesNotMatch(quest.slice(0, -1), /[.!?]/, `"${quest}" holds more than one sentence`);
        }
    });

    it('asks for nothing that needs a prop or names a role', () => {
        const forbidden = /\b(phone|watch|card|paper|pen|pencil|cup|glass|table|chair|spy|spies|citizen|fool|detective|secret word)\b/i;
        for (const quest of sideQuestsPoolEn) assert.doesNotMatch(quest, forbidden, quest);
    });
});
