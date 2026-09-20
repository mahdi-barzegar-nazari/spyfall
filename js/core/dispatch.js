/**
 * Central action dispatcher and phase transitions (the app's reducer-style control flow).
 */

import { VALID_PHASES } from './config.js';
import { SAVE_VERSION, gameState, hostSecretState, replaceGameState, replaceHostSecrets, restoreSecrets, session } from './state.js';
import { persist } from './storage.js';
import { INFO_TEXTS } from '../data/infoTexts.js';
import { handleDetectiveQueryInternal, handleSpyGuessVerdict, processElimination } from '../game/resolution.js';
import { calcDirectorTurn, initMatchPlayers, startNextRound } from '../game/rounds.js';
import { isTimerLoopActive, pauseTimer, resumeTimer, startTimer, stopTimerLoop } from '../game/timer.js';
import { getCurrentVoter, handleLocalVote } from '../game/voting.js';
import { stopAudioKeepAlive, toggleMute } from '../platform/audio.js';
import { requestWakeLock } from '../platform/wakeLock.js';
import { addCustomWordDOM, exportCustomWordsJSON, importCustomWordsJSON } from '../ui/customWords.js';
import { showToast } from '../ui/feedback.js';
import { trapFocus } from '../ui/focusTrap.js';
import { hideHandoffGate } from '../ui/handoff.js';
import { renderRoleModalContent, renderUI } from '../ui/render.js';
import { exportScorecardImage } from '../ui/scorecard.js';
import { renderNameInputs, validateAndSaveSettings } from '../ui/setup.js';
import { updateThemeMeta } from '../ui/theme.js';

let lastPanicTap = 0;
let lastFocusedElement = null;

export function commitState() {
    renderUI();
    persist();
}

export function showInfoModal(key) {
    const item = INFO_TEXTS[key];
    if (!item) return;
    document.getElementById('info-modal-title').textContent = item.title;
    document.getElementById('info-modal-desc').style.whiteSpace = 'pre-line';
    document.getElementById('info-modal-desc').textContent = item.text;
    dispatch({type: 'OPEN_MODAL', payload: 'info-modal'});
}

