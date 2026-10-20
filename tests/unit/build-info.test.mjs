/**
 * The build line on the welcome screen (`ui/buildInfo.js`, fed by `core/buildInfo.js`): what it says for a
 * built site and for a source checkout, that it is written as plain text, and that its markup in index.html is
 * the small, language-neutral element the design asks for. The stamping itself (scripts/build.mjs) is covered
 * by build-stamp.test.mjs; the real element in a real browser, in every theme, by tests/e2e/build-info.test.mjs.
 *
 * The display tests run on the fake browser of helpers/fakeEnv.mjs. No version number is written here: the
 * expected text is built from the version in package.json.
 *
 * The line is hidden by default and a long press on the welcome title reveals it: the controller and the wiring
 * are covered by build-info-reveal.test.mjs; here only the markup that the design relies on (the `hidden` class,
 * the title's id) is pinned.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { closest, elements, innerText, parseHtml } from './helpers/htmlScan.mjs';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(new URL(file, `file://${ROOT}`), 'utf8');
const pkg = JSON.parse(read('package.json'));

const env = installFakeEnv();
const { formatBuildInfo, renderBuildInfo, SHORT_HASH_LENGTH } = await import('../../js/ui/buildInfo.js');
const { APP_VERSION, BUILD_HASH } = await import('../../js/core/buildInfo.js');
after(() => env.uninstall());

/** What a stamped build looks like: the package version and a 12-character hash, as build.mjs writes them. */
const BUILT_HASH = '8f33eec41a0b';
const SEP = ' · ';

describe('formatBuildInfo', () => {
    it('shows v<version> and the first 7 characters of the hash for a built site', () => {
        assert.equal(SHORT_HASH_LENGTH, 7);
        assert.equal(formatBuildInfo(pkg.version, BUILT_HASH), `v${pkg.version}${SEP}8f33eec`);
        assert.equal(formatBuildInfo('12.34.56', 'abcdef0123456789'), `v12.34.56${SEP}abcdef0`, 'the version is printed as given, the hash is cut to 7');
    });

    it('uses a middle dot with a space on each side, and nothing else around the text', () => {
        const text = formatBuildInfo(pkg.version, BUILT_HASH);
        assert.ok(text.startsWith('v'), 'starts with v');
        assert.ok(text.includes(' · '), 'U+00B7 between two spaces');
        assert.equal(text, text.trim());
        assert.doesNotMatch(text, /[؀-ۿ]/, 'no Persian letter: it is language-neutral');
    });

    it('shows just "dev" while the placeholders are untouched (the same test as DEV in sw.js)', () => {
        assert.equal(formatBuildInfo('__APP_VERSION__', '__BUILD_HASH__'), 'dev');
        assert.equal(formatBuildInfo(pkg.version, '__BUILD_HASH__'), 'dev', 'an unstamped hash is enough');
        assert.equal(formatBuildInfo('__APP_VERSION__', BUILT_HASH), 'dev', 'so is an unstamped version');
    });

    it('shows "dev" rather than "vundefined" when a value is missing', () => {
        assert.equal(formatBuildInfo(undefined, undefined), 'dev');
        assert.equal(formatBuildInfo(pkg.version, undefined), 'dev');
        assert.equal(formatBuildInfo(null, BUILT_HASH), 'dev');
    });

    it('this source checkout still holds the placeholders, so the real module says "dev"', () => {
        const source = read('js/core/buildInfo.js');
        // build.mjs looks for exactly these two statements; if they change, the build fails.
        assert.ok(source.includes("export const APP_VERSION = '__APP_VERSION__';"));
        assert.ok(source.includes("export const BUILD_HASH = '__BUILD_HASH__';"));
        assert.equal(APP_VERSION, '__APP_VERSION__');
        assert.equal(BUILD_HASH, '__BUILD_HASH__');
        assert.equal(formatBuildInfo(), 'dev');
    });
});

