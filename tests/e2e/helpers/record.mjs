/**
 * Writes down what a person can read on the screen that is showing, so two moments can be compared: the
 * visible text, the text attributes (aria-label, placeholder, title), the values of the text fields, the
 * options of every select, the page title and the meta description.
 *
 * The language switch is left out unless `includeSwitch` is true: the Persian text of the other screens is
 * compared with a recording made before the switch existed, and the switch is the one thing that is new.
 *
 * The install hint (`.install-hint`: one line on how to install from the browser's menu and its close button) is
 * always left out too. It is shown only on iPhone, iPad and Firefox for Android, never on the Chromium of these
 * tests, but its close button's `aria-label` is in the page whether or not it is shown, and the Persian text
 * of the other screens is compared with a recording made before the hint existed.
 *
 * The welcome screen's "How to play" button (`#btn-how-to-play`) is always left out too: the Persian text of the other
 * screens is compared with a recording made before the button existed, and its label (not the help text it opens,
 * which is a modal that `recordModal` records on request) is the one thing that is new. It is left out in English as
 * well; tests/e2e/how-to-play.test.mjs checks the button and its texts in both languages.
 *
 * The discussion screen's "Question idea" block (`#question-idea`: the button `#btn-question-idea` and the suggested question
 * in `#question-idea-text`) is always left out too, in the text, the text attributes and the lines: the Persian text of the
 * screens is compared with a recording made before the button existed, and the suggested question is a text that changes with
 * every press. It is left out in English as well; tests/e2e/question-idea.test.mjs checks the button and the questions in both
 * languages.
 *
 * The build line (`#build-info`, "v2.1.0 · 8f33eec" or "dev") is always left out: it is a number, not a text
 * a language owns, and it changes with every build, so it can never be part of a recording of the Persian text.
 * It is hidden by default (a long press on the welcome title shows it), so `innerText` normally does not see it
 * at all; the filter below stays for a recording taken while it is revealed.
 */

export async function recordScreen(page, { includeSwitch = false } = {}) {
    return page.evaluate((withSwitch) => {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const outside = (el) => !el.closest('.install-hint') && !el.closest('#btn-how-to-play') && !el.closest('#question-idea') && (withSwitch || !el.closest('.lang-switch-wrap'));
        const labels = withSwitch ? [] : [...document.querySelectorAll('.lang-btn')].map((b) => norm(b.textContent));
        const hintLines = [...document.querySelectorAll('.install-hint span, .install-hint button')].map((el) => norm(el.textContent));
        const buildLine = norm(document.getElementById('build-info')?.textContent ?? '');
        const howToLine = norm(document.getElementById('btn-how-to-play')?.textContent ?? '');
        const ideaLines = ['btn-question-idea', 'question-idea-text'].map((id) => norm(document.getElementById(id)?.textContent ?? ''));
        const main = document.getElementById('main-content-root');

        const text = main.innerText
            .split('\n')
            .map(norm)
            .filter((line) => line && !labels.includes(line) && !hintLines.includes(line) && line !== buildLine && line !== howToLine && !ideaLines.includes(line));

        const attrs = [];
        for (const el of document.querySelectorAll('[aria-label], [placeholder], [title]')) {
            if (!outside(el)) continue;
            for (const name of ['aria-label', 'placeholder', 'title']) {
                if (el.hasAttribute(name)) attrs.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${name}]=${norm(el.getAttribute(name))}`);
            }
        }

        const fields = [...main.querySelectorAll('input[type="text"]')].map((el, i) => `${el.id || 'input'}#${i}=${el.value}`);
        const selects = [...main.querySelectorAll('select')].map((el) => `${el.id}: ${[...el.options].map((o) => norm(o.textContent)).join(' | ')}`);
        const meta = document.querySelector('meta[name="description"]');

        return { title: document.title, description: meta ? meta.getAttribute('content') : null, text, attrs, fields, selects };
    }, includeSwitch);
}

/** Text and text attributes of one modal (`selector`), the same way. */
export async function recordModal(page, selector) {
    return page.evaluate((sel) => {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const root = document.querySelector(sel);
        const text = root.innerText
            .split('\n')
            .map(norm)
            .filter(Boolean);
        const attrs = [];
        for (const el of root.querySelectorAll('[aria-label], [placeholder], [title]')) {
            for (const name of ['aria-label', 'placeholder', 'title']) {
                if (el.hasAttribute(name)) attrs.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${name}]=${norm(el.getAttribute(name))}`);
            }
        }
        return { text, attrs };
    }, selector);
}

/** A Persian or Arabic letter (the Arabic-script blocks), which no English screen may show. */
export const PERSIAN_LETTER = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Every string of a recording (or a plain list of strings) that holds a Persian letter. */
export function persianIn(recording) {
    const strings = Array.isArray(recording) ? recording : Object.values(recording).flat();
    return strings.filter((s) => typeof s === 'string' && PERSIAN_LETTER.test(s));
}
