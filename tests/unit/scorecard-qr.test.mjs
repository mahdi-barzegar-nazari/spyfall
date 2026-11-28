/**
 * The QR code in the footer of the scorecard image: the picture file, how it is loaded, where the layout puts it
 * (a white card in the end corner, as big as the list can spare, none at all for a crowded list) and what the
 * drawing code asks the canvas to paint with it. The drawing runs through the real exportScorecardImage() on a
 * recording canvas, with a stand-in for the browser's image loading.
 *
 * What these tests cannot see is the real browser loading the file from the production build under the page's
 * CSP; that is tests/e2e/scorecard-rows.test.mjs.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gameState } from '../../js/core/state.js';
import { getRankedStandings } from '../../js/game/ranking.js';
import { fa } from '../../js/i18n/fa.js';
import { en } from '../../js/i18n/en.js';
import { DEFAULT_LANG, setLang } from '../../js/i18n/index.js';
import {
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    FOOTER_H,
    QR_FOOTER_MAX_H,
    QR_FOOTER_MIN_H,
    QR_MIN_BLOCK_SCALE,
    buildScorecardRows,
    computeFooterLayout,
    computeScorecardLayout,
    qrFooterHeight
} from '../../js/ui/scorecard-layout.js';
import { SCORECARD_MEDAL_COLORS, SCORECARD_QR_CARD_COLOR, SCORECARD_THEME_ACCENTS, exportScorecardImage } from '../../js/ui/scorecard.js';
import { SCORECARD_QR_SRC, loadScorecardQr, resetScorecardQr } from '../../js/ui/scorecardQr.js';
import { parseColor } from './helpers/cssTokens.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---- The picture file -------------------------------------------------------------------------------

describe('the QR picture', () => {
    const path = new URL(`../../${SCORECARD_QR_SRC.replace(/^\.\//, '')}`, import.meta.url);
    const bytes = readFileSync(path);

    it('lives under assets/ (so the service worker precaches it with the other static files)', () => {
        assert.match(SCORECARD_QR_SRC, /^\.\/assets\/qr\/[a-z0-9-]+\.png$/);
        assert.ok(statSync(path).isFile());
    });

    it('is a 512x512 PNG with a palette and transparency: sharp up to a phone that draws it 3x, and small', () => {
        assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        assert.deepEqual([width, height], [512, 512]);
        assert.equal(bytes[25], 3, 'colour type 3: a palette');
        assert.ok(bytes.includes(Buffer.from('tRNS')), 'a transparency chunk: the picture sits on the white card');
        assert.ok(bytes.length < 80 * 1024, `${bytes.length} bytes: the service worker downloads it for every visitor`);
    });

    it('has the pixels for the biggest code on a 3x screen, and the page may load it (img-src \'self\')', () => {
        assert.ok(bytes.readUInt32BE(16) >= (QR_FOOTER_MAX_H - 32) * 3, 'the biggest code is the footer minus its margins and padding');
        const html = readFileSync(`${ROOT}index.html`, 'utf8');
        assert.match(html, /img-src[^;"]*'self'/);
    });
});

// ---- Loading it -------------------------------------------------------------------------------------

/** An image that does what `behaviour` says once its src is set: 'load', 'error', 'empty' (loads with no pixels) or 'hang'. */
function fakeImage(behaviour = 'load') {
    return {
        naturalWidth: behaviour === 'empty' ? 0 : 512,
        onload: null,
        onerror: null,
        requested: null,
        set src(value) {
            this.requested = value;
            if (behaviour === 'hang') return;
            queueMicrotask(() => (behaviour === 'error' ? this.onerror?.() : this.onload?.()));
        }
    };
}

