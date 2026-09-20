#!/usr/bin/env node
/**
 * Tiny static file server for local development (ES modules need http://, not file://).
 *
 *   node scripts/serve.mjs [directory] [port]
 *
 * Serve the repository root for live source edits (the service worker stays inert in dev),
 * or serve ./dist to test the production build with real offline caching.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

/** Start a static file server for `directory`. Resolves with the http.Server once listening. */
export function startServer(directory, port = 0) {
    const root = resolve(directory);
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let file = normalize(join(root, pathname));
        if (file !== root && !file.startsWith(root + sep)) {
            res.writeHead(403).end('Forbidden');
            return;
        }
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        if (!existsSync(file)) {
            res.writeHead(404).end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        res.end(readFileSync(file));
    });
    return new Promise((done) => server.listen(port, () => done(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const directory = process.argv[2] ?? '.';
    const server = await startServer(directory, Number(process.argv[3] ?? 8080));
    console.log(`Serving ${resolve(directory)} at http://localhost:${server.address().port}`);
}
