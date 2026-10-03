import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { INFO_KEYS } from '../../js/data/infoTexts.js';
import { fa } from '../../js/i18n/fa.js';

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

describe('index.html hygiene', () => {
    it('declares Persian language and RTL direction', () => {
        assert.match(html, /<html[^>]*\blang="fa"/);
        assert.match(html, /<html[^>]*\bdir="rtl"/);
    });
    it('has unique ids', () => {
        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        assert.deepEqual(dupes, []);
    });
    it('has no inline event handlers or inline scripts', () => {
        assert.doesNotMatch(html, /\son[a-z]+="/);
        assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    });
    it('has no inline style attributes (use the utility classes in css/style.css)', () => {
        assert.doesNotMatch(html, /\sstyle="/);
    });
    it('every <label for> points at an existing id', () => {
        const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
        const missing = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]).filter((id) => !ids.has(id));
        assert.deepEqual(missing, []);
    });
    it('every aria-labelledby / aria-describedby target exists', () => {
        const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
        const refs = [...html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
        assert.deepEqual(refs.filter((id) => !ids.has(id)), []);
    });
    it('every button declares a type', () => {
        const untyped = [...html.matchAll(/<button(?![^>]*\btype=)[^>]*>/g)].map((m) => m[0]);
        assert.deepEqual(untyped, []);
    });
    it('loads the app as a single ES module', () => {
        assert.match(html, /<script type="module" src="\.\/js\/main\.js"><\/script>/);
    });
    it('external links opened in a new tab use rel="noopener"', () => {
        const bad = [...html.matchAll(/<a[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]).filter((t) => !/noopener/.test(t));
        assert.deepEqual(bad, []);
    });
});

describe('setup toggles and help texts', () => {
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    /** The <div class="toggle-item"> that holds the checkbox with this id. */
    const toggleItem = (checkboxId) => {
        const items = html.split('<div class="toggle-item">').slice(1);
        return items.map((chunk) => chunk.split('</label>')[0]).find((chunk) => chunk.includes(`id="${checkboxId}"`));
    };

    it('every data-info button points at a help text listed in INFO_KEYS', () => {
        const keys = [...html.matchAll(/data-info="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(keys.length > 0);
        assert.deepEqual(keys.filter((key) => !INFO_KEYS.includes(key)), []);
    });
    it('every INFO_KEYS entry has a title and a text in the Persian catalog', () => {
        for (const key of INFO_KEYS) {
            const title = fa[`info.${key}.title`];
            const text = fa[`info.${key}.text`];
            assert.ok(title && title.trim(), `${key} has no title`);
            assert.ok(text && text.trim(), `${key} has no text`);
        }
    });
    it('has the spy\'s last-chance toggle, on by default, labelled and explained', () => {
        const item = toggleItem('toggle-last-chance');
        assert.ok(item, '#toggle-last-chance is missing');
        assert.match(item, /<input type="checkbox" id="toggle-last-chance" checked /);
        const labelId = item.match(/id="toggle-last-chance"[^>]*aria-labelledby="([^"]+)"/)[1];
        assert.ok(ids.has(labelId), `aria-labelledby points at a missing id: ${labelId}`);
        assert.ok(item.includes(`id="${labelId}"`), 'the label is in the same toggle row');
        const infoKey = item.match(/data-info="([^"]+)"/)[1];
        assert.equal(infoKey, 'spyLastChance');
        assert.ok(fa[`info.${infoKey}.title`] && fa[`info.${infoKey}.text`]);
    });
    it('the guess screen buttons do not promise any points (the amount depends on the word)', () => {
        for (const id of ['btn-guess-correct', 'btn-guess-wrong', 'btn-guess-pass']) {
            const label = html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))[1];
            assert.ok(label.trim().length > 0, id);
            assert.doesNotMatch(label, /[0-9۰-۹٠-٩]/, `${id}: ${label}`);
        }
    });
});

describe('manifest.json', () => {
    it('lists icons that exist, including a maskable one', () => {
        for (const icon of manifest.icons) assert.ok(existsSync(new URL(icon.src, root)), icon.src);
        assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
    });
    it('is standalone RTL Persian', () => {
        assert.equal(manifest.display, 'standalone');
        assert.equal(manifest.lang, 'fa');
        assert.equal(manifest.dir, 'rtl');
    });
});
