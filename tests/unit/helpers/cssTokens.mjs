/**
 * A small CSS reader for the theme tests (no dependency): rules with their selector, the at-rules around them and
 * their declarations, the theme blocks of css/style.css with the tokens each one sets, and a finder for colour
 * values. It understands exactly what css/style.css uses (nested @media / @supports / @keyframes, comments,
 * strings, url()), not all of CSS.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The text of a file of the project, relative to its top folder. */
export function readProjectFile(path) {
    return readFileSync(`${ROOT}${path}`, 'utf8');
}

/** The comments replaced by spaces (new lines kept), so that line numbers stay true. */
export function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** Splits `text` at the top-level `;` (not inside brackets, strings or url()). */
function splitDeclarations(body) {
    const parts = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ';' && depth === 0) {
            parts.push([body.slice(start, i), start]);
            start = i + 1;
        }
    }
    if (body.slice(start).trim()) parts.push([body.slice(start), start]);
    return parts;
}

const squash = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Every rule of the stylesheet, in file order: `{ selector, context, declarations, line }`.
 * `context` is the list of at-rule preludes around it ("@media (max-width: 380px)", "@keyframes pulse"); the
 * frames of a @keyframes are rules whose selector is "0%, 100%".
 * `declarations` is `[{ prop, value, line }]`, values with their white space squashed.
 */
export function parseRules(css) {
    const text = stripComments(css);
    const rules = [];
    const lineAt = (index) => text.slice(0, index).split('\n').length;

    function readBlock(from, to, context) {
        let i = from;
        while (i < to) {
            while (i < to && /\s/.test(text[i])) i++;
            if (i >= to) break;
            // The prelude runs to the next "{" or ";" (a statement at-rule such as @import has no block).
            let j = i;
            let depth = 0;
            let quote = '';
            while (j < to) {
                const c = text[j];
                if (quote) {
                    if (c === '\\') j++;
                    else if (c === quote) quote = '';
                } else if (c === '"' || c === "'") quote = c;
                else if (c === '(' || c === '[') depth++;
                else if (c === ')' || c === ']') depth--;
                else if ((c === '{' || c === ';') && depth === 0) break;
                j++;
            }
            if (text[j] === ';' || j >= to) {
                i = j + 1;
                continue;
            }
            const prelude = squash(text.slice(i, j));
            // Matching close brace.
            let level = 1;
            let k = j + 1;
            quote = '';
            while (k < to && level > 0) {
                const c = text[k];
                if (quote) {
                    if (c === '\\') k++;
                    else if (c === quote) quote = '';
                } else if (c === '"' || c === "'") quote = c;
                else if (c === '{') level++;
                else if (c === '}') level--;
                k++;
            }
            const inner = [j + 1, k - 1];
            if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@keyframes')) {
                readBlock(inner[0], inner[1], [...context, prelude]);
            } else {
                const body = text.slice(inner[0], inner[1]);
                const declarations = [];
                for (const [raw, offset] of splitDeclarations(body)) {
                    const colon = raw.indexOf(':');
                    if (colon < 0) continue;
                    const prop = raw.slice(0, colon).trim().toLowerCase();
                    const lead = raw.length - raw.trimStart().length;
                    declarations.push({ prop, value: squash(raw.slice(colon + 1)), line: lineAt(inner[0] + offset + lead) });
                }
                rules.push({ selector: prelude, context, declarations, line: lineAt(i) });
            }
            i = k;
        }
    }

    readBlock(0, text.length, []);
    return rules;
}

/** `:root` (the default theme) or `body[data-theme="name"]`: the blocks that define the themes themselves. */
export function themeNameOfSelector(selector) {
    if (selector === ':root') return 'default';
    const m = /^body\[data-theme="([a-z]+)"\]$/.exec(selector);
    return m ? m[1] : null;
}

/** The custom properties each theme block sets: `{ default: { '--bg-body': '#090d16', ... }, noir: {...}, ... }`. */
export function readThemeBlocks(css) {
    const themes = {};
    for (const rule of parseRules(css)) {
        const name = themeNameOfSelector(rule.selector);
        if (!name || rule.context.length) continue;
        const tokens = {};
        for (const d of rule.declarations) if (d.prop.startsWith('--')) tokens[d.prop] = d.value;
        // `:root` also carries `--dir`; a second :root block (`:root { --dir: 1; }`) must not replace the first.
        themes[name] = { ...(themes[name] || {}), ...tokens };
    }
    return themes;
}

/** A theme's tokens as the page sees them: the default tokens, then the theme's own on top. */
export function effectiveTokens(themes, name) {
    return { ...themes.default, ...(themes[name] || {}) };
}

// ---------------------------------------------------------------- colour values

