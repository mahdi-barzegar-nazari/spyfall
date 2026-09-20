import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateId, getRandomCryptoInt, shuffle } from '../../js/utils/random.js';

describe('shuffle', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    it('returns a permutation of the input', () => {
        assert.deepEqual([...shuffle(input)].sort(), [...input].sort());
    });
    it('does not mutate its argument', () => {
        const copy = [...input];
        shuffle(input);
        assert.deepEqual(input, copy);
    });
    it('handles empty and single-element arrays', () => {
        assert.deepEqual(shuffle([]), []);
        assert.deepEqual(shuffle([9]), [9]);
    });
    it('is a uniform shuffle (every element reaches every position)', () => {
        const seen = Array.from({ length: 4 }, () => new Set());
        for (let i = 0; i < 2000; i++) shuffle([0, 1, 2, 3]).forEach((v, pos) => seen[pos].add(v));
        assert.ok(seen.every((s) => s.size === 4));
    });
});

describe('getRandomCryptoInt', () => {
    it('stays within [0, max)', () => {
        for (let i = 0; i < 1000; i++) {
            const n = getRandomCryptoInt(7);
            assert.ok(Number.isInteger(n) && n >= 0 && n < 7);
        }
    });
    it('returns 0 when max is 1', () => {
        assert.equal(getRandomCryptoInt(1), 0);
    });
    it('eventually produces every value', () => {
        const seen = new Set();
        for (let i = 0; i < 500; i++) seen.add(getRandomCryptoInt(4));
        assert.equal(seen.size, 4);
    });
});

describe('generateId', () => {
    it('produces unique non-empty strings', () => {
        const ids = new Set(Array.from({ length: 500 }, generateId));
        assert.equal(ids.size, 500);
        assert.ok([...ids].every((id) => typeof id === 'string' && id.length > 5));
    });
});
