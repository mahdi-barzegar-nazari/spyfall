/**
 * Every part of the UI follows the selected theme, checked in a real Chromium at 360x740 against the PRODUCTION
 * build: for each of the eight themes (and both languages) the colours the browser computes for the selected
 * language button, the main button, the play button, the chips, badges, switches, cards and scrims are read back
 * and compared with the theme's tokens, with the other themes, and (for the colours that carry a meaning) with
 * themselves in every theme. Text contrast is measured on the computed colours, not on the CSS.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { contrastRatio, effectiveTokens, gradientStops, over, parseColor, parseCssColor, readProjectFile, readThemeBlocks } from '../unit/helpers/cssTokens.mjs';
import { startApp } from './helpers/app.mjs';
import { snapshotTheme } from './helpers/themeProbe.mjs';

const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
const LANGS = ['fa', 'en'];
const themeBlocks = readThemeBlocks(readProjectFile('css/style.css'));

let app;
/** snap[theme][lang] = what snapshotTheme read. */
const snap = {};

before(async () => {
    app = await startApp();
    for (const theme of THEMES) {
        snap[theme] = {};
        for (const lang of LANGS) snap[theme][lang] = await snapshotTheme(app.browser, app.baseUrl, theme, lang);
    }
});
after(async () => {
    await app?.stop();
});

// ---------------------------------------------------------------- small helpers

const rgb255 = (hex) => parseColor(hex);
const tokensOf = (theme) => effectiveTokens(themeBlocks, theme);
const color = (text) => {
    const parsed = parseCssColor(text);
    assert.ok(parsed, `cannot read the colour "${text}"`);
    return parsed;
};
/** `mix` of two [r, g, b] colours: `share` (0-1) of `a`. */
const mix = (a, b, share) => a.map((v, i) => v * share + b[i] * (1 - share));
const near = (actual, expected, tolerance, what) => {
    actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${what}: got ${actual.map((x) => x.toFixed(1))}, expected ${expected.map((x) => x.toFixed(1))}`));
};
const key = (value) => JSON.stringify(value);
const everyTheme = (read) => THEMES.map((theme) => read(snap[theme].fa, theme));

/** The colours a check collects in every theme must all be different (themed) or all be the same (semantic). */
function assertDifferentInEveryTheme(name, read) {
    const values = everyTheme((s, theme) => key(read(s, theme)));
    assert.equal(new Set(values).size, THEMES.length, `${name} must differ from theme to theme: ${values.join(' | ')}`);
}
function assertSameInEveryTheme(name, read) {
    const values = everyTheme((s, theme) => key(read(s, theme)));
    assert.equal(new Set(values).size, 1, `${name} must not change with the theme: ${[...new Set(values)].join(' | ')}`);
}
const round = (rgb) => rgb.map((v) => Math.round(v));
const stopsOf = (css) => gradientStops(css).map((c) => round(c.rgb));

/** The gradient of the main and the play button: 45% of each brand colour in the page colour of the theme. */
const deepStops = (theme) => {
    const t = tokensOf(theme);
    const bg = rgb255(t['--bg-body']);
    return [mix(rgb255(t['--brand-primary']), bg, 0.45), mix(rgb255(t['--brand-secondary']), bg, 0.45)];
};

// ---------------------------------------------------------------- the theme really is applied

describe('the page reads each theme from css/style.css', () => {
    for (const theme of THEMES) {
        it(`${theme}: the tokens the browser computes are the ones written in the theme block`, () => {
            const s = snap[theme].fa;
            assert.equal(s.theme, theme);
            const written = tokensOf(theme);
            for (const token of ['--bg-body', '--text-primary', '--text-secondary', '--brand-primary', '--brand-secondary', '--brand-emerald', '--brand-rose', '--brand-amber']) {
                assert.equal(s.tokens[token].toLowerCase(), written[token].toLowerCase(), `${theme} ${token}`);
            }
        });
    }
});

// ---------------------------------------------------------------- the language switch

describe('the selected language button', () => {
    for (const theme of THEMES) {
        for (const lang of LANGS) {
            it(`${theme}/${lang}: border, glow and fill are the theme's, the label is its text colour`, () => {
                const s = snap[theme][lang];
                const selected = s[`lang-${lang}`];
                const other = s[`lang-${lang === 'fa' ? 'en' : 'fa'}`];
                assert.equal(selected.pressed, 'true');
                assert.equal(other.pressed, 'false');
                const t = tokensOf(theme);
                assert.deepEqual(round(color(selected['border-top-color']).rgb), rgb255(t['--brand-primary']), 'border = --brand-primary');
                assert.deepEqual(round(color(selected.color).rgb), rgb255(t['--text-primary']), 'label = --text-primary');
                assert.ok(selected['box-shadow'].includes(`rgb(${rgb255(t['--brand-primary']).join(', ')})`), `glow is --brand-primary: ${selected['box-shadow']}`);
                // color-mix(in srgb, --brand-primary 28%, --surface-input), in premultiplied alpha.
                const input = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)/.exec(t['--surface-input']).slice(1).map(Number);
                const alpha = 0.28 + 0.72 * input[3];
                const expected = rgb255(t['--brand-primary']).map((v, i) => (0.28 * v + 0.72 * input[3] * input[i]) / alpha);
                const bg = color(selected['background-color']);
                near(bg.rgb, expected, 3, `${theme} selected fill`);
                assert.ok(Math.abs(bg.a - alpha) < 0.01, `fill alpha ${bg.a} vs ${alpha}`);
                // And it is not the old fixed gradient, nor the quiet look of the other button.
                assert.equal(selected['background-image'], 'none');
                assert.notEqual(selected['background-color'], other['background-color']);
                assert.equal(other['box-shadow'], 'none');
            });
        }
    }

    it('differs from theme to theme: border, glow and fill', () => {
        for (const lang of LANGS) {
            const read = (name) => THEMES.map((theme) => snap[theme][lang][`lang-${lang}`][name]);
            for (const name of ['border-top-color', 'background-color', 'box-shadow']) assert.equal(new Set(read(name)).size, THEMES.length, `${lang} ${name}: ${read(name).join(' | ')}`);
        }
    });

    it('the selected button changes sides with the language and keeps its look', () => {
        for (const theme of THEMES) {
            const fa = snap[theme].fa;
            const en = snap[theme].en;
            assert.equal(fa['lang-fa']['background-color'], en['lang-en']['background-color'], `${theme}: same selected fill in both languages`);
            assert.equal(fa['lang-en']['background-color'], en['lang-fa']['background-color'], `${theme}: same quiet fill in both languages`);
        }
    });
});

