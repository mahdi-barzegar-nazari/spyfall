/**
 * Guard: no Persian text in the code. Every text a player can see comes from the catalog
 * (`t()`, `tn()`, `tHtml()`, `setTemplate()` ...), so a new language only needs a new catalog.
 *
 * Scans every file under js/ for a Persian or Arabic letter or digit (U+0600-06FF), comments included,
 * except js/data/ (the word bank and the side quests are data) and js/i18n/ (the catalogs live there).
 * Comments are English; a Persian comment fails this test like any other Persian text.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PERSIAN = /[\u0600-\u06FF]/;
const SKIPPED_DIRS = ['js/data/', 'js/i18n/'];

/**
 * The only Persian allowed outside the catalogs: text the code matches against, never shows. Each entry
 * lists the exact (trimmed) lines, so any other Persian in the same file still fails.
 */
const EXCEPTIONS = {
    'js/utils/text.js': {
        reason: 'Input normalisation (user-typed digits, letter variants, punctuation) and the 0-9 to digit mapping: patterns to match, not display text.',
        // Written as \u escapes so the exact characters (combining marks included) are what is compared.
        lines: [
            "const faDigits = \u0027\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u0027;",
            "return String(v || \u0027\u0027).replace(/[\u06f0-\u06f9\u0660-\u0669]/g, d => enDigits[faDigits.indexOf(d)]);",
            "s = s.replace(/[\u064b-\u065f\u0670]/g, \u0027\u0027);",
            "s = s.replace(/\u064a/g, \u0027\u06cc\u0027).replace(/\u0643/g, \u0027\u06a9\u0027).replace(/\u0629/g, \u0027\u0647\u0027).replace(/\u0624/g, \u0027\u0648\u0027).replace(/\u0625|\u0623|\u0622/g, \u0027\u0627\u0027);",
            "s = s.replace(/[.,\\/#!$%\\^&\\*;:{}=\\-_`~()\u061f?!\u060c\u061b\u00ab\u00bb\"\u0027]/g, \u0027 \u0027);",
            "const faDigits = [\u0027\u06f0\u0027,\u0027\u06f1\u0027,\u0027\u06f2\u0027,\u0027\u06f3\u0027,\u0027\u06f4\u0027,\u0027\u06f5\u0027,\u0027\u06f6\u0027,\u0027\u06f7\u0027,\u0027\u06f8\u0027,\u0027\u06f9\u0027];"
        ]
    }
};

function listJs(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listJs(full) : full.endsWith('.js') ? [full] : [];
    });
}

const files = listJs(join(ROOT, 'js'))
    .map((full) => relative(ROOT, full).split('\\').join('/'))
    .filter((file) => !SKIPPED_DIRS.some((dir) => file.startsWith(dir)));

describe('no Persian text in the code', () => {
    it('scans the real code base (guards against a scanner that finds nothing)', () => {
        assert.ok(files.length > 20, `only ${files.length} files`);
        for (const expected of ['js/ui/render.js', 'js/ui/results.js', 'js/game/rounds.js', 'js/core/storage.js', 'js/main.js']) {
            assert.ok(files.includes(expected), `${expected} is not scanned`);
        }
        assert.ok(!files.some((file) => file.startsWith('js/data/') || file.startsWith('js/i18n/')));
    });

    it('no file has a Persian letter, digit or comment, except the listed lines', () => {
        const offenders = [];
        for (const file of files) {
            const allowed = new Set(EXCEPTIONS[file]?.lines ?? []);
            readFileSync(join(ROOT, file), 'utf8')
                .split('\n')
                .forEach((line, index) => {
                    if (PERSIAN.test(line) && !allowed.has(line.trim())) offenders.push(`${file}:${index + 1}: ${line.trim().slice(0, 90)}`);
                });
        }
        assert.deepEqual(offenders, [], 'move the text to js/i18n/fa.js and use t()/tn()/tHtml()/setTemplate(); write comments in English');
    });

    it('the exception list is current: every listed line exists, and says why it is there', () => {
        for (const [file, { reason, lines }] of Object.entries(EXCEPTIONS)) {
            assert.ok(reason && reason.length > 20, `${file}: no reason`);
            const present = new Set(readFileSync(join(ROOT, file), 'utf8').split('\n').map((line) => line.trim()));
            for (const line of lines) {
                assert.ok(present.has(line), `${file}: the exception line is gone: ${line}`);
                assert.ok(PERSIAN.test(line), `${file}: the line has no Persian, so it needs no exception: ${line}`);
            }
        }
    });

    it('the pattern really detects Persian letters, digits and comments', () => {
        for (const sample of ["x = 'سلام';", "// کامنت", "const n = '۱۲۳';", "const a = 'ك';"]) assert.ok(PERSIAN.test(sample), sample);
        for (const sample of ["x = 'hello';", "// a comment", "const n = '123';"]) assert.ok(!PERSIAN.test(sample), sample);
    });
});
