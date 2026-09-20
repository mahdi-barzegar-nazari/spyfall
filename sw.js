/*
 * Spyfall service worker
 * ------------------------------------------------------------------
 * Strategy: a versioned app-shell precache served cache-first.
 *
 *  - `scripts/build.mjs` replaces __BUILD_VERSION__ with a hash of every shipped file and
 *    fills PRECACHE with the file list. Any change to any file therefore yields a new
 *    service worker and a brand-new cache, so installed users always get updates.
 *  - In a source checkout the placeholders stay untouched. The worker then detects DEV mode
 *    and never caches, so local edits show up immediately.
 *  - Precaching bypasses the HTTP cache (cache: 'reload') so a cache can never mix files
 *    from two different builds.
 *  - Old caches are deleted on activate. This also clears the legacy `spyfall-v1` cache
 *    left behind by the previous, never-invalidated worker.
 *  - Google Fonts (cross-origin) are cached separately, stale-while-revalidate, so the
 *    typeface still renders offline after the first online visit.
 */
const VERSION = '__BUILD_VERSION__';
const PRECACHE = /* __PRECACHE__ */ [];

const DEV = VERSION.startsWith('__');
const CACHE_PREFIX = 'spyfall-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}fonts-v1`;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (event) => {
    if (DEV) {
        event.waitUntil(self.skipWaiting());
        return;
    }
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, FONT_CACHE]);
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
        event.respondWith(shellFirst(request));
    } else if (FONT_HOSTS.has(url.hostname)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

/** Serve the app shell from this build's cache; fall back to the network. */
async function shellFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
        return await fetch(request);
    } catch (error) {
        // Offline navigation to an unknown URL: show the app instead of a browser error page.
        if (request.mode === 'navigate') {
            const shell = await cache.match('./index.html');
            if (shell) return shell;
        }
        throw error;
    }
}

/** Return the cached copy immediately and refresh it in the background. */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(FONT_CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request)
        .then((response) => {
            // Cross-origin <link> stylesheets come back opaque (status 0); those are fine to keep.
            if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
            return response;
        })
        .catch(() => undefined);
    return cached || (await refresh) || Response.error();
}
