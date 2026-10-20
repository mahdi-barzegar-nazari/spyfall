/**
 * The build line on the welcome screen is hidden by default and a long press on the welcome title reveals it
 * (`ui/buildInfoReveal.js`, the pure controller, and `initBuildInfoReveal` in `ui/buildInfo.js`, the wiring).
 *
 * The controller is driven with injected timers on the manual clock of helpers/fakeEnv.mjs, so every boundary
 * (599 ms, 600 ms, 5999 ms, 6000 ms) is exact and `clock.pending()` shows that nothing is left armed. The wiring
 * runs on the fake browser: events are handed straight to the listeners that were registered. The same
 * behaviour in a real Chromium, with a mouse, a touch and a pen, is in tests/e2e/build-info-reveal.test.mjs.
 *
 * Second press, as chosen here: a long press while the line is showing restarts the countdown (it does not hide it).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { closest, elements, parseHtml } from './helpers/htmlScan.mjs';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(new URL(file, `file://${ROOT}`), 'utf8');

const env = installFakeEnv();
const { HOLD_MS, MOVE_TOLERANCE_PX, VISIBLE_MS, createBuildInfoReveal } = await import('../../js/ui/buildInfoReveal.js');
const { initBuildInfoReveal } = await import('../../js/ui/buildInfo.js');
after(() => env.uninstall());

let clock;
beforeEach(() => {
    env.reset();
    clock = env.installTimers();
});

/** A controller on the manual clock, with counters for what it asked the page to do. */
function makeController(overrides = {}) {
    const log = { shows: 0, hides: 0 };
    const controller = createBuildInfoReveal({
        show: () => log.shows++,
        hide: () => log.hides++,
        setTimer: clock.setTimeout,
        clearTimer: clock.clear,
        ...overrides
    });
    return { controller, log };
}

/** Press at (x, y), hold for the whole of `ms`, and return. The pointer is still down. */
function hold(controller, ms = HOLD_MS, x = 100, y = 50) {
    controller.pressStart(x, y);
    clock.tick(ms);
}

describe('the numbers the design asks for', () => {
    it('hold 600 ms, drift at most 10 px, stay visible 6 seconds', () => {
        assert.equal(HOLD_MS, 600);
        assert.equal(MOVE_TOLERANCE_PX, 10);
        assert.equal(VISIBLE_MS, 6000);
    });
});

