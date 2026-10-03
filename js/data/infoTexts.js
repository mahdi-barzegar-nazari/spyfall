/**
 * Keys of the help texts behind the (i) info buttons (`data-info="key"` in index.html).
 *
 * The texts themselves live in the translation catalogs as `info.<key>.title` and `info.<key>.text`
 * (js/i18n/fa.js), and `showInfoModal` reads them with `t()`.
 */

export const INFO_KEYS = Object.freeze([
    'detective',
    'knownSpies',
    'fool',
    'director',
    'oneword',
    'quests',
    'wager',
    'sudden',
    'spyLastChance',
    'voteLimit',
    'roleRevealConfirm',
    'voteConfirm',
    'quickVoting',
    'hintTypes'
]);
