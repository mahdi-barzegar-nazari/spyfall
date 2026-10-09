/**
 * Keeps index.html and the translation catalogs from drifting apart. Static checks only (regex-free
 * tokenizer in helpers/htmlScan.mjs, no DOM): the Persian text written in index.html is the default
 * that shows before any JS runs, and the Persian catalog is the source `t()` and the translator use
 * afterwards, so the two must say the same thing.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INFO_KEYS } from '../../js/data/infoTexts.js';
import { getWordPacks } from '../../js/data/banks.js';
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { CATALOGS } from '../../js/i18n/catalogs.js';
import { fa } from '../../js/i18n/fa.js';
import { SUPPORTED_LANGS } from '../../js/i18n/index.js';
import { assertLabelMatchesBank } from './helpers/bankLabel.mjs';
import { closest, elements, innerText, normalizeText, parseHtml } from './helpers/htmlScan.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const all = [...elements(parseHtml(html))];

const LETTER = /[\u0600-\u06FF]|[A-Za-z]/;
const TEXT_ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
const ATTR_NAMES = new Set([...TEXT_ATTRS, 'content']);

/**
 * Elements whose text JS writes every time it matters, so the Persian in index.html is only a
 * placeholder and they carry no data-i18n. For each one: the catalog keys JS writes into it (`keys`;
 * empty when it only ever shows a player's name) and, when the HTML default is meant to be one of
 * those texts, which one (`same`, with the placeholder values it is filled with).
 *
 * The test below checks that every key exists, that JS refers to each of them, that JS writes to the
 * element, and that a default marked `same` equals the catalog text.
 */
const JS_WRITTEN = {
    'handoff-action': { keys: ['handoff.reveal.action.hold', 'handoff.reveal.action.tap', 'handoff.vote.action', 'handoff.wager.action'] }, // ui/handoff.js, text from ui/render.js
    'reveal-instruction-text': { keys: ['reveal.instruction.immediate', 'reveal.instruction.hold', 'reveal.instruction.tap'] }, // ui/render.js
    'votes-remaining-badge': { keys: ['timer.votes.unlimited', 'timer.votes.remaining'], same: { key: 'timer.votes.unlimited' } }, // ui/render.js
    'vote-instruction-text': { keys: ['vote.instruction'] }, // ui/render.js
    'btn-submit-wagers': { keys: ['wager.submit.final', 'wager.submit.next'] }, // ui/render.js
    'result-title': { keys: ['result.title.spy', 'result.title.citizen'] }, // game/resolution.js
    'info-modal-title': { keys: INFO_KEYS.map((key) => `info.${key}.title`) }, // core/dispatch.js
    'modal-player-name': { keys: [] }, // ui/render.js: the player's name
    'modal-role-badge': { keys: ['role.spectator.badge', 'role.spy.badge', 'role.citizen.badge', 'role.detective.badge'] }, // ui/render.js
    'modal-secret-title': { keys: ['role.spectator.title', 'role.hintTitle.word'] }, // ui/render.js, plus the stored hint titles
    'confirm-modal-title': { keys: ['confirm.endMatch.title', 'confirm.restore.title', 'confirm.discard.title'] }, // app/actions.js, ui/bindings.js
    'elim-name': { keys: ['elim.removed'] }, // ui/wheel.js
    'elim-badge': { keys: ['elim.badge.spy', 'elim.badge.citizen'] }, // ui/wheel.js
    'tie-announce-names': { keys: ['tie.announce'] }, // ui/wheel.js
    'cust-count-label': { keys: ['words.registered'], same: { key: 'words.registered', params: { count: '0' } } } // ui/customWords.js
};

/**
 * Text that is deliberately NOT translated: the names of the two languages on the switch, each written in its
 * own language so a person who cannot read the current one can still find his own. They carry no data-i18n and
 * no catalog key; instead each button states its language with `lang` (checked below), so screen readers and
 * fonts treat it right. Nothing else may join this list without a reason written next to it.
 */