describe('reveal after a long press', () => {
    it('shows the line when the press has been held for 600 ms, and not a millisecond earlier', () => {
        const { controller, log } = makeController();
        controller.pressStart(10, 10);
        assert.equal(log.shows, 0, 'nothing happens on the press itself');
        clock.tick(HOLD_MS - 1);
        assert.equal(log.shows, 0);
        assert.equal(controller.isVisible(), false);
        clock.tick(1);
        assert.equal(log.shows, 1);
        assert.equal(controller.isVisible(), true);
    });

    it('does not reveal when the press is released at 599 ms, and leaves no timer behind', () => {
        const { controller, log } = makeController();
        controller.pressStart(10, 10);
        clock.tick(HOLD_MS - 1);
        controller.pressEnd();
        clock.tick(60_000);
        assert.equal(log.shows, 0);
        assert.equal(controller.isVisible(), false);
        assert.equal(clock.pending(), 0);
    });

    it('does nothing for a quick tap', () => {
        const { controller, log } = makeController();
        controller.pressStart(10, 10);
        clock.tick(80);
        controller.pressEnd();
        clock.tick(60_000);
        assert.deepEqual(log, { shows: 0, hides: 0 });
    });

    it('a move of more than 10 px from where the press began cancels it', () => {
        const { controller, log } = makeController();
        controller.pressStart(100, 100);
        clock.tick(300);
        controller.pressMove(111, 100);
        assert.equal(controller.isPressing(), false);
        clock.tick(60_000);
        assert.equal(log.shows, 0);
        assert.equal(clock.pending(), 0);
    });

    it('a move of exactly 10 px, or small jitter, does not cancel it', () => {
        const { controller, log } = makeController();
        controller.pressStart(100, 100);
        clock.tick(200);
        controller.pressMove(110, 100); // 10 px: allowed
        controller.pressMove(103, 98);
        controller.pressMove(106, 108); // 6 and 8: exactly 10 px away
        assert.equal(controller.isPressing(), true);
        clock.tick(HOLD_MS - 200);
        assert.equal(log.shows, 1);
    });

    it('measures the move from where the press began, so slow drift adds up', () => {
        const { controller, log } = makeController();
        controller.pressStart(100, 100);
        controller.pressMove(106, 100);
        controller.pressMove(112, 100); // 12 px from the start, though only 6 from the last point
        clock.tick(60_000);
        assert.equal(log.shows, 0);
    });

    it('a diagonal move counts by distance, not per axis', () => {
        const { controller, log } = makeController();
        controller.pressStart(100, 100);
        controller.pressMove(108, 108); // 8 px on each axis, about 11.3 px away
        clock.tick(60_000);
        assert.equal(log.shows, 0);
    });

    it('cancelPress (pointercancel, or the pointer left the title) ends the press without a reveal', () => {
        const { controller, log } = makeController();
        controller.pressStart(100, 100);
        clock.tick(HOLD_MS - 100);
        controller.cancelPress();
        assert.equal(controller.isPressing(), false);
        clock.tick(60_000);
        assert.equal(log.shows, 0);
        assert.equal(clock.pending(), 0);
    });

    it('a move without a press in progress does nothing', () => {
        const { controller, log } = makeController();
        controller.pressMove(500, 500);
        controller.pressEnd();
        controller.cancelPress();
        assert.deepEqual(log, { shows: 0, hides: 0 });
        assert.equal(clock.pending(), 0);
    });

    it('a new press replaces the one in progress (a release that never arrived), and counts from its own start', () => {
        const { controller, log } = makeController();
        controller.pressStart(100, 100);
        clock.tick(400);
        controller.pressStart(100, 100);
        assert.equal(clock.pending(), 1, 'one press timer, not two');
        clock.tick(HOLD_MS - 1);
        assert.equal(log.shows, 0, '599 ms into the second press');
        clock.tick(1);
        assert.equal(log.shows, 1);
    });

    it('treats missing coordinates as 0, so no NaN can slip past the tolerance check', () => {
        const { controller, log } = makeController();
        controller.pressStart(undefined, undefined);
        controller.pressMove(undefined, null);
        controller.pressMove(Number.NaN, 5);
        assert.equal(controller.isPressing(), true);
        controller.pressMove(0, 11);
        assert.equal(controller.isPressing(), false);
        clock.tick(60_000);
        assert.equal(log.shows, 0);
    });

    it('releasing after the reveal does not take the line away', () => {
        const { controller, log } = makeController();
        hold(controller);
        controller.pressEnd();
        assert.equal(controller.isVisible(), true);
        assert.equal(log.hides, 0);
    });

    it('isPressing is true from the press until it ends, also after the reveal while the pointer is down', () => {
        const { controller } = makeController();
        assert.equal(controller.isPressing(), false);
        controller.pressStart(1, 1);
        assert.equal(controller.isPressing(), true);
        clock.tick(HOLD_MS);
        assert.equal(controller.isVisible(), true);
        assert.equal(controller.isPressing(), true, 'the finger is still down');
        controller.pressEnd();
        assert.equal(controller.isPressing(), false);
    });
});

