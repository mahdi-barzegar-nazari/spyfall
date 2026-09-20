/**
 * End-to-end smoke test against the PRODUCTION build (dist), in a real Chromium.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../scripts/serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const IGNORED_NETWORK_NOISE = /fonts\.g|ERR_|Failed to load resource/;

let outDir;
let server;
let browser;
let baseUrl;

before(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'spyfall-e2e-'));
    execFileSync('node', ['scripts/build.mjs', '--out', outDir], { cwd: root, stdio: 'pipe' });
    server = await startServer(outDir, 0);
    baseUrl = `http://localhost:${server.address().port}/`;
    browser = await chromium.launch();
});

after(async () => {
    await browser?.close();
    server?.close();
    if (outDir) rmSync(outDir, { recursive: true, force: true });
});

async function newPage(context) {
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error' && !IGNORED_NETWORK_NOISE.test(msg.text())) problems.push(`console: ${msg.text()}`);
    });
    return { page, problems };
}

describe('spyfall (production build)', () => {
    it('loads the welcome screen with no script errors', async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const { page, problems } = await newPage(context);
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        assert.match(await page.title(), /جاسوس/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    it('plays from setup through role reveal to the discussion timer and into voting', async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const { page, problems } = await newPage(context);
        await page.goto(baseUrl);
        await page.click('#btn-nav-setup');
        await page.click('#btn-start-match');
        await page.waitForSelector('#screen-reveal:not(.hidden)');

        for (let i = 0; i < 4; i++) {
            await page.locator('#reveal-grid button:not([disabled])').first().click();
            await page.click('#handoff-action');
            await page.waitForSelector('#role-modal:not(.hidden)');
            await page.click('#btn-role-close');
            await page.waitForSelector('#role-modal.hidden', { state: 'attached' });
        }

        await page.click('#btn-start-discussion');
        await page.waitForSelector('#screen-timer:not(.hidden)');
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spy_full_state_master')));
        assert.equal(saved.state.phase, 'timer', 'match state is persisted for crash recovery');

        await page.click('#btn-emergency-vote');
        await page.waitForSelector('#screen-vote:not(.hidden)');
        assert.deepEqual(problems, []);
        await context.close();
    });

    it('installs the service worker, precaches the shell, and works offline', async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(baseUrl);
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload();
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

        const cacheNames = await page.evaluate(() => caches.keys());
        assert.ok(cacheNames.some((name) => name.startsWith('spyfall-shell-')), cacheNames.join());

        await context.setOffline(true);
        await page.reload();
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await page.click('#btn-nav-setup');
        await page.waitForSelector('#screen-setup:not(.hidden)');
        await context.close();
    });
});
