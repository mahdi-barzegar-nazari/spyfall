/**
 * The colours of the scorecard image in every theme. The image is drawn with the real exportScorecardImage()
 * on a recording canvas, so what is checked is what the drawing code asks the canvas to paint: every colour is one
 * of the theme's own (its two brand colours, its text colours, its card colour, its two background stops) or a
 * medal colour, the medals are the same in every theme, and two themes never paint the same image colours.
 * (The layout and the direction have their own tests: scorecard-layout / -direction / -rows.)
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { gameState } from '../../js/core/state.js';
import { SCORECARD_MEDAL_COLORS, SCORECARD_THEME_ACCENTS, exportScorecardImage, hexWithAlpha } from '../../js/ui/scorecard.js';
import { parseColor } from './helpers/cssTokens.mjs';

const THEMES = Object.keys(SCORECARD_THEME_ACCENTS);

/** A canvas context that records every colour it is given (fill, stroke, shadow and each gradient stop). */
function recordingContext() {
    const colors = [];
    const gradients = [];
    const gradient = (kind) => {
        const g = { kind, stops: [], addColorStop(offset, color) { this.stops.push(color); colors.push(color); } };
        gradients.push(g);
        return g;
    };
    const target = {
        createLinearGradient: () => gradient('linear'),
        createRadialGradient: () => gradient('radial'),
        measureText: (text) => ({ width: String(text).length * 7 })
    };
    const ctx = new Proxy(target, {
        get(obj, prop) {
            if (prop in obj) return obj[prop];
            return () => {};
        },
        set(obj, prop, value) {
            if ((prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'shadowColor') && typeof value === 'string') colors.push(value);
            obj[prop] = value;
            return true;
        }
    });
    return { ctx, colors, gradients };
}

function drawIn(theme) {
    const recording = recordingContext();
    const canvas = { width: 0, height: 0, getContext: () => recording.ctx, toDataURL: () => 'data:image/png;base64,' };
    globalThis.window = { devicePixelRatio: 1 };
    globalThis.document = {
        getElementById: () => canvas,
        body: { getAttribute: () => theme, appendChild() {}, removeChild() {} },
        createElement: () => ({ click() {} })
    };
    exportScorecardImage();
    return recording;
}

describe('the scorecard image follows the theme', () => {
    let saved;
    beforeEach(() => {
        saved = { players: gameState.players, round: gameState.round, window: globalThis.window, document: globalThis.document };
        gameState.round = { ...gameState.round, num: 3 };
        gameState.players = ['Ali', 'Sara', 'Reza', 'Nika', 'Omid', 'Mina'].map((name, i) => ({ id: `p${i}`, name, score: 20 - i * 3, stats: { hiddenTieBreakerScore: 0 } }));
    });
    afterEach(() => {
        gameState.players = saved.players;
        gameState.round = saved.round;
        globalThis.window = saved.window;
        globalThis.document = saved.document;
    });

    const rgbKey = (rgb) => rgb.map((v) => Math.round(v)).join(',');

    it('has an entry for all eight themes, in valid colours', () => {
        assert.equal(THEMES.length, 8);
        for (const [name, accent] of Object.entries(SCORECARD_THEME_ACCENTS)) {
            for (const key of ['primary', 'secondary', 'text', 'muted', 'panel', 'bg1', 'bg2']) assert.match(accent[key], /^#[0-9a-f]{6}$/i, `${name}.${key}`);
        }
    });

    for (const theme of THEMES) {
        it(`${theme}: every colour painted is one of the theme's own or a medal colour`, () => {
            const accent = SCORECARD_THEME_ACCENTS[theme];
            const allowed = new Set([accent.primary, accent.secondary, accent.text, accent.muted, accent.panel, accent.bg1, accent.bg2, ...SCORECARD_MEDAL_COLORS].map((hex) => rgbKey(parseColor(hex))));
            allowed.add('0,0,0'); // the transparent end of the glows
            const { colors } = drawIn(theme);
            assert.ok(colors.length > 30, 'the drawing painted something');
            const strangers = [...new Set(colors)].filter((color) => !allowed.has(rgbKey(parseColor(color) || [-1, -1, -1])));
            assert.deepEqual(strangers, [], `${theme}: colours that belong to no theme`);
        });

        it(`${theme}: background, header badge, text and rows use the theme's colours`, () => {
            const accent = SCORECARD_THEME_ACCENTS[theme];
            const { colors, gradients } = drawIn(theme);
            const linear = gradients.filter((g) => g.kind === 'linear');
            assert.deepEqual(linear[0].stops, [accent.bg1, accent.bg2], 'the background');
            assert.deepEqual(linear[1].stops, [accent.primary, accent.secondary], 'the header badge');
            for (const color of [accent.text, accent.muted, accent.primary, hexWithAlpha(accent.panel, 0.75), hexWithAlpha(accent.text, 0.08)]) {
                assert.ok(colors.includes(color), `${theme} paints ${color}`);
            }
        });

        it(`${theme}: the medals are gold, silver and bronze`, () => {
            const { colors } = drawIn(theme);
            for (const medal of SCORECARD_MEDAL_COLORS) assert.ok(colors.includes(medal), `${theme} paints ${medal}`);
            assert.deepEqual(SCORECARD_MEDAL_COLORS, ['#f59e0b', '#cbd5e1', '#d97706']);
        });
    }

    it('no two themes paint the same image: primary, secondary, text and background all differ', () => {
        for (const key of ['primary', 'secondary', 'text', 'muted', 'panel', 'bg1']) {
            const values = THEMES.map((theme) => SCORECARD_THEME_ACCENTS[theme][key].toLowerCase());
            assert.equal(new Set(values).size, THEMES.length, `${key}: ${values.join(' ')}`);
        }
        const drawn = THEMES.map((theme) => JSON.stringify([...new Set(drawIn(theme).colors)].sort()));
        assert.equal(new Set(drawn).size, THEMES.length, 'eight different sets of colours');
    });

    it('classic is drawn in its own greys (it used to fall back to the default cyan and violet)', () => {
        const { colors } = drawIn('classic');
        assert.equal(colors.includes(SCORECARD_THEME_ACCENTS.default.primary), false);
        assert.equal(colors.includes(SCORECARD_THEME_ACCENTS.default.secondary), false);
        assert.ok(colors.includes('#d4d4cf') && colors.includes('#6e6e68'));
    });

    it('an unknown theme name still draws with the default theme', () => {
        assert.deepEqual([...new Set(drawIn('no-such-theme').colors)].sort(), [...new Set(drawIn('default').colors)].sort());
    });
});
