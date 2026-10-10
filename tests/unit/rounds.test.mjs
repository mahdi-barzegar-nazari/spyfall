/**
 * Characterization tests for game/rounds.js: they pin what the code does today.
 * Randomness is seeded (env.seedRandom), so every run replays the same sequences.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { getDifficultyMultiplier } from '../../js/core/config.js';
import { gameState, hostSecretState, session } from '../../js/core/state.js';
import { sideQuestsPool } from '../../js/data/sideQuests.js';
import { sideQuestsPoolEn } from '../../js/data/sideQuestsEn.js';
import { WORD_PACKS } from '../../js/data/wordPacks.js';
import { WORD_PACKS_EN } from '../../js/data/wordPacksEn.js';
import { getLang, setLang, t } from '../../js/i18n/index.js';
import { normalizeWord } from '../../js/utils/text.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { freshStats, makePlayer, makePlayers, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { calcDirectorTurn, initMatchPlayers, startNextRound } = await import('../../js/game/rounds.js');
const harness = useGameHarness(env);
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

const NAME_INPUTS = '#name-inputs-container input';
const ALL_WORDS = Object.values(WORD_PACKS).flat();
const WORDS = [
    { word: 'Alpha', foolWord: 'Apple', hint: 'greek', diff: 'easy' },
    { word: 'Bravo', foolWord: 'Banana', hint: 'cheer', diff: 'medium' },
    { word: 'Charlie', foolWord: 'Cherry', hint: 'chaplin', diff: 'hard' }
];

/** Seat `players` players and pick the settings. By default the pool is the three WORDS above. */
function arrange({ players = 5, settings = {}, words = WORDS } = {}) {
    env.storage.set('spy_custom_words', JSON.stringify(words));
    gameState.players = makePlayers(players);
    Object.assign(gameState.settings, { cats: ['custom'] }, settings);
}

const countRole = (role) => gameState.players.filter((p) => p.role === role).length;
const spyEntry = () => hostSecretState.roles[gameState.players.find((p) => p.role === 'spy').id];

describe('initMatchPlayers', () => {
    it('builds one player per name input, in input order, with trimmed names', () => {
        env.stubQuery(NAME_INPUTS, [env.input('  Ali  ', 'a'), env.input('Bita', 'b'), env.input('\tCyrus\n', 'c')]);
        initMatchPlayers();
        assert.deepEqual(
            gameState.players.map((p) => [p.id, p.name]),
            [['a', 'Ali'], ['b', 'Bita'], ['c', 'Cyrus']]
        );
    });

    it('generates a distinct id for an input that has no data-player-id', () => {
        env.stubQuery(NAME_INPUTS, [env.input('Ali'), env.input('Bita')]);
        initMatchPlayers();
        const [first, second] = gameState.players;
        assert.ok(first.id && typeof first.id === 'string');
        assert.ok(second.id && typeof second.id === 'string');
        assert.notEqual(first.id, second.id);
    });

    it('starts a new player with score 0, all-zero stats and default round flags', () => {
        env.stubQuery(NAME_INPUTS, [env.input('Ali', 'a')]);
        initMatchPlayers();
        assert.deepEqual(gameState.players[0], makePlayer('a', { name: 'Ali' }));
        assert.deepEqual(gameState.players[0].stats, freshStats());
    });

    it('keeps score and stats of a returning player (same id) but resets the round flags', () => {
        const stats = { ...freshStats(), sw: 3, hiddenTieBreakerScore: 2.5 };
        gameState.players = [
            makePlayer('a', {
                name: 'Old name',
                score: 7,
                stats,
                isAlive: false,
                isSpectator: true,
                hasSeen: true,
                role: 'spy',
                team: 'spy',
                quest: 'q'
            })
        ];
        env.stubQuery(NAME_INPUTS, [env.input('Ali', 'a')]);
        initMatchPlayers();
        assert.deepEqual(gameState.players[0], makePlayer('a', { name: 'Ali', score: 7, stats }));
    });

    it('does not share stats between a returning player and a new one', () => {
        gameState.players = [makePlayer('a', { score: 4 })];
        env.stubQuery(NAME_INPUTS, [env.input('Ali', 'a'), env.input('Bita', 'b')]);
        initMatchPlayers();
        const [returning, fresh] = gameState.players;
        assert.equal(returning.score, 4);
        assert.equal(fresh.score, 0);
        assert.notEqual(returning.stats, fresh.stats);
    });

    it('drops players that no longer have an input', () => {
        gameState.players = [makePlayer('a', { score: 5 }), makePlayer('b', { score: 6 })];
        env.stubQuery(NAME_INPUTS, [env.input('Bita', 'b')]);
        initMatchPlayers();
        assert.deepEqual(gameState.players.map((p) => [p.id, p.score]), [['b', 6]]);
    });
});

