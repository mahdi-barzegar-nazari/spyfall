/**
 * The English catalog and what switching to it does: it has every Persian key, reads as English (no Persian
 * letters, no HTML, no untranslated copy), `setLang('en')` writes `lang="en" dir="ltr"`, numbers come out in
 * Latin digits, and the plural and duration helpers give English plurals.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertLabelMatchesBank, numberInLabel } from './helpers/bankLabel.mjs';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const env = installFakeEnv();
const { CATALOGS } = await import('../../js/i18n/catalogs.js');
const { fa } = await import('../../js/i18n/fa.js');
const { en } = await import('../../js/i18n/en.js');
const { getWordPacks } = await import('../../js/data/banks.js');
const { DEFAULT_LANG, LANG_DIRECTIONS, SUPPORTED_LANGS, formatDuration, formatNumber, getLang, setLang, t, tn } =
    await import('../../js/i18n/index.js');

const EN_SOURCE = readFileSync(fileURLToPath(new URL('../../js/i18n/en.js', import.meta.url)), 'utf8');

/** Persian and Arabic letters and digits (U+0600-06FF). */
const PERSIAN = /[\u0600-\u06FF]/;
const placeholders = (text) => [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort();
const emoji = (text) => (text.match(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu) || []).join('');
const baseKey = (key) => key.replace(/\.(zero|one|two|few|many|other)$/, '');

/**
 * English values allowed to equal the Persian one, each with the reason. Empty today: even the emoji-only
 * and brand-name texts carry some other character that differs. Add a key here only for a text that is
 * the same in both languages on purpose (an emoji alone, a brand name).
 */
const SAME_AS_PERSIAN = {};

beforeEach(() => {
    document.documentElement = { lang: 'sentinel', dir: 'sentinel' };
});
afterEach(() => {
    setLang(DEFAULT_LANG);
    env.reset();
});
after(() => env.uninstall());

describe('English catalog: registration', () => {
    it('is registered next to Persian, with its direction', () => {
        assert.equal(CATALOGS.en, en);
        assert.deepEqual([...SUPPORTED_LANGS].sort(), ['en', 'fa']);
        assert.equal(LANG_DIRECTIONS.en, 'ltr');
        assert.equal(LANG_DIRECTIONS.fa, 'rtl');
        assert.equal(DEFAULT_LANG, 'fa');
    });
});

describe('English catalog: content', () => {
    const keys = Object.keys(fa);

    it('has every Persian key and nothing else, with the same placeholders', () => {
        assert.deepEqual(Object.keys(en).sort(), [...keys].sort());
        for (const key of keys) assert.deepEqual(placeholders(en[key]), placeholders(fa[key]), key);
    });

    it('keeps the emoji of every text exactly as in Persian', () => {
        const differing = keys.filter((key) => emoji(en[key]) !== emoji(fa[key])).map((key) => `${key}: ${emoji(fa[key])} vs ${emoji(en[key])}`);
        assert.deepEqual(differing, []);
    });

    it('has no Persian or Arabic letter or digit anywhere in the file, comments included', () => {
        assert.ok(!PERSIAN.test(EN_SOURCE), 'en.js source contains a Persian/Arabic character');
        assert.deepEqual(keys.filter((key) => PERSIAN.test(en[key])), []);
    });

    it('has no HTML in any value', () => {
        for (const key of keys) {
            assert.doesNotMatch(en[key], /<\/?[a-zA-Z!]/, `${key}: HTML tag`);
            assert.doesNotMatch(en[key], /&(#\d+|#x[\da-f]+|[a-z]+);/i, `${key}: HTML entity`);
        }
    });

    it('has values that are non-empty, trimmed and free of doubled spaces', () => {
        for (const key of keys) {
            assert.ok(en[key].trim(), `${key}: empty`);
            assert.equal(en[key], en[key].trim(), `${key}: leading or trailing space`);
            assert.doesNotMatch(en[key], / {2}/, `${key}: doubled space`);
        }
    });

    it('is never the Persian text itself, except for the listed texts', () => {
        const same = keys.filter((key) => en[key] === fa[key] && !(key in SAME_AS_PERSIAN));
        assert.deepEqual(same, [], 'a text still in Persian, or an allowed one missing from SAME_AS_PERSIAN');
    });

    it('the allow-list is current: every entry exists, is really the same text and says why', () => {
        for (const [key, reason] of Object.entries(SAME_AS_PERSIAN)) {
            assert.ok(key in en, `${key} is not a catalog key`);
            assert.equal(en[key], fa[key], `${key} differs from Persian, so it needs no exception`);
            assert.ok(reason && reason.length > 10, `${key}: no reason`);
        }
    });

    it('every plural text has .one and .other, and English needs no other plural category', () => {
        const categories = new Intl.PluralRules('en').resolvedOptions().pluralCategories.sort();
        assert.deepEqual(categories, ['one', 'other']);
        const bases = new Set(keys.filter((key) => /\.(one|other)$/.test(key)).map(baseKey));
        assert.ok(bases.size >= 8, `only ${bases.size} plural texts`);
        for (const base of bases) {
            assert.equal(typeof en[`${base}.one`], 'string', `${base}.one`);
            assert.equal(typeof en[`${base}.other`], 'string', `${base}.other`);
        }
    });

    it('the singular and plural forms really differ where a noun follows the count', () => {
        for (const base of ['score.points', 'time.minutes', 'time.seconds', 'scorecard.meta.rounds', 'scorecard.meta.players', 'toast.wordsImported', 'wager.option.max', 'names.more']) {
            assert.notEqual(en[`${base}.one`], en[`${base}.other`], base);
        }
    });

    it('the English "all categories" button is true for the English word bank: no number, or its size rounded down to a hundred', () => {
        assertLabelMatchesBank(en['setup.categories.all'], getWordPacks('en'));
    });

    it('while the English bank is a seed (under a hundred words) the label states no number, and not the Persian one', () => {
        const total = Object.values(getWordPacks('en')).reduce((sum, list) => sum + list.length, 0);
        if (total >= 100) return;
        assert.equal(numberInLabel(en['setup.categories.all']), null, en['setup.categories.all']);
        assert.equal(en['setup.categories.all'].includes('700'), false);
    });

    it('t() finds every key in English with no fallback to Persian', () => {
        setLang('en');
        for (const key of keys) {
            const text = t(key);
            assert.equal(text, en[key], key);
            assert.ok(!PERSIAN.test(text), `${key} fell back to Persian`);
        }
    });
});

describe('switching to English', () => {
    it('setLang("en") writes lang="en" dir="ltr", and setLang("fa") restores fa / rtl', () => {
        assert.equal(setLang('en'), true);
        assert.equal(getLang(), 'en');
        assert.deepEqual(document.documentElement, { lang: 'en', dir: 'ltr' });
        assert.equal(setLang('fa'), true);
        assert.equal(getLang(), 'fa');
        assert.deepEqual(document.documentElement, { lang: 'fa', dir: 'rtl' });
    });

    it('formatNumber writes Latin digits in English and Persian digits in Persian', () => {
        setLang('en');
        assert.equal(formatNumber(1234567890), '1234567890');
        assert.equal(formatNumber('4:05'), '4:05');
        setLang('fa');
        assert.equal(formatNumber(1234567890), '۱۲۳۴۵۶۷۸۹۰');
        assert.equal(formatNumber('4:05'), '۴:۰۵');
    });
});

describe('the sign of a score change belongs to the language', () => {
    it('English puts the plus first, Persian keeps "3+" (an RTL line shows it as +3)', () => {
        setLang('en');
        assert.equal(t('result.change.positive', { count: 3 }), '+3');
        setLang('fa');
        assert.equal(t('result.change.positive', { count: 3 }), '3+');
    });
});

describe('English plurals and durations', () => {
    it('tn() picks the English plural form', () => {
        setLang('en');
        assert.equal(tn('score.points', 1), '1 point');
        assert.equal(tn('score.points', 0), '0 points');
        assert.equal(tn('score.points', 2), '2 points');
        assert.equal(tn('time.minutes', 1), '1 minute');
        assert.equal(tn('time.minutes', 2), '2 minutes');
        assert.equal(tn('toast.wordsImported', 1), '1 new word added!');
        assert.equal(tn('toast.wordsImported', 5), '5 new words added!');
        assert.equal(tn('names.more', 2, { a: 'Sara' }), 'Sara and 2 others');
        assert.equal(tn('names.more', 1, { a: 'Sara' }), 'Sara and 1 other');
        assert.equal(tn('wager.option.max', 1), 'Max (1 point)');
        assert.equal(tn('elim.note.wrongSurvive', 1), 'Wrong vote! Every spy still in the game gets +1 survival point.');
        assert.equal(tn('elim.note.wrongSurvive', 3), 'Wrong vote! Every spy still in the game gets +3 survival points.');
    });

    it('formatDuration() writes English minutes and seconds', () => {
        setLang('en');
        assert.equal(formatDuration(0), '0 seconds');
        assert.equal(formatDuration(1), '1 second');
        assert.equal(formatDuration(45), '45 seconds');
        assert.equal(formatDuration(60), '1 minute and 0 seconds');
        assert.equal(formatDuration(61), '1 minute and 1 second');
        assert.equal(formatDuration(129), '2 minutes and 9 seconds');
        assert.equal(formatDuration(-5), '0 seconds');
        assert.equal(formatDuration('x'), '0 seconds');
    });

    it('Persian output is untouched by the English catalog', () => {
        setLang('fa');
        assert.equal(tn('time.minutes', 2), '۲ دقیقه');
        assert.equal(formatDuration(129), '۲ دقیقه و ۹ ثانیه');
        assert.equal(formatDuration(0), '۰ ثانیه');
    });
});
