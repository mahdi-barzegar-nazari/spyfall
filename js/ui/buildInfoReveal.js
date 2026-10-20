/**
 * When the build line on the welcome screen (`#build-info`) is shown: it is hidden by default and a long press
 * on the welcome title reveals it for a few seconds. This file is only the decision logic. It touches no DOM
 * and reads no clock of its own: the timer functions and the two effects (`show`, `hide`) are injected, so a
 * test drives it with a manual clock. `ui/buildInfo.js` (`initBuildInfoReveal`) feeds it the pointer events of
 * the title and turns `show` / `hide` into a CSS class.
 *
 * The rules:
 *  - A press is `pressStart(x, y)`; if it is still held `HOLD_MS` later, the line is revealed. Releasing earlier
 *    (`pressEnd`), a cancelled pointer or one that left the title (`cancelPress`), and moving more than
 *    `MOVE_TOLERANCE_PX` from where the press began (`pressMove`) all end the press without a reveal. A quick
 *    tap and a scroll therefore do nothing.
 *  - The line hides itself `VISIBLE_MS` after the reveal.
 *  - A second long press while the line is showing restarts those seconds (it does not hide the line: a person
 *    who wants to show the number to someone else would not expect the second press to take it away).
 *  - Ending a press never undoes a reveal that already happened; only the timeout and `reset()` hide the line.
 *  - `reset()` (the screen changed) ends the press and hides the line at once. `destroy()` does the same and
 *    makes every later call a no-op, so nothing can arm a timer afterwards.
 *
 * Pure: no imports, so it sits in `ui/` next to `buildInfo.js` and cannot add an edge to the module graph.
 */

/** How long the pointer must stay down on the title before the line appears, in milliseconds. */
export const HOLD_MS = 600;

/** How far (CSS pixels) the pointer may drift from where it went down before the press counts as a move. */
export const MOVE_TOLERANCE_PX = 10;

/** How long the line stays on screen after it appeared, in milliseconds. */
export const VISIBLE_MS = 6000;

/**
 * @param {object} options
 * @param {() => void} options.show Called when the line becomes visible.
 * @param {() => void} options.hide Called when the line becomes hidden again.
 * @param {(fn: () => void, ms: number) => unknown} [options.setTimer] `setTimeout` by default (read when called).
 * @param {(id: unknown) => void} [options.clearTimer] `clearTimeout` by default (read when called).
 * @param {number} [options.holdMs]
 * @param {number} [options.visibleMs]
 * @param {number} [options.tolerance]
 */
export function createBuildInfoReveal({
    show,
    hide,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    holdMs = HOLD_MS,
    visibleMs = VISIBLE_MS,
    tolerance = MOVE_TOLERANCE_PX
}) {
    let pressTimer = null;
    let hideTimer = null;
    let origin = null; // where the current press began; null when no press is in progress
    let visible = false;
    let destroyed = false;

    function clearPressTimer() {
        if (pressTimer !== null) clearTimer(pressTimer);
        pressTimer = null;
    }

    function clearHideTimer() {
        if (hideTimer !== null) clearTimer(hideTimer);
        hideTimer = null;
    }

    function hideNow() {
        clearHideTimer();
        if (!visible) return;
        visible = false;
        hide();
    }

    /** The press was held long enough: show the line (or keep it showing) and start the hide countdown over. */
    function revealNow() {
        pressTimer = null;
        if (destroyed) return;
        clearHideTimer();
        if (!visible) {
            visible = true;
            show();
        }
        hideTimer = setTimer(hideNow, visibleMs);
    }

    function cancelPress() {
        clearPressTimer();
        origin = null;
    }

    return {
        /** A primary pointer went down on the title at (x, y). Any press still in progress is replaced. */
        pressStart(x, y) {
            if (destroyed) return;
            cancelPress();
            origin = { x: Number(x) || 0, y: Number(y) || 0 };
            pressTimer = setTimer(revealNow, holdMs);
        },

        /** The pointer moved to (x, y): too far from where the press began ends the press. */
        pressMove(x, y) {
            if (!origin) return;
            if (Math.hypot((Number(x) || 0) - origin.x, (Number(y) || 0) - origin.y) > tolerance) cancelPress();
        },

        /** The pointer was released. */
        pressEnd: cancelPress,

        /** The pointer was cancelled by the browser (a scroll began, say) or left the title. */
        cancelPress,

        /** True from `pressStart` until the press ends, also after the reveal while the pointer is still down. */
        isPressing: () => origin !== null,

        /** True while the line is shown. */
        isVisible: () => visible,

        /** The screen changed: end any press and hide the line now. */
        reset() {
            cancelPress();
            hideNow();
        },

        /** Stop for good: like `reset()`, and nothing can be armed afterwards. */
        destroy() {
            cancelPress();
            hideNow();
            destroyed = true;
        }
    };
}
