/**
 * Tests for restoring a saved game (app/actions.js): the RESTORE_GAME action, which runs the module's private
 * restorePhaseBindings. The save is written as persist() writes it, memory is wiped as a page reload would,
 * and handleAction does the restoring; nothing in the game code is exposed for this.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { setRenderer } from '../../js/core/phase.js';
import { SAVE_VERSION, gameState, hostSecretState, serializeSecrets } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { isTimerLoopActive, stopTimerLoop } = await import('../../js/game/timer.js');
const { startNextRound } = await import('../../js/game/rounds.js');
const { getLang, onLangChange, setLang } = await import('../../js/i18n/index.js');
const { WORD_PACKS } = await import('../../js/data/wordPacks.js');
const { WORD_PACKS_EN } = await import('../../js/data/wordPacksEn.js');
const { stopAudioKeepAlive } = await import('../../js/platform/audio.js');
useGameHarness(env, {
    setup: () => {
        env.el('recovery-banner');
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

/** Save the current game, wipe memory, then press "restore". */
function saveThenRestore() {
    const saved = JSON.stringify({ version: SAVE_VERSION, state: gameState, secrets: serializeSecrets() });
    resetSingletons();
    env.storage.set('spy_full_state_master', saved);
    handleAction({ type: 'RESTORE_GAME' });
}

/** Five players; p5 was voted out in an earlier ballot of the round and that ballot's votes are still stored. */
function arrangeAfterEarlierBallot(timer) {
    gameState.players = makePlayers(5);
    gameState.players[4].isAlive = false;
    gameState.phase = 'timer';
    gameState.timer = { running: true, pausedSec: 0, reason: 'emergency', wasRunningBeforePanic: false, ...timer };
    hostSecretState.votesCast = { p5: 'p1', p1: 'p2' };
}

describe('RESTORE_GAME', () => {
    it('a save whose countdown had already run out opens the vote with no old votes, and saves that', () => {
        arrangeAfterEarlierBallot({ pausedSec: 0 });
        saveThenRestore();
        assert.equal(gameState.phase, 'vote');
        assert.equal(gameState.timer.reason, 'timeout');
        assert.equal(gameState.timer.running, false);
        assert.deepEqual(hostSecretState.votesCast, {});
        assert.equal(isTimerLoopActive(), false);
        assert.deepEqual(JSON.parse(env.storage.get('spy_full_state_master')).secrets.votesCast, {});
    });

    it('a save made in the middle of a vote keeps its partial votes', () => {
        gameState.players = makePlayers(4);
        gameState.phase = 'vote';
        gameState.timer = { running: false, pausedSec: 0, reason: 'timeout', wasRunningBeforePanic: false };
        gameState.localVoteIndex = 2;
        hostSecretState.votesCast = { p1: 'p2', p2: 'p3' };
        saveThenRestore();
        assert.equal(gameState.phase, 'vote');
        assert.equal(gameState.localVoteIndex, 2);
        assert.deepEqual(hostSecretState.votesCast, { p1: 'p2', p2: 'p3' });
    });

    it('a save with time still left resumes the countdown and leaves the votes for the time-out to empty', () => {
        arrangeAfterEarlierBallot({ pausedSec: 30 });
        saveThenRestore();
        assert.equal(gameState.phase, 'timer');
        assert.equal(gameState.timer.running, true);
        assert.equal(gameState.timer.pausedSec, 30);
        assert.equal(isTimerLoopActive(), true);
        assert.deepEqual(hostSecretState.votesCast, { p5: 'p1', p1: 'p2' });
        env.clock.tick(30 * 1000);
        assert.equal(gameState.phase, 'vote');
        assert.deepEqual(hostSecretState.votesCast, {});
    });
});

// ---------------------------------------------------------------------------------------------------------------
// A match keeps its language: the save records it, and a restore switches to it before anything is rendered.
// ---------------------------------------------------------------------------------------------------------------

const PERSIAN = /[\u0600-\u06FF]/;

