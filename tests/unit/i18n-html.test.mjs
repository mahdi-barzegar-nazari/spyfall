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
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { CATALOGS } from '../../js/i18n/catalogs.js';
import { fa } from '../../js/i18n/fa.js';
import { closest, elements, innerText, normalizeText, parseHtml } from './helpers/htmlScan.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const all = [...elements(parseHtml(html))];

const LETTER = /[\u0600-\u06FF]|[A-Za-z]/;
const TEXT_ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
const ATTR_NAMES = new Set([...TEXT_ATTRS, 'content']);

/**
 * Elements whose Persian text is written by JS every time it matters (the default in index.html is only
 * a placeholder), so they carry no data-i18n yet. They belong to the JS-side translation step.
 */
const JS_WRITTEN = new Set([
    'handoff-action', // ui/handoff.js
    'reveal-instruction-text', // ui/render.js
    'votes-remaining-badge', // ui/render.js
    'vote-instruction-text', // ui/render.js
    'btn-submit-wagers', // ui/render.js
    'result-title', // game/resolution.js
    'info-modal-title', // core/dispatch.js, from t()
    'modal-player-name', // ui/render.js
    'modal-role-badge', // ui/render.js
    'modal-secret-title', // ui/render.js
    'confirm-modal-title', // app/actions.js, ui/bindings.js
    'elim-name', // ui/wheel.js
    'elim-badge', // ui/wheel.js
    'tie-announce-names' // ui/wheel.js
]);

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
const jsSources = listJs(join(ROOT, 'js')).map((file) => readFileSync(file, 'utf8'));

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
                    const covered = 'data-i18n' in el.attrs || closest(el, (n) => JS_WRITTEN.has(n.attrs.id));
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

    it('the JS_WRITTEN allow-list is current: each id exists, has no data-i18n and is used by JS', () => {
        for (const id of JS_WRITTEN) {
            const el = all.find((e) => e.attrs.id === id);
            assert.ok(el, `#${id} is not in index.html any more`);
            assert.ok(!('data-i18n' in el.attrs), `#${id} has data-i18n, so it should leave JS_WRITTEN`);
            assert.ok(jsSources.some((source) => source.includes(`'${id}'`)), `no JS under js/ mentions #${id}`);
        }
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

    it('has no orphan key: each one is used by index.html, a help button or a t() call under js/', () => {
        const used = new Set();
        for (const el of all) {
            if (el.attrs['data-i18n']) used.add(el.attrs['data-i18n']);
            for (const { key } of attrPairs(el)) used.add(key);
        }
        for (const key of INFO_KEYS) used.add(`info.${key}.title`).add(`info.${key}.text`);
        for (const source of jsSources) for (const m of source.matchAll(/\bt\(\s*(['"`])([^'"`$]+)\1/g)) used.add(m[2]);
        for (const [lang, catalog] of Object.entries(CATALOGS)) {
            assert.deepEqual(Object.keys(catalog).filter((key) => !used.has(key)), [], `${lang}: unused keys`);
        }
    });

    it('the "all categories" button states the real size of the word bank, rounded down to a hundred', () => {
        const total = Object.values(WORD_PACKS).reduce((sum, list) => sum + list.length, 0);
        assert.ok(total > 0);
        assert.ok(fa['setup.categories.all'].includes(`+${Math.floor(total / 100) * 100} `), `${total} words, label: ${fa['setup.categories.all']}`);
    });
});
