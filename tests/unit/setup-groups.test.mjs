/**
 * The four collapsible groups of the setup screen, checked without a browser (the same things are checked in a real
 * browser by tests/e2e/setup-groups.test.mjs):
 *  - index.html: four real `<details>` with a `<summary>`, closed at first, the five core fields outside them, every
 *    control exactly once and inside the group it is meant to be in (the table in tests/e2e/helpers/setupGroups.mjs),
 *    with the ids, labels and help buttons it had before, the vote-limit box right under its switch, the defaults unchanged;
 *  - the catalogs: a title per group and the badge text, in both languages;
 *  - js/ui/setupGroups.js: the table that says what each badge counts agrees with the markup, `countOn` counts by the
 *    rule written there, and the badges are written in the language of the page, with its digits;
 *  - `pulseInvalidField` opens the groups around a field before it focuses it;
 *  - the Persian baseline comparison for the setup screen is order-free only where it has to be (record.mjs).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { CORE_CHIP_NAMES, CORE_FIELDS, GROUP_IDS, GROUP_OF_CONTROL, HINT_CHIPS_GROUP } from '../e2e/helpers/setupGroups.mjs';
import { assertSetupMatchesBaseline, assertWelcomeMatchesBaseline } from '../e2e/helpers/record.mjs';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { closest, elements, normalizeText, parseHtml } from './helpers/htmlScan.mjs';

const env = installFakeEnv();
const { SETUP_GROUPS, countOn, refreshSetupGroupBadges } = await import('../../js/ui/setupGroups.js');
const { pulseInvalidField } = await import('../../js/ui/feedback.js');
const { getLang, setLang } = await import('../../js/i18n/index.js');
after(() => env.uninstall());
afterEach(() => {
    setLang('fa');
    env.reset();
});

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const all = [...elements(parseHtml(html))];
const byId = (id) => all.find((el) => el.attrs.id === id);
const withId = (id) => all.filter((el) => el.attrs.id === id);
const classes = (el) => (el.attrs.class || '').split(/\s+/).filter(Boolean);
const elementChildren = (el) => el.children.filter((c) => c.type === 'el');
const inside = (el, root) => closest(el, (n) => n === root) !== null;

const screen = byId('screen-setup');
const groupsRoot = byId('setup-groups');
const core = byId('setup-core');
const groupEl = (id) => byId(`setup-group-${id}`);
/** The group (`roles`, ...) whose `<details>` holds `el`, or null. */
const groupOf = (el) => {
    const details = closest(el, (n) => n.tag === 'details' && classes(n).includes('setup-group'));
    return details ? details.attrs.id.replace('setup-group-', '') : null;
};

const GROUP_TITLE_KEYS = { roles: 'setup.group.roles', discussion: 'setup.group.discussion', stakes: 'setup.group.stakes', speed: 'setup.group.speed' };

/** Label id, label key and help key of each switch, as they were before the groups. */
const SWITCHES = {
    'toggle-detective': ['lbl-detective', 'setup.toggle.detective', 'detective'],
    'toggle-known': ['lbl-known', 'setup.toggle.known', 'knownSpies'],
    'toggle-fool': ['lbl-fool', 'setup.toggle.fool', 'fool'],
    'toggle-director': ['lbl-director', 'setup.toggle.director', 'director'],
    'toggle-oneword': ['lbl-oneword', 'setup.toggle.oneword', 'oneword'],
    'toggle-quests': ['lbl-quests', 'setup.toggle.quests', 'quests'],
    'toggle-limit': ['lbl-limit', 'setup.toggle.limit', 'voteLimit'],
    'toggle-wager': ['lbl-wager', 'setup.toggle.wager', 'wager'],
    'toggle-sudden': ['lbl-sudden', 'setup.toggle.sudden', 'sudden'],
    'toggle-last-chance': ['lbl-last-chance', 'setup.toggle.lastChance', 'spyLastChance'],
    'toggle-role-reveal-confirm': ['lbl-role-reveal-confirm', 'setup.toggle.roleRevealConfirm', 'roleRevealConfirm'],
    'toggle-vote-confirm': ['lbl-vote-confirm', 'setup.toggle.voteConfirm', 'voteConfirm'],
    'toggle-quick-voting': ['lbl-quick-voting', 'setup.toggle.quickVoting', 'quickVoting']
};