/** A saved match in the reveal phase (no timer involved) whose `match` is whatever the test wants. */
function arrangeSavedMatch(match) {
    gameState.players = makePlayers(4);
    gameState.phase = 'reveal';
    gameState.match = match;
}

/** Write the current game as a save, wipe memory, and make `lang` the language of the page. */
function saveThenWipe(lang) {
    const saved = JSON.stringify({ version: SAVE_VERSION, state: gameState, secrets: serializeSecrets() });
    resetSingletons();
    env.storage.set('spy_full_state_master', saved);
    setLang(lang);
}

/** Press "restore" and report, in order, every language change and every render with the language it saw. */
function restoreAndWatch() {
    const events = [];
    const stop = onLangChange((lang) => events.push(`lang:${lang}`));
    setRenderer(() => events.push(`render:${getLang()}`));
    try {
        handleAction({ type: 'RESTORE_GAME' });
    } finally {
        stop();
    }
    return events;
}

describe('RESTORE_GAME: a match keeps its language', () => {
    it('a Persian save restored while English is active ends in Persian, switched before the first render', () => {
        document.documentElement = { lang: 'sentinel', dir: 'sentinel' };
        arrangeSavedMatch({ usedWordKeys: [], lang: 'fa' });
        saveThenWipe('en');
        assert.equal(getLang(), 'en');

        assert.deepEqual(restoreAndWatch(), ['lang:fa', 'render:fa']);
        assert.equal(getLang(), 'fa');
        assert.equal(gameState.match.lang, 'fa');
        assert.deepEqual([document.documentElement.lang, document.documentElement.dir], ['fa', 'rtl']);
        assert.equal(env.storage.get('spy_lang'), 'fa');
    });

    it('an English save restored while Persian is active ends in English, switched before the first render', () => {
        document.documentElement = { lang: 'sentinel', dir: 'sentinel' };
        arrangeSavedMatch({ usedWordKeys: [], lang: 'en' });
        saveThenWipe('fa');
        assert.equal(getLang(), 'fa');

        assert.deepEqual(restoreAndWatch(), ['lang:en', 'render:en']);
        assert.equal(getLang(), 'en');
        assert.equal(gameState.match.lang, 'en');
        assert.deepEqual([document.documentElement.lang, document.documentElement.dir], ['en', 'ltr']);
        assert.equal(env.storage.get('spy_lang'), 'en');
        assert.equal(gameState.phase, 'reveal');
        assert.equal(gameState.players.length, 4);
    });

    it('restoring a save in the language that is already active changes nothing and tells nobody', () => {
        for (const lang of ['fa', 'en']) {
            arrangeSavedMatch({ usedWordKeys: [], lang });
            saveThenWipe(lang);
            assert.deepEqual(restoreAndWatch(), [`render:${lang}`]);
            assert.equal(getLang(), lang);
        }
    });

    it('a legacy save with no language is Persian, and is marked as Persian from then on', () => {
        arrangeSavedMatch({ usedWordKeys: ['alpha'] });
        assert.equal('lang' in gameState.match, false);
        saveThenWipe('en');
        assert.deepEqual(restoreAndWatch(), ['lang:fa', 'render:fa']);
        assert.equal(getLang(), 'fa');
        assert.deepEqual(gameState.match, { usedWordKeys: ['alpha'], lang: 'fa' });
        assert.equal(JSON.parse(env.storage.get('spy_full_state_master')).state.match.lang, 'fa');
    });

    it('a legacy save with no language while Persian is active stays Persian and tells nobody', () => {
        arrangeSavedMatch({ usedWordKeys: [] });
        saveThenWipe('fa');
        assert.deepEqual(restoreAndWatch(), ['render:fa']);
        assert.equal(getLang(), 'fa');
    });

    it('an unsupported or malformed language value is ignored: the match is Persian, with English active or not', () => {
        const garbage = ['de', '', ' en', 'EN', 'en-US', 5, 0, true, null, {}, ['en'], '__proto__', 'constructor', 'toString'];
        for (const value of garbage) {
            for (const active of ['en', 'fa']) {
                arrangeSavedMatch({ usedWordKeys: [], lang: value });
                saveThenWipe(active);
                restoreAndWatch();
                assert.equal(getLang(), 'fa', `lang ${JSON.stringify(value)} while ${active} was active`);
                assert.equal(gameState.match.lang, 'fa', JSON.stringify(value));
                assert.equal(gameState.phase, 'reveal');
            }
        }
    });

    it('a save whose match is missing or not an object is Persian and does not break the restore', () => {
        for (const match of [undefined, null, 'en', 7, ['en'], []]) {
            arrangeSavedMatch(match);
            if (match === undefined) delete gameState.match;
            saveThenWipe('en');
            assert.doesNotThrow(() => restoreAndWatch());
            assert.equal(getLang(), 'fa', JSON.stringify(match));
            assert.equal(gameState.phase, 'reveal', JSON.stringify(match));
        }
    });

    it('a save that is not restored at all (another save version) does not change the language', () => {
        arrangeSavedMatch({ usedWordKeys: [], lang: 'fa' });
        const stale = JSON.stringify({ version: SAVE_VERSION, state: { ...gameState, version: SAVE_VERSION - 1 }, secrets: serializeSecrets() });
        resetSingletons();
        env.storage.set('spy_full_state_master', stale);
        setLang('en');
        assert.deepEqual(restoreAndWatch(), ['render:en']);
        assert.equal(getLang(), 'en');
        assert.equal(gameState.players.length, 0);
    });

    it('SAVE_VERSION was not bumped for the language field (it is optional; the legacy-save tests above are the proof)', () => {
        // If you bump the version on purpose, update this number and the note in docs/architecture.md.
        assert.equal(SAVE_VERSION, 12);
    });
});