describe('startNextRound: basics', () => {
    it('returns true, moves to the reveal phase and draws that screen once', () => {
        arrange();
        assert.equal(startNextRound(), true);
        assert.equal(gameState.phase, 'reveal');
        assert.deepEqual(harness.renders, ['reveal']);
    });

    it('counts rounds up by one and gives every round a new id', () => {
        arrange();
        startNextRound();
        const firstId = gameState.round.roundId;
        assert.equal(gameState.round.num, 1);
        startNextRound();
        assert.equal(gameState.round.num, 2);
        assert.ok(typeof gameState.round.roundId === 'string' && gameState.round.roundId);
        assert.notEqual(gameState.round.roundId, firstId);
    });

    it('resets every per-round value left over from the previous round', () => {
        arrange({ players: 4, settings: { timerMin: 3 } });
        Object.assign(gameState.round, {
            pointsMap: { stale: 9 },
            history: [{ a: 'p1', t: 'p2' }],
            eliminationsSoFar: 3
        });
        hostSecretState.processedRequestIds.add('request-1');
        hostSecretState.votesCast = { p1: 'p2' };
        hostSecretState.wagersCast = { p1: { submitted: true, amount: 2 } };
        hostSecretState.guessVerdict = 'correct';
        hostSecretState.detectiveUsed = true;
        hostSecretState.detectiveInquiryResult = 'old result';
        hostSecretState.roles = { stale: { role: 'spy' } };
        gameState.settings.detectiveUsed = true;
        gameState.localVoteIndex = 4;
        gameState.localWagerIndex = 2;
        session.voteHandoffDoneIndex = 3;
        session.wagerHandoffDoneIndex = 2;
        gameState.vote = { limit: 1, targetId: 'p3', pendingId: 'p4', tieNote: 'old' };
        gameState.timer = { running: true, pausedSec: 5, reason: 'timeout', wasRunningBeforePanic: true };

        startNextRound();

        assert.deepEqual(gameState.round.pointsMap, { p1: 0, p2: 0, p3: 0, p4: 0 });
        assert.deepEqual(gameState.round.history, []);
        assert.equal(gameState.round.eliminationsSoFar, 0);
        assert.equal(hostSecretState.processedRequestIds.size, 0);
        assert.deepEqual(hostSecretState.votesCast, {});
        assert.deepEqual(hostSecretState.wagersCast, {});
        assert.equal(hostSecretState.guessVerdict, null);
        assert.equal(hostSecretState.detectiveUsed, false);
        assert.equal(hostSecretState.detectiveInquiryResult, null);
        assert.equal(gameState.settings.detectiveUsed, false);
        assert.equal(gameState.localVoteIndex, 0);
        assert.equal(gameState.localWagerIndex, 0);
        assert.equal(session.voteHandoffDoneIndex, -1);
        assert.equal(session.wagerHandoffDoneIndex, -1);
        assert.deepEqual(gameState.vote, { limit: 999, targetId: null, pendingId: null, tieNote: '' });
        assert.deepEqual(gameState.timer, {
            running: false,
            pausedSec: 180,
            reason: 'emergency',
            wasRunningBeforePanic: false
        });
        assert.ok(!('stale' in hostSecretState.roles));
    });

    it('sets the discussion time to timerMin * 60 seconds, without starting it', () => {
        arrange();
        for (const [timerMin, seconds] of [[1, 60], [4, 240], [15, 900]]) {
            gameState.settings.timerMin = timerMin;
            startNextRound();
            assert.equal(gameState.timer.pausedSec, seconds);
            assert.equal(gameState.timer.running, false);
        }
    });

    it('sets the emergency-vote limit to 999, or to maxVotes when the limit is enabled', () => {
        arrange();
        startNextRound();
        assert.equal(gameState.vote.limit, 999);
        Object.assign(gameState.settings, { voteLimitEnabled: true, maxVotes: 4 });
        startNextRound();
        assert.equal(gameState.vote.limit, 4);
    });

    it('brings every player back into the game and zeroes the round points', () => {
        arrange({ players: 4 });
        Object.assign(gameState.players[0], { isSpectator: true, isAlive: false, hasSeen: true });
        gameState.players[1].quest = 'stale quest';
        gameState.players[2].score = 12;
        startNextRound();
        for (const p of gameState.players) {
            assert.equal(p.isSpectator, false);
            assert.equal(p.isAlive, true);
            assert.equal(p.hasSeen, false);
            assert.equal(p.quest, null);
            assert.equal(gameState.round.pointsMap[p.id], 0);
        }
        assert.equal(gameState.players[2].score, 12, 'the match score is not touched');
    });
});

