/**
 * Match and round setup: players, word selection, roles, quests, director turns.
 */

import { setPhase } from '../core/dispatch.js';
import { gameState, hostSecretState, session } from '../core/state.js';
import { getCustomWords } from '../core/storage.js';
import { sideQuestsPool } from '../data/sideQuests.js';
import { WORD_PACKS } from '../data/wordPacks.js';
import { generateId, getRandomCryptoInt, shuffle } from '../utils/random.js';
import { normalizeWord } from '../utils/text.js';

export function initMatchPlayers() {
    let inputs = document.querySelectorAll('#name-inputs-container input');
    
    gameState.players = Array.from(inputs).map((inp) => {
        let pId = inp.dataset.playerId || generateId();
        let old = gameState.players.find(p => p.id === pId);

        return {
            id: pId,
            name: inp.value.trim(),
            score: old ? old.score : 0,
            isAlive: true,
            hasSeen: false,
            isSpectator: false,
            online: true,
            role: 'citizen',
            team: 'citizen',
            quest: null,
            stats: old ? old.stats : {
                sw: 0, cw: 0, spiesCaught: 0, vs: 0, bw: 0, bl: 0, spyGuesses: 0,
                innocentVotesReceived: 0, foolEscaped: 0, wagerProfit: 0, hiddenTieBreakerScore: 0,
                timesSpy: 0, timesFool: 0, wrongVotes: 0, totalCatchTimeSec: 0, citizensEliminatedBeforeCaught: 0
            }
        };
    });
}

export function startNextRound() {
    let pool = [];
    const activeCats = (gameState.settings.cats && gameState.settings.cats.length > 0) ? gameState.settings.cats : ['places', 'jobs', 'foods', 'objects', 'vehicles', 'animals', 'sports', 'events'];
    
    activeCats.forEach(catKey => {
        if (catKey === 'custom') {
            const customWords = getCustomWords().map(w => ({ ...w, _cat: 'custom' }));
            pool.push(...customWords);
        } else if (WORD_PACKS[catKey]) {
            const mapped = WORD_PACKS[catKey].map(w => ({ ...w, _cat: catKey }));
            pool.push(...mapped);
        }
    });

    if (pool.length === 0) {
        pool = WORD_PACKS.places.map(w => ({ ...w, _cat: 'places' }));
    }

    if (gameState.settings.diff !== 'all') {
        let f = pool.filter(w => w.diff === gameState.settings.diff);
        if (f.length > 0) {
            pool = f;
        }
    }

    let availablePool = pool.filter(w => !gameState.match.usedWordKeys.includes(normalizeWord(w.word)));
    if (availablePool.length === 0) {
        gameState.match.usedWordKeys = [];
        availablePool = pool;
    }
    let chosen = availablePool[getRandomCryptoInt(availablePool.length)];
    gameState.match.usedWordKeys.push(normalizeWord(chosen.word));
    gameState.round.category = getCategoryLabel(chosen._cat || 'places');
    // Custom words carry an internal default 'medium' rating with no real
    // user-provided difficulty, so they must score as neutral (1.0x).
    gameState.round.wordDifficulty = (chosen._cat === 'custom') ? null : (chosen.diff || null);

    const activeHints = (gameState.settings.hints && gameState.settings.hints.length > 0) ? gameState.settings.hints : ['related_word'];
    gameState.round.currentHintType = activeHints[getRandomCryptoInt(activeHints.length)];

    gameState.round.num++;
    gameState.round.roundId = generateId();
    gameState.round.pointsMap = {};
    gameState.round.history = [];
    gameState.round.eliminationsSoFar = 0;
    hostSecretState.processedRequestIds.clear();
    hostSecretState.votesCast = {};
    hostSecretState.wagersCast = {};
    hostSecretState.guessVerdict = null;
    
    hostSecretState.detectiveUsed = false;
    hostSecretState.detectiveInquiryResult = null;
    gameState.settings.detectiveUsed = false;

    gameState.localVoteIndex = 0;
    gameState.localWagerIndex = 0;
    session.voteHandoffDoneIndex = -1;
    session.wagerHandoffDoneIndex = -1;

    gameState.vote = {
        limit: gameState.settings.voteLimitEnabled ? gameState.settings.maxVotes : 999,
        targetId: null,
        pendingId: null,
        tieNote: ''
    };

    gameState.timer = {
        running: false,
        pausedSec: gameState.settings.timerMin * 60,
        reason: 'emergency',
        wasRunningBeforePanic: false
    };

    gameState.players.forEach(p => {
        p.isSpectator = false;
        p.isAlive = true;
        p.hasSeen = false;
        p.role = 'citizen';
        p.team = 'citizen';
        p.quest = null;
        gameState.round.pointsMap[p.id] = 0;
    });

    hostSecretState.secretWord = chosen.word;
    hostSecretState.foolWord = chosen.foolWord || chosen.word;
    hostSecretState.hint = chosen.hint;
    hostSecretState.roles = {};

    let activePlayers = gameState.players.filter(p => !p.isSpectator);
    let shuff = shuffle(activePlayers);
    for (let i = 0; i < Math.min(gameState.settings.spiesCount, shuff.length - 1); i++) {
        shuff[i].role = 'spy';
        shuff[i].team = 'spy';
        shuff[i].stats.timesSpy = (shuff[i].stats.timesSpy || 0) + 1;
    }
    let cIdx = gameState.settings.spiesCount;
    if (gameState.settings.fool && shuff.length > cIdx) {
        shuff[cIdx].role = 'fool';
        shuff[cIdx].team = 'citizen';
        shuff[cIdx].stats.timesFool = (shuff[cIdx].stats.timesFool || 0) + 1;
        cIdx++;
    }
    if (gameState.settings.detective && shuff.length > cIdx) {
        shuff[cIdx].role = 'detective';
        shuff[cIdx].team = 'citizen';
    }

    activePlayers.forEach(p => {
        let hintTitle = "کلمه رمز شما:";
        let hint = "";
        if (p.role === 'spy') {
            const hintType = gameState.round.currentHintType;
            if (hintType === 'none') {
                hintTitle = "نوع راهنما:";
                hint = "بدون هیچ راهنمایی (سخت)";
            } else if (hintType === 'category') {
                hintTitle = "دسته‌بندی موضوع:";
                hint = gameState.round.category;
            } else if (hintType === 'first_letter') {
                hintTitle = "حرف اول کلمه رمز:";
                hint = `« ${chosen.word.charAt(0)} »`;
            } else {
                hintTitle = "کلمه مرتبط راهنما:";
                hint = chosen.hint;
            }
        }
        hostSecretState.roles[p.id] = { role: p.role, team: p.team, hint, hintTitle };
    });

    if (gameState.settings.quests) {
        let qPool = shuffle(sideQuestsPool);
        activePlayers.forEach((p, i) => p.quest = qPool[i % qPool.length]);
    }

    setPhase('reveal');
    return true;
}

