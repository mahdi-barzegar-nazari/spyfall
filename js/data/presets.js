/**
 * The setup screen's ready-made presets: one tap sets the advanced switches (the four groups of the setup screen)
 * to a combination, so a person who does not want to read thirteen switches picks a style instead. A preset only
 * touches the switches in PRESET_CONTROLS and the number of emergency alarms; it never touches the players, the
 * spies, the topics, the difficulty, the time, the hints, the card reveal, or the role hand-over gate, which belong
 * to the person (and to the room) rather than to a style of play. Every preset names ALL of its switches, so what a
 * tap does never depends on what was set before.
 *
 * A preset counts as "on" when every one of its switches is as it says (and, while the alarm limit is on, the
 * limit too); see activeSetupPreset in ui/setupPresets.js. The ids are the names used in the catalogs:
 * `setup.preset.<id>` (the label) and `setup.preset.<id>.desc` (the one-line description).
 */

/** The switches a preset sets, by setting name: the id of the checkbox on the setup screen. */
export const PRESET_CONTROLS = {
    fool: 'toggle-fool',
    detective: 'toggle-detective',
    knownSpies: 'toggle-known',
    director: 'toggle-director',
    oneword: 'toggle-oneword',
    quests: 'toggle-quests',
    wager: 'toggle-wager',
    sudden: 'toggle-sudden',
    voteLimitEnabled: 'toggle-limit',
    voteConfirm: 'toggle-vote-confirm',
    quickVoting: 'toggle-quick-voting',
    spyLastChance: 'toggle-last-chance',
    allSpies: 'toggle-all-spies'
};

/** The id of the number box of the emergency alarms (it only counts while `voteLimitEnabled` is on). */
export const MAX_VOTES_CONTROL = 'setup-max-votes';

export const SETUP_PRESETS = [
    {
        // The plain rules, as the game has always been: the same as the defaults of the advanced switches.
        id: 'classic',
        settings: {
            fool: false, detective: false, knownSpies: false, director: false, oneword: false, quests: false,
            wager: false, sudden: false, voteLimitEnabled: false, voteConfirm: false, quickVoting: false,
            spyLastChance: true, allSpies: false, maxVotes: 2
        }
    },
    {
        // For a lively evening: a decoy, secret funny quests, a turn director, faster voting, the surprise round.
        id: 'party',
        settings: {
            fool: true, detective: false, knownSpies: false, director: true, oneword: false, quests: true,
            wager: false, sudden: false, voteLimitEnabled: false, voteConfirm: false, quickVoting: true,
            spyLastChance: true, allSpies: true, maxVotes: 2
        }
    },
    {
        // For a serious game: a detective, wagers, sudden death, a confirmed vote and a limit on the alarms.
        id: 'competitive',
        settings: {
            fool: false, detective: true, knownSpies: false, director: false, oneword: false, quests: false,
            wager: true, sudden: true, voteLimitEnabled: true, voteConfirm: true, quickVoting: false,
            spyLastChance: true, allSpies: false, maxVotes: 2
        }
    }
];