describe('loadScorecardQr', () => {
    afterEach(() => resetScorecardQr());

    it('returns null where images cannot be loaded: nothing to wait for', () => {
        assert.equal(loadScorecardQr(() => null), null);
    });

    it('resolves to the loaded image, asked for by the path of the asset', async () => {
        const image = fakeImage();
        assert.equal(await loadScorecardQr(() => image), image);
        assert.equal(image.requested, SCORECARD_QR_SRC);
    });

    it('keeps a loaded image: the next call does not create or fetch anything', async () => {
        let created = 0;
        const first = await loadScorecardQr(() => (created++, fakeImage()));
        const second = await loadScorecardQr(() => (created++, fakeImage()));
        assert.equal(second, first);
        assert.equal(created, 1);
    });

    it('shares one load between calls made while it is still running', async () => {
        let created = 0;
        const create = () => (created++, fakeImage());
        const [a, b] = await Promise.all([loadScorecardQr(create), loadScorecardQr(create)]);
        assert.equal(a, b);
        assert.equal(created, 1);
    });

    it('resolves to null (never rejects) when the file cannot be loaded, and tries again on the next save', async () => {
        assert.equal(await loadScorecardQr(() => fakeImage('error')), null);
        const retry = fakeImage();
        assert.equal(await loadScorecardQr(() => retry), retry, 'a failure is not kept');
    });

    it('resolves to null for a picture without pixels', async () => {
        assert.equal(await loadScorecardQr(() => fakeImage('empty')), null);
    });

    it('gives up after the time limit, so a stalled request cannot keep the image from being saved', async () => {
        assert.equal(await loadScorecardQr(() => fakeImage('hang'), 15), null);
        const next = fakeImage();
        assert.equal(await loadScorecardQr(() => next, 15), next, 'and the next save tries again');
    });
});

// ---- The layout -------------------------------------------------------------------------------------

/** One player per group member; every group has its own score, best first. */
function playersFor(sizes) {
    const players = [];
    sizes.forEach((size, group) => {
        for (let k = 0; k < size; k++) players.push({ id: `p${players.length}`, name: `P${players.length}`, score: 100 - group * 3, stats: { hiddenTieBreakerScore: 0 } });
    });
    return players;
}
const shapeOf = (players) => {
    const { podiumGroups, restRows } = buildScorecardRows(getRankedStandings(players));
    return [podiumGroups.length, restRows.length];
};

describe('qrFooterHeight', () => {
    it('is the roomy footer when there is nothing to squeeze, and gets smaller as the list gets longer', () => {
        assert.equal(qrFooterHeight(0), QR_FOOTER_MAX_H);
        let previous = Infinity;
        for (let natural = 0; natural <= 1600; natural += 20) {
            const h = qrFooterHeight(natural);
            assert.ok(h === 0 || (h >= QR_FOOTER_MIN_H && h <= QR_FOOTER_MAX_H), `${natural}: ${h}`);
            assert.ok(h <= previous || previous === 0, `${natural}: the footer never grows again once the list is longer`);
            previous = h;
        }
        assert.equal(qrFooterHeight(5000), 0, 'a huge list leaves no room');
    });

    it('leaves exactly what the list can spare without going under the minimum scale', () => {
        const natural = 1300;
        const h = qrFooterHeight(natural);
        assert.ok(h > 0);
        const scale = (CANVAS_HEIGHT - 196 - h) / natural;
        assert.ok(scale >= QR_MIN_BLOCK_SCALE - 1e-9, `scale ${scale}`);
        assert.ok(scale - QR_MIN_BLOCK_SCALE < 0.01, 'and not much more: the code takes the spare room');
    });
});