describe('startNextRound: spies', () => {
    const CASES = [
        { players: 3, spies: 1, expected: 1 },
        { players: 4, spies: 1, expected: 1 },
        { players: 5, spies: 2, expected: 2 },
        { players: 7, spies: 3, expected: 3 },
        { players: 3, spies: 2, expected: 2 },
        // spiesCount above players - 1 is capped, so the citizens are never wiped out
        { players: 3, spies: 5, expected: 2 },
        { players: 4, spies: 9, expected: 3 },
        { players: 2, spies: 2, expected: 1 },
        { players: 1, spies: 1, expected: 0 }
    ];
    for (const { players, spies, expected } of CASES) {
        it(`${players} players and spiesCount ${spies} give exactly ${expected} spies, every round`, () => {
            env.seedRandom(11);
            arrange({ players, settings: { spiesCount: spies } });
            for (let round = 0; round < 200; round++) {
                startNextRound();
                assert.equal(countRole('spy'), expected);
                assert.equal(gameState.players.filter((p) => p.team === 'spy').length, expected);
            }
        });
    }

    it('mirrors every player role and team in hostSecretState.roles', () => {
        env.seedRandom(12);
        arrange({ players: 6, settings: { spiesCount: 2, fool: true, detective: true } });
        startNextRound();
        assert.deepEqual(Object.keys(hostSecretState.roles).sort(), gameState.players.map((p) => p.id).sort());
        for (const p of gameState.players) {
            assert.equal(hostSecretState.roles[p.id].role, p.role);
            assert.equal(hostSecretState.roles[p.id].team, p.team);
        }
    });

    it('lets every player be the spy sometimes (the shuffle is real)', () => {
        env.seedRandom(13);
        arrange({ players: 4 });
        const seen = new Set();
        for (let round = 0; round < 200; round++) {
            startNextRound();
            seen.add(gameState.players.find((p) => p.role === 'spy').id);
        }
        assert.deepEqual([...seen].sort(), ['p1', 'p2', 'p3', 'p4']);
    });

    it('counts timesSpy per assignment and keeps counting across rounds', () => {
        env.seedRandom(14);
        arrange({ players: 5, settings: { spiesCount: 2 } });
        for (let round = 1; round <= 10; round++) {
            startNextRound();
            const total = gameState.players.reduce((sum, p) => sum + p.stats.timesSpy, 0);
            assert.equal(total, 2 * round);
        }
    });

    it('puts the fool right after the spies that were really assigned when spiesCount is capped', () => {
        // With spiesCount >= players the spies are capped at players - 1. The fool takes the seat after
        // the last spy (the one remaining player), not a seat counted from the uncapped spiesCount.
        // The setup screen never allows this (spies < players / 2); it is only reachable from code.
        for (const [players, spiesCount] of [[3, 3], [3, 5], [4, 9]]) {
            env.seedRandom(15);
            arrange({ players, settings: { spiesCount, fool: true } });
            startNextRound();
            assert.equal(countRole('spy'), players - 1, `${players} players, spiesCount ${spiesCount}`);
            assert.equal(countRole('fool'), 1, `${players} players, spiesCount ${spiesCount}`);
            assert.equal(countRole('citizen'), 0, `${players} players, spiesCount ${spiesCount}`);
            assert.equal(gameState.players.find((p) => p.role === 'fool').stats.timesFool, 1);
        }
    });

    it('with spiesCount capped there is no seat left for the detective after the fool', () => {
        env.seedRandom(16);
        arrange({ players: 3, settings: { spiesCount: 3, fool: true, detective: true } });
        startNextRound();
        assert.equal(countRole('spy'), 2);
        assert.equal(countRole('fool'), 1);
        assert.equal(countRole('detective'), 0);
    });

    it('with spiesCount capped and only the detective on, the detective takes the last seat', () => {
        env.seedRandom(17);
        arrange({ players: 3, settings: { spiesCount: 3, detective: true } });
        startNextRound();
        assert.equal(countRole('spy'), 2);
        assert.equal(countRole('fool'), 0);
        assert.equal(countRole('detective'), 1);
    });
});

