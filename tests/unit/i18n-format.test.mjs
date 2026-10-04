/**
 * The formatting half of the translation core: plurals (`tn`), digits (`formatNumber`), durations
 * (`formatDuration`), markup-free templates (`setTemplate`) and the HTML-string variants (`tHtml`).
 *
 * A second language is faked by registering it in the exported tables for the length of one test and
 * taking it out again (the `withLanguage` helper), so nothing leaks into the other test files.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const env = installFakeEnv();
const { CATALOGS } = await import('../../js/i18n/catalogs.js');
const { fa } = await import('../../js/i18n/fa.js');
const { LANG_DIRECTIONS, NUMERALS, SUPPORTED_LANGS, DEFAULT_LANG, formatDuration, formatNumber, rawHtml, setLang, setTemplate, t, tHtml, tn, tnHtml } =
    await import('../../js/i18n/index.js');
const { toPersianDigits } = await import('../../js/utils/text.js');

/** Run `run` with `code` registered as a language, and put every table back whatever happens. */
function withLanguage(code, catalog, run, { numerals } = {}) {
    SUPPORTED_LANGS.push(code);
    CATALOGS[code] = catalog;
    LANG_DIRECTIONS[code] = 'ltr';
    if (numerals) NUMERALS[code] = numerals;
    try {
        return run();
    } finally {
        setLang(DEFAULT_LANG);
        SUPPORTED_LANGS.splice(SUPPORTED_LANGS.indexOf(code), 1);
        delete CATALOGS[code];
        delete LANG_DIRECTIONS[code];
        delete NUMERALS[code];
    }
}

/** Run `run` with a temporary Persian key (restoring a real one if the name was taken). */
function withKeys(entries, run) {
    const previous = {};
    for (const [key, value] of Object.entries(entries)) {
        if (key in fa) previous[key] = fa[key];
        fa[key] = value;
    }
    try {
        return run();
    } finally {
        for (const key of Object.keys(entries)) {
            if (key in previous) fa[key] = previous[key];
            else delete fa[key];
        }
    }
}

/** The text a tree of fake nodes shows: text nodes and elements in order. */
const shown = (element) => element.children.map((c) => (c.nodeType === 3 ? c.textContent : c.tagName === 'BR' ? '\n' : c.textContent)).join('');

after(() => env.uninstall());
afterEach(() => {
    setLang(DEFAULT_LANG);
    env.reset();
});

describe('formatNumber', () => {
    it('writes Persian digits for Persian', () => {
        assert.equal(formatNumber(0), '۰');
        assert.equal(formatNumber(1234567890), '۱۲۳۴۵۶۷۸۹۰');
        assert.equal(formatNumber(1234.5), '۱۲۳۴.۵');
        assert.equal(formatNumber(-3), '-۳');
        assert.equal(formatNumber('12a'), '۱۲a');
    });

    it('treats bad input like String(value), the way toPersianDigits does', () => {
        for (const value of [undefined, null, NaN, Infinity, '', {}, [1, 2], true]) {
            assert.equal(formatNumber(value), toPersianDigits(value), String(value));
        }
        assert.equal(formatNumber(undefined), 'undefined');
        assert.equal(formatNumber(NaN), 'NaN');
    });

    it('keeps Latin digits for a language that has no numeral system listed', () => {
        withLanguage('xx', {}, () => {
            setLang('xx');
            assert.equal(formatNumber(1234567890), '1234567890');
            assert.equal(formatNumber(-3.5), '-3.5');
            assert.equal(formatNumber(undefined), 'undefined');
        });
    });

    it('follows the NUMERALS table, so a language can opt in to Persian digits', () => {
        withLanguage('xx', {}, () => {
            setLang('xx');
            assert.equal(formatNumber(7), '7');
        });
        withLanguage('xx', {}, () => {
            setLang('xx');
            assert.equal(formatNumber(7), '۷');
        }, { numerals: 'persian' });
    });

    it('ignores a NUMERALS entry it does not know instead of throwing', () => {
        withLanguage('xx', {}, () => {
            setLang('xx');
            assert.equal(formatNumber(7), '7');
        }, { numerals: 'klingon' });
    });
});

