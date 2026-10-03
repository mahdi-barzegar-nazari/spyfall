/**
 * A small HTML tokenizer for tests that must look inside index.html without a DOM.
 *
 * It understands exactly what index.html uses: quoted attributes (a quoted value may contain `<` and
 * `>`), void elements, comments, and raw-text elements (script, style, noscript). It is not a general
 * HTML parser. Every node keeps its source offsets so a caller can map a finding back to the file.
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'noscript']);

const COMMENT = /<!--[\s\S]*?-->/y;
const DOCTYPE = /<![^>]*>/y;
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttributes(raw) {
    const attrs = {};
    for (const m of raw.matchAll(ATTRIBUTE)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    return attrs;
}

/** Collapse every run of whitespace to one space and trim. */
export const normalizeText = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Parse `html` into a tree. Element nodes: `{ type: 'el', tag, attrs, children, parent, start, openEnd,
 * closeStart, end }` (`openEnd` is the offset just after the opening tag's `>`). Text nodes:
 * `{ type: 'text', value, start, end, parent, raw? }`.
 */
export function parseHtml(html) {
    const root = { type: 'el', tag: '#root', attrs: {}, children: [], parent: null, start: 0, openEnd: 0, closeStart: html.length, end: html.length };
    let current = root;
    let i = 0;
    const pushText = (start, end) => {
        if (end > start) current.children.push({ type: 'text', value: html.slice(start, end), start, end, parent: current });
    };
    while (i < html.length) {
        if (html[i] === '<') {
            COMMENT.lastIndex = i;
            const comment = COMMENT.exec(html);
            if (comment) {
                i = COMMENT.lastIndex;
                continue;
            }
            DOCTYPE.lastIndex = i;
            const doctype = DOCTYPE.exec(html);
            if (doctype) {
                i = DOCTYPE.lastIndex;
                continue;
            }
            TAG.lastIndex = i;
            const m = TAG.exec(html);
            if (m) {
                const [all, slash, name, rawAttrs, selfClose] = m;
                const tag = name.toLowerCase();
                const after = i + all.length;
                if (slash) {
                    let open = current;
                    while (open && open.tag !== tag) open = open.parent;
                    if (open && open !== root) {
                        open.closeStart = i;
                        open.end = after;
                        current = open.parent;
                    }
                    i = after;
                    continue;
                }
                const el = { type: 'el', tag, attrs: parseAttributes(rawAttrs), children: [], parent: current, start: i, openEnd: after, closeStart: after, end: after };
                current.children.push(el);
                if (VOID.has(tag) || selfClose) {
                    i = after;
                } else if (RAW_TEXT.has(tag)) {
                    const close = html.indexOf(`</${tag}`, after);
                    const closeStart = close === -1 ? html.length : close;
                    if (closeStart > after) el.children.push({ type: 'text', value: html.slice(after, closeStart), start: after, end: closeStart, parent: el, raw: true });
                    el.closeStart = closeStart;
                    const closeEnd = html.indexOf('>', closeStart);
                    el.end = closeEnd === -1 ? html.length : closeEnd + 1;
                    i = el.end;
                } else {
                    current = el;
                    i = after;
                }
                continue;
            }
        }
        const next = html.indexOf('<', i + 1);
        const end = next === -1 ? html.length : next;
        pushText(i, end);
        i = end;
    }
    return root;
}

/** Every element below `node`, in document order. */
export function* elements(node) {
    for (const child of node.children) {
        if (child.type !== 'el') continue;
        yield child;
        yield* elements(child);
    }
}

/** The concatenated text of everything below `node` (raw, not normalized). */
export function innerText(node) {
    return node.children.map((c) => (c.type === 'text' ? c.value : innerText(c))).join('');
}

/** True when `el` or one of its ancestors satisfies `test`. */
export function closest(el, test) {
    for (let n = el; n; n = n.parent) if (n.type === 'el' && test(n)) return n;
    return null;
}
