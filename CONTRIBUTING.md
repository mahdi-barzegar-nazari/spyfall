# Contributing

Thanks for your interest! This is a small, dependency-free project, and contributions of any size are welcome.

## Setup

You need Node.js 22 or newer.

```bash
git clone https://github.com/mahdi-barzegar-nazari/spyfall.git
cd spyfall
npm install                       # dev tooling only
npm run dev                       # http://localhost:8080
```

## Before opening a pull request

```bash
npm run lint
npm test                          # unit tests
npm run build && npm run test:e2e # needs: npx playwright install chromium
```

## Guidelines

- **No runtime dependencies and no build step for the app itself.** Source files are what the browser runs.
- **Keep `index.html` free of inline styles, scripts, and event handlers.** A unit test enforces this. Use the utility classes at the end of `css/style.css` or add a class.
- **Every user action goes through `dispatch()`.** Bind events in `ui/bindings.js`; put game rules in `game/`; keep DOM code out of `utils/`, `core/config.js`, and `game/ranking.js` so they stay unit-testable.
- **Adding a file that ships?** Nothing to register: `scripts/build.mjs` discovers files and precaches them automatically. Run `npm run build` to check that every import and HTML reference resolves.
- **Adding words:** append to the matching category in `js/data/wordPacks.js` with `{ word, foolWord, hint, diff }`. The data tests reject duplicates and malformed entries. Words rated `hard` are especially welcome.
- **Persian text:** keep UI strings in Persian and use Persian digits for numbers shown to players (`toPersianDigits`).
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `ci:`).

## Saved-game compatibility

Saved matches carry a `SAVE_VERSION` (`js/core/state.js`). If you change the shape of `gameState`, bump it so old saves are discarded instead of crashing.

## Reporting bugs

Please include your device and browser, what you did, and what you expected. For gameplay bugs, the game state in `localStorage['spy_full_state_master']` helps a lot.