// ---------------------------------------------------------------- the main button and the play button

describe('the main button and the play button', () => {
    for (const theme of THEMES) {
        it(`${theme}: both gradients are the theme's two colours mixed into its page colour; the label and the triangle are its text colour`, () => {
            const s = snap[theme].fa;
            const expected = deepStops(theme).map(round);
            for (const [name, element] of [['main button', s.start], ['probe button', s.buttons['btn-primary']], ['play button', s.play]]) {
                const stops = stopsOf(element['background-image']);
                assert.equal(stops.length, 2, `${name}: two colour stops in ${element['background-image']}`);
                near(stops[0], expected[0], 2, `${theme} ${name} start`);
                near(stops[1], expected[1], 2, `${theme} ${name} end`);
            }
            const text = rgb255(tokensOf(theme)['--text-primary']);
            assert.deepEqual(round(color(s.start.color).rgb), text);
            assert.deepEqual(round(color(s.buttons['btn-primary'].color).rgb), text);
            assert.deepEqual(round(color(s.playIcon['border-left-color']).rgb), text);
        });
    }

    it('all three differ from theme to theme (and so does the page title gradient)', () => {
        assertDifferentInEveryTheme('main button', (s) => stopsOf(s.start['background-image']));
        assertDifferentInEveryTheme('play button', (s) => stopsOf(s.play['background-image']));
        assertDifferentInEveryTheme('play triangle', (s) => round(color(s.playIcon['border-left-color']).rgb));
        assertDifferentInEveryTheme('title', (s) => stopsOf(s.title['background-image']));
    });
});

// ---------------------------------------------------------------- the other themed items

