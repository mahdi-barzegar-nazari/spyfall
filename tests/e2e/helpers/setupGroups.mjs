/**
 * Plumbing for the browser tests that touch the options inside the four collapsible groups of the setup screen
 * (`#setup-group-<id>`, native `<details>` that start closed). A control inside a closed group is not rendered, so
 * a test that taps it first has to open its group: `openSetupGroup(page, 'roles')` for one, `openAllSetupGroups(page)`
 * for all of them. Both open a group the way a person does, by clicking its header, and leave an open one alone.
 *
 * `GROUP_OF_CONTROL` is the table the tests hold the page to: which group each control sits in. It is written out
 * here on purpose and is not read from js/ui/setupGroups.js, so the markup and the code are each checked against it.
 */

export const GROUP_IDS = ['roles', 'discussion', 'stakes', 'speed'];

/** The 14 switches and selects of the groups (by element id), plus the vote-limit number box, each with its group. */
export const GROUP_OF_CONTROL = {
    'toggle-detective': 'roles',
    'toggle-known': 'roles',
    'toggle-fool': 'roles',
    'toggle-director': 'discussion',
    'toggle-oneword': 'discussion',
    'toggle-quests': 'discussion',
    'toggle-limit': 'discussion',
    'setup-max-votes': 'discussion',
    'toggle-wager': 'stakes',
    'toggle-sudden': 'stakes',
    'toggle-last-chance': 'stakes',
    'setup-reveal-mode': 'speed',
    'toggle-role-reveal-confirm': 'speed',
    'toggle-vote-confirm': 'speed',
    'toggle-quick-voting': 'speed'
};

/** The hint chips (checkboxes named `setup-hint`) sit in the roles group too. */
export const HINT_CHIPS_GROUP = 'roles';

/** The five fields that stay above the groups, always visible. */
export const CORE_FIELDS = ['setup-players-count', 'setup-spies-count', 'setup-timer'];
export const CORE_CHIP_NAMES = ['setup-cat', 'setup-diff'];

const summaryOf = (id) => `#setup-group-${id} > summary`;

/** Is group `id` open right now? */
export const isGroupOpen = (page, id) => page.locator(`#setup-group-${id}`).evaluate((el) => el.open);

/** Open group `id` by clicking its header, unless it is open already. */
export async function openSetupGroup(page, id) {
    if (!(await isGroupOpen(page, id))) await page.click(summaryOf(id));
    await page.waitForFunction((groupId) => document.getElementById(`setup-group-${groupId}`).open, id);
}

/** Open every group (see `openSetupGroup`). */
export async function openAllSetupGroups(page) {
    for (const id of GROUP_IDS) await openSetupGroup(page, id);
}

/** `{ roles: false, ... }`: which groups are open. */
export const groupStates = (page) =>
    page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, document.getElementById(`setup-group-${id}`).open])), GROUP_IDS);

/** `{ roles: '1 on', ... }`: the text of every badge, and `counts` the number each one stands for. */
export const badges = (page) =>
    page.evaluate((ids) => {
        const text = {};
        const counts = {};
        for (const id of ids) {
            const badge = document.getElementById(`setup-group-${id}-badge`);
            text[id] = badge.textContent;
            counts[id] = badge.dataset.count;
        }
        return { text, counts };
    }, GROUP_IDS);
