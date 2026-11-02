/**
 * The welcome screen's "How to play" help, below the click: its three catalog entries in both languages
 * (`welcome.howToPlay` for the button, `info.howToPlay.title` / `.text` for the modal), its place in INFO_KEYS,
 * the button in index.html and what `showInfoModal` writes into the modal. The click itself, the focus trap and
 * the focus coming back on close are checked in the browser by tests/e2e/how-to-play.test.mjs.
 *
 * Everything runs on the fake browser of helpers/fakeEnv.mjs, with the real showInfoModal and the real catalogs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INFO_KEYS } from '../../js/data/infoTexts.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';
import { closest, elements, normalizeText, parseHtml, innerText } from './helpers/htmlScan.mjs';

const env = installFakeEnv();
const { showInfoModal } = await import('../../js/core/dispatch.js');
const { setLang } = await import('../../js/i18n/index.js');

const recorded = useGameHarness(env, {
    setup: () => {
        env.el('info-modal-title');
        env.el('info-modal-desc');
    }
});
after(() => env.uninstall());
afterEach(() => setLang('fa'));

const KEYS = ['welcome.howToPlay', 'info.howToPlay.title', 'info.howToPlay.text'];
const CATALOGS = { fa, en };
const PERSIAN_LETTER = /[\u0600-\u06FF]/;

const lines = (text) => text.split('\n');

describe('How to play: catalog entries', () => {
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
        it(`${lang}: has the button label, the modal title and the modal text`, () => {
            for (const key of KEYS) {
                assert.equal(typeof catalog[key], 'string', `${lang}: ${key} is missing`);
                assert.ok(catalog[key].trim(), `${lang}: ${key} is empty`);
            }
        });

        it(`${lang}: the text is about six short bullet lines`, () => {
            const rows = lines(catalog['info.howToPlay.text']);
            assert.ok(rows.length >= 5 && rows.length <= 7, `${lang}: ${rows.length} lines`);
            for (const row of rows) {
                assert.ok(row.startsWith('• '), `${lang}: not a bullet line: ${row}`);
                assert.ok(row.length <= 100, `${lang}: line too long for a phone (${row.length}): ${row}`);
            }
        });
    }

    it('English never shows a Persian letter, and the Persian text is all Persian (no stray English)', () => {
        for (const key of KEYS) assert.doesNotMatch(en[key], PERSIAN_LETTER, key);
        for (const key of KEYS) assert.doesNotMatch(fa[key], /[A-Za-z]/, key);
    });

    it('tells every beat of a round, in both languages', () => {
        // One keyword per beat: who sees what, the hint, turns and questions, the vote, the last chance, how the spy wins.
        const beats = {
            en: ['secret word', 'hint', 'turns', 'vote', 'last chance', 'hidden', 'guessing'],
            fa: ['کلمه رمز', 'راهنما', 'به‌نوبت', 'رأی', 'فرصت آخر', 'مخفی', 'حدس']
        };
        for (const [lang, words] of Object.entries(beats)) {
            const text = CATALOGS[lang]['info.howToPlay.text'];
            for (const word of words) assert.ok(text.includes(word), `${lang}: the text does not mention "${word}"`);
        }
    });

    it('leaves wagers, side quests and scoring to their own (i) help', () => {
        assert.doesNotMatch(en['info.howToPlay.text'], /wager|\bbets?\b|point|scor|side quest|\bquests?\b|balance/i);
        assert.doesNotMatch(fa['info.howToPlay.text'], /شرط|امتیاز|ماموریت|مأموریت/);
    });

    it('keeps the glossary words of en.js (spy, secret word, hint, last chance) and does not rename them', () => {
        const text = en['info.howToPlay.text'];
        for (const word of ['spy', 'secret word', 'hint', 'last chance']) assert.ok(text.includes(word), word);
        assert.doesNotMatch(text, /\b(agent|impostor|code ?word|password|clue)\b/i, 'a different word for a glossary idea');
    });
});

describe('How to play: INFO_KEYS and index.html', () => {
    const ROOT = fileURLToPath(new URL('../../', import.meta.url));
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const all = [...elements(parseHtml(html))];

    it('howToPlay is in INFO_KEYS exactly once', () => {
        assert.equal(INFO_KEYS.filter((key) => key === 'howToPlay').length, 1);
    });

    it('exactly one button opens it: a labelled ghost button on the welcome screen, after the play button', () => {
        const buttons = all.filter((el) => el.attrs['data-info'] === 'howToPlay');
        assert.equal(buttons.length, 1, 'one element with data-info="howToPlay"');
        const [button] = buttons;
        assert.equal(button.tag, 'button');
        assert.equal(button.attrs.type, 'button');
        assert.equal(button.attrs.id, 'btn-how-to-play');
        assert.equal(button.attrs['data-i18n'], 'welcome.howToPlay');
        assert.match(button.attrs.class, /\bbtn-ghost\b/, 'a ghost button, so the play button stays the main action');
        assert.equal(closest(button, (n) => n.attrs.id === 'screen-welcome')?.attrs.id, 'screen-welcome');
        assert.equal(normalizeText(innerText(button)), fa['welcome.howToPlay'], 'the default text before JS runs is the Persian label');

        const play = all.find((el) => el.attrs.id === 'btn-nav-setup');
        assert.ok(play && play.start < button.start, 'the play button comes first in the page (and in the tab order)');
        assert.equal(all.filter((el) => (el.attrs.class ?? '').split(/\s+/).includes('play-button')).length, 1, 'still exactly one play button');
    });
});

describe('How to play: showInfoModal', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: writes the title and the text of the catalog into the modal and opens it`, () => {
            setLang(lang);
            showInfoModal('howToPlay');
            assert.equal(env.el('info-modal-title').textContent, CATALOGS[lang]['info.howToPlay.title']);
            assert.equal(env.el('info-modal-desc').textContent, CATALOGS[lang]['info.howToPlay.text']);
            assert.deepEqual(recorded.actions, [{ type: 'OPEN_MODAL', payload: 'info-modal' }]);
        });
    }

    it('still ignores a key that is not in INFO_KEYS', () => {
        showInfoModal('howToPlayy');
        assert.deepEqual(recorded.actions, []);
        assert.equal(env.el('info-modal-title').textContent, '');
    });
});
