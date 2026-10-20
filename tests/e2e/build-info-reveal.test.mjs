/**
 * End-to-end test of the build line's long-press reveal, in a real Chromium at 360x740 on the PRODUCTION build
 * (and on the dev server, where the line says "dev"):
 *  - by default the line is not visible in either language: no box, no space, not read by a screen reader;
 *  - a press held on the welcome title (mouse, touch, pen) reveals the exact "v<version> · <hash>" text after
 *    600 ms and it hides itself 6 s later; a second long press restarts the 6 s;
 *  - a quick tap, a release at 599 ms, a drag of more than 10 px, a scroll, a pointer that leaves the title or is
 *    cancelled, a tap or a hold on the credit line, and a hold on the play button reveal nothing;
 *  - a hold on the title starts no game, opens no context menu, selects no text; the play button still works;
 *  - the Persian-text recording of the welcome screen is the same hidden and revealed.
 * Time is the page's fake clock, paused (see helpers/longPress.mjs), except in the one test that uses real timers.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../scripts/serve.mjs';
import { startApp } from './helpers/app.mjs';
import {
    CREDIT,
    builtBuildText,
    contextMenuPrevented,
    creditEdge,
    lineShown,
    lineText,
    mouseDownOn,
    pointOf,
    sendPointerEvent,
    touchPointer,
    withWelcome
} from './helpers/longPress.mjs';
import { recordScreen } from './helpers/record.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TITLE = '#welcome-title';

let app;
let devServer;
let devBrowser;
let devUrl;

before(async () => {
    app = await startApp();
    devServer = await startServer(root, 0);
    devUrl = `http://localhost:${devServer.address().port}/`;
    devBrowser = await chromium.launch();
});

after(async () => {
    await devBrowser?.close();
    devServer?.close();
    await app?.stop();
});

/** Hold the mouse on the title for `ms` of page time and release; returns where it was pressed. */
async function holdTitle(page, ms) {
    const point = await mouseDownOn(page, TITLE);
    await page.clock.runFor(ms);
    await page.mouse.up();
    return point;
}

/** What a screen reader gets from the welcome screen. */
const readAloud = (page) => page.locator('#screen-welcome').ariaSnapshot();

describe('build line reveal: hidden by default', () => {
    it('is not visible on first load in Persian and in English: no box, no space, not read by a screen reader', async () => {
        const expected = await builtBuildText(app.baseUrl);
        const hash = expected.split(' · ')[1];
        for (const lang of ['fa', 'en']) {
            await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
                assert.equal(await lineShown(page), false, `${lang}: not visible`);
                const info = await page.evaluate(() => {
                    const line = document.getElementById('build-info');
                    const screen = document.getElementById('screen-welcome');
                    const withLine = screen.getBoundingClientRect().height;
                    const parent = line.parentNode;
                    const next = line.nextSibling;
                    line.remove();
                    const withoutLine = screen.getBoundingClientRect().height;
                    parent.insertBefore(line, next);
                    return { display: getComputedStyle(line).display, ariaHidden: line.getAttribute('aria-hidden'), withLine, withoutLine };
                });
                assert.equal(info.display, 'none', `${lang}: not drawn`);
                assert.equal(await page.locator('#build-info').boundingBox(), null, `${lang}: no box`);
                assert.equal(info.withLine, info.withoutLine, `${lang}: the welcome screen is exactly as tall as if the line were not there`);
                assert.ok(!(await readAloud(page)).includes(hash), `${lang}: a screen reader does not get it`);
                assert.equal(await lineText(page), expected, `${lang}: the text is still written (the reveal has something to show)`);
            }, { lang });
        }
    });

    it('stays hidden on its own: nothing makes it appear as time goes by', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await page.clock.runFor(60_000);
            assert.equal(await lineShown(page), false);
        });
    });
});

