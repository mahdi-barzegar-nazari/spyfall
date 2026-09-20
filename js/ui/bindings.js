/**
 * DOM event bindings. Every user action becomes a dispatch() call.
 */

import { dispatch, showInfoModal } from '../core/dispatch.js';
import { gameState, hostSecretState, session } from '../core/state.js';
import { persist } from '../core/storage.js';
import { runTick } from '../game/timer.js';
import { resumeAudioIfSuspended } from '../platform/audio.js';
import { requestWakeLock } from '../platform/wakeLock.js';
import { renderPlayerDetails } from './results.js';
import { renderNameInputs, syncCheckboxChipVisuals, updateSetupLimitHints } from './setup.js';

/** Attach every listener. Call once at start-up. */
export function bindEvents() {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await requestWakeLock();
            resumeAudioIfSuspended();

            if (gameState.phase === 'timer') {
                runTick();
            }
        } else {
            const holdGestureActive = gameState.settings.revealHold && gameState.settings.roleRevealConfirm !== false;
            if (holdGestureActive && !document.getElementById('role-modal').classList.contains('hidden')) {
                const activePlayer = gameState.players.find(x => x.id === session.activeModalPlayerId);
                const isDetectivePending = activePlayer && activePlayer.role === 'detective' && !(gameState.settings.detectiveUsed || hostSecretState.detectiveUsed);
                if (!isDetectivePending) {
                    dispatch({type: 'CLOSE_ROLE_CARD'});
                }
            }
        }
    });

    document.querySelectorAll('.info-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            showInfoModal(btn.dataset.info);
        };
    });

    document.getElementById('btn-info-modal-close').onclick = () => dispatch({type: 'CLOSE_MODAL', payload: 'info-modal'});

    document.getElementById('category-chips-container').addEventListener('change', () => syncCheckboxChipVisuals('category-chips-container', 'chip-item'));

    document.getElementById('hint-chips-container').addEventListener('change', () => syncCheckboxChipVisuals('hint-chips-container', 'hint-chip'));

    document.getElementById('btn-toggle-all-cats').onclick = () => {
        const boxes = document.querySelectorAll('input[name="setup-cat"]');
        const allChecked = Array.from(boxes).every(b => b.checked);
        boxes.forEach(b => b.checked = !allChecked);
        syncCheckboxChipVisuals('category-chips-container', 'chip-item');
    };

    document.getElementById('setup-players-count').addEventListener('change', () => {
        renderNameInputs(false);
        updateSetupLimitHints();
    });

    document.getElementById('setup-players-count').addEventListener('input', updateSetupLimitHints);

    document.getElementById('btn-sound-toggle').onclick = () => dispatch({type: 'TOGGLE_AUDIO'});

    document.getElementById('theme-selector').onchange = (e) => dispatch({type: 'CHANGE_THEME', payload: e.target.value});

    document.getElementById('btn-panic-open').onclick = () => dispatch({type: 'PANIC_OPEN'});

    document.getElementById('panic-shield').onclick = () => dispatch({type: 'PANIC_TAP'});

    document.getElementById('panic-shield').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dispatch({type: 'PANIC_TAP', source: 'keyboard'});
        }
    });

    // Robust double-tap-to-dismiss for cover mode. The shield's onclick
    // above measures the gap between synthetic 'click' events, but on
    // touchscreens the page's global anti-zoom guard (near the top of this
    // script) calls preventDefault() on a fast second touchend — which
    // also cancels the compatibility 'click' that would normally follow
    // it, so that second tap never reaches the click handler at all and
    // the shield is never dismissed. Detecting the double-tap straight
    // from touchend/touchstart timestamps (bypassing 'click' entirely),
    // plus a real 'dblclick' for mouse/trackpad, fixes this on every
    // mobile touchscreen and desktop browser.
    (function setupPanicShieldDoubleTap() {
        const shield = document.getElementById('panic-shield');
        if (!shield) return;
        const DOUBLE_TAP_MS = 350;
        const MOVE_TOLERANCE_PX = 24;
        // Per-touch start point: used only to tell a tap from a drag/swipe.
        let touchStartX = 0, touchStartY = 0;
        // Point + time of the last accepted tap: used to pair it with the next one.
        let lastTapTime = 0, lastTapX = 0, lastTapY = 0;

        shield.addEventListener('touchstart', (e) => {
            const touch = e.touches && e.touches[0];
            if (!touch) return;
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }, { passive: true });

        shield.addEventListener('touchend', (e) => {
            if (shield.classList.contains('hidden')) return;
            const touch = e.changedTouches && e.changedTouches[0];
            if (!touch) return;

            // If this touch itself drifted too far from where it started,
            // it was a drag/swipe, not a tap — ignore it entirely.
            const dragDx = touch.clientX - touchStartX;
            const dragDy = touch.clientY - touchStartY;
            if (Math.sqrt(dragDx * dragDx + dragDy * dragDy) > MOVE_TOLERANCE_PX) return;

            const now = Date.now();
            const dx = touch.clientX - lastTapX;
            const dy = touch.clientY - lastTapY;
            const withinTime = (now - lastTapTime) < DOUBLE_TAP_MS;
            const withinDistance = Math.sqrt(dx * dx + dy * dy) <= MOVE_TOLERANCE_PX;

            if (withinTime && withinDistance) {
                lastTapTime = 0;
                dispatch({type: 'PANIC_TAP', source: 'gesture'});
            } else {
                lastTapTime = now;
                lastTapX = touch.clientX;
                lastTapY = touch.clientY;
            }
        }, { passive: true });

        shield.addEventListener('dblclick', (e) => {
            e.preventDefault();
            dispatch({type: 'PANIC_TAP', source: 'gesture'});
        });
    })();

    document.getElementById('btn-restore-game').onclick = () => {
        document.getElementById('confirm-modal-title').textContent = 'ادامه مسابقه نیمه‌کاره';
        document.getElementById('confirm-modal-text').textContent = 'مسابقه‌ای که قبلاً شروع شده بود ادامه پیدا کند؟';
        session.pendingConfirmAction = () => dispatch({type: 'RESTORE_GAME'});
        dispatch({type: 'OPEN_MODAL', payload: 'confirm-modal'});
    };

    document.getElementById('btn-discard-game').onclick = () => {
        document.getElementById('confirm-modal-title').textContent = 'شروع مسابقه تازه';
        document.getElementById('confirm-modal-text').textContent = 'مسابقهٔ نیمه‌کارهٔ قبلی برای همیشه پاک شود و یک مسابقهٔ تازه شروع شود؟';
        session.pendingConfirmAction = () => dispatch({type: 'DISCARD_GAME'});
        dispatch({type: 'OPEN_MODAL', payload: 'confirm-modal'});
    };

    document.getElementById('btn-nav-setup').onclick = () => dispatch({type: 'NAVIGATE', payload: 'setup'});

    document.getElementById('btn-open-words').onclick = () => dispatch({type: 'OPEN_MODAL', payload: 'custom-words-modal'});

    document.getElementById('btn-back-welcome-2').onclick = () => dispatch({type: 'NAVIGATE', payload: 'welcome'});

    document.getElementById('toggle-limit').onchange = (e) => document.getElementById('vote-limit-box').classList.toggle('hidden', !e.target.checked);

    document.getElementById('btn-reset-names').onclick = () => dispatch({type: 'RESET_NAMES'});

    document.getElementById('btn-start-match').onclick = () => dispatch({type: 'START_MATCH'});

    document.getElementById('btn-start-discussion').onclick = () => dispatch({type: 'START_TIMER'});

    document.getElementById('btn-next-director').onclick = () => dispatch({type: 'NEXT_DIRECTOR'});

    document.getElementById('btn-emergency-vote').onclick = () => dispatch({type: 'REQUEST_VOTE'});

    document.getElementById('btn-confirm-end-1').onclick = () => dispatch({type: 'CONFIRM_END_MATCH'});

    document.getElementById('btn-confirm-end-2').onclick = () => dispatch({type: 'CONFIRM_END_MATCH'});

    document.getElementById('btn-cancel-vote').onclick = () => dispatch({type: 'CANCEL_VOTE'});

    document.getElementById('btn-submit-wagers').onclick = () => dispatch({type: 'SUBMIT_WAGERS'});

    document.getElementById('btn-guess-correct').onclick = () => dispatch({type: 'SPY_GUESS_VERDICT', verdict: 'correct'});

    document.getElementById('btn-guess-wrong').onclick = () => dispatch({type: 'SPY_GUESS_VERDICT', verdict: 'wrong'});

    document.getElementById('btn-guess-pass').onclick = () => dispatch({type: 'SPY_GUESS_VERDICT', verdict: 'pass'});

    document.getElementById('btn-next-round').onclick = () => dispatch({type: 'NEXT_ROUND'});

    document.getElementById('btn-export-image').onclick = () => dispatch({type: 'EXPORT_IMAGE'});

    document.getElementById('btn-reset-match').onclick = () => dispatch({type: 'RESET_MATCH'});

    document.getElementById('btn-player-details').onclick = () => {
        renderPlayerDetails();
        dispatch({type: 'OPEN_MODAL', payload: 'player-details-modal'});
    };

    document.getElementById('btn-close-player-details').onclick = () => dispatch({type: 'CLOSE_MODAL', payload: 'player-details-modal'});

    document.getElementById('btn-add-custom-word').onclick = () => dispatch({type: 'ADD_CUSTOM_WORD'});

    document.getElementById('btn-export-words').onclick = () => dispatch({type: 'EXPORT_WORDS_JSON'});

    document.getElementById('import-words-file').onchange = (e) => dispatch({type: 'IMPORT_WORDS_JSON', payload: e.target});

    document.getElementById('btn-close-words-modal').onclick = () => dispatch({type: 'CLOSE_MODAL', payload: 'custom-words-modal'});

    document.getElementById('btn-confirm-vote-yes').onclick = () => dispatch({type: 'CONFIRM_VOTE_POPUP'});

    document.getElementById('btn-confirm-vote-no').onclick = () => dispatch({type: 'CLOSE_MODAL', payload: 'vote-confirm-modal'});

    document.getElementById('btn-detective-inquiry').onclick = () => dispatch({type: 'DETECTIVE_INQUIRY'});

    document.getElementById('btn-role-close').onclick = () => dispatch({type: 'CLOSE_ROLE_CARD'});

    document.getElementById('btn-confirm-yes').onclick = () => {
        const cb = session.pendingConfirmAction;
        session.pendingConfirmAction = null;
        dispatch({type: 'CLOSE_MODAL', payload: 'confirm-modal'});
        if (cb) cb();
    };

    document.getElementById('btn-confirm-no').onclick = () => {
        session.pendingConfirmAction = null;
        dispatch({type: 'CLOSE_MODAL', payload: 'confirm-modal'});
    };

    window.addEventListener('pagehide', () => {
        persist();
    });
}