describe('the groups in index.html', () => {
    it('the table in the tests is complete: 13 switches and the card-reveal select are the 14 controls', () => {
        const switches = Object.keys(GROUP_OF_CONTROL).filter((id) => id.startsWith('toggle-'));
        assert.equal(switches.length, 13);
        assert.deepEqual([...switches].sort(), Object.keys(SWITCHES).sort());
        assert.equal(Object.keys(GROUP_OF_CONTROL).filter((id) => id === 'setup-reveal-mode').length, 1);
    });

    it('there are four real <details>, in order, closed at first, each opening with a <summary>', () => {
        assert.ok(groupsRoot && screen && inside(groupsRoot, screen));
        const details = elementChildren(groupsRoot);
        assert.deepEqual(details.map((el) => el.tag), ['details', 'details', 'details', 'details']);
        assert.deepEqual(details.map((el) => el.attrs.id), GROUP_IDS.map((id) => `setup-group-${id}`));
        for (const el of details) {
            assert.ok(classes(el).includes('setup-group'), el.attrs.id);
            assert.ok(!('open' in el.attrs), `${el.attrs.id} must start closed`);
            const [first, second, ...rest] = elementChildren(el);
            assert.equal(first.tag, 'summary', `${el.attrs.id}: the header is a <summary>, which the browser makes keyboard-operable`);
            assert.ok(classes(first).includes('setup-group-summary'));
            assert.ok(classes(second).includes('setup-group-body'), `${el.attrs.id}: the options follow the header`);
            assert.deepEqual(rest, [], `${el.attrs.id}: nothing else`);
        }
        assert.equal(all.filter((el) => el.tag === 'details').length, 4, 'and no other <details> in the page');
    });

    it('each header has the title (translated), the badge (written by code) and a decorative chevron', () => {
        for (const id of GROUP_IDS) {
            const summary = elementChildren(groupEl(id))[0];
            const [title, badge, chevron, ...rest] = elementChildren(summary);
            assert.deepEqual(rest, []);
            assert.equal(title.attrs['data-i18n'], GROUP_TITLE_KEYS[id]);
            assert.ok(classes(title).includes('setup-group-title'));
            assert.equal(normalizeText(title.children.map((c) => c.value ?? '').join('')), fa[GROUP_TITLE_KEYS[id]]);
            assert.equal(badge.attrs.id, `setup-group-${id}-badge`);
            assert.ok(classes(badge).includes('setup-group-badge'));
            assert.equal(badge.children.length, 0, 'the badge is empty in the HTML; code writes it');
            assert.ok(!('data-i18n' in badge.attrs), 'it is written by code, so the static translator must not touch it');
            assert.equal(chevron.attrs['aria-hidden'], 'true');
            assert.ok(classes(chevron).includes('setup-group-chevron'));
        }
    });

    it('every control exists exactly once and sits in the group it is meant to be in', () => {
        for (const [id, group] of Object.entries(GROUP_OF_CONTROL)) {
            assert.equal(withId(id).length, 1, `#${id} occurs once`);
            assert.equal(groupOf(withId(id)[0]), group, `#${id} is in the ${group} group`);
        }
        const chips = all.filter((el) => el.tag === 'input' && el.attrs.name === 'setup-hint');
        assert.deepEqual(chips.map((el) => el.attrs.value), ['related_word', 'category', 'first_letter', 'none']);
        for (const chip of chips) assert.equal(groupOf(chip), HINT_CHIPS_GROUP, `hint chip ${chip.attrs.value}`);
        assert.equal(groupOf(byId('hint-chips-container')), HINT_CHIPS_GROUP);
        assert.equal(groupOf(all.find((el) => el.attrs['data-info'] === 'hintTypes')), HINT_CHIPS_GROUP, 'the hint chips keep their info button');
        assert.ok(all.some((el) => el.attrs.class === 'hint-note' && groupOf(el) === HINT_CHIPS_GROUP), 'and their note');
    });

    it('each group holds exactly its controls and nothing else that can be set', () => {
        for (const group of GROUP_IDS) {
            const fields = elements(groupEl(group));
            const found = [...fields].filter((el) => ['input', 'select', 'textarea'].includes(el.tag)).map((el) => el.attrs.id || `name:${el.attrs.name}`);
            const expected = Object.entries(GROUP_OF_CONTROL).filter(([, g]) => g === group).map(([id]) => id);
            if (group === HINT_CHIPS_GROUP) expected.push(...Array(4).fill('name:setup-hint'));
            assert.deepEqual(found.sort(), expected.sort(), group);
        }
    });

    it('the always-visible block is exactly the five core fields, in their old order, outside every group', () => {
        assert.ok(core && inside(core, screen));
        assert.equal(groupOf(core), null);
        assert.ok(!elements(core).some((el) => el.tag === 'details' || el.tag === 'summary'));
        const found = [...elements(core)].filter((el) => ['input', 'select', 'textarea'].includes(el.tag)).map((el) => el.attrs.id || `name:${el.attrs.name}`);
        const unique = found.filter((key, i) => found.indexOf(key) === i);
        assert.deepEqual(unique, [CORE_FIELDS[0], CORE_FIELDS[1], ...CORE_CHIP_NAMES.map((name) => `name:${name}`), CORE_FIELDS[2]]);
        assert.equal(found.filter((key) => key === 'name:setup-cat').length, 10);
        assert.equal(found.filter((key) => key === 'name:setup-diff').length, 3);
        // Nothing the groups hold leaked up into the core block.
        for (const id of Object.keys(GROUP_OF_CONTROL)) assert.ok(!inside(withId(id)[0], core), id);
    });

    it('the screen is: title, core block, the groups, the player names, start, back; the last three unchanged', () => {
        const parts = elementChildren(screen).map((el) => `${el.tag}${el.attrs.id ? '#' + el.attrs.id : ''}`);
        assert.deepEqual(parts, ['h2', 'div#setup-core', 'div#setup-groups', 'fieldset#names-section-container', 'button#btn-start-match', 'button#btn-back-welcome-2']);
        assert.ok(inside(byId('name-inputs-container'), byId('names-section-container')));
        assert.ok(inside(byId('btn-reset-names'), byId('names-section-container')));
    });

    it('every switch keeps its id, its label (aria-labelledby, text key) and its help button', () => {
        for (const [id, [labelId, labelKey, infoKey]] of Object.entries(SWITCHES)) {
            const input = byId(id);
            assert.equal(input.attrs.type, 'checkbox');
            assert.equal(input.attrs['aria-labelledby'], labelId, `${id}: aria-labelledby`);
            const item = closest(input, (n) => classes(n).includes('toggle-item'));
            assert.ok(item, `${id} is in a toggle row`);
            const label = byId(labelId);
            assert.ok(inside(label, item), `${id}: its label is in the same row`);
            assert.equal(label.attrs['data-i18n'], labelKey);
            const info = [...elements(item)].filter((el) => 'data-info' in el.attrs);
            assert.deepEqual(info.map((el) => el.attrs['data-info']), [infoKey], `${id}: help button`);
            assert.equal(info[0].attrs['data-i18n-attr'], 'aria-label:a11y.infoButton');
        }
    });

    it('the card-reveal select keeps its id, label and options', () => {
        const select = byId('setup-reveal-mode');
        assert.equal(select.tag, 'select');
        const label = all.find((el) => el.tag === 'label' && el.attrs.for === 'setup-reveal-mode');
        assert.equal(label.attrs['data-i18n'], 'setup.reveal.label');
        assert.equal(groupOf(label), 'speed');
        assert.deepEqual(elementChildren(select).map((o) => [o.attrs.value, o.attrs['data-i18n']]), [['click', 'setup.reveal.click'], ['hold', 'setup.reveal.hold']]);
    });

    it('the vote-limit number box is the very next element after its switch row, in the same grid, and hidden at first', () => {
        const row = closest(byId('toggle-limit'), (n) => classes(n).includes('toggle-item'));
        const siblings = elementChildren(row.parent);
        const next = siblings[siblings.indexOf(row) + 1];
        assert.equal(next, byId('vote-limit-box'), 'directly under its switch');
        assert.ok(classes(next).includes('hidden'), 'hidden until the switch is on');
        assert.ok(inside(byId('setup-max-votes'), next));
        assert.equal(groupOf(next), 'discussion');
        assert.equal(siblings.filter((el) => el.attrs.id === 'vote-limit-box').length, 1);
    });

    it('the defaults are unchanged: three on, everything else off, the select on tap', () => {
        const on = all.filter((el) => el.tag === 'input' && 'checked' in el.attrs).map((el) => el.attrs.id || `${el.attrs.name}=${el.attrs.value}`);
        assert.deepEqual(on.sort(), [
            'setup-cat=animals', 'setup-cat=concepts', 'setup-cat=events', 'setup-cat=foods', 'setup-cat=jobs', 'setup-cat=objects', 'setup-cat=places', 'setup-cat=sports', 'setup-cat=vehicles',
            'setup-diff=easy', 'setup-diff=hard', 'setup-diff=medium',
            'setup-hint=related_word',
            'toggle-last-chance', 'toggle-role-reveal-confirm'
        ].sort());
        assert.equal(byId('setup-max-votes').attrs.value, '2');
        assert.ok(!elementChildren(byId('setup-reveal-mode')).some((o) => 'selected' in o.attrs));
    });
});