describe('startNextRound: fool and detective', () => {
    const CASES = [
        { fool: true, detective: true, players: 5, spies: 1, want: { spy: 1, fool: 1, detective: 1, citizen: 2 } },
        { fool: true, detective: false, players: 5, spies: 1, want: { spy: 1, fool: 1, detective: 0, citizen: 3 } },
        { fool: false, detective: true, players: 5, spies: 1, want: { spy: 1, fool: 0, detective: 1, citizen: 3 } },
        { fool: false, detective: false, players: 5, spies: 1, want: { spy: 1, fool: 0, detective: 0, citizen: 4 } },
        { fool: true, detective: true, players: 3, spies: 1, want: { spy: 1, fool: 1, detective: 1, citizen: 0 } },
        // no free seat for the detective once the spies and the fool have theirs
        { fool: true, detective: true, players: 3, spies: 2, want: { spy: 2, fool: 1, detective: 0, citizen: 0 } },
        { fool: true, detective: true, players: 2, spies: 1, want: { spy: 1, fool: 1, detective: 0, citizen: 0 } },
        { fool: false, detective: true, players: 3, spies: 2, want: { spy: 2, fool: 0, detective: 1, citizen: 0 } }
    ];
    for (const { fool, detective, players, spies, want } of CASES) {
        const label = `fool ${fool}, detective ${detective}, ${players} players, ${spies} spies`;
        it(`${label}: ${JSON.stringify(want)}`, () => {
            env.seedRandom(21);
            arrange({ players, settings: { spiesCount: spies, fool, detective } });
            for (let round = 1; round <= 100; round++) {
                startNextRound();
                for (const role of Object.keys(want)) assert.equal(countRole(role), want[role], role);
                for (const p of gameState.players) {
                    assert.equal(p.team, p.role === 'spy' ? 'spy' : 'citizen');
                }
            }
            const timesFool = gameState.players.reduce((sum, p) => sum + p.stats.timesFool, 0);
            assert.equal(timesFool, want.fool * 100);
        });
    }

    it('gives the fool the decoy word and everyone else the real word', () => {
        arrange({ settings: { fool: true } });
        startNextRound();
        const word = WORDS.find((w) => w.word === hostSecretState.secretWord);
        assert.equal(hostSecretState.foolWord, word.foolWord);
        assert.notEqual(hostSecretState.foolWord, hostSecretState.secretWord);
    });
});

describe('startNextRound: secret word and spy hints', () => {
    const ONE_WORD = [{ word: 'Zulu', foolWord: 'Zebra', hint: 'alphabet', diff: 'easy' }];

    it('stores the word, its decoy and its related-word hint for the host', () => {
        arrange({ words: ONE_WORD });
        startNextRound();
        assert.equal(hostSecretState.secretWord, 'Zulu');
        assert.equal(hostSecretState.foolWord, 'Zebra');
        assert.equal(hostSecretState.hint, 'alphabet');
    });

    it('gives hostSecretState.roles an entry for every player and drops stale ones', () => {
        arrange({ players: 4, words: ONE_WORD });
        hostSecretState.roles = { gone: { role: 'spy' } };
        startNextRound();
        assert.deepEqual(Object.keys(hostSecretState.roles).sort(), ['p1', 'p2', 'p3', 'p4']);
    });

    it('type "none": the spy gets a hint that gives away neither the word nor its category', () => {
        arrange({ words: ONE_WORD, settings: { hints: ['none'] } });
        startNextRound();
        assert.equal(gameState.round.currentHintType, 'none');
        const { hint, hintTitle } = spyEntry();
        assert.ok(hint && hintTitle);
        assert.ok(!hint.includes('Zulu') && !hint.includes('alphabet') && !hint.includes(gameState.round.category));
    });

    it('type "category": the spy gets the category label', () => {
        arrange({ words: ONE_WORD, settings: { hints: ['category'] } });
        startNextRound();
        assert.equal(gameState.round.currentHintType, 'category');
        assert.equal(spyEntry().hint, gameState.round.category);
    });

    it('type "first_letter": the spy gets the first letter and nothing more of the word', () => {
        arrange({ words: ONE_WORD, settings: { hints: ['first_letter'] } });
        startNextRound();
        assert.equal(gameState.round.currentHintType, 'first_letter');
        const { hint } = spyEntry();
        assert.ok(hint.includes('Z'));
        assert.ok(!hint.includes('ulu'));
    });

    it('type "related_word": the spy gets the word\'s related-word hint', () => {
        arrange({ words: ONE_WORD, settings: { hints: ['related_word'] } });
        startNextRound();
        assert.equal(gameState.round.currentHintType, 'related_word');
        assert.equal(spyEntry().hint, 'alphabet');
    });

    it('titles the four hint types differently, and differently from the citizen title', () => {
        const titles = new Set();
        let citizenTitle;
        for (const type of ['none', 'category', 'first_letter', 'related_word']) {
            arrange({ words: ONE_WORD, settings: { hints: [type] } });
            startNextRound();
            titles.add(spyEntry().hintTitle);
            citizenTitle = hostSecretState.roles[gameState.players.find((p) => p.role !== 'spy').id].hintTitle;
        }
        titles.add(citizenTitle);
        assert.equal(titles.size, 5);
    });

    it('shows citizens, the fool and the detective no hint, all under the same title', () => {
        env.seedRandom(31);
        arrange({ players: 6, settings: { spiesCount: 1, fool: true, detective: true, hints: ['category'] } });
        startNextRound();
        const others = gameState.players.filter((p) => p.role !== 'spy').map((p) => hostSecretState.roles[p.id]);
        assert.equal(others.length, 5);
        for (const entry of others) {
            assert.equal(entry.hint, '');
            assert.equal(entry.hintTitle, others[0].hintTitle);
        }
    });

    it('picks only from the enabled hint types, and uses all of them over time', () => {
        env.seedRandom(32);
        const enabled = ['none', 'category', 'first_letter', 'related_word'];
        arrange({ settings: { hints: enabled } });
        const seen = new Set();
        for (let round = 0; round < 200; round++) {
            startNextRound();
            assert.ok(enabled.includes(gameState.round.currentHintType));
            seen.add(gameState.round.currentHintType);
        }
        assert.equal(seen.size, 4);
    });

    it('falls back to related_word when no hint type is enabled', () => {
        arrange({ settings: { hints: [] } });
        startNextRound();
        assert.equal(gameState.round.currentHintType, 'related_word');
    });
});