describe('computeScorecardLayout with a QR code', () => {
    it('is the old layout, number for number, unless a code is asked for', () => {
        const plain = computeScorecardLayout(3, 5);
        assert.equal(plain.footerH, FOOTER_H);
        assert.equal(plain.hasQr, false);
        assert.deepEqual(computeScorecardLayout(3, 5, {}), plain);
        assert.deepEqual(computeScorecardLayout(3, 5, { qr: false }), plain);
    });

    it('has a taller footer and a smaller content area when the list can spare the room', () => {
        const plain = computeScorecardLayout(3, 3);
        const withQr = computeScorecardLayout(3, 3, { qr: true });
        assert.equal(withQr.hasQr, true);
        assert.equal(withQr.footerH, QR_FOOTER_MAX_H);
        assert.equal(withQr.contentBottom, CANVAS_HEIGHT - QR_FOOTER_MAX_H);
        assert.ok(withQr.contentBottom < plain.contentBottom);
        assert.equal(withQr.width, CANVAS_WIDTH);
        assert.equal(withQr.height, CANVAS_HEIGHT);
    });

    it('is the old layout again, with no code, for a list that has no room for one', () => {
        for (const [podium, rest] of [[3, 18], [3, 19], [1, 19]]) {
            const withQr = computeScorecardLayout(podium, rest, { qr: true });
            assert.equal(withQr.hasQr, false, `${podium} + ${rest}`);
            assert.deepEqual(withQr, computeScorecardLayout(podium, rest), 'exactly the image without a code');
        }
    });

    it('never squeezes the list below the scale the readable names need, for every shape up to 20 players', () => {
        let withCode = 0;
        let withoutCode = 0;
        for (const podium of [0, 1, 2, 3]) {
            for (let rest = 0; rest <= 19; rest++) {
                const layout = computeScorecardLayout(podium, rest, { qr: true });
                const scaledBlockH = layout.podiumH + layout.restHeaderH + rest * layout.restRowStep;
                assert.ok(scaledBlockH <= layout.contentAvailableH + 1e-9, `${podium}+${rest}: the block fits`);
                assert.ok(layout.bottomGap >= -1e-9, `${podium}+${rest}: nothing runs into the footer`);
                if (!layout.hasQr) {
                    assert.deepEqual(layout, computeScorecardLayout(podium, rest), `${podium}+${rest}: no code means the old image`);
                    withoutCode++;
                    continue;
                }
                withCode++;
                assert.ok(layout.footerH >= QR_FOOTER_MIN_H && layout.footerH <= QR_FOOTER_MAX_H, `${podium}+${rest}: footer ${layout.footerH}`);
                if (podium + rest > 0 && layout.scale < 1) {
                    assert.ok(layout.scale >= QR_MIN_BLOCK_SCALE - 1e-9, `${podium}+${rest}: scale ${layout.scale}`);
                    assert.ok(Math.round(15 * layout.scale) >= 11, `${podium}+${rest}: a name of ${Math.round(15 * layout.scale)}px`);
                }
            }
        }
        assert.ok(withCode > 40 && withoutCode > 0, `${withCode} shapes with a code, ${withoutCode} without`);
    });

    it('keeps the code for the biggest realistic game: 20 players with no ties and the shapes the e2e test draws', () => {
        for (const sizes of [Array(20).fill(1), [1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1], [3, 4, 5, 1, 1, 1, 1, 1, 1, 1, 1]]) {
            const [podium, rest] = shapeOf(playersFor(sizes));
            const layout = computeScorecardLayout(podium, rest, { qr: true });
            assert.equal(layout.hasQr, true, `${sizes.length} groups`);
            const footer = computeFooterLayout(layout, 'rtl');
            assert.ok(footer.image.size >= 100, `a code of ${footer.image.size}px still scans`);
        }
    });

    it('goes without a code, as before, when all 20 players are tied for first', () => {
        const [podium, rest] = shapeOf(playersFor([20]));
        assert.equal(computeScorecardLayout(podium, rest, { qr: true }).hasQr, false);
    });
});

describe('computeFooterLayout', () => {
    const roomy = computeScorecardLayout(3, 3, { qr: true });
    const crowded = computeScorecardLayout(3, 17, { qr: true });

    it('is the old footer, number for number, when there is no code', () => {
        const layout = computeScorecardLayout(3, 3);
        for (const direction of ['rtl', 'ltr', undefined]) {
            assert.deepEqual(computeFooterLayout(layout, direction), {
                hasQr: false,
                dividerY: CANVAS_HEIGHT - FOOTER_H + 16,
                dividerFrom: CANVAS_WIDTH / 2 - 60,
                dividerTo: CANVAS_WIDTH / 2 + 60,
                textX: CANVAS_WIDTH / 2,
                textAlign: 'center',
                creditY: CANVAS_HEIGHT - 20
            });
        }
    });

    for (const [label, layout] of [['a small game', roomy], ['the biggest game', crowded]]) {
        for (const direction of ['rtl', 'ltr']) {
            it(`${label}, ${direction}: the card and the code are inside the footer and the canvas, the text beside them`, () => {
                const f = computeFooterLayout(layout, direction);
                const top = CANVAS_HEIGHT - layout.footerH;
                assert.equal(f.hasQr, true);
                assert.ok(f.dividerY < f.card.y, 'the divider is above the card');
                assert.ok(f.card.y >= layout.contentBottom, 'the card starts below the list');
                assert.ok(f.card.y + f.card.size <= CANVAS_HEIGHT - 10, 'and ends above the bottom edge');
                assert.ok(f.card.x >= 40 && f.card.x + f.card.size <= CANVAS_WIDTH - 40, 'inside the 40px margin of the rows');
                assert.ok(f.image.x > f.card.x && f.image.x + f.image.size < f.card.x + f.card.size, 'the code is inside the card, with padding');
                assert.ok(f.image.y > f.card.y && f.image.y + f.image.size < f.card.y + f.card.size);
                assert.equal(f.image.size, layout.footerH - 32, 'the code is as big as the footer allows');
                assert.ok(f.textMaxWidth >= 200, `${f.textMaxWidth}px for the text`);
                for (const y of [f.ctaY, f.urlY, f.creditY]) assert.ok(y > top + 20 && y < CANVAS_HEIGHT - 6, `a text line at ${y}`);
                assert.ok(f.ctaY < f.urlY && f.urlY < f.creditY, 'call to action, address, signature, top to bottom');
            });
        }
    }

    it('puts the card in the end corner and the text at the start edge: left and right in Persian, the mirror in English', () => {
        const rtl = computeFooterLayout(roomy, 'rtl');
        const ltr = computeFooterLayout(roomy, 'ltr');
        assert.equal(rtl.card.x, 40);
        assert.equal(rtl.textAlign, 'right');
        assert.equal(rtl.textX, CANVAS_WIDTH - 40);
        assert.equal(ltr.card.x + ltr.card.size, CANVAS_WIDTH - 40);
        assert.equal(ltr.textAlign, 'left');
        assert.equal(ltr.textX, 40);
        assert.equal(rtl.card.size, ltr.card.size);
        assert.deepEqual(computeFooterLayout(roomy, undefined), rtl, 'anything but an explicit ltr keeps the right-to-left placement');
    });

    it('never lets the text run into the card', () => {
        for (const layout of [roomy, crowded]) {
            const rtl = computeFooterLayout(layout, 'rtl');
            assert.ok(rtl.textX - rtl.textMaxWidth > rtl.card.x + rtl.card.size, 'Persian: the text ends before the card');
            const ltr = computeFooterLayout(layout, 'ltr');
            assert.ok(ltr.textX + ltr.textMaxWidth < ltr.card.x, 'English: the text ends before the card');
        }
    });
});

