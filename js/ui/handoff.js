/**
 * Pass-and-play hand-off gate: 'this is my turn' confirmation before private info is shown.
 */

import { dispatch } from '../core/dispatch.js';
import { gameState, hostSecretState, session } from '../core/state.js';
import { trapFocus } from './focusTrap.js';

// --- Pass-and-play hand-off gate -----------------------------------
// Every turn that exposes something player-specific (a role card, a
// vote choice, a wager) is gated behind an explicit "this is my turn"
// confirmation, so a single stray tap while the phone is being passed
// around can never reveal the wrong person's information.
let handoffTargetPlayerId = null;

let handoffOnConfirm = null;

export function openHandoffGate({ player, subtitle, actionLabel, holdMode = false, onConfirm = null }) {
    handoffTargetPlayerId = player.id;
    handoffOnConfirm = onConfirm;
    const gate = document.getElementById('handoff-gate');
    gate.dataset.holdMode = holdMode ? '1' : '0';
    document.getElementById('handoff-name').textContent = player.name;
    document.getElementById('handoff-subtitle').textContent = subtitle;
    document.getElementById('handoff-action').textContent = actionLabel;
    document.getElementById('main-content-root').inert = true;
    gate.classList.remove('hidden');
    trapFocus(gate);
}

export function hideHandoffGate() {
    handoffTargetPlayerId = null;
    handoffOnConfirm = null;
    const gate = document.getElementById('handoff-gate');
    if (gate.contains(document.activeElement)) {
        document.activeElement.blur();
    }
    gate.classList.add('hidden');
    document.getElementById('handoff-action').classList.remove('holding');
    if (!document.querySelector('.modal-overlay:not(.hidden)')) {
        document.getElementById('main-content-root').inert = false;
    }
}

export function initHandoffGate() {
    const gate = document.getElementById('handoff-gate');
    const actionBtn = document.getElementById('handoff-action');

    const isDetectivePending = () => {
        const p = gameState.players.find(x => x.id === session.activeModalPlayerId);
        return p && p.role === 'detective' && !(gameState.settings.detectiveUsed || hostSecretState.detectiveUsed);
    };

    const startHold = (e) => {
        if (gate.dataset.holdMode !== '1' || !handoffTargetPlayerId) return;
        try { actionBtn.setPointerCapture(e.pointerId); } catch (err) {}
        actionBtn.classList.add('holding');
        dispatch({type: 'OPEN_ROLE_CARD', payload: handoffTargetPlayerId});
    };
    const endHold = (e) => {
        if (gate.dataset.holdMode !== '1') return;
        try { actionBtn.releasePointerCapture(e.pointerId); } catch (err) {}
        actionBtn.classList.remove('holding');
        if (!isDetectivePending()) dispatch({type: 'CLOSE_ROLE_CARD'});
    };

    actionBtn.addEventListener('pointerdown', startHold);
    actionBtn.addEventListener('pointerup', endHold);
    actionBtn.addEventListener('pointercancel', endHold);
    actionBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    actionBtn.addEventListener('click', () => {
        if (gate.dataset.holdMode === '1') return;
        const cb = handoffOnConfirm;
        if (cb) { handoffOnConfirm = null; cb(); }
    });
    actionBtn.addEventListener('keydown', (e) => {
        if (gate.dataset.holdMode === '1' && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            if (document.getElementById('role-modal').classList.contains('hidden') && handoffTargetPlayerId) {
                actionBtn.classList.add('holding');
                dispatch({type: 'OPEN_ROLE_CARD', payload: handoffTargetPlayerId});
            }
        }
    });
    actionBtn.addEventListener('keyup', (e) => {
        if (gate.dataset.holdMode === '1' && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            actionBtn.classList.remove('holding');
            if (!isDetectivePending()) dispatch({type: 'CLOSE_ROLE_CARD'});
        }
    });
    document.getElementById('handoff-cancel').addEventListener('click', hideHandoffGate);
}