describe('the other items that follow the theme', () => {
    for (const theme of THEMES) {
        it(`${theme}: chips, badges, switches, cards and scrims are made from the theme's tokens`, () => {
            const s = snap[theme].fa;
            const t = tokensOf(theme);
            const primary = rgb255(t['--brand-primary']);
            const secondary = rgb255(t['--brand-secondary']);
            const bodyBg = rgb255(t['--bg-body']);
            const text = rgb255(t['--text-primary']);
            const input = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)/.exec(t['--surface-input']).slice(1).map(Number);

            // Selected chips and the detective / spectator badges: a tint of the theme's own colour.
            for (const [name, got] of [['chip', s.chip], ['hint chip', s.hintChip]]) {
                const bg = color(got['background-color']);
                near(bg.rgb, primary, 3, `${theme} ${name} tint`);
                assert.ok(Math.abs(bg.a - 0.12) < 0.01, `${name} alpha ${bg.a}`);
                assert.deepEqual(round(color(got['border-top-color']).rgb), primary, `${name} border`);
            }
            for (const [badge, base] of [['detective', primary], ['spectator', secondary]]) {
                const got = s.roles[badge];
                assert.deepEqual(round(color(got.color).rgb), base, `${badge} text`);
                const bg = color(got['background-color']);
                near(bg.rgb, base, 3, `${theme} ${badge} tint`);
                assert.ok(Math.abs(bg.a - 0.15) < 0.01, `${badge} alpha ${bg.a}`);
                near(color(got['border-top-color']).rgb, base, 3, `${theme} ${badge} border`);
            }
            assert.deepEqual(round(color(s.colorClasses.primary.color).rgb), primary);

            // Switches.
            assert.deepEqual(round(color(s.slider.on['background-color']).rgb), primary, 'switch on = --brand-primary');
            near(color(s.slider.off['background-color']).rgb, mix(rgb255(t['--text-secondary']), bodyBg, 0.28), 2, `${theme} switch off`);
            assert.deepEqual(round(color(s.slider.knob['background-color']).rgb), text, 'knob = --text-primary');

            // Text, cards and scrims.
            assert.deepEqual(round(color(s.cards.input.color).rgb), text, 'typed text = --text-primary');
            for (const [name, share] of [['cardMenu', 0.6], ['toggleItem', 0.5], ['playerCard', 0.65], ['accolade', 0.7], ['toast', 0.95]]) {
                const bg = color(s.cards[name]['background-color']);
                near(bg.rgb, input.slice(0, 3), 3, `${theme} ${name} panel is --surface-input`);
                assert.ok(Math.abs(bg.a - share * input[3]) < 0.02, `${name} alpha ${bg.a}`);
            }
            const overlay = color(s.cards.overlay['background-color']);
            near(overlay.rgb, bodyBg, 3, `${theme} scrim is the page colour`);
            assert.ok(Math.abs(overlay.a - 0.88) < 0.01);
            near(color(s.cards.handoff['background-color']).rgb, bodyBg, 3, `${theme} hand-off scrim`);
            assert.deepEqual(round(color(s.hub.fill).rgb), bodyBg, 'wheel hub = page colour');
        });
    }

    it('every one of them differs from theme to theme', () => {
        const items = {
            'selected chip': (s) => round(color(s.chip['background-color']).rgb),
            'selected hint chip': (s) => round(color(s.hintChip['background-color']).rgb),
            'detective badge': (s) => [round(color(s.roles.detective.color).rgb), round(color(s.roles.detective['background-color']).rgb)],
            'spectator badge': (s) => [round(color(s.roles.spectator.color).rgb), round(color(s.roles.spectator['background-color']).rgb)],
            'switch on': (s) => round(color(s.slider.on['background-color']).rgb),
            'switch off': (s) => round(color(s.slider.off['background-color']).rgb),
            'switch knob': (s) => round(color(s.slider.knob['background-color']).rgb),
            'typed text': (s) => round(color(s.cards.input.color).rgb),
            'card menu': (s) => round(color(s.cards.cardMenu['background-color']).rgb),
            'toggle item': (s) => round(color(s.cards.toggleItem['background-color']).rgb),
            'player card': (s) => round(color(s.cards.playerCard['background-color']).rgb),
            'toast': (s) => round(color(s.cards.toast['background-color']).rgb),
            'modal scrim': (s) => round(color(s.cards.overlay['background-color']).rgb),
            'hand-off scrim': (s) => round(color(s.cards.handoff['background-color']).rgb),
            'wheel hub': (s) => round(color(s.hub.fill).rgb),
            'ghost button': (s) => round(color(s.buttons['btn-ghost']['background-color']).rgb)
        };
        for (const [name, read] of Object.entries(items)) assertDifferentInEveryTheme(name, read);
    });
});

// ---------------------------------------------------------------- the colours that carry a meaning

