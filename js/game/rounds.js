/**
 * Match and round setup: players, word selection, roles, quests, director turns.
 */

import { setPhase } from '../core/phase.js';
import { gameState, hostSecretState, session } from '../core/state.js';
import { displayHint, getCustomWords } from '../core/storage.js';
import { getSideQuests, getWordPacks } from '../data/banks.js';
import { getLang, t } from '../i18n/index.js';
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
    // The word, the hint, the category label and the quests all come from the language that is active now.
    const lang = getLang();
    const packs = getWordPacks(lang);
    // The texts stored from here on (hint titles, hints, the category label) are in this language, so the save
    // records it and a restore switches back to it (RESTORE_GAME in app/actions.js).
    gameState.match.lang = lang;
    let pool = [];
    const activeCats = (gameState.settings.cats && gameState.settings.cats.length > 0) ? gameState.settings.cats : ['places', 'jobs', 'foods', 'objects', 'vehicles', 'animals', 'sports', 'events'];
    
    activeCats.forEach(catKey => {
        if (catKey === 'custom') {
            const customWords = getCustomWords().map(w => ({ ...w, _cat: 'custom' }));
            pool.push(...customWords);
        } else if (Object.prototype.hasOwnProperty.call(packs, catKey)) {
            const mapped = packs[catKey].map(w => ({ ...w, _cat: catKey }));
            pool.push(...mapped);
        }
    });

    if (pool.length === 0) {
        pool = packs.places.map(w => ({ ...w, _cat: 'places' }));
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
    // A custom word with no hint (or one saved with another language's "no hint" text) reads in this language.
    const wordHint = displayHint(chosen.hint);
    hostSecretState.hint = wordHint;
    hostSecretState.roles = {};

    let activePlayers = gameState.players.filter(p => !p.isSpectator);
    let shuff = shuffle(activePlayers);
    // Only as many spies as were really assigned: the fool and the detective take the seats after them.
    const spyCount = Math.min(gameState.settings.spiesCount, shuff.length - 1);
    for (let i = 0; i < spyCount; i++) {
        shuff[i].role = 'spy';
        shuff[i].team = 'spy';
        shuff[i].stats.timesSpy = (shuff[i].stats.timesSpy || 0) + 1;
    }
    let cIdx = spyCount;
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
        let hintTitle = t('role.hintTitle.word');
        let hint = "";
        if (p.role === 'spy') {
            const hintType = gameState.round.currentHintType;
            if (hintType === 'none') {
                hintTitle = t('role.hintTitle.hintType');
                hint = t('role.hint.none');
            } else if (hintType === 'category') {
                hintTitle = t('role.hintTitle.category');
                hint = gameState.round.category;
            } else if (hintType === 'first_letter') {
                hintTitle = t('role.hintTitle.firstLetter');
                hint = t('role.hint.firstLetter', { letter: chosen.word.charAt(0) });
            } else {
                hintTitle = t('role.hintTitle.related');
                hint = wordHint;
            }
        }
        hostSecretState.roles[p.id] = { role: p.role, team: p.team, hint, hintTitle };
    });

    if (gameState.settings.quests) {
        let qPool = shuffle(getSideQuests(lang));
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

const CATEGORY_LABEL_KEYS = {
    places: 'setup.cat.places',
    jobs: 'setup.cat.jobs',
    foods: 'setup.cat.foods',
    objects: 'setup.cat.objects',
    vehicles: 'setup.cat.vehicles',
    animals: 'setup.cat.animals',
    sports: 'setup.cat.sports',
    events: 'setup.cat.events',
    custom: 'setup.cat.custom'
};

function getCategoryLabel(key) {
    return t(CATEGORY_LABEL_KEYS[key] || 'setup.cat.unknown');
}
