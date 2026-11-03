/**
 * The question ideas of the discussion screen: the two banks (js/data/questionIdeas.js for Persian,
 * js/data/questionIdeasEn.js for English, read through `getQuestionIdeas` in js/data/banks.js).
 *
 * What is pinned here is what makes a question fit for a public screen and for ANY secret word of ANY category:
 * enough distinct, clean, short entries; a mix of open and yes/no questions; no category name, no meta word
 * ("word", "spy") and no secret word of the built-in banks (words and decoy words, both languages) as a whole
 * word; and the Persian text only where Persian text is allowed (js/data/).
 *
 * The picker is tested in question-picker.test.mjs, the button and the wiring in question-idea-ui.test.mjs and
 * tests/e2e/question-idea.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DATA_LANGS, FALLBACK_DATA_LANG, getQuestionIdeas, getWordPacks } from '../../js/data/banks.js';
import { questionIdeasPool } from '../../js/data/questionIdeas.js';
import { questionIdeasPoolEn } from '../../js/data/questionIdeasEn.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { normalizeWord } from '../../js/utils/text.js';

/** Floors and limits. Raising a floor is a one-number change. */
const MIN_QUESTIONS = 40;
const MAX_LENGTH = 80;
/** Open questions (what, when, who ...) and the other kind (yes/no and either/or): each kind at least this many. */
const MIN_PER_KIND = 12;

const BANKS = { fa: questionIdeasPool, en: questionIdeasPoolEn };
const CATALOGS = { fa, en };
const root = new URL('../../', import.meta.url);

const PERSIAN_LETTER = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-z]/;
const DIGIT = /[0-9\u06F0-\u06F9\u0660-\u0669]/;

/** Lower-cased words of a text, written the way the game compares words (`normalizeWord`), cut at every non-letter. */
const tokens = (text) =>
    normalizeWord(text)
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);

/** True when `words` (a list of tokens) appears inside `haystack` (a list of tokens), in order and whole. */
function containsWholeWords(haystack, words) {
    if (words.length === 0) return false;
    for (let start = 0; start + words.length <= haystack.length; start++) {
        if (words.every((word, offset) => haystack[start + offset] === word)) return true;
    }
    return false;
}