describe('startNextRound: word selection', () => {
    it('does not repeat a word until the pool is used up, then starts the list over', () => {
        env.seedRandom(41);
        arrange();
        const drawn = [];
        for (let round = 0; round < 3; round++) {
            startNextRound();
            drawn.push(hostSecretState.secretWord);
        }
        assert.deepEqual([...drawn].sort(), ['Alpha', 'Bravo', 'Charlie']);
        assert.deepEqual([...gameState.match.usedWordKeys].sort(), ['alpha', 'bravo', 'charlie']);

        startNextRound();
        assert.equal(gameState.match.usedWordKeys.length, 1);
        assert.deepEqual(gameState.match.usedWordKeys, [normalizeWord(hostSecretState.secretWord)]);
        startNextRound();
        assert.equal(gameState.match.usedWordKeys.length, 2);
    });

    it('skips words that are already in usedWordKeys', () => {
        env.seedRandom(42);
        arrange();
        for (let round = 0; round < 20; round++) {
            gameState.match.usedWordKeys = ['alpha', 'bravo'];
            startNextRound();
            assert.equal(hostSecretState.secretWord, 'Charlie');
        }
    });

    for (const diff of ['easy', 'medium', 'hard']) {
        it(`with difficulty "${diff}" only draws ${diff} words`, () => {
            env.seedRandom(43);
            arrange({ settings: { cats: Object.keys(WORD_PACKS), diff } });
            for (let round = 0; round < 40; round++) {
                startNextRound();
                assert.equal(gameState.round.wordDifficulty, diff);
                const word = hostSecretState.secretWord;
                assert.ok(ALL_WORDS.some((w) => w.word === word && w.diff === diff), word);
            }
        });
    }

    it('with difficulty "all" draws every rating and records the word\'s own rating', () => {
        env.seedRandom(44);
        arrange({ settings: { cats: Object.keys(WORD_PACKS), diff: 'all' } });
        const seen = new Set();
        for (let round = 0; round < 60; round++) {
            startNextRound();
            const word = hostSecretState.secretWord;
            assert.ok(ALL_WORDS.some((w) => w.word === word && w.diff === gameState.round.wordDifficulty));
            seen.add(gameState.round.wordDifficulty);
        }
        assert.deepEqual([...seen].sort(), ['easy', 'hard', 'medium']);
    });

    it('ignores the difficulty filter when no word in the pool has that rating', () => {
        arrange({ words: [{ word: 'Zulu', foolWord: 'Zebra', hint: 'z', diff: 'hard' }], settings: { diff: 'easy' } });
        startNextRound();
        assert.equal(hostSecretState.secretWord, 'Zulu');
    });

    it('falls back to the places pack when the chosen categories hold no words', () => {
        arrange({ settings: { cats: ['places'] } });
        startNextRound();
        const placesLabel = gameState.round.category;
        const places = WORD_PACKS.places.map((w) => w.word);

        arrange({ words: [], settings: { cats: ['custom'] } });
        startNextRound();
        assert.ok(places.includes(hostSecretState.secretWord));
        assert.equal(gameState.round.category, placesLabel);

        arrange({ settings: { cats: ['no-such-category'] } });
        startNextRound();
        assert.ok(places.includes(hostSecretState.secretWord));
    });

    it('treats an empty category list as "all built-in categories"', () => {
        env.seedRandom(45);
        arrange({ settings: { cats: [] } });
        const labels = new Set();
        for (let round = 0; round < 60; round++) {
            startNextRound();
            assert.ok(ALL_WORDS.some((w) => w.word === hostSecretState.secretWord));
            labels.add(gameState.round.category);
        }
        assert.ok(labels.size >= 4, `only ${labels.size} categories drawn`);
    });

    it('scores custom words as neutral: no difficulty, multiplier 1, whatever the setting says', () => {
        const hardWord = [{ word: 'Zulu', foolWord: 'Zebra', hint: 'z', diff: 'hard' }];
        arrange({ words: hardWord, settings: { diff: 'hard' } });
        startNextRound();
        assert.equal(gameState.round.wordDifficulty, null);
        assert.equal(getDifficultyMultiplier(gameState.round.wordDifficulty), 1);
    });

    it('gives each of the eight built-in categories and the custom one its own label', () => {
        const labels = [];
        for (const key of [...Object.keys(WORD_PACKS), 'custom']) {
            arrange({ settings: { cats: [key] } });
            startNextRound();
            labels.push(gameState.round.category);
        }
        assert.equal(labels.length, 9);
        assert.ok(labels.every((label) => typeof label === 'string' && label));
        assert.equal(new Set(labels).size, 9);
    });
});