export function dispatch(action) {
    switch(action.type) {
        case 'TOGGLE_AUDIO':
            toggleMute();
            break;
        case 'CHANGE_THEME':
            document.body.setAttribute('data-theme', action.payload);
            updateThemeMeta(action.payload);
            try {
                localStorage.setItem('spy_selected_theme', action.payload);
            } catch(e){}
            break;
        case 'PANIC_OPEN': {
            if (gameState.phase === 'timer' && gameState.timer.running) {
                gameState.timer.wasRunningBeforePanic = true;
                pauseTimer(true);
            } else {
                gameState.timer.wasRunningBeforePanic = false;
            }
            const shield = document.getElementById('panic-shield');
            shield.classList.remove('hidden');
            document.getElementById('main-content-root').inert = true;
            shield.focus();
            break;
        }
        case 'PANIC_TAP': {
            const now = Date.now();
            // 'gesture' = a double-tap/dblclick already confirmed by the
            // dedicated shield listeners below (they do their own timing),
            // so it always closes immediately without re-checking lastPanicTap.
            if (now - lastPanicTap < 400 || action.source === 'keyboard' || action.source === 'gesture') {
                const shield = document.getElementById('panic-shield');
                shield.classList.add('hidden');
                document.getElementById('main-content-root').inert = false;
                document.getElementById('btn-panic-open').focus();
                if (gameState.timer.wasRunningBeforePanic) {
                    gameState.timer.wasRunningBeforePanic = false;
                    resumeTimer();
                }
                lastPanicTap = 0;
            } else {
                lastPanicTap = now;
            }
            break;
        }
        case 'NAVIGATE':
            if (VALID_PHASES.has(action.payload)) {
                setPhase(action.payload);
            }
            break;
        case 'OPEN_MODAL': {
            lastFocusedElement = document.activeElement;
            const modal = document.getElementById(action.payload);
            if (modal) {
                modal.classList.remove('hidden');
                document.getElementById('main-content-root').inert = true;
                document.body.style.overflow = 'hidden';
                trapFocus(modal);
            }
            break;
        }
        case 'CLOSE_MODAL': {
            const modal = document.getElementById(action.payload);
            if (modal) {
                modal.classList.add('hidden');
                modal.onkeydown = null;
            }
            if (!document.querySelector('.modal-overlay:not(.hidden)')) {
                document.getElementById('main-content-root').inert = false;
                document.body.style.overflow = '';
                if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
                    lastFocusedElement.focus();
                }
            }
            break;
        }

        case 'START_MATCH':
            if (gameState.phase !== 'setup') return;
            if (!validateAndSaveSettings()) return;
            hostSecretState.detectiveUsed = false;
            hostSecretState.detectiveInquiryResult = null;
            gameState.settings.detectiveUsed = false;
            gameState.match.usedWordKeys = [];
            gameState.round.num = 0;
            initMatchPlayers();
            if (!startNextRound()) return;
            break;
        case 'NEXT_ROUND':
            if (gameState.phase !== 'result') return;
            startNextRound();
            break;
        case 'START_TIMER':
            if (gameState.phase !== 'reveal' || gameState.timer.running) return;
            startTimer();
            break;
        case 'NEXT_DIRECTOR':
            if (gameState.phase !== 'timer' || !gameState.settings.director) return;
            calcDirectorTurn(); 
            commitState();
            break;

        case 'REQUEST_VOTE':
            if (gameState.phase !== 'timer') return;
            if (gameState.settings.voteLimitEnabled) {
                if (gameState.vote.limit <= 0) {
                    showToast("سهمیه زنگ اضطراری به پایان رسیده است!");
                    return;
                }
                gameState.vote.limit--;
            }
            pauseTimer();
            gameState.timer.reason = 'emergency';
            hostSecretState.votesCast = {};
            gameState.localVoteIndex = 0;
            session.voteHandoffDoneIndex = -1;
            setPhase('vote');
            break;
        case 'CANCEL_VOTE':
            if (gameState.timer.reason === 'timeout') return;
            resumeTimer();
            break;

        case 'SELECT_SUSPECT': {
            if (gameState.phase !== 'vote') return;
            let currentVoter = getCurrentVoter();
            if (currentVoter && action.payload === currentVoter.id) {
                showToast("شما نمی‌توانید به خودتان رای دهید!");
                return;
            }
            // "تأییدیه ثبت رأی" (Vote Confirmation) setting: off by default,
            // so a tap registers the vote immediately. When on, show the
            // confirmation popup before finalizing, as before.
            if (gameState.settings.voteConfirm) {
                gameState.vote.pendingId = action.payload;
                let targetP = gameState.players.find(p => p.id === action.payload);
                document.getElementById('vote-confirm-name').textContent = targetP ? targetP.name : '';
                dispatch({type: 'OPEN_MODAL', payload: 'vote-confirm-modal'});
            } else {
                handleLocalVote(action.payload);
            }
            break;
        }
        case 'CONFIRM_VOTE_POPUP': {
            dispatch({type: 'CLOSE_MODAL', payload: 'vote-confirm-modal'});
            const suspectId = gameState.vote.pendingId;
            if (!suspectId) return;
            handleLocalVote(suspectId);
            break;
        }
        case 'CONFIRM_VOTE': {
            if (gameState.phase !== 'vote') return;
            dispatch({type: 'CLOSE_MODAL', payload: 'vote-confirm-modal'});
            gameState.vote.targetId = gameState.vote.pendingId;

            if (gameState.settings.wager && gameState.players.some(p => p.isAlive && !p.isSpectator && p.id !== gameState.vote.targetId && p.score > 0)) {
                gameState.localWagerIndex = 0;
                session.wagerHandoffDoneIndex = -1;
                hostSecretState.wagersCast = {};
                setPhase('wager');
            } else {
                processElimination([]);
            }
            break;
        }
        case 'SUBMIT_WAGERS': {
            if (gameState.phase !== 'wager') return;
            let eligible = gameState.players.filter(p => p.isAlive && !p.isSpectator && p.id !== gameState.vote.targetId && p.score > 0);
            let cur = eligible[gameState.localWagerIndex];
            if (cur) {
                let sel = document.querySelector(`.wager-select[data-player-id="${cur.id}"]`);
                let amt = sel ? parseInt(sel.value, 10) : 0;
                hostSecretState.wagersCast[cur.id] = { submitted: true, amount: amt };
                gameState.localWagerIndex++;
                if (gameState.localWagerIndex < eligible.length) {
                    commitState();
                } else {
                    let allBets = Object.keys(hostSecretState.wagersCast).map(pid => ({
                        pid, amt: hostSecretState.wagersCast[pid].amount
                    })).filter(b => b.amt > 0);
                    processElimination(allBets);
                }
            }
            break;
        }
        case 'SPY_GUESS_VERDICT': {
            if (gameState.phase !== 'guess') return;
            handleSpyGuessVerdict(action.verdict);
            break;
        }

        case 'OPEN_ROLE_CARD':
            session.activeModalPlayerId = action.payload;
            renderRoleModalContent(session.activeModalPlayerId);
            dispatch({type: 'OPEN_MODAL', payload: 'role-modal'});
            break;
        case 'CLOSE_ROLE_CARD':
            if (session.activeModalPlayerId) {
                const p = gameState.players.find(x => x.id === session.activeModalPlayerId);
                if (p) p.hasSeen = true;
            }
            session.activeModalPlayerId = null;
            dispatch({ type: 'CLOSE_MODAL', payload: 'role-modal' });
            hideHandoffGate();
            commitState();
            break;
        case 'DETECTIVE_INQUIRY': {
            if (gameState.settings.detectiveUsed || hostSecretState.detectiveUsed) return;
            let tid = document.getElementById('detective-target-select').value;
            handleDetectiveQueryInternal(tid);
            break;
        }

        case 'RESTORE_GAME':
            try {
                const rawCombined = localStorage.getItem('spy_full_state_master');
                if (rawCombined) {
                    const parsed = JSON.parse(rawCombined);
                    if (parsed.state && parsed.state.version === SAVE_VERSION && Array.isArray(parsed.state.players)) {
                        replaceGameState(parsed.state);
                        replaceHostSecrets(restoreSecrets(parsed.secrets));
                    }
                }
            } catch(e){}
            document.getElementById('recovery-banner').classList.add('hidden');
            restorePhaseBindings();
            commitState();
            break;
        case 'DISCARD_GAME':
            try {
                localStorage.removeItem('spy_full_state_master');
            } catch(e){}
            document.getElementById('recovery-banner').classList.add('hidden');
            dispatch({type: 'NAVIGATE', payload: 'setup'});
            break;
        case 'CONFIRM_END_MATCH':
            document.getElementById('confirm-modal-title').textContent = "پایان مسابقه";
            document.getElementById('confirm-modal-text').textContent = "آیا مسابقه خاتمه یابد و کارنامه کلی نمایش داده شود؟";
            session.pendingConfirmAction = () => dispatch({type: 'END_MATCH'});
            dispatch({type: 'OPEN_MODAL', payload: 'confirm-modal'});
            break;
        case 'END_MATCH':
            dispatch({type: 'CLOSE_MODAL', payload: 'confirm-modal'});
            stopTimerLoop();
            stopAudioKeepAlive();
            try {
                localStorage.removeItem('spy_full_state_master');
            } catch(e){}
            setPhase('leaderboard');
            break;
        case 'RESET_MATCH':
            stopTimerLoop();
            stopAudioKeepAlive();
            try {
                localStorage.removeItem('spy_full_state_master');
            } catch(e){}
            gameState.players = [];
            renderNameInputs();
            setPhase('welcome');
            break;
        case 'RESET_NAMES':
            try {
                localStorage.removeItem('spy_saved_player_names');
            } catch(e){}
            renderNameInputs(true);
            break;
        case 'EXPORT_IMAGE':
            exportScorecardImage();
            break;
        case 'ADD_CUSTOM_WORD':
            addCustomWordDOM();
            break;
        case 'EXPORT_WORDS_JSON':
            exportCustomWordsJSON();
            break;
        case 'IMPORT_WORDS_JSON':
            importCustomWordsJSON(action.payload);
            break;
    }
}

