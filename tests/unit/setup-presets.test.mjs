/**
 * The setup screen's presets: the data (data/presets.js), and what applying a preset and lighting the active chip do
 * to the form (ui/setupPresets.js). The form is faked; index.html is read to check the real controls exist.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RULES, defaultSetupSettings, sanitizeSetupSettings } from '../../js/core/config.js';
import { MAX_VOTES_CONTROL, PRESET_CONTROLS, SETUP_PRESETS } from '../../js/data/presets.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { elements, parseHtml } from './helpers/htmlScan.mjs';

const env = installFakeEnv();
const { activeSetupPreset, applySetupPreset, refreshSetupPresets } = await import('../../js/ui/setupPresets.js');
const { SETUP_GROUPS } = await import('../../js/ui/setupGroups.js');
const { setLang } = await import('../../js/i18n/index.js');
after(() => env.uninstall());
afterEach(() => setLang('fa'));

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const ids = SETUP_PRESETS.map((p) => p.id);

/** The form as the page has it: a switch for every preset control, the alarm number and box, the hint line, the chips. */
function fakeForm(on = []) {
    for (const g of SETUP_GROUPS) {
        env.el(`setup-group-${g.id}-badge`);
        for (const control of g.controls) {
            if (control.id) Object.assign(env.el(control.id), { checked: on.includes(control.id) });
        }
    }
    for (const id of Object.values(PRESET_CONTROLS)) Object.assign(env.el(id), { checked: on.includes(id) });
    env.el(MAX_VOTES_CONTROL).value = '2';
    env.el('vote-limit-box').classList.add('hidden');
    env.el('setup-presets-hint').textContent = '';
    const chips = ids.map((id) => {
        const chip = env.el(`preset-${id}`);
        chip.dataset.preset = id;
        return chip;
    });
    env.stubQuery('#setup-presets [data-preset]', chips);
    env.stubQuery('input[name="setup-hint"]:checked', [{}]);
    env.stubQuery('input[name="setup-hint"]', [{}]);
    env.el('setup-reveal-mode').value = 'click';
    return chips;
}

/** The ids of the switches a preset turns on. */
const switchesOn = (preset) => Object.entries(PRESET_CONTROLS).filter(([key]) => preset.settings[key]).map(([, id]) => id);

describe('the preset data', () => {
    it('are classic, party and competitive, each once, with a label and a description in both languages', () => {
        assert.deepEqual(ids, ['classic', 'party', 'competitive']);
        for (const id of ids) {
            for (const cat of [fa, en]) {
                assert.ok(cat[`setup.preset.${id}`], `${id} label`);
                assert.ok(cat[`setup.preset.${id}.desc`], `${id} description`);
            }
        }
    });

    it('each names every switch of PRESET_CONTROLS with a real boolean, and the alarm number inside the rules', () => {
        for (const preset of SETUP_PRESETS) {
            for (const key of Object.keys(PRESET_CONTROLS)) assert.equal(typeof preset.settings[key], 'boolean', `${preset.id}.${key}`);
            assert.ok(Number.isInteger(preset.settings.maxVotes));
            assert.ok(preset.settings.maxVotes >= RULES.emergencyVotes.min && preset.settings.maxVotes <= RULES.emergencyVotes.max);
            assert.deepEqual(Object.keys(preset.settings).sort(), [...Object.keys(PRESET_CONTROLS), 'maxVotes'].sort(), preset.id);
        }
    });

    it('the settings of each are ones the setup would accept unchanged (the same gate the saved setup goes through)', () => {
        for (const preset of SETUP_PRESETS) {
            const clean = sanitizeSetupSettings({ ...defaultSetupSettings(), ...preset.settings });
            for (const [key, value] of Object.entries(preset.settings)) assert.equal(clean[key], value, `${preset.id}.${key}`);
        }
    });

    it('classic is exactly the defaults of those switches', () => {
        const defaults = defaultSetupSettings();
        const classic = SETUP_PRESETS.find((p) => p.id === 'classic').settings;
        for (const key of Object.keys(PRESET_CONTROLS)) assert.equal(classic[key], defaults[key], key);
        assert.equal(classic.maxVotes, defaults.maxVotes);
    });

    it('the presets differ from each other in at least one switch each', () => {
        const key = (p) => JSON.stringify(Object.keys(PRESET_CONTROLS).map((k) => p.settings[k]));
        assert.equal(new Set(SETUP_PRESETS.map(key)).size, SETUP_PRESETS.length);
    });

    it('every control is a switch that exists on the setup screen, in the group of switches', () => {
        const page = [...elements(parseHtml(html))];
        const checkboxes = new Set(page.filter((el) => el.attrs.type === 'checkbox').map((el) => el.attrs.id));
        for (const id of Object.values(PRESET_CONTROLS)) assert.ok(checkboxes.has(id), id);
        assert.ok(page.some((el) => el.attrs.id === MAX_VOTES_CONTROL));
        assert.ok(page.some((el) => el.attrs.id === 'vote-limit-box'));
    });

    it('never touch what belongs to the person: every control is a switch inside the groups of advanced options', () => {
        const page = [...elements(parseHtml(html))];
        const groups = page.find((el) => el.attrs.id === 'setup-groups');
        const insideGroups = new Set([...elements(groups)].map((el) => el.attrs.id));
        for (const id of Object.values(PRESET_CONTROLS)) assert.ok(insideGroups.has(id), `${id} is in #setup-groups`);
        assert.ok(!Object.values(PRESET_CONTROLS).includes('toggle-role-reveal-confirm'), 'the role hand-over gate is not a preset switch');
    });
});

