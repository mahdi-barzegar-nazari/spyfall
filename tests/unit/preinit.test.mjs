/**
 * First paint for a language other than Persian: js/preinit.js (a classic script in <head>), the CSS that keeps
 * the page hidden until the texts are translated, the CSS-only safety net, and `initI18n()` showing the page.
 *
 * preinit.js is run as it ships, in a bare sandbox (vm) with a fake `document` and `localStorage`. It cannot
 * import, so it repeats the direction table of `LANG_DIRECTIONS`; running it against every entry of
 * `SUPPORTED_LANGS` is what makes a language added in one place and not the other fail here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const preinit = readFileSync(`${ROOT}js/preinit.js`, 'utf8');
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const css = readFileSync(`${ROOT}css/style.css`, 'utf8');

const env = installFakeEnv();
const { DEFAULT_LANG, LANG_DIRECTIONS, LANG_STORAGE_KEY, PAGE_PENDING_CLASS, SUPPORTED_LANGS, initI18n } = await import('../../js/i18n/index.js');
after(() => env.uninstall());

/** Run preinit.js once, the way the browser would, and report what it did to <html>. */
function runPreinit({ saved = null, throwOnRead = false, noStorage = false } = {}) {
    const classes = new Set();
    const documentElement = {
        lang: 'fa',
        dir: 'rtl',
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) }
    };
    const sandbox = { document: { documentElement } };
    if (!noStorage) {
        sandbox.localStorage = {
            getItem: (key) => {
                if (throwOnRead) throw new Error('storage is blocked');
                return key === LANG_STORAGE_KEY ? saved : null;
            }
        };
    }
    const providedKeys = Object.keys(sandbox).sort();
    runInNewContext(preinit, sandbox);
    assert.deepEqual(Object.keys(sandbox).sort(), providedKeys, 'it defines no global');
    return { lang: documentElement.lang, dir: documentElement.dir, classes: [...classes] };
}

const UNTOUCHED = { lang: 'fa', dir: 'rtl', classes: [] };

describe('js/preinit.js', () => {
    it('for every supported language other than the default it writes lang and dir and sets the pending class', () => {
        const others = SUPPORTED_LANGS.filter((lang) => lang !== DEFAULT_LANG);
        assert.ok(others.length > 0);
        for (const lang of others) {
            assert.deepEqual(runPreinit({ saved: lang }), { lang, dir: LANG_DIRECTIONS[lang], classes: [PAGE_PENDING_CLASS] }, lang);
        }
    });

    it('does nothing for Persian, for no saved language, and for anything that is not a supported language', () => {
        for (const saved of [null, DEFAULT_LANG, 'de', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '', 'EN', ' en', 'en ', 'en-US']) {
            assert.deepEqual(runPreinit({ saved }), UNTOUCHED, JSON.stringify(saved));
        }
    });

    it('never throws and does nothing when localStorage throws or does not exist', () => {
        assert.deepEqual(runPreinit({ throwOnRead: true }), UNTOUCHED);
        assert.deepEqual(runPreinit({ noStorage: true }), UNTOUCHED);
    });

    it('uses the class name that the CSS and initI18n use', () => {
        assert.equal(PAGE_PENDING_CLASS, 'i18n-pending');
        assert.ok(preinit.includes(`'${PAGE_PENDING_CLASS}'`));
        assert.ok(css.includes(`html.${PAGE_PENDING_CLASS} body`));
    });
});

describe('index.html and css/style.css', () => {
    it('loads preinit.js from <head>, as a plain blocking script, after the CSP and before the stylesheet and the app', () => {
        const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
        const tags = head.match(/<script\b[^>]*>/g) ?? [];
        assert.deepEqual(tags, ['<script src="./js/preinit.js">'], 'one script in <head>, with no type, async or defer');
        assert.ok(head.indexOf('Content-Security-Policy') < head.indexOf('preinit.js'), 'after the policy that allows it');
        assert.ok(head.indexOf('preinit.js') < head.indexOf('rel="stylesheet"'), 'before the stylesheet, so it runs before the first paint');
        assert.ok(html.indexOf('preinit.js') < html.indexOf('js/main.js'));
    });

    it('still ships Persian and RTL, and no pending class, so the Persian path and a page with no JS are untouched', () => {
        assert.match(html, /<html lang="fa" dir="rtl">/);
        assert.ok(!html.includes(PAGE_PENDING_CLASS));
    });

    it('hides the page while the class is on, and the CSS alone shows it again after about one second', () => {
        const rule = css.match(/html\.i18n-pending body\s*\{([^}]*)\}/);
        assert.ok(rule, 'the hiding rule is missing');
        assert.match(rule[1], /visibility:\s*hidden/);
        const animation = rule[1].match(/animation:\s*([\w-]+)\s+0s\s+\S+\s+([\d.]+)s\s+forwards/);
        assert.ok(animation, 'the safety-net animation is missing (zero duration, a delay, fill forwards)');
        const delay = Number(animation[2]);
        assert.ok(delay >= 0.5 && delay <= 1.5, `the page must come back after about a second, not ${delay}s`);
        const keyframes = css.match(new RegExp(`@keyframes\\s+${animation[1]}\\s*\\{\\s*to\\s*\\{([^}]*)\\}`));
        assert.ok(keyframes, 'the keyframes named by the animation are missing');
        assert.match(keyframes[1], /visibility:\s*visible/);
    });
});

describe('initI18n shows the page', () => {
    /** A documentElement like the one the browser has when preinit.js ran: pending, in English. */
    function arrangeRoot(withClassList = true) {
        const classes = new Set([PAGE_PENDING_CLASS]);
        const root = { lang: 'en', dir: 'ltr' };
        if (withClassList) root.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) };
        document.documentElement = root;
        return { root, classes };
    }
    afterEach(() => {
        env.reset();
        delete document.documentElement;
        delete document.querySelectorAll;
        document.querySelectorAll = () => [];
    });

    it('removes the pending class after translating, for English and for Persian', () => {
        for (const saved of ['en', 'fa', null]) {
            env.reset();
            if (saved) env.storage.set(LANG_STORAGE_KEY, saved);
            const { classes } = arrangeRoot();
            initI18n();
            assert.equal(classes.has(PAGE_PENDING_CLASS), false, String(saved));
        }
    });

    it('removes it even when translating the static HTML throws', () => {
        env.storage.set(LANG_STORAGE_KEY, 'en');
        const { classes } = arrangeRoot();
        document.querySelectorAll = () => {
            throw new Error('boom');
        };
        assert.throws(() => initI18n(), /boom/);
        assert.equal(classes.has(PAGE_PENDING_CLASS), false, 'a hidden page would be worse than a half-translated one');
    });

    it('leaves a documentElement without a classList exactly as it was written', () => {
        env.storage.set(LANG_STORAGE_KEY, 'en');
        const { root } = arrangeRoot(false);
        initI18n();
        assert.deepEqual(root, { lang: 'en', dir: 'ltr' });
    });
});
