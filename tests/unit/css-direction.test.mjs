/**
 * Guard: css/style.css must work in both reading directions. It finds every declaration that only works
 * for one side (a physical left/right property, `text-align: left|right`, a literal `translateX`, an
 * asymmetric 4-value shorthand, a left/right safe-area inset) and fails on any that is not on the short,
 * commented allow-list below. Use the logical form instead: `text-align: start`, `margin-inline-start`,
 * `inset-inline-end`, `padding-inline`, or `calc(Npx * var(--dir))` for an offset (`--dir` is +1 in LTR and
 * -1 in RTL, set on :root).
 *
 * The scanner is a small brace parser, not a regex over lines, so a rule that spans several lines or sits
 * inside @media / @keyframes / @supports is read the same way as a one-line rule.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const css = readFileSync(`${ROOT}css/style.css`, 'utf8');

/**
 * The legitimate physical declarations, each as `selector :: property` with the reason it is allowed.
 * Anything else with a physical left/right in it fails the test.
 */
const ALLOWED = {
    'body :: padding': 'The four safe-area insets describe the physical screen (a notch on the left or the right), so the physical padding that matches them is correct in both directions.',
    '.panic-btn-floating :: inset-inline-start': 'Logical edge with the physical left inset: exactly right in LTR (start = left). The RTL rule below reads the right inset instead.',
    ':root[dir="rtl"] .panic-btn-floating :: inset-inline-start': 'RTL override of the rule above: in RTL the start edge is the physical right, so it reads the physical right inset (landscape on a notched phone). With no inset it is the same 16px.',
    '.install-btn-floating :: inset-inline-end': 'Logical edge with the physical right inset: exactly right in LTR (end = right). The RTL rule below reads the left inset instead.',
    ':root[dir="rtl"] .install-btn-floating :: inset-inline-end': 'RTL override of the rule above: in RTL the end edge is the physical left, so it reads the physical left inset. With no inset it is the same 16px.',
    '.play-button-icon :: border-left': 'The play triangle points right in both directions, like every media control; a CSS border triangle can only be drawn with a physical side.',
    '.play-button-icon :: margin-left': 'Optical centring of that right-pointing triangle (it needs a nudge to the right in both directions).',
    '#toast-container :: left': 'Centring (left: 50% with translateX(-50%)), identical in both directions.',
    '#toast-container :: transform': 'The translateX(-50%) half of that centring.'
};

/** Split a declaration block on `;`, ignoring semicolons inside parentheses or quotes. */
function splitDeclarations(body) {
    const out = [];
    let depth = 0;
    let quote = '';
    let current = '';
    for (const ch of body) {
        if (quote) {
            if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ';' && depth === 0 && !quote) {
            out.push(current);
            current = '';
        } else current += ch;
    }
    out.push(current);
    return out
        .map((decl) => decl.trim())
        .filter(Boolean)
        .map((decl) => {
            const colon = decl.indexOf(':');
            return { prop: decl.slice(0, colon).trim().toLowerCase(), value: decl.slice(colon + 1).trim() };
        });
}

/** Every declaration in `source` with the selector (and @-rule chain) it belongs to. */
function parseCss(source) {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    const walk = (chunk, context) => {
        let i = 0;
        while (i < chunk.length) {
            const open = chunk.indexOf('{', i);
            if (open === -1) break;
            const prelude = chunk.slice(i, open).trim().replace(/\s+/g, ' ');
            let depth = 1;
            let j = open + 1;
            while (j < chunk.length && depth) {
                if (chunk[j] === '{') depth++;
                else if (chunk[j] === '}') depth--;
                j++;
            }
            const body = chunk.slice(open + 1, j - 1);
            if (body.includes('{')) walk(body, [...context, prelude]);
            else for (const decl of splitDeclarations(body)) out.push({ selector: [...context, prelude].join(' > '), ...decl });
            i = j;
        }
    };
    walk(text, []);
    return out;
}

/** Split a shorthand value on whitespace outside parentheses: `max(1px, env(x)) 2px` is two tokens. */
function tokens(value) {
    const out = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (/\s/.test(ch) && depth === 0) {
            if (current) out.push(current);
            current = '';
        } else current += ch;
    }
    if (current) out.push(current);
    return out;
}

