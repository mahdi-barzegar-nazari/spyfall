/**
 * Application entry point: wires every module together in the original start-up order.
 */

import { wireApp } from './app/wire.js';
import { SAVE_VERSION } from './core/state.js';
import { initI18n, onLangChange } from './i18n/index.js';
import { initAntiZoom } from './platform/antiZoom.js';
import { setupAudio } from './platform/audio.js';
import { initInstallPrompt } from './platform/install.js';
import { registerServiceWorker } from './platform/serviceWorker.js';
import { bindEvents } from './ui/bindings.js';
import { renderCustomWordsList } from './ui/customWords.js';
import { clearToasts } from './ui/feedback.js';
import { initHandoffGate } from './ui/handoff.js';
import { syncLangSwitch } from './ui/langSwitch.js';
import { renderNameInputs, syncCheckboxChipVisuals, updateSetupLimitHints } from './ui/setup.js';
import { initTheme } from './ui/theme.js';

/** Initial render and saved-game detection. */
function start() {
    syncLangSwitch();

    renderNameInputs();

    updateSetupLimitHints();

    renderCustomWordsList();

    syncCheckboxChipVisuals('category-chips-container', 'chip-item');

    syncCheckboxChipVisuals('hint-chips-container', 'hint-chip');

    initHandoffGate();

    try {
        const rawCombined = localStorage.getItem('spy_full_state_master');
        if (rawCombined) {
            const parsed = JSON.parse(rawCombined);
            if (
                parsed &&
                parsed.version === SAVE_VERSION &&
                parsed.state &&
                Array.isArray(parsed.state.players) &&
                parsed.state.players.length > 0
            ) {
                document.getElementById('recovery-banner').classList.remove('hidden');
            }
        }
    } catch(e){}
}

/**
 * What JS writes into the page once, and so does not follow the static translator by itself: the pressed
 * state of the language switch, the default names (and the names' placeholders and labels), the limit
 * hints, the custom-word count and list, and any toast still on screen. Redo them when the language
 * changes: after a click on the switch, and when a saved match is restored in the language it was started
 * in. Texts built when something opens (the info modals, the role card) need nothing here.
 */
function refreshLanguageDependentUi() {
    syncLangSwitch();
    clearToasts();
    updateSetupLimitHints();
    renderNameInputs(false, true);
    renderCustomWordsList();
}

initI18n();
onLangChange(refreshLanguageDependentUi);
wireApp();
initAntiZoom();
setupAudio();
initTheme();
bindEvents();
initInstallPrompt();
start();
registerServiceWorker();
