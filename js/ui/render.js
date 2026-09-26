/**
 * Screen rendering driven by gameState.phase, plus the role card content.
 */

import { dispatch } from '../core/dispatch.js';
import { gameState, hostSecretState, session } from '../core/state.js';
import { comparePlayersForRank, getRankedStandings } from '../game/ranking.js';
import { generateWagerOptionsHtml, getCurrentVoter } from '../game/voting.js';
import { hideHandoffGate, openHandoffGate } from './handoff.js';
import { PODIUM_RANK_META, renderAccolades, renderPodium } from './results.js';
import { escapeHtml } from '../utils/text.js';

export function renderTimer(sec) {
    const t = document.getElementById('timer-text');
    if (!t) return;
    const validSec = Math.max(0, parseInt(sec, 10) || 0);
    const m = Math.floor(validSec / 60);
    const s = validSec % 60;
    t.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    t.className = 'timer-display';
    if (validSec <= 10 && validSec > 0) {
        t.classList.add('timer-danger');
    } else if (validSec <= 30 && validSec > 0) {
        t.classList.add('timer-warning');
    }
}

let previousPhase = null;

export function renderUI() {
    document.querySelectorAll('.screen-view').forEach(e => e.classList.add('hidden'));
    const screenEl = document.getElementById(`screen-${gameState.phase}`);
    if (screenEl) {
        screenEl.classList.remove('hidden');
        if (previousPhase !== gameState.phase) {
            screenEl.classList.remove('screen-anim');
            void screenEl.offsetWidth;
            screenEl.classList.add('screen-anim');
            const targetHeading = screenEl.querySelector('h1, h2, h3');
            if (targetHeading) {
                targetHeading.setAttribute('tabindex', '-1');
                targetHeading.focus({ preventScroll: true });
            }
        }
    }
    previousPhase = gameState.phase;

    if (gameState.phase === 'reveal') {
        // "تأییدیه دیدن نقش" (Role Reveal Confirmation) — default ON.
        // Missing on an old restored save is treated as ON (its prior
        // default/only behavior), for backward compatibility.
        const revealConfirmOn = gameState.settings.roleRevealConfirm !== false;
        document.getElementById('reveal-instruction-text').textContent = !revealConfirmOn
            ? "نام خودت را انتخاب کن تا کارتت بلافاصله نمایش داده شود."
            : gameState.settings.revealHold
                ? "نام خودت را انتخاب کن، سپس انگشتت را روی دکمهٔ نمایش نگه دار."
                : "نام خودت را انتخاب کن، سپس کارتت را نمایش بده.";
        let g = document.getElementById('reveal-grid'); g.innerHTML = ''; let seenCount = 0;
        const revealRoster = gameState.players.filter(p => !p.isSpectator);
        revealRoster.forEach(p => {
            if (p.hasSeen) seenCount++;
            let d = document.createElement('button');
            d.type = 'button';
            d.className = `player-card ${p.hasSeen ? 'disabled' : ''}`;
            d.textContent = p.name + (p.hasSeen ? ' ✓' : '');

            if (p.hasSeen) {
                d.disabled = true;
            } else if (!revealConfirmOn) {
                // Confirmation off: reveal the role directly, no handoff gate.
                d.onclick = () => dispatch({type: 'OPEN_ROLE_CARD', payload: p.id});
            } else {
                d.onclick = () => openHandoffGate({
                    player: p,
                    subtitle: gameState.settings.revealHold
                        ? 'روی دکمهٔ پایین انگشتت را نگه‌دار تا کارت باز شود؛ با برداشتن انگشت دوباره مخفی می‌شود.'
                        : 'وقتی گوشی دست توئه، روی دکمهٔ پایین بزن تا کارتت را ببینی.',
                    actionLabel: gameState.settings.revealHold ? '🔒 نگه‌دار تا باز شود' : '👁 نمایش کارت من',
                    holdMode: !!gameState.settings.revealHold,
                    onConfirm: () => dispatch({type: 'OPEN_ROLE_CARD', payload: p.id})
                });
            }
            g.appendChild(d);
        });
        document.getElementById('btn-start-discussion').classList.toggle('hidden', seenCount !== revealRoster.length);
    }

    if (gameState.phase === 'timer') {
        document.getElementById('oneword-banner').classList.toggle('hidden', !gameState.settings.oneword);
        document.getElementById('director-box').classList.toggle('hidden', !gameState.settings.director);

        const btnEmergency = document.getElementById('btn-emergency-vote');
        btnEmergency.disabled = gameState.settings.voteLimitEnabled && gameState.vote.limit <= 0;

        if (gameState.settings.director && gameState.round.history.length > 0) {
            let last = gameState.round.history[gameState.round.history.length - 1];
            let aP = gameState.players.find(x => x.id === last.a), tP = gameState.players.find(x => x.id === last.t);
            if (aP && tP) {
                document.getElementById('director-text').textContent = `«${aP.name}» سوال بپرسد از «${tP.name}»`;
            }
        }
        renderTimer(gameState.timer.pausedSec);
        let v = document.getElementById('votes-remaining-badge');
        v.textContent = !gameState.settings.voteLimitEnabled ? "زنگ: نامحدود" : `سهمیه زنگ باقی‌مانده: ${gameState.vote.limit}`;
    }

    if (gameState.phase === 'vote') {
        document.getElementById('btn-cancel-vote').classList.toggle('hidden', gameState.timer.reason === 'timeout');
        let g = document.getElementById('vote-grid'); g.innerHTML = '';
        let currentVoter = getCurrentVoter();

        // If every eligible voter has already voted, there's nothing left
        // to render here — the elimination reveal (or wager phase) is
        // about to take over. Rendering the grid/handoff gate in this
        // window is exactly what produced the old "phantom vote" bug.
        if (currentVoter) {
            gameState.players.filter(p => p.isAlive && !p.isSpectator).forEach(p => {
                let d = document.createElement('button');
                d.type = 'button';
                let isSelf = p.id === currentVoter.id;
                d.className = `player-card ${isSelf ? 'disabled' : ''}`;
                d.textContent = p.name + (isSelf ? ' (شما)' : '');
                if (isSelf) {
                    d.disabled = true;
                } else {
                    d.onclick = () => dispatch({type: 'SELECT_SUSPECT', payload: p.id});
                }
                g.appendChild(d);
            });

            document.getElementById('vote-instruction-text').innerHTML = `📱 گوشی دست <strong>«${escapeHtml(currentVoter.name)}»</strong> باشد:<br>متهم مورد نظرت را انتخاب کن:`;

            // "رای‌گیری سریع" (Quick Voting) — when on, skip the
            // pass-and-play handoff gate entirely; the vote grid above
            // is already interactive as soon as it's someone's turn.
            if (!gameState.settings.quickVoting && session.voteHandoffDoneIndex !== gameState.localVoteIndex) {
                openHandoffGate({
                    player: currentVoter,
                    subtitle: 'وقتی گوشی دست توئه، برای دیدن گزینه‌های رای‌گیری روی دکمهٔ پایین بزن.',
                    actionLabel: '🗳 آماده‌ام، رای می‌دهم',
                    onConfirm: () => { session.voteHandoffDoneIndex = gameState.localVoteIndex; hideHandoffGate(); }
                });
            }
        }
    }

    if (gameState.phase === 'wager') {
        let t = gameState.players.find(p => p.id === gameState.vote.targetId);
        document.getElementById('wager-target-name').textContent = t ? t.name : 'متهم';
        let l = document.getElementById('wager-players-list'); l.innerHTML = '';
        let submitBtn = document.getElementById('btn-submit-wagers');

        let eligible = gameState.players.filter(p => p.isAlive && !p.isSpectator && p.id !== gameState.vote.targetId && p.score > 0);
        let currentWagerer = eligible[gameState.localWagerIndex];
        if (currentWagerer) {
            let d = document.createElement('div'); d.className = 'toggle-item';
            d.innerHTML = `<div>📱 نوبت <strong>${escapeHtml(currentWagerer.name)}</strong> (موجودی: ${currentWagerer.score})</div><select class="input-control wager-select w-auto u-p-6" data-player-id="${currentWagerer.id}" aria-label="میزان شرط ${escapeHtml(currentWagerer.name)}">${generateWagerOptionsHtml(currentWagerer.score)}</select>`;
            l.appendChild(d);
            submitBtn.textContent = (gameState.localWagerIndex === eligible.length - 1) ? "ثبت شرط نهایی و رونمایی ✅" : "ثبت و نفر بعدی ➡️";
            submitBtn.classList.remove('hidden');

            if (session.wagerHandoffDoneIndex !== gameState.localWagerIndex) {
                openHandoffGate({
                    player: currentWagerer,
                    subtitle: 'وقتی گوشی دست توئه، برای انتخاب میزان شرطت روی دکمهٔ پایین بزن.',
                    actionLabel: '💰 آماده‌ام، شرط می‌بندم',
                    onConfirm: () => { session.wagerHandoffDoneIndex = gameState.localWagerIndex; hideHandoffGate(); }
                });
            }
        }
    }

    if (gameState.phase === 'guess') {
        let spyP = gameState.players.find(p => p.id === gameState.vote.targetId);
        document.getElementById('guess-spy-name').textContent = spyP ? spyP.name : 'جاسوس';
    }

    if (gameState.phase === 'result') {
        let tb = document.getElementById('round-leaderboard-body'); tb.innerHTML = '';
        [...gameState.players].sort(comparePlayersForRank).forEach(p => {
            let c = gameState.round.pointsMap[p.id] || 0;
            let tr = document.createElement('tr');
            const signed = c > 0 ? `${c}+` : `${c}`;
            const pointsClass = c > 0 ? 'color-emerald' : (c < 0 ? 'color-rose' : 'color-secondary');
            tr.innerHTML = `<th scope="row">${escapeHtml(p.name)}</th><td class="${pointsClass}">${signed}</td><td class="color-amber">${Number(p.score) || 0}</td>`;
            tb.appendChild(tr);
        });
    }

    if (gameState.phase === 'leaderboard') {
        const groups = getRankedStandings(gameState.players);
        renderPodium(document.getElementById('podium-container'), groups);

        let tb = document.getElementById('final-leaderboard-body'); tb.innerHTML = '';
        groups.forEach(g => {
            const meta = PODIUM_RANK_META[g.rank];
            const rankLabel = meta ? meta.icon : `#${g.rank}`;
            g.players.forEach(p => {
                const wins = (Number(p.stats?.cw) || 0) + (Number(p.stats?.sw) || 0);
                const tieNote = g.players.length > 1 ? `<span class="tie-note">(هم‌رتبه)</span>` : '';
                let tr = document.createElement('tr');
                tr.innerHTML = `<td class="rank-cell">${rankLabel}</td><th scope="row"><bdi>${escapeHtml(p.name)}</bdi>${tieNote}</th><td>${wins}</td><td class="color-amber">${Number(p.score) || 0}</td>`;
                tb.appendChild(tr);
            });
        });
        renderAccolades();
    }
}