describe('build line reveal: a long press on the title', () => {
    it('shows the exact text after 600 ms and hides it 6 s later, in Persian and in English', async () => {
        const expected = await builtBuildText(app.baseUrl);
        const hash = expected.split(' · ')[1];
        for (const lang of ['fa', 'en']) {
            await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
                await mouseDownOn(page, TITLE);
                await page.clock.runFor(599);
                assert.equal(await lineShown(page), false, `${lang}: not at 599 ms`);
                await page.clock.runFor(1);
                assert.equal(await lineShown(page), true, `${lang}: at 600 ms`);
                assert.equal(await lineText(page), expected, `${lang}: the exact text`);
                assert.ok((await readAloud(page)).includes(hash), `${lang}: once shown, a screen reader gets it`);
                await page.mouse.up();
                assert.equal(await lineShown(page), true, `${lang}: still there after the release`);
                await page.clock.runFor(5999);
                assert.equal(await lineShown(page), true, `${lang}: still there 5999 ms after it appeared`);
                await page.clock.runFor(1);
                assert.equal(await lineShown(page), false, `${lang}: gone 6000 ms after it appeared`);
                assert.ok(!(await readAloud(page)).includes(hash), `${lang}: and no longer read`);
            }, { lang });
        }
    });

    it('a second long press while it shows restarts the 6 seconds (it does not hide it)', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await holdTitle(page, 600);
            await page.clock.runFor(4000);
            await holdTitle(page, 600);
            assert.equal(await lineShown(page), true, 'the second press did not hide it');
            await page.clock.runFor(5999);
            assert.equal(await lineShown(page), true, 'past the first countdown, because the second press restarted it');
            await page.clock.runFor(1);
            assert.equal(await lineShown(page), false);
        });
    });

    it('works on real timers too: shown while held, gone again about 6 s after it appeared', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await mouseDownOn(page, TITLE);
            await page.waitForSelector('#build-info', { state: 'visible', timeout: 4000 });
            const shownAt = performance.now();
            await page.mouse.up();
            await page.waitForSelector('#build-info', { state: 'hidden', timeout: 9000 });
            const visibleFor = performance.now() - shownAt;
            assert.ok(visibleFor >= 5000 && visibleFor <= 8000, `visible for ${Math.round(visibleFor)} ms`);
        }, { clock: false });
    });

    it('reveals the same text on the dev server, where it is just "dev"', async () => {
        await withWelcome(devBrowser, devUrl, async ({ page }) => {
            assert.equal(await lineShown(page), false);
            assert.equal(await lineText(page), 'dev');
            await holdTitle(page, 600);
            assert.equal(await lineShown(page), true);
            await page.clock.runFor(6000);
            assert.equal(await lineShown(page), false);
        });
    });

    it('works with a finger: shown at 600 ms, not for a tap, a drag of more than 10 px, or a scroll', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page, context }) => {
            const finger = await touchPointer(page, context);
            const { x, y } = await pointOf(page, TITLE);

            await finger.down(x, y);
            await page.clock.runFor(599);
            assert.equal(await lineShown(page), false, 'not at 599 ms');
            await page.clock.runFor(1);
            assert.equal(await lineShown(page), true, 'at 600 ms');
            await finger.up();
            await page.clock.runFor(6000);
            assert.equal(await lineShown(page), false, 'hidden 6 s later');

            await finger.down(x, y);
            await page.clock.runFor(120);
            await finger.up();
            await page.clock.runFor(7000);
            assert.equal(await lineShown(page), false, 'a tap does nothing');

            await finger.down(x, y);
            await finger.move(x + 12, y);
            await page.clock.runFor(1000);
            await finger.up();
            assert.equal(await lineShown(page), false, 'a drag of 12 px does nothing');

            await finger.down(x, y);
            await finger.move(x + 6, y + 6);
            await page.clock.runFor(600);
            assert.equal(await lineShown(page), true, 'a wobble of about 8 px is still a press');
            await finger.up();
        }, { touch: true });
    });

    it('a scroll that starts on the title (the browser takes the touch over) reveals nothing', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page, context }) => {
            const finger = await touchPointer(page, context);
            const { x, y } = await pointOf(page, TITLE);
            assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight), 'the short screen can scroll');
            await finger.down(x, y);
            for (let step = 1; step <= 8; step++) await finger.move(x, y - step * 8);
            await page.clock.runFor(1000);
            assert.ok((await page.evaluate(() => window.scrollY)) > 0, 'the page really scrolled');
            assert.equal(await lineShown(page), false);
            await finger.up();
            await page.clock.runFor(1000);
            assert.equal(await lineShown(page), false);
        }, { touch: true, viewport: { width: 360, height: 360 } });
    });

    it('works with a pen, and ignores a second finger and a non-main button', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await sendPointerEvent(page, TITLE, 'pointerdown', { pointerType: 'pen' });
            await page.clock.runFor(599);
            assert.equal(await lineShown(page), false, 'pen, 599 ms');
            await page.clock.runFor(1);
            assert.equal(await lineShown(page), true, 'pen, 600 ms');
            await sendPointerEvent(page, TITLE, 'pointerup', { pointerType: 'pen' });
            await page.clock.runFor(6000);
            assert.equal(await lineShown(page), false);

            await sendPointerEvent(page, TITLE, 'pointerdown', { pointerType: 'touch', isPrimary: false });
            await sendPointerEvent(page, TITLE, 'pointerdown', { pointerType: 'pen', button: 5 });
            await sendPointerEvent(page, TITLE, 'pointerdown', { pointerType: 'mouse', button: 2 });
            await page.clock.runFor(5000);
            assert.equal(await lineShown(page), false, 'a second finger, an eraser or barrel button and a right click start nothing');
        });
    });
});

