/**
 * Which build this is. `scripts/build.mjs` replaces the two placeholders below with the "version" of
 * package.json and with the build hash it stamps into sw.js as VERSION (the same string). This file is
 * hashed with its placeholders (like sw.js), so the stamped values never feed back into the hash.
 *
 * In a source checkout nothing replaces them: BUILD_HASH keeps its leading "__", which is the same dev
 * test sw.js uses (`VERSION.startsWith('__')`), and `ui/buildInfo.js` then shows "dev".
 *
 * Pure data, no imports. Keep both statements exactly as written: the build looks for them.
 */
export const APP_VERSION = '__APP_VERSION__';
export const BUILD_HASH = '__BUILD_HASH__';