describe('the semantic colours do not change with the theme', () => {
    const EXPECTED = {
        'emerald button': [[5, 150, 105], [4, 120, 87]],
        'rose button': [[225, 29, 72], [159, 18, 57]],
        'amber button': [[245, 158, 11], [217, 119, 6]]
    };
    it('the emerald, rose and amber buttons keep their fill and label in every theme', () => {
        assertSameInEveryTheme('emerald button', (s) => [stopsOf(s.buttons['btn-emerald']['background-image']), s.buttons['btn-emerald'].color]);
        assertSameInEveryTheme('rose button', (s) => [stopsOf(s.buttons['btn-rose']['background-image']), s.buttons['btn-rose'].color]);
        assertSameInEveryTheme('amber button', (s) => [stopsOf(s.buttons['btn-amber']['background-image']), s.buttons['btn-amber'].color]);
        const s = snap.default.fa;
        assert.deepEqual(stopsOf(s.buttons['btn-emerald']['background-image']), EXPECTED['emerald button']);
        assert.deepEqual(stopsOf(s.buttons['btn-rose']['background-image']), EXPECTED['rose button']);
        assert.deepEqual(stopsOf(s.buttons['btn-amber']['background-image']), EXPECTED['amber button']);
    });

    it('citizen and spy badges, the "hard" chip and its tag, the error and timer colours keep their red and green', () => {
        for (const role of ['citizen', 'spy']) assertSameInEveryTheme(`${role} badge`, (s) => ['background-color', 'color', 'border-top-color'].map((p) => s.roles[role][p]));
        assertSameInEveryTheme('hard chip', (s) => [s.hintHard['border-top-color'], s.hintHardChecked['background-color'], s.hintHardChecked['border-top-color']]);
        assertSameInEveryTheme('hard tag', (s) => [s.hintTag['background-color'], s.hintTag.color]);
        assertSameInEveryTheme('amber / rose / emerald / violet text', (s) => [s.colorClasses.amber.color, s.colorClasses.rose.color, s.colorClasses.emerald.color, s.colorClasses.violet.color]);
        assertSameInEveryTheme('timer warning and danger', (s) => [s.timer.warning.color, s.timer.danger.color]);
        const s = snap.default.fa;
        assert.deepEqual(round(color(s.roles.citizen.color).rgb), [16, 185, 129]);
        assert.deepEqual(round(color(s.roles.spy.color).rgb), [244, 63, 94]);
        assert.deepEqual(round(color(s.timer.warning.color).rgb), [245, 158, 11]);
        assert.deepEqual(round(color(s.timer.danger.color).rgb), [244, 63, 94]);
        assert.deepEqual(round(color(s.colorClasses.violet.color).rgb), [168, 85, 247]);
    });

    it('the medals stay gold, silver and bronze on the podium', () => {
        for (const rank of [1, 2, 3]) {
            assertSameInEveryTheme(`podium ${rank}`, (s) => [s.podium[rank].pillar['background-image'], s.podium[rank].pillar['border-top-color'], s.podium[rank].score.color]);
        }
        const score = (rank) => round(color(snap.default.fa.podium[rank].score.color).rgb);
        assert.deepEqual([score(1), score(2), score(3)], [[245, 158, 11], [203, 213, 225], [217, 119, 6]]);
    });

    it('cover mode stays black, and the wheel keeps its red needle and light labels', () => {
        assertSameInEveryTheme('cover screen', (s) => [s.shield['background-color'], s.shield.color]);
        assertSameInEveryTheme('wheel needle', (s) => [s.needle.fill, s.needle.stroke]);
        assertSameInEveryTheme('wheel label', (s) => s.wheelLabel.fill);
        assert.deepEqual(round(color(snap.default.fa.shield['background-color']).rgb), [0, 0, 0]);
    });
});

// ---------------------------------------------------------------- readable text

describe('text contrast (WCAG AA, 4.5:1) in every theme and both languages', () => {
    const gradientSamples = (css) => {
        const [a, b] = gradientStops(css).map((c) => c.rgb);
        return Array.from({ length: 11 }, (_, k) => mix(a, b, 1 - k / 10));
    };
    for (const theme of THEMES) {
        for (const lang of LANGS) {
            it(`${theme}/${lang}: main button label, play triangle, selected and quiet language button`, () => {
                const s = snap[theme][lang];
                // The main button: the label on both ends of the gradient and between.
                const label = color(s.start.color).rgb;
                for (const point of gradientSamples(s.start['background-image'])) {
                    const ratio = contrastRatio(point, label);
                    assert.ok(ratio >= 4.5, `${theme} main button label ${ratio.toFixed(2)}:1`);
                }
                // The play triangle on the gradient (a symbol: 3:1 would do, it has 4.5).
                const triangle = color(s.playIcon['border-left-color']).rgb;
                for (const point of gradientSamples(s.play['background-image'])) {
                    const ratio = contrastRatio(point, triangle);
                    assert.ok(ratio >= 4.5, `${theme} play triangle ${ratio.toFixed(2)}:1`);
                }
                // The language buttons sit on the card, which sits on the page colour.
                const page = rgb255(tokensOf(theme)['--bg-body']);
                const card = over(color(s.container['background-color']), page);
                const selected = s[`lang-${lang}`];
                const quiet = s[`lang-${lang === 'fa' ? 'en' : 'fa'}`];
                const selectedRatio = contrastRatio(over(color(selected['background-color']), card), color(selected.color).rgb);
                assert.ok(selectedRatio >= 4.5, `${theme}/${lang} selected language button ${selectedRatio.toFixed(2)}:1`);
                const quietRatio = contrastRatio(over(color(quiet['background-color']), card), color(quiet.color).rgb);
                assert.ok(quietRatio >= 4.5, `${theme}/${lang} other language button ${quietRatio.toFixed(2)}:1`);
            });
        }
    }
});
