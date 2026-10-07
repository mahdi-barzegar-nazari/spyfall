/**
 * Translation core: the active language, `t()`, and the translator for the static HTML.
 *
 * Rules:
 *  - Every displayable text comes from `t(key)` (JS) or from a `data-i18n*` attribute (index.html).
 *  - `t()` and `tn()` return plain text. They never interpret HTML and never escape anything: a caller
 *    that puts the result (or a parameter) into `innerHTML` must escape it first, or use `tHtml()` /
 *    `tnHtml()`, which escape the catalog text and every parameter except a `rawHtml()` one.
 *  - A catalog value never contains markup. When a sentence needs a bold name, a `<bdi>` or a line break,
 *    the markup stays in the code: the sentence is one template with `{name}` / `{br}` placeholders that
 *    `setTemplate()` (DOM nodes) or `tHtml()` (an HTML string) fills in.
 *  - The Persian text written in index.html stays as the default, so the first paint, the offline path
 *    and the Persian experience never wait for JS. Static translations are applied only when the
 *    language is not the default, and again on every `setLang`.
 *  - Direction and locale come from the active language too: `getDirection()` for `<html dir>`-style decisions
 *    in JS (the scorecard canvas), `getLocale()` / `formatDate()` for `Intl`. Player names are user text in
 *    either script: wrap one that goes into a plain-text sentence with `isolate()`, or into HTML with `<bdi>`.
 *  - This module imports nothing from game/, ui/ or app/ (tests/unit/import-cycles.test.mjs).
 */

import { CATALOGS } from './catalogs.js';

export const DEFAULT_LANG = 'fa';

/** Languages the app can switch to. A new one also needs a catalog in `catalogs.js`, a direction and a locale below. */
export const SUPPORTED_LANGS = ['fa', 'en'];

/** Value written to `<html dir>` for each language. */
export const LANG_DIRECTIONS = { fa: 'rtl', en: 'ltr' };

/** BCP 47 locale tag of each language, for `Intl` and date formatting (see `getLocale`, `formatDate`). */
export const LANG_LOCALES = { fa: 'fa-IR', en: 'en-US' };

/**
 * Options `formatDate` passes to `toLocaleDateString`, per language. Persian lists none, so its date is the
 * plain `fa-IR` one the scorecard has always shown; English spells the month ("Oct 4, 2026") because
 * 10/4/2026 reads as two different days in different countries.
 */
const DATE_OPTIONS = { en: { year: 'numeric', month: 'short', day: 'numeric' } };

/** Numeral system of each language: `persian` writes 0-9 as ۰-۹, a language not listed keeps Latin digits. */
export const NUMERALS = { fa: 'persian' };

const DIGIT_SETS = { persian: ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] };

/** localStorage key of the chosen language. */
export const LANG_STORAGE_KEY = 'spy_lang';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

let currentLang = DEFAULT_LANG;
const listeners = new Set();

export function getLang() {
    return currentLang;
}

/** `'rtl'` or `'ltr'`: the direction of the active language (`LANG_DIRECTIONS`; `'ltr'` for one not listed). */
export function getDirection() {
    return hasOwn(LANG_DIRECTIONS, currentLang) ? LANG_DIRECTIONS[currentLang] : 'ltr';
}

/** Locale tag of the active language (`fa-IR`, `en-US`); the language code itself if it has no entry. */
export function getLocale() {
    return hasOwn(LANG_LOCALES, currentLang) ? LANG_LOCALES[currentLang] : currentLang;
}

/** `date` (today by default) written for the active language, or '' if the runtime cannot format it. */
export function formatDate(date = new Date()) {
    try {
        return date.toLocaleDateString(getLocale(), hasOwn(DATE_OPTIONS, currentLang) ? DATE_OPTIONS[currentLang] : undefined);
    } catch (e) {
        return '';
    }
}

/**
 * Wrap `text` in a first-strong isolate (U+2068 ... U+2069) so it takes its direction from its own first
 * letter and cannot reorder the text around it. Use it for user text (a player's name) that is put into a
 * sentence as plain text, where `<bdi>` is not available: a Persian name inside an English sentence, an
 * English one inside a Persian sentence. The marks are invisible and cannot be typed into a name field.
 */
export function isolate(text) {
    return `\u2068${text}\u2069`;
}

/**
 * The first text found for any of `keys` (tried in the order given): in the active language first, then
 * in Persian. Own properties only, so `constructor` or `__proto__` can never be mistaken for a key.
 */
