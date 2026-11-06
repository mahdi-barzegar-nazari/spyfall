#!/usr/bin/env node
/**
 * Turn the site that `scripts/build.mjs` wrote into ./dist into one with as few requests as possible.
 *
 *   node scripts/bundle.mjs [--out dist] [--split]
 *
 * Why: on a network that drops packets every request is a separate gamble (20-40 s each when TCP has to
 * retransmit), and ES modules are loaded as a chain: main.js, then the modules it imports, then theirs.
 * One missing file anywhere in that chain stops the whole app, and the service worker (registered by the
 * last line of main.js) never gets a chance to install. After this step the site needs:
 *
 *   default  one request: index.html with the CSS, the JS and the first-paint script inlined
 *   --split  three requests: index.html, app.css, app.js (plus js/preinit.js); the CSP stays untouched
 *
 * Fonts and icons stay separate files on purpose: the page works without them (`font-display: swap`).
 *
 * The inlined scripts and styles are allowed through the Content-Security-Policy by their SHA-256 hashes,
 * written into the policy of dist/index.html (the source index.html keeps `'self'` only).
 *
 * The service worker's PRECACHE list is rewritten for the new file set. The VERSION hash is kept: it comes
 * from the sources, so after upgrading esbuild alone, bump "version" in package.json to ship new bytes.
 *
 * Needs `esbuild` (devDependency). Run it after the build: `npm run build` does both.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, transform } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = resolve(ROOT, outArg > -1 ? process.argv[outArg + 1] : 'dist');
const SPLIT = process.argv.includes('--split');
const TARGET = 'es2018';

const fail = (message) => {
    console.error(`Bundle failed: ${message}`);
    process.exit(1);
};
const listFiles = (dir) =>
    readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listFiles(full) : [full];
    });
const toUrl = (file) => './' + relative(OUT, file).split(sep).join(posix.sep);
const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const read = (path) => readFileSync(join(OUT, path), 'utf8');

for (const required of ['index.html', 'sw.js', 'js/main.js', 'js/preinit.js', 'css/style.css']) {
    if (!existsSync(join(OUT, required))) fail(`${required} is missing in ${OUT}; run scripts/build.mjs first.`);
}

// ---- 1. the three pieces
const bundled = await build({
    entryPoints: [join(OUT, 'js', 'main.js')],
    bundle: true,
    format: 'esm',
    target: TARGET,
    minify: true,
    charset: 'utf8', // keep Persian text as UTF-8 (the default would write every letter as a 6-byte \uXXXX escape)
    legalComments: 'none',
    write: false,
    outfile: join(OUT, 'app.js'),
    logLevel: 'silent'
});
const appJs = bundled.outputFiles[0].text;

const css = await transform(read('css/style.css'), { loader: 'css', minify: true, charset: 'utf8' });
if (!css.code.includes('../assets/')) fail('css/style.css no longer points at ../assets/ (the font path rewrite found nothing).');
const appCss = css.code.replaceAll('../assets/', './assets/'); // the CSS moves from css/ to the site root

const preinitSource = read('js/preinit.js');
const preinit = (await transform(preinitSource, { loader: 'js', minify: true, charset: 'utf8', target: TARGET })).code;

// ---- 2. index.html
let html = read('index.html');
const TAGS = {
    preinit: '<script src="./js/preinit.js"></script>',
    css: '<link rel="stylesheet" href="./css/style.css">',
    main: '<script type="module" src="./js/main.js"></script>'
};
for (const [name, tag] of Object.entries(TAGS)) {
    if (html.split(tag).length !== 2) fail(`index.html must contain ${tag} exactly once (${name}).`);
}
// Inline code is placed inside <script>/<style>; two sequences would end it early or open a comment there.
const safeScript = (code) => code.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');
if (appCss.includes('</style')) fail('the CSS contains "</style"; it cannot be inlined.');

const CSP = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
const policy = html.match(CSP);
if (!policy || !/script-src 'self'(?=[;"\s])/.test(policy[2]) || !/style-src 'self'(?=[;"\s])/.test(policy[2])) {
    fail("index.html needs a Content-Security-Policy meta with \"script-src 'self'\" and \"style-src 'self'\".");
}

if (SPLIT) {
    html = html.replace(TAGS.css, () => '<link rel="stylesheet" href="./app.css">');
    html = html.replace(TAGS.main, () => '<script type="module" src="./app.js"></script>');
    writeFileSync(join(OUT, 'app.js'), appJs);
    writeFileSync(join(OUT, 'app.css'), appCss);
} else {
    const inlinePreinit = safeScript(preinit);
    const inlineMain = safeScript(appJs);
    html = html.replace(TAGS.preinit, () => `<script>${inlinePreinit}</script>`);
    html = html.replace(TAGS.css, () => `<style>${appCss}</style>`);
    html = html.replace(TAGS.main, () => `<script type="module">${inlineMain}</script>`);
    const scriptHashes = [inlinePreinit, inlineMain].map(sha256).join(' ');
    html = html.replace(CSP, (_, head, value, tail) =>
        head +
        value
            .replace(/script-src 'self'(?=[;"\s]|$)/, (m) => `${m} ${scriptHashes}`)
            .replace(/style-src 'self'(?=[;"\s]|$)/, (m) => `${m} ${sha256(appCss)}`) +
        tail
    );
}
writeFileSync(join(OUT, 'index.html'), html);

// ---- 3. drop what is bundled now
rmSync(join(OUT, 'css'), { recursive: true, force: true });
for (const file of listFiles(join(OUT, 'js'))) {
    if (!(SPLIT && file === join(OUT, 'js', 'preinit.js'))) rmSync(file);
}
if (!SPLIT) rmSync(join(OUT, 'js'), { recursive: true, force: true });
else {
    // keep only js/preinit.js: remove the now-empty folders
    for (const dir of readdirSync(join(OUT, 'js'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
        rmSync(join(OUT, 'js', dir.name), { recursive: true, force: true });
    }
}

// ---- 4. the service worker's precache list: what is really on disk now
const swPath = join(OUT, 'sw.js');
const files = listFiles(OUT).filter((f) => f !== swPath).sort();
const precache = ['./', ...files.map(toUrl)];
const sw = readFileSync(swPath, 'utf8');
const listPattern = /const PRECACHE = (\[[^\]]*\]);/;
const old = sw.match(listPattern);
if (!old) fail('sw.js has no stamped "const PRECACHE = [...]" list; run scripts/build.mjs first.');
JSON.parse(old[1]);
writeFileSync(swPath, sw.replace(listPattern, () => `const PRECACHE = ${JSON.stringify(precache, null, 4)};`));

// ---- 5. integrity: nothing may still point at a removed file
const leftovers = [...html.matchAll(/\b(?:href|src)="(\.\/[^"#?]+)"/g)].map((m) => m[1]).filter((ref) => !existsSync(join(OUT, ref)));
if (leftovers.length) fail(`index.html references missing ${leftovers.join(', ')}`);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(
    `Bundled ${SPLIT ? 'into 3 files' : 'into one index.html'}: ${files.length} files in ${relative(ROOT, OUT) || '.'}; ` +
        `index.html ${kb(Buffer.byteLength(html))} (${kb(gzipSync(html, { level: 9 }).length)} gzipped), ` +
        `app.js ${kb(Buffer.byteLength(appJs))}, css ${kb(Buffer.byteLength(appCss))}.`
);