export function calcDirectorTurn() {
    let alive = gameState.players.filter(p => p.isAlive && !p.isSpectator);
    if (alive.length < 2) return;
    let aC = {}, tC = {}; alive.forEach(p => { aC[p.id] = 0; tC[p.id] = 0; });
    gameState.round.history.forEach(h => { if (aC[h.a] !== undefined) aC[h.a]++; if (tC[h.t] !== undefined) tC[h.t]++; });
    let last = gameState.round.history[gameState.round.history.length - 1];

    let askers = alive.map(p => {
        let s = aC[p.id] * 3 + tC[p.id];
        if (last && p.id === last.a) s += 10;
        return { p, s };
    }).sort((a, b) => a.s - b.s);
    let asker = shuffle(askers.filter(x => x.s === askers[0].s))[0].p;

    let tars = alive.filter(p => p.id !== asker.id).map(p => {
        let s = tC[p.id] * 3 + aC[p.id];
        if (last && p.id === last.t) s += 10;
        return { p, s };
    }).sort((a, b) => a.s - b.s);
    let target = shuffle(tars.filter(x => x.s === tars[0].s))[0].p;

    gameState.round.history.push({ a: asker.id, t: target.id });
}

function getCategoryLabel(key) {
    const labels = {
        places: "اماکن و فضاها",
        jobs: "مشاغل و حرفه‌ها",
        foods: "غذاها و خوراکی‌ها",
        objects: "اشیاء و فناوری",
        vehicles: "وسایل نقلیه",
        animals: "حیوانات و طبیعت",
        sports: "ورزش و بازی‌ها",
        events: "رویدادها و پدیده‌ها",
        custom: "کلمات سفارشی"
    };
    return labels[key] || "موضوعات بازی";
}