describe('the catalogs', () => {
    it('every group has a title and the badge has a text, in both languages', () => {
        for (const [lang, catalog] of Object.entries({ fa, en })) {
            for (const key of [...Object.values(GROUP_TITLE_KEYS), 'setup.group.badge']) assert.ok(catalog[key]?.trim(), `${lang}: ${key}`);
            assert.deepEqual(catalog['setup.group.badge'].match(/\{(\w+)\}/g), ['{n}'], `${lang}: the badge takes the number as {n}`);
        }
    });

    it('the titles and the badge read as the design says', () => {
        assert.deepEqual(Object.values(GROUP_TITLE_KEYS).map((key) => fa[key]), ['نقش\u200cها', 'گفتگو', 'ریسک و پایان', 'سرعت و تأیید']);
        assert.deepEqual(Object.values(GROUP_TITLE_KEYS).map((key) => en[key]), ['Roles', 'Discussion', 'Stakes and ending', 'Speed and confirmations']);
        assert.equal(fa['setup.group.badge'].replace('{n}', '۲'), '۲ فعال');
        assert.equal(en['setup.group.badge'].replace('{n}', '2'), '2 on');
    });
});

/** A probe over plain data, in place of the real form. */
function probeOf({ on = [], chips = {}, selects = {} }) {
    return {
        switchOn: (id) => on.includes(id),
        chipsOn: (name) => chips[name] ?? 0,
        selectIs: (id, value) => selects[id] === value
    };
}
const group = (id) => SETUP_GROUPS.find((g) => g.id === id);

