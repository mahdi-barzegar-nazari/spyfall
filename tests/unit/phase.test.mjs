/**
 * The two seams that replaced the dispatch import cycle: core/phase.js (commitState, setPhase) and the
 * dispatch port in core/dispatch.js. Both are exercised with fakes, so no DOM is needed.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { dispatch, setDispatchHandler } from '../../js/core/dispatch.js';
import { commitState, setBeforePhaseChange, setPhase, setRenderer } from '../../js/core/phase.js';
import { gameState } from '../../js/core/state.js';

let log;
let savedPhase;
let savedPlayers;
let savedStorage;

beforeEach(() => {
    log = [];
    savedPhase = gameState.phase;
    savedPlayers = gameState.players;
    savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    // persist() only writes when a match exists, and needs a localStorage to write to.
    gameState.players = [{ id: 'p1', name: 'A' }];
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: { setItem: (key) => log.push(`persist:${key}`) }
    });
});

afterEach(() => {
    gameState.phase = savedPhase;
    gameState.players = savedPlayers;
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage);
    else delete globalThis.localStorage;
    setRenderer(null);
    setBeforePhaseChange(null);
    setDispatchHandler(null);
});

describe('commitState', () => {
    it('renders first and then persists the match', () => {
        setRenderer(() => log.push('render'));
        commitState();
        assert.deepEqual(log, ['render', 'persist:spy_full_state_master']);
    });

    it('does not persist when rendering throws', () => {
        setRenderer(() => {
            throw new Error('boom');
        });
        assert.throws(() => commitState(), /boom/);
        assert.deepEqual(log, []);
    });

    it('fails loudly, instead of silently skipping the redraw, when no renderer is installed', () => {
        setRenderer(null);
        assert.throws(() => commitState(), /renderer/);
        assert.deepEqual(log, []);
    });
});

describe('setPhase', () => {
    it('ignores unknown phases without touching state, hook or renderer', () => {
        gameState.phase = 'setup';
        setRenderer(() => log.push('render'));
        setBeforePhaseChange(() => log.push('hook'));
        setPhase('not-a-phase');
        assert.equal(gameState.phase, 'setup');
        assert.deepEqual(log, []);
    });

    it('runs the hook with (from, to) before the phase changes, then renders the new phase', () => {
        gameState.phase = 'timer';
        setBeforePhaseChange((from, to) => log.push(`hook:${from}->${to}@${gameState.phase}`));
        setRenderer(() => log.push(`render@${gameState.phase}`));
        setPhase('vote');
        assert.equal(gameState.phase, 'vote');
        assert.deepEqual(log, ['hook:timer->vote@timer', 'render@vote', 'persist:spy_full_state_master']);
    });

    it('works with no hook installed', () => {
        gameState.phase = 'setup';
        setRenderer(() => log.push('render'));
        setPhase('reveal');
        assert.equal(gameState.phase, 'reveal');
        assert.deepEqual(log, ['render', 'persist:spy_full_state_master']);
    });
});

describe('dispatch port', () => {
    it('hands the action to the installed handler', () => {
        const seen = [];
        setDispatchHandler((action) => seen.push(action));
        const action = { type: 'NAVIGATE', payload: 'setup' };
        dispatch(action);
        assert.deepEqual(seen, [action]);
        assert.equal(seen[0], action, 'the same object, not a copy');
    });

    it('lets a handler dispatch again while it is running (as OPEN_ROLE_CARD does)', () => {
        setDispatchHandler((action) => {
            log.push(action.type);
            if (action.type === 'OUTER') dispatch({ type: 'INNER' });
            log.push(`${action.type}:done`);
        });
        dispatch({ type: 'OUTER' });
        assert.deepEqual(log, ['OUTER', 'INNER', 'INNER:done', 'OUTER:done']);
    });

    it('propagates an exception from the handler to the caller', () => {
        setDispatchHandler(() => {
            throw new Error('handler failed');
        });
        assert.throws(() => dispatch({ type: 'X' }), /handler failed/);
    });

    it('fails loudly, naming the action, when no handler is installed', () => {
        setDispatchHandler(null);
        assert.throws(() => dispatch({ type: 'START_MATCH' }), /START_MATCH.*handler/);
    });
});
