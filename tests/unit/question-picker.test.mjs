/**
 * The picker behind the "Question idea" button (js/game/questionPicker.js): a shuffled bag per language, kept in
 * memory only, drawn one question at a time. It is pure (no DOM, no storage, no imports), so everything here runs
 * with a seeded random function and plain arrays, plus one block that runs it on the real banks.
 *
 * Pinned: nothing repeats before the bag is empty; every question comes exactly once per cycle; the bag refills
 * when it is empty; the first question of a new cycle is never the last one of the cycle before (checked with a
 * scripted random that forces the clash, and over many seeds against a plain reference that does clash); each
 * language has its own bag and its own bank; a language change takes the new bank from the next press on.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { getQuestionIdeas } from '../../js/data/banks.js';
import { createQuestionPicker } from '../../js/game/questionPicker.js';

/** Small seeded PRNG (mulberry32), so every run replays the same sequences. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const bankOf = (size, prefix = 'q') => Array.from({ length: size }, (_, i) => `${prefix}${i}`);
const draw = (picker, lang, count) => Array.from({ length: count }, () => picker.next(lang));
const sorted = (list) => [...list].sort();
const chunks = (list, size) => Array.from({ length: Math.floor(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
/** A picker over one bank for every language, seeded. */
const pickerFor = (bank, seed) => createQuestionPicker({ getBank: () => bank, random: mulberry32(seed) });

const SIZES = [2, 3, 5, 8, 40, 53];
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('the picker: one cycle', () => {
    it('draws every question exactly once per cycle, and repeats none before the bag is empty (many seeds, many sizes)', () => {
        for (const size of SIZES) {
            const bank = bankOf(size);
            for (const seed of SEEDS) {
                const drawn = draw(pickerFor(bank, seed), 'x', size * 4);
                for (const cycle of chunks(drawn, size)) {
                    assert.equal(new Set(cycle).size, size, `size ${size}, seed ${seed}: a question came twice in one cycle`);
                    assert.deepEqual(sorted(cycle), sorted(bank), `size ${size}, seed ${seed}: a question is missing from the cycle`);
                }
            }
        }
    });

    it('is a shuffle: the order is not the bank order, and it differs from seed to seed', () => {
        const bank = bankOf(40);
        const firsts = new Set();
        let identical = 0;
        for (const seed of SEEDS) {
            const cycle = draw(pickerFor(bank, seed), 'x', 40);
            firsts.add(cycle[0]);
            if (cycle.every((question, i) => question === bank[i])) identical++;
        }
        assert.equal(identical, 0, 'a cycle came out in the order of the bank');
        assert.ok(firsts.size >= 10, `the first question was one of only ${firsts.size} across ${SEEDS.length} seeds`);
    });

    it('never mutates the bank it is given (a frozen array works, and keeps its order)', () => {
        const bank = Object.freeze(bankOf(10));
        const picker = pickerFor(bank, 3);
        assert.doesNotThrow(() => draw(picker, 'x', 35));
        assert.deepEqual([...bank], bankOf(10));
    });
});

describe('the picker: the bag starts again when it is empty', () => {
    it('after the last question of a cycle the next press starts a full new cycle (the bag is refilled)', () => {
        for (const size of [2, 5, 40]) {
            const bank = bankOf(size);
            const picker = pickerFor(bank, 11);
            draw(picker, 'x', size);
            const second = draw(picker, 'x', size);
            assert.ok(second.every((question) => typeof question === 'string' && question !== ''), `size ${size}: a press after the first cycle gave nothing`);
            assert.deepEqual(sorted(second), sorted(bank), `size ${size}: the second cycle is not the whole bank`);
        }
    });

    it('goes on for many cycles on the real banks, a full permutation each time', () => {
        for (const lang of ['fa', 'en']) {
            const bank = getQuestionIdeas(lang);
            const picker = createQuestionPicker({ getBank: getQuestionIdeas, random: mulberry32(5) });
            for (let cycle = 0; cycle < 3; cycle++) {
                assert.deepEqual(sorted(draw(picker, lang, bank.length)), sorted(bank), `${lang}: cycle ${cycle}`);
            }
        }
    });
});