describe('a round records its language, and the save carries it', () => {
    const arrangeRound = (lang) => {
        setLang(lang);
        gameState.players = makePlayers(5);
        Object.assign(gameState.settings, { cats: Object.keys(WORD_PACKS), diff: 'all' });
        env.seedRandom(7);
        startNextRound();
    };

    it('startNextRound writes the active language into match.lang, and persist() saves it', () => {
        for (const lang of ['fa', 'en']) {
            arrangeRound(lang);
            assert.equal(gameState.match.lang, lang);
            assert.equal(JSON.parse(env.storage.get('spy_full_state_master')).state.match.lang, lang);
        }
    });

    it('an English match restored on a Persian page is still an English match: English words, texts and next round', () => {
        arrangeRound('en');
        const word = hostSecretState.secretWord;
        const category = gameState.round.category;
        assert.ok(Object.values(WORD_PACKS_EN).flat().some((w) => w.word === word));
        saveThenWipe('fa');

        restoreAndWatch();
        assert.equal(getLang(), 'en');
        assert.equal(hostSecretState.secretWord, word);
        assert.equal(gameState.round.category, category);
        assert.doesNotMatch(category, PERSIAN);
        const spy = gameState.players.find((p) => p.role === 'spy');
        assert.doesNotMatch(`${hostSecretState.roles[spy.id].hintTitle} ${hostSecretState.roles[spy.id].hint}`, PERSIAN);

        env.seedRandom(8);
        gameState.phase = 'result';
        startNextRound();
        assert.ok(Object.values(WORD_PACKS_EN).flat().some((w) => w.word === hostSecretState.secretWord), 'the next round keeps drawing English words');
        assert.equal(gameState.match.lang, 'en');
    });

    it('a Persian match restored on an English page is still a Persian match', () => {
        arrangeRound('fa');
        const word = hostSecretState.secretWord;
        assert.ok(Object.values(WORD_PACKS).flat().some((w) => w.word === word));
        saveThenWipe('en');

        restoreAndWatch();
        assert.equal(getLang(), 'fa');
        assert.equal(hostSecretState.secretWord, word);
        assert.match(gameState.round.category, PERSIAN);
        env.seedRandom(9);
        gameState.phase = 'result';
        startNextRound();
        assert.ok(Object.values(WORD_PACKS).flat().some((w) => w.word === hostSecretState.secretWord));
    });
});
