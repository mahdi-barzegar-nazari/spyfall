/**
 * First paint for a language other than the default. A CLASSIC script (not a module), loaded from <head> before
 * the stylesheet, so it runs before the browser paints anything.
 *
 * `index.html` is Persian and the module graph (`main.js` and what it imports) takes a moment to arrive, so
 * without this a person who chose English would first see the whole page in Persian, right to left. When the
 * saved language (`spy_lang`) is a supported one other than Persian, this script
 *   - writes `<html lang dir>` for it, so the very first layout already has the right direction, and
 *   - puts the class `i18n-pending` on `<html>`; `css/style.css` keeps the page hidden while it is there, and
 *     `initI18n()` (`i18n/index.js`) removes it as soon as the static texts are translated.
 * The CSS also reveals the page by itself after about one second (an animation, no JS involved), so a script
 * that fails to load or to run can never leave a blank page.
 *
 * Persian, no saved language, an unsupported value and a browser where `localStorage` throws or is missing do
 * nothing here: the page is shown exactly as it always was.
 *
 * It cannot import, so the table below repeats `LANG_DIRECTIONS` (and the class name repeats
 * `PAGE_PENDING_CLASS`) from `i18n/index.js`; tests/unit/preinit.test.mjs runs this very file against
 * `SUPPORTED_LANGS` and `LANG_DIRECTIONS`, so a language added to one place and not the other fails there.
 */
(function () {
    try {
        const DEFAULT_LANG = 'fa';
        const DIRECTIONS = { fa: 'rtl', en: 'ltr' };
        const lang = localStorage.getItem('spy_lang');
        if (typeof lang === 'string' && lang !== DEFAULT_LANG && Object.prototype.hasOwnProperty.call(DIRECTIONS, lang)) {
            const root = document.documentElement;
            root.lang = lang;
            root.dir = DIRECTIONS[lang];
            root.classList.add('i18n-pending');
        }
    } catch (e) {}
})();
