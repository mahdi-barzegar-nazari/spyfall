<div align="center">

# 🕵️ Spyfall PWA · بازی دورهمی جاسوس

**An offline-first, single-device social-deduction party game. Pass one phone around the room.**
Persian (RTL) UI · zero runtime dependencies · installable on Android and iOS

[![CI](https://github.com/mahdi-barzegar-nazari/spyfall/actions/workflows/ci.yml/badge.svg)](https://github.com/mahdi-barzegar-nazari/spyfall/actions/workflows/ci.yml)
[![Deploy](https://github.com/mahdi-barzegar-nazari/spyfall/actions/workflows/deploy.yml/badge.svg)](https://github.com/mahdi-barzegar-nazari/spyfall/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/github/license/mahdi-barzegar-nazari/spyfall?style=flat-square)](./LICENSE)
[![PWA](https://img.shields.io/badge/PWA-offline--ready-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](#offline-first-and-safe-updates)
[![Vanilla JS](https://img.shields.io/badge/vanilla-ES_modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](#architecture)
[![Dependencies: 0](https://img.shields.io/badge/runtime_dependencies-0-brightgreen?style=flat-square)](./package.json)
[![Support](https://img.shields.io/badge/support-buy_me_a_coffee-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=black)](https://www.coffeete.ir/MahdiBN)

**[▶ Play the live demo](https://mahdi-barzegar-nazari.github.io/spyfall/)**

</div>

---

## Overview

Spyfall is a social-deduction game: everyone gets the same secret word except the spy, who only gets a hint. Players question each other, then vote on who the spy is. This project runs the whole game on **one phone that is handed around**, so no accounts, room codes, servers, or internet connection are needed once the page has loaded.

The game engine runs entirely in the browser with no framework. It ships as native ES modules, a service worker, and plain CSS.

## Features

- **Pass-and-play privacy.** A hand-off gate names who should hold the phone before any secret is shown, and a floating **Cover Mode** (حالت پوشش) hides the screen instantly if someone peeks.
- **Roles and modifiers.** Spies (1 to 5), Detective, Fool, known-spy networks, secret side quests, one-word rounds, a question director, sudden death, and player wagers.
- **Fair tie-breaking.** Tied votes are settled by a spinning SVG wheel backed by a crypto-random pick, plus a hidden scoring tie-breaker so shared ranks are rare.
- **Crash-safe.** The match and the exact seconds left on the timer are saved to `localStorage`. Reload or background the app and you can resume.
- **Shareable results.** A 9:16 scorecard image is drawn client-side on a `<canvas>`.
- **Synthesised audio.** Sound cues come from the Web Audio API, so there are no audio files to download.
- **543 built-in words** in 8 categories with difficulty ratings, plus a custom word bank you can import and export as JSON.
- **8 themes**, dynamic viewport sizing (`100dvh`) and safe-area padding for edge-to-edge phones.

## Quickstart

### Just play

Open the [live demo](https://mahdi-barzegar-nazari.github.io/spyfall/) and choose *Add to Home Screen* (Android also shows an install button).

### Run locally

**Prerequisites:** Node.js 22 or newer. The app itself needs nothing else; ES modules only work over `http://`, not `file://`, so use the bundled dev server.

```bash
git clone https://github.com/mahdi-barzegar-nazari/spyfall.git
cd spyfall

npm run dev            # serves the source tree at http://localhost:8080 (service worker stays inert)
npm run build          # writes the deployable site to ./dist with a stamped service worker
npm run preview        # serves ./dist to test real offline caching
```

### Develop and test

```bash
npm install            # dev tooling only: ESLint, Prettier, Playwright
npm test               # 73 unit tests (built-in node:test, no dependencies)
npx playwright install chromium
npm run test:e2e       # real-browser smoke test of the production build, including offline mode
npm run lint
```

## Architecture

```text
.
├── index.html                 # semantic markup only; loads css/style.css and js/main.js
├── css/style.css              # design tokens, 8 themes, components, utility classes
├── js/
│   ├── main.js                # entry point: wires modules together in start-up order
│   ├── core/                  # config (rules, scoring), state, storage, dispatch (control flow)
│   ├── game/                  # timer, rounds, voting, resolution and scoring, ranking
│   ├── ui/                    # rendering, setup form, wheel, podium, scorecard, event bindings
│   ├── platform/              # audio, wake lock, anti-zoom, install prompt, service worker registration
│   ├── data/                  # word bank, side quests, help texts
│   └── utils/                 # text and random helpers (pure)
├── sw.js                      # service worker (versioned app-shell precache)
├── manifest.json              # PWA manifest
├── assets/icons/              # 192, 512 and padded maskable icons
├── scripts/                   # build.mjs (dist + SW stamping), serve.mjs (dev server)
├── tests/                     # unit (node:test) and e2e (Playwright)
└── .github/workflows/         # CI and GitHub Pages deployment
```

State lives in one object (`core/state.js`). Every user action becomes a `dispatch({ type, payload })` call, which mutates state, persists it, and re-renders. A short walkthrough of the modules, the state model, and the known trade-offs is in [`docs/architecture.md`](./docs/architecture.md).

### Offline-first and safe updates

The service worker precaches every shipped file and serves it cache-first, so the game works with no connection. The classic risk of that strategy is users being stuck on an old version forever, so:

- `scripts/build.mjs` stamps `sw.js` with a **hash of all shipped files**. Any change produces a new worker and a new cache; unchanged sources produce the same version.
- Precaching bypasses the HTTP cache, so a cache never mixes files from two builds.
- Old caches are deleted on activate. The app shows a toast when a new version has installed; it applies the next time the app is opened, so a game in progress is never interrupted.
- In a source checkout (`npm run dev`) the worker caches nothing, so local edits appear immediately.

## Deployment

Pushes to `main` run [`deploy.yml`](./.github/workflows/deploy.yml): unit tests, then build, then publish `dist/` to GitHub Pages. One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Roadmap

- [ ] Rebalance the word bank: only 5 of 543 words are rated "hard", so that difficulty setting repeats words quickly
- [x] Self-host the Vazirmatn font (it currently loads from Google Fonts; the service worker caches it after the first online visit)
- [ ] Break the `core` / `game` / `ui` import cycles around `dispatch` (events or dependency injection)
- [ ] Split `ui/scorecard.js` (400 lines of canvas drawing) into layout and rendering
- [x] Move the remaining inline styles built in JS templates into CSS classes, then drop `'unsafe-inline'` from `style-src`
- [ ] English UI translation

## Contributing

Bug reports and pull requests are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Support

This is a solo, spare-time project, maintained between classes and other work. If you enjoy the game and want to help keep it going, you can [buy me a coffee ☕](https://www.coffeete.ir/MahdiBN).

## License

Released under the [MIT License](./LICENSE). This includes the word bank.

Made by [Mahdi Barzegar Nazari](https://github.com/mahdi-barzegar-nazari).
