/**
 * The word bank, the side quests and the question ideas of each language.
 *
 * `rounds.js` asks for the bank of the language of the match: `getWordPacks(lang)` and
 * `getSideQuests(lang)`. The discussion screen's question button asks for `getQuestionIdeas(lang)`.
 * A language with no data of its own gets the Persian data, which is the default language and always
 * complete. The language is a parameter, so this module (like the rest of `data/`) never imports `i18n/`.
 */

import { questionIdeasPool } from './questionIdeas.js';
import { questionIdeasPoolEn } from './questionIdeasEn.js';
import { sideQuestsPool } from './sideQuests.js';
import { sideQuestsPoolEn } from './sideQuestsEn.js';
import { WORD_PACKS } from './wordPacks.js';
import { WORD_PACKS_EN } from './wordPacksEn.js';

/** Language the data falls back to: the default language of the app. */
export const FALLBACK_DATA_LANG = 'fa';

const WORD_BANKS = { fa: WORD_PACKS, en: WORD_PACKS_EN };
const QUEST_POOLS = { fa: sideQuestsPool, en: sideQuestsPoolEn };
const QUESTION_BANKS = { fa: questionIdeasPool, en: questionIdeasPoolEn };

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Languages that have a word bank and a side quest pool of their own, in registry order. */
export const DATA_LANGS = Object.keys(WORD_BANKS);

/** The word bank of `lang`: `{ places: [...], jobs: [...], ... }`. Do not modify it. */
export function getWordPacks(lang) {
    return hasOwn(WORD_BANKS, lang) ? WORD_BANKS[lang] : WORD_BANKS[FALLBACK_DATA_LANG];
}

/** The side quests of `lang`: an array of sentences. Do not modify it. */
export function getSideQuests(lang) {
    return hasOwn(QUEST_POOLS, lang) ? QUEST_POOLS[lang] : QUEST_POOLS[FALLBACK_DATA_LANG];
}

/** The question ideas of `lang`: an array of short questions. Do not modify it. */
export function getQuestionIdeas(lang) {
    return hasOwn(QUESTION_BANKS, lang) ? QUESTION_BANKS[lang] : QUESTION_BANKS[FALLBACK_DATA_LANG];
}
