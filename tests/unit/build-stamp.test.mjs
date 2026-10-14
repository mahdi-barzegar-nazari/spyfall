/**
 * scripts/build.mjs stamps js/core/buildInfo.js with the "version" of package.json and with the hash it stamps
 * into sw.js. These tests run the real build on throwaway copies of the project (build.mjs finds its root from
 * its own location, so a copy builds the copy), into a temp --out folder, and read what it wrote.
 *
 * No version number is written here: the expected version is read from package.json, and the "bumped" one is
 * derived from it.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COPIED = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'assets', 'scripts', 'package.json'];
const MODULE = 'js/core/buildInfo.js';
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const temps = [];
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A throwaway copy of the project, so a test can edit the sources without touching the real ones. */
function copyProject() {
    const dir = mkdtempSync(join(tmpdir(), 'spyfall-stamp-'));
    temps.push(dir);
    for (const entry of COPIED) cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
    return dir;
}

/** Run the build of `project` into `<project>/<out>`; returns the process result and the paths. */
function build(project, out = 'out') {
    const result = spawnSync(process.execPath, [join(project, 'scripts', 'build.mjs'), '--out', join(project, out)], { encoding: 'utf8' });
    return { ...result, dir: join(project, out) };
}

/** A build that must succeed. */
function buildOk(project, out) {
    const result = build(project, out);
    assert.equal(result.status, 0, `the build failed:\n${result.stderr}${result.stdout}`);
    return result.dir;
}

const swVersion = (dir) => readFileSync(join(dir, 'sw.js'), 'utf8').match(/^const VERSION = '([^']*)';$/m)?.[1];
const stamped = (dir) => {
    const source = readFileSync(join(dir, ...MODULE.split('/')), 'utf8');
    return { source, version: source.match(/^export const APP_VERSION = '([^']*)';$/m)?.[1], hash: source.match(/^export const BUILD_HASH = '([^']*)';$/m)?.[1] };
};
const setVersion = (project, version) => {
    const file = join(project, 'package.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), version }, null, 2) + '\n');
};
const editSource = (project, file, change) => {
    const path = join(project, ...file.split('/'));
    const before = readFileSync(path, 'utf8');
    const after = change(before);
    assert.notEqual(after, before, `the edit of ${file} changed nothing`);
    writeFileSync(path, after);
};

describe('stamping js/core/buildInfo.js', () => {
    it('writes the version of package.json and a hash equal to the VERSION in sw.js', () => {
        const dir = buildOk(copyProject());
        const { version, hash } = stamped(dir);
        assert.equal(version, pkg.version, 'the version comes from package.json');
        assert.match(hash, /^[0-9a-f]{12}$/);
        assert.equal(hash, swVersion(dir), 'one hash: the module and the service worker agree');
    });

    it('leaves no placeholder behind, in the module or in sw.js', () => {
        const dir = buildOk(copyProject());
        assert.doesNotMatch(stamped(dir).source, /__[A-Z_]+__/);
        assert.doesNotMatch(readFileSync(join(dir, 'sw.js'), 'utf8'), /'__BUILD_VERSION__'|\/\* __PRECACHE__ \*\/ \[\]/);
    });

    it('ships the module and precaches it, so the number is there offline', () => {
        const dir = buildOk(copyProject());
        assert.match(readFileSync(join(dir, 'sw.js'), 'utf8'), /"\.\/js\/core\/buildInfo\.js"/);
    });

    it('is deterministic: two builds of the same sources, in two folders, give the same hash and the same bytes', () => {
        const project = copyProject();
        const first = buildOk(project, 'out-1');
        const second = buildOk(project, 'out-2');
        assert.equal(swVersion(first), swVersion(second));
        assert.deepEqual(stamped(first), stamped(second));
        assert.equal(readFileSync(join(first, 'sw.js'), 'utf8'), readFileSync(join(second, 'sw.js'), 'utf8'));
        const other = buildOk(copyProject());
        assert.equal(swVersion(other), swVersion(first), 'a separate copy of the same sources agrees too');
    });

    it('a version bump alone gives a new hash, a new service worker and the new number', () => {
        const project = copyProject();
        const before = buildOk(project, 'before');
        const bumped = `${pkg.version.split('.')[0]}.${Number(pkg.version.split('.')[1]) + 1}.0`;
        assert.notEqual(bumped, pkg.version);
        setVersion(project, bumped);
        const after = buildOk(project, 'after');

        assert.notEqual(swVersion(after), swVersion(before), 'a new hash, so a new cache name');
        assert.notEqual(readFileSync(join(after, 'sw.js'), 'utf8'), readFileSync(join(before, 'sw.js'), 'utf8'), 'a new service worker file, so browsers install it');
        assert.equal(stamped(after).version, bumped);
        assert.equal(stamped(after).hash, swVersion(after));
        assert.equal(stamped(before).version, pkg.version);
    });

    it('a change to a shipped file still gives a new hash (the version is added to the input, not instead of it)', () => {
        const project = copyProject();
        const before = buildOk(project, 'before');
        editSource(project, 'css/style.css', (css) => css + '\n/* changed */\n');
        assert.notEqual(swVersion(buildOk(project, 'after')), swVersion(before));
    });

    it('fails loudly, with a non-zero exit and a message naming the file, when a placeholder is missing', () => {
        for (const [statement, replacement] of [
            ["export const APP_VERSION = '__APP_VERSION__';", "export const APP_VERSION = '0.0.0';"],
            ["export const BUILD_HASH = '__BUILD_HASH__';", "export const BUILD_HASH = 'abcdef012345';"]
        ]) {
            const project = copyProject();
            editSource(project, MODULE, (source) => source.replace(statement, replacement));
            const result = build(project);
            assert.notEqual(result.status, 0, `no failure for a missing ${statement}`);
            assert.match(result.stderr, /js\/core\/buildInfo\.js placeholders are missing/);
            assert.doesNotMatch(readFileSync(join(result.dir, 'sw.js'), 'utf8'), /const VERSION = '[0-9a-f]{12}'/, 'sw.js is not stamped either: no half-stamped site');
        }
    });

    it('fails when the module is gone from the sources', () => {
        const project = copyProject();
        rmSync(join(project, ...MODULE.split('/')));
        assert.notEqual(build(project).status, 0);
    });

    it('refuses a package.json version that is not a plain x.y.z, so nothing odd is written into JS', () => {
        for (const bad of ["1.0'; alert(1); '", '', 'latest', '1.0', '$&']) {
            const project = copyProject();
            setVersion(project, bad);
            const result = build(project);
            assert.notEqual(result.status, 0, `accepted ${JSON.stringify(bad)}`);
            assert.match(result.stderr, /package\.json "version" must look like/);
        }
    });

    it('accepts a pre-release version and writes it as given', () => {
        const project = copyProject();
        setVersion(project, '3.1.4-rc.1');
        assert.equal(stamped(buildOk(project)).version, '3.1.4-rc.1');
    });
});
