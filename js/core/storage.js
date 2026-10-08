/**
 * localStorage persistence: saved match, player names and custom word bank.
 */

import { SAVE_VERSION, gameState, serializeSecrets } from './state.js';
import { getLang, t, translationsOf } from '../i18n/index.js';

export function persist() {
    if (gameState.players.length > 0) {
        try {
            const combined = {
                version: SAVE_VERSION,
                state: gameState,
                secrets: serializeSecrets()
            };
            localStorage.setItem('spy_full_state_master', JSON.stringify(combined));
        } catch(e) {
            console.warn("Storage write restricted:", e);
        }
    }
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The number of a slot in a default name: Latin, Persian or Arabic-Indic digits. */
const SLOT_NUMBER = '[0-9\\u0660-\\u0669\\u06F0-\\u06F9]+';

/** A regular expression for the whole text of `setup.player.default` in one language, `{n}` being any number. */
function defaultNamePattern(template) {
    return new RegExp(`^${template.split('{n}').map(escapeRegExp).join(SLOT_NUMBER)}$`);
}

/** True when `name` is exactly the default player name of a language `isLang` accepts ("Player 3" in English). */
function isDefaultNameOf(name, isLang) {
    if (typeof name !== 'string') return false;
    const text = name.trim();
    if (!text) return false;
    return Object.entries(translationsOf('setup.player.default')).some(([lang, template]) => isLang(lang) && defaultNamePattern(template).test(text));
}

/**
 * True when `name` is just the default name of a slot, in ANY supported language ("Player 3" in English, and
 * its Persian counterpart).
 * Such a name is not something the user typed, so it is never saved, and a saved one is not used: the slot
 * gets the default of the language that is active when it is drawn. The number is not compared with the
 * slot, so a typed "Player 7" in slot 1 counts as a default too; text around the pattern ("Player 3 the
 * Great") does not.
 */
export function isDefaultPlayerName(name) {
    return isDefaultNameOf(name, () => true);
}

/** Like `isDefaultPlayerName`, but only for the default names of the languages that are NOT the active one. */
export function isDefaultPlayerNameOfOtherLanguage(name) {
    const active = getLang();
    return isDefaultNameOf(name, (lang) => lang !== active);
}

/**
 * The saved names, one per slot. A name that is just a default of any language reads as '' ("no saved
 * name"), so the slot gets the current language's default; this also cleans what older versions saved.
 * A name the user typed is returned as it was saved.
 */
export function loadSavedNames() {
    try {
        const parsed = JSON.parse(localStorage.getItem('spy_saved_player_names'));
        return Array.isArray(parsed) ? parsed.map((name) => (isDefaultPlayerName(name) ? '' : name)) : [];
    } catch(e) { return []; }
}

/** Save the names of the setup form, one per slot. A default name is saved as '' (see `isDefaultPlayerName`). */
export function saveCurrentNames(names) {
    try {
        const kept = Array.isArray(names) ? names.map((name) => (isDefaultPlayerName(name) ? '' : name)) : names;
        localStorage.setItem('spy_saved_player_names', JSON.stringify(kept));
    } catch(e) {
        console.warn("Storage write restricted:", e);
    }
}

export function getCustomWords() {
    try {
        const parsed = JSON.parse(localStorage.getItem('spy_custom_words'));
        return Array.isArray(parsed) ? parsed.map(cleanCustomWord).filter(Boolean) : [];
    } catch(e) { return []; }
}

export function saveCustomWords(list) {
    try {
        localStorage.setItem('spy_custom_words', JSON.stringify(list));
    } catch(e) {
        console.warn("Storage write restricted:", e);
    }
}

export function cleanCustomWord(w) {
    if (!w || typeof w !== 'object') return null;
    const word = String(w.word || '').trim();
    const foolWord = String(w.foolWord || word).trim();
    // No hint is stored as '' (never as the "no hint" text of one language); `displayHint` words it on use.
    const hint = String(w.hint || '').trim();
    if (!word || word.length > 30) return null;
    if (foolWord.length > 30) return null;
    if (hint.length > 30) return null;
    return {
        word,
        foolWord,
        hint,
        diff: ['easy', 'medium', 'hard'].includes(w.diff) ? w.diff : 'medium'
    };
}

/**
 * The hint to show for a custom word's `hint`: the stored text, or the "no hint" text of the ACTIVE language
 * when there is none. An empty hint (what is stored now) and a legacy stored "no hint" text of any language
 * (saved by an older version in whatever language was active) both read that way.
 */
export function displayHint(hint) {
    const text = String(hint == null ? '' : hint).trim();
    if (!text || Object.values(translationsOf('setup.hint.none')).includes(text)) return t('setup.hint.none');
    return text;
}
