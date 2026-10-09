/**
 * The language switch on the welcome screen: two buttons, one per language (`.lang-btn`, each with its code in
 * `data-lang`). The click handlers live in `ui/bindings.js` and only dispatch `SET_LANG`; this file keeps the
 * buttons showing the language that is really active.
 */

import { getLang } from '../i18n/index.js';

/**
 * Mark the button of the active language as pressed (`aria-pressed="true"`, which is also what the CSS draws
 * as selected) and the others as not pressed. Call it at start-up and after every language change, whether it
 * came from a click or from restoring a saved match in the language it was started in.
 */
export function syncLangSwitch() {
    const active = getLang();
    for (const button of document.querySelectorAll('.lang-btn')) {
        button.setAttribute('aria-pressed', String(button.dataset.lang === active));
    }
}
