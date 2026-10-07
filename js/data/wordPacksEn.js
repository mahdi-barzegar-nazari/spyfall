/**
 * English word bank, grouped by the same category ids as the Persian one (`wordPacks.js`).
 * Each entry: word, foolWord (a close but different word a decoy player gets), hint (ONE related word
 * that nudges the spy without giving the word away), difficulty.
 *
 * This is a SEED: a few words per category, enough to play. It grows by appending entries to the
 * category arrays; nothing here is generated. Rules (checked by tests/unit/data.test.mjs):
 *  - Plain English, at most 30 characters per field, no leading article ("the", "a", "an").
 *  - `word` is unique in the whole bank (case-insensitive); `foolWord` and `hint` differ from `word`.
 *  - Every word is something all players can picture. `hard` means hard for the spy to work out from
 *    the hint (the hint fits several words), not obscure trivia.
 */

export const WORD_PACKS_EN = {
    places: [
        { word: "Hospital", foolWord: "Clinic", hint: "Doctor", diff: "easy" },
        { word: "Library", foolWord: "Bookstore", hint: "Quiet", diff: "easy" },
        { word: "Airport", foolWord: "Train station", hint: "Luggage", diff: "easy" },
        { word: "Casino", foolWord: "Arcade", hint: "Dice", diff: "medium" },
        { word: "Laundromat", foolWord: "Dry cleaner", hint: "Coins", diff: "medium" },
        { word: "Aquarium", foolWord: "Zoo", hint: "Glass", diff: "medium" },
        { word: "Observatory", foolWord: "Planetarium", hint: "Stars", diff: "hard" },
        { word: "Lighthouse", foolWord: "Windmill", hint: "Beam", diff: "hard" }
    ],
    jobs: [
        { word: "Teacher", foolWord: "Professor", hint: "Homework", diff: "easy" },
        { word: "Chef", foolWord: "Baker", hint: "Kitchen", diff: "easy" },
        { word: "Firefighter", foolWord: "Paramedic", hint: "Hose", diff: "easy" },
        { word: "Architect", foolWord: "Engineer", hint: "Blueprint", diff: "medium" },
        { word: "Photographer", foolWord: "Painter", hint: "Lens", diff: "medium" },
        { word: "Plumber", foolWord: "Electrician", hint: "Pipes", diff: "medium" },
        { word: "Judge", foolWord: "Lawyer", hint: "Robe", diff: "hard" },
        { word: "Accountant", foolWord: "Banker", hint: "Numbers", diff: "hard" }
    ],
    foods: [
        { word: "Pizza", foolWord: "Calzone", hint: "Cheese", diff: "easy" },
        { word: "Hamburger", foolWord: "Hot dog", hint: "Bun", diff: "easy" },
        { word: "Ice cream", foolWord: "Frozen yogurt", hint: "Cone", diff: "easy" },
        { word: "Pancakes", foolWord: "Waffles", hint: "Syrup", diff: "medium" },
        { word: "Sushi", foolWord: "Sashimi", hint: "Seaweed", diff: "medium" },
        { word: "Tacos", foolWord: "Burrito", hint: "Tortilla", diff: "medium" },
        { word: "Lasagna", foolWord: "Spaghetti", hint: "Layers", diff: "hard" },
        { word: "Pickles", foolWord: "Olives", hint: "Brine", diff: "hard" }
    ],
    objects: [
        { word: "Umbrella", foolWord: "Raincoat", hint: "Rain", diff: "easy" },
        { word: "Scissors", foolWord: "Knife", hint: "Paper", diff: "easy" },
        { word: "Toothbrush", foolWord: "Comb", hint: "Mint", diff: "easy" },
        { word: "Alarm clock", foolWord: "Wristwatch", hint: "Morning", diff: "medium" },
        { word: "Backpack", foolWord: "Suitcase", hint: "Straps", diff: "medium" },
        { word: "Candle", foolWord: "Lantern", hint: "Flame", diff: "medium" },
        { word: "Compass", foolWord: "Map", hint: "Needle", diff: "hard" },
        { word: "Hourglass", foolWord: "Stopwatch", hint: "Sand", diff: "hard" }
    ],
    vehicles: [
        { word: "Bicycle", foolWord: "Scooter", hint: "Pedals", diff: "easy" },
        { word: "Helicopter", foolWord: "Airplane", hint: "Blades", diff: "easy" },
        { word: "Taxi", foolWord: "Bus", hint: "Meter", diff: "easy" },
        { word: "Submarine", foolWord: "Ship", hint: "Deep", diff: "medium" },
        { word: "Ambulance", foolWord: "Fire truck", hint: "Siren", diff: "medium" },
        { word: "Cable car", foolWord: "Ski lift", hint: "Mountain", diff: "medium" },
        { word: "Tractor", foolWord: "Bulldozer", hint: "Mud", diff: "hard" },
        { word: "Hot air balloon", foolWord: "Blimp", hint: "Basket", diff: "hard" }
    ],
    animals: [
        { word: "Dog", foolWord: "Wolf", hint: "Bark", diff: "easy" },
        { word: "Elephant", foolWord: "Rhino", hint: "Trunk", diff: "easy" },
        { word: "Penguin", foolWord: "Puffin", hint: "Ice", diff: "easy" },
        { word: "Dolphin", foolWord: "Shark", hint: "Jump", diff: "medium" },
        { word: "Owl", foolWord: "Eagle", hint: "Night", diff: "medium" },
        { word: "Kangaroo", foolWord: "Wallaby", hint: "Australia", diff: "medium" },
        { word: "Chameleon", foolWord: "Gecko", hint: "Colors", diff: "hard" },
        { word: "Octopus", foolWord: "Squid", hint: "Arms", diff: "hard" }
    ],
    sports: [
        { word: "Soccer", foolWord: "Rugby", hint: "Goal", diff: "easy" },
        { word: "Basketball", foolWord: "Handball", hint: "Hoop", diff: "easy" },
        { word: "Swimming", foolWord: "Diving", hint: "Pool", diff: "easy" },
        { word: "Tennis", foolWord: "Badminton", hint: "Net", diff: "medium" },
        { word: "Boxing", foolWord: "Wrestling", hint: "Gloves", diff: "medium" },
        { word: "Skiing", foolWord: "Snowboarding", hint: "Slopes", diff: "medium" },
        { word: "Archery", foolWord: "Darts", hint: "Target", diff: "hard" },
        { word: "Bowling", foolWord: "Curling", hint: "Lane", diff: "hard" }
    ],
    events: [
        { word: "Wedding", foolWord: "Engagement party", hint: "Bride", diff: "easy" },
        { word: "Birthday party", foolWord: "Housewarming", hint: "Cake", diff: "easy" },
        { word: "Concert", foolWord: "Festival", hint: "Stage", diff: "easy" },
        { word: "Graduation", foolWord: "Award ceremony", hint: "Cap", diff: "medium" },
        { word: "Picnic", foolWord: "Barbecue", hint: "Blanket", diff: "medium" },
        { word: "Job interview", foolWord: "Exam", hint: "Resume", diff: "medium" },
        { word: "Power outage", foolWord: "Thunderstorm", hint: "Dark", diff: "hard" },
        { word: "Garage sale", foolWord: "Flea market", hint: "Bargain", diff: "hard" }
    ]
};
