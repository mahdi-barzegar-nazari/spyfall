/**
 * Resolving a vote: elimination, scoring, spy guess, round result, detective inquiry.
 */

import { HIDDEN_TIEBREAK, SCORING, getDifficultyMultiplier, getSpyGuessPoints } from '../core/config.js';
import { commitState, setPhase } from '../core/phase.js';
import { gameState, hostSecretState } from '../core/state.js';
import { resumeTimer, stopTimerLoop } from './timer.js';
import { playVictoryFanfare, stopAudioKeepAlive } from '../platform/audio.js';
import { rawHtml, t, tHtml, tn } from '../i18n/index.js';
import { showEliminationReveal } from '../ui/wheel.js';
import { escapeHtml } from '../utils/text.js';

export function processElimination(wagers) {
    let sus = gameState.players.find(p => p.id === gameState.vote.targetId);
    if (!sus) return;
    sus.isAlive = false;
    const wasSpy = sus.role === 'spy';
    const diffMultiplier = getDifficultyMultiplier(gameState.round.wordDifficulty);
    const priorEliminations = gameState.round.eliminationsSoFar || 0;
    gameState.round.eliminationsSoFar = priorEliminations + 1;

    if (wasSpy) {
        sus.stats.vs++;
        // How much of the discussion time was used up before this spy
        // was caught. Derived from the timer's own remaining-seconds
        // value (not wall-clock time) so it's immune to panic-button
        // pauses or the app being backgrounded mid-round.
        const elapsedSec = Math.max(0, (gameState.settings.timerMin * 60) - (gameState.timer.pausedSec || 0));
        sus.stats.totalCatchTimeSec = (sus.stats.totalCatchTimeSec || 0) + elapsedSec;
        // Spy evasion & survival: the more wrong eliminations that happened
        // before this spy was finally caught, the longer they evaded
        // detection — weighted up for harder rounds.
        sus.stats.hiddenTieBreakerScore = (sus.stats.hiddenTieBreakerScore || 0) +
            (HIDDEN_TIEBREAK.SPY_SURVIVAL_PER_ATTEMPT * priorEliminations * diffMultiplier);
        Object.entries(hostSecretState.votesCast).forEach(([voterId, votedTargetId]) => {
            if (votedTargetId === sus.id) {
                const voter = gameState.players.find(p => p.id === voterId);
                if (voter && voter.team === 'citizen') {
                    voter.stats.spiesCaught = (voter.stats.spiesCaught || 0) + 1;
                    // Citizen accuracy: reward the correct identification,
                    // weighted by how hard the round's word was.
                    voter.stats.hiddenTieBreakerScore = (voter.stats.hiddenTieBreakerScore || 0) +
                        (HIDDEN_TIEBREAK.CITIZEN_CORRECT_VOTE * diffMultiplier);
                }
            }
        });
    }

    wagers.forEach(b => {
        let v = gameState.players.find(p => p.id === b.pid);
        if (v && b.amt > 0) {
            v.score -= b.amt;
            gameState.round.pointsMap[v.id] -= b.amt;
            if (wasSpy) {
                let g = b.amt + (b.amt * SCORING.WAGER_PROFIT_MULTIPLIER);
                v.score += g; gameState.round.pointsMap[v.id] += g; v.stats.bw++;
                v.stats.wagerProfit = (v.stats.wagerProfit || 0) + (b.amt * SCORING.WAGER_PROFIT_MULTIPLIER);
            } else {
                v.stats.bl++;
                v.stats.wagerProfit = (v.stats.wagerProfit || 0) - b.amt;
            }
        }
    });

    let survivorNote = '';
    if (!wasSpy) {
        sus.stats.innocentVotesReceived = (sus.stats.innocentVotesReceived || 0) + 1;
        // Citizens who voted for this (innocent) player were wrong —
        // the natural complement of spiesCaught above.
        Object.entries(hostSecretState.votesCast).forEach(([voterId, votedTargetId]) => {
            if (votedTargetId === sus.id) {
                const voter = gameState.players.find(p => p.id === voterId);
                if (voter && voter.team === 'citizen') {
                    voter.stats.wrongVotes = (voter.stats.wrongVotes || 0) + 1;
                }
            }
        });
        let survivingSpies = gameState.players.filter(p => p.role === 'spy' && p.isAlive && !p.isSpectator);
        survivingSpies.forEach(s => {
            s.score += SCORING.SPY_SURVIVE_WRONG_VOTE;
            gameState.round.pointsMap[s.id] += SCORING.SPY_SURVIVE_WRONG_VOTE;
            s.stats.citizensEliminatedBeforeCaught = (s.stats.citizensEliminatedBeforeCaught || 0) + 1;
        });
        survivorNote = survivingSpies.length > 0
            ? tn('elim.note.wrongSurvive', SCORING.SPY_SURVIVE_WRONG_VOTE, { count: SCORING.SPY_SURVIVE_WRONG_VOTE })
            : t('elim.note.wrong');
    }

    commitState();

    // Saves from before this option existed have no `spyLastChance`: undefined counts as on.
    const lastChanceOn = gameState.settings.spyLastChance !== false;
    // The reveal says "now the spy guesses the word" by default; that is false when there is no guess.
    const revealNote = (wasSpy && !lastChanceOn) ? t('elim.note.noLastChance') : survivorNote;

    showEliminationReveal(sus, wasSpy, revealNote, () => {
        if (wasSpy) {
            if (lastChanceOn) {
                setPhase('guess');
            } else {
                finalizeRound(false);
            }
        } else if (gameState.settings.sudden) {
            finalizeRound(true, false, true);
        } else {
            finalizeRound(false);
        }
    });
}