describe('tn', () => {
    it('Persian: both forms read the same, and {count} is written in Persian digits', () => {
        for (const count of [0, 1, 2, 5, 11, 100]) {
            assert.equal(tn('time.seconds', count), `${formatNumber(count)} ثانیه`, String(count));
        }
        assert.equal(fa['time.seconds.one'], fa['time.seconds.other']);
    });

    it('picks .one or .other by the plural rules of the active language', () => {
        withLanguage('de', { 'thing.one': '{count} Ding', 'thing.other': '{count} Dinge' }, () => {
            setLang('de');
            assert.equal(tn('thing', 1), '1 Ding');
            assert.equal(tn('thing', 0), '0 Dinge');
            assert.equal(tn('thing', 2), '2 Dinge');
            assert.equal(tn('thing', '1'), '1 Ding', 'a numeric string counts as a number');
        });
    });

    it('falls back to .other when the language needs a form the catalog does not have', () => {
        // Russian has one / few / many / other; the catalog gives only two.
        withLanguage('ru', { 'thing.one': '{count} one', 'thing.other': '{count} other' }, () => {
            setLang('ru');
            assert.equal(tn('thing', 1), '1 one');
            assert.equal(tn('thing', 3), '3 other');
            assert.equal(tn('thing', 5), '5 other');
        });
    });

    it('uses .other for every count when .one is missing', () => {
        withLanguage('de', { 'thing.other': '{count} things' }, () => {
            setLang('de');
            assert.equal(tn('thing', 1), '1 things');
        });
    });

    it('prefers the active language even when only Persian has the matching form', () => {
        // German has only .other: for 1 it must use German .other, not the Persian .one.
        withLanguage('de', { 'time.seconds.other': '{count} Sek.' }, () => {
            setLang('de');
            assert.equal(tn('time.seconds', 1), '1 Sek.');
        });
    });

    it('falls back to the Persian text (with the active language digits) when the language lacks the key', () => {
        withLanguage('de', {}, () => {
            setLang('de');
            assert.equal(tn('time.seconds', 5), '5 ثانیه');
        });
    });

    it('returns the key when no catalog has it, and ignores inherited names', () => {
        assert.equal(tn('no.such.key', 3), 'no.such.key');
        assert.equal(tn('constructor', 1), 'constructor');
        assert.equal(tn('__proto__', 1), '__proto__');
    });

    it('fills other placeholders from params, and lets params.count keep the caller\'s own digits', () => {
        withKeys({ 'test.n.one': '{count} {unit}', 'test.n.other': '{count} {unit}' }, () => {
            assert.equal(tn('test.n', 3, { unit: 'x' }), '۳ x');
            assert.equal(tn('test.n', 3, { unit: 'x', count: 3 }), '3 x');
            assert.equal(tn('test.n', 3, { unit: 'x', count: '٣' }), '٣ x');
            assert.equal(tn('test.n', 3, { unit: 'x', count: undefined }), '۳ x');
            assert.equal(tn('test.n', 3), '۳ {unit}');
        });
    });

    it('survives a count that is not a number', () => {
        assert.equal(tn('time.seconds', NaN), 'NaN ثانیه');
        assert.equal(tn('time.seconds', undefined), 'undefined ثانیه');
        assert.equal(tn('time.seconds', 'abc'), 'abc ثانیه');
    });

    it('survives a language Intl does not know', () => {
        withLanguage('xx', { 'thing.other': '{count} things' }, () => {
            setLang('xx');
            assert.equal(tn('thing', 1), '1 things');
        });
    });
});

describe('formatDuration', () => {
    it('writes seconds, and minutes and seconds, in Persian', () => {
        assert.equal(formatDuration(0), '۰ ثانیه');
        assert.equal(formatDuration(1), '۱ ثانیه');
        assert.equal(formatDuration(45), '۴۵ ثانیه');
        assert.equal(formatDuration(59), '۵۹ ثانیه');
        assert.equal(formatDuration(60), '۱ دقیقه و ۰ ثانیه');
        assert.equal(formatDuration(61), '۱ دقیقه و ۱ ثانیه');
        assert.equal(formatDuration(129), '۲ دقیقه و ۹ ثانیه');
        assert.equal(formatDuration(3600), '۶۰ دقیقه و ۰ ثانیه');
    });

    it('clamps negative and junk values to zero and rounds fractions', () => {
        for (const value of [-1, -5, -0.4, NaN, undefined, null, '', 'abc']) {
            assert.equal(formatDuration(value), '۰ ثانیه', String(value));
        }
        assert.equal(formatDuration(59.6), '۱ دقیقه و ۰ ثانیه');
        assert.equal(formatDuration(44.4), '۴۴ ثانیه');
        assert.equal(formatDuration('90'), '۱ دقیقه و ۳۰ ثانیه');
    });

    it('lets the language decide the wording and the order', () => {
        const catalog = {
            'time.minutes.one': '{count} min',
            'time.minutes.other': '{count} min',
            'time.seconds.one': '{count} s',
            'time.seconds.other': '{count} s',
            'time.minutesAndSeconds': '{seconds} after {minutes}'
        };
        withLanguage('xx', catalog, () => {
            setLang('xx');
            assert.equal(formatDuration(45), '45 s');
            assert.equal(formatDuration(129), '9 s after 2 min');
        });
    });
});