const FIXED_TEXT = {
    'btn-lang-fa': { lang: 'fa', label: 'فارسی' },
    'btn-lang-en': { lang: 'en', label: 'English' }
};
function attrPairs(el) {
    return (el.attrs['data-i18n-attr'] || '')
        .split(';')
        .filter((pair) => pair.trim())
        .map((pair) => {
            const colon = pair.indexOf(':');
            return { attr: pair.slice(0, colon).trim(), key: pair.slice(colon + 1).trim() };
        });
}

function listJs(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listJs(full) : full.endsWith('.js') ? [full] : [];
    });
}
const groups = new Set(Object.keys(fa).map((key) => key.split('.')[0]));
// Every file under js/ except the Persian catalog itself (its keys are not uses).
const jsFiles = listJs(join(ROOT, 'js')).filter((file) => file !== join(ROOT, 'js', 'i18n', 'fa.js'));
const jsSources = jsFiles.map((file) => readFileSync(file, 'utf8'));

/** A catalog key written as a string literal: dotted identifiers, e.g. 'setup.cat.places'. */
const KEY_LITERAL = /(['"`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)\1/g;
/** `time.seconds.one` and `time.seconds.other` are one text with two forms; code asks for `time.seconds`. */
const baseKey = (key) => key.replace(/\.(zero|one|two|few|many|other)$/, '');
const keyMentions = (source) => new Set([...source.matchAll(KEY_LITERAL)].map((m) => m[2]));
/** The first argument of every call to a translation function that starts with a string literal. */
function calledKeys(source) {
    const calls = [];
    for (const m of source.matchAll(/\b(t|tHtml)\(\s*(['"`])([^'"`$]+)\2/g)) calls.push({ fn: m[1], key: m[3] });
    for (const m of source.matchAll(/\b(tn|tnHtml)\(\s*(['"`])([^'"`$]+)\2/g)) calls.push({ fn: m[1], key: m[3] });
    for (const m of source.matchAll(/\bsetTemplate\(\s*[^,()]+,\s*(['"`])([^'"`$]+)\1/g)) calls.push({ fn: 'setTemplate', key: m[2] });
    return calls;
}

describe('static texts in index.html', () => {
    const textEls = all.filter((el) => 'data-i18n' in el.attrs);
    const attrEls = all.filter((el) => 'data-i18n-attr' in el.attrs);

    it('is actually being read (guards against a scanner that silently finds nothing)', () => {
        assert.ok(textEls.length > 100, `only ${textEls.length} data-i18n elements`);
        assert.ok(attrEls.length > 10, `only ${attrEls.length} data-i18n-attr elements`);
    });

    it('every data-i18n and data-i18n-attr key exists in the Persian catalog', () => {
        const keys = [...textEls.map((el) => el.attrs['data-i18n']), ...attrEls.flatMap((el) => attrPairs(el).map((p) => p.key))];
        assert.deepEqual(keys.filter((key) => !(key in fa)), []);
    });

    it('data-i18n sits only on leaf elements, because it replaces the whole textContent', () => {
        assert.deepEqual(
            textEls.filter((el) => el.children.some((c) => c.type === 'el')).map((el) => `<${el.tag}> ${el.attrs['data-i18n']}`),
            []
        );
    });

    it('data-i18n-attr pairs are well formed, name a known attribute and point at an attribute that exists', () => {
        for (const el of attrEls) {
            const pairs = attrPairs(el);
            assert.ok(pairs.length > 0, `<${el.tag}> has an empty data-i18n-attr`);
            for (const { attr, key } of pairs) {
                assert.ok(ATTR_NAMES.has(attr), `unknown attribute "${attr}" in ${key}`);
                assert.ok(key, `empty key for ${attr}`);
                assert.ok(attr in el.attrs, `<${el.tag}> has no ${attr} default for ${key}`);
            }
        }
    });

    it('the Persian default written in index.html equals the Persian catalog value', () => {
        const mismatches = [];
        for (const el of textEls) {
            const key = el.attrs['data-i18n'];
            if (normalizeText(innerText(el)) !== normalizeText(fa[key] ?? '')) mismatches.push(`${key}: html "${normalizeText(innerText(el))}" vs catalog "${fa[key]}"`);
        }
        for (const el of attrEls) {
            for (const { attr, key } of attrPairs(el)) {
                if (normalizeText(el.attrs[attr] ?? '') !== normalizeText(fa[key] ?? '')) mismatches.push(`${key}: html ${attr} "${el.attrs[attr]}" vs catalog "${fa[key]}"`);
            }
        }
        assert.deepEqual(mismatches, []);
    });

    it('every visible text with letters is translatable or knowingly written by JS', () => {
        const offenders = [];
        const visit = (el) => {
            for (const child of el.children) {
                if (child.type === 'el') {
                    visit(child);
                } else if (!child.raw && LETTER.test(child.value)) {
                    const covered = 'data-i18n' in el.attrs || el.attrs.id in FIXED_TEXT || closest(el, (n) => n.attrs.id in JS_WRITTEN);
                    if (!covered) offenders.push(`<${el.tag}${el.attrs.id ? '#' + el.attrs.id : ''}> ${normalizeText(child.value)}`);
                }
            }
        };
        visit({ children: [...all.filter((el) => el.parent.tag === '#root')], attrs: {} });
        assert.deepEqual(offenders, []);
    });

    it('every aria-label, placeholder, title and alt with letters is translatable', () => {
        const offenders = [];
        for (const el of all) {
            const covered = new Set(attrPairs(el).map((p) => p.attr));
            for (const attr of TEXT_ATTRS) {
                if (el.attrs[attr] && LETTER.test(el.attrs[attr]) && !covered.has(attr)) offenders.push(`<${el.tag}${el.attrs.id ? '#' + el.attrs.id : ''}> ${attr}="${el.attrs[attr]}"`);
            }
        }
        assert.deepEqual(offenders, []);
    });

    it('every JS-written element takes its text from the catalog: keys exist, JS uses them and writes to the element', () => {
        for (const [id, { keys, same }] of Object.entries(JS_WRITTEN)) {
            const el = all.find((e) => e.attrs.id === id);
            assert.ok(el, `#${id} is not in index.html any more`);
            assert.ok(!('data-i18n' in el.attrs), `#${id} has data-i18n, so it should leave JS_WRITTEN`);
            assert.ok(jsSources.some((source) => source.includes(`'${id}'`)), `no JS under js/ mentions #${id}`);
            for (const key of keys) {
                assert.ok(key in fa, `#${id}: ${key} is not in the catalog`);
                assert.ok(jsSources.some((source) => keyMentions(source).has(baseKey(key))) || key.startsWith('info.'), `#${id}: no JS refers to ${key}`);
            }
            if (same) {
                const expected = fa[same.key].replace(/\{(\w+)\}/g, (m, name) => same.params?.[name] ?? m);
                assert.equal(normalizeText(innerText(el)), normalizeText(expected), `#${id}: the HTML default differs from ${same.key}`);
            }
        }
    });

    it('the language switch has one button per supported language, each in its own language and never translated', () => {
        const buttons = all.filter((el) => el.tag === 'button' && 'data-lang' in el.attrs);
        assert.deepEqual(buttons.map((el) => el.attrs['data-lang']), SUPPORTED_LANGS, 'one button per language, in the order of SUPPORTED_LANGS');
        for (const el of buttons) {
            const fixed = FIXED_TEXT[el.attrs.id];
            assert.ok(fixed, `#${el.attrs.id} is not listed in FIXED_TEXT`);
            assert.equal(el.attrs.lang, fixed.lang, `#${el.attrs.id} must carry lang="${fixed.lang}"`);
            assert.equal(el.attrs['data-lang'], fixed.lang);
            assert.equal(normalizeText(innerText(el)), fixed.label);
            assert.ok(!('data-i18n' in el.attrs) && !('data-i18n-attr' in el.attrs), `#${el.attrs.id} must not be translated`);
            assert.ok(el.attrs.class.split(/\s+/).includes('lang-btn'), `#${el.attrs.id} needs the lang-btn class`);
            assert.ok(el.attrs['aria-pressed'] === 'true' || el.attrs['aria-pressed'] === 'false', `#${el.attrs.id} needs aria-pressed`);
        }
        assert.deepEqual(Object.keys(FIXED_TEXT).sort(), buttons.map((el) => el.attrs.id).sort(), 'FIXED_TEXT lists exactly the switch buttons');
        // The page is Persian before any JS runs, so only the Persian button starts pressed.
        assert.deepEqual(buttons.map((el) => el.attrs['aria-pressed']), SUPPORTED_LANGS.map((lang) => String(lang === 'fa')));
    });

    it('the switch sits in a dir="ltr" wrapper on the welcome screen only and has an accessible name from the catalog', () => {
        const group = all.find((el) => el.attrs.role === 'group' && el.children.some((c) => c.type === 'el' && 'data-lang' in c.attrs));
        assert.ok(group, 'the role="group" around the buttons is missing');
        assert.deepEqual(attrPairs(group), [{ attr: 'aria-label', key: 'welcome.lang.aria' }]);
        assert.equal(closest(group.parent, (n) => n.attrs.dir === 'ltr')?.attrs.dir, 'ltr', 'the buttons must keep their visual order in both directions');
        assert.equal(closest(group, (n) => n.attrs.id === 'screen-welcome')?.attrs.id, 'screen-welcome', 'the switch belongs on the welcome screen');
        assert.equal(closest(group, (n) => n.tag === 'header'), null, 'not in the header, which is on every screen');
    });

    it('translates the document title and the meta description too', () => {
        const title = all.find((el) => el.tag === 'title');
        assert.equal(title.attrs['data-i18n'], 'meta.title');
        const meta = all.find((el) => el.tag === 'meta' && el.attrs.name === 'description');
        assert.deepEqual(attrPairs(meta), [{ attr: 'content', key: 'meta.description' }]);
    });
});

describe('help texts', () => {
    const buttonKeys = all.filter((el) => 'data-info' in el.attrs).map((el) => el.attrs['data-info']);

    it('every data-info button is in INFO_KEYS and every INFO_KEYS entry has a button', () => {
        assert.deepEqual(buttonKeys.filter((key) => !INFO_KEYS.includes(key)), []);
        assert.deepEqual(INFO_KEYS.filter((key) => !buttonKeys.includes(key)), []);
    });

    it('every help text has a title and a text, and the catalog has no stray info.* entry', () => {
        for (const key of INFO_KEYS) {
            assert.ok(fa[`info.${key}.title`]?.trim(), `${key}: no title`);
            assert.ok(fa[`info.${key}.text`]?.trim(), `${key}: no text`);
        }
        const expected = new Set(INFO_KEYS.flatMap((key) => [`info.${key}.title`, `info.${key}.text`]));
        assert.deepEqual(Object.keys(fa).filter((key) => key.startsWith('info.') && !expected.has(key)), []);
    });
});

describe('translation catalogs', () => {
    const placeholders = (text) => [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort();

    it('every registered catalog has exactly the keys of the Persian one, with the same placeholders', () => {
        assert.ok('fa' in CATALOGS);
        const expected = Object.keys(fa).sort();
        for (const [lang, catalog] of Object.entries(CATALOGS)) {
            assert.deepEqual(Object.keys(catalog).sort(), expected, `${lang}: keys differ from fa`);
            for (const key of expected) assert.deepEqual(placeholders(catalog[key]), placeholders(fa[key]), `${lang}: placeholders of ${key}`);
        }
    });

    it('keys are stable dotted identifiers and values are non-empty plain text', () => {
        for (const [lang, catalog] of Object.entries(CATALOGS)) {
            for (const [key, value] of Object.entries(catalog)) {
                assert.match(key, /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/, `${lang}: bad key ${key}`);
                assert.equal(typeof value, 'string', `${lang}: ${key} is not a string`);
                assert.ok(value.trim(), `${lang}: ${key} is empty`);
                assert.doesNotMatch(value, /<[a-zA-Z!/]/, `${lang}: ${key} contains HTML`);
            }
        }
    });

    it('has no orphan key: each one is used by index.html, a help button or the code under js/', () => {
        const used = new Set();
        for (const el of all) {
            if (el.attrs['data-i18n']) used.add(el.attrs['data-i18n']);
            for (const { key } of attrPairs(el)) used.add(key);
        }
        for (const key of INFO_KEYS) used.add(`info.${key}.title`).add(`info.${key}.text`);
        // A key written as a literal anywhere in the code (t('x'), a ternary of two keys, a table of keys)
        // counts as used; for a plural text, so does its base name.
        for (const source of jsSources) for (const literal of keyMentions(source)) used.add(literal);
        const orphans = (catalog) => Object.keys(catalog).filter((key) => !used.has(key) && !used.has(baseKey(key)));
        for (const [lang, catalog] of Object.entries(CATALOGS)) assert.deepEqual(orphans(catalog), [], `${lang}: unused keys`);
    });

    it('every key the code asks for exists in the Persian catalog (plural texts through their .other form)', () => {
        const missing = [];
        let checked = 0;
        jsFiles.forEach((file, index) => {
            const source = jsSources[index];
            for (const { fn, key } of calledKeys(source)) {
                checked++;
                const plural = fn === 'tn' || fn === 'tnHtml';
                if (!(plural ? `${key}.other` in fa : key in fa)) missing.push(`${file}: ${fn}('${key}')`);
            }
            // A ternary or a table of keys: any literal that starts like a catalog group must be a real key.
            for (const literal of keyMentions(source)) {
                if (groups.has(literal.split('.')[0]) && !(literal in fa) && !(`${literal}.other` in fa) && !literal.startsWith('info.')) missing.push(`${file}: '${literal}'`);
            }
        });
        assert.ok(checked > 80, `only ${checked} translation calls were found; the scan may be broken`);
        assert.deepEqual(missing, []);
    });

    it('every plural text has a .other form, and in Persian every form reads the same', () => {
        const forms = /\.(zero|one|two|few|many)$/;
        const lone = [];
        for (const [lang, catalog] of Object.entries(CATALOGS)) {
            for (const key of Object.keys(catalog)) {
                if (forms.test(key) && !(`${baseKey(key)}.other` in catalog)) lone.push(`${lang}: ${key} has no .other`);
            }
        }
        assert.deepEqual(lone, []);
        const plurals = Object.keys(fa).filter((key) => key.endsWith('.one'));
        assert.ok(plurals.length >= 8, `only ${plurals.length} plural texts`);
        for (const key of plurals) assert.equal(fa[key], fa[`${baseKey(key)}.other`], `${baseKey(key)}: Persian has one form`);
    });

    it('catalog values hold no markup, and a placeholder is a plain {name}', () => {
        for (const [key, value] of Object.entries(fa)) {
            assert.doesNotMatch(value, /<\/?[a-zA-Z!]/, `${key}: HTML tag in a catalog value`);
            assert.doesNotMatch(value, /&(#\d+|#x[\da-f]+|[a-z]+);/i, `${key}: HTML entity in a catalog value`);
            for (const m of value.matchAll(/\{([^}]*)\}/g)) assert.match(m[1], /^[A-Za-z_][A-Za-z0-9_]*$/, `${key}: odd placeholder {${m[1]}}`);
        }
    });

    it('the Persian "all categories" button states the real size of the Persian word bank, rounded down to a hundred', () => {
        assertLabelMatchesBank(fa['setup.categories.all'], getWordPacks('fa'));
        assert.equal(getWordPacks('fa'), WORD_PACKS);
    });
});
