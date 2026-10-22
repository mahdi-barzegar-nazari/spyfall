/**
 * Game rules, scoring constants and theme colors. Pure data and pure functions, no DOM.
 */

export const VALID_PHASES = new Set([
    'welcome', 'setup', 'reveal', 'timer', 'vote', 'wager', 'guess', 'result', 'leaderboard'
]);

export const RULES = {
    players: { min: 3, max: 20 },
    spies: { min: 1, max: 5 },
    timerMinutes: { min: 1, max: 15 },
    emergencyVotes: { min: 1, max: 10 }
};

// Standard deduction-game ratio: citizens must always outnumber spies,
// so spies stay < players / 2 (e.g. 3 players → max 1 spy, not 2).
export function getMaxSpiesAllowed(playersCount) {
    const c = Math.max(RULES.players.min, Math.min(RULES.players.max, Number(playersCount) || RULES.players.min));
    return Math.min(RULES.spies.max, Math.floor((c - 1) / 2));
}

export const SCORING = {
    SPY_SURVIVE_WRONG_VOTE: 1,
    SPY_WIN_ROUND: 2,
    CITIZEN_WIN_ROUND: 2,
    WAGER_PROFIT_MULTIPLIER: 1
};

// Points for the caught spy who names the secret word correctly. The guess is worth more on
// harder words; words with no difficulty rating (custom words) pay the medium amount.
export const SPY_GUESS_BY_DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

export function getSpyGuessPoints(diffKey) {
    // hasOwnProperty, not a plain lookup: keys like "constructor" must count as unknown.
    return Object.prototype.hasOwnProperty.call(SPY_GUESS_BY_DIFFICULTY, diffKey)
        ? SPY_GUESS_BY_DIFFICULTY[diffKey]
        : SPY_GUESS_BY_DIFFICULTY.medium;
}

// Silent tie-breaking micro-score. Never shown in the UI — used only to
// resolve players who finish with an identical visible `score`, so a
// shared rank is a rare, genuine last resort rather than the default.
export const HIDDEN_TIEBREAK = {
    DIFFICULTY_MULTIPLIER: { easy: 1.0, medium: 1.5, hard: 2.0 },
    DEFAULT_MULTIPLIER: 1.0, // words with no difficulty rating, e.g. user-added custom words
    CITIZEN_CORRECT_VOTE: 2,      // per citizen whose vote correctly caught the eliminated spy
    SPY_SURVIVAL_PER_ATTEMPT: 1,  // per prior wrong elimination the spy survived through this round
    SPY_FULL_ROUND_SURVIVAL: 4    // spy never caught for the entire round (maximum evasion)
};

export function getDifficultyMultiplier(diffKey) {
    return HIDDEN_TIEBREAK.DIFFICULTY_MULTIPLIER[diffKey] || HIDDEN_TIEBREAK.DEFAULT_MULTIPLIER;
}

// The difficulty levels a word can be rated with, easiest first. The setup screen offers one chip for each.
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'];

/**
 * The levels a difficulty setting stands for, as a new array in the order of DIFFICULTY_LEVELS.
 *
 * The setting is stored as an array of levels (`['medium', 'hard']`). A save made before the setup screen had
 * one chip per level holds a single string instead: 'all', or one level ('easy', 'medium', 'hard'). Both are
 * read here, so an old save keeps its meaning without a new SAVE_VERSION: 'all' is all three levels and a
 * level name is that level alone. Anything else (a missing value, a number, an unknown name, an empty array, an
 * array with no known level in it) means all three, the same as the default; the unknown names inside an
 * array that also has a known level are ignored.
 */
export function normalizeDifficulties(value) {
    const listed = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
    const levels = DIFFICULTY_LEVELS.filter((level) => listed.includes(level));
    return levels.length > 0 ? levels : [...DIFFICULTY_LEVELS];
}

/** The built-in word categories, in the order of the category chips on the setup screen. */
export const BUILT_IN_CATEGORIES = ['places', 'jobs', 'foods', 'objects', 'vehicles', 'animals', 'sports', 'events'];

/** Every category id a setup can hold: the built-in ones, then the player's own words. */
export const CATEGORY_IDS = [...BUILT_IN_CATEGORIES, 'custom'];

/** The kinds of spy hint the setup screen offers, in the order of its chips. */
export const HINT_TYPES = ['related_word', 'category', 'first_letter', 'none'];