export function setPhase(p) {
    if (!VALID_PHASES.has(p)) return;
    // Defense-in-depth for the "zero background timer loops" guarantee:
    // any transition away from the live discussion screen immediately
    // kills the interval, so it can never keep ticking underneath the
    // home/lobby (or any other) view. This is a no-op whenever the
    // caller already paused the timer explicitly (pauseTimer() clears
    // timerInt itself), and only matters as a safety net otherwise.
    if (gameState.phase === 'timer' && p !== 'timer' && isTimerLoopActive()) {
        stopTimerLoop();
        stopAudioKeepAlive();
    }
    gameState.phase = p;
    requestWakeLock();
    commitState();
}

function restorePhaseBindings() {
    if (gameState.phase === 'timer' && gameState.timer.running) {
        if ((gameState.timer.pausedSec || 0) <= 0) {
            gameState.timer.pausedSec = 0;
            gameState.timer.running = false;
            gameState.timer.reason = 'timeout';
            setPhase('vote');
        } else {
            // Resume strictly from the discrete remaining-seconds value
            // that was persisted before the interruption (page reload,
            // or coming back from the home/lobby view). We deliberately
            // do NOT recompute anything from wall-clock time — time
            // spent away from the active timer screen never drains the
            // countdown; the match resumes exactly where it was frozen.
            resumeTimer();
        }
    }
}