describe('setTemplate', () => {
    const strong = (text) => {
        const node = document.createElement('strong');
        node.textContent = text;
        return node;
    };

    it('writes the text around a slot as text nodes and puts the Node where the placeholder was', () => {
        const el = document.createElement('p');
        const name = strong('علی');
        setTemplate(el, 'voteConfirm.question', { name });
        assert.equal(el.children.length, 3);
        assert.deepEqual(
            el.children.map((c) => (c === name ? 'NODE' : c.textContent)),
            ['آیا مطمئنید می‌خواهید به ', 'NODE', ' رای دهید؟']
        );
        assert.equal(shown(el), 'آیا مطمئنید می‌خواهید به علی رای دهید؟');
        assert.equal(name.tagName, 'STRONG');
    });

    it('writes a string or number slot as plain text, and never as markup', () => {
        const el = document.createElement('p');
        const evil = '<img src=x onerror=alert(1)>';
        setTemplate(el, 'voteConfirm.question', { name: evil });
        assert.equal(shown(el), `آیا مطمئنید می‌خواهید به ${evil} رای دهید؟`);
        assert.ok(el.children.every((c) => c.nodeType === 3), 'only text nodes');
        assert.equal(el.innerHTML, '');
        setTemplate(el, 'voteConfirm.question', { name: 7 });
        assert.match(shown(el), / 7 /);
        // A name given as a Node carries the hostile text as its textContent only.
        const node = strong(evil);
        setTemplate(el, 'voteConfirm.question', { name: node });
        assert.equal(node.textContent, evil);
        assert.equal(node.innerHTML, '');
    });

    it('replaces what was in the element', () => {
        const el = document.createElement('p');
        el.textContent = 'old';
        el.appendChild(strong('stale child'));
        setTemplate(el, 'toast.fileTooLarge', {});
        assert.equal(el.children.length, 1);
        assert.equal(el.textContent, '');
        assert.equal(shown(el), fa['toast.fileTooLarge']);
    });

    it('leaves a placeholder with no slot and no param as it is, and ignores extra slots', () => {
        const el = document.createElement('p');
        withKeys({ 'test.t': 'a {x} b {y} c' }, () => {
            setTemplate(el, 'test.t', { x: 'X', unused: strong('u') });
            assert.equal(shown(el), 'a X b {y} c');
            setTemplate(el, 'test.t');
            assert.equal(shown(el), 'a {x} b {y} c');
            setTemplate(el, 'test.t', { x: null, y: undefined });
            assert.equal(shown(el), 'a {x} b {y} c', 'null and undefined count as missing');
        });
    });

    it('takes a placeholder without a slot from params, as text', () => {
        const el = document.createElement('p');
        withKeys({ 'test.t': '{count} of {total}: {who}' }, () => {
            setTemplate(el, 'test.t', { who: strong('Sara') }, { count: 2, total: '<b>5</b>' });
            assert.equal(shown(el), '2 of <b>5</b>: Sara');
            assert.equal(el.children.length, 2, 'the text before the node is one node');
        });
    });

    it('reads the text once: a value that looks like a placeholder is not expanded again', () => {
        const el = document.createElement('p');
        const node = strong('N');
        withKeys({ 'test.t': '{a} | {b}' }, () => {
            setTemplate(el, 'test.t', { b: node }, { a: '{b}' });
            assert.equal(el.children[0].textContent, '{b} | ');
            assert.equal(el.children[1], node);
        });
    });

    it('turns {br} into a line break unless a slot overrides it', () => {
        const el = document.createElement('p');
        withKeys({ 'test.t': 'one{br}two' }, () => {
            setTemplate(el, 'test.t');
            assert.deepEqual(el.children.map((c) => c.tagName || c.textContent), ['one', 'BR', 'two']);
            setTemplate(el, 'test.t', { br: ' / ' });
            assert.equal(shown(el), 'one / two');
        });
    });

    it('clones a Node that two placeholders share instead of moving it', () => {
        const el = document.createElement('p');
        let clones = 0;
        const node = {
            nodeType: 1,
            tagName: 'STRONG',
            textContent: 'N',
            cloneNode(deep) {
                clones++;
                assert.equal(deep, true);
                return { nodeType: 1, tagName: 'STRONG', textContent: 'N', clone: true };
            }
        };
        withKeys({ 'test.t': '{n} and {n}' }, () => {
            setTemplate(el, 'test.t', { n: node });
            assert.equal(el.children[0], node);
            assert.equal(el.children[2].clone, true);
            assert.equal(clones, 1);
        });
    });

    it('shows the key when no catalog has it, and writes nothing else', () => {
        const el = document.createElement('p');
        setTemplate(el, 'no.such.key', { x: 1 });
        assert.equal(shown(el), 'no.such.key');
        const empty = document.createElement('p');
        withKeys({ 'test.empty': '{x}' }, () => {
            setTemplate(empty, 'test.empty', { x: '' });
            assert.equal(empty.children.length, 0, 'an empty text makes no empty text node');
        });
    });

    it('follows the active language', () => {
        const el = document.createElement('p');
        withLanguage('xx', { 'voteConfirm.question': 'Vote for {name}?' }, () => {
            setLang('xx');
            setTemplate(el, 'voteConfirm.question', { name: strong('Ali') });
            assert.equal(shown(el), 'Vote for Ali?');
        });
    });

    it('returns the element', () => {
        const el = document.createElement('p');
        assert.equal(setTemplate(el, 'toast.fileTooLarge'), el);
    });
});