describe('what each badge counts (js/ui/setupGroups.js)', () => {
    it('the groups are in screen order', () => {
        assert.deepEqual(SETUP_GROUPS.map((g) => g.id), GROUP_IDS);
    });

    it('the table agrees with the markup: each counted control is in its own group, and every control but the number box is counted', () => {
        const counted = {};
        for (const g of SETUP_GROUPS) {
            for (const control of g.controls) {
                const key = control.chips ? `chips:${control.chips}` : control.select || control.id;
                assert.equal(counted[key], undefined, `${key} is counted once`);
                counted[key] = g.id;
            }
        }
        const expected = { ...GROUP_OF_CONTROL, 'chips:setup-hint': HINT_CHIPS_GROUP };
        delete expected['setup-max-votes'];
        assert.deepEqual(counted, expected);
    });

    it('a ticked switch counts one, an unticked one nothing, in every group', () => {
        for (const g of SETUP_GROUPS) {
            assert.equal(countOn(g, probeOf({})), 0, `${g.id}: nothing on`);
            for (const control of g.controls) {
                if (control.chips || control.select) continue;
                assert.equal(countOn(g, probeOf({ on: [control.id] })), 1, `${g.id}: ${control.id}`);
            }
        }
    });

    it('each ticked hint chip counts one; the card-reveal select counts one on "hold" and nothing on "click"', () => {
        assert.equal(countOn(group('roles'), probeOf({ chips: { 'setup-hint': 1 } })), 1);
        assert.equal(countOn(group('roles'), probeOf({ chips: { 'setup-hint': 3 }, on: ['toggle-fool'] })), 4);
        assert.equal(countOn(group('speed'), probeOf({ selects: { 'setup-reveal-mode': 'hold' } })), 1);
        assert.equal(countOn(group('speed'), probeOf({ selects: { 'setup-reveal-mode': 'click' } })), 0);
        assert.equal(countOn(group('speed'), probeOf({ selects: { 'setup-reveal-mode': 'hold' }, on: ['toggle-quick-voting', 'toggle-vote-confirm', 'toggle-role-reveal-confirm'] })), 4);
    });

    it('a switch of another group does not count', () => {
        assert.equal(countOn(group('stakes'), probeOf({ on: ['toggle-fool', 'toggle-director', 'toggle-quick-voting'] })), 0);
        assert.equal(countOn(group('discussion'), probeOf({ on: ['toggle-wager'] })), 0);
    });
});

