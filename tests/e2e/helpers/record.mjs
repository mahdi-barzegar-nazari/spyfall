import assert from 'node:assert/strict';
import { fa } from '../../../js/i18n/fa.js';

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
 * The setup screen keeps its options in four collapsible groups (`details.setup-group`) that start closed, and a closed
 * group is not rendered, so `innerText` would not list a single option in it. The recording therefore opens every group
 * while it reads (and puts each one back as it was; `openGroups: false` records the screen as it is) and leaves the
 * groups' own headers out (`summary.setup-group-summary`: the title, the \"N on\" badge and the chevron are the new
 * elements). The headers are taken out of the page for the moment of reading rather than matched by their text, so a
 * line of the screen that happens to read like a title is never lost. tests/e2e/setup-groups.test.mjs checks the
 * groups and their headers in both languages.
 *
 * The build line (`#build-info`, "v2.1.0 · 8f33eec" or "dev") is always left out: it is a number, not a text
 * a language owns, and it changes with every build, so it can never be part of a recording of the Persian text.
 * It is hidden by default (a long press on the welcome title shows it), so `innerText` normally does not see it
 * at all; the filter below stays for a recording taken while it is revealed.
 */

export async function recordScreen(page, { includeSwitch = false, openGroups = true } = {}) {
    return page.evaluate(({ withSwitch, withGroupsOpen }) => {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();

        // The setup groups: open while reading, their headers out of the page, both undone before returning.
        const groups = [...document.querySelectorAll('details.setup-group')];
        const wasOpen = groups.map((group) => group.open);
        const headers = [...document.querySelectorAll('summary.setup-group-summary')];
        const headerDisplay = headers.map((header) => header.style.display);
        if (withGroupsOpen) groups.forEach((group) => { group.open = true; });
        headers.forEach((header) => { header.style.display = 'none'; });

        try {
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
        } finally {
            headers.forEach((header, i) => { header.style.display = headerDisplay[i]; });
            groups.forEach((group, i) => { group.open = wasOpen[i]; });
        }
    }, { withSwitch: includeSwitch, withGroupsOpen: openGroups });
}

/** The one text attribute whose place in the page changed with the groups (see `assertSameAttrs`). */
const MOVED_ATTRIBUTE = 'input#setup-max-votes[placeholder]=';

/** The text attributes equal, in order, except for the place of the vote-limit box's placeholder (which must still occur as often). */
function assertSameAttrs(actual, baseline) {
    const without = (attrs) => attrs.filter((attr) => !attr.startsWith(MOVED_ATTRIBUTE));
    const only = (attrs) => attrs.filter((attr) => attr.startsWith(MOVED_ATTRIBUTE));
    assert.deepEqual(without(actual), without(baseline), 'text attributes, in order (apart from the vote-limit number box)');
    assert.deepEqual(only(actual), only(baseline), 'the placeholder of the vote-limit number box');
}

/**
 * Compare a recording of the Persian WELCOME screen with the one in fixtures/persian-baseline.json. A recording lists the
 * text attributes of the whole page, hidden screens included, in page order, so the welcome recording shows the vote-limit
 * placeholder at its new place; apart from that one entry everything is compared exactly, in order.
 */
export function assertWelcomeMatchesBaseline(actual, baseline) {
    for (const key of ['title', 'description', 'text', 'fields', 'selects']) assert.deepEqual(actual[key], baseline[key], key);
    assertSameAttrs(actual.attrs, baseline.attrs);
    assert.deepEqual(Object.keys(actual), Object.keys(baseline));
}

/**
 * Compare a recording of the Persian SETUP screen with the one in fixtures/persian-baseline.json, which is never
 * edited. The options moved into four groups, so the order of the lines BETWEEN the discussion timer and the player
 * names is no longer the order of the old flat list, and a plain `deepEqual` of the text would fail for that reason alone.
 * What this still demands, apart from that order:
 *  - the title, the description, the text fields and the select options are equal, in order;
 *  - the head of the text (everything up to the discussion timer and its limit line) and the tail (from the player
 *    names on) are equal, in order, so the five core fields keep their order exactly;
 *  - the lines in between are the same MULTISET (every baseline line present as often as before, nothing new);
 *  - the text attributes are equal in order too, apart from one entry: the placeholder of the emergency-vote number box
 *    (`input#setup-max-votes`) moved up in the page with its switch, and the recording lists the attributes of every
 *    screen in page order, so that one entry may be anywhere (it must still be there exactly as often as before).
 *    The other attribute values repeat (the help buttons all say the same), so nothing else could have moved unseen.
 * The groups' headers are not in a recording at all (see `recordScreen`), so a new line is a real difference.
 * The anchors are read from the Persian catalog and each must occur exactly once in both recordings.
 */
export function assertSetupMatchesBaseline(actual, baseline) {
    assert.equal(actual.title, baseline.title, 'title');
    assert.equal(actual.description, baseline.description, 'description');
    assert.deepEqual(actual.fields, baseline.fields, 'text fields');
    assert.deepEqual(actual.selects, baseline.selects, 'select options');
    assertSameAttrs(actual.attrs, baseline.attrs);

    const headEnd = (lines, which) => {
        const at = lines.filter((line) => line === fa['setup.timer.label']);
        assert.equal(at.length, 1, `${which}: the discussion timer label occurs once`);
        return lines.indexOf(fa['setup.timer.label']) + 2; // the label and the limit line under it
    };
    const tailStart = (lines, which) => {
        assert.equal(lines.filter((line) => line === fa['setup.names.label']).length, 1, `${which}: the player names label occurs once`);
        return lines.indexOf(fa['setup.names.label']);
    };
    const parts = (lines, which) => {
        const head = headEnd(lines, which);
        const tail = tailStart(lines, which);
        assert.ok(head < tail, `${which}: the options lie between the timer and the names`);
        return { head: lines.slice(0, head), middle: lines.slice(head, tail), tail: lines.slice(tail) };
    };
    const got = parts(actual.text, 'recording');
    const want = parts(baseline.text, 'baseline');
    assert.deepEqual(got.head, want.head, 'head of the text, in order (up to the discussion timer)');
    assert.deepEqual(got.tail, want.tail, 'tail of the text, in order (from the player names)');
    assert.ok(want.middle.length > 40, 'the baseline really has the options in between');
    assert.deepEqual([...got.middle].sort(), [...want.middle].sort(), 'the lines between the timer and the names (as a multiset)');
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
