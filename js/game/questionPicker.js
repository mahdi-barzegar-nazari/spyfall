/**
 * The picker behind the discussion screen's "Question idea" button: one question at a time from a shuffled
 * "bag", so nothing repeats until the whole bank has been used.
 *
 * Pure: no DOM, no storage, no imports. The bank of a language and the random function are injected, so a test
 * can seed both. The bags live only in the closure of one picker (in memory, per language): they are never
 * saved, and a reload starts over. The picker knows nothing about the match, the players or the secret word.
 */

/** A whole number from 0 to `max` out of `random()`. A value outside [0, 1) is clamped, and one that is no number gives 0. */
function pick(random, max) {
    const r = Number(random());
    if (!Number.isFinite(r)) return 0;
    return Math.min(max, Math.max(0, Math.floor(r * (max + 1))));
}

/** Fisher-Yates on a copy. */
function shuffled(items, random) {
    const order = [...items];
    for (let i = order.length - 1; i > 0; i--) {
        const j = pick(random, i);
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

/**
 * @param {object} options
 * @param {(lang: string) => readonly string[]} options.getBank the questions of a language (never modified)
 * @param {() => number} [options.random] returns a number in [0, 1); `Math.random` by default
 * @returns {{ next(lang: string): string }}
 */
export function createQuestionPicker({ getBank, random = Math.random }) {
    /** lang -> { order: the current bag in drawing order, at: how many of it were drawn, last: the previous draw } */
    const bags = new Map();

    function refill(bag, bank) {
        bag.order = shuffled(bank, random);
        bag.at = 0;
        // A new cycle never opens with the question that closed the last one: swap it with another place.
        if (bag.order.length > 1 && bag.order[0] === bag.last) {
            const other = 1 + pick(random, bag.order.length - 2);
            [bag.order[0], bag.order[other]] = [bag.order[other], bag.order[0]];
        }
    }

    return {
        /** The next question for `lang`, or '' when that language has no questions. */
        next(lang) {
            const bank = getBank(lang);
            if (!Array.isArray(bank) || bank.length === 0) return '';
            let bag = bags.get(lang);
            if (!bag) {
                bag = { order: [], at: 0, last: null };
                bags.set(lang, bag);
            }
            if (bag.at >= bag.order.length) refill(bag, bank);
            const question = bag.order[bag.at++];
            bag.last = question;
            return question;
        }
    };
}