describe('hiding again', () => {
    it('hides itself 6 seconds after the reveal, and not a millisecond earlier', () => {
        const { controller, log } = makeController();
        hold(controller);
        controller.pressEnd();
        clock.tick(VISIBLE_MS - 1);
        assert.equal(controller.isVisible(), true);
        assert.equal(log.hides, 0);
        clock.tick(1);
        assert.equal(controller.isVisible(), false);
        assert.equal(log.hides, 1);
        assert.equal(clock.pending(), 0, 'nothing left armed');
    });

    it('counts the 6 seconds from the moment of the reveal, not from the release', () => {
        const { controller, log } = makeController();
        hold(controller);
        clock.tick(5000); // still holding
        controller.pressEnd();
        clock.tick(VISIBLE_MS - 5000 - 1);
        assert.equal(log.hides, 0);
        clock.tick(1);
        assert.equal(log.hides, 1);
    });

    it('a second long press while visible restarts the 6 seconds, and does not show or hide anything itself', () => {
        const { controller, log } = makeController();
        hold(controller);
        controller.pressEnd();
        clock.tick(4000);
        hold(controller); // second long press, 4 s into the first countdown
        controller.pressEnd();
        assert.equal(log.shows, 1, 'already visible: no second show');
        assert.equal(log.hides, 0, 'a second press does not hide it');
        clock.tick(VISIBLE_MS - 1);
        assert.equal(controller.isVisible(), true, 'the first countdown (long over by now) was replaced');
        assert.equal(clock.pending(), 1, 'one countdown, not two');
        clock.tick(1);
        assert.equal(log.hides, 1);
        assert.equal(clock.pending(), 0);
    });

    it('a quick tap while visible changes nothing: the original countdown runs on', () => {
        const { controller, log } = makeController();
        hold(controller);
        controller.pressEnd();
        clock.tick(3000);
        controller.pressStart(100, 50);
        clock.tick(100);
        controller.pressEnd();
        clock.tick(VISIBLE_MS - 3100 - 1);
        assert.equal(log.hides, 0);
        clock.tick(1);
        assert.equal(log.hides, 1, 'hidden 6 s after the reveal, as if nothing had happened');
    });

    it('can be revealed again after it hid', () => {
        const { controller, log } = makeController();
        hold(controller);
        controller.pressEnd();
        clock.tick(VISIBLE_MS);
        hold(controller);
        controller.pressEnd();
        assert.deepEqual(log, { shows: 2, hides: 1 });
        assert.equal(controller.isVisible(), true);
    });

    it('never has more than one press timer and one countdown armed, however often it is used', () => {
        const { controller } = makeController();
        for (let i = 0; i < 50; i++) controller.pressStart(i, i);
        assert.equal(clock.pending(), 1);
        clock.tick(HOLD_MS);
        assert.equal(clock.pending(), 1, 'the press timer is spent, the countdown is armed');
        for (let i = 0; i < 50; i++) {
            controller.pressStart(0, 0);
            clock.tick(HOLD_MS);
        }
        assert.equal(clock.pending(), 1, 'only the countdown: every press timer was spent or replaced');
        controller.pressEnd();
        clock.tick(VISIBLE_MS);
        assert.equal(clock.pending(), 0);
    });
});

describe('reset (the screen changed) and destroy', () => {
    it('reset ends a press in progress', () => {
        const { controller, log } = makeController();
        controller.pressStart(1, 1);
        clock.tick(300);
        controller.reset();
        clock.tick(60_000);
        assert.deepEqual(log, { shows: 0, hides: 0 });
        assert.equal(controller.isPressing(), false);
        assert.equal(clock.pending(), 0);
    });

    it('reset hides a visible line at once and clears the countdown', () => {
        const { controller, log } = makeController();
        hold(controller);
        controller.pressEnd();
        clock.tick(2000);
        controller.reset();
        assert.equal(controller.isVisible(), false);
        assert.equal(log.hides, 1);
        assert.equal(clock.pending(), 0);
        clock.tick(60_000);
        assert.equal(log.hides, 1, 'the old countdown did not fire a second hide');
    });

    it('reset with nothing going on asks for nothing (no spurious hide)', () => {
        const { controller, log } = makeController();
        controller.reset();
        assert.deepEqual(log, { shows: 0, hides: 0 });
    });

    it('destroy clears every timer: in the middle of a press, while visible, and when idle', () => {
        const idle = makeController();
        idle.controller.destroy();
        assert.equal(clock.pending(), 0);

        const pressing = makeController();
        pressing.controller.pressStart(1, 1);
        pressing.controller.destroy();
        assert.equal(clock.pending(), 0);
        clock.tick(60_000);
        assert.equal(pressing.log.shows, 0);

        const visible = makeController();
        hold(visible.controller);
        visible.controller.destroy();
        assert.equal(clock.pending(), 0);
        assert.equal(visible.log.hides, 1, 'a visible line is hidden on the way out');
        clock.tick(60_000);
        assert.equal(visible.log.hides, 1);
    });

    it('after destroy nothing can be armed any more', () => {
        const { controller, log } = makeController();
        controller.destroy();
        controller.pressStart(1, 1);
        controller.pressMove(2, 2);
        assert.equal(clock.pending(), 0);
        clock.tick(60_000);
        assert.deepEqual(log, { shows: 0, hides: 0 });
        assert.equal(controller.isPressing(), false);
    });
});

