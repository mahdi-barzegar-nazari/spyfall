/*
 * Spyfall service worker
 * ------------------------------------------------------------------
 * Built for networks that drop packets: a single slow or failed file must never stop the app from
 * installing or from working offline.
 *
 *  - `scripts/build.mjs` replaces __BUILD_VERSION__ with a hash of every shipped file and fills PRECACHE
 *    with the file list (`scripts/bundle.mjs` then rewrites that list for the bundled site). Any change
 *    yields a new worker and a new shell cache, so installed users always get updates.
 *  - In a source checkout the placeholders stay untouched. The worker then detects DEV mode and never
 *    caches, so local edits show up immediately.
 *
 * Two caches:
 *  - SHELL_CACHE (versioned): the page itself (HTML / JS / CSS / manifest). These files are REQUIRED:
 *    each one is fetched with a timeout and retries; if one still fails, the install fails and the
 *    browser simply tries again later. The previous worker keeps serving meanwhile, so nothing breaks.
 *  - STATIC_CACHE (not versioned, survives updates): fonts and icons under ./assets/. These are
 *    BEST-EFFORT: a timeout or error here never fails the install, and the file is cached the first time
 *    the page manages to load it (runtime caching). Because it is never wiped on update, a font that
 *    was hard to download is not downloaded again for every new version.
 */
const VERSION = '__BUILD_VERSION__';
const PRECACHE = /* __PRECACHE__ */ [];

const DEV = VERSION.startsWith('__');
const CACHE_PREFIX = 'spyfall-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
// Bump this name only when a file under ./assets/ changes without changing its file name.
const STATIC_CACHE = `${CACHE_PREFIX}static-v1`;

const REQUIRED_TIMEOUT_MS = 45000;
const REQUIRED_ATTEMPTS = 3;
const OPTIONAL_TIMEOUT_MS = 30000;
// The install does not wait longer than this for the optional files; they keep loading in the background.
const OPTIONAL_GRACE_MS = 10000;
const RETRY_DELAY_MS = 1500;

const scopeUrl = (path) => new URL(path, self.location).href;
const isStatic = (path) => path.startsWith('./assets/');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `./` and `./index.html` are the same page: download it once, store it under both keys. */
const ALIASES = { './': ['./index.html'] };
const SKIP = new Set(Object.values(ALIASES).flat());

/**
 * Download `path` (bypassing the HTTP cache so a cache never mixes two builds) and store it in `cache`.
 * The timeout covers the whole transfer, headers and body, because on a lossy network the body is what stalls.
 */
async function download(cache, path, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(new Request(scopeUrl(path), { cache: 'reload', signal: controller.signal }));
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        // The body is buffered once, so every key gets its own complete copy.
        const body = await response.blob();
        const type = response.headers.get('content-type') ?? 'application/octet-stream';
        const keys = [path, ...(ALIASES[path] ?? [])];
        await Promise.all(keys.map((key) => cache.put(scopeUrl(key), new Response(body, { headers: { 'content-type': type } }))));
    } finally {
        clearTimeout(timer);
    }
}

async function downloadWithRetries(cache, path, attempts, timeoutMs) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await download(cache, path, timeoutMs);
            return;
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await sleep(RETRY_DELAY_MS * attempt);
        }
    }
    throw lastError;
}

self.addEventListener('install', (event) => {
    if (DEV) {
        event.waitUntil(self.skipWaiting());
        return;
    }
    event.waitUntil((async () => {
        const shell = await caches.open(SHELL_CACHE);
        const statics = await caches.open(STATIC_CACHE);
        const paths = PRECACHE.filter((path) => !SKIP.has(path));
        const required = paths.filter((path) => !isStatic(path));
        const optional = paths.filter(isStatic);

        // Optional files start now, in parallel with the required ones, and never reject.
        const optionalDone = Promise.allSettled(
            optional.map(async (path) => {
                if (await statics.match(scopeUrl(path))) return; // already have it from an earlier version
                await downloadWithRetries(statics, path, 2, OPTIONAL_TIMEOUT_MS);
            })
        );

        // Required files: all of them, or the install fails (and the old worker stays in charge).
        await Promise.all(required.map((path) => downloadWithRetries(shell, path, REQUIRED_ATTEMPTS, REQUIRED_TIMEOUT_MS)));

        // The page is safe offline now. Give the optional files a short grace period, not more.
        await Promise.race([optionalDone, sleep(OPTIONAL_GRACE_MS)]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
        const keys = await caches.keys();
        await Promise.all(
            keys.filter((key) => key.startsWith(CACHE_PREFIX) && !keep.has(key)).map((key) => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (DEV || request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(request, event));
    }
});

/** Look in this build's shell cache, then in the static cache, then the network (and remember what the network gave). */
async function cacheFirst(request, event) {
    const hit =
        (await (await caches.open(SHELL_CACHE)).match(request, { ignoreSearch: true })) ||
        (await (await caches.open(STATIC_CACHE)).match(request, { ignoreSearch: true }));
    if (hit) return hit;

    try {
        const response = await fetch(request);
        // Runtime caching: a font or icon that arrives late is kept, so it is not downloaded again and works offline.
        if (response.ok && response.type === 'basic' && new URL(request.url).pathname.includes('/assets/')) {
            const copy = response.clone();
            event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
        }
        return response;
    } catch (error) {
        // Offline navigation to an unknown URL: show the app instead of a browser error page.
        if (request.mode === 'navigate') {
            const shell = await (await caches.open(SHELL_CACHE)).match(scopeUrl('./index.html'));
            if (shell) return shell;
        }
        throw error;
    }
}
