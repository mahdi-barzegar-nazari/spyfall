/**
 * Registry of every translation catalog, keyed by language code.
 *
 * `i18n/index.js` looks texts up here, and the unit tests walk it to check that all catalogs agree.
 * Adding a language means adding its file next to `fa.js`, listing it here, and adding its code to
 * `SUPPORTED_LANGS` (and its direction to `LANG_DIRECTIONS`) in `i18n/index.js`.
 */

import { fa } from './fa.js';
import { en } from './en.js';

export const CATALOGS = { fa, en };
