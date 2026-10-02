/**
 * Tests for restoring a saved game (app/actions.js): the RESTORE_GAME action, which runs the module's private
 * restorePhaseBindings. The save is written as persist() writes it, memory is wiped as a page reload would,
 * and handleAction does the restoring; nothing in the game code is exposed for this.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { SAVE_VERSION, gameState, hostSecretState, serializeSecrets } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { isTimerLoopActive, stopTimerLoop } = await import('../../js/game/timer.js');
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