describe('timers, constants and purity', () => {
    it('uses the global setTimeout / clearTimeout, looked up when called, when none are injected', () => {
        const log = { shows: 0, hides: 0 };
        const controller = createBuildInfoReveal({ show: () => log.shows++, hide: () => log.hides++ });
        controller.pressStart(1, 1);
        assert.equal(clock.pending(), 1, 'the press timer went through the (fake) global setTimeout');
        clock.tick(HOLD_MS);
        assert.equal(log.shows, 1);
        controller.pressEnd();
        clock.tick(VISIBLE_MS);
        assert.equal(log.hides, 1);
        assert.equal(clock.pending(), 0);
    });

    it('the numbers can be overridden by the caller (so a test or a variant never edits the module)', () => {
        const { controller, log } = makeController({ holdMs: 50, visibleMs: 70, tolerance: 2 });
        controller.pressStart(0, 0);
        controller.pressMove(3, 0);
        clock.tick(1000);
        assert.equal(log.shows, 0, 'a 3 px move is beyond a tolerance of 2');
        hold(controller, 50);
        assert.equal(log.shows, 1);
        clock.tick(69);
        assert.equal(log.hides, 0);
        clock.tick(1);
        assert.equal(log.hides, 1);
    });

    it('is pure: it imports nothing and never mentions the DOM, so the logic stays testable without a page', () => {
        const code = read('js/ui/buildInfoReveal.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        assert.doesNotMatch(code, /\bimport\b/);
        for (const word of ['document', 'window', 'getElementById', 'addEventListener', 'classList', 'querySelector', 'navigator']) {
            assert.ok(!code.includes(word), `buildInfoReveal.js mentions ${word}`);
        }
    });
});

// --- the wiring on the fake browser -----------------------------------------------------------------------

/** A pointer or mouse event the way the browser hands it to a listener. */
function pointer(overrides = {}) {
    return {
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        clientX: 100,
        clientY: 50,
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        ...overrides
    };
}

function fire(element, type, event = pointer()) {
    for (const listener of [...(element.listeners[type] || [])]) listener(event);
    return event;
}

/** The three elements the wiring looks up, plus two bystanders that must get no listener. */
function welcomePage() {
    const title = env.el('welcome-title');
    const line = env.el('build-info');
    line.classList.add('hidden');
    const screen = env.el('screen-welcome');
    const bystanders = [env.el('btn-nav-setup'), env.el('credit-line-stand-in')];
    return { title, line, screen, bystanders };
}

/** A MutationObserver stand-in that records what it watches; `trigger()` plays a mutation. */
function installFakeObserver() {
    const created = [];
    globalThis.MutationObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.observed = [];
            this.disconnected = false;
            created.push(this);
        }

        observe(target, options) {
            this.observed.push({ target, options });
        }

        disconnect() {
            this.disconnected = true;
        }

        trigger() {
            this.callback([]);
        }
    };
    return { created, restore: () => delete globalThis.MutationObserver };
}

const isShown = (line) => !line.classList.contains('hidden');

