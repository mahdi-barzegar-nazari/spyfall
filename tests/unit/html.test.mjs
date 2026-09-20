import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

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
