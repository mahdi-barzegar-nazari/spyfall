/**
 * Just enough browser to import and drive the game modules under Node, with no dependencies.
 *
 * Why this exists: `platform/audio.js` reads `window.AudioContext` when it is imported, and the game
 * modules call `document`, `localStorage`, `navigator` and the timer functions while they run. ES
 * imports are hoisted, so a test must call `installFakeEnv()` first and load the game modules
 * afterwards with `await import(...)`.
 *
 * Everything here is a recording fake: it never plays sound, opens a window or waits for real time.
 * `env.uninstall()` puts every global back and throws if a global was added or lost.
 */

/** Small seeded PRNG (mulberry32), so "random" tests replay the same sequence every time. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A manual clock behind setTimeout/setInterval. Time only moves when a test calls `tick(ms)`.
 * Timers scheduled from inside a callback run in the same `tick` if they fall inside its window
 * (node:test's `mock.timers` does not do that, and it prints an ExperimentalWarning on Node 22).
 */
function createClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    const add = (fn, ms, repeat) => {
        const id = nextId++;
        const delay = Math.max(1, Number(ms) || 0);
        timers.set(id, { id, fn, delay, repeat, at: now + delay });
        return id;
    };
    return {
        setTimeout: (fn, ms) => add(fn, ms, false),
        setInterval: (fn, ms) => add(fn, ms, true),
        clear: (id) => {
            timers.delete(id);
        },
        /** Number of timers and intervals that are still armed. */
        pending: () => timers.size,
        tick(ms) {
            const end = now + ms;
            for (;;) {
                let next = null;
                for (const t of timers.values()) {
                    if (t.at <= end && (!next || t.at < next.at)) next = t;
                }
                if (!next) break;
                now = next.at;
                if (next.repeat) next.at += next.delay;
                else timers.delete(next.id);
                next.fn();
            }
            now = end;
        }
    };
}

export class FakeElement {
    constructor(id = '', tagName = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parent = null;
        this.dataset = {};
        this.style = {};
        this.attributes = {};
        this.listeners = {};
        this.classes = new Set();
        this.textContent = '';
        this.innerHTML = '';
        this.value = '';
        this.disabled = false;
        this.onclick = null;
        this.classList = {
            add: (...names) => names.forEach((n) => this.classes.add(n)),
            remove: (...names) => names.forEach((n) => this.classes.delete(n)),
            contains: (name) => this.classes.has(name)
        };
    }

    get className() {
        return [...this.classes].join(' ');
    }

    set className(value) {
        this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }

    get firstElementChild() {
        return this.children[0] || null;
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...nodes) {
        this.children.forEach((child) => {
            child.parent = null;
        });
        this.children = [];
        this.textContent = '';
        nodes.forEach((node) => this.appendChild(node));
    }

    remove() {
        if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
        this.parent = null;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return name in this.attributes ? this.attributes[name] : null;
    }

    removeAttribute(name) {
        delete this.attributes[name];
    }

    addEventListener(type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }

    removeEventListener(type, fn) {
        this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    }

    getBoundingClientRect() {
        return { top: 0, left: 0, width: 0, height: 0 };
    }
}

const TIMER_GLOBALS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];