export function handleSpyGuessVerdict(verdict) {
    let sus = gameState.players.find(p => p.id === gameState.vote.targetId);
    hostSecretState.guessVerdict = verdict;

    if (verdict === 'correct') {
        if (sus) {
            const guessPoints = getSpyGuessPoints(gameState.round.wordDifficulty);
            sus.score += guessPoints;
            sus.stats.spyGuesses = (sus.stats.spyGuesses || 0) + 1;
            gameState.round.pointsMap[sus.id] = (gameState.round.pointsMap[sus.id] || 0) + guessPoints;
        }
        finalizeRound(true, true, false);
    } else {
        finalizeRound(false, false, false);
    }
}

function finalizeRound(forceSpyWin=false, spyGuessed=false, sudden=false) {
    let aS = gameState.players.filter(p => p.isAlive && !p.isSpectator && p.team === 'spy').length;
    let aC = gameState.players.filter(p => p.isAlive && !p.isSpectator && p.team === 'citizen').length;

    // A forced spy win (correct last-chance guess, sudden death) is decided before "no spy left"
    // is checked: the guessing spy has just been voted out, so in a one-spy game aS is already 0.
    if (forceSpyWin || (aS > 0 && aS >= aC)) {
        const diffMultiplier = getDifficultyMultiplier(gameState.round.wordDifficulty);
        // The spy who guessed the word was already paid the guess points; they don't get the
        // round-win points on top. They still count as a winner (stats.sw).
        const guesser = spyGuessed ? gameState.players.find(p => p.id === gameState.vote.targetId) : null;
        gameState.players.filter(p => p.team === 'spy' && !p.isSpectator).forEach(s => {
            if (!(guesser && s.id === guesser.id)) {
                s.score += SCORING.SPY_WIN_ROUND;
                gameState.round.pointsMap[s.id] += SCORING.SPY_WIN_ROUND;
            }
            s.stats.sw++;
            if (s.isAlive) {
                // Never caught for the entire round — maximum evasion bonus.
                s.stats.hiddenTieBreakerScore = (s.stats.hiddenTieBreakerScore || 0) +
                    (HIDDEN_TIEBREAK.SPY_FULL_ROUND_SURVIVAL * diffMultiplier);
            }
        });
        buildHostRoundResult('spy', spyGuessed, sudden);
    } else if (aS === 0) {
        gameState.players.filter(p => p.team === 'citizen' && !p.isSpectator).forEach(c => {
            c.score += SCORING.CITIZEN_WIN_ROUND;
            gameState.round.pointsMap[c.id] += SCORING.CITIZEN_WIN_ROUND;
            c.stats.cw++;
            if (c.role === 'fool' && c.isAlive) {
                c.stats.foolEscaped = (c.stats.foolEscaped || 0) + 1;
            }
        });
        buildHostRoundResult('citizen', false, false);
    } else {
        resumeTimer();
    }
}

function formatRoundResultHtml(data) {
    let htm = "";
    const secretWord = data.secretWord || t('result.defaultWord');
    const suspectName = data.suspectName || t('common.spy');
    const wordHtml = rawHtml(`<span class="color-amber">${escapeHtml(secretWord)}</span>`);

    if (data.winner === 'spy') {
        if (data.reason === 'spy_guess') {
            htm = tHtml('result.spyGuessed', { suspect: rawHtml(`<strong>${escapeHtml(suspectName)}</strong>`), word: wordHtml });
        } else if (data.reason === 'sudden_death') {
            htm = tHtml('result.suddenDeath', { word: wordHtml });
        } else {
            htm = tHtml('result.citizensExhausted', { word: wordHtml });
        }
    } else {
        htm = tHtml('result.spiesEliminated', { word: wordHtml });
    }

    if (data.tieNote) {
        htm += `<br><span class="color-secondary u-fs-080">${escapeHtml(data.tieNote)}</span>`;
    }
    return htm;
}

function buildHostRoundResult(winner, g, s) {
    stopTimerLoop();
    stopAudioKeepAlive();
    let tit = winner === 'spy' ? t('result.title.spy') : t('result.title.citizen');
    document.getElementById('result-title').textContent = tit;
    document.getElementById('result-title').style.color = winner === 'spy' ? 'var(--brand-rose)' : 'var(--brand-emerald)';

    let sus = gameState.players.find(p => p.id === gameState.vote.targetId);
    let secretWord = hostSecretState.secretWord || t('result.defaultWord');
    let reason = g ? 'spy_guess' : (s ? 'sudden_death' : (winner === 'spy' ? 'citizens_exhausted' : 'spies_eliminated'));

    const resultPayload = {
        winner,
        reason,
        suspectName: sus ? sus.name : t('common.spy'),
        secretWord,
        tieNote: gameState.vote.tieNote
    };

    document.getElementById('result-desc').innerHTML = formatRoundResultHtml(resultPayload);
    setPhase('result');
    playVictoryFanfare();
}

export function handleDetectiveQueryInternal(targetId) {
    let tar = gameState.players.find(p => p.id === targetId);
    if (!tar || !tar.isAlive) return;
    hostSecretState.detectiveUsed = true;
    gameState.settings.detectiveUsed = true;
    // Both answers must look the same to anyone glancing at the screen: one short sentence, no emoji and no
    // colour, differing only in the role word. The stored string is what the role card shows again later.
    const resText = t(tar.role === 'spy' ? 'role.detective.result.spy' : 'role.detective.result.citizen', { name: tar.name });
    hostSecretState.detectiveInquiryResult = resText;

    // textContent, so a name containing HTML is shown as plain text.
    document.getElementById('detective-result-box').textContent = resText;
    const btnDet = document.getElementById('btn-detective-inquiry');
    if (btnDet) btnDet.disabled = true;
    const selDet = document.getElementById('detective-target-select');
    if (selDet) selDet.disabled = true;

    commitState();
}