describe('the chips in the page', () => {
    it('are three buttons with a data-preset that is a preset, in the order of the presets', () => {
        const page = [...elements(parseHtml(html))];
        const chips = page.filter((el) => el.attrs['data-preset']);
        assert.deepEqual(chips.map((el) => el.attrs['data-preset']), ids);
        for (const chip of chips) {
            assert.equal(chip.tag, 'button');
            assert.equal(chip.attrs.type, 'button');
            assert.equal(chip.attrs['aria-pressed'], 'false');
            assert.equal(chip.attrs['data-i18n'], `setup.preset.${chip.attrs['data-preset']}`);
        }
    });
});

describe('activeSetupPreset', () => {
    it('is the preset whose switches are all as it says', () => {
        for (const preset of SETUP_PRESETS) {
            fakeForm(switchesOn(preset));
            assert.equal(activeSetupPreset(), preset.id);
        }
    });

    it('is null as soon as one switch differs, or nothing matches', () => {
        const party = SETUP_PRESETS.find((p) => p.id === 'party');
        fakeForm([...switchesOn(party), PRESET_CONTROLS.wager]);
        assert.equal(activeSetupPreset(), null);
        fakeForm(switchesOn(party).filter((id) => id !== PRESET_CONTROLS.quests));
        assert.equal(activeSetupPreset(), null);
    });

    it('does not care about a switch no preset names (the role hand-over gate, say)', () => {
        const classic = SETUP_PRESETS.find((p) => p.id === 'classic');
        fakeForm([...switchesOn(classic), 'toggle-role-reveal-confirm']);
        assert.equal(activeSetupPreset(), 'classic');
    });

    it('when the alarm limit is on, the number of alarms has to match too', () => {
        const competitive = SETUP_PRESETS.find((p) => p.id === 'competitive');
        fakeForm(switchesOn(competitive));
        env.el(MAX_VOTES_CONTROL).value = '5';
        assert.equal(activeSetupPreset(), null);
        env.el(MAX_VOTES_CONTROL).value = '٢';
        assert.equal(activeSetupPreset(), 'competitive');
    });

    it('when the alarm limit is off, the number of alarms is ignored', () => {
        const classic = SETUP_PRESETS.find((p) => p.id === 'classic');
        fakeForm(switchesOn(classic));
        env.el(MAX_VOTES_CONTROL).value = '9';
        assert.equal(activeSetupPreset(), 'classic');
    });
});

describe('applySetupPreset', () => {
    it('sets every switch of the preset, and nothing else', () => {
        for (const preset of SETUP_PRESETS) {
            fakeForm(['toggle-role-reveal-confirm', PRESET_CONTROLS.knownSpies, PRESET_CONTROLS.oneword]);
            assert.equal(applySetupPreset(preset.id), true);
            for (const [key, id] of Object.entries(PRESET_CONTROLS)) assert.equal(env.el(id).checked, preset.settings[key], `${preset.id}.${key}`);
            assert.equal(env.el('toggle-role-reveal-confirm').checked, true, 'the role hand-over gate is not a preset switch');
            assert.equal(activeSetupPreset(), preset.id);
        }
    });

    it('is the same whatever was set before', () => {
        const state = (id) => {
            fakeForm(Object.values(PRESET_CONTROLS));
            applySetupPreset(id);
            return JSON.stringify(Object.values(PRESET_CONTROLS).map((cid) => env.el(cid).checked));
        };
        for (const id of ids) {
            const fromAllOn = state(id);
            fakeForm([]);
            applySetupPreset(id);
            assert.equal(JSON.stringify(Object.values(PRESET_CONTROLS).map((cid) => env.el(cid).checked)), fromAllOn, id);
        }
    });

    it('shows the box of the alarm number only for a preset that turns the limit on, and writes the number', () => {
        fakeForm();
        env.el(MAX_VOTES_CONTROL).value = '7';
        applySetupPreset('competitive');
        assert.equal(env.el('vote-limit-box').classList.contains('hidden'), false);
        assert.equal(env.el(MAX_VOTES_CONTROL).value, '2');
        applySetupPreset('party');
        assert.equal(env.el('vote-limit-box').classList.contains('hidden'), true);
    });

    it('refuses an id that is not a preset and changes nothing', () => {
        fakeForm([PRESET_CONTROLS.fool]);
        for (const bad of ['', 'x', undefined, null, 'constructor']) assert.equal(applySetupPreset(bad), false, String(bad));
        assert.equal(env.el(PRESET_CONTROLS.fool).checked, true);
        assert.equal(env.el(PRESET_CONTROLS.wager).checked, false);
    });
});

describe('refreshSetupPresets', () => {
    it('lights only the chip of the active preset, with aria-pressed, and writes its description under the chips', () => {
        const chips = fakeForm(switchesOn(SETUP_PRESETS.find((p) => p.id === 'party')));
        refreshSetupPresets();
        const lit = chips.filter((c) => c.classList.contains('active')).map((c) => c.dataset.preset);
        assert.deepEqual(lit, ['party']);
        assert.deepEqual(chips.map((c) => c.attributes['aria-pressed']), ['false', 'true', 'false']);
        assert.equal(env.el('setup-presets-hint').textContent, fa['setup.preset.party.desc']);
    });

    it('lights none, and writes the general hint, when the switches match no preset', () => {
        const chips = fakeForm([PRESET_CONTROLS.quests]);
        refreshSetupPresets();
        assert.equal(chips.some((c) => c.classList.contains('active')), false);
        assert.equal(env.el('setup-presets-hint').textContent, fa['setup.presets.hint']);
    });

    it('writes in the language that is on', () => {
        setLang('en');
        fakeForm(switchesOn(SETUP_PRESETS.find((p) => p.id === 'competitive')));
        refreshSetupPresets();
        assert.equal(env.el('setup-presets-hint').textContent, en['setup.preset.competitive.desc']);
    });
});
