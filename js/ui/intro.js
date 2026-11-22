/**
 * The first-visit intro: opens #intro-modal by itself on the welcome screen when the person looks new (the rule and
 * the memory are in core/intro.js). It waits a moment, so the welcome screen is seen first, and gives up if something
 * else is on the screen by then.
 */

import { dispatch } from '../core/dispatch.js';
import { INTRO_KEY, hasIntroRecord, isAutomated, loadIntroState, saveIntroState, shouldShowIntro } from '../core/intro.js';
import { gameState } from '../core/state.js';
import { loadRecentWords, loadSetupSettings } from '../core/storage.js';

export const INTRO_DELAY_MS = 700;

/**
 * Was this device in use before the intro existed? A remembered word, a saved setup or a saved match says so, but
 * only while the device has no record of the intro: once the intro has opened or a match has been counted, those
 * same signs belong to a person who is still being shown the first steps (a first match saves a setup too).
 */
export function playedBeforeTheIntro() {
    if (hasIntroRecord()) return false;
    try {
        return loadRecentWords().length > 0 || loadSetupSettings() !== null || localStorage.getItem('spy_full_state_master') !== null;
    } catch(e) { return true; }
}

/** True when a modal dialog is open now. */
const modalOpen = () => document.querySelector('.modal-overlay:not(.hidden)') !== null;

/**
 * Schedule the intro if the person looks new; returns whether it was scheduled. When the moment comes, it opens only
 * if the welcome screen is still the screen and nothing else is open, and it counts the showing before it opens (so
 * a storage that refuses to write keeps it shut).
 */
export function maybeShowIntro() {
    if (isAutomated()) return false;
    if (gameState.phase !== 'welcome') return false;
    if (!shouldShowIntro(loadIntroState(), playedBeforeTheIntro())) return false;
    setTimeout(() => {
        if (gameState.phase !== 'welcome' || modalOpen()) return;
        const state = loadIntroState();
        if (!shouldShowIntro(state, playedBeforeTheIntro())) return;
        if (!saveIntroState({ ...state, shown: state.shown + 1 })) return;
        dispatch({ type: 'OPEN_MODAL', payload: 'intro-modal' });
    }, INTRO_DELAY_MS);
    return true;
}

export { INTRO_KEY };
