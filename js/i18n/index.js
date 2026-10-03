/**
 * Translation core: the active language, `t()`, and the translator for the static HTML.
 *
 * Rules:
 *  - Every displayable text comes from `t(key)` (JS) or from a `data-i18n*` attribute (index.html).
 *  - `t()` returns plain text. It never interprets HTML, and it never escapes anything: a caller that
 *    puts the result (or a parameter) into `innerHTML` must escape it first.
 *  - The Persian text written in index.html stays as the default, so the first paint, the offline path
 *    and the Persian experience never wait for JS. Static translations are applied only when the
 *    language is not the default, and again on every `setLang`.
 *  - This module imports nothing from game/, ui/ or app/ (tests/unit/import-cycles.test.mjs).
 */

import { CATALOGS } from './catalogs.js';

export const DEFAULT_LANG = 'fa';

/** Languages the app can switch to. A new one also needs a catalog in `catalogs.js` and a direction below. */
export const SUPPORTED_LANGS = ['fa'];

/** Value written to `<html dir>` for each language. */
export const LANG_DIRECTIONS = { fa: 'rtl' };

/** localStorage key of the chosen language. */
export const LANG_STORAGE_KEY = 'spy_lang';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

let currentLang = DEFAULT_LANG;
const listeners = new Set();

export function getLang() {
    return currentLang;
}

/** The text for `key` in the active language, else in Persian, else `undefined`. Own properties only. */
function lookup(key) {
    const chain = currentLang === DEFAULT_LANG ? [DEFAULT_LANG] : [currentLang, DEFAULT_LANG];
    for (const lang of chain) {
        const catalog = hasOwn(CATALOGS, lang) ? CATALOGS[lang] : null;
        if (catalog && hasOwn(catalog, key) && typeof catalog[key] === 'string') return catalog[key];
    }
    return undefined;
}

/** True when `key` has a text in the active language or in the Persian fallback. */
export function hasTranslation(key) {
    return lookup(key) !== undefined;
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Translate `key` for the active language, falling back to Persian and then to the key itself.
 * `{name}` in the text is replaced by `params.name`; a placeholder with no value is left as it is.
 * The replacement is a single pass, so a value that looks like a placeholder is never expanded again.
 */
export function t(key, params) {
    const text = lookup(key);
    if (text === undefined) return String(key);
    if (!params) return text;
    return text.replace(PLACEHOLDER, (match, name) => {
        const value = hasOwn(params, name) ? params[name] : undefined;
        return value === undefined || value === null ? match : String(value);
    });
}

/**
 * Put the translations into the static HTML below `root`:
 *  - `data-i18n="key"` sets the element's whole `textContent`, so it goes only on leaf elements;
 *  - `data-i18n-attr="aria-label:key;title:key"` sets those attributes.
 * `<title>` and `<meta name="description">` carry the same attributes, so `document` covers them too.
 * A key with no text anywhere is skipped, which keeps the HTML default instead of showing a raw key.
 */
export function applyStaticTranslations(root = globalThis.document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    for (const el of root.querySelectorAll('[data-i18n]')) {
        const key = el.getAttribute('data-i18n');
        if (hasTranslation(key)) el.textContent = t(key);
    }
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
        for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
            const colon = pair.indexOf(':');
            if (colon < 1) continue;
            const attr = pair.slice(0, colon).trim();
            const key = pair.slice(colon + 1).trim();
            if (attr && hasTranslation(key)) el.setAttribute(attr, t(key));
        }
    }
}

/** Write the language and its direction on `<html>`. */
function applyDocumentLanguage(lang) {
    const root = globalThis.document && globalThis.document.documentElement;
    if (!root) return;
    root.lang = lang;
    root.dir = hasOwn(LANG_DIRECTIONS, lang) ? LANG_DIRECTIONS[lang] : 'ltr';
}

function notify(lang) {
    for (const listener of [...listeners]) {
        try {
            listener(lang);
        } catch (error) {
            console.error('onLangChange listener failed:', error);
        }
    }
}

/**
 * Switch language. An unsupported value is ignored and `false` is returned. Otherwise the choice is
 * saved, `<html lang dir>` is updated, the static HTML is translated (always, so returning to Persian
 * from another language works) and, when the language actually changed, the listeners are told.
 */
export function setLang(lang) {
    if (typeof lang !== 'string' || !SUPPORTED_LANGS.includes(lang)) return false;
    const changed = lang !== currentLang;
    currentLang = lang;
    try {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (e) {}
    applyDocumentLanguage(lang);
    applyStaticTranslations();
    if (changed) notify(lang);
    return true;
}

/** Call `callback(lang)` after every language change. Returns a function that removes the listener. */
export function onLangChange(callback) {
    if (typeof callback !== 'function') throw new TypeError('onLangChange needs a function');
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

/**
 * Read the saved language. Call it once at start-up, before the first render. It does not save and does
 * not notify. The static HTML is translated only when the language is not the default, so the Persian
 * path touches nothing.
 */
export function initI18n() {
    let saved = null;
    try {
        saved = localStorage.getItem(LANG_STORAGE_KEY);
    } catch (e) {}
    currentLang = SUPPORTED_LANGS.includes(saved) ? saved : DEFAULT_LANG;
    applyDocumentLanguage(currentLang);
    if (currentLang !== DEFAULT_LANG) applyStaticTranslations();
    return currentLang;
}
