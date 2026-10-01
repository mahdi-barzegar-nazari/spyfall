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
