import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeHtml, formatSecondsFa, normalizeWord, toLatinDigits, toPersianDigits } from '../../js/utils/text.js';

describe('digit conversion', () => {
    it('converts Persian and Arabic-Indic digits to Latin', () => {
        assert.equal(toLatinDigits('۱۲۳٤٥'), '12345');
    });
    it('leaves Latin digits and letters alone', () => {
        assert.equal(toLatinDigits('a1b2'), 'a1b2');
    });
    it('treats nullish input as an empty string', () => {
        assert.equal(toLatinDigits(null), '');
        assert.equal(toLatinDigits(undefined), '');
    });
    it('converts Latin digits to Persian', () => {
        assert.equal(toPersianDigits(2026), '۲۰۲۶');
    });
    it('round-trips', () => {
        assert.equal(toLatinDigits(toPersianDigits(9081726354)), '9081726354');
    });
});

describe('escapeHtml', () => {
    it('escapes the five HTML-significant characters', () => {
        assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    });
    it('neutralises a script injection attempt used as a player name', () => {
        assert.ok(!escapeHtml('<img src=x onerror=alert(1)>').includes('<'));
    });
});

describe('normalizeWord', () => {
    it('unifies Arabic and Persian letter variants', () => {
        assert.equal(normalizeWord('كتاب'), normalizeWord('کتاب'));
        assert.equal(normalizeWord('علي'), normalizeWord('علی'));
    });
    it('folds alef variants', () => {
        assert.equal(normalizeWord('آب'), 'اب');
        assert.equal(normalizeWord('أب'), 'اب');
    });
    it('strips diacritics', () => {
        assert.equal(normalizeWord('كِتَاب'), normalizeWord('کتاب'));
    });
    it('collapses whitespace and punctuation', () => {
        assert.equal(normalizeWord('  hello,   World!  '), 'hello world');
    });
    it('lower-cases Latin text and converts digits', () => {
        assert.equal(normalizeWord('ABC ۱۲'), 'abc 12');
    });
    it('makes duplicate detection insensitive to these differences', () => {
        assert.equal(normalizeWord('«علي»'), normalizeWord('علی'));
    });
});

describe('formatSecondsFa', () => {
    it('formats seconds only', () => {
        assert.equal(formatSecondsFa(45), '۴۵ ثانیه');
    });
    it('formats minutes and seconds', () => {
        assert.equal(formatSecondsFa(129), '۲ دقیقه و ۹ ثانیه');
    });
    it('clamps negatives and junk to zero', () => {
        assert.equal(formatSecondsFa(-5), '۰ ثانیه');
        assert.equal(formatSecondsFa(undefined), '۰ ثانیه');
    });
});