/** Put the whole form in the fake page: every control an element, the hint chips and the select stubbed the way the code asks. */
function fakeForm({ on = [], hintChips = 1, reveal = 'click' } = {}) {
    for (const g of SETUP_GROUPS) {
        env.el(`setup-group-${g.id}-badge`);
        for (const control of g.controls) {
            if (control.id) Object.assign(env.el(control.id), { checked: on.includes(control.id) });
            if (control.select) Object.assign(env.el(control.select), { value: reveal });
        }
    }
    env.stubQuery('input[name="setup-hint"]:checked', Array.from({ length: hintChips }, () => env.input('x')));
}
const badge = (id) => env.el(`setup-group-${id}-badge`);

describe('refreshSetupGroupBadges', () => {
    it('writes every badge in Persian digits and wording, and the number it stands for', () => {
        fakeForm({ on: ['toggle-fool', 'toggle-detective', 'toggle-wager'], hintChips: 2, reveal: 'hold' });
        refreshSetupGroupBadges();
        assert.deepEqual(GROUP_IDS.map((id) => badge(id).textContent), ['۴ فعال', '۰ فعال', '۱ فعال', '۱ فعال']);
        assert.deepEqual(GROUP_IDS.map((id) => badge(id).dataset.count), ['4', '0', '1', '1']);
    });

    it('writes them in English, with Latin digits, after the language changes, and back', () => {
        fakeForm({ on: ['toggle-last-chance', 'toggle-limit', 'toggle-quests'] });
        refreshSetupGroupBadges();
        setLang('en');
        assert.equal(getLang(), 'en');
        refreshSetupGroupBadges();
        assert.deepEqual(GROUP_IDS.map((id) => badge(id).textContent), ['1 on', '2 on', '1 on', '0 on']);
        setLang('fa');
        refreshSetupGroupBadges();
        assert.deepEqual(GROUP_IDS.map((id) => badge(id).textContent), ['۱ فعال', '۲ فعال', '۱ فعال', '۰ فعال']);
    });

    it('follows the form: a switch turned on adds one to its own badge only', () => {
        fakeForm({ on: ['toggle-last-chance', 'toggle-role-reveal-confirm'] }); // the defaults
        refreshSetupGroupBadges();
        const before = GROUP_IDS.map((id) => badge(id).dataset.count);
        assert.deepEqual(before, ['1', '0', '1', '1'], 'at the defaults: the related-word hint, the last chance, the role-reveal confirmation');
        for (const [id, groupId] of Object.entries(GROUP_OF_CONTROL)) {
            if (!id.startsWith('toggle-') || env.el(id).checked) continue;
            env.el(id).checked = true;
            refreshSetupGroupBadges();
            const now = GROUP_IDS.map((g) => badge(g).dataset.count);
            const expected = before.map((n, i) => (GROUP_IDS[i] === groupId ? String(Number(n) + 1) : n));
            assert.deepEqual(now, expected, id);
            env.el(id).checked = false;
            refreshSetupGroupBadges();
            assert.deepEqual(GROUP_IDS.map((g) => badge(g).dataset.count), before, `${id} off again`);
        }
    });

    it('does not fail when a badge is missing from the page', () => {
        fakeForm();
        env.reset();
        assert.doesNotThrow(() => refreshSetupGroupBadges());
    });
});