describe('the picker: never the same question twice in a row at the restart', () => {
    it('with a random that makes a plain shuffle open the second cycle with the last question of the first (pinned)', () => {
        // Bank [a, b]. The first refill takes 0 (swap: order b, a). The second refill takes 0.99 (no swap: order a, b),
        // which would open with "a", the question that just closed the first cycle. The third value is for the swap that
        // the restart rule makes. Without the rule the four presses would be b, a, a, b.
        const script = [0, 0.99, 0.5, 0.5, 0.5, 0.5];
        const picker = createQuestionPicker({ getBank: () => ['a', 'b'], random: () => script.shift() });
        assert.deepEqual(draw(picker, 'x', 4), ['b', 'a', 'b', 'a']);
    });

    it('over many seeds and sizes, no question is ever followed by itself, cycle borders included', () => {
        for (const size of [2, 3, 4, 6, 40]) {
            const bank = bankOf(size);
            for (let seed = 1; seed <= 300; seed++) {
                const drawn = draw(pickerFor(bank, seed), 'x', size * 6);
                drawn.forEach((question, i) => {
                    if (i > 0) assert.notEqual(question, drawn[i - 1], `size ${size}, seed ${seed}: "${question}" twice in a row at press ${i}`);
                });
            }
        }
    });

    it('is not vacuous: a plain refill (a shuffle with no restart rule) does repeat at a border on those same seeds', () => {
        const plain = (bank, random) => {
            const sequence = [];
            while (sequence.length < bank.length * 6) {
                const order = [...bank];
                for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(random() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                sequence.push(...order);
            }
            return sequence;
        };
        let clashes = 0;
        for (let seed = 1; seed <= 300; seed++) {
            const sequence = plain(bankOf(2), mulberry32(seed));
            sequence.forEach((question, i) => {
                if (i > 0 && question === sequence[i - 1]) clashes++;
            });
        }
        assert.ok(clashes > 50, `only ${clashes} clashes: the seeds do not exercise the restart rule`);
    });

    it('a bank of one question can only repeat it, and a bank of nothing gives an empty string (no endless loop)', () => {
        const one = pickerFor(['only'], 1);
        assert.deepEqual(draw(one, 'x', 4), ['only', 'only', 'only', 'only']);
        for (const empty of [[], undefined, null, 'text', 7, {}]) {
            const picker = createQuestionPicker({ getBank: () => empty, random: mulberry32(1) });
            assert.equal(picker.next('x'), '', String(empty));
        }
    });
});

describe('the picker: random is injected', () => {
    it('uses the function it is given and never Math.random (the same seed gives the same sequence)', () => {
        const spy = mock.method(Math, 'random', () => {
            throw new Error('Math.random was called');
        });
        try {
            const bank = bankOf(20);
            assert.deepEqual(draw(pickerFor(bank, 9), 'x', 45), draw(pickerFor(bank, 9), 'x', 45));
            assert.notDeepEqual(draw(pickerFor(bank, 9), 'x', 20), draw(pickerFor(bank, 10), 'x', 20));
            assert.equal(spy.mock.callCount(), 0);
        } finally {
            spy.mock.restore();
        }
    });

    it('uses Math.random when none is given', () => {
        const spy = mock.method(Math, 'random', () => 0.25);
        try {
            const picker = createQuestionPicker({ getBank: () => bankOf(6) });
            assert.deepEqual(sorted(draw(picker, 'x', 6)), sorted(bankOf(6)));
            assert.ok(spy.mock.callCount() > 0);
        } finally {
            spy.mock.restore();
        }
    });

    it('a random that goes outside [0, 1) or is no number still gives whole cycles of real questions', () => {
        for (const value of [1, 2, -1, -0.5, 0, 0.9999999, NaN, Infinity, undefined, 'x']) {
            const bank = bankOf(7);
            const picker = createQuestionPicker({ getBank: () => bank, random: () => value });
            const drawn = draw(picker, 'x', 21);
            for (const cycle of chunks(drawn, 7)) assert.deepEqual(sorted(cycle), sorted(bank), `random() = ${String(value)}`);
        }
    });
});

describe('the picker: languages', () => {
    const BANKS = { fa: bankOf(6, 'fa'), en: bankOf(4, 'en') };
    const make = (seed = 1) => createQuestionPicker({ getBank: (lang) => BANKS[lang], random: mulberry32(seed) });

    it('asks for the bank of the language it is asked about, on every press', () => {
        const asked = [];
        const picker = createQuestionPicker({
            getBank: (lang) => {
                asked.push(lang);
                return BANKS[lang];
            },
            random: mulberry32(2)
        });
        for (const lang of ['fa', 'fa', 'en', 'fa', 'en', 'en']) picker.next(lang);
        assert.deepEqual(asked, ['fa', 'fa', 'en', 'fa', 'en', 'en']);
    });

    it('a question always comes from the bank of the language asked for', () => {
        const picker = make();
        for (let i = 0; i < 60; i++) {
            const lang = i % 3 === 0 ? 'en' : 'fa';
            assert.ok(BANKS[lang].includes(picker.next(lang)), `press ${i} (${lang})`);
        }
    });

    it('after a language change the new bank is used from the next press, and the old bag waits where it was', () => {
        const picker = make(4);
        const faFirst = draw(picker, 'fa', 3);
        const en = draw(picker, 'en', 4);
        assert.deepEqual(sorted(en), sorted(BANKS.en), 'English starts a full bag of its own');
        const faRest = draw(picker, 'fa', 3);
        assert.deepEqual(sorted([...faFirst, ...faRest]), sorted(BANKS.fa), 'Persian goes on with its bag: nothing repeated, nothing skipped');
    });

    it('each language restarts on its own: the restart rule compares with the last question of the SAME language', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const picker = make(seed);
            const seen = { fa: [], en: [] };
            for (let i = 0; i < 40; i++) {
                const lang = i % 2 === 0 ? 'fa' : 'en';
                seen[lang].push(picker.next(lang));
            }
            for (const lang of ['fa', 'en']) {
                seen[lang].forEach((question, i) => {
                    if (i > 0) assert.notEqual(question, seen[lang][i - 1], `seed ${seed}, ${lang}: repeated at press ${i}`);
                });
            }
        }
    });

    it('a language with no bank gives an empty string and does not disturb the others', () => {
        const picker = make(6);
        const before = draw(picker, 'fa', 2);
        assert.equal(picker.next('de'), '');
        const after = draw(picker, 'fa', 4);
        assert.deepEqual(sorted([...before, ...after]), sorted(BANKS.fa));
    });
});