describe('initBuildInfoReveal (wiring)', () => {
    it('does nothing and returns null when the title or the line is not on the page', () => {
        env.el('build-info');
        assert.equal(initBuildInfoReveal(), null, 'no title');
        env.reset();
        env.el('welcome-title');
        assert.equal(initBuildInfoReveal(), null, 'no line');
    });

    it('listens on the title and nowhere else: not on the play button, not on the credit line', () => {
        const { title, line, bystanders } = welcomePage();
        const handle = initBuildInfoReveal();
        assert.deepEqual(Object.keys(title.listeners).sort(), ['contextmenu', 'pointercancel', 'pointerdown', 'pointerleave', 'pointermove', 'pointerup']);
        for (const other of [line, ...bystanders]) assert.deepEqual(other.listeners, {}, `${other.id} has no listener`);
        assert.equal(bystanders[0].onclick, null);
        handle.destroy();
    });

    it('reveals after a held press with a mouse, a finger or a pen, by taking the hidden class off', () => {
        const { title, line } = welcomePage();
        const handle = initBuildInfoReveal();
        for (const pointerType of ['mouse', 'touch', 'pen']) {
            fire(title, 'pointerdown', pointer({ pointerType }));
            clock.tick(HOLD_MS - 1);
            assert.equal(isShown(line), false, `${pointerType}: hidden at 599 ms`);
            clock.tick(1);
            assert.equal(isShown(line), true, `${pointerType}: shown at 600 ms`);
            fire(title, 'pointerup');
            assert.equal(isShown(line), true, `${pointerType}: still shown after the release`);
            clock.tick(VISIBLE_MS - 1);
            assert.equal(isShown(line), true);
            clock.tick(1);
            assert.equal(isShown(line), false, `${pointerType}: hidden again after 6 s`);
        }
        assert.equal(clock.pending(), 0);
        handle.destroy();
    });

    it('toggles a class only: no inline style, no hidden attribute, no text change', () => {
        const { title, line } = welcomePage();
        line.textContent = 'v1.2.3 · abcdef0';
        const handle = initBuildInfoReveal();
        fire(title, 'pointerdown');
        clock.tick(HOLD_MS);
        assert.deepEqual(line.style, {});
        assert.deepEqual(line.attributes, {});
        assert.equal(line.textContent, 'v1.2.3 · abcdef0');
        handle.destroy();
    });

    it('only a primary pointer with the main button starts a press (not a second finger, not a right click)', () => {
        const { title, line } = welcomePage();
        const handle = initBuildInfoReveal();
        fire(title, 'pointerdown', pointer({ isPrimary: false, pointerType: 'touch' }));
        fire(title, 'pointerdown', pointer({ button: 2 }));
        fire(title, 'pointerdown', pointer({ button: 1 }));
        clock.tick(60_000);
        assert.equal(isShown(line), false);
        assert.equal(handle.controller.isPressing(), false);
        handle.destroy();
    });

    it('a quick tap does nothing', () => {
        const { title, line } = welcomePage();
        const handle = initBuildInfoReveal();
        fire(title, 'pointerdown');
        clock.tick(120);
        fire(title, 'pointerup');
        clock.tick(60_000);
        assert.equal(isShown(line), false);
        handle.destroy();
    });

    it('pointerup, pointercancel and pointerleave each end a press before the reveal', () => {
        const { title, line } = welcomePage();
        const handle = initBuildInfoReveal();
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
            fire(title, 'pointerdown');
            clock.tick(HOLD_MS - 1);
            fire(title, type);
            clock.tick(60_000);
            assert.equal(isShown(line), false, `${type} cancels the press`);
            assert.equal(clock.pending(), 0, `${type} leaves no timer`);
        }
        handle.destroy();
    });

    it('a pointermove of more than 10 px cancels, up to 10 px does not', () => {
        const { title, line } = welcomePage();
        const handle = initBuildInfoReveal();
        fire(title, 'pointerdown', pointer({ clientX: 100, clientY: 50 }));
        fire(title, 'pointermove', pointer({ clientX: 111, clientY: 50 }));
        clock.tick(60_000);
        assert.equal(isShown(line), false, '11 px');

        fire(title, 'pointerdown', pointer({ clientX: 100, clientY: 50 }));
        fire(title, 'pointermove', pointer({ clientX: 110, clientY: 50 }));
        clock.tick(HOLD_MS);
        assert.equal(isShown(line), true, '10 px');
        handle.destroy();
    });

    it('cancels the title\'s context menu while a press is held, and only then', () => {
        const { title } = welcomePage();
        const handle = initBuildInfoReveal();
        assert.equal(fire(title, 'contextmenu', pointer()).defaultPrevented, false, 'no press: the menu is left alone');

        fire(title, 'pointerdown');
        assert.equal(fire(title, 'contextmenu', pointer()).defaultPrevented, true, 'during the press');
        clock.tick(HOLD_MS);
        assert.equal(fire(title, 'contextmenu', pointer()).defaultPrevented, true, 'after the reveal, finger still down');
        fire(title, 'pointerup');
        assert.equal(fire(title, 'contextmenu', pointer()).defaultPrevented, false, 'after the release');

        fire(title, 'pointerdown');
        fire(title, 'pointermove', pointer({ clientX: 300 }));
        assert.equal(fire(title, 'contextmenu', pointer()).defaultPrevented, false, 'after the press was cancelled by a move');
        fire(title, 'pointerdown');
        fire(title, 'pointercancel');
        assert.equal(fire(title, 'contextmenu', pointer()).defaultPrevented, false, 'after pointercancel');
        handle.destroy();
    });

    it('watches the class of the welcome screen, and hides the line (and ends a press) when that screen is hidden', () => {
        const { title, line, screen } = welcomePage();
        const observers = installFakeObserver();
        try {
            const handle = initBuildInfoReveal();
            assert.equal(observers.created.length, 1);
            const [observer] = observers.created;
            assert.equal(observer.observed[0].target, screen);
            assert.deepEqual(observer.observed[0].options, { attributes: true, attributeFilter: ['class'] });

            fire(title, 'pointerdown');
            clock.tick(HOLD_MS);
            assert.equal(isShown(line), true);

            screen.classList.add('screen-anim'); // a redraw that does not change the screen
            observer.trigger();
            assert.equal(isShown(line), true, 'the screen is still showing');

            screen.classList.add('hidden'); // renderUI moved on to another screen
            observer.trigger();
            assert.equal(isShown(line), false);
            assert.equal(handle.controller.isPressing(), false, 'the finger that was down no longer counts');
            assert.equal(clock.pending(), 0);

            screen.classList.remove('hidden'); // back on the welcome screen: the line did not come back with it
            observer.trigger();
            assert.equal(isShown(line), false);
            handle.destroy();
        } finally {
            observers.restore();
        }
    });

    it('also ends a press that is still being held when the screen changes', () => {
        const { title, line, screen } = welcomePage();
        const observers = installFakeObserver();
        try {
            const handle = initBuildInfoReveal();
            fire(title, 'pointerdown');
            clock.tick(HOLD_MS - 100);
            screen.classList.add('hidden');
            observers.created[0].trigger();
            clock.tick(60_000);
            assert.equal(isShown(line), false);
            handle.destroy();
        } finally {
            observers.restore();
        }
    });

    it('works where MutationObserver does not exist', () => {
        const { title, line } = welcomePage();
        assert.equal(typeof globalThis.MutationObserver, 'undefined');
        const handle = initBuildInfoReveal();
        fire(title, 'pointerdown');
        clock.tick(HOLD_MS);
        assert.equal(isShown(line), true);
        handle.destroy();
    });

    it('destroy removes every listener, stops watching, hides the line and leaves no timer', () => {
        const { title, line } = welcomePage();
        const observers = installFakeObserver();
        try {
            const handle = initBuildInfoReveal();
            fire(title, 'pointerdown');
            clock.tick(HOLD_MS);
            assert.equal(isShown(line), true);
            handle.destroy();
            assert.equal(observers.created[0].disconnected, true);
            for (const [type, listeners] of Object.entries(title.listeners)) assert.deepEqual(listeners, [], `${type} listener removed`);
            assert.equal(isShown(line), false);
            assert.equal(clock.pending(), 0);
            fire(title, 'pointerdown');
            clock.tick(60_000);
            assert.equal(isShown(line), false, 'no listener, so no reveal');
        } finally {
            observers.restore();
        }
    });
});

