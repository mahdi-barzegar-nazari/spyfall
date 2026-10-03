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
- **Every user action goes through `dispatch()`.** Bind events in `ui/bindings.js`; put game rules in `game/`; keep DOM code out of `utils/`, `core/config.js`, and `game/ranking.js` so they stay unit-testable. A new action is a new `case` in `handleAction` (`app/actions.js`).
- **Keep imports acyclic.** Import `dispatch` from `core/dispatch.js` and `setPhase` / `commitState` from `core/phase.js`; never import `app/` from anywhere but `main.js`, and never import `game/` or `ui/` from `core/`, and never import `game/`, `ui/` or `app/` from `i18n/`. `npm test` fails on a cycle and prints the path.
- **Adding a file that ships?** Nothing to register: `scripts/build.mjs` discovers files and precaches them automatically. Run `npm run build` to check that every import and HTML reference resolves.
- **Adding words:** append to the matching category in `js/data/wordPacks.js` with `{ word, foolWord, hint, diff }`. The data tests reject duplicates and malformed entries. Words rated `hard` are especially welcome.
- **Texts:** every text a player can see comes from the translation catalogs (see [Adding or changing a text](#adding-or-changing-a-text)). Keep the Persian wording Persian, with ZWNJ where it belongs, and use Persian digits for numbers shown to players (`toPersianDigits`).
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `ci:`).

## Adding or changing a text

1. **Pick a key** in `js/i18n/fa.js`: dotted, English, grouped under the screen's comment (`setup.title`, `result.col.player`). Values are plain text; use `{name}` for a parameter. Never put HTML in a value.
2. **Text in `index.html`:** keep the Persian text in the HTML as the default and add `data-i18n="key"` to the element (leaf elements only: it replaces the whole `textContent`; if the text sits next to other children, wrap it in `<span data-i18n="key">`). For attributes use `data-i18n-attr="aria-label:key;placeholder:key"`. The HTML text and the catalog value must be equal after whitespace is collapsed; a test fails otherwise.
3. **Text in JS:** use `t('key', { name })`. If the result goes into `innerHTML`, escape it (and any parameter) first; `t()` returns plain text and escapes nothing. Texts that JS still writes as Persian literals are being moved to the catalog step by step.
4. **A new help (i) text:** add the key to `INFO_KEYS` (`js/data/infoTexts.js`), the two entries `info.<key>.title` and `info.<key>.text` to the catalog, and a `data-info="<key>"` button.
5. Run `npm test`. It fails on a missing key, an HTML/catalog mismatch, a Persian text in `index.html` that is not translatable, and a catalog key nothing uses.

## Saved-game compatibility

Saved matches carry a `SAVE_VERSION` (`js/core/state.js`). If you change the shape of `gameState`, bump it so old saves are discarded instead of crashing.

## Reporting bugs

Please include your device and browser, what you did, and what you expected. For gameplay bugs, the game state in `localStorage['spy_full_state_master']` helps a lot.