describe('the question banks: the data layer', () => {
    it('each language has a bank of its own, and getQuestionIdeas returns exactly that array', () => {
        assert.equal(getQuestionIdeas('fa'), questionIdeasPool);
        assert.equal(getQuestionIdeas('en'), questionIdeasPoolEn);
        assert.notEqual(questionIdeasPool, questionIdeasPoolEn);
    });

    it('a language with no bank, and anything that is not a language, gets the Persian bank (like the word banks)', () => {
        for (const lang of ['de', 'EN', ' en', '', undefined, null, 0, {}, '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
            assert.equal(getQuestionIdeas(lang), BANKS[FALLBACK_DATA_LANG], String(lang));
        }
    });

    it('every language of the word banks resolves to a real bank (its own, or the Persian one while it has none)', () => {
        assert.deepEqual(DATA_LANGS.sort(), ['en', 'fa']);
        for (const lang of DATA_LANGS) {
            const bank = getQuestionIdeas(lang);
            assert.ok(Array.isArray(bank) && bank.length >= MIN_QUESTIONS, `${lang}: ${bank?.length}`);
        }
    });
});

for (const [lang, bank] of Object.entries(BANKS)) {
    describe(`the ${lang} question bank: entries`, () => {
        it(`has at least ${MIN_QUESTIONS} entries`, () => {
            assert.ok(Array.isArray(bank));
            assert.ok(bank.length >= MIN_QUESTIONS, `only ${bank.length}`);
        });

        it('every entry is a non-empty, trimmed string on one line, with no double spaces', () => {
            for (const entry of bank) {
                assert.equal(typeof entry, 'string', String(entry));
                assert.ok(entry.length > 0 && entry.trim().length > 0, `empty entry: ${JSON.stringify(entry)}`);
                assert.equal(entry, entry.trim(), `not trimmed: ${JSON.stringify(entry)}`);
                assert.doesNotMatch(entry, /[\n\r\t\u2028\u2029]/, `not one line: ${JSON.stringify(entry)}`);
                assert.doesNotMatch(entry, / {2,}/, `double space: ${entry}`);
            }
        });

        it(`no entry is longer than ${MAX_LENGTH} characters (one or two lines at 360 px)`, () => {
            for (const entry of bank) assert.ok(entry.length <= MAX_LENGTH, `${entry.length} characters: ${entry}`);
        });

        it('has no duplicate, also when case, punctuation and the invisible marks are ignored', () => {
            assert.equal(new Set(bank).size, bank.length, 'an entry is repeated');
            const seen = new Map();
            for (const entry of bank) {
                const key = tokens(entry).join(' ');
                assert.ok(!seen.has(key), `"${entry}" is the same question as "${seen.get(key)}"`);
                seen.set(key, entry);
            }
        });

        it('is plain text: no markup, no placeholder, no digit (numbers are spelled out)', () => {
            for (const entry of bank) {
                assert.doesNotMatch(entry, /[<>&`{}]/, `markup or placeholder: ${entry}`);
                assert.doesNotMatch(entry, DIGIT, `a digit: ${entry}`);
            }
        });

        it('is a question: exactly one question mark, and it is the last character', () => {
            const mark = lang === 'fa' ? '\u061F' : '?';
            for (const entry of bank) {
                assert.ok(entry.endsWith(mark), `does not end with ${mark}: ${entry}`);
                assert.equal(entry.split(mark).length - 1, 1, `more than one ${mark}: ${entry}`);
                assert.doesNotMatch(entry, lang === 'fa' ? /\?/ : /\u061F/, `the other language's question mark: ${entry}`);
            }
        });
    });
}

describe('the fa question bank: the script', () => {
    it('is Persian: every entry has Persian letters, no Latin letter, and no Arabic yeh or kaf', () => {
        for (const entry of questionIdeasPool) {
            assert.match(entry, PERSIAN_LETTER, entry);
            assert.doesNotMatch(entry, LATIN_LETTER, `a Latin letter: ${entry}`);
            assert.doesNotMatch(entry, /[\u064A\u0643]/, `Arabic yeh or kaf instead of the Persian letter: ${entry}`);
        }
    });

    it('is written in the spoken register: no stiff "آیا" opener, and no entry in the formal "می‌باشد" style', () => {
        for (const entry of questionIdeasPool) {
            assert.ok(!tokens(entry).includes('آیا'), `a formal opener: ${entry}`);
            assert.doesNotMatch(entry, /می‌باشد|نمی‌باشد|گردد/, `formal wording: ${entry}`);
        }
    });
});

describe('the en question bank: the script', () => {
    it('is English: no Persian letter, a capital first letter, and ’ (not \') as the apostrophe, like the catalog', () => {
        for (const entry of questionIdeasPoolEn) {
            assert.doesNotMatch(entry, PERSIAN_LETTER, `a Persian letter: ${entry}`);
            assert.match(entry, /^[A-Z]/, `no capital first letter: ${entry}`);
            assert.doesNotMatch(entry, /['"`]/, `a straight quote or apostrophe: ${entry}`);
        }
    });
});

describe('the question banks: a mix of open and yes/no questions', () => {
    /** Words that make a Persian question an open one (the spoken forms); the rest are yes/no or either/or. */
    const FA_OPEN = new Set(['چی', 'چیه', 'چه', 'کی', 'کیه', 'کجا', 'کجاست', 'کدوم', 'کدومه', 'چطوری', 'چطور', 'چقدر', 'چند', 'چرا']);
    const isOpen = {
        en: (entry) => /^(what|which|when|where|who|whom|whose|how|why)\b/i.test(entry),
        fa: (entry) => tokens(entry).some((word) => FA_OPEN.has(word))
    };

    for (const [lang, bank] of Object.entries(BANKS)) {
        it(`${lang}: at least ${MIN_PER_KIND} open questions and at least ${MIN_PER_KIND} yes/no or either/or questions`, () => {
            const open = bank.filter(isOpen[lang]).length;
            const closed = bank.length - open;
            assert.ok(open >= MIN_PER_KIND, `only ${open} open questions`);
            assert.ok(closed >= MIN_PER_KIND, `only ${closed} yes/no questions`);
        });
    }

    it('the classifier itself tells the two kinds apart (so the test above is not vacuous)', () => {
        assert.equal(isOpen.en('When did you last come across it?'), true);
        assert.equal(isOpen.en('Is it expensive?'), false);
        assert.equal(isOpen.fa('بهترین قسمتش چیه؟'), true);
        assert.equal(isOpen.fa('مردم معمولاً از چی‌ش گله دارن؟'), true);
        assert.equal(isOpen.fa('خطرناکه؟'), false);
    });
});

describe('the question banks: nothing about the word or its category', () => {
    /** Words that name a category, a "word" or a "spy": what a player must never be told by a public question. */
    const CATEGORY_KEYS = ['places', 'jobs', 'foods', 'objects', 'vehicles', 'animals', 'sports', 'events'];
    const EXTRA_FORBIDDEN = {
        en: ['place', 'places', 'job', 'jobs', 'food', 'foods', 'snack', 'snacks', 'object', 'objects', 'tech', 'technology', 'vehicle', 'vehicles', 'animal', 'animals', 'nature', 'sport', 'sports', 'game', 'games', 'event', 'events', 'category', 'categories', 'topic', 'topics', 'word', 'words', 'spy', 'spies', 'secret', 'custom'],
        fa: ['مکان', 'مکان‌ها', 'اماکن', 'شغل', 'مشاغل', 'حرفه', 'غذا', 'غذاها', 'خوراکی', 'شیء', 'شی', 'اشیاء', 'وسیله', 'وسایل', 'نقلیه', 'حیوان', 'حیوانات', 'طبیعت', 'ورزش', 'بازی', 'رویداد', 'رویدادها', 'پدیده', 'دسته', 'موضوع', 'کلمه', 'کلمات', 'جاسوس', 'مخفی', 'رمز', 'سفارشی']
    };

    /** The whole-word tokens that name a category in the catalogs (what a player reads in setup), plus the extras. */
    const forbidden = (lang) => {
        const fromCatalog = CATEGORY_KEYS.flatMap((key) => tokens(CATALOGS[lang][`setup.cat.${key}`])).filter((word) => word.length >= 3);
        return new Set([...fromCatalog, ...EXTRA_FORBIDDEN[lang].flatMap((word) => tokens(word)).filter((word) => word.length >= 3)]);
    };

    it('the forbidden lists really come from the catalogs (guards against an empty list)', () => {
        for (const lang of ['fa', 'en']) {
            const words = forbidden(lang);
            assert.ok(words.size >= 20, `${lang}: only ${words.size} words`);
        }
        assert.ok(forbidden('en').has('animals') && forbidden('en').has('vehicles') && forbidden('en').has('sports'));
        assert.ok(forbidden('fa').has('حیوانات') && forbidden('fa').has('رویدادها') && forbidden('fa').has('ورزش'));
    });

    for (const [lang, bank] of Object.entries(BANKS)) {
        it(`${lang}: no entry names a category, the word, or the spy (whole words, both languages' lists)`, () => {
            const offenders = [];
            for (const entry of bank) {
                const words = tokens(entry);
                for (const listLang of ['fa', 'en']) {
                    for (const word of forbidden(listLang)) if (words.includes(word)) offenders.push(`${entry}  ->  ${word}`);
                }
            }
            assert.deepEqual(offenders, []);
        });
    }
});

describe('the question banks: no secret word of the built-in banks', () => {
    /** Every secret word and decoy word of both word banks, as token lists, once each. */
    const secretWords = new Map();
    for (const lang of ['fa', 'en']) {
        for (const entry of Object.values(getWordPacks(lang)).flat()) {
            for (const text of [entry.word, entry.foolWord]) {
                const words = tokens(text);
                if (words.length > 0) secretWords.set(words.join(' '), { text, words });
            }
        }
    }

    it('checks the real banks (guards against reading nothing)', () => {
        assert.ok(secretWords.size > 1000, `only ${secretWords.size} words`);
        assert.ok(getWordPacks('en').foods.length > 20 && getWordPacks('fa').foods.length > 20);
    });

    for (const [lang, bank] of Object.entries(BANKS)) {
        it(`${lang}: no entry contains a secret word or a decoy word, as a whole word (any language's bank)`, () => {
            const offenders = [];
            for (const entry of bank) {
                const words = tokens(entry);
                for (const { text, words: secret } of secretWords.values()) {
                    if (containsWholeWords(words, secret)) offenders.push(`${entry}  ->  "${text}"`);
                }
            }
            assert.deepEqual(offenders, []);
        });
    }

    it('the matcher finds a whole word (also a word of several parts, and inside the spoken forms) and nothing else', () => {
        const bankWord = (lang) => getWordPacks(lang).foods[0].word;
        // A real word of each bank, put into a question, is found; a longer word that only contains it is not.
        for (const lang of ['fa', 'en']) {
            const word = bankWord(lang);
            const sample = lang === 'fa' ? `آیا ${word} هست؟` : `Is it ${word.toLowerCase()}?`;
            assert.ok(containsWholeWords(tokens(sample), tokens(word)), `${lang}: "${word}" in "${sample}"`);
        }
        assert.equal(containsWholeWords(tokens('Is it a category?'), tokens('cat')), false);
        assert.equal(containsWholeWords(tokens('Is it ice cream?'), tokens('ice cream')), true);
        assert.equal(containsWholeWords(tokens('Is it cream of ice?'), tokens('ice cream')), false);
        assert.equal(containsWholeWords(tokens('anything'), []), false);
    });
});

describe('the question banks: where the Persian text lives', () => {
    const read = (file) => readFileSync(new URL(file, root), 'utf8');

    it('the English bank file has no Arabic-script letter or digit anywhere, comments included', () => {
        const source = read('js/data/questionIdeasEn.js');
        assert.ok(source.length > 500, 'the file was not read');
        assert.doesNotMatch(source, /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/);
    });

    it('the Persian bank file keeps Persian letters on string lines only: its comments are English', () => {
        const source = read('js/data/questionIdeas.js');
        const stray = source
            .split('\n')
            .map((line, index) => ({ line, number: index + 1 }))
            .filter(({ line }) => PERSIAN_LETTER.test(line) && !/^\s*'[^'\n]*',?$/.test(line));
        assert.deepEqual(stray.map(({ number, line }) => `${number}: ${line.trim().slice(0, 80)}`), []);
    });

    it('both bank files are in js/data/, the folder the no-hardcoded-text guard leaves alone, and import nothing', () => {
        for (const file of ['js/data/questionIdeas.js', 'js/data/questionIdeasEn.js']) {
            assert.doesNotMatch(read(file), /^\s*import\s/m, `${file} imports something`);
        }
        const guard = read('tests/unit/no-hardcoded-text.test.mjs');
        assert.match(guard, /SKIPPED_DIRS = \['js\/data\/', 'js\/i18n\/'\]/, 'the guard no longer leaves js/data/ alone');
    });

    it('the bank arrays are exported under one name each, and nothing else is exported from the files', () => {
        for (const [file, name] of [
            ['js/data/questionIdeas.js', 'questionIdeasPool'],
            ['js/data/questionIdeasEn.js', 'questionIdeasPoolEn']
        ]) {
            const exports = [...read(file).matchAll(/^export\s+(?:const|function|let|var|class)\s+(\w+)/gm)].map((m) => m[1]);
            assert.deepEqual(exports, [name], file);
        }
    });
});