export function renderRoleModalContent(id) {
    let p = gameState.players.find(x => x.id === id);
    if (!p) return;

    let role = p.role;
    let hintTitle = "کلمه رمز شما:";
    let secretWord = hostSecretState.secretWord || "";
    let foolWord = hostSecretState.foolWord || "";
    let quest = p.quest;
    let fellowSpies = [];
    let storedDetectiveInquiry = null;

    if (p.isSpectator) {
        document.getElementById('modal-player-name').textContent = p.name;
        let b = document.getElementById('modal-role-badge');
        let t = document.getElementById('modal-secret-title');
        let c = document.getElementById('modal-secret-content');
        b.className = 'role-badge role-spectator';
        b.textContent = '👀 شما تماشاچی هستید';
        t.textContent = 'وضعیت شما در این دور:';
        c.textContent = 'در دست بعدی وارد مسابقه می‌شوید';
        document.getElementById('modal-fellow-spies').classList.add('hidden');
        document.getElementById('modal-detective-action').classList.add('hidden');
        document.getElementById('modal-quest-box').classList.add('hidden');
        document.getElementById('btn-role-close').classList.remove('hidden');
        return;
    }

    if (hostSecretState.roles[id]) {
        let sec = hostSecretState.roles[id];
        role = sec.role;
        hintTitle = sec.hintTitle || 'کلمه رمز شما:';
        secretWord = sec.role === 'spy'
            ? sec.hint
            : (sec.role === 'fool' ? hostSecretState.foolWord : hostSecretState.secretWord);
        quest = p.quest;
        storedDetectiveInquiry = hostSecretState.detectiveInquiryResult;
        if (gameState.settings.knownSpies && role === 'spy') {
            fellowSpies = gameState.players.filter(x => x.role === 'spy' && x.id !== id).map(x => x.name);
        }
    }

    let b = document.getElementById('modal-role-badge');
    let t = document.getElementById('modal-secret-title');
    let c = document.getElementById('modal-secret-content');
    let f = document.getElementById('modal-fellow-spies');
    let d = document.getElementById('modal-detective-action');
    let q = document.getElementById('modal-quest-box');

    document.getElementById('modal-player-name').textContent = p.name;
    f.classList.add('hidden');
    d.classList.add('hidden');
    q.classList.add('hidden');

    if (role === 'spy') {
        b.className = 'role-badge role-spy';
        b.textContent = '🕵️ شما جاسوس هستید!';
        t.textContent = hintTitle;
        c.textContent = secretWord;
        if (gameState.settings.knownSpies && fellowSpies.length > 0) {
            f.classList.remove('hidden');
            document.getElementById('modal-fellow-spies-text').textContent = fellowSpies.join(' ، ');
        }
    } else if (role === 'fool') {
        b.className = 'role-badge role-citizen';
        b.textContent = '👤 شما شهروند هستید';
        t.textContent = 'کلمه رمز شما:';
        c.textContent = foolWord;
    } else if (role === 'detective') {
        b.className = 'role-badge role-detective';
        b.textContent = '🔍 شما کارآگاه هستید';
        t.textContent = 'کلمه رمز شما:';
        c.textContent = secretWord;
        
        d.classList.remove('hidden');
        const isDetectiveAlreadyUsed = gameState.settings.detectiveUsed || hostSecretState.detectiveUsed;
        const btnDet = document.getElementById('btn-detective-inquiry');
        const selDet = document.getElementById('detective-target-select');
        const resBox = document.getElementById('detective-result-box');

        if (!isDetectiveAlreadyUsed) {
            selDet.disabled = false;
            btnDet.disabled = false;
            selDet.innerHTML = '';
            gameState.players.filter(x => x.id !== p.id && x.isAlive && !x.isSpectator).forEach(targetPlayer => {
                let o = document.createElement('option');
                o.value = targetPlayer.id;
                o.textContent = targetPlayer.name;
                selDet.appendChild(o);
            });
            resBox.textContent = '';
        } else {
            selDet.disabled = true;
            btnDet.disabled = true;
            if (storedDetectiveInquiry) {
                resBox.innerHTML = storedDetectiveInquiry.includes('جاسوس')
                    ? `⚠️ <span class="color-rose">${escapeHtml(storedDetectiveInquiry)}</span>`
                    : `✅ <span class="color-emerald">${escapeHtml(storedDetectiveInquiry)}</span>`;
            }
        }
    } else {
        b.className = 'role-badge role-citizen';
        b.textContent = '👤 شما شهروند هستید';
        t.textContent = 'کلمه رمز شما:';
        c.textContent = secretWord;
    }

    if (quest) {
        q.classList.remove('hidden');
        document.getElementById('modal-quest-text').textContent = quest;
    }

    const isDetectivePending = role === 'detective' && !(gameState.settings.detectiveUsed || hostSecretState.detectiveUsed);
    // The close button is only redundant (hidden) when the card was opened
    // via the handoff-gate's hold-to-reveal gesture — releasing the hold
    // closes it instead. That gesture only exists when Role Reveal
    // Confirmation is on; with it off, the card is opened by a direct tap
    // and MUST have an explicit close button, regardless of revealHold.
    const holdGestureActive = gameState.settings.revealHold && gameState.settings.roleRevealConfirm !== false;
    document.getElementById('btn-role-close').classList.toggle('hidden', holdGestureActive && !isDetectivePending);
}