/** A stand-in for a field inside `<details>` elements: just what `pulseInvalidField` touches. */
function fieldInside(...detailsList) {
    const calls = [];
    const classList = new Set();
    // Outermost last: details[0] is the closest.
    const link = (details, i) => Object.assign(details, { parentElement: detailsList[i + 1] ? { closest: () => detailsList[i + 1] } : null });
    detailsList.forEach(link);
    const el = {
        calls,
        offsetWidth: 0,
        attributes: {},
        classList: { add: (n) => classList.add(n), remove: (n) => classList.delete(n), contains: (n) => classList.has(n) },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        closest: (selector) => (selector === 'details' ? detailsList[0] || null : null),
        focus: () => calls.push(['focus', detailsList.map((d) => d.open)]),
        scrollIntoView: () => calls.push(['scroll', detailsList.map((d) => d.open)])
    };
    return el;
}

describe('pulseInvalidField opens the group first', () => {
    it('opens a closed group before it focuses and scrolls to the field', () => {
        env.installTimers();
        const details = { open: false };
        const el = fieldInside(details);
        pulseInvalidField(el);
        assert.equal(details.open, true);
        assert.deepEqual(el.calls, [['focus', [true]], ['scroll', [true]]], 'it was already open when the field was focused');
        assert.equal(el.attributes['aria-invalid'], 'true');
    });

    it('opens every <details> around the field, and leaves an open one open', () => {
        env.installTimers();
        const inner = { open: false };
        const outer = { open: true };
        pulseInvalidField(fieldInside(inner, outer));
        assert.deepEqual([inner.open, outer.open], [true, true]);
    });

    it('a field outside any <details> works as before, and nothing at all does not throw', () => {
        env.installTimers();
        const el = fieldInside();
        pulseInvalidField(el);
        assert.deepEqual(el.calls.map(([name]) => name), ['focus', 'scroll']);
        assert.doesNotThrow(() => pulseInvalidField(null));
    });
});