describe('startNextRound: side quests', () => {
    it('hands every player a different quest from the pool when quests are on', () => {
        env.seedRandom(51);
        arrange({ players: 20, settings: { quests: true } });
        startNextRound();
        const quests = gameState.players.map((p) => p.quest);
        assert.ok(quests.every((q) => sideQuestsPool.includes(q)));
        assert.equal(new Set(quests).size, 20);
    });

    it('gives nobody a quest when quests are off, and clears last round\'s quests', () => {
        arrange({ players: 4, settings: { quests: true } });
        startNextRound();
        assert.ok(gameState.players.every((p) => p.quest !== null));
        gameState.settings.quests = false;
        startNextRound();
        assert.ok(gameState.players.every((p) => p.quest === null));
    });
});

describe('calcDirectorTurn', () => {
    /** Players p1..pN, all alive. */
    function seat(count) {
        gameState.players = makePlayers(count);
        gameState.round.history = [];
    }
    const turns = (count) => {
        for (let i = 0; i < count; i++) calcDirectorTurn();
    };

    it('does nothing with fewer than two players who are alive and playing', () => {
        seat(0);
        turns(3);
        seat(1);
        turns(3);
        seat(3);
        gameState.players[0].isAlive = false;
        gameState.players[1].isSpectator = true;
        turns(3);
        assert.deepEqual(gameState.round.history, []);
    });

    it('appends one { a, t } entry per turn, with different people asking and being asked', () => {
        env.seedRandom(61);
        for (const count of [2, 3, 6]) {
            seat(count);
            turns(60);
            assert.equal(gameState.round.history.length, 60);
            for (const entry of gameState.round.history) {
                assert.deepEqual(Object.keys(entry).sort(), ['a', 't']);
                assert.notEqual(entry.a, entry.t);
            }
        }
    });

    it('never picks an eliminated player or a spectator', () => {
        env.seedRandom(62);
        seat(6);
        gameState.players[2].isAlive = false;
        gameState.players[4].isSpectator = true;
        turns(100);
        const allowed = ['p1', 'p2', 'p4', 'p6'];
        for (const { a, t } of gameState.round.history) {
            assert.ok(allowed.includes(a) && allowed.includes(t), `${a} asks ${t}`);
        }
    });

    it('does not let the previous asker, or the previous target, go again straight away', () => {
        for (const count of [3, 4, 5, 8]) {
            for (let seed = 1; seed <= 20; seed++) {
                env.seedRandom(seed);
                seat(count);
                turns(6 * count);
                const history = gameState.round.history;
                for (let i = 1; i < history.length; i++) {
                    assert.notEqual(history[i].a, history[i - 1].a, `asker repeated (${count} players, seed ${seed})`);
                    assert.notEqual(history[i].t, history[i - 1].t, `target repeated (${count} players, seed ${seed})`);
                }
            }
        }
    });

    it('keeps the turns balanced: after each full cycle nobody is more than one ahead', () => {
        for (const count of [3, 4, 5, 8]) {
            for (let seed = 1; seed <= 20; seed++) {
                env.seedRandom(seed);
                seat(count);
                for (let cycle = 1; cycle <= 5; cycle++) {
                    turns(count);
                    const asked = {};
                    const targeted = {};
                    gameState.players.forEach((p) => {
                        asked[p.id] = 0;
                        targeted[p.id] = 0;
                    });
                    gameState.round.history.forEach(({ a, t }) => {
                        asked[a]++;
                        targeted[t]++;
                    });
                    for (const counts of [asked, targeted]) {
                        const values = Object.values(counts);
                        assert.ok(Math.max(...values) - Math.min(...values) <= 1, `${count} players, seed ${seed}`);
                    }
                }
            }
        }
    });
});

