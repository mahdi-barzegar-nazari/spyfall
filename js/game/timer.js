/**
 * Discussion countdown. Owns the interval handle; pausedSec is the single source of truth.
 */

import { setPhase } from '../core/dispatch.js';
import { gameState, session } from '../core/state.js';
import { calcDirectorTurn } from './rounds.js';
import { keepAudioAlive, playSiren, playTone, stopAudioKeepAlive, vibrate } from '../platform/audio.js';
import { requestWakeLock } from '../platform/wakeLock.js';
import { renderTimer } from '../ui/render.js';

let timerInt = null;

let lastSoundSecond = null;

/** Stop the countdown interval, if any. */
export function stopTimerLoop() {
    clearInterval(timerInt);
    timerInt = null;
}

/** True while a countdown interval is armed. */
export function isTimerLoopActive() {
    return timerInt !== null;
}

export function startTimer() {
    requestWakeLock();
    keepAudioAlive();
    lastSoundSecond = null;
    gameState.timer.pausedSec = gameState.settings.timerMin * 60;
    gameState.timer.running = true;
    if (gameState.settings.director) calcDirectorTurn();
    setPhase('timer');
    runTick();
}

// Pure discrete-seconds countdown — no Date.now() diffing of any kind.
// gameState.timer.pausedSec is the single source of truth for time
// remaining and is decremented by exactly 1 on every tick. This is what
// makes pause/resume/reload safe: whatever value was last written to
// localStorage IS the remaining time, full stop — never recomputed
// against wall-clock time that passed while the app was closed,
// backgrounded, or the user was on another screen.
export function runTick() {
    clearInterval(timerInt);
    timerInt = setInterval(() => {
        if (!gameState.timer.running) return;
        gameState.timer.pausedSec = Math.max(0, (gameState.timer.pausedSec || 0) - 1);
        const diff = gameState.timer.pausedSec;

        if (diff <= 0) {
            clearInterval(timerInt);
            timerInt = null;
            stopAudioKeepAlive();
            gameState.timer.pausedSec = 0;
            gameState.timer.running = false;
            renderTimer(0);
            gameState.timer.reason = 'timeout';
            playTone(900, 0.7);
            gameState.localVoteIndex = 0;
            session.voteHandoffDoneIndex = -1;
            setPhase('vote');
        } else {
            renderTimer(diff);
            if (diff !== lastSoundSecond) {
                if (diff === 30) {
                    playSiren();
                    vibrate([300, 150, 300]);
                }
                if (diff <= 10 && diff > 0) {
                    playTone(750, 0.1);
                    vibrate(80);
                }
                lastSoundSecond = diff;
            }
        }
    }, 1000);
}

export function pauseTimer(silent = false) {
    gameState.timer.running = false;
    clearInterval(timerInt);
    timerInt = null;
    stopAudioKeepAlive();
    if (!silent) playSiren();
}

export function resumeTimer() {
    requestWakeLock();
    keepAudioAlive();
    lastSoundSecond = null;
    gameState.timer.running = true;
    // No endAt re-arming here: pausedSec already holds the exact
    // discrete seconds remaining (frozen the moment the countdown was
    // last paused/persisted), so the interval below simply keeps
    // counting down from it.
    setPhase('timer');
    runTick();
}
