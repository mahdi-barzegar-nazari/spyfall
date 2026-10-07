/**
 * The "all categories" button may state the size of the word bank ("+700 words"). The number has to be true
 * for the language the label is in: the size of THAT language's bank, rounded down to a hundred. A label with
 * no number is always allowed, which is what a language does until its bank is big enough to brag about.
 */
import assert from 'node:assert/strict';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** The first number written in `label` (Latin or Persian digits), or null. */
export function numberInLabel(label) {
    const latin = String(label).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
    const match = latin.match(/\d+/);
    return match ? Number(match[0]) : null;
}

/** Fail unless `label` has no number, or its number is `bank`'s size rounded down to a hundred (and not 0). */
export function assertLabelMatchesBank(label, bank) {
    const total = Object.values(bank).reduce((sum, list) => sum + list.length, 0);
    assert.ok(total > 0, 'the bank is empty');
    const stated = numberInLabel(label);
    if (stated === null) return;
    const rounded = Math.floor(total / 100) * 100;
    assert.ok(stated > 0, `the label states ${stated} words: ${label}`);
    assert.equal(stated, rounded, `the label says ${stated}, the bank has ${total} words (${rounded} rounded down): ${label}`);
}
