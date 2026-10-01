import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
    RULES,
    SCORING,
    SPY_GUESS_BY_DIFFICULTY,
    THEME_COLORS,
    VALID_PHASES,
    getDifficultyMultiplier,
    getMaxSpiesAllowed,
    getSpyGuessPoints
} from '../../js/core/config.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('getMaxSpiesAllowed', () => {
    it('keeps spies strictly below half of the players', () => {
        const expected = { 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 10: 4, 11: 5 };
        for (const [players, spies] of Object.entries(expected)) {
            assert.equal(getMaxSpiesAllowed(Number(players)), spies, `${players} players`);
        }
    });
    it('never exceeds the configured maximum', () => {
        assert.equal(getMaxSpiesAllowed(RULES.players.max), RULES.spies.max);
    });
    it('clamps out-of-range and invalid input', () => {
        assert.equal(getMaxSpiesAllowed(0), getMaxSpiesAllowed(RULES.players.min));
        assert.equal(getMaxSpiesAllowed(Number.NaN), getMaxSpiesAllowed(RULES.players.min));
        assert.equal(getMaxSpiesAllowed(999), RULES.spies.max);
    });
});

describe('getDifficultyMultiplier', () => {
    it('rewards harder words', () => {
        assert.ok(getDifficultyMultiplier('hard') > getDifficultyMultiplier('medium'));
        assert.ok(getDifficultyMultiplier('medium') > getDifficultyMultiplier('easy'));
    });
    it('falls back to the default for "all" and unknown keys', () => {
        assert.equal(getDifficultyMultiplier('all'), 1);
        assert.equal(getDifficultyMultiplier('nope'), 1);
    });
});

describe('getSpyGuessPoints', () => {
    it('pays 1, 2 and 3 for an easy, medium and hard word', () => {
        assert.equal(getSpyGuessPoints('easy'), 1);
        assert.equal(getSpyGuessPoints('medium'), 2);
        assert.equal(getSpyGuessPoints('hard'), 3);
    });
    it('pays the medium amount (2) for null, undefined and any key it does not know', () => {
        for (const key of [null, undefined, 'all', 'nope', '', 0, 'EASY', ' easy']) {
            assert.equal(getSpyGuessPoints(key), 2, JSON.stringify(key));
        }
    });
    it('does not mistake inherited object keys for a difficulty', () => {
        for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
            assert.equal(getSpyGuessPoints(key), 2, key);
        }
    });
    it('rewards harder words, and covers exactly the difficulties the word bank uses', () => {
        assert.ok(getSpyGuessPoints('hard') > getSpyGuessPoints('medium'));
        assert.ok(getSpyGuessPoints('medium') > getSpyGuessPoints('easy'));
        assert.deepEqual(Object.keys(SPY_GUESS_BY_DIFFICULTY).sort(), ['easy', 'hard', 'medium']);
    });
    it('replaces the old flat SPY_CORRECT_GUESS constant', () => {
        assert.equal('SPY_CORRECT_GUESS' in SCORING, false);
    });
});

describe('configuration stays in sync with index.html', () => {
    it('every game phase has a matching screen, and vice versa', () => {
        const screens = [...html.matchAll(/<section id="screen-([a-z]+)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(screens, [...VALID_PHASES].sort());
    });
    it('every theme in the selector has colors, and vice versa', () => {
        const select = html.match(/<select id="theme-selector"[\s\S]*?<\/select>/)[0];
        const options = [...select.matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(options, Object.keys(THEME_COLORS).sort());
    });
    it('theme colors are valid hex values', () => {
        for (const [theme, color] of Object.entries(THEME_COLORS)) {
            assert.match(String(color), /^#[0-9a-f]{6}$/i, theme);
        }
    });
    it('the setup form limits match RULES', () => {
        assert.equal(RULES.players.min <= 4 && 4 <= RULES.players.max, true, 'default of 4 players is legal');
        assert.equal(RULES.spies.min <= 1, true, 'default of 1 spy is legal');
    });
});