describe('tHtml and tnHtml', () => {
    it('escapes the catalog text and every plain parameter, and only rawHtml() gets through', () => {
        withKeys({ 'test.h': 'a & <b> "q" \'s\' {name} {markup}' }, () => {
            assert.equal(
                tHtml('test.h', { name: '<img src=x onerror=alert(1)>', markup: rawHtml('<strong>ok</strong>') }),
                'a &amp; &lt;b&gt; &quot;q&quot; &#39;s&#39; &lt;img src=x onerror=alert(1)&gt; <strong>ok</strong>'
            );
        });
    });

    it('does not let a lookalike object pass as trusted markup', () => {
        withKeys({ 'test.h': '{x}' }, () => {
            assert.equal(tHtml('test.h', { x: { html: '<b>x</b>' } }), '[object Object]');
            assert.equal(tHtml('test.h', { x: '<b>x</b>' }), '&lt;b&gt;x&lt;/b&gt;');
        });
    });

    it('keeps 0, empty strings and other falsy values; leaves a missing placeholder as text', () => {
        withKeys({ 'test.h': '[{a}][{b}][{c}][{d}]' }, () => {
            assert.equal(tHtml('test.h', { a: 0, b: '', c: false }), '[0][][false][{d}]');
        });
    });

    it('turns {br} into <br> and nothing else into markup', () => {
        withKeys({ 'test.h': 'one{br}two' }, () => {
            assert.equal(tHtml('test.h'), 'one<br>two');
            assert.equal(tHtml('test.h', { br: ' - ' }), 'one - two');
        });
    });

    it('is a single pass: a parameter that looks like a placeholder stays literal', () => {
        withKeys({ 'test.h': '{a}{b}' }, () => {
            assert.equal(tHtml('test.h', { a: '{b}', b: 'B' }), '{b}B');
        });
    });

    it('returns the escaped key for an unknown key', () => {
        assert.equal(tHtml('no.such<key>'), 'no.such&lt;key&gt;');
        assert.equal(tHtml('constructor'), 'constructor');
    });

    it('gives the same text as t() for the real Persian texts that carry no markup', () => {
        for (const key of ['toast.selfVote', 'elim.note.noLastChance', 'result.title.spy', 'role.hintTitle.firstLetter']) {
            assert.equal(tHtml(key), t(key), key);
        }
    });

    it('tnHtml picks the plural form, formats the count and escapes the rest', () => {
        withLanguage('de', { 'thing.one': '{count} <Ding> {x}', 'thing.other': '{count} <Dinge> {x}' }, () => {
            setLang('de');
            assert.equal(tnHtml('thing', 1, { x: '&' }), '1 &lt;Ding&gt; &amp;');
            assert.equal(tnHtml('thing', 2, { x: rawHtml('<i>&</i>') }), '2 &lt;Dinge&gt; <i>&</i>');
            assert.equal(tnHtml('thing', 2, { count: 'many' }), 'many &lt;Dinge&gt; {x}');
        });
        assert.equal(tnHtml('no.such.key', 2), 'no.such.key');
    });

    it('tnHtml writes Persian digits for Persian', () => {
        assert.equal(tnHtml('names.more', 3, { a: rawHtml('<bdi>x</bdi>') }), '<bdi>x</bdi> و ۳ نفر دیگر');
    });
});