describe('build line reveal: what must not reveal it', () => {
    it('a quick tap on the title, then waiting as long as you like', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            const { x, y } = await pointOf(page, TITLE);
            await page.mouse.click(x, y);
            await page.clock.runFor(10_000);
            assert.equal(await lineShown(page), false);
        });
    });

    it('a release at 599 ms', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await holdTitle(page, 599);
            await page.clock.runFor(10_000);
            assert.equal(await lineShown(page), false);
        });
    });

    it('a drag of more than 10 px while pressing the title, but 10 px is still a press', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            const { x, y } = await mouseDownOn(page, TITLE);
            await page.clock.runFor(300);
            await page.mouse.move(x + 11, y);
            await page.clock.runFor(600);
            await page.mouse.up();
            assert.equal(await lineShown(page), false, '11 px away');

            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.clock.runFor(300);
            await page.mouse.move(x + 10, y);
            await page.clock.runFor(300);
            assert.equal(await lineShown(page), true, '10 px away');
            await page.mouse.up();
        });
    });

    it('a pointer that leaves the title (even by a few pixels) or is cancelled by the browser', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            const { x, box } = await pointOf(page, TITLE);
            await page.mouse.move(x, box.y + box.height - 2);
            await page.mouse.down();
            await page.clock.runFor(300);
            await page.mouse.move(x, box.y + box.height + 4); // 6 px: far less than the move tolerance, but off the title
            await page.clock.runFor(1000);
            assert.equal(await lineShown(page), false, 'left the title');
            await page.mouse.up();

            await sendPointerEvent(page, TITLE, 'pointerdown', { pointerType: 'touch' });
            await page.clock.runFor(300);
            await sendPointerEvent(page, TITLE, 'pointercancel', { pointerType: 'touch' });
            await page.clock.runFor(1000);
            assert.equal(await lineShown(page), false, 'pointercancel');
        });
    });

    it('a tap and a hold on the credit line (away from its links), which opens no page either', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page, context }) => {
            const { box } = await pointOf(page, CREDIT);
            const edge = creditEdge(box);
            const target = await page.evaluate(({ x, y }) => {
                const element = document.elementFromPoint(x, y);
                return { tag: element.tagName, inLink: element.closest('a') !== null };
            }, edge);
            assert.deepEqual(target, { tag: 'P', inLink: false }, 'the point is on the paragraph, not on a link');

            await page.mouse.click(edge.x, edge.y);
            await page.clock.runFor(10_000);
            assert.equal(await lineShown(page), false, 'tap');

            await mouseDownOn(page, CREDIT, creditEdge);
            await page.clock.runFor(1500);
            assert.equal(await lineShown(page), false, 'hold, still pressed');
            await page.mouse.up();
            await page.clock.runFor(1500);
            assert.equal(await lineShown(page), false, 'hold, released');
            assert.equal(context.pages().length, 1, 'no link was followed');
        });
    });

    it('a hold on the play button, which still opens the setup screen when released, as before', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await mouseDownOn(page, '#btn-nav-setup');
            await page.clock.runFor(1500);
            assert.equal(await lineShown(page), false, 'still pressed');
            await page.mouse.up();
            await page.waitForSelector('#screen-setup:not(.hidden)');
            assert.equal(await lineShown(page), false);
        });
    });
});

