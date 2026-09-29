/**
 * Composition root. The only module that knows both the low-level seams (`core/dispatch.js`,
 * `core/phase.js`) and the modules that fill them, so it is the only place where the two directions meet.
 * `main.js` calls `wireApp()` once, before anything can dispatch.
 */

import { setDispatchHandler } from '../core/dispatch.js';
import { setBeforePhaseChange, setRenderer } from '../core/phase.js';
import { stopTimerWhenLeavingTimerPhase } from '../game/timer.js';
import { renderUI } from '../ui/render.js';
import { handleAction } from './actions.js';

/** Fill every seam. Safe to call more than once: each setter simply replaces the previous value. */
export function wireApp() {
    setDispatchHandler(handleAction);
    setRenderer(renderUI);
    setBeforePhaseChange(stopTimerWhenLeavingTimerPhase);
}
