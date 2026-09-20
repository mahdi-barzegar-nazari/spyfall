/**
 * Randomness helpers (Fisher-Yates shuffle, crypto-backed picks, ids).
 */

export function shuffle(arr) {
    let array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function generateId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'p_' + Math.random().toString(36).substring(2, 11);
}

export function getRandomCryptoInt(max) {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        const arr = new Uint32Array(1);
        globalThis.crypto.getRandomValues(arr);
        return arr[0] % max;
    }
    return Math.floor(Math.random() * max);
}
