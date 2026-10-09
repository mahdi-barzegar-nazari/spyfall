/**
 * Shared plumbing for the browser tests that follow the style of smoke.test.mjs: build the production site into
 * a temporary folder, serve it on a free port and open it in a real Chromium. The caller owns the browser and
 * must call `stop()` when it is done.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../../scripts/serve.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const IGNORED_NETWORK_NOISE = /fonts\.g|ERR_|Failed to load resource/;

/** Build `dist` into a temp folder, serve it and launch Chromium. Returns `{ baseUrl, browser, stop }`. */
export async function startApp() {
    const outDir = mkdtempSync(join(tmpdir(), 'spyfall-e2e-'));
    let server;
    let browser;
    try {
        execFileSync('node', ['scripts/build.mjs', '--out', outDir], { cwd: root, stdio: 'pipe' });
        server = await startServer(outDir, 0);
        browser = await chromium.launch();
    } catch (error) {
        await browser?.close();
        server?.close();
        rmSync(outDir, { recursive: true, force: true });
        throw error;
    }
    return {
        baseUrl: `http://localhost:${server.address().port}/`,
        browser,
        async stop() {
            await browser.close();
            server.close();
            rmSync(outDir, { recursive: true, force: true });
        }
    };
}

/** A page of `context` that collects script errors and console errors (network noise from fonts is ignored). */
export async function newPage(context) {
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error' && !IGNORED_NETWORK_NOISE.test(msg.text())) problems.push(`console: ${msg.text()}`);
    });
    return { page, problems };
}

/** The phone the tests are written for. */
export const PHONE = { width: 360, height: 740 };
