# 🕵️ Spyfall PWA (بازی دورهمی جاسوس)

An offline-first, single-device pass-and-play Progressive Web App designed for local gatherings and social deduction gameplay.

> **Live Demo:** [Launch Web App](https://mahdi-barzegar-nazari.github.io/spyfall/)

---

## 📖 Overview

**Spyfall PWA** is a web-based adaptation of the classic social deduction game, designed to run on a single mobile device passed between players. It eliminates the need for multiple app installations, active internet connections, or room codes during in-person gatherings.

Built with pure vanilla web technologies, the game engine runs entirely on the client side with zero framework dependencies, providing offline availability and standalone display modes on mobile devices.

---

## 🌟 Highlights & Key Features

- **Single-Device Pass-and-Play:** Turn progression is managed through privacy-preserving **Handoff Gates**, paired with an emergency double-tap **Cover Mode (حالت پوشش)** to prevent accidental role exposure.
- **Offline-First Architecture:** Core assets and game logic are cached via a custom Service Worker lifecycle and the Cache API, enabling full offline play after the initial visit. Supports WebAPK installation on Chromium/Android and standalone display mode on iOS Safari.
- **Dynamic Roles & Modifiers:** Includes modular roles such as Detective (کارآگاه) and Fool (ساده‌لوح), known spy networks, customizable side quests, player wagers, and an interactive SVG tie-breaker wheel.
- **State Persistence & Interruption Handling:** Match state and the discrete seconds remaining on the discussion timer are persisted to `localStorage`, so the countdown pauses cleanly on reload or when the app is backgrounded, instead of continuing to drain in the background.
- **Canvas Scorecard Export:** Client-side 9:16 scorecard generation using the HTML5 Canvas API, rendering player statistics and podium standings for direct saving to the device.
- **In-Browser Audio Synthesis:** Audio feedback and timer cues are generated on demand via the Web Audio API, with no external audio files to download.
- **Responsive RTL Theming:** 8 selectable themes — from a neon-galaxy default to a black-and-white classic cinema look (سینمای کلاسیک) and a noir palette (نوآر کلاسیک) — with dynamic viewport sizing (`100dvh`) and safe-area inset padding for edge-to-edge screens.

---

## 🎮 How to Play

1. **Set Up the Match:** Choose player count, spy ratio, discussion duration, and toggle optional roles (Detective, Fool, Quests, Wagers).
2. **Secret Handoff:** Pass the phone sequentially. Each participant confirms their turn via the **Handoff Gate**, reveals their secret role and word (via tap or hold-to-reveal), and closes the card before passing. The floating **Cover Mode** shield can be engaged at any point to block peeking.
3. **Interrogation Round:** Start the countdown. Players take turns asking targeted questions to identify the spy without revealing the secret location.
4. **Accusation & Scoring:** Vote on the suspect's identity, resolve ties using the chance wheel, and view the final match standings and podium.

---

## 📁 Repository Structure

| File | Type | Description |
| :--- | :--- | :--- |
| `index.html` | Core Application (Production Build) | Bundled and minified single-file production build containing markup, scoped styles, and game logic — optimized for runtime performance, with minification also providing a reasonable layer of obfuscation for the client-side word bank. |
| `sw.js` | Service Worker | Precaching lifecycle and network-first/cache-fallback handling |
| `manifest.json` | Web App Manifest | Standalone display settings, portrait lock, and installation metadata |
| `icon-192.png` | Asset | App icon for standard mobile pixel densities |
| `icon-512.png` | Asset | High-resolution icon for splash screens and maskable app icons |

---

## 🛠️ Tech Stack & Environment

- **Core:** Vanilla JavaScript (ES6+), Semantic HTML5, CSS3 Custom Properties
- **Browser APIs:** Service Worker API, Cache Storage API, Web Audio API, Canvas API
- **Typography:** RTL Persian system font stack (Tahoma, Segoe UI, system-ui) with a progressive Google Fonts (`Vazirmatn`) enhancement when a connection is available
- **Dependencies:** None — a fully self-contained client-side application with no build tooling or external packages

---

## 🧠 Engineering & Workflow Statement

This project was built and iterated through **AI-assisted software engineering**:

- **Product & System Design:** Domain logic, game mechanics, state machine structure, and Persian localization directed by [Mahdi Barzegar Nazari](https://github.com/mahdi-barzegar-nazari).
- **Implementation:** Built through structured prompting, iterative refactoring, and deterministic constraint enforcement to produce clean, framework-free code.
- **QA & Mobile Optimization:** Manually tested across mobile Chromium environments (WebAPK), desktop browsers, and a range of responsive viewports to resolve touch-zoom traps, viewport overflow, and timer desynchronization.

---

## ❤️ Support the Project

Spyfall PWA is free to play and ad-free, and it's meant to stay that way — it was built for the simple pleasure of a good game night with friends.

If you've enjoyed it and would like to support further development, you're welcome to [buy the developer a coffee ☕](https://www.coffeete.ir/mhd_barzegar) — this is entirely optional and never required to use any feature of the app.

Found a bug, have a word suggestion for the bank, or an idea for a new feature? Please open an [Issue](https://github.com/mahdi-barzegar-nazari/spyfall/issues) — feedback and contributions are always welcome.

---

## © Copyright & Fair Use

Copyright © 2026 Mahdi Barzegar Nazari. All rights reserved.

This project is made publicly available for portfolio and educational purposes.

- ✅ Personal, non-commercial use and testing of the live application is freely permitted.
- 🚫 Redistribution or republishing of the source code, in whole or in part, without prior written permission is not permitted.
- 🚫 Scraping or otherwise extracting the Persian word bank for commercial purposes is not permitted.

For licensing inquiries or permission requests, please reach out via [GitHub Issues](https://github.com/mahdi-barzegar-nazari/spyfall/issues) or [Instagram](https://www.instagram.com/mhd.barzegar).
