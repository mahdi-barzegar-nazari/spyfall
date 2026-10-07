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
 * What the English SEED bank has to hold per category. A later step grows the bank to hundreds of words and
 * raises these two numbers with it; nothing else in this file needs to change.
 */
const EN_MIN_WORDS_PER_CATEGORY = 6;
const EN_MIN_WORDS_PER_DIFFICULTY = 2;
/** The English side quests: at least this many. */
const EN_MIN_SIDE_QUESTS = 20;

/** The longest a word, fool word or hint may be (the custom-word form enforces the same limit). */
const MAX_TEXT_LENGTH = 30;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
/** Persian and Arabic letters and digits (U+0600-06FF). */
const PERSIAN = /[\u0600-\u06FF]/;
const ARTICLE_AT_START = /^(the|a|an)(\s|$)/i;

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

describe('English word bank (seed)', () => {
    const categories = Object.keys(WORD_PACKS_EN);

    for (const category of categories) {
        it(`"${category}": at least ${EN_MIN_WORDS_PER_CATEGORY} words, and at least ${EN_MIN_WORDS_PER_DIFFICULTY} of each difficulty`, () => {
            const list = WORD_PACKS_EN[category];
            assert.ok(list.length >= EN_MIN_WORDS_PER_CATEGORY, `${category} has only ${list.length} words`);
            for (const level of DIFFICULTIES) {
                const count = list.filter((e) => e.diff === level).length;
                assert.ok(count >= EN_MIN_WORDS_PER_DIFFICULTY, `${category} has only ${count} "${level}" words`);
            }
        });
    }

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
