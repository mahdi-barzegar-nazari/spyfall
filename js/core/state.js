/**
 * The single mutable game state, plus ephemeral per-page session state.
 */

export const SAVE_VERSION = 12;

export const gameState = {
    version: SAVE_VERSION,
    stateVersion: 1,
    phase: 'welcome',
    match: { usedWordKeys: [] },
    settings: {
        playersCount: 4, spiesCount: 1, timerMin: 4, cats: ['places', 'jobs', 'foods', 'objects', 'vehicles', 'animals', 'sports', 'events'], diff: 'all',
        revealHold: false, hints: ['related_word'], fool: false, detective: false,
        knownSpies: false, director: false, oneword: false, quests: false,
        wager: false, sudden: false, voteLimitEnabled: false, maxVotes: 2,
        roleRevealConfirm: true, voteConfirm: false, quickVoting: false,
        detectiveUsed: false
    },
    players: [],
    round: { num: 0, category: null, currentHintType: 'related_word', pointsMap: {}, history: [], roundId: null },
    timer: { running: false, pausedSec: 0, reason: 'emergency', wasRunningBeforePanic: false },
    vote: { limit: Infinity, targetId: null, pendingId: null, tieNote: '' },
    localVoteIndex: 0,
    localWagerIndex: 0,
};

export const hostSecretState = {
    secretWord: null,
    foolWord: null,
    hint: '',
    roles: {},
    votesCast: {},
    wagersCast: {},
    processedRequestIds: new Set(),
    detectiveUsed: false,
    detectiveInquiryResult: null,
    guessVerdict: null
};

/**
 * Ephemeral UI/session state. Never persisted; resets on reload.
 * (These four values used to be loose top-level variables shared across the whole script.)
 */
export const session = {
    /** id of the player whose role card is currently open, or null */
    activeModalPlayerId: null,
    voteHandoffDoneIndex: -1,
    wagerHandoffDoneIndex: -1,
    /** callback run by the shared confirm modal's "yes" button */
    pendingConfirmAction: null
};

function replaceContents(target, next) {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, next);
}

/** Swap in a restored game without breaking every module's reference to `gameState`. */
export function replaceGameState(next) {
    replaceContents(gameState, next);
}

/** Swap in restored host secrets in place (see replaceGameState). */
export function replaceHostSecrets(next) {
    replaceContents(hostSecretState, next);
}

export function serializeSecrets() {
    return {
        ...hostSecretState,
        processedRequestIds: Array.from(hostSecretState.processedRequestIds || [])
    };
}

export function restoreSecrets(raw) {
    if (!raw || typeof raw !== 'object') {
        return {
            secretWord: null, foolWord: null, hint: '',
            roles: {}, votesCast: {}, wagersCast: {},
            processedRequestIds: new Set(), detectiveUsed: false,
            detectiveInquiryResult: null, guessVerdict: null
        };
    }
    return {
        secretWord: raw.secretWord || null,
        foolWord: raw.foolWord || null,
        hint: raw.hint || '',
        roles: raw.roles || {},
        votesCast: raw.votesCast || {},
        wagersCast: raw.wagersCast || {},
        processedRequestIds: new Set(raw.processedRequestIds || []),
        detectiveUsed: !!raw.detectiveUsed,
        detectiveInquiryResult: raw.detectiveInquiryResult || null,
        guessVerdict: raw.guessVerdict || null
    };
}