// ---- The drawing ------------------------------------------------------------------------------------

/** A canvas context that records every call (with the fill colour and text alignment at that moment) and every colour set. */
function recordingContext() {
    const ops = [];
    const colors = [];
    const state = {};
    const gradient = () => Object.defineProperty({ kind: 'gradient' }, 'addColorStop', { value: (offset, color) => colors.push(color), enumerable: false });
    const ctx = new Proxy(state, {
        get(obj, prop) {
            if (prop === 'measureText') return (text) => ({ width: String(text).length * 7 });
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
            if (prop in obj) return obj[prop];
            return (...args) => ops.push({ op: prop, args, fillStyle: obj.fillStyle, strokeStyle: obj.strokeStyle, textAlign: obj.textAlign, font: obj.font });
        },
        set(obj, prop, value) {
            if ((prop === 'fillStyle' || prop === 'strokeStyle') && typeof value === 'string') colors.push(value);
            obj[prop] = value;
            return true;
        }
    });
    return { ctx, ops, colors };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('the scorecard image with a QR code', () => {
    let saved;
    const QR = { naturalWidth: 512, name: 'the qr picture' };

    beforeEach(() => {
        saved = { players: gameState.players, round: gameState.round, window: globalThis.window, document: globalThis.document };
        gameState.round = { ...gameState.round, num: 3 };
        setPlayers(6);
    });
    afterEach(() => {
        gameState.players = saved.players;
        gameState.round = saved.round;
        globalThis.window = saved.window;
        globalThis.document = saved.document;
        setLang(DEFAULT_LANG);
    });

    function setPlayers(count, allTied = false) {
        gameState.players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, score: allTied ? 10 : 40 - i, stats: { hiddenTieBreakerScore: 0 } }));
    }

    /** Draws the image once; `loadQr` is what the browser would give for the QR picture. */
    async function draw({ loadQr, theme = 'default', lang = 'fa', dpr = 1 } = {}) {
        const recording = recordingContext();
        const canvas = { width: 0, height: 0, getContext: () => recording.ctx, toDataURL: () => 'data:image/png;base64,' };
        globalThis.window = { devicePixelRatio: dpr };
        globalThis.document = {
            documentElement: {},
            querySelectorAll: () => [],
            getElementById: () => canvas,
            body: { getAttribute: () => theme, appendChild() {}, removeChild() {} },
            createElement: () => ({ click() {} })
        };
        setLang(lang);
        exportScorecardImage({ loadQr });
        await flush();
        return { ...recording, canvas };
    }
    const images = (ops) => ops.filter((o) => o.op === 'drawImage');
    const texts = (ops) => ops.filter((o) => o.op === 'fillText');

    it('draws the code once, in the footer layout\'s place, on the white card, after painting the card', async () => {
        const { ops, canvas } = await draw({ loadQr: () => Promise.resolve(QR) });
        const [podium, rest] = shapeOf(gameState.players);
        const layout = computeScorecardLayout(podium, rest, { qr: true });
        const footer = computeFooterLayout(layout, 'rtl');

        assert.deepEqual([canvas.width, canvas.height], [CANVAS_WIDTH, CANVAS_HEIGHT], 'the canvas is still 720x1280');
        assert.equal(images(ops).length, 1);
        assert.deepEqual(images(ops)[0].args, [QR, footer.image.x, footer.image.y, footer.image.size, footer.image.size]);

        const cardFill = ops.findIndex((o) => o.op === 'fill' && o.fillStyle === SCORECARD_QR_CARD_COLOR);
        assert.ok(cardFill >= 0, 'the white card is filled');
        assert.ok(cardFill < ops.findIndex((o) => o.op === 'drawImage'), 'before the code is drawn on it');
        assert.equal(SCORECARD_QR_CARD_COLOR, '#ffffff');
    });

    it('writes the call to action, the address and the signature beside the card, right-aligned in Persian', async () => {
        const { ops } = await draw({ loadQr: () => Promise.resolve(QR) });
        const [podium, rest] = shapeOf(gameState.players);
        const footer = computeFooterLayout(computeScorecardLayout(podium, rest, { qr: true }), 'rtl');
        for (const [text, y] of [[fa['scorecard.qr.cta'], footer.ctaY], [fa['scorecard.qr.url'], footer.urlY], [fa['welcome.credit.author'], footer.creditY]]) {
            const drawn = texts(ops).filter((o) => o.args[0] === text);
            assert.equal(drawn.length, 1, text);
            assert.deepEqual(drawn[0].args.slice(1), [footer.textX, y], text);
            assert.equal(drawn[0].textAlign, 'right', text);
        }
    });

    it('mirrors it in English: the card at the right, the text left-aligned at the left', async () => {
        const { ops } = await draw({ loadQr: () => Promise.resolve(QR), lang: 'en' });
        const [podium, rest] = shapeOf(gameState.players);
        const footer = computeFooterLayout(computeScorecardLayout(podium, rest, { qr: true }), 'ltr');
        assert.deepEqual(images(ops)[0].args.slice(1), [footer.image.x, footer.image.y, footer.image.size, footer.image.size]);
        assert.ok(footer.card.x > CANVAS_WIDTH / 2);
        for (const text of [en['scorecard.qr.cta'], en['scorecard.qr.url'], en['welcome.credit.author']]) {
            const drawn = texts(ops).filter((o) => o.args[0] === text);
            assert.equal(drawn.length, 1, text);
            assert.equal(drawn[0].textAlign, 'left', text);
            assert.equal(drawn[0].args[1], 40, text);
        }
        assert.equal(en['scorecard.qr.url'], fa['scorecard.qr.url'], 'the address is not translated');
    });

    it('is exactly the image without a code when the picture cannot be loaded (null, a failed load, or no image support)', async () => {
        const without = await draw({ loadQr: () => null });
        assert.equal(images(without.ops).length, 0);
        assert.equal(without.ops.some((o) => o.op === 'fill' && o.fillStyle === SCORECARD_QR_CARD_COLOR), false, 'no empty white card either');
        assert.equal(texts(without.ops).some((o) => o.args[0] === fa['scorecard.qr.cta']), false);
        assert.equal(texts(without.ops).filter((o) => o.args[0] === fa['welcome.credit.author']).length, 1, 'the signature is still there');

        const failed = await draw({ loadQr: () => Promise.resolve(null) });
        assert.deepEqual(failed.ops, without.ops, 'a failed load draws the same image as no loader at all');
    });

    it('waits for the picture: nothing is drawn until the load has finished', async () => {
        let finish;
        const pending = new Promise((resolve) => (finish = resolve));
        const recording = recordingContext();
        const canvas = { width: 0, height: 0, getContext: () => recording.ctx, toDataURL: () => 'data:' };
        globalThis.window = { devicePixelRatio: 1 };
        globalThis.document = { documentElement: {}, querySelectorAll: () => [], getElementById: () => canvas, body: { getAttribute: () => 'default', appendChild() {}, removeChild() {} }, createElement: () => ({ click() {} }) };
        exportScorecardImage({ loadQr: () => pending });
        await flush();
        assert.equal(recording.ops.length, 0, 'still waiting');
        finish(QR);
        await flush();
        assert.equal(images(recording.ops).length, 1);
    });

    it('draws no code and no card when the list has no room for one, and the image is the one without a code', async () => {
        setPlayers(20, true);
        const crowded = await draw({ loadQr: () => Promise.resolve(QR) });
        assert.equal(images(crowded.ops).length, 0);
        const plain = await draw({ loadQr: () => null });
        assert.deepEqual(crowded.ops, plain.ops);
    });

    it('draws the code for 20 players with no ties', async () => {
        setPlayers(20);
        const { ops } = await draw({ loadQr: () => Promise.resolve(QR) });
        assert.equal(images(ops).length, 1);
        const [, x, y, w, h] = images(ops)[0].args;
        assert.equal(w, h);
        assert.ok(w >= 100 && x >= 0 && x + w <= CANVAS_WIDTH && y + h <= CANVAS_HEIGHT, `${w}px at ${x},${y}`);
    });

    it('draws in CSS pixels at any device pixel ratio: the canvas is scaled, the code keeps its place', async () => {
        const one = await draw({ loadQr: () => Promise.resolve(QR), dpr: 1 });
        const three = await draw({ loadQr: () => Promise.resolve(QR), dpr: 3 });
        assert.deepEqual([three.canvas.width, three.canvas.height], [CANVAS_WIDTH * 3, CANVAS_HEIGHT * 3]);
        assert.deepEqual(images(three.ops)[0].args, images(one.ops)[0].args);
        assert.ok(three.ops.some((o) => o.op === 'scale' && o.args[0] === 3));
    });

    for (const theme of Object.keys(SCORECARD_THEME_ACCENTS)) {
        it(`${theme}: the code adds only the white card to the colours the image paints`, async () => {
            const accent = SCORECARD_THEME_ACCENTS[theme];
            const key = (rgb) => rgb.map((v) => Math.round(v)).join(',');
            const allowed = new Set([accent.primary, accent.secondary, accent.text, accent.muted, accent.panel, accent.bg1, accent.bg2, SCORECARD_QR_CARD_COLOR, ...SCORECARD_MEDAL_COLORS].map((hex) => key(parseColor(hex))));
            allowed.add('0,0,0');
            const { colors } = await draw({ loadQr: () => Promise.resolve(QR), theme });
            const strangers = [...new Set(colors)].filter((color) => !allowed.has(key(parseColor(color) || [-1, -1, -1])));
            assert.deepEqual(strangers, []);
            assert.ok(colors.includes(SCORECARD_QR_CARD_COLOR));
        });
    }
});