const NAMED_COLORS = new Set(
    ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue ' +
        'chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey ' +
        'darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray ' +
        'darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen ' +
        'fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender ' +
        'lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey ' +
        'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen ' +
        'linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
        'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange ' +
        'orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
        'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue ' +
        'slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow ' +
        'yellowgreen').split(' ')
);

/** Properties whose value is never a colour (a font list or a string can hold words like "tan"). */
const NEVER_COLOR_PROPS = new Set(['font-family', 'content', 'animation-name', 'transition-property', 'will-change', 'grid-template-columns', 'grid-template-areas']);

const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i;

/**
 * The fixed colour values written in one declaration, in order: hex, rgb()/hsl()/... (the whole call, with its
 * arguments), and named colours. `transparent` and `currentColor` are not colours, and a custom property name
 * (`var(--brand-rose)`) or a string or url() is not a colour either. `color-mix(...)` is read through, so only
 * the literals inside it count. A literal inside `var(--x, #f43f5e)` (a fallback) is found.
 */
export function findColorLiterals(prop, value) {
    if (NEVER_COLOR_PROPS.has(prop)) return [];
    let text = value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, ' ').replace(/url\([^)]*\)/gi, ' ');
    text = text.replace(/var\(\s*--[\w-]+/gi, 'var(');
    const found = [];
    // Functions first (their arguments hold numbers, not names), then hex, then bare words.
    let rest = '';
    for (let i = 0; i < text.length; ) {
        const m = COLOR_FUNCTION.exec(text.slice(i));
        if (!m) {
            rest += text.slice(i);
            break;
        }
        const start = i + m.index;
        rest += text.slice(i, start) + ' ';
        let depth = 0;
        let end = start;
        for (; end < text.length; end++) {
            if (text[end] === '(') depth++;
            else if (text[end] === ')' && --depth === 0) {
                end++;
                break;
            }
        }
        found.push([start, squash(text.slice(start, end))]);
        i = end;
    }
    for (const m of text.matchAll(/#[0-9a-f]{3,8}\b/gi)) found.push([m.index, m[0].toLowerCase()]);
    // Bare words are looked for in what is left after the functions were cut out.
    const restNoHex = rest.replace(/#[0-9a-f]{3,8}\b/gi, ' ');
    for (const m of restNoHex.matchAll(/(?<![\w-])([a-z]+)(?![\w-]|\()/gi)) {
        if (NAMED_COLORS.has(m[1].toLowerCase())) found.push([text.length + m.index, m[1].toLowerCase()]);
    }
    return found.sort((a, b) => a[0] - b[0]).map(([, literal]) => literal);
}

// ---------------------------------------------------------------- colour maths

/** `#rgb`, `#rrggbb`, `rgb()` / `rgba()` text as [r, g, b] (0-255), or null. */
export function parseColor(text) {
    const s = String(text).trim().toLowerCase();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
    if (m) {
        const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** WCAG relative luminance of [r, g, b] (0-255). */
export function luminance([r, g, b]) {
    const lin = (v) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two colours given as [r, g, b]. */
export function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- computed colours (what a browser reports)

const toSrgb = (linear) => {
    const v = Math.min(1, Math.max(0, linear));
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};

/**
 * A colour as `getComputedStyle` writes it, as `{ rgb: [r, g, b] (0-255, not rounded), a }`, or null.
 * Chromium reports rgb()/rgba(), color(srgb r g b / a) (gradient stops) and oklab(L a b / alpha) (a color-mix
 * with transparency); `#hex` is accepted too.
 */
export function parseCssColor(text) {
    const s = String(text).trim().toLowerCase();
    const hex = parseColor(s);
    if (hex && s.startsWith('#')) return { rgb: hex, a: 1 };
    const number = (v) => (v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v));
    const alphaOf = (v) => (v === undefined ? 1 : number(v));
    let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/.exec(s);
    if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: alphaOf(m[4]) };
    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/.exec(s);
    if (m) return { rgb: [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255], a: alphaOf(m[4]) };
    m = /^oklab\(\s*([\d.%]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/.exec(s);
    if (m) {
        const [L, A, B] = [number(m[1]), Number(m[2]), Number(m[3])];
        const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
        const mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
        const ss = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
        return {
            rgb: [toSrgb(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss), toSrgb(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss), toSrgb(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss)],
            a: alphaOf(m[4])
        };
    }
    return null;
}

/** `top` painted over an opaque `bottom` ([r, g, b]): the colour the eye sees. */
export function over(top, bottom) {
    return top.rgb.map((v, i) => v * top.a + bottom[i] * (1 - top.a));
}

/** The colour stops (as parsed colours) of a computed `linear-gradient(...)` / `radial-gradient(...)` value. */
export function gradientStops(value) {
    const stops = [];
    const re = /(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8}\b)/gi;
    for (const m of String(value).matchAll(re)) stops.push(parseCssColor(m[1]));
    return stops.filter(Boolean);
}
