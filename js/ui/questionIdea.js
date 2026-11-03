/**
 * The "Question idea" button on the discussion screen: one suggested question, as plain text, in a polite live
 * region (`#question-idea-text`). Each press shows the next question of a shuffled bag (`game/questionPicker.js`),
 * drawn from the bank of the active language (`data/banks.js`).
 *
 * The question lives only in that element: it is not in `gameState`, `hostSecretState`, `session` or
 * `localStorage`, so the saved match is never touched, and the screen reads nothing about the match (it is public
 * and the same for every player). The bags live only in memory, so a reload starts them over.
 */

import { getQuestionIdeas } from '../data/banks.js';
import { createQuestionPicker } from '../game/questionPicker.js';
import { getLang } from '../i18n/index.js';

const picker = createQuestionPicker({ getBank: getQuestionIdeas });

/** Show the next question for the active language. The button keeps the focus: nothing is redrawn. */
export function showQuestionIdea() {
    const box = document.getElementById('question-idea-text');
    if (!box) return;
    box.textContent = picker.next(getLang());
}

/** Empty the live region (a new round, or another language: the shown question would be in the wrong language). */
export function clearQuestionIdea() {
    const box = document.getElementById('question-idea-text');
    if (box) box.textContent = '';
}