describe('scorecard.js and the QR code', () => {
    const source = readFileSync(`${ROOT}js/ui/scorecard.js`, 'utf8');

    it('takes the footer geometry from the layout and the picture from the loader', () => {
        assert.match(source, /computeFooterLayout\(/);
        assert.match(source, /from '\.\/scorecardQr\.js'/);
        assert.match(source, /\{ qr: Boolean\(qrImage\) \}/, 'the layout is asked for a code only if there is a picture');
    });

    it('the texts beside the code are in both catalogs', () => {
        for (const catalog of [fa, en]) {
            for (const key of ['scorecard.qr.cta', 'scorecard.qr.url']) assert.ok(catalog[key] && catalog[key].trim(), key);
        }
        assert.match(fa['scorecard.qr.url'], /^[a-z0-9.-]+$/, 'an address, in Latin letters');
    });
});

describe('the QR picture in the build', () => {
    const temps = [];
    after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

    // Builds a throwaway copy of the project (as build-stamp.test.mjs does), so the real sources stay untouched.
    function buildCopy() {
        const project = mkdtempSync(join(tmpdir(), 'spyfall-qr-'));
        temps.push(project);
        for (const entry of ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'assets', 'scripts', 'package.json']) {
            cpSync(join(ROOT, entry), join(project, entry), { recursive: true });
        }
        const out = join(project, 'out');
        const result = spawnSync(process.execPath, [join(project, 'scripts', 'build.mjs'), '--out', out], { encoding: 'utf8' });
        assert.equal(result.status, 0, `the build failed:\n${result.stderr}${result.stdout}`);
        return out;
    }

    it('is shipped with the build and precached, so the code is there offline', () => {
        const out = buildCopy();
        const relative = SCORECARD_QR_SRC.replace(/^\.\//, '');
        assert.ok(existsSync(join(out, ...relative.split('/'))), `${relative} is in the build`);
        const sw = readFileSync(join(out, 'sw.js'), 'utf8');
        assert.ok(sw.includes(JSON.stringify(SCORECARD_QR_SRC)), 'sw.js precaches the picture under the same path the page asks for');
    });
});
