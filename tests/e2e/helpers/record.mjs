/**
 * Writes down what a person can read on the screen that is showing, so two moments can be compared: the
 * visible text, the text attributes (aria-label, placeholder, title), the values of the text fields, the
 * options of every select, the page title and the meta description.
 *
 * The language switch is left out unless `includeSwitch` is true: the Persian text of the other screens is
 * compared with a recording made before the switch existed, and the switch is the one thing that is new.
 */

export async function recordScreen(page, { includeSwitch = false } = {}) {
    return page.evaluate((withSwitch) => {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const outside = (el) => withSwitch || !el.closest('.lang-switch-wrap');
        const labels = withSwitch ? [] : [...document.querySelectorAll('.lang-btn')].map((b) => norm(b.textContent));
        const main = document.getElementById('main-content-root');

        const text = main.innerText
            .split('\n')
            .map(norm)
            .filter((line) => line && !labels.includes(line));

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
