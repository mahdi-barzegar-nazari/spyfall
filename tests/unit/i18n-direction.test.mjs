/**
 * Direction and locale of the active language (`getDirection`, `getLocale`, `formatDate`) and the bidi
 * isolate helper for names (`isolate`). The scorecard canvas and every other JS decision about reading
 * direction read these, never a hard-coded 'rtl' or 'fa-IR'.
 */
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const env = installFakeEnv();
const { CATALOGS } = await import('../../js/i18n/catalogs.js');
const { DEFAULT_LANG, LANG_DIRECTIONS, LANG_LOCALES, SUPPORTED_LANGS, formatDate, getDirection, getLocale, isolate, setLang } = await import('../../js/i18n/index.js');

beforeEach(() => {
    document.documentElement = { lang: 'sentinel', dir: 'sentinel' };
});
afterEach(() => {
    setLang(DEFAULT_LANG);
    env.reset();
});
after(() => env.uninstall());

describe('direction and locale tables', () => {
    it('every supported language has a catalog, a direction and a locale tag', () => {
        for (const lang of SUPPORTED_LANGS) {
            assert.ok(lang in CATALOGS, `${lang}: no catalog`);
            assert.ok(['rtl', 'ltr'].includes(LANG_DIRECTIONS[lang]), `${lang}: no direction`);
            assert.match(LANG_LOCALES[lang] ?? '', /^[a-z]{2,3}(-[A-Z]{2})?$/, `${lang}: no locale tag`);
            assert.doesNotThrow(() => new Intl.DateTimeFormat(LANG_LOCALES[lang]), `${lang}: Intl rejects the tag`);
        }
        assert.equal(LANG_LOCALES.fa, 'fa-IR');
        assert.equal(LANG_LOCALES.en, 'en-US');
    });

    it('getDirection and getLocale follow the active language', () => {
        assert.equal(getDirection(), 'rtl');
        assert.equal(getLocale(), 'fa-IR');
        setLang('en');
        assert.equal(getDirection(), 'ltr');
        assert.equal(getLocale(), 'en-US');
        setLang('fa');
        assert.equal(getDirection(), 'rtl');
        assert.equal(getLocale(), 'fa-IR');
    });

    it('getDirection agrees with what setLang writes on <html dir>', () => {
        for (const lang of SUPPORTED_LANGS) {
            setLang(lang);
            assert.equal(document.documentElement.dir, getDirection(), lang);
        }
    });

    it('a language with no table entries falls back to ltr and to its own code', () => {
        SUPPORTED_LANGS.push('xx');
        CATALOGS.xx = { 'setup.title': 'Setup' };
        try {
            setLang('xx');
            assert.equal(getDirection(), 'ltr');
            assert.equal(getLocale(), 'xx');
        } finally {
            setLang(DEFAULT_LANG);
            SUPPORTED_LANGS.splice(SUPPORTED_LANGS.indexOf('xx'), 1);
            delete CATALOGS.xx;
        }
    });
});

describe('formatDate', () => {
    const date = new Date(2026, 9, 4, 12, 0, 0); // 4 October 2026, local noon: no time-zone edge

    it('Persian is the plain fa-IR date the scorecard has always shown (Persian calendar, Persian digits)', () => {
        setLang('fa');
        assert.equal(formatDate(date), date.toLocaleDateString('fa-IR'));
        assert.match(formatDate(date), /[\u06F0-\u06F9]/);
        assert.doesNotMatch(formatDate(date), /[0-9]/);
    });

    it('English spells the month, in Latin digits', () => {
        setLang('en');
        assert.equal(formatDate(date), 'Oct 4, 2026');
    });

    it('returns an empty string instead of throwing when the runtime cannot format', () => {
        assert.equal(formatDate({ toLocaleDateString: () => { throw new RangeError('bad'); } }), '');
    });

    it('uses today when called without a date', () => {
        setLang('en');
        assert.match(formatDate(), /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    });
});

describe('isolate', () => {
    it('wraps text in a first-strong isolate (U+2068 ... U+2069)', () => {
        assert.equal(isolate('Sara'), '\u2068Sara\u2069');
        assert.equal(isolate('سارا'), '\u2068سارا\u2069');
        assert.equal(isolate(''), '\u2068\u2069');
        assert.equal([...isolate('x')].map((c) => c.codePointAt(0).toString(16)).join(' '), '2068 78 2069');
    });

    it('does not change what is inside, so a name is still found in the sentence', () => {
        const sentence = `Hello ${isolate('Dr. Ali!')}`;
        assert.ok(sentence.includes('Dr. Ali!'));
        assert.equal(sentence.replace(/[\u2066-\u2069]/g, ''), 'Hello Dr. Ali!');
    });
});
