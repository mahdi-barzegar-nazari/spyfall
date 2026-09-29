/**
 * The action port: `dispatch({ type, payload })` is what every module calls to trigger an action.
 *
 * This file imports nothing from `game/` or `ui/`. The handler that actually runs the actions
 * (`app/actions.js`) is installed at start-up by `app/wire.js` through `setDispatchHandler`, so the modules
 * that dispatch never depend on the modules that handle.
 */

import { INFO_TEXTS } from '../data/infoTexts.js';

let handler = null;

/** Install the function that runs every action. */
export function setDispatchHandler(fn) {
    handler = fn;
}

export function dispatch(action) {
    if (!handler) throw new Error(`dispatch(${action && action.type}) ran before a handler was installed; call wireApp() first.`);
    handler(action);
}

export function showInfoModal(key) {
    const item = INFO_TEXTS[key];
    if (!item) return;
    document.getElementById('info-modal-title').textContent = item.title;
    document.getElementById('info-modal-desc').style.whiteSpace = 'pre-line';
    document.getElementById('info-modal-desc').textContent = item.text;
    dispatch({type: 'OPEN_MODAL', payload: 'info-modal'});
}
