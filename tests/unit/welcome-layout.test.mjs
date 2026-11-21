/**
 * The welcome screen's layout decisions that no behaviour test covers: the main action stays the one thing to
 * tap, and the "custom words" button is a quiet text button (css/style.css: .btn-quiet) rather than a second big one.
 * index.html and the stylesheet are read as text.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { elements, parseHtml } from './helpers/htmlScan.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const css = readFileSync(`${ROOT}css/style.css`, 'utf8');
const page = [...elements(parseHtml(html))];
const byId = (id) => page.find((el) => el.attrs.id === id);
const classes = (el) => (el.attrs.class || '').split(/\s+/).filter(Boolean);
const positionOf = (id) => page.indexOf(byId(id));
const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `${selector} has a rule`);
    return css.slice(start, css.indexOf('}', start));
};

describe('the custom words button of the welcome screen', () => {
    it('is a quiet button: the class .btn-quiet, and not the boxed .btn-ghost', () => {
        const words = byId('btn-open-words');
        assert.equal(words.tag, 'button');
        assert.equal(words.attrs.type, 'button');
        assert.ok(classes(words).includes('btn-quiet'));
        assert.ok(!classes(words).includes('btn-ghost'));
        assert.equal(words.attrs['data-i18n'], 'welcome.words');
    });

    it('stays where it was in the document, after the pills and before the language switch (the order of the texts is compared with the baseline)', () => {
        assert.ok(positionOf('btn-nav-setup') < positionOf('btn-how-to-play'));
        assert.ok(positionOf('btn-quick-start') < positionOf('btn-open-words'));
        assert.ok(positionOf('btn-open-words') < positionOf('btn-lang-fa'));
    });

    it('has no box, no shadow and a small underlined label, centred and no wider than its text', () => {
        const block = rule('.btn-quiet');
        assert.match(block, /background: none;/);
        assert.match(block, /border: none;/);
        assert.match(block, /box-shadow: none;/);
        assert.match(block, /width: fit-content;/);
        assert.match(block, /margin: 6px auto 0;/);
        assert.match(block, /text-decoration: underline;/);
        assert.match(block, /color: var\(--text-secondary\);/);
        const size = /font-size: ([\d.]+)rem;/.exec(block);
        assert.ok(size && Number(size[1]) <= 0.8, 'a small label');
    });

    it('is still a real target for a finger: at least 44px high', () => {
        const height = /min-height: (\d+)px;/.exec(rule('.btn-quiet'));
        assert.ok(height && Number(height[1]) >= 44);
    });

    it('lights up on hover like the other buttons do, without a box', () => {
        const block = rule('.btn-quiet:hover');
        assert.match(block, /color: var\(--text-primary\);/);
        assert.match(block, /background: none;/);
    });
});

describe('the main action of the welcome screen', () => {
    it('is still the first button of the page, and still the only one that is not a small pill or a quiet button', () => {
        const welcome = page.find((el) => el.attrs.id === 'screen-welcome');
        // (The close button of the install hint, a banner above the screen's content, is not an action of the screen.)
        const buttons = [...elements(welcome)].filter((el) => el.tag === 'button' && !classes(el).includes('install-hint-close'));
        const main = buttons.filter((el) => !classes(el).some((c) => ['btn-sm', 'btn-quiet', 'how-to-play-btn', 'lang-btn'].includes(c)));
        assert.deepEqual(main.map((el) => el.attrs.id), ['btn-nav-setup']);
        assert.equal(buttons[0].attrs.id, 'btn-nav-setup');
    });
});
