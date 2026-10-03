# Changelog

## Unreleased

### Added

- **Translation core** in `js/i18n/`: `t(key, params)` (active language, then Persian, then the key; plain text, `{name}` parameters), `setLang` / `getLang` / `onLangChange`, `initI18n()` (called first in `main.js`; reads the language saved under `spy_lang`) and a Persian catalog (`fa.js`, registered in `catalogs.js`). Only Persian is supported for now, so nothing changes for players.
- The fixed texts in `index.html` (about 150 texts, `aria-label`s and placeholders, the page title and description) and the help (i) texts now live in the Persian catalog. The Persian text stays in `index.html` as the default, marked with `data-i18n` / `data-i18n-attr`; `applyStaticTranslations()` fills it from the active language when that is not Persian. `INFO_TEXTS` is replaced by `INFO_KEYS` in `data/infoTexts.js` (the texts are `info.<key>.title` / `info.<key>.text` in the catalog), and `showInfoModal` reads them with `t()`.
- Tests for it: `tests/unit/i18n.test.mjs` (lookup, fallback, parameters, plain-text output, `setLang`, `initI18n`, the static translator) and `tests/unit/i18n-html.test.mjs` (keys exist, the Persian text in `index.html` equals the catalog, no untranslated visible text, no unused key), a rule in the import-graph test that `i18n/` never imports from `game/`, `ui/` or `app/`, and a small HTML scanner in `tests/unit/helpers/htmlScan.mjs`.

- **Spy's last chance** setup option (`spyLastChance`, on by default, next to sudden death). When on, a spy caught by the vote still gets to say the secret word aloud, as before. When off, the classic rule applies: the caught spy has no final guess and the round resolves at once (the guess screen is skipped, and the elimination reveal no longer announces a guess). Games saved before the option existed have no value and behave as on.

- Word bank grew from 543 to 741 built-in words (+198): every category now has at least 16 `hard` and 16 `medium` entries, with the small categories (vehicles, sports, events) growing the most.

- Unit tests for the game rules that had none: `game/rounds.js`, `game/voting.js`, `game/resolution.js` and `game/timer.js` (156 tests in `tests/unit/{rounds,voting,resolution,timer}.test.mjs`). They pin today's behaviour (roles, hints, word selection, ballots and ties, scoring, wagers, round results, the countdown) using a small fake browser in `tests/unit/helpers/`, with seeded randomness and a manual clock, so nothing waits and no dependency was added.

- Unit tests for the module graph (`tests/unit/import-cycles.test.mjs`: no import cycles, no missing imports, `core/` never imports upward) and for the new `core/phase.js` and `core/dispatch.js` seams (`tests/unit/phase.test.mjs`).

### Changed

- **A correct word guess is now worth 1, 2 or 3 points on an easy, medium or hard word** (2 for custom words and any word with no rating), instead of a flat 3. `SCORING.SPY_CORRECT_GUESS` is replaced by `SPY_GUESS_BY_DIFFICULTY` and `getSpyGuessPoints()` in `core/config.js`.
- **The guessing spy no longer also collects the round-win points.** A correct guess ends the round for the spy team: the guesser gets only the guess points, every other non-spectator spy (alive or already caught) still gets the round win, and the guesser still counts as a winner in the win statistics.
- The three buttons on the guess screen no longer state point amounts (they depended on a flat rule that no longer exists); a short line under them explains the outcome. The scoring list in the wager help text was updated to match.
- **Broke the import cycles around `dispatch`.** `core/dispatch.js` is now a small port that forwards to a handler; the big action `switch` moved to `app/actions.js`, and `setPhase` / `commitState` moved to `core/phase.js`. `app/wire.js` connects the handler, the screen renderer and the timer's phase-change hook once at start-up (`main.js` calls `wireApp()` first). Game behaviour is unchanged, and `dispatch` and `showInfoModal` are still exported from `core/dispatch.js`. `setPhase` and `commitState` are no longer exported from there; import them from `core/phase.js`.
- Self-host the Vazirmatn font instead of loading it from Google Fonts.
- Split `ui/scorecard.js` into pure layout calculations and canvas rendering.
- CI now uses `npm ci` instead of `npm install`.
- The detective's answer now reads «name» جاسوس است. or «name» شهروند است. (it used to be «name» قطعاً جاسوس است! or «name» شهروند بی‌گناه است.) and is written as plain text. The role card shows the saved sentence exactly as saved, so a game saved before this change still shows its old sentence.

### Fixed

- The "all topics" button on the setup screen promised "+500 words", but the word bank has 741; it now says "+700 words". A test ties the label to the real size of the bank.
- **Correct guess in a one-spy game gave the round to the citizens.** `finalizeRound` checked "no spy left alive" before the forced spy win, and the spy who guessed had just been voted out, so with a single spy the guess paid points but the citizens still won. A correct guess now always gives the spies the round.
- With `spiesCount` at or above the number of players (not reachable from the setup screen), the fool and detective seats were counted from the uncapped spy count, so they went missing. They now follow the spies that were actually assigned.
- The comment on `HIDDEN_TIEBREAK.DEFAULT_MULTIPLIER` said "all"-pool rounds have no multiplier; the default only applies to words with no difficulty rating, such as custom words.
- **Old votes were counted in the next ballot after a time-out.** `votesCast` was only emptied at the start of a round and on the emergency bell, so when the discussion timer ran out (or a saved game whose countdown had already ended was restored) the new ballot still counted the previous ballot's votes, including those of a player who had since been eliminated. That could turn a tie into a win without the wheel and credit `spiesCaught` / `wrongVotes` to a voter no longer in the game. Both time-out paths now start the ballot with no votes; restoring a game saved in the middle of a vote still keeps its partial votes.
- **The detective's answer looked different for a spy and for a citizen, and the role card told them apart by searching the saved text for «جاسوس».** Both answers now have one shape, with no emoji and no colour class, and nothing is decided from the text any more, so translating the interface cannot break it. The name is written with `textContent`, so a name that contains HTML shows as plain text.

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
