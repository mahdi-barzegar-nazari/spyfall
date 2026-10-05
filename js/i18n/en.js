/**
 * English catalog. It has exactly the keys and placeholders of `fa.js` (tests/unit/i18n-html.test.mjs and
 * tests/unit/i18n-en.test.mjs check that). Values are plain text, never HTML; `{name}` marks a parameter.
 *
 * This is a party game, so the text is short, casual and second person, in the voice of the Persian text.
 * It is written for English, not translated word for word: placeholders move where English needs them,
 * and emoji stay exactly as they are in `fa.js`.
 *
 * Glossary: one English term per game idea, used everywhere. The brackets name the `fa.js` key that shows
 * the Persian original, so the two catalogs can be compared.
 *
 *   match ............ a whole game, many rounds                          (confirm.endMatch.title)
 *   round ............ one play-through: card, discussion, vote, result    (result.next)
 *   spy / spies ...... players who do not know the secret word            (common.spy)
 *   citizen(s) ....... everyone who knows the secret word; "innocent citizen" when voted out by mistake (role.citizen.badge)
 *   secret word ...... the word the citizens share                        (role.hintTitle.word, result.defaultWord)
 *   spy hint ......... what a spy sees instead of the word: related word, category name, first letter, none (info.hintTypes.title)
 *   decoy ............ a citizen who gets a slightly different word ("decoy word") and does not know it (info.fool.title)
 *   detective ........ a citizen who can run one "identity check" per round (info.detective.title, role.detective.heading)
 *   fellow spies ..... the "spies know each other" option                 (info.knownSpies.title)
 *   turn director .... the helper that says who asks whom                 (info.director.title)
 *   one-word rule .... answer every question with one word                (info.oneword.title)
 *   side quests ...... a secret funny challenge handed out with the role  (info.quests.title)
 *   wager ............ points bet that the suspect is a spy; "balance" is a player's points (info.wager.title, wager.turn)
 *   sudden death ..... voting out an innocent citizen ends the round, spies win (info.sudden.title)
 *   last chance ...... a caught spy may still say the secret word out loud (info.spyLastChance.title)
 *   alarm ............ stops the discussion timer and forces an early vote ("emergency alarm") (info.voteLimit.title)
 *   hand-over gate ... the screen that asks the next player to take the phone before anything secret shows (info.roleRevealConfirm.title)
 *   cover mode ....... the screen that hides the game at a glance         (panic.open.text)
 *   vote out ......... what a vote does to the suspect                    (vote.title)
 *   scorecard ........ the final standings page and the share image       (scorecard.title)
 *
 * Typography: ’ for apostrophes, “ ” for the quotes around a name in a list of names.
 */