describe('build line reveal: the press on the title itself', () => {
    it('starts no game and opens nothing: the welcome screen stays, no modal opens', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await holdTitle(page, 1500);
            assert.equal(await lineShown(page), true);
            const screens = await page.evaluate(() => ({
                welcome: !document.getElementById('screen-welcome').classList.contains('hidden'),
                setup: !document.getElementById('screen-setup').classList.contains('hidden'),
                modals: document.querySelectorAll('.modal-overlay:not(.hidden)').length,
                saved: localStorage.getItem('spy_full_state_master')
            }));
            assert.deepEqual(screens, { welcome: true, setup: false, modals: 0, saved: null });
        });
    });

    it('selects no text while pressed, and a double click on the title selects nothing either', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            const { x, y } = await mouseDownOn(page, TITLE);
            await page.clock.runFor(700);
            const held = await page.evaluate(() => ({ selected: window.getSelection().toString(), userSelect: getComputedStyle(document.getElementById('welcome-title')).userSelect }));
            assert.deepEqual(held, { selected: '', userSelect: 'none' });
            await page.mouse.up();
            await page.mouse.dblclick(x, y);
            assert.equal(await page.evaluate(() => window.getSelection().toString()), '');
        });
    });

    it('cancels the title\'s context menu while pressed, and only on the title, and only while pressed', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            assert.equal(await contextMenuPrevented(page, TITLE), false, 'not pressed: the menu is left alone');

            await mouseDownOn(page, TITLE);
            assert.equal(await contextMenuPrevented(page, TITLE), true, 'pressed');
            await page.clock.runFor(700);
            assert.equal(await contextMenuPrevented(page, TITLE), true, 'pressed, line already shown');
            assert.equal(await contextMenuPrevented(page, '#btn-nav-setup'), false, 'the play button\'s menu is not touched');
            assert.equal(await contextMenuPrevented(page, CREDIT), false, 'nor the credit line\'s');
            await page.mouse.up();
            assert.equal(await contextMenuPrevented(page, TITLE), false, 'released');
        });
    });

    it('a real right click on the title opens nothing of ours: it does not reveal the line and the menu is not blocked', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await page.evaluate(() => {
                window.__menuBlocked = [];
                document.addEventListener('contextmenu', (event) => window.__menuBlocked.push(event.defaultPrevented));
            });
            const { x, y } = await pointOf(page, TITLE);
            await page.mouse.move(x, y);
            await page.mouse.click(x, y, { button: 'right', delay: 0 });
            await page.clock.runFor(2000);
            assert.equal(await lineShown(page), false);
            assert.deepEqual(await page.evaluate(() => window.__menuBlocked), [false]);
        });
    });
});

describe('build line reveal: the screen changes', () => {
    it('goes away with the welcome screen and is not there when it comes back', async () => {
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            await holdTitle(page, 600);
            assert.equal(await lineShown(page), true);
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            assert.equal(await lineShown(page), false, 'not on the setup screen');
            await page.click('#btn-back-welcome-2');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.equal(await lineShown(page), false, 'not back with the screen, though 6 s have not passed');
            await holdTitle(page, 600);
            assert.equal(await lineShown(page), true, 'and a new long press shows it again');
        });
    });
});

describe('build line reveal: the Persian-text recording', () => {
    it('is the same with the line hidden and shown, and never contains the build text', async () => {
        const expected = await builtBuildText(app.baseUrl);
        await withWelcome(app.browser, app.baseUrl, async ({ page }) => {
            const hidden = await recordScreen(page);
            await holdTitle(page, 600);
            assert.equal(await lineShown(page), true);
            const shown = await recordScreen(page);
            assert.deepEqual(shown, hidden);
            assert.ok(!JSON.stringify(hidden).includes(expected.split(' · ')[1]), 'no hash in the recording');
            assert.ok(!hidden.text.some((line) => /^v\d/.test(line) || line === 'dev'));
        });
    });
});
