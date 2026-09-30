/**
 * Shared test plumbing for the game-logic tests: pristine singletons, player builders, and recorders
 * for the seams in core/phase.js (renderer) and core/dispatch.js (action handler).
 *
 * This file only imports modules that are safe to load without a browser, so it can be imported
 * statically before `installFakeEnv()` runs.
 */
import { afterEach, beforeEach } from 'node:test';
import { setDispatchHandler } from '../../../js/core/dispatch.js';
import { setBeforePhaseChange, setRenderer } from '../../../js/core/phase.js';
import {
    gameState,
    hostSecretState,
    replaceGameState,
    replaceHostSecrets,
    session
} from '../../../js/core/state.js';

// Taken while this module loads, before any test can touch the singletons.
const INITIAL_GAME = structuredClone(gameState);
const INITIAL_SECRETS = structuredClone(hostSecretState);
const INITIAL_SESSION = structuredClone(session);

/** Put gameState, hostSecretState and session back to their start-up values (fresh copies). */
export function resetSingletons() {
    replaceGameState(structuredClone(INITIAL_GAME));
    replaceHostSecrets(structuredClone(INITIAL_SECRETS));
    Object.assign(session, structuredClone(INITIAL_SESSION));
}

/** The per-player statistics a new player starts with (see initMatchPlayers). */
export function freshStats() {
    return {
        sw: 0,
        cw: 0,
        spiesCaught: 0,
        vs: 0,
        bw: 0,
        bl: 0,
        spyGuesses: 0,
        innocentVotesReceived: 0,
        foolEscaped: 0,
        wagerProfit: 0,
        hiddenTieBreakerScore: 0,
        timesSpy: 0,
        timesFool: 0,
        wrongVotes: 0,
        totalCatchTimeSec: 0,
        citizensEliminatedBeforeCaught: 0
    };
}

/** A player as initMatchPlayers builds one, with any field overridden. */
export function makePlayer(id, overrides = {}) {
    return {
        id,
        name: `Player ${id}`,
        score: 0,
        isAlive: true,
        hasSeen: false,
        isSpectator: false,
        online: true,
        role: 'citizen',
        team: 'citizen',
        quest: null,
        stats: freshStats(),
        ...overrides
    };
}

/** Players with ids p1..pN. */
export function makePlayers(count) {
    return Array.from({ length: count }, (_, i) => makePlayer(`p${i + 1}`));
}

/**
 * Registers beforeEach/afterEach hooks for the calling test file (call it once, at the top level):
 * fresh singletons and fake DOM, a manual clock as the global timers, a renderer that records the
 * phase it was asked to draw, and a dispatch handler that records every action.
 *
 * Returns `{ renders, actions }`. Both arrays are emptied before each test.
 * `setup` runs last in beforeEach, `teardown` first in afterEach (before the fakes are reset).
 */
export function useGameHarness(env, { setup, teardown } = {}) {
    const recorded = { renders: [], actions: [] };
    beforeEach(() => {
        env.reset();
        env.installTimers();
        resetSingletons();
        recorded.renders.length = 0;
        recorded.actions.length = 0;
        setRenderer(() => recorded.renders.push(gameState.phase));
        setDispatchHandler((action) => recorded.actions.push(action));
        if (setup) setup();
    });
    afterEach(() => {
        if (teardown) teardown();
        setRenderer(null);
        setBeforePhaseChange(null);
        setDispatchHandler(null);
        env.reset();
    });
    return recorded;
}
