/**
 * The pause button on the timer screen: the PAUSE_TIMER and RESUME_TIMER actions (app/actions.js) on top of
 * game/timer.js. Time only moves when a test ticks the manual clock (see helpers/fakeEnv.mjs).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { TIMER_PAUSES_PER_ROUND } from '../../js/core/config.js';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { isTimerLoopActive, startTimer, stopTimerLoop } = await import('../../js/game/timer.js');
const { handleAction } = await import('../../js/app/actions.js');
const { playTone, stopAudioKeepAlive } = await import('../../js/platform/audio.js');
await playTone(1, 0.01);
const harness = useGameHarness(env, {
    setup: () => {
        env.el('timer-text');
    },
    teardown: () => {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
});
after(() => env.uninstall());

const remaining = () => gameState.timer.pausedSec;
const seconds = (n) => env.clock.tick(n * 1000);
const pause = () => handleAction({ type: 'PAUSE_TIMER' });
const resume = () => handleAction({ type: 'RESUME_TIMER' });

/** A match on the timer screen with a 2 minute countdown that has run for 10 seconds. */
function discussion() {
    gameState.players = makePlayers(4);
    gameState.settings.timerMin = 2;
    gameState.settings.voteLimitEnabled = false;
    startTimer();
    seconds(10);
}

describe('PAUSE_TIMER', () => {
    it('stops the countdown, keeps the seconds, and makes no sound', () => {
        discussion();
        assert.equal(remaining(), 110);
        pause();
        assert.equal(gameState.timer.running, false);
        assert.equal(gameState.timer.manualPause, true);
        assert.equal(isTimerLoopActive(), false);
        assert.equal(env.logs.sirens(), 0);
        seconds(60);
        assert.equal(remaining(), 110);
        assert.equal(gameState.phase, 'timer');
    });

    it('redraws and saves the screen, so a reload shows the pause', () => {
        discussion();
        const before = harness.renders.length;
        pause();
        assert.equal(harness.renders.length, before + 1);
        const saved = JSON.parse(env.storage.get('spy_full_state_master'));
        assert.equal(saved.state.timer.manualPause, true);
        assert.equal(saved.state.timer.pausedSec, 110);
    });

    it('counts every pause of the round, and refuses one more than the limit', () => {
        discussion();
        for (let n = 1; n <= TIMER_PAUSES_PER_ROUND; n++) {
            pause();
            assert.equal(gameState.timer.pausesUsed, n);
            resume();
            assert.equal(gameState.timer.running, true);
        }
        pause();
        assert.equal(gameState.timer.running, true);
        assert.equal(gameState.timer.manualPause, false);
        assert.equal(gameState.timer.pausesUsed, TIMER_PAUSES_PER_ROUND);
        seconds(1);
        assert.equal(remaining(), 109);
    });

    it('does nothing when the countdown is not running, or the screen is not the timer', () => {
        discussion();
        pause();
        const used = gameState.timer.pausesUsed;
        pause();
        assert.equal(gameState.timer.pausesUsed, used);

        gameState.timer.running = true;
        gameState.phase = 'vote';
        gameState.timer.manualPause = false;
        pause();
        assert.equal(gameState.timer.manualPause, false);
        assert.equal(gameState.timer.pausesUsed, used);
    });

    it('a match saved before this button existed has no counter and still pauses', () => {
        discussion();
        delete gameState.timer.pausesUsed;
        delete gameState.timer.manualPause;
        pause();
        assert.equal(gameState.timer.manualPause, true);
        assert.equal(gameState.timer.pausesUsed, 1);
    });
});

describe('RESUME_TIMER', () => {
    it('continues from the same second, with the loop armed again', () => {
        discussion();
        pause();
        seconds(30);
        resume();
        assert.equal(gameState.timer.running, true);
        assert.equal(gameState.timer.manualPause, false);
        assert.equal(isTimerLoopActive(), true);
        assert.equal(remaining(), 110);
        seconds(1);
        assert.equal(remaining(), 109);
    });

    it('does nothing when the countdown was not paused by hand', () => {
        discussion();
        const before = harness.renders.length;
        resume();
        assert.equal(gameState.timer.running, true);
        assert.equal(harness.renders.length, before);
    });
});

describe('the alarm while the countdown is paused by hand', () => {
    it('stays locked until the countdown runs again', () => {
        discussion();
        pause();
        handleAction({ type: 'REQUEST_VOTE' });
        assert.equal(gameState.phase, 'timer');
        assert.equal(gameState.timer.reason, 'emergency');
        assert.deepEqual(hostSecretState.votesCast, {});
        resume();
        handleAction({ type: 'REQUEST_VOTE' });
        assert.equal(gameState.phase, 'vote');
    });
});

describe('a new countdown', () => {
    it('forgets an earlier pause and starts the count of pauses again', () => {
        discussion();
        pause();
        gameState.phase = 'reveal';
        startTimer();
        assert.equal(gameState.timer.manualPause, false);
        assert.equal(gameState.timer.pausesUsed, 0);
        assert.equal(gameState.timer.running, true);
    });
});
