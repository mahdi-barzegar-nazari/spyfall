/**
 * Writes tests/e2e/fixtures/persian-baseline.json: what the Persian welcome and setup screens showed in the
 * zip BEFORE the language switch existed (spyfall-main-part2-final.zip), at 360x740.
 *
 *   node scripts/build.mjs --out /tmp/before        (run inside the OLD project)
 *   node tests/e2e/fixtures/make-persian-baseline.mjs /tmp/before
 *
 * The argument is a built site (the folder with index.html and sw.js). tests/e2e/lang-switch.test.mjs compares
 * the current build with this file, so "the Persian game looks exactly as it did" is checked against the old
 * build and not against itself. The language switch is the only new element; the recording leaves it out
 * (see helpers/record.mjs). Do not regenerate the file from a newer build to make a failing test pass: a
 * difference there is a change to the Persian screens and has to be a decision.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../../scripts/serve.mjs';
import { PHONE } from '../helpers/app.mjs';
import { recordScreen } from '../helpers/record.mjs';

const site = process.argv[2];
if (!site) throw new Error('usage: node make-persian-baseline.mjs <built site folder>');

const server = await startServer(site, 0);
const browser = await chromium.launch();
try {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    const welcome = await recordScreen(page);
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
    const setup = await recordScreen(page);
    const indexHtml = readFileSync(`${site}/index.html`);
    const out = {
        _source: 'spyfall-main-part2-final.zip, built with scripts/build.mjs, Persian (no saved language), 360x740',
        _indexHtmlSha256: createHash('sha256').update(indexHtml).digest('hex'),
        welcome,
        setup
    };
    writeFileSync(fileURLToPath(new URL('./persian-baseline.json', import.meta.url)), JSON.stringify(out, null, 2) + '\n');
    console.log(`welcome: ${welcome.text.length} lines, ${welcome.attrs.length} attrs; setup: ${setup.text.length} lines, ${setup.attrs.length} attrs`);
} finally {
    await browser.close();
    server.close();
}