// --- the markup and the stylesheet the wiring relies on ------------------------------------------------------

describe('the title in index.html and its CSS', () => {
    const all = [...elements(parseHtml(read('index.html')))];
    const titles = all.filter((el) => el.attrs.id === 'welcome-title');
    const title = titles[0];

    it('exists exactly once, and is the heading of the welcome screen (not a button, not a link, not the credit line)', () => {
        assert.equal(titles.length, 1);
        assert.equal(title.tag, 'h1');
        assert.equal(closest(title, (n) => n.attrs.id === 'screen-welcome')?.attrs.id, 'screen-welcome');
        assert.equal(closest(title, (n) => n.tag === 'button' || n.tag === 'a'), null);
        assert.ok(!(title.attrs.class || '').includes('credit-line'));
    });

    it('is still translated like any heading (the id adds nothing a translator could miss)', () => {
        assert.equal(title.attrs['data-i18n'], 'welcome.title');
    });

    it('is not the credit line and not the build line, and neither of them contains it', () => {
        const build = all.find((el) => el.attrs.id === 'build-info');
        assert.notEqual(title, build);
        assert.equal(closest(title, (n) => n === build), null);
        assert.equal(closest(build, (n) => n === title), null);
    });

    it('has a rule in the stylesheet that stops text selection and the touch callout, for the title only', () => {
        const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const rules = [...css.matchAll(/(^|\})\s*([^{}]*#welcome-title[^{}]*)\{([^}]*)\}/g)];
        assert.equal(rules.length, 1, 'one rule names #welcome-title');
        assert.equal(rules[0][2].trim(), '#welcome-title', 'and it names nothing else');
        const body = rules[0][3];
        assert.match(body, /(^|[\s;])user-select:\s*none/);
        assert.match(body, /-webkit-user-select:\s*none/);
        assert.match(body, /-webkit-touch-callout:\s*none/);
        assert.doesNotMatch(body, /touch-action|pointer-events/, 'scrolling and every other touch behaviour stay as they are');
    });

    it('the HTML gives the build line no inline style and the title no inline handler or style', () => {
        for (const el of [title, all.find((e) => e.attrs.id === 'build-info')]) {
            assert.ok(!('style' in el.attrs));
            assert.ok(!Object.keys(el.attrs).some((name) => name.startsWith('on')));
        }
    });
});