export function installFakeEnv() {
    const namesBefore = Object.getOwnPropertyNames(globalThis).sort();
    const originalRandom = Math.random;
    const originals = new Map();
    const dom = { byId: new Map(), queries: new Map() };
    const store = new Map();
    const sentinels = [];
    const logs = {
        oscillators: [],
        constantSources: [],
        vibrations: [],
        wakeLocks: [],
        /** Oscillators that were started as a siren (sawtooth wave). */
        sirens: () => logs.oscillators.filter((o) => o.type === 'sawtooth').length,
        /** Frequencies of every plain tone, in the order they were played. */
        tones: () => logs.oscillators.filter((o) => o.type !== 'sawtooth').map((o) => o.frequency.value)
    };
    let clock = null;

    const define = (name, value) => {
        if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, {
            value,
            configurable: true,
            writable: true,
            enumerable: true
        });
    };
    const restore = (name) => {
        if (!originals.has(name)) return;
        const descriptor = originals.get(name);
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
        originals.delete(name);
    };

    class FakeAudioContext {
        constructor() {
            this.state = 'running';
            this.currentTime = 0;
            this.destination = {};
        }

        resume() {
            return Promise.resolve();
        }

        createGain() {
            return {
                gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                connect() {}
            };
        }

        createOscillator() {
            const osc = {
                type: 'sine',
                frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
                connect() {},
                start() {},
                stop() {}
            };
            logs.oscillators.push(osc);
            return osc;
        }

        createConstantSource() {
            const src = {
                started: false,
                stopped: false,
                connect() {},
                disconnect() {},
                start() {
                    src.started = true;
                },
                stop() {
                    src.stopped = true;
                }
            };
            logs.constantSources.push(src);
            return src;
        }
    }

    define('window', { AudioContext: FakeAudioContext });
    define('document', {
        getElementById: (id) => dom.byId.get(id) || null,
        querySelectorAll: (selector) => dom.queries.get(selector) || [],
        querySelector: (selector) => (dom.queries.get(selector) || [])[0] || null,
        createElement: (tag) => new FakeElement('', tag),
        createTextNode: (text) => ({ nodeType: 3, textContent: String(text), parent: null }),
        createElementNS: (ns, tag) => new FakeElement('', tag)
    });
    define('navigator', {
        vibrate: (pattern) => {
            logs.vibrations.push(pattern);
            return true;
        },
        wakeLock: {
            request: async (type) => {
                logs.wakeLocks.push(type);
                const sentinel = { released: false, addEventListener() {} };
                sentinels.push(sentinel);
                return sentinel;
            }
        }
    });
    define('localStorage', {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
            store.set(key, String(value));
        },
        removeItem: (key) => {
            store.delete(key);
        },
        clear: () => store.clear()
    });
    // The wheel starts its CSS transition inside requestAnimationFrame; run it straight away.
    define('requestAnimationFrame', (fn) => {
        fn();
        return 0;
    });

    const installCrypto = (next) => {
        const realCrypto = globalThis.crypto;
        define('crypto', {
            getRandomValues(array) {
                array[0] = next();
                return array;
            },
            randomUUID: () => realCrypto.randomUUID()
        });
    };

    const restoreTimers = () => {
        TIMER_GLOBALS.forEach(restore);
        clock = null;
    };

    const env = {
        logs,
        /** The fake localStorage contents (a Map of key to string). */
        storage: store,

        /** Create (or fetch) the element `document.getElementById(id)` will return. */
        el(id) {
            if (!dom.byId.has(id)) dom.byId.set(id, new FakeElement(id));
            return dom.byId.get(id);
        },

        /** Make `document.querySelectorAll(selector)` return `elements`. */
        stubQuery(selector, elements) {
            dom.queries.set(selector, elements);
        },

        /** An `<input>` with an optional `data-player-id`. */
        input(value, playerId) {
            const input = new FakeElement('', 'input');
            input.value = value;
            if (playerId !== undefined) input.dataset.playerId = playerId;
            return input;
        },

        /** Texts of the toasts currently on screen. */
        toasts() {
            const container = dom.byId.get('toast-container');
            return container ? container.children.map((c) => c.textContent) : [];
        },

        /** Swap the global timers for a manual clock. Returns it (also available as `env.clock`). */
        installTimers() {
            restoreTimers();
            clock = createClock();
            define('setTimeout', clock.setTimeout);
            define('setInterval', clock.setInterval);
            define('clearTimeout', clock.clear);
            define('clearInterval', clock.clear);
            return clock;
        },

        get clock() {
            return clock;
        },

        /** Replay the same "random" numbers: seeds Math.random and crypto.getRandomValues. */
        seedRandom(seed) {
            const random = mulberry32(seed);
            Math.random = random;
            installCrypto(() => Math.floor(random() * 4294967296));
        },

        /** Make crypto.getRandomValues return `next(callIndex)`; randomUUID stays real. */
        stubCrypto(next) {
            let calls = 0;
            installCrypto(() => next(calls++));
        },

        /** Forget everything a test did; leaves the fakes installed. */
        reset() {
            dom.byId.clear();
            dom.queries.clear();
            store.clear();
            logs.oscillators.length = 0;
            logs.constantSources.length = 0;
            logs.vibrations.length = 0;
            logs.wakeLocks.length = 0;
            // A released sentinel makes wakeLock.js ask for a new lock on its next call.
            sentinels.forEach((s) => {
                s.released = true;
            });
            sentinels.length = 0;
            restoreTimers();
            restore('crypto');
            Math.random = originalRandom;
        },

        /** Put every global back, and fail loudly if anything was left behind or lost. */
        uninstall() {
            env.reset();
            [...originals.keys()].forEach(restore);
            const namesAfter = Object.getOwnPropertyNames(globalThis).sort();
            const leaked = namesAfter.filter((n) => !namesBefore.includes(n));
            const lost = namesBefore.filter((n) => !namesAfter.includes(n));
            if (leaked.length || lost.length || Math.random !== originalRandom) {
                throw new Error(`fake env left globals behind: +[${leaked}] -[${lost}]`);
            }
        }
    };
    return env;
}