/**
 * The plain setup options and their defaults, as a NEW object each call (the arrays are fresh too), so no
 * caller can change the defaults for the next one. `core/state.js` starts the match settings from this, the
 * saved setup (`core/storage.js`) falls back to it field by field, and `index.html` must show the same values
 * before anything is restored (tests/unit/setup-settings.test.mjs compares them).
 */
export function defaultSetupSettings() {
    return {
        playersCount: 4, spiesCount: 1, timerMin: 4, cats: [...BUILT_IN_CATEGORIES], diff: [...DIFFICULTY_LEVELS],
        revealHold: false, hints: ['related_word'], fool: false, detective: false,
        knownSpies: false, director: false, oneword: false, quests: false,
        wager: false, sudden: false, voteLimitEnabled: false, maxVotes: 2,
        roleRevealConfirm: true, voteConfirm: false, quickVoting: false,
        spyLastChance: true
    };
}

/** The settings that are on/off switches. */
const BOOLEAN_SETTINGS = [
    'revealHold', 'fool', 'detective', 'knownSpies', 'director', 'oneword', 'quests', 'wager', 'sudden',
    'voteLimitEnabled', 'roleRevealConfirm', 'voteConfirm', 'quickVoting', 'spyLastChance'
];

const hasOwnKey = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** A whole number clamped to `range`; anything that is not a whole number (a string, NaN, 4.5, null...) is `fallback`. */
function clampWhole(value, range, fallback) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
    return Math.min(range.max, Math.max(range.min, value));
}

/** The known ids of `allowed` found in `value`, once each, in the order of `allowed`; `fallback` (a new array) when none. */
function pickKnownIds(value, allowed, fallback) {
    const listed = Array.isArray(value) ? value : [];
    const picked = allowed.filter((id) => listed.includes(id));
    return picked.length > 0 ? picked : [...fallback];
}

/**
 * Turn anything into a complete, valid set of the plain setup options. It is the one gate for the setup that
 * was saved in an earlier visit, which is untrusted (hand-edited, damaged, written by another version), and it
 * also cleans what is about to be saved. Each field is judged ON ITS OWN, so one bad field takes the default of
 * that field and never disturbs the others:
 *
 *   - a number must be a whole number, else it is the default; a whole number outside `RULES` is clamped to
 *     the nearest limit (players 3 to 20, timer 1 to 15 minutes, emergency votes 1 to 10);
 *   - spies are clamped to 1 and `getMaxSpiesAllowed(players)`, for the players count that was just settled;
 *   - each switch must be a real boolean, else it is that switch's default;
 *   - categories and hints: the unknown ids are dropped, the rest are kept once each in the order of the
 *     setup screen; nothing left means the default list;
 *   - difficulty goes through `normalizeDifficulties`, so the array it is stored as and the single string that
 *     older data holds are both read, and an unknown or empty choice means all three levels;
 *   - a key that is not a setup option is ignored, and so is `detectiveUsed` (it belongs to a running match).
 *
 * `raw` that is not a plain object gives the defaults. The result is always a new object.
 */
export function sanitizeSetupSettings(raw) {
    const defaults = defaultSetupSettings();
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const read = (key) => (hasOwnKey(source, key) ? source[key] : undefined);

    const playersCount = clampWhole(read('playersCount'), RULES.players, defaults.playersCount);
    const spiesCount = clampWhole(read('spiesCount'), { min: RULES.spies.min, max: getMaxSpiesAllowed(playersCount) }, defaults.spiesCount);
    const settings = {
        playersCount,
        spiesCount,
        timerMin: clampWhole(read('timerMin'), RULES.timerMinutes, defaults.timerMin),
        cats: pickKnownIds(read('cats'), CATEGORY_IDS, defaults.cats),
        diff: normalizeDifficulties(read('diff')),
        hints: pickKnownIds(read('hints'), HINT_TYPES, defaults.hints),
        maxVotes: clampWhole(read('maxVotes'), RULES.emergencyVotes, defaults.maxVotes)
    };
    for (const key of BOOLEAN_SETTINGS) {
        const value = read(key);
        settings[key] = typeof value === 'boolean' ? value : defaults[key];
    }
    // The same key order as `defaultSetupSettings`, so the saved JSON reads the same on every write.
    return Object.fromEntries(Object.keys(defaults).map((key) => [key, settings[key]]));
}

export const THEME_COLORS = {
    default: '#090d16',
    noir: '#120e0a',
    classic: '#0d0d0d',
    emerald: '#061412',
    crimson: '#14080a',
    sunset: '#1a0f0a',
    cyber: '#05010f',
    ocean: '#04121a'
};
