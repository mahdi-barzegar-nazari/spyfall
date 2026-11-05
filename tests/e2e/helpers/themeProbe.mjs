/**
 * Opens the production build on a phone-sized page in one theme and one language and reads back, from the browser,
 * the colours that are computed for the buttons, badges, chips, switches and cards (the real ones from the welcome
 * screen, the others as small probe elements made from the app's own classes and kept out of sight).
 * Everything is returned as the strings `getComputedStyle` wrote; tests/unit/helpers/cssTokens.mjs parses them.
 */
import { PHONE, newPage } from './app.mjs';

/** Runs in the page. `probes` are made in a hidden box inside the card, so every rule that depends on an ancestor applies. */
function measureInPage() {
    const box = document.createElement('div');
    box.className = 'hidden';
    document.querySelector('.app-container').appendChild(box);
    const make = (tag, className, parent = box, attrs = {}) => {
        const el = document.createElement(tag);
        el.className = className;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        parent.appendChild(el);
        return el;
    };
    const read = (el, props, pseudo) => {
        const style = getComputedStyle(el, pseudo || null);
        return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
    };
    const FILL = ['background-color', 'background-image', 'color', 'border-top-color', 'box-shadow'];

    const out = {};
    const body = getComputedStyle(document.body);
    out.tokens = Object.fromEntries(['--bg-body', '--surface-card', '--surface-input', '--border-glow', '--text-primary', '--text-secondary', '--brand-primary', '--brand-secondary', '--brand-emerald', '--brand-rose', '--brand-amber'].map((t) => [t, body.getPropertyValue(t).trim()]));
    out.theme = document.body.getAttribute('data-theme');
    out.container = read(document.querySelector('.app-container'), FILL);

    // The real controls of the welcome screen and the setup screen.
    for (const lang of ['fa', 'en']) {
        const el = document.getElementById(`btn-lang-${lang}`);
        out[`lang-${lang}`] = { ...read(el, FILL), pressed: el.getAttribute('aria-pressed') };
    }
    out.play = read(document.querySelector('.play-button'), FILL);
    out.playIcon = read(document.querySelector('.play-button-icon'), ['border-left-color']);
    out.start = read(document.getElementById('btn-start-match'), FILL);
    out.title = read(document.getElementById('welcome-title'), ['background-image']);
    out.shield = read(document.getElementById('panic-shield'), FILL);
    out.hub = read(document.querySelector('.wheel-hub'), ['fill', 'stroke']);
    out.wheelLabel = read(document.querySelector('.wheel-label') || make('text', 'wheel-label', make('svg', 'wheel-svg')), ['fill']);
    out.needle = read(document.querySelector('.wheel-needle-shape'), ['fill', 'stroke']);

    // Probes made from the app's own classes.
    const buttons = {};
    for (const name of ['btn-primary', 'btn-emerald', 'btn-rose', 'btn-amber', 'btn-ghost']) buttons[name] = read(make('button', `btn ${name}`), FILL);
    out.buttons = buttons;
    out.roles = Object.fromEntries(['citizen', 'spy', 'detective', 'spectator'].map((r) => [r, read(make('span', `role-badge role-${r}`), FILL)]));
    out.chip = read(make('div', 'chip-item is-checked'), FILL);
    out.hintChip = read(make('div', 'hint-chip is-checked'), FILL);
    out.hintHard = read(make('div', 'hint-chip hint-chip-hard'), FILL);
    out.hintHardChecked = read(make('div', 'hint-chip hint-chip-hard is-checked'), FILL);
    out.hintTag = read(make('span', 'hint-chip-tag'), FILL);
    out.podium = {};
    for (const rank of [1, 2, 3]) {
        const item = make('div', 'podium-item', box, { 'data-rank': String(rank) });
        out.podium[rank] = { pillar: read(make('div', 'podium-pillar', item), FILL), score: read(make('div', 'podium-score', item), ['color']) };
    }
    out.colorClasses = Object.fromEntries(['violet', 'amber', 'rose', 'emerald', 'primary', 'secondary'].map((c) => [c, read(make('span', `color-${c}`), ['color'])]));
    out.cards = {
        toggleItem: read(make('div', 'toggle-item'), FILL),
        cardMenu: read(make('div', 'card-menu'), FILL),
        playerCard: read(make('div', 'player-card'), FILL),
        accolade: read(make('div', 'accolade-card'), FILL),
        toast: read(make('div', 'toast'), FILL),
        input: read(make('input', 'input-control'), FILL),
        overlay: read(make('div', 'modal-overlay'), FILL),
        handoff: read(document.getElementById('handoff-gate'), FILL)
    };
    const off = make('label', 'switch');
    make('input', '', off, { type: 'checkbox' });
    const sliderOff = make('span', 'slider', off);
    const on = make('label', 'switch');
    const checkedInput = make('input', '', on, { type: 'checkbox' });
    checkedInput.checked = true;
    const sliderOn = make('span', 'slider', on);
    out.slider = { off: read(sliderOff, FILL), on: read(sliderOn, FILL), knob: read(sliderOn, ['background-color'], '::before') };
    out.timer = { warning: read(make('div', 'timer-display timer-warning'), ['color']), danger: read(make('div', 'timer-display timer-danger'), ['color']) };
    box.remove();
    return out;
}

/** Everything `measureInPage` reads, for `theme` and `lang`. Fails if the page reports a script error. */
export async function snapshotTheme(browser, baseUrl, theme, lang) {
    // Reduced motion makes every transition (the buttons fade between themes in 0.2 s) end at once.
    const context = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        if (lang === 'en') await page.click('#btn-lang-en');
        await page.selectOption('#theme-selector', theme);
        await page.waitForFunction((name) => document.body.getAttribute('data-theme') === name && document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState === 'finished'), theme);
        const data = await page.evaluate(measureInPage);
        if (problems.length) throw new Error(`script errors in ${theme}/${lang}: ${problems.join('; ')}`);
        return data;
    } finally {
        await context.close();
    }
}