describe('startNextRound: one word bank and one quest pool per language', () => {
    const ALL_WORDS_EN = Object.values(WORD_PACKS_EN).flat();
    const PERSIAN = /[\u0600-\u06FF]/;
    const everyCategory = () => ({ cats: Object.keys(WORD_PACKS), diff: 'all' });

    it('with Persian active the word comes from the Persian bank, and the category label is Persian', () => {
        env.seedRandom(61);
        assert.equal(getLang(), 'fa');
        arrange({ settings: everyCategory() });
        for (let round = 0; round < 60; round++) {
            startNextRound();
            const word = hostSecretState.secretWord;
            assert.ok(ALL_WORDS.some((w) => w.word === word), word);
            assert.ok(!ALL_WORDS_EN.some((w) => w.word === word), word);
            assert.match(gameState.round.category, PERSIAN);
        }
    });

    it('with English active the word comes from the English bank, and the category label is English', () => {
        env.seedRandom(62);
        setLang('en');
        arrange({ settings: everyCategory() });
        const categories = new Set();
        for (let round = 0; round < 60; round++) {
            startNextRound();
            const word = hostSecretState.secretWord;
            const entry = ALL_WORDS_EN.find((w) => w.word === word);
            assert.ok(entry, word);
            assert.ok(!ALL_WORDS.some((w) => w.word === word), word);
            assert.equal(hostSecretState.foolWord, entry.foolWord);
            assert.equal(hostSecretState.hint, entry.hint);
            assert.equal(gameState.round.wordDifficulty, entry.diff);
            assert.doesNotMatch(gameState.round.category, PERSIAN);
            categories.add(gameState.round.category);
        }
        assert.ok(categories.size >= 4, `only ${categories.size} categories drawn`);
    });

    it('each English category draws only from its own list and shows its own English label', () => {
        for (const category of Object.keys(WORD_PACKS_EN)) {
            env.seedRandom(63);
            setLang('en');
            arrange({ settings: { cats: [category], diff: 'all' } });
            for (let round = 0; round < 12; round++) {
                startNextRound();
                assert.ok(WORD_PACKS_EN[category].some((w) => w.word === hostSecretState.secretWord), `${category}: ${hostSecretState.secretWord}`);
                assert.equal(gameState.round.category, t(`setup.cat.${category}`));
            }
        }
    });

    it('the difficulty filter works on the English bank too', () => {
        env.seedRandom(64);
        setLang('en');
        for (const diff of ['easy', 'medium', 'hard']) {
            arrange({ settings: { cats: Object.keys(WORD_PACKS_EN), diff } });
            for (let round = 0; round < 25; round++) {
                startNextRound();
                assert.equal(gameState.round.wordDifficulty, diff);
                assert.ok(ALL_WORDS_EN.some((w) => w.word === hostSecretState.secretWord && w.diff === diff));
            }
        }
    });

    it('draws, for every English category and difficulty, a word of that category and difficulty plus the fool word and hint of the same entry', () => {
        for (const category of Object.keys(WORD_PACKS_EN)) {
            for (const diff of ['easy', 'medium', 'hard']) {
                const candidates = WORD_PACKS_EN[category].filter((w) => w.diff === diff);
                assert.ok(candidates.length > 0, `${category}/${diff}: the bank has no such word`);
                env.seedRandom(65);
                setLang('en');
                arrange({ settings: { cats: [category], diff } });
                for (let round = 0; round < Math.min(candidates.length, 4); round++) {
                    startNextRound();
                    const drawn = hostSecretState.secretWord;
                    const entry = WORD_PACKS_EN[category].find((w) => w.word === drawn);
                    assert.ok(entry, `${category}/${diff}: "${drawn}" is not in WORD_PACKS_EN.${category}`);
                    assert.equal(entry.diff, diff, `${category}/${diff}: "${drawn}" is rated ${entry.diff}`);
                    assert.equal(gameState.round.wordDifficulty, diff, `${category}/${diff}: "${drawn}"`);
                    assert.equal(hostSecretState.foolWord, entry.foolWord, `${category}/${diff}: fool word of "${drawn}"`);
                    assert.equal(hostSecretState.hint, entry.hint, `${category}/${diff}: hint of "${drawn}"`);
                }
            }
        }
    });

    it('custom words work in both languages: scored as neutral, with the custom label of that language', () => {
        for (const lang of ['fa', 'en']) {
            setLang(lang);
            arrange();
            startNextRound();
            assert.ok(WORDS.some((w) => w.word === hostSecretState.secretWord), `${lang}: ${hostSecretState.secretWord}`);
            assert.equal(gameState.round.wordDifficulty, null);
            assert.equal(gameState.round.category, t('setup.cat.custom'));
        }
        setLang('en');
        arrange();
        startNextRound();
        assert.equal(gameState.round.category, 'Custom words');
    });

    it('the used-words rule works in English: no repeat until the category is used up, then it starts over', () => {
        env.seedRandom(65);
        setLang('en');
        arrange({ settings: { cats: ['places'] } });
        const size = WORD_PACKS_EN.places.length;
        const drawn = [];
        for (let round = 0; round < size; round++) {
            startNextRound();
            drawn.push(hostSecretState.secretWord);
        }
        assert.equal(new Set(drawn).size, size);
        assert.deepEqual([...drawn].sort(), WORD_PACKS_EN.places.map((w) => w.word).sort());
        assert.equal(gameState.match.usedWordKeys.length, size);

        startNextRound();
        assert.deepEqual(gameState.match.usedWordKeys, [normalizeWord(hostSecretState.secretWord)]);
    });

    it('the used-words rule skips an English word that is already used, whatever its case', () => {
        env.seedRandom(66);
        setLang('en');
        arrange({ settings: { cats: ['places'] } });
        const [last, ...others] = WORD_PACKS_EN.places.map((w) => w.word);
        for (let round = 0; round < 20; round++) {
            gameState.match.usedWordKeys = others.map((w) => normalizeWord(w.toUpperCase()));
            startNextRound();
            assert.equal(hostSecretState.secretWord, last);
        }
    });

    it('falls back to the places pack OF THE ACTIVE LANGUAGE when the chosen categories hold no words', () => {
        setLang('en');
        arrange({ words: [], settings: { cats: ['custom'] } });
        startNextRound();
        assert.ok(WORD_PACKS_EN.places.some((w) => w.word === hostSecretState.secretWord), hostSecretState.secretWord);
        assert.equal(gameState.round.category, t('setup.cat.places'));

        arrange({ settings: { cats: ['no-such-category'] } });
        startNextRound();
        assert.ok(WORD_PACKS_EN.places.some((w) => w.word === hostSecretState.secretWord));

        setLang('fa');
        arrange({ words: [], settings: { cats: ['custom'] } });
        startNextRound();
        assert.ok(WORD_PACKS.places.some((w) => w.word === hostSecretState.secretWord));
    });

    it('English role cards: the spy gets an English hint (the word\'s own), the others the word, the fool the fool word', () => {
        env.seedRandom(67);
        setLang('en');
        arrange({ players: 6, settings: { ...everyCategory(), fool: true, detective: true } });
        for (let round = 0; round < 30; round++) {
            startNextRound();
            const entry = ALL_WORDS_EN.find((w) => w.word === hostSecretState.secretWord);
            const spy = spyEntry();
            assert.equal(spy.hintTitle, t('role.hintTitle.related'));
            assert.equal(spy.hint, entry.hint);
            assert.doesNotMatch(`${spy.hintTitle}${spy.hint}`, PERSIAN);
            assert.equal(hostSecretState.foolWord, entry.foolWord);
            for (const p of gameState.players.filter((x) => x.role !== 'spy')) {
                assert.equal(hostSecretState.roles[p.id].hintTitle, t('role.hintTitle.word'));
                assert.doesNotMatch(hostSecretState.roles[p.id].hintTitle, PERSIAN);
            }
        }
    });

    it('English role cards: the other hint types are English as well', () => {
        env.seedRandom(68);
        setLang('en');
        arrange({ settings: { ...everyCategory(), hints: ['category'] } });
        startNextRound();
        assert.equal(spyEntry().hint, gameState.round.category);
        assert.doesNotMatch(spyEntry().hint, PERSIAN);

        arrange({ settings: { ...everyCategory(), hints: ['first_letter'] } });
        startNextRound();
        assert.equal(spyEntry().hint, t('role.hint.firstLetter', { letter: hostSecretState.secretWord.charAt(0) }));
        assert.match(spyEntry().hint, /^“[A-Z]”$/);

        arrange({ settings: { ...everyCategory(), hints: ['none'] } });
        startNextRound();
        assert.equal(spyEntry().hint, 'No hint at all (hard)');
    });

    it('with quests on, English players get English quests (each different) and Persian players Persian ones', () => {
        env.seedRandom(69);
        setLang('en');
        arrange({ players: 12, settings: { quests: true } });
        startNextRound();
        const english = gameState.players.map((p) => p.quest);
        assert.ok(english.every((q) => sideQuestsPoolEn.includes(q)), english.join(' | '));
        assert.ok(english.every((q) => !sideQuestsPool.includes(q) && !PERSIAN.test(q)));
        assert.equal(new Set(english).size, 12);

        setLang('fa');
        arrange({ players: 12, settings: { quests: true } });
        startNextRound();
        const persian = gameState.players.map((p) => p.quest);
        assert.ok(persian.every((q) => sideQuestsPool.includes(q)));
        assert.equal(new Set(persian).size, 12);
    });

    it('a full table of 20 players gets 20 different English quests', () => {
        env.seedRandom(70);
        setLang('en');
        const players = 20;
        assert.ok(sideQuestsPoolEn.length >= players, 'this test needs a pool at least as big as the table');
        arrange({ players, settings: { quests: true } });
        startNextRound();
        assert.equal(new Set(gameState.players.map((p) => p.quest)).size, players);
    });
});
