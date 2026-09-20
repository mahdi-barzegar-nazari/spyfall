/**
 * Pass-and-play voting and wager collection.
 */

import { commitState, dispatch } from '../core/dispatch.js';
import { gameState, hostSecretState } from '../core/state.js';
import { showToast } from '../ui/feedback.js';
import { runTieBreakerWheel } from '../ui/wheel.js';

export function getCurrentVoter() {
    let alive = gameState.players.filter(p => p.isAlive && !p.isSpectator);
    // No fallback to alive[0]: once localVoteIndex reaches alive.length,
    // every eligible voter has already voted and there is no "current"
    // voter left. Falling back to the first player here was the root
    // cause of a phantom extra vote prompt reappearing after the final
    // vote was cast.
    return alive[gameState.localVoteIndex];
}

export function handleLocalVote(suspectId) {
    let alive = gameState.players.filter(p => p.isAlive && !p.isSpectator);
    let currentVoter = alive[gameState.localVoteIndex];
    if (!currentVoter) return;

    if (suspectId === currentVoter.id) {
        showToast("شما نمی‌توانید به خودتان رای دهید!");
        return;
    }

    hostSecretState.votesCast[currentVoter.id] = suspectId;
    gameState.localVoteIndex++;

    if (gameState.localVoteIndex < alive.length) {
        commitState();
    } else {
        checkVoteCompletion();
    }
}

function checkVoteCompletion() {
    let eligibleVoters = gameState.players.filter(p => p.isAlive && !p.isSpectator);
    let votesReceived = Object.keys(hostSecretState.votesCast).length;

    if (votesReceived >= eligibleVoters.length && eligibleVoters.length > 0) {
        let tally = {};
        Object.values(hostSecretState.votesCast).forEach(sId => { tally[sId] = (tally[sId] || 0) + 1; });
        
        const voteCounts = Object.values(tally);
        if (voteCounts.length === 0) {
            showToast("خطا در تجمیع آرا؛ رای‌گیری لغو شد.");
            dispatch({ type: 'CANCEL_VOTE' });
            return;
        }

        let maxVotes = Math.max(...voteCounts);
        let topCandidates = Object.keys(tally).filter(sId => tally[sId] === maxVotes);

        if (topCandidates.length > 1) {
            // Tied votes get resolved with the visual wheel instead of an
            // invisible instant pick — the wheel's own result line covers
            // what the old text-based tieNote used to say.
            runTieBreakerWheel(topCandidates, (winnerId) => {
                gameState.vote.pendingId = winnerId;
                gameState.vote.tieNote = '';
                dispatch({type: 'CONFIRM_VOTE'});
            });
            return;
        }

        gameState.vote.pendingId = topCandidates[0];
        gameState.vote.tieNote = '';
        dispatch({type: 'CONFIRM_VOTE'});
    }
}

export function generateWagerOptionsHtml(score) {
    let html = '<option value="0">بدون شرط (۰)</option>';
    const safeMax = Math.min(Math.max(0, parseInt(score, 10) || 0), 100);
    const step = safeMax > 20 ? Math.ceil(safeMax / 10) : 1;
    for (let i = 1; i <= safeMax; i += step) {
        html += `<option value="${i}">${i} امتیاز</option>`;
    }
    if (safeMax > 0 && !html.includes(`value="${safeMax}"`)) {
        html += `<option value="${safeMax}">حداکثر (${safeMax} امتیاز)</option>`;
    }
    return html;
}
