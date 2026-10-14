#!/usr/bin/env node
/**
 * Build the deployable site into ./dist (default).
 *
 *   node scripts/build.mjs [--out dist]
 *
 * - Copies only the files that ship (no tests, no tooling).
 * - Verifies that every ES import and every index.html reference resolves.
 * - Stamps sw.js with a content hash and the precache list, which is what invalidates
 *   installed users' caches whenever anything changes.
 * - Stamps js/core/buildInfo.js with the "version" of package.json and that same hash, so the welcome
 *   screen can say which build is running. The version is part of the hash input, so bumping only the
 *   version still gives a new service worker and a new cache (installed users then receive the number).
 * No dependencies: Node 20+ only.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'assets'];

// The shipped file that carries the build number, and the two statements (with their placeholders) that are stamped.
const BUILD_INFO_FILE = 'js/core/buildInfo.js';
const VERSION_STATEMENT = "export const APP_VERSION = '__APP_VERSION__';";
const HASH_STATEMENT = "export const BUILD_HASH = '__BUILD_HASH__';";
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;

const outArg = process.argv.indexOf('--out');
const OUT = resolve(ROOT, outArg > -1 ? process.argv[outArg + 1] : 'dist');

function listFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listFiles(full) : [full];
    });
}
const toUrl = (file) => './' + relative(OUT, file).split(sep).join(posix.sep);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const entry of SHIPPED) cpSync(join(ROOT, entry), join(OUT, entry), { recursive: true });

// ---- 1. integrity checks: nothing shipped may point at a missing file
const problems = [];
for (const file of listFiles(OUT).filter((f) => f.endsWith('.js') && f.includes(`${sep}js${sep}`))) {
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(/\bfrom\s+'(\.[^']+)'/g)) {
        if (!existsSync(resolve(dirname(file), spec))) problems.push(`${toUrl(file)} imports missing ${spec}`);
    }
}
const html = readFileSync(join(OUT, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/\b(?:href|src|content)="(\.\/[^"#?]+)"/g)) {
    if (!existsSync(join(OUT, ref))) problems.push(`index.html references missing ${ref}`);
}
const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
for (const icon of manifest.icons) {
    if (!existsSync(join(OUT, icon.src))) problems.push(`manifest.json references missing ${icon.src}`);
}
if (problems.length) {
    console.error('Build failed:\n  ' + problems.join('\n  '));
    process.exit(1);
}

// ---- 2. version = hash of every shipped file except sw.js itself, plus the package.json version
// js/core/buildInfo.js is hashed with its placeholders (it is stamped after the hash, like sw.js), so the
// stamped numbers never feed back into the hash. The package.json version is not a shipped file, so it is
// added on its own: without it, bumping only the version would leave the hash, the service worker and the
// cache unchanged and installed users would never receive the new number.
const appVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
if (typeof appVersion !== 'string' || !SEMVER.test(appVersion)) {
    console.error(`package.json "version" must look like 1.2.3 (got ${JSON.stringify(appVersion)}); refusing to stamp it.`);
    process.exit(1);
}
const swPath = join(OUT, 'sw.js');
const buildInfoPath = join(OUT, ...BUILD_INFO_FILE.split('/'));
const files = listFiles(OUT).filter((f) => f !== swPath).sort();
const hash = createHash('sha256');
for (const file of files) {
    hash.update(toUrl(file));
    hash.update(readFileSync(file));
}
hash.update(`\0package.json version:${appVersion}\0`);
hash.update(readFileSync(swPath, 'utf8').replace(/'__BUILD_VERSION__'/, '').replace(/\/\* __PRECACHE__ \*\/ \[\]/, ''));
const version = hash.digest('hex').slice(0, 12);

// ---- 3. stamp the service worker and the build-info module
// Both placeholder checks come before either write, so a broken source never leaves a half-stamped site.
const precache = ['./', ...files.map(toUrl)];
let sw = readFileSync(swPath, 'utf8');
if (!sw.includes("'__BUILD_VERSION__'") || !sw.includes('/* __PRECACHE__ */ []')) {
    console.error('sw.js placeholders are missing; refusing to build a worker that cannot invalidate.');
    process.exit(1);
}
let buildInfo = readFileSync(buildInfoPath, 'utf8');
if (!buildInfo.includes(VERSION_STATEMENT) || !buildInfo.includes(HASH_STATEMENT)) {
    console.error(`${BUILD_INFO_FILE} placeholders are missing; refusing to build an app that cannot say which build it is.`);
    process.exit(1);
}
sw = sw.replace("'__BUILD_VERSION__'", JSON.stringify(version).replace(/"/g, "'"));
sw = sw.replace('/* __PRECACHE__ */ []', JSON.stringify(precache, null, 4));
writeFileSync(swPath, sw);

// Replacer functions, so no character of a value is read as a replacement pattern.
buildInfo = buildInfo.replace(VERSION_STATEMENT, () => `export const APP_VERSION = '${appVersion}';`);
buildInfo = buildInfo.replace(HASH_STATEMENT, () => `export const BUILD_HASH = '${version}';`);
writeFileSync(buildInfoPath, buildInfo);

console.log(`Built ${files.length} files into ${relative(ROOT, OUT) || '.'} (version ${appVersion}, hash ${version}).`);
