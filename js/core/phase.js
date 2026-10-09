/**
 * Phase transitions and the commit step (render, then persist).
 *
 * This module sits below `game/` and `ui/` and must not import either. The two things it cannot know
 * about are injected by `app/wire.js` at start-up:
 *   - the screen renderer (`setRenderer`), which `commitState` calls before persisting;
 *   - a hook that runs just before the phase changes (`setBeforePhaseChange`), which the timer uses to make
 *     sure its countdown never outlives the discussion screen.
 */

import { VALID_PHASES } from './config.js';
import { gameState } from './state.js';
import { persist } from './storage.js';
import { requestWakeLock } from '../platform/wakeLock.js';

let renderer = null;
let beforePhaseChange = null;

/**
 * The phases in which no match exists yet: the welcome screen (with or without the recovery banner) and the
 * setup form. Every other phase belongs to a match, from the first role card to the final scoreboard.
 */
const OUTSIDE_MATCH_PHASES = new Set(['welcome', 'setup']);

/**
 * True while a match is in progress, which is when the language must not change: the match holds texts in
 * its own language (hint titles, the category label, the detective's answer) and its word from that
 * language's bank. A phase this module does not know counts as in progress, so a damaged state can never
 * unlock the switch. The final scoreboard counts too: it still shows the match.
 */
export function isMatchInProgress() {
    return !OUTSIDE_MATCH_PHASES.has(gameState.phase);
}

/** Install the function that redraws the screen for `gameState.phase`. */
export function setRenderer(fn) {
    renderer = fn;
}

/** Install a hook called as `fn(fromPhase, toPhase)` before `gameState.phase` is overwritten. */
export function setBeforePhaseChange(fn) {
    beforePhaseChange = fn;
}

export function commitState() {
    if (!renderer) throw new Error('commitState() ran before a renderer was installed; call wireApp() first.');
    renderer();
    persist();
}

export function setPhase(p) {
    if (!VALID_PHASES.has(p)) return;
    if (beforePhaseChange) beforePhaseChange(gameState.phase, p);
    gameState.phase = p;
    requestWakeLock();
    commitState();
}
