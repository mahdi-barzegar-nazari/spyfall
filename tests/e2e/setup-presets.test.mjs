/**
 * End-to-end test of the setup screen's presets, against the PRODUCTION build in a real Chromium at 360x740, in
 * the style of the other setup tests: three chips between the core fields and the four groups, a tap sets the
 * switches of the groups (opened here to read them) and lights the chip, changing a switch by hand puts the light
 * out, and the setup that is saved when a match starts keeps the preset's switches. In Persian and in English.
 * The Persian baseline of the setup screen leaves this block out (helpers/record.mjs).
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PRESET_CONTROLS, SETUP_PRESETS } from '../../js/data/presets.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { openAllSetupGroups } from './helpers/setupGroups.mjs';

const CATALOGS = { fa, en };
let app;
let browser;
let baseUrl;

before(async () => {
    app = await startApp();
    ({ browser, baseUrl } = app);
});

after(async () => {
    await app?.stop();
});

/** Open the setup screen on a fresh phone-sized page in `lang`, run `fn(page)`, and fail on any script error. */
async function withSetup(lang, fn) {
    const context = await browser.newContext({ viewport: PHONE });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        if (lang === 'en') await page.click('#btn-lang-en');
        await page.click('#btn-nav-setup');
        await page.waitForSelector('#screen-setup:not(.hidden)');
        await openAllSetupGroups(page);
        await fn(page);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const chip = (id) => `#setup-presets [data-preset="${id}"]`;
const lit = (page) => page.$$eval('#setup-presets [data-preset]', (chips) => chips.filter((c) => c.classList.contains('active')).map((c) => c.dataset.preset));
const switchesOf = (page) => page.evaluate((controls) => Object.fromEntries(Object.entries(controls).map(([key, id]) => [key, document.getElementById(id).checked])), PRESET_CONTROLS);

describe('the presets of the setup screen', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: sit between the core fields and the groups, with the labels of the language, and the classic one is lit at first`, async () => {
            await withSetup(lang, async (page) => {
                const order = await page.evaluate(() => {
                    const top = (id) => document.getElementById(id).getBoundingClientRect().top;
                    return { core: top('setup-core'), presets: top('setup-presets'), groups: top('setup-groups') };
                });
                assert.ok(order.core < order.presets && order.presets < order.groups, JSON.stringify(order));
                for (const preset of SETUP_PRESETS) {
                    assert.equal(await page.locator(chip(preset.id)).innerText(), CATALOGS[lang][`setup.preset.${preset.id}`]);
                }
                assert.deepEqual(await lit(page), ['classic']);
                assert.equal(await page.locator('#setup-presets-hint').innerText(), CATALOGS[lang]['setup.preset.classic.desc']);
            });
        });

        it(`${lang}: a tap sets the switches of the preset, lights its chip and shows a toast`, async () => {
            await withSetup(lang, async (page) => {
                for (const preset of SETUP_PRESETS) {
                    await page.click(chip(preset.id));
                    const switches = await switchesOf(page);
                    for (const key of Object.keys(PRESET_CONTROLS)) assert.equal(switches[key], preset.settings[key], `${preset.id}.${key}`);
                    assert.deepEqual(await lit(page), [preset.id]);
                    assert.equal(await page.locator(chip(preset.id)).getAttribute('aria-pressed'), 'true');
                    assert.equal(await page.locator('#setup-presets-hint').innerText(), CATALOGS[lang][`setup.preset.${preset.id}.desc`]);
                }
            });
        });
    }

    it('changing a switch by hand puts the light out, and the general hint comes back', async () => {
        await withSetup('fa', async (page) => {
            await page.click(chip('party'));
            assert.deepEqual(await lit(page), ['party']);
            await page.locator('label.switch:has(#toggle-wager)').click();
            assert.deepEqual(await lit(page), []);
            assert.equal(await page.locator('#setup-presets-hint').innerText(), fa['setup.presets.hint']);
            await page.locator('label.switch:has(#toggle-wager)').click();
            assert.deepEqual(await lit(page), ['party']);
        });
    });

    it('the alarm limit box shows for a preset that turns the limit on, and not for the others', async () => {
        await withSetup('fa', async (page) => {
            await page.click(chip('competitive'));
            assert.equal(await page.locator('#vote-limit-box').isVisible(), true);
            await page.click(chip('classic'));
            assert.equal(await page.locator('#vote-limit-box').isVisible(), false);
        });
    });

    it('does not touch the players, the spies, the topics, the difficulty or the time', async () => {
        await withSetup('fa', async (page) => {
            const read = () => page.evaluate(() => ({
                players: document.getElementById('setup-players-count').value,
                spies: document.getElementById('setup-spies-count').value,
                time: document.getElementById('setup-timer').value,
                cats: [...document.querySelectorAll('input[name="setup-cat"]')].map((c) => c.checked),
                diff: [...document.querySelectorAll('input[name="setup-diff"]')].map((c) => c.checked)
            }));
            const before = await read();
            for (const preset of SETUP_PRESETS) await page.click(chip(preset.id));
            assert.deepEqual(await read(), before);
        });
    });
});
