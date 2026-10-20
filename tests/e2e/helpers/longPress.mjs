/**
 * Plumbing for the browser tests of the build line's long-press reveal (tests/e2e/build-info-reveal.test.mjs).
 *
 * `withWelcome` opens the welcome screen on a phone-sized page whose clock the test controls. Playwright's fake
 * clock is installed at time 0 and then PAUSED, so a test moves time only with `page.clock.runFor(ms)` and the
 * 600 ms and 6000 ms boundaries can be asserted to the millisecond, with no waiting and no flakiness. (Left
 * running, the fake clock would keep following real time and a "599 ms" check would depend on how long
 * Playwright took to send the previous command.) The pointer itself is real: `page.mouse` and touch events sent
 * through the DevTools protocol reach the page as trusted pointer events.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHONE, newPage } from './app.mjs';

const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

/**
 * Open `url` on a fresh phone-sized page, wait for the welcome screen, run `fn({ page, context })`, and fail on
 * any script error. `clock: false` leaves the clock real; `touch: true` makes it a touch device.
 */
export async function withWelcome(browser, url, fn, { lang = 'fa', clock = true, touch = false, viewport = PHONE } = {}) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const { page, problems } = await newPage(context);
    try {
        if (lang !== 'fa') await page.addInitScript((value) => localStorage.setItem('spy_lang', value), lang);
        if (clock) await page.clock.install({ time: 0 });
        await page.goto(url);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        if (clock) await page.clock.pauseAt(1000);
        await fn({ page, context });
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

/** The text the build line shows on the production build: v<package.json version> · <first 7 of sw.js VERSION>. */
export async function builtBuildText(baseUrl) {
    const source = await (await fetch(`${baseUrl}sw.js`)).text();
    const version = source.match(/^const VERSION = '([^']*)';$/m)?.[1];
    assert.match(version ?? '', /^[0-9a-f]{12}$/, 'the built sw.js carries a 12-character hash');
    return `v${pkg.version} · ${version.slice(0, 7)}`;
}

/** Is the build line on screen (drawn, with a box), the way a person sees it? */
export const lineShown = (page) => page.isVisible('#build-info');

/** The text written into the build line, whether or not it is shown. */
export const lineText = (page) => page.evaluate(() => document.getElementById('build-info').textContent);

/** The centre of an element and its box, in page coordinates. */
export async function pointOf(page, selector) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box, `${selector} has a box`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/** Press the mouse on `selector` (its centre, or `at(box)`), without releasing. */
export async function mouseDownOn(page, selector, at) {
    const { x, y, box } = await pointOf(page, selector);
    const point = at ? at(box) : { x, y };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    return point;
}

/** A touch pointer driven through the DevTools protocol (needs `touch: true`). */
export async function touchPointer(page, context) {
    const cdp = await context.newCDPSession(page);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    return {
        down: (x, y) => send('touchStart', [{ x, y }]),
        move: (x, y) => send('touchMove', [{ x, y }]),
        up: () => send('touchEnd', [])
    };
}

/** Send a synthetic pointer event to `selector`: for a pen, a second finger and a barrel button, which the test devices lack. */
export function sendPointerEvent(page, selector, type, init = {}) {
    return page.evaluate(
        ({ selector, type, init }) => {
            const element = document.querySelector(selector);
            const rect = element.getBoundingClientRect();
            const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true, button: 0, clientX: rect.x + 8, clientY: rect.y + 8, ...init });
            return element.dispatchEvent(event);
        },
        { selector, type, init }
    );
}

/** Dispatch a cancelable `contextmenu` on `selector` and report whether a listener cancelled it. */
export function contextMenuPrevented(page, selector) {
    return page.evaluate((target) => !document.querySelector(target).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })), selector);
}

/** The credit line under the buttons ("made by ..."): the paragraph without the id, not the build line. */
export const CREDIT = 'p.credit-line:not(#build-info)';

/** A point on the credit paragraph that is not on either of its links (the left edge of the full-width box). */
export const creditEdge = (box) => ({ x: box.x + 4, y: box.y + box.height / 2 });
