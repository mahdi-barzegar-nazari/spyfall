/**
 * The first-visit intro (ui/intro.js): a short "the game in 3 steps" dialog that opens by itself on the welcome
 * screen of a person who looks new. This file is the memory behind it and the rule for when it may open; nothing here
 * touches the page.
 *
 * It must not nag. It opens at most INTRO_MAX_SHOWS times, never once INTRO_MAX_MATCHES matches have been started, never
 * after the person has said they understood it (`off`), and never for someone who was already using this device
 * before the intro existed (the caller says so: see playedBeforeTheIntro in ui/intro.js: signs of play, and no record
 * of the intro yet). Under browser automation (`navigator.webdriver`, which
 * Playwright sets) it is switched off altogether, so a test that opens the app is never met by it and no test sees
 * its key; the intro's own test turns the flag off again.
 *
 * What is stored (`spy_intro`, a JSON object, never trusted): `shown` how many times it has opened, `matches` how many
 * matches the person has started, `off` whether they pressed "Got it" or opened the full guide.
 */

export const INTRO_KEY = 'spy_intro';
export const INTRO_MAX_SHOWS = 3;
export const INTRO_MAX_MATCHES = 3;

export function defaultIntroState() {
    return { shown: 0, matches: 0, off: false };
}

const whole = (value, max) => (Number.isInteger(value) && value >= 0 ? Math.min(value, max) : 0);

/** A clean state from anything that was read: counts as whole numbers from 0 up to their limits, `off` only for a real `true`. */
export function sanitizeIntroState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultIntroState();
    return { shown: whole(raw.shown, INTRO_MAX_SHOWS), matches: whole(raw.matches, INTRO_MAX_MATCHES), off: raw.off === true };
}

/** True under browser automation (see the top of this file). */
export function isAutomated() {
    return globalThis.navigator?.webdriver === true;
}

/** Does the device hold a record of the intro (written when the intro first opens, or when a match is first counted)? */
export function hasIntroRecord() {
    try {
        return localStorage.getItem(INTRO_KEY) !== null;
    } catch(e) { return false; }
}

export function loadIntroState() {
    try {
        return sanitizeIntroState(JSON.parse(localStorage.getItem(INTRO_KEY)));
    } catch(e) { return defaultIntroState(); }
}

/** Store the state; false when the storage refuses (the intro then stays shut, so a broken storage cannot make it open at every visit). */
export function saveIntroState(state) {
    try {
        localStorage.setItem(INTRO_KEY, JSON.stringify(sanitizeIntroState(state)));
        return true;
    } catch(e) {
        console.warn("Storage write restricted:", e);
        return false;
    }
}

/** May the intro open? `experienced` is whether this device was already in use before the intro existed. */
export function shouldShowIntro(state, experienced) {
    return !experienced && !state.off && state.shown < INTRO_MAX_SHOWS && state.matches < INTRO_MAX_MATCHES;
}

/** The person understood it (or went on to the full guide): it never opens again. */
export function markIntroDone() {
    if (isAutomated()) return;
    saveIntroState({ ...loadIntroState(), off: true });
}

/** A match was started: counts towards INTRO_MAX_MATCHES (written only while it still matters). */
export function recordMatchStarted() {
    if (isAutomated()) return;
    const state = loadIntroState();
    if (state.matches >= INTRO_MAX_MATCHES) return;
    saveIntroState({ ...state, matches: state.matches + 1 });
}