const PHYSICAL_PROPERTY = /^(left|right|margin-(left|right)|padding-(left|right)|border-(left|right)(-\w+)?|border-(top|bottom)-(left|right)-radius|scroll-(margin|padding)-(left|right))$/;
const SIDE_KEYWORD = /\b(left|right)\b/;
const ZERO_TRANSLATE = /translate(X|3d)?\(\s*0(px|%)?\s*(,\s*0(px|%)?\s*)*\)/g;

/** Why a declaration only works for one direction, or null when it works for both. */
function physicalReason({ prop, value }) {
    if (PHYSICAL_PROPERTY.test(prop)) return `physical property ${prop}`;
    if (['text-align', 'text-align-last', 'float', 'clear'].includes(prop) && /^(left|right)$/i.test(value)) return `${prop}: ${value}`;
    if (['background-position', 'object-position', 'transform-origin', 'mask-position', 'perspective-origin'].includes(prop) && SIDE_KEYWORD.test(value)) return `${prop} uses a left/right keyword`;
    if (prop === 'transform' || prop === 'translate') {
        const rest = value.replace(ZERO_TRANSLATE, '');
        if (/translate(X|3d)?\(|scaleX\(/.test(rest) && !rest.includes('var(--dir)')) return `literal horizontal transform: ${value}`;
    }
    if (/env\(\s*safe-area-inset-(left|right)/.test(value)) return `physical safe-area inset in ${prop}`;
    const parts = tokens(value);
    if (parts.length === 4 && ['padding', 'margin', 'inset', 'border-width', 'scroll-margin', 'scroll-padding'].includes(prop) && parts[1] !== parts[3]) return `${prop} has different left and right values`;
    if (parts.length === 4 && prop === 'border-radius' && (parts[0] !== parts[1] || parts[3] !== parts[2])) return 'border-radius has different left and right corners';
    return null;
}

const flaggedBy = (declarations) => {
    const flagged = new Map();
    for (const decl of declarations) {
        const reason = physicalReason(decl);
        if (reason) flagged.set(`${decl.selector} :: ${decl.prop}`, reason);
    }
    return flagged;
};

describe('css/style.css works in both directions', () => {
    const declarations = parseCss(css);

    it('scans the real stylesheet (guards against a parser that finds nothing)', () => {
        assert.ok(declarations.length > 700, `only ${declarations.length} declarations`);
        const selectors = new Set(declarations.map((d) => d.selector));
        assert.ok(selectors.size > 250, `only ${selectors.size} selectors`);
        for (const expected of ['.toggle-item', '.podium-item[data-rank="1"]', '.slider:before', '@keyframes handoffPass > 50%', '#toast-container']) {
            assert.ok(selectors.has(expected), `${expected} not parsed`);
        }
    });

    it('has no physical left/right declaration outside the commented allow-list', () => {
        const offenders = [...flaggedBy(declarations)].filter(([key]) => !(key in ALLOWED)).map(([key, reason]) => `${key}  (${reason})`);
        assert.deepEqual(offenders, [], 'use logical properties (text-align: start, inset-inline-*, margin-inline-*) or calc(N * var(--dir))');
    });

    it('the allow-list is current: every entry still matches a flagged declaration, and says why', () => {
        const flagged = flaggedBy(declarations);
        for (const [key, reason] of Object.entries(ALLOWED)) {
            assert.ok(flagged.has(key), `${key} is no longer flagged: drop it from ALLOWED`);
            assert.ok(reason.length > 30, `${key}: say why it is legitimate`);
        }
    });

    it('the floating cover-mode and install buttons read the inset of the side they are on, in both directions', () => {
        const value = (selector, prop) => declarations.find((d) => d.selector === selector && d.prop === prop)?.value ?? '';
        // LTR: start = left, end = right.
        assert.match(value('.panic-btn-floating', 'inset-inline-start'), /safe-area-inset-left/);
        assert.match(value('.install-btn-floating', 'inset-inline-end'), /safe-area-inset-right/);
        // RTL: start = right, end = left, so the insets swap.
        assert.match(value(':root[dir="rtl"] .panic-btn-floating', 'inset-inline-start'), /safe-area-inset-right/);
        assert.match(value(':root[dir="rtl"] .install-btn-floating', 'inset-inline-end'), /safe-area-inset-left/);
        // With no inset the override must give the same 16px the plain rule gives.
        for (const [selector, prop] of [['.panic-btn-floating', 'inset-inline-start'], ['.install-btn-floating', 'inset-inline-end']]) {
            assert.match(value(selector, prop), /^max\(16px, env\(/);
            assert.match(value(`:root[dir="rtl"] ${selector}`, prop), /^max\(16px, env\(/);
        }
    });

    it('the toggle knob, the hand-over icon and the glow drift follow the --dir sign', () => {
        assert.deepEqual(
            declarations.filter((d) => d.selector === ':root' && d.prop === '--dir').map((d) => d.value),
            ['1']
        );
        assert.deepEqual(
            declarations.filter((d) => d.selector === ':root[dir="rtl"]' && d.prop === '--dir').map((d) => d.value),
            ['-1']
        );
        const transform = (selector) => declarations.find((d) => d.selector === selector && d.prop === 'transform')?.value ?? '';
        assert.match(transform('input:checked + .slider:before'), /var\(--dir\)/);
        assert.match(transform('@keyframes handoffPass > 50%'), /var\(--dir\)/);
        assert.match(transform('@keyframes ambientDrift1 > 100%'), /var\(--dir\)/);
        assert.match(transform('@keyframes ambientDrift2 > 100%'), /var\(--dir\)/);
        assert.ok(!declarations.some((d) => d.selector.includes('[dir="rtl"] input:checked')), 'the old RTL toggle override is gone');
    });

    it('the podium keeps silver, gold, bronze left to right: default order for LTR, reversed outer columns for RTL', () => {
        const order = (selector) => declarations.find((d) => d.selector === selector && d.prop === 'order')?.value;
        assert.equal(order('.podium-item[data-rank="1"]'), '2');
        assert.equal(order('.podium-item[data-rank="2"]'), '1');
        assert.equal(order('.podium-item[data-rank="3"]'), '3');
        assert.equal(order(':root[dir="rtl"] .podium-item[data-rank="2"]'), '3');
        assert.equal(order(':root[dir="rtl"] .podium-item[data-rank="3"]'), '1');
    });

    it('player names and name fields are isolated from the page direction', () => {
        const rule = declarations.find((d) => d.prop === 'unicode-bidi' && d.value === 'plaintext');
        assert.ok(rule, 'no unicode-bidi: plaintext rule');
        const isolated = rule.selector.split(',').map((s) => s.trim());
        for (const selector of ['.name-input', '.player-card', '#handoff-name', '#modal-player-name', 'strong']) assert.ok(isolated.includes(selector), `${selector} is not isolated`);
        // Table cells and headings keep the page direction (their names sit in <bdi>): plaintext there flips the alignment.
        for (const selector of ['.score-table th[scope="row"]', '.detail-player-card h4']) assert.ok(!isolated.includes(selector), `${selector} must not use plaintext`);
    });
});

describe('the direction scanner itself', () => {
    it('flags every kind of one-sided declaration', () => {
        const bad = parseCss(`
            a { margin-left: 4px; }
            b { text-align: right; }
            c { float: left; }
            d { transform: translateX(10px); }
            e { padding: 1px 2px 3px 4px; }
            f { border-top-left-radius: 3px; }
            g { left: 0; }
            h { background-position: right 4px center; }
            i { padding: 1px env(safe-area-inset-right) 1px 1px; }
            j { border-radius: 4px 8px 4px 8px; }
            k { transform-origin: left center; }
        `);
        assert.equal(bad.length, 11);
        for (const decl of bad) assert.ok(physicalReason(decl), `${decl.selector} { ${decl.prop} } was not flagged`);
    });

    it('lets the logical and neutral forms through', () => {
        const good = parseCss(`
            a { margin-inline-start: 4px; padding-inline: 1px 2px; inset-inline-end: 0; text-align: start; text-align: center; }
            b { transform: translateX(calc(20px * var(--dir))); }
            c { transform: translate(0, 0) scale(1); }
            d { transform: translateX(0); }
            e { transform: translateY(14px) scale(0.99); }
            f { padding: 1px 2px 3px 2px; }
            g { border-radius: 20px 20px 10px 10px; }
            h { margin: 0 auto; inset: 0; }
            @media (max-width: 380px) { i { padding: 4px; } }
        `);
        assert.ok(good.length >= 12);
        for (const decl of good) assert.equal(physicalReason(decl), null, `${decl.selector} { ${decl.prop}: ${decl.value} } was flagged`);
    });

    it('reads rules inside @media and @keyframes with their context', () => {
        const parsed = parseCss('@media (max-width: 380px) { .x { margin-right: 1px; } } @keyframes k { 0% { transform: translateX(5px); } }');
        assert.deepEqual(parsed.map((d) => d.selector), ['@media (max-width: 380px) > .x', '@keyframes k > 0%']);
    });
});