function lookupFirst(keys) {
    const chain = currentLang === DEFAULT_LANG ? [DEFAULT_LANG] : [currentLang, DEFAULT_LANG];
    for (const lang of chain) {
        const catalog = hasOwn(CATALOGS, lang) ? CATALOGS[lang] : null;
        if (!catalog) continue;
        for (const key of keys) {
            if (hasOwn(catalog, key) && typeof catalog[key] === 'string') return catalog[key];
        }
    }
    return undefined;
}

const lookup = (key) => lookupFirst([key]);

/** True when `key` has a text in the active language or in the Persian fallback. */
export function hasTranslation(key) {
    return lookup(key) !== undefined;
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** The value of `name` in `params`, or `undefined` (own properties only; `null` counts as missing). */
function paramValue(params, name) {
    const value = params && hasOwn(params, name) ? params[name] : undefined;
    return value === null ? undefined : value;
}

/** One pass over `text`, so a value that looks like a placeholder is never expanded again. */
function fill(text, params) {
    if (!params) return text;
    return text.replace(PLACEHOLDER, (match, name) => {
        const value = paramValue(params, name);
        return value === undefined ? match : String(value);
    });
}

/**
 * Translate `key` for the active language, falling back to Persian and then to the key itself.
 * `{name}` in the text is replaced by `params.name`; a placeholder with no value is left as it is.
 */
export function t(key, params) {
    const text = lookup(key);
    return text === undefined ? String(key) : fill(text, params);
}

/**
 * Write `value` in the digits of the active language (see NUMERALS). Anything else is turned into text
 * the way `String(value)` does, so a bad value shows up as "undefined" or "NaN" instead of throwing.
 */
export function formatNumber(value) {
    const text = String(value);
    const digits = hasOwn(NUMERALS, currentLang) ? DIGIT_SETS[NUMERALS[currentLang]] : null;
    return digits ? text.replace(/[0-9]/g, (d) => digits[d]) : text;
}

const pluralRulesByLang = new Map();

/** `one`, `other`, ... for `count` in the active language; `other` if Intl cannot tell. */
function pluralCategory(count) {
    try {
        if (!pluralRulesByLang.has(currentLang)) pluralRulesByLang.set(currentLang, new Intl.PluralRules(currentLang));
        return pluralRulesByLang.get(currentLang).select(Number(count));
    } catch (e) {
        return 'other';
    }
}

/** The plural text of `key` for `count`: `key.<category>` then `key.other`, in the active language then Persian. */
function lookupPlural(key, count) {
    return lookupFirst([`${key}.${pluralCategory(count)}`, `${key}.other`]);
}

/** `params` with `{count}` added: the caller's own `params.count` if there is one, else `formatNumber(count)`. */
function withCount(count, params) {
    const own = paramValue(params, 'count');
    return { ...params, count: own === undefined ? formatNumber(count) : own };
}

/**
 * Translate a text that depends on a number. The form is picked by `Intl.PluralRules` of the active
 * language (`key.one`, `key.other`, ...), falling back to `key.other`, then to Persian, then to the key.
 * `{count}` is filled with `formatNumber(count)` unless `params.count` is given (a caller that must keep
 * its own formatting passes it); every other placeholder comes from `params`.
 */
export function tn(key, count, params) {
    const text = lookupPlural(key, count);
    if (text === undefined) return String(key);
    return fill(text, withCount(count, params));
}

/**
 * "2 minutes and 9 seconds" / "45 seconds" in the active language. Negative, missing and fractional
 * values are clamped and rounded like the old `formatSecondsFa` did; anything that is not a finite
 * number counts as 0. Texts: `time.minutes.*` and `time.seconds.*` (plural), and
 * `time.minutesAndSeconds` (`{minutes}` `{seconds}`, so the language decides the order).
 */
export function formatDuration(totalSec) {
    const rounded = Math.round(Number(totalSec) || 0);
    const s = Number.isFinite(rounded) ? Math.max(0, rounded) : 0;
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    if (minutes === 0) return tn('time.seconds', seconds);
    return t('time.minutesAndSeconds', { minutes: tn('time.minutes', minutes), seconds: tn('time.seconds', seconds) });
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = (text) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

class RawHtml {
    constructor(html) {
        this.html = html;
    }
}

/** Mark `html` as trusted markup for `tHtml()` / `tnHtml()`: it is inserted as it is, not escaped. */
export function rawHtml(html) {
    return new RawHtml(String(html));
}

/**
 * Like `fill`, for an HTML string: the catalog text and every parameter are escaped, except a
 * `rawHtml()` one, which is inserted as it is. `{br}` is a line break unless `params.br` says otherwise.
 */
function fillHtml(text, params) {
    return escapeText(text).replace(PLACEHOLDER, (match, name) => {
        const value = paramValue(params, name);
        if (value === undefined) return name === 'br' ? '<br>' : match;
        return value instanceof RawHtml ? value.html : escapeText(String(value));
    });
}

/**
 * `t()` for text that goes into `innerHTML`. The result is safe HTML: the catalog text and the
 * parameters are escaped, and the only markup is what the caller passes as `rawHtml()` (a name already
 * wrapped in `<strong>`, say) plus `{br}`.
 */
export function tHtml(key, params) {
    const text = lookup(key);
    return text === undefined ? escapeText(String(key)) : fillHtml(text, params);
}

/** `tn()` for text that goes into `innerHTML`; see `tHtml()`. */
export function tnHtml(key, count, params) {
    const text = lookupPlural(key, count);
    if (text === undefined) return escapeText(String(key));
    return fillHtml(text, withCount(count, params));
}

/**
 * Join `items` into one list, one catalog template per step. Two items use `names.pair`; three or more
 * chain `names.list.separator` up to the last item, which is added with `names.list.last`. A template
 * gets `{a}` (the list so far) and `{b}` (the next item), so a language decides its own separator and
 * its own last word, and Persian (all three templates alike) reads exactly like the old chain of
 * `names.pair`. `fillStep(key, a, b)` fills one template: plain text for `formatList`, HTML for
 * `formatListHtml`. This is catalog-driven on purpose, not `Intl.ListFormat`.
 */
function joinList(items, fillStep) {
    const last = items.length - 1;
    if (last < 0) return '';
    if (last === 0) return items[0];
    if (last === 1) return fillStep('names.pair', items[0], items[1]);
    let joined = items[0];
    for (let i = 1; i < last; i++) joined = fillStep('names.list.separator', joined, items[i]);
    return fillStep('names.list.last', joined, items[last]);
}

/**
 * "A, B and C" in the active language (Persian: "A و B و C"; two items: `names.pair`; one item: itself;
 * none: ''). `items` are plain texts, put into the result as they are: wrap a name that can be in another
 * script with `isolate()` first, or quote it.
 */
export function formatList(items) {
    return joinList(Array.from(items || [], String), (key, a, b) => t(key, { a, b }));
}

/**
 * `formatList` for HTML. `items` are HTML strings that are already safe (a name wrapped in `<bdi>` after
 * escaping, say); they are inserted as they are and the catalog text is escaped. The result is safe HTML.
 */
export function formatListHtml(items) {
    const joined = joinList(Array.from(items || [], (item) => rawHtml(item)), (key, a, b) => rawHtml(tHtml(key, { a, b })));
    return joined instanceof RawHtml ? joined.html : joined;
}

/**
 * Write the text of `key` into `element` without `innerHTML`. Each `{name}` in the text is replaced by
 * `slots[name]`: a Node (a bold `<strong>` holding a player's name, say) is inserted, a string or a
 * number becomes text. A placeholder that has no slot takes `params[name]` as text, like `t()` would.
 * Everything else is text, so a name like `<img onerror=...>` can only ever be shown as text. A
 * placeholder with neither is left as it is; `{br}` is a line break unless a slot says otherwise. The
 * text is read in a single pass: a value that looks like a placeholder is never expanded again. A Node
 * used by two placeholders is cloned for the second one.
 */
export function setTemplate(element, key, slots, params) {
    const lookedUp = lookup(key);
    const text = lookedUp === undefined ? String(key) : lookedUp;
    const nodes = [];
    const used = new Set();
    let buffer = '';
    const flush = () => {
        if (buffer) nodes.push(document.createTextNode(buffer));
        buffer = '';
    };
    let last = 0;
    for (const match of text.matchAll(PLACEHOLDER)) {
        buffer += text.slice(last, match.index);
        last = match.index + match[0].length;
        const name = match[1];
        let slot = paramValue(slots, name);
        if (slot === undefined) slot = paramValue(params, name);
        if (slot === undefined && name === 'br') slot = document.createElement('br');
        if (slot === undefined) {
            buffer += match[0];
        } else if (typeof slot === 'object') {
            flush();
            nodes.push(used.has(slot) && typeof slot.cloneNode === 'function' ? slot.cloneNode(true) : slot);
            used.add(slot);
        } else {
            buffer += String(slot);
        }
    }
    buffer += text.slice(last);
    flush();
    element.replaceChildren(...nodes);
    return element;
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
