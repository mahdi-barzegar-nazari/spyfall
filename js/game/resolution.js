/**
 * Resolving a vote: elimination, scoring, spy guess, round result, detective inquiry.
 */

import { HIDDEN_TIEBREAK, SCORING, getDifficultyMultiplier } from '../core/config.js';
import { commitState, setPhase } from '../core/dispatch.js';
import { gameState, hostSecretState } from '../core/state.js';
import { resumeTimer, stopTimerLoop } from './timer.js';
import { playVictoryFanfare, stopAudioKeepAlive } from '../platform/audio.js';
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
            ? `اخراج اشتباه بود؛ همهٔ جاسوس‌های زنده ${SCORING.SPY_SURVIVE_WRONG_VOTE}+ امتیاز بقا گرفتند.`
            : 'اخراج اشتباه بود!';
    }

    commitState();

    showEliminationReveal(sus, wasSpy, survivorNote, () => {
        if (wasSpy) {
            setPhase('guess');
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
            sus.score += SCORING.SPY_CORRECT_GUESS;
            sus.stats.spyGuesses = (sus.stats.spyGuesses || 0) + 1;
            gameState.round.pointsMap[sus.id] = (gameState.round.pointsMap[sus.id] || 0) + SCORING.SPY_CORRECT_GUESS;
        }
        finalizeRound(true, true, false);
    } else {
        finalizeRound(false, false, false);
    }
}

function finalizeRound(forceSpyWin=false, spyGuessed=false, sudden=false) {
    let aS = gameState.players.filter(p => p.isAlive && !p.isSpectator && p.team === 'spy').length;
    let aC = gameState.players.filter(p => p.isAlive && !p.isSpectator && p.team === 'citizen').length;

    if (aS === 0) {
        gameState.players.filter(p => p.team === 'citizen' && !p.isSpectator).forEach(c => {
            c.score += SCORING.CITIZEN_WIN_ROUND;
            gameState.round.pointsMap[c.id] += SCORING.CITIZEN_WIN_ROUND;
            c.stats.cw++;
            if (c.role === 'fool' && c.isAlive) {
                c.stats.foolEscaped = (c.stats.foolEscaped || 0) + 1;
            }
        });
        buildHostRoundResult('citizen', false, false);
    } else if (forceSpyWin || aS >= aC) {
        const diffMultiplier = getDifficultyMultiplier(gameState.round.wordDifficulty);
        gameState.players.filter(p => p.team === 'spy' && !p.isSpectator).forEach(s => {
            s.score += SCORING.SPY_WIN_ROUND;
            gameState.round.pointsMap[s.id] += SCORING.SPY_WIN_ROUND;
            s.stats.sw++;
            if (s.isAlive) {
                // Never caught for the entire round — maximum evasion bonus.
                s.stats.hiddenTieBreakerScore = (s.stats.hiddenTieBreakerScore || 0) +
                    (HIDDEN_TIEBREAK.SPY_FULL_ROUND_SURVIVAL * diffMultiplier);
            }
        });
        buildHostRoundResult('spy', spyGuessed, sudden);
    } else {
        resumeTimer();
    }
}

function formatRoundResultHtml(data) {
    let htm = "";
    const secretWord = data.secretWord || "کلمه اصلی";
    const suspectName = data.suspectName || "جاسوس";

    if (data.winner === 'spy') {
        if (data.reason === 'spy_guess') {
            htm = `🎯 <strong>${escapeHtml(suspectName)}</strong> کلمه رمز اصلی (<span class="color-amber">${escapeHtml(secretWord)}</span>) را درست حدس زد!`;
        } else if (data.reason === 'sudden_death') {
            htm = `شهروند بی‌گناه اخراج شد!<br>به دلیل قانون حذف درجا، جاسوس‌ها برنده شدند.<br>کلمه اصلی: <span class="color-amber">${escapeHtml(secretWord)}</span>`;
        } else {
            htm = `تعداد شهروندان ناکافی شد و جاسوس‌ها پیروز شدند!<br>کلمه اصلی: <span class="color-amber">${escapeHtml(secretWord)}</span>`;
        }
    } else {
        htm = `🎉 تمام جاسوس‌ها شناسایی شدند و پیروز شدید!<br>کلمه اصلی: <span class="color-amber">${escapeHtml(secretWord)}</span>`;
    }

    if (data.tieNote) {
        htm += `<br><span class="color-secondary" style="font-size:0.8rem;">${escapeHtml(data.tieNote)}</span>`;
    }
    return htm;
}

function buildHostRoundResult(winner, g, s) {
    stopTimerLoop();
    stopAudioKeepAlive();
    let tit = winner === 'spy' ? '😈 پیروزی جاسوس‌ها!' : '🎉 پیروزی شهروندان!';
    document.getElementById('result-title').textContent = tit;
    document.getElementById('result-title').style.color = winner === 'spy' ? 'var(--brand-rose)' : 'var(--brand-emerald)';

    let sus = gameState.players.find(p => p.id === gameState.vote.targetId);
    let secretWord = hostSecretState.secretWord || "کلمه اصلی";
    let reason = g ? 'spy_guess' : (s ? 'sudden_death' : (winner === 'spy' ? 'citizens_exhausted' : 'spies_eliminated'));

    const resultPayload = {
        winner,
        reason,
        suspectName: sus ? sus.name : 'جاسوس',
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
    let resText = tar.role === 'spy'
        ? `⚠️ «${tar.name}» قطعاً جاسوس است!`
        : `✅ «${tar.name}» شهروند بی‌گناه است.`;
    hostSecretState.detectiveInquiryResult = resText;
    
    let res = document.getElementById('detective-result-box');
    if (tar.role === 'spy') {
        res.innerHTML = `⚠️ <span class="color-rose">«${escapeHtml(tar.name)}» قطعاً جاسوس است!</span>`;
    } else {
        res.innerHTML = `✅ <span class="color-emerald">«${escapeHtml(tar.name)}» شهروند بی‌گناه است.</span>`;
    }
    const btnDet = document.getElementById('btn-detective-inquiry');
    if (btnDet) btnDet.disabled = true;
    const selDet = document.getElementById('detective-target-select');
    if (selDet) selDet.disabled = true;

    commitState();
}
