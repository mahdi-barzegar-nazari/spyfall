/**
 * Application entry point: wires every module together in the original start-up order.
 */

import { SAVE_VERSION } from './core/state.js';
import { initAntiZoom } from './platform/antiZoom.js';
import { setupAudio } from './platform/audio.js';
import { initInstallPrompt } from './platform/install.js';
import { registerServiceWorker } from './platform/serviceWorker.js';
import { bindEvents } from './ui/bindings.js';
import { renderCustomWordsList } from './ui/customWords.js';
import { initHandoffGate } from './ui/handoff.js';
import { renderNameInputs, syncCheckboxChipVisuals, updateSetupLimitHints } from './ui/setup.js';
import { initTheme } from './ui/theme.js';

/** Initial render and saved-game detection. */
function start() {
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

initAntiZoom();
setupAudio();
initTheme();
bindEvents();
initInstallPrompt();
start();
registerServiceWorker();
