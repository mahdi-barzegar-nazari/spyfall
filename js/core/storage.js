/**
 * localStorage persistence: saved match, player names and custom word bank.
 */

import { SAVE_VERSION, gameState, serializeSecrets } from './state.js';

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

export function loadSavedNames() {
    try {
        const parsed = JSON.parse(localStorage.getItem('spy_saved_player_names'));
        return Array.isArray(parsed) ? parsed : [];
    } catch(e) { return []; }
}

export function saveCurrentNames(names) {
    try {
        localStorage.setItem('spy_saved_player_names', JSON.stringify(names));
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
    const hint = String(w.hint || 'بدون راهنما').trim();
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
