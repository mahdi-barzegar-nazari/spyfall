import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { sideQuestsPool } from '../../js/data/sideQuests.js';
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
