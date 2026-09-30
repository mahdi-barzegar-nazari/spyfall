# Changelog

## Unreleased

### Added

- Word bank grew from 543 to 741 built-in words (+198): every category now has at least 16 `hard` and 16 `medium` entries, with the small categories (vehicles, sports, events) growing the most.

- Unit tests for the game rules that had none: `game/rounds.js`, `game/voting.js`, `game/resolution.js` and `game/timer.js` (156 tests in `tests/unit/{rounds,voting,resolution,timer}.test.mjs`). They pin today's behaviour (roles, hints, word selection, ballots and ties, scoring, wagers, round results, the countdown) using a small fake browser in `tests/unit/helpers/`, with seeded randomness and a manual clock, so nothing waits and no dependency was added.

- Unit tests for the module graph (`tests/unit/import-cycles.test.mjs`: no import cycles, no missing imports, `core/` never imports upward) and for the new `core/phase.js` and `core/dispatch.js` seams (`tests/unit/phase.test.mjs`).

### Changed

- **Broke the import cycles around `dispatch`.** `core/dispatch.js` is now a small port that forwards to a handler; the big action `switch` moved to `app/actions.js`, and `setPhase` / `commitState` moved to `core/phase.js`. `app/wire.js` connects the handler, the screen renderer and the timer's phase-change hook once at start-up (`main.js` calls `wireApp()` first). Game behaviour is unchanged, and `dispatch` and `showInfoModal` are still exported from `core/dispatch.js`. `setPhase` and `commitState` are no longer exported from there; import them from `core/phase.js`.
- Self-host the Vazirmatn font instead of loading it from Google Fonts.
- Split `ui/scorecard.js` into pure layout calculations and canvas rendering.
- CI now uses `npm ci` instead of `npm install`.

## 2.0.0

### Changed

- **Split the 5,000-line single-file app** into `index.html`, `css/style.css`, and 31 ES modules under `js/`. Game behaviour is unchanged; this was verified by playing identical seeded games on the old and new builds and comparing visible text, saved state, computed styles, and the exported scorecard image.
- `gameState` and `hostSecretState` are restored in place (`replaceGameState`, `replaceHostSecrets`) instead of being reassigned; loose UI variables moved into a `session` object; the timer and mute state are owned by `game/timer.js` and `platform/audio.js`.
- Icons moved to `assets/icons/`; the maskable icon is now a separate, padded image.
- The 21 inline `style` attributes in the markup became utility classes; the runtime patch of the "+500 words" label moved into the HTML.
- Removed dead code inherited from the single-file version: `checkWagerCompletion()` was declared but never called.
- Content Security Policy no longer allows inline scripts, and the ineffective `frame-ancestors` directive was removed from the `<meta>` policy.

### Fixed

- **Service worker never invalidated its cache.** The cache name was fixed (`spyfall-v1`) and every request was cache-first, so installed users kept the first version forever. The build now stamps the worker with a content hash, precaches with `cache: 'reload'`, deletes old caches on activate (including the legacy one), and the app announces when an update is ready.
- Cross-origin fonts are cached for offline use after the first online visit.

### Added

- MIT `LICENSE` (the previous README said "all rights reserved").
- GitHub Actions: CI (lint, unit, build, end-to-end) and GitHub Pages deployment.
- `scripts/build.mjs` (integrity checks, hashing, precache list) and `scripts/serve.mjs`.
- 73 unit tests and 3 end-to-end tests; ESLint, Prettier and EditorConfig.
- `docs/architecture.md`, `CONTRIBUTING.md`, Dependabot.