export const en = {
    // ---- Document: <title> and meta description
    'meta.description': 'Spy (Spyfall) party mystery game: an upgraded web version, no install needed',
    'meta.title': 'Spy Party Game',

    // ---- App chrome: cover mode and install button
    'panic.shield.aria': 'Exit cover mode',
    'panic.shield.text': 'Cover mode is on (double-tap to exit)',
    'panic.open.aria': 'Turn on cover mode',
    'panic.open.text': '🛡️ Cover mode',
    'install.aria': 'Install the app on your phone',
    'install.text': '⬇️ Install on your phone',

    // ---- Hand-over gate
    'handoff.caption': 'Hand the phone to:',
    'handoff.cancel': 'Back',
    'handoff.reveal.subtitle.hold': 'Press and hold the button below to see your card. Let go and it hides again.',
    'handoff.reveal.subtitle.tap': 'Once the phone’s in your hands, tap the button below to see your card.',
    'handoff.reveal.action.hold': '🔒 Hold to reveal',
    'handoff.reveal.action.tap': '👁 Show my card',
    'handoff.vote.subtitle': 'Once the phone’s in your hands, tap the button below to see the voting options.',
    'handoff.vote.action': '🗳 I’m ready to vote',
    'handoff.wager.subtitle': 'Once the phone’s in your hands, tap the button below to choose your wager.',
    'handoff.wager.action': '💰 I’m ready to wager',

    // ---- Header bar
    'header.sound.aria': 'Mute or unmute',
    'header.theme.label': 'Choose theme',

    // ---- Theme names
    'theme.default': '🌌 Galactic Neon',
    'theme.noir': '🕵️ Classic Noir',
    'theme.classic': '🎞️ Classic Cinema',
    'theme.emerald': '🌲 Emerald Forest',
    'theme.crimson': '🔥 Crimson Flame',
    'theme.sunset': '🌇 Sunset Mirage',
    'theme.cyber': '🤖 Cyberpunk',
    'theme.ocean': '🧊 Frozen Ocean',

    // ---- Unfinished-match banner
    'recovery.message': '⚠️ Found an unfinished match.',
    'recovery.restore': 'Resume match',
    'recovery.discard': 'Start fresh',

    // ---- Shared words, name lists, plural units and time
    'common.spy': 'Spy',
    'common.suspect': 'Suspect',
    'common.unknownName': '?',
    'names.quoted': '“{name}”',
    'names.pair': '{a} and {b}',
    'names.more.one': '{a} and {count} other',
    'names.more.other': '{a} and {count} others',
    'score.points.one': '{count} point',
    'score.points.other': '{count} points',
    'time.minutes.one': '{count} minute',
    'time.minutes.other': '{count} minutes',
    'time.seconds.one': '{count} second',
    'time.seconds.other': '{count} seconds',
    'time.minutesAndSeconds': '{minutes} and {seconds}',

    // ---- Toasts
    'toast.selfVote': 'You can’t vote for yourself!',
    'toast.emergencyExhausted': 'No alarms left!',
    'toast.tallyError': 'Couldn’t count the votes. Vote cancelled.',
    'toast.updateReady': 'A new version is ready. Close the app and open it again.',
    'toast.playerNameEmpty': 'Player {n}’s name is empty!',
    'toast.playerNamesDuplicate': 'Player names must all be different!',
    'toast.wordRequired': 'Enter the secret word!',
    'toast.wordTooLong': 'The word can’t be longer than {max} characters!',
    'toast.hintTooLong': 'The hint can’t be longer than {max} characters!',
    'toast.wordLimitReached': 'You’ve reached the limit for custom words.',
    'toast.wordAdded': 'Word added!',
    'toast.fileTooLarge': 'That file is too big!',
    'toast.wordsImported.one': '{count} new word added!',
    'toast.wordsImported.other': '{count} new words added!',
    'toast.wordsAllKnown': 'Every word in that file was already saved.',
    'toast.importFailed': 'Couldn’t read that JSON file!',

    // ---- Welcome screen
    'welcome.title': '🕵️ The Spy Game',
    'welcome.tagline': 'A party game of mystery and suspense. Find the spy before they work out the secret word!',
    'welcome.start.aria': 'Start game',
    'welcome.start.label': 'Start game',
    'welcome.start.caption': 'One phone, passed around the group',
    'welcome.words': '✏️ Custom word bank',
    'welcome.credit.author.aria': 'Creator’s page',
    'welcome.credit.author': 'Made by Mahdi',
    'welcome.credit.support.aria': 'Support the creator',

    // ---- Setup screen
    'setup.title': 'Match settings',
    'setup.players.label': 'Total players:',
    'setup.spies.label': 'Number of spies:',
    'setup.categories.label': 'Word categories:',
    'setup.categories.all': 'All categories (+700 words)',
    'setup.cat.places': 'Places',
    'setup.cat.jobs': 'Jobs',
    'setup.cat.foods': 'Food & snacks',
    'setup.cat.objects': 'Objects & tech',
    'setup.cat.vehicles': 'Vehicles',
    'setup.cat.animals': 'Animals & nature',
    'setup.cat.sports': 'Sports & games',
    'setup.cat.events': 'Events',
    'setup.cat.custom': 'Custom words',
    'setup.cat.unknown': 'Game topic',
    'setup.difficulty.label': 'Difficulty:',
    'setup.difficulty.all': 'All levels',
    'setup.difficulty.easy': 'Easy',
    'setup.difficulty.medium': 'Medium',
    'setup.difficulty.hard': 'Hard',
    'setup.timer.label': 'Discussion time (min):',
    'setup.reveal.label': 'Card reveal:',
    'setup.reveal.click': 'Tap',
    'setup.reveal.hold': 'Press & hold',
    'setup.hints.label': 'Spy hint type:',
    'setup.hints.note': 'You can turn on several. Each round picks one of the active hints at random.',
    'setup.hint.related': 'Related word',
    'setup.hint.category': 'Category name',
    'setup.hint.firstLetter': 'First letter',
    'setup.hint.none': 'No hint',
    'setup.hint.noneTag': 'Hard',
    'setup.toggle.detective': 'Detective',
    'setup.toggle.known': 'Fellow spies',
    'setup.toggle.fool': 'Decoy',
    'setup.toggle.director': 'Turn director',
    'setup.toggle.oneword': 'One-word rule',
    'setup.toggle.quests': 'Side quests',
    'setup.toggle.wager': 'Wagers',
    'setup.toggle.sudden': 'Sudden death',
    'setup.toggle.lastChance': 'Spy’s last chance',
    'setup.toggle.limit': 'Alarm limit',
    'setup.toggle.roleRevealConfirm': 'Role hand-over gate',
    'setup.toggle.voteConfirm': 'Vote confirmation',
    'setup.toggle.quickVoting': 'Quick voting',
    'setup.maxVotes.label': 'Max emergency alarms',
    'setup.maxVotes.placeholder': 'Max emergency alarms',
    'setup.names.label': 'Players’ names:',
    'setup.names.reset': '🗑️ Defaults',
    'setup.start': 'Start match & deal cards 🚀',
    'setup.back': 'Back',
    'setup.error.players': 'You need {min} to {max} players!',
    'setup.error.spies.one': 'With {count} players, the spy limit is {max} (spies must be fewer than half the players)!',
    'setup.error.spies.other': 'With {count} players, the spy limit is {max} (spies must be fewer than half the players)!',
    'setup.error.timer': 'Discussion time must be {min} to {max} minutes!',
    'setup.error.maxVotes': 'The alarm limit must be between {min} and {max}!',
    'setup.error.roles': 'Not enough players ({players}) for the roles you picked ({roles})!',
    'setup.limit.players': '{min} to {max} players',
    'setup.limit.timer': '{min} to {max} minutes',
    'setup.limit.maxVotes': '{min} to {max} times',
    'setup.limit.spies.one': 'Max with {count} player: {max}',
    'setup.limit.spies.other': 'Max with {count} players: {max}',
    'setup.player.placeholder': 'Player {n} name',
    'setup.player.aria': 'Name of player number {n}',
    'setup.player.default': 'Player {n}',

    // ---- Role reveal screen
    'reveal.title': 'Secret cards',
    'reveal.startDiscussion': 'All seen — start the timer ⏳',
    'reveal.instruction.immediate': 'Tap your name to see your card right away.',
    'reveal.instruction.hold': 'Tap your name, then press and hold the reveal button.',
    'reveal.instruction.tap': 'Tap your name, then show your card.',

    // ---- Discussion timer screen
    'timer.oneword.banner': '⚡ One-word rule is on! Answer in just 1 word.',
    'timer.director.title': '🎯 Who asks whom:',
    'timer.director.next': 'Next turn 🔄',
    'timer.emergency': '🚨 Sound the alarm & vote',
    'timer.end': 'End match & scorecard 🏆',
    'timer.director.turn': '{asker}, ask {target} a question',
    'timer.votes.unlimited': 'Alarms: unlimited',
    'timer.votes.remaining': 'Alarms left: {limit}',

    // ---- Voting screen
    'vote.title': 'Vote someone out',
    'vote.cancel': 'Cancel & back to discussion',
    'vote.instruction': '📱 Phone to {name}:{br}Pick your suspect:',
    'vote.option.self': '{name} (you)',

    // ---- Wager screen
    'wager.title': '🎲 Wager on the suspect',
    'wager.turn': '📱 {name}’s turn (balance: {score})',
    'wager.select.aria': '{name}’s wager amount',
    'wager.submit.final': 'Place last wager & reveal ✅',
    'wager.submit.next': 'Place wager & next ➡️',
    'wager.option.none': 'No wager (0)',
    'wager.option.max.one': 'Max ({count} point)',
    'wager.option.max.other': 'Max ({count} points)',
    'wager.suspectLine': 'Suspect: {name}',

    // ---- Spy guess screen
    'guess.title': '🎯 Spy’s last chance!',
    'guess.announce': '{name} has been caught!{br}The spy now announces their secret-word guess to the group {verbal}.',
    'guess.verbalWord': 'out loud',
    'guess.verdict.prompt': 'Record the result of the spy’s guess:',
    'guess.correct': '✅ Right guess',
    'guess.wrong': '❌ Wrong guess',
    'guess.pass': '⚪ Passed / no guess',
    'guess.note': 'Right guess: the spies win the round. Wrong guess or pass: the game goes on as usual.',

    // ---- Round result screen
    'result.table.caption': 'Score changes this round',
    'result.col.player': 'Player',
    'result.col.change': 'Change',
    'result.col.total': 'Total',
    'result.next': 'Next round 🔁',
    'result.end': 'End match & final scorecard 🏆',
    'result.title.spy': '😈 Spies win!',
    'result.title.citizen': '🎉 Citizens win!',
    'result.defaultWord': 'the secret word',
    'result.spyGuessed': '🎯 {suspect} guessed the secret word ({word})!',
    'result.suddenDeath': 'An innocent citizen was voted out!{br}Sudden death is on, so the spies win.{br}The secret word was: {word}',
    'result.citizensExhausted': 'Too few citizens are left, so the spies win!{br}The secret word was: {word}',
    'result.spiesEliminated': '🎉 Every spy has been caught. You win!{br}The secret word was: {word}',

    // ---- Final scorecard screen
    'leaderboard.title': '🏆 Hall of Fame & Scorecard',
    'leaderboard.table.caption': 'Final match scorecard',
    'leaderboard.col.rank': 'Rank',
    'leaderboard.col.player': 'Player',
    'leaderboard.col.wins': 'Wins',
    'leaderboard.col.score': 'Final score',
    'leaderboard.exportImage': '📸 Save scorecard image',
    'leaderboard.details': '📋 Full player details',
    'leaderboard.newMatch': 'New match 🔄',
    'leaderboard.tied': '(tied)',
    'leaderboard.podiumTied': 'Tied',
    'leaderboard.accolade.ghost.title': 'Ghost: {names}',
    'leaderboard.accolade.ghost.desc': 'Slickest spy: dodged detection the most',
    'leaderboard.accolade.mindreader.title': 'Mind Reader: {names}',
    'leaderboard.accolade.mindreader.desc': 'Guessed the secret word as a spy',
    'leaderboard.accolade.sherlock.title': 'Sherlock Holmes: {names}',
    'leaderboard.accolade.sherlock.desc': 'Caught the most spies in votes',
    'leaderboard.accolade.wolf.title': 'Wolf of Wall Street: {names}',
    'leaderboard.accolade.wolf.desc': 'Made the most profit wagering on suspects',
    'leaderboard.accolade.victim.title': 'Innocent Victim: {names}',
    'leaderboard.accolade.victim.desc': 'The citizen who was wrongly accused the most',
    'leaderboard.accolade.mask.title': 'Masked Actor: {names}',
    'leaderboard.accolade.mask.desc': 'A decoy who slipped through unsuspected',

    // ---- Scorecard image (canvas)
    'scorecard.title': 'Spy Game: Final Scorecard',
    'scorecard.meta.rounds.one': '{count} round',
    'scorecard.meta.rounds.other': '{count} rounds',
    'scorecard.meta.players.one': '{count} player',
    'scorecard.meta.players.other': '{count} players',
    'scorecard.others': 'Other players',
    'scorecard.tied': '{name} (tied)',
    'scorecard.closing': '🎉 Hope you enjoyed the game',

    // ---- Modals: info
    'modal.info.close': 'Got it',

    // ---- Modals: custom words
    'words.title': '✏️ Custom words',
    'words.word.placeholder': 'Secret word (e.g. Hospital)',
    'words.fool.placeholder': 'Decoy word (e.g. Clinic)',
    'words.hint.placeholder': 'Spy hint (one word, e.g. Doctor)',
    'words.add': '➕ Add word',
    'words.export': '📤 Back up JSON',
    'words.import': '📥 Import JSON',
    'words.registered': 'Saved words ({count}):',
    'words.close': 'Close',
    'customWords.delete.aria': 'Delete word {word}',

    // ---- Modals: player details
    'details.title': '📋 Full player details',
    'details.subtitle': 'Stats tracked behind the scenes during the match',
    'details.close': 'Close',
    'details.section.overall': '🎖️ Overall',
    'details.section.fool': '🎭 As the decoy',
    'details.section.spy': '🕵️ As a spy',
    'details.section.wager': '🎲 Wagers',
    'details.section.hidden': '🔒 Hidden tie-break score',
    'details.stat.citizenWins': 'Wins as a citizen',
    'details.stat.votesRight': 'Correct votes (as a citizen)',
    'details.stat.votesWrong': 'Wrong votes (as a citizen)',
    'details.stat.wrongfullyEjected': 'Times wrongly voted out',
    'details.stat.foolTimes': 'Times in this role',
    'details.stat.foolEscapes': 'Successful escapes (not voted out)',
    'details.stat.spyTimes': 'Times as a spy',
    'details.stat.spyWins': 'Wins as a spy',
    'details.stat.spyCaught': 'Times caught and voted out',
    'details.stat.spyCitizensEjected': 'Citizens voted out before them',
    'details.stat.spyCatchTime': 'Total time until caught',
    'details.stat.spyGuesses': 'Correct secret-word guesses',
    'details.stat.wagersWon': 'Wagers won',
    'details.stat.wagersLost': 'Wagers lost',
    'details.stat.wagerProfit': 'Net wager profit/loss',
    'details.stat.hiddenTieBreaker': 'Hidden tie-break score (only used to break ties, not part of the final score)',

    // ---- Modals: vote confirmation
    'voteConfirm.title': 'Confirm vote',
    'voteConfirm.question': 'Are you sure you want to vote for {name}?',
    'voteConfirm.yes': 'Yes, vote',
    'voteConfirm.no': 'Cancel',

    // ---- Modals: role card
    'role.fellowSpies': '🕵️ Fellow spies:',
    'role.detective.heading': '🔍 Identity check:',
    'role.detective.inquiry': 'Check identity',
    'role.quest.heading': '🎯 Side quest:',
    'role.close': 'Seen it, hide card',
    'role.hintTitle.word': 'Your secret word:',
    'role.hintTitle.hintType': 'Hint type:',
    'role.hintTitle.category': 'Category:',
    'role.hintTitle.firstLetter': 'The word starts with:',
    'role.hintTitle.related': 'Related word:',
    'role.hint.none': 'No hint at all (hard)',
    'role.hint.firstLetter': '“{letter}”',
    'role.spectator.badge': '👀 You’re a spectator',
    'role.spectator.title': 'Your status this round:',
    'role.spectator.content': 'You join in the next round',
    'role.spy.badge': '🕵️ You’re a spy!',
    'role.citizen.badge': '👤 You’re a citizen',
    'role.detective.badge': '🔍 You’re the detective',
    'role.detective.result.spy': '{name} is a spy.',
    'role.detective.result.citizen': '{name} is a citizen.',
    'role.fellowSpies.join': '{a}, {b}',

    // ---- Modals: generic confirm
    'confirm.yes': 'Yes',
    'confirm.no': 'Cancel',
    'confirm.endMatch.title': 'End match',
    'confirm.endMatch.text': 'End the match and show the final scorecard?',
    'confirm.restore.title': 'Resume unfinished match',
    'confirm.restore.text': 'Continue the match you started earlier?',
    'confirm.discard.title': 'Start a new match',
    'confirm.discard.text': 'Delete the unfinished match for good and start a new one?',

    // ---- Modals: elimination reveal
    'elim.continue': 'Continue ⏭️',
    'elim.removed': '{name} is out of the game',
    'elim.badge.spy': '🕵️ A spy!',
    'elim.badge.citizen': '😇 An innocent citizen!',
    'elim.note.spyGuess': 'Now it’s time to guess the secret word...',
    'elim.note.wrong': 'Wrong vote!',
    'elim.note.wrongSurvive.one': 'Wrong vote! Every spy still in the game gets +{count} survival point.',
    'elim.note.wrongSurvive.other': 'Wrong vote! Every spy still in the game gets +{count} survival points.',
    'elim.note.noLastChance': 'This game has no last chance for the spy.',

    // ---- Modals: tie breaker
    'tie.badge': 'Tied vote!',
    'tie.note': 'So we leave it to luck... 🍀',
    'tie.continue': 'Continue ⏭️',
    'tie.wheel.title': 'Wheel of luck 🎡',
    'tie.announce': 'Votes for {names} are tied',
    'tie.winner': '🎯 {name} was picked!',

    // ---- Accessibility labels
    'a11y.infoButton': 'About this option',

    // ---- Help texts shown by the (i) buttons
    'info.detective.title': '🔍 Detective role',
    'info.detective.text': 'The detective is a citizen who knows more than the rest. Once per round, they can secretly check one player’s identity to find out whether that player is a spy or an innocent citizen.',
    'info.knownSpies.title': '🕵️ Fellow spies',
    'info.knownSpies.text': 'In games with more than 1 spy, turning this on lets every spy see the other spies’ names on their card, so they can team up.',
    'info.fool.title': '👤 Decoy role',
    'info.fool.text': 'A decoy thinks they’re an ordinary citizen, but the word on their card is slightly different from everyone else’s (say, Clinic instead of Hospital)! That mismatch makes them look suspicious by accident.',
    'info.director.title': '🎯 Turn director',
    'info.director.text': 'While you talk, the game decides who should ask whom, so the conversation keeps flowing with no awkward silences.',
    'info.oneword.title': '⚡ One-word rule',
    'info.oneword.text': 'Players may answer every question with exactly one word. Talking in long sentences counts as a foul.',
    'info.quests.title': '🎯 Side quests',
    'info.quests.text': 'On top of their main role, each player gets a secret, funny challenge to act out. Pulling it off can make them look suspicious to the others.',
    'info.wager.title': '🎲 Wagers & scoring',
    'info.wager.text': 'How scoring works:\n• Citizens win a round: +2 points for every citizen\n• Spies win a round: +2 points for every spy (except a spy who guessed the word right, who gets only the guess points)\n• Innocent citizen voted out: +1 survival point for every spy still in the game\n• Spy guesses the secret word: the round ends in the spies’ favor, and the guesser gets points by word difficulty (easy 1, medium 2, hard 3; custom words 2).\n\nHow wagers work:\nWhen a vote picks a suspect, players who have points can wager some of them that the suspect is a spy. If the suspect really is a spy, you win the same amount as your wager (a 2x payout: your stake back plus the same again). If the suspect is an innocent citizen, you lose your wager.',
    'info.sudden.title': '🔥 Sudden death',
    'info.sudden.text': 'If the citizens vote out an innocent citizen by mistake, the round ends on the spot and the spies win.',
    'info.spyLastChance.title': '🎯 Spy’s last chance',
    'info.spyLastChance.text': 'When on (default), a spy who gets caught by a vote has one last chance: say the secret word out loud to the group. If it’s right, the spies win the round. If it’s wrong, or the spy passes, the game goes on as usual (in a one-spy game, the citizens win). When off, classic rules apply: a caught spy gets no final guess.',
    'info.voteLimit.title': '🚨 Alarm limit',
    'info.voteLimit.text': 'Caps how many times players can sound the alarm, which stops the discussion timer and forces an early vote.',
    'info.roleRevealConfirm.title': '🔒 Role hand-over gate',
    'info.roleRevealConfirm.text': 'When on (default), a hand-over screen appears before each player’s role card, so you know the phone is really in that player’s hands. When off, tapping a player’s name shows their role card right away, with no extra step. That’s faster, but it’s easier for someone else to catch a glimpse of the card.',
    'info.voteConfirm.title': '🗳️ Vote confirmation',
    'info.voteConfirm.text': 'When on, a confirmation pops up before each vote is final, so you can double-check your pick. When off (default), tapping a suspect’s name records the vote right away.',
    'info.quickVoting.title': '⚡ Quick voting',
    'info.quickVoting.text': 'Normally, before showing the voting options to each player, the game asks them to take the phone and say they’re ready. Quick voting skips that step: as soon as it’s a player’s turn, the voting screen shows up right away. Note: this is separate from “Vote confirmation”, which is the final confirmation message after you pick a suspect.',
    'info.hintTypes.title': '🕵️ What’s a spy hint?',
    'info.hintTypes.text': 'Instead of the secret word, the spy sees one of these hints:\n• Related word: a word close to the secret word\n• Category name: just the word’s general category\n• First letter: only the first letter of the secret word\n• No hint: the hardest mode, no clue at all\n\nYou can turn on several at once. Each round picks one of the active hints at random.'
};