describe('the Persian baseline comparison of the setup screen (tests/e2e/helpers/record.mjs)', () => {
    const baseline = JSON.parse(readFileSync(`${ROOT}tests/e2e/fixtures/persian-baseline.json`, 'utf8')).setup;
    const clone = () => structuredClone(baseline);
    const bounds = (text) => [text.indexOf(fa['setup.timer.label']) + 2, text.indexOf(fa['setup.names.label'])];

    it('accepts the baseline itself, and the same options in another order', () => {
        assertSetupMatchesBaseline(clone(), baseline);
        const moved = clone();
        const [from, to] = bounds(moved.text);
        const middle = moved.text.slice(from, to);
        moved.text.splice(from, to - from, ...middle.slice(10), ...middle.slice(0, 10));
        const at = moved.attrs.findIndex((attr) => attr.startsWith('input#setup-max-votes[placeholder]='));
        assert.ok(at > 0, 'the baseline has the vote-limit placeholder');
        moved.attrs.push(...moved.attrs.splice(at, 1));
        assertSetupMatchesBaseline(moved, baseline);
    });

    it('rejects a line that is missing, a line that is new, and a line that repeats', () => {
        const [from, to] = bounds(baseline.text);
        const missing = clone();
        missing.text.splice(from + 3, 1);
        assert.throws(() => assertSetupMatchesBaseline(missing, baseline), /multiset/);
        const extra = clone();
        extra.text.splice(from + 3, 0, fa['setup.group.roles']);
        assert.throws(() => assertSetupMatchesBaseline(extra, baseline), /multiset/);
        const doubled = clone();
        doubled.text.splice(to, 0, doubled.text[from + 2]);
        assert.throws(() => assertSetupMatchesBaseline(doubled, baseline), /multiset/);
    });

    it('still holds the head (the five core fields) and the tail (names, start, back) to their order', () => {
        const swappedHead = clone();
        const at = swappedHead.text.indexOf(fa['setup.players.label']);
        [swappedHead.text[at], swappedHead.text[at + 2]] = [swappedHead.text[at + 2], swappedHead.text[at]];
        assert.throws(() => assertSetupMatchesBaseline(swappedHead, baseline), /head/);
        const swappedTail = clone();
        const last = swappedTail.text.length - 1;
        [swappedTail.text[last], swappedTail.text[last - 1]] = [swappedTail.text[last - 1], swappedTail.text[last]];
        assert.throws(() => assertSetupMatchesBaseline(swappedTail, baseline), /tail/);
    });

    it('still compares the fields, the selects, the title and a changed attribute exactly', () => {
        const fields = clone();
        fields.fields[3] = 'setup-max-votes#3=3';
        assert.throws(() => assertSetupMatchesBaseline(fields, baseline), /text fields/);
        const selects = clone();
        selects.selects.reverse();
        assert.throws(() => assertSetupMatchesBaseline(selects, baseline), /select options/);
        const title = clone();
        title.title += 'x';
        assert.throws(() => assertSetupMatchesBaseline(title, baseline), /title/);
        const attrs = clone();
        attrs.attrs[0] += 'x';
        assert.throws(() => assertSetupMatchesBaseline(attrs, baseline), /text attributes/);
    });

    it('the text attributes are held to their order, except the vote-limit placeholder, which must still be there once', () => {
        const reversed = clone();
        reversed.attrs.reverse();
        assert.throws(() => assertSetupMatchesBaseline(reversed, baseline), /text attributes|placeholder/);
        const swapped = clone();
        assert.notEqual(swapped.attrs[0], swapped.attrs[1]);
        [swapped.attrs[0], swapped.attrs[1]] = [swapped.attrs[1], swapped.attrs[0]];
        assert.throws(() => assertSetupMatchesBaseline(swapped, baseline), /text attributes/);
        const gone = clone();
        gone.attrs = gone.attrs.filter((attr) => !attr.startsWith('input#setup-max-votes[placeholder]='));
        assert.throws(() => assertSetupMatchesBaseline(gone, baseline), /placeholder/);
    });

    it('the welcome recording: exact, apart from the place of the same one attribute', () => {
        const welcome = JSON.parse(readFileSync(`${ROOT}tests/e2e/fixtures/persian-baseline.json`, 'utf8')).welcome;
        assertWelcomeMatchesBaseline(structuredClone(welcome), welcome);
        const moved = structuredClone(welcome);
        const at = moved.attrs.findIndex((attr) => attr.startsWith('input#setup-max-votes[placeholder]='));
        assert.ok(at > 0);
        moved.attrs.splice(2, 0, ...moved.attrs.splice(at, 1));
        assertWelcomeMatchesBaseline(moved, welcome);
        const text = structuredClone(welcome);
        text.text.push('x');
        assert.throws(() => assertWelcomeMatchesBaseline(text, welcome), /text/);
        const attrs = structuredClone(welcome);
        attrs.attrs[0] += 'x';
        assert.throws(() => assertWelcomeMatchesBaseline(attrs, welcome), /text attributes/);
    });
});