describe('renderBuildInfo', () => {
    let line;
    beforeEach(() => {
        line = env.el('build-info');
        line.textContent = '';
        line.innerHTML = '';
    });

    it('writes the built text into #build-info', () => {
        renderBuildInfo(pkg.version, BUILT_HASH);
        assert.equal(line.textContent, `v${pkg.version}${SEP}8f33eec`);
    });

    it('writes "dev" for a source checkout (the real module), and replaces what was there', () => {
        line.textContent = 'old';
        renderBuildInfo();
        assert.equal(line.textContent, 'dev');
    });

    it('sets textContent and never innerHTML, so a value can never become markup', () => {
        renderBuildInfo('1.0.0<img src=x>', 'abcdef0<b>');
        assert.equal(line.innerHTML, '', 'innerHTML is not used');
        assert.equal(line.textContent, `v1.0.0<img src=x>${SEP}abcdef0`, 'the characters stay characters');
    });

    it('does nothing, and does not throw, when the element is not on the page', () => {
        env.el('build-info').remove();
        // `remove()` only detaches it from its parent in the fake; make the lookup itself come back empty.
        const original = document.getElementById;
        document.getElementById = (id) => (id === 'build-info' ? null : original(id));
        try {
            assert.doesNotThrow(() => renderBuildInfo(pkg.version, BUILT_HASH));
        } finally {
            document.getElementById = original;
        }
    });
});

describe('the build line in index.html and the stamped module', () => {
    const all = [...elements(parseHtml(read('index.html')))];
    const lines = all.filter((el) => el.attrs.id === 'build-info');
    const line = lines[0];

    it('exists exactly once', () => {
        assert.equal(lines.length, 1);
    });

    it('is on the welcome screen only, so it is not on any other screen and not during a match', () => {
        assert.equal(closest(line, (n) => n.attrs.id === 'screen-welcome')?.attrs.id, 'screen-welcome');
        assert.equal(closest(line, (n) => n.tag === 'header'), null, 'not in the header, which is on every screen');
        assert.equal(closest(line, (n) => n.attrs.id === 'btn-install-app' || n.attrs.id === 'btn-panic-open'), null);
    });

    it('is a credit-line in a left-to-right box, starts empty and hidden, and is not translated', () => {
        assert.equal(line.tag, 'p');
        assert.deepEqual(line.attrs.class.split(/\s+/).sort(), ['build-info', 'credit-line', 'hidden'], 'the hidden class is what keeps it off the first paint');
        assert.equal(line.attrs.dir, 'ltr', 'a version and a hash read left to right in Persian too');
        assert.equal(innerText(line).trim(), '', 'JS writes the text; there is no default to translate');
        assert.ok(!('data-i18n' in line.attrs) && !('data-i18n-attr' in line.attrs), 'a version is not a translatable text');
        assert.ok(!('aria-label' in line.attrs) && !('title' in line.attrs), 'no text attribute either');
    });

    it('is hidden by the project\'s own `hidden` class (display: none), with no inline style and no hidden attribute', () => {
        assert.ok(line.attrs.class.split(/\s+/).includes('hidden'));
        assert.ok(!('style' in line.attrs), 'the CSP forbids inline style, and a class is what the reveal toggles');
        assert.ok(!('hidden' in line.attrs), 'one mechanism only: the class');
        assert.match(read('css/style.css'), /^\.hidden \{ display: none !important; \}$/m, 'the class still means display: none, which also keeps the line out of the accessibility tree');
    });

    it('is not aria-hidden: once revealed it is real information, not decoration', () => {
        assert.ok(!('aria-hidden' in line.attrs), 'a person who cannot see the screen needs the build number to report a problem too (display: none already hides it while it is not wanted)');
    });

    it('is written by main.js at start-up, and the long-press reveal is wired right after it', () => {
        const main = read('js/main.js');
        assert.match(main, /import \{ initBuildInfoReveal, renderBuildInfo \} from '\.\/ui\/buildInfo\.js';/);
        assert.match(main, /\n\s+renderBuildInfo\(\);\s+initBuildInfoReveal\(\);/);
    });

    it('core/buildInfo.js is pure data: it imports nothing, so it can sit in core/ and be stamped alone', () => {
        const code = read('js/core/buildInfo.js').replace(/\/\*[\s\S]*?\*\//g, '');
        assert.doesNotMatch(code, /\bimport\b/);
        assert.deepEqual([...code.matchAll(/^export const (\w+) = /gm)].map((m) => m[1]), ['APP_VERSION', 'BUILD_HASH']);
    });
});
