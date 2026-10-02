/**
 * Characterization tests for game/timer.js. Time only moves when a test ticks the manual clock
 * (see helpers/fakeEnv.mjs), so nothing here waits. Sound, vibration and wake lock are recorded
 * by fakes; the tests check that they happen, not what they would sound like.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { setBeforePhaseChange, setPhase, setRenderer } from '../../js/core/phase.js';
import { gameState, hostSecretState, session } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const {
    isTimerLoopActive,
    pauseTimer,
    resumeTimer,
    runTick,
    startTimer,
    stopTimerLoop,
    stopTimerWhenLeavingTimerPhase
} = await import('../../js/game/timer.js');
const { keepAudioAlive, playTone, stopAudioKeepAlive } = await import('../../js/platform/audio.js');
// audio.js only creates its AudioContext on first use; do that once so the keep-alive is observable.
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
const beeps = () => env.logs.tones().filter((hz) => hz === 750).length;
const timeoutTones = () => env.logs.tones().filter((hz) => hz === 900).length;
const lastKeepAlive = () => env.logs.constantSources[env.logs.constantSources.length - 1];
/** True when a screen wake lock was asked for (startTimer and setPhase may each ask once). */
const askedForWakeLock = () => env.logs.wakeLocks.length > 0 && env.logs.wakeLocks.every((t) => t === 'screen');

describe('startTimer', () => {
    it('starts a full countdown: timerMin * 60 seconds, running, on the timer screen', () => {
        gameState.settings.timerMin = 2;
        gameState.phase = 'reveal';
        gameState.timer.pausedSec = 5;
        startTimer();
        assert.equal(remaining(), 120);
        assert.equal(gameState.timer.running, true);
        assert.equal(gameState.phase, 'timer');
        assert.equal(isTimerLoopActive(), true);
        assert.deepEqual(harness.renders, ['timer']);
    });

    it('does not tick until a full second has passed', () => {
        gameState.settings.timerMin = 2;
        startTimer();
        env.clock.tick(999);
        assert.equal(remaining(), 120);
        env.clock.tick(1);
        assert.equal(remaining(), 119);
    });

    it('asks for a wake lock and starts the silent audio keep-alive', () => {
        startTimer();
        assert.equal(askedForWakeLock(), true);
        assert.equal(env.logs.constantSources.length, 1);
        assert.equal(lastKeepAlive().started, true);
        assert.equal(lastKeepAlive().stopped, false);
    });

    it('picks the first asker and target only when the director option is on', () => {
        gameState.players = makePlayers(4);
        gameState.settings.director = true;
        startTimer();
        assert.equal(gameState.round.history.length, 1);

        gameState.settings.director = false;
        gameState.round.history = [];
        startTimer();
        assert.deepEqual(gameState.round.history, []);
    });

    it('never runs two countdowns at once when started again', () => {
        gameState.settings.timerMin = 4;
        startTimer();
        startTimer();
        assert.equal(env.clock.pending(), 1);
        seconds(1);
        assert.equal(remaining(), 239);
    });
});

describe('the countdown', () => {
    it('takes exactly one second off per tick', () => {
        gameState.settings.timerMin = 4;
        startTimer();
        for (const expected of [239, 238, 237]) {
            seconds(1);
            assert.equal(remaining(), expected);
        }
        seconds(10);
        assert.equal(remaining(), 227);
    });

    it('draws the remaining time on every tick', () => {
        gameState.settings.timerMin = 4;
        startTimer();
        seconds(1);
        assert.equal(env.el('timer-text').textContent, '03:59');
        gameState.timer.pausedSec = 61;
        seconds(1);
        assert.equal(env.el('timer-text').textContent, '01:00');
    });

    it('counts nothing while running is false, and picks up again when it is true', () => {
        gameState.settings.timerMin = 4;
        startTimer();
        gameState.timer.running = false;
        seconds(5);
        assert.equal(remaining(), 240);
        assert.equal(env.el('timer-text').textContent, '');
        gameState.timer.running = true;
        seconds(1);
        assert.equal(remaining(), 239);
    });

    it('sounds the siren once at 30 s, a beep at each of 10..1 s, and the time-out tone at 0', () => {
        gameState.settings.timerMin = 1;
        startTimer();
        const sirenAt = [];
        const beepAt = [];
        const endAt = [];
        let sirens = 0;
        let beepCount = 0;
        let ends = 0;
        for (let i = 0; i < 60; i++) {
            seconds(1);
            if (env.logs.sirens() > sirens) sirenAt.push(remaining());
            if (beeps() > beepCount) beepAt.push(remaining());
            if (timeoutTones() > ends) endAt.push(remaining());
            sirens = env.logs.sirens();
            beepCount = beeps();
            ends = timeoutTones();
        }
        assert.deepEqual(sirenAt, [30]);
        assert.deepEqual(beepAt, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
        assert.deepEqual(endAt, [0]);
        assert.equal(env.logs.tones().length, 11, 'no other tones');
    });

    it('vibrates with the siren at 30 s and once for each beep at 10..1 s', () => {
        gameState.settings.timerMin = 1;
        startTimer();
        seconds(60);
        assert.deepEqual(env.logs.vibrations, [
            [200, 100, 200],
            [300, 150, 300],
            ...Array(10).fill(80)
        ]);
    });

    it('is silent before 30 s, and between 30 s and 10 s', () => {
        gameState.settings.timerMin = 1;
        startTimer();
        seconds(29);
        assert.equal(remaining(), 31);
        assert.equal(env.logs.oscillators.length, 0);
        assert.deepEqual(env.logs.vibrations, []);
        seconds(1);
        assert.equal(env.logs.sirens(), 1);
        seconds(19);
        assert.equal(remaining(), 11);
        assert.equal(beeps(), 0);
    });

    it('at zero: stops, flags a time-out, resets the vote pointers and opens the vote', () => {
        gameState.settings.timerMin = 1;
        gameState.localVoteIndex = 5;
        session.voteHandoffDoneIndex = 3;
        startTimer();
        gameState.timer.pausedSec = 2;
        seconds(1);
        assert.equal(gameState.phase, 'timer');
        assert.equal(remaining(), 1);
        seconds(1);
        assert.equal(remaining(), 0);
        assert.equal(gameState.timer.running, false);
        assert.equal(gameState.timer.reason, 'timeout');
        assert.equal(gameState.localVoteIndex, 0);
        assert.equal(session.voteHandoffDoneIndex, -1);
        assert.equal(gameState.phase, 'vote');
        assert.equal(harness.renders[harness.renders.length - 1], 'vote');
        assert.equal(isTimerLoopActive(), false);
        assert.equal(env.clock.pending(), 0);
        assert.equal(lastKeepAlive().stopped, true);
        assert.equal(timeoutTones(), 1);
        assert.equal(env.el('timer-text').textContent, '00:00');
    });

    it('stays at zero afterwards: no negative time, no second time-out', () => {
        gameState.settings.timerMin = 1;
        startTimer();
        gameState.timer.pausedSec = 1;
        seconds(1);
        const rendersAtEnd = harness.renders.length;
        seconds(30);
        assert.equal(remaining(), 0);
        assert.equal(gameState.phase, 'vote');
        assert.equal(harness.renders.length, rendersAtEnd);
        assert.equal(timeoutTones(), 1);
    });

    it('a tick that finds the clock already at zero times out instead of going negative', () => {
        startTimer();
        gameState.timer.pausedSec = 0;
        seconds(1);
        assert.equal(remaining(), 0);
        assert.equal(gameState.phase, 'vote');
        assert.equal(gameState.timer.reason, 'timeout');
    });
});

describe('votes left over from an earlier ballot', () => {
    /** A round in which p5 was voted out in an earlier ballot; that ballot's votes are still in votesCast. */
    function leaveOldVotes() {
        gameState.players = makePlayers(5);
        gameState.players[4].isAlive = false;
        hostSecretState.votesCast = { p5: 'p1', p1: 'p2', p2: 'p1' };
    }
    const savedVotes = () => JSON.parse(env.storage.get('spy_full_state_master')).secrets.votesCast;

    it('are emptied when the time runs out, before the vote screen is drawn and the game is saved', () => {
        let votesWhenDrawn = null;
        setRenderer(() => {
            if (gameState.phase === 'vote') votesWhenDrawn = { ...hostSecretState.votesCast };
        });
        leaveOldVotes();
        gameState.settings.timerMin = 1;
        startTimer();
        gameState.timer.pausedSec = 1;
        seconds(1);
        assert.equal(gameState.phase, 'vote');
        assert.equal(gameState.timer.reason, 'timeout');
        assert.deepEqual(hostSecretState.votesCast, {});
        assert.deepEqual(votesWhenDrawn, {});
        assert.deepEqual(savedVotes(), {});
    });

    it('are left alone by pausing, resuming and ticking; only the time-out empties them', () => {
        leaveOldVotes();
        const before = structuredClone(hostSecretState.votesCast);
        gameState.settings.timerMin = 1;
        startTimer();
        seconds(5);
        assert.deepEqual(hostSecretState.votesCast, before, 'after ticking');
        pauseTimer();
        seconds(10);
        assert.deepEqual(hostSecretState.votesCast, before, 'after a pause');
        resumeTimer();
        seconds(5);
        assert.deepEqual(hostSecretState.votesCast, before, 'after a resume');
        pauseTimer(true);
        resumeTimer();
        assert.deepEqual(hostSecretState.votesCast, before, 'after a silent pause and resume');
        assert.equal(gameState.phase, 'timer');
        seconds(60);
        assert.equal(gameState.phase, 'vote');
        assert.deepEqual(hostSecretState.votesCast, {});
    });
});

describe('pauseTimer', () => {
    it('a silent pause stops the countdown and freezes the seconds, without a siren', () => {
        gameState.settings.timerMin = 4;
        startTimer();
        seconds(3);
        pauseTimer(true);
        assert.equal(gameState.timer.running, false);
        assert.equal(isTimerLoopActive(), false);
        assert.equal(env.clock.pending(), 0);
        assert.equal(lastKeepAlive().stopped, true);
        assert.equal(env.logs.sirens(), 0);
        seconds(30);
        assert.equal(remaining(), 237);
        assert.equal(env.el('timer-text').textContent, '03:57');
    });

    it('a normal pause also sounds the siren', () => {
        startTimer();
        pauseTimer();
        assert.equal(env.logs.sirens(), 1);
        assert.equal(gameState.timer.running, false);
        assert.equal(isTimerLoopActive(), false);
    });
});

describe('resumeTimer', () => {
    it('continues from the stored seconds, however much real time has gone by', () => {
        gameState.settings.timerMin = 4;
        startTimer();
        seconds(3);
        pauseTimer(true);
        const realNow = Date.now;
        Date.now = () => realNow() + 3_600_000;
        try {
            resumeTimer();
            assert.equal(gameState.timer.running, true);
            assert.equal(gameState.phase, 'timer');
            assert.equal(isTimerLoopActive(), true);
            assert.equal(remaining(), 237);
            seconds(1);
            assert.equal(remaining(), 236);
        } finally {
            Date.now = realNow;
        }
    });

    it('resumes a countdown restored from a save, with a wake lock and the keep-alive', () => {
        gameState.phase = 'timer';
        gameState.timer = { running: false, pausedSec: 47, reason: 'emergency', wasRunningBeforePanic: false };
        resumeTimer();
        assert.equal(gameState.timer.running, true);
        assert.equal(askedForWakeLock(), true);
        assert.equal(lastKeepAlive().started, true);
        seconds(1);
        assert.equal(remaining(), 46);
    });

    it('runs on to the vote when resumed with only a few seconds left', () => {
        gameState.timer.pausedSec = 2;
        resumeTimer();
        seconds(2);
        assert.equal(remaining(), 0);
        assert.equal(gameState.phase, 'vote');
        assert.equal(gameState.timer.reason, 'timeout');
    });
});

describe('runTick and stopTimerLoop', () => {
    it('stopTimerLoop disarms the countdown, and can be called again safely', () => {
        runTick();
        assert.equal(isTimerLoopActive(), true);
        stopTimerLoop();
        assert.equal(isTimerLoopActive(), false);
        assert.equal(env.clock.pending(), 0);
        stopTimerLoop();
        assert.equal(isTimerLoopActive(), false);
    });

    it('runTick replaces the running interval instead of adding one', () => {
        runTick();
        runTick();
        assert.equal(env.clock.pending(), 1);
    });
});

describe('stopTimerWhenLeavingTimerPhase', () => {
    it('stops the loop and the keep-alive when leaving the timer screen', () => {
        startTimer();
        stopTimerWhenLeavingTimerPhase('timer', 'vote');
        assert.equal(isTimerLoopActive(), false);
        assert.equal(env.clock.pending(), 0);
        assert.equal(lastKeepAlive().stopped, true);
    });

    it('leaves the countdown alone for moves that do not leave the timer screen', () => {
        for (const [from, to] of [['vote', 'result'], ['reveal', 'timer'], ['timer', 'timer'], ['welcome', 'setup']]) {
            startTimer();
            stopTimerWhenLeavingTimerPhase(from, to);
            assert.equal(isTimerLoopActive(), true, `${from} -> ${to}`);
            assert.equal(lastKeepAlive().stopped, false, `${from} -> ${to}`);
            stopTimerLoop();
            stopAudioKeepAlive();
        }
    });

    it('does nothing, not even to the keep-alive, when no countdown is armed', () => {
        keepAudioAlive();
        stopTimerWhenLeavingTimerPhase('timer', 'vote');
        assert.equal(lastKeepAlive().stopped, false);
        assert.equal(isTimerLoopActive(), false);
    });

    it('wired to setPhase, going to another screen kills a running countdown', () => {
        setBeforePhaseChange(stopTimerWhenLeavingTimerPhase);
        gameState.settings.timerMin = 2;
        startTimer();
        seconds(2);
        assert.equal(isTimerLoopActive(), true);
        setPhase('welcome');
        assert.equal(gameState.phase, 'welcome');
        assert.equal(isTimerLoopActive(), false);
        assert.equal(env.clock.pending(), 0);
        assert.equal(lastKeepAlive().stopped, true);
        seconds(10);
        assert.equal(remaining(), 118);
    });

    it('wired to setPhase, staying on the timer screen keeps the countdown going', () => {
        setBeforePhaseChange(stopTimerWhenLeavingTimerPhase);
        startTimer();
        setPhase('timer');
        assert.equal(isTimerLoopActive(), true);
        pauseTimer(true);
        resumeTimer();
        assert.equal(isTimerLoopActive(), true);
        assert.equal(gameState.timer.running, true);
    });

    it('wired to setPhase, running out of time still ends on the vote screen with no loop left', () => {
        setBeforePhaseChange(stopTimerWhenLeavingTimerPhase);
        gameState.settings.timerMin = 1;
        startTimer();
        seconds(60);
        assert.equal(gameState.phase, 'vote');
        assert.equal(remaining(), 0);
        assert.equal(isTimerLoopActive(), false);
        assert.equal(env.clock.pending(), 0);
    });
});
