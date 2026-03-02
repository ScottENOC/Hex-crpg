// dialogue.js
const dialogueData = {
    'arena_lobby_1': {
        speaker: 'Arena Announcer',
        mood: 'impatient',
        dialogue: "Apologies folk, our next gladiators appear to be having cold feet. They’re still shopping instead of coming out to die for your entertainment. You can boo if you like!"
    },
    'arena_lobby_2': {
        speaker: 'Arena Announcer',
        mood: 'excited',
        dialogue: "Look at them! Fresh meat for the grinder! Place your bets now!"
    },
    'arena_lobby_3': {
        speaker: 'Shopkeeper',
        mood: 'friendly',
        dialogue: "Need a sharper blade? Better armor? Don't be shy, your life depends on it!"
    },
    'arena_lobby_4': {
        speaker: 'LobbyMercenary',
        mood: 'friendly',
        dialogue: "Need a helping hand? I have contacts with an array of deadly people. You're better off fighting with them than against them."
    },
    'arena_fight_start': {
        speaker: 'Arena Announcer',
        mood: 'booming',
        dialogue: "Let the carnage begin! Only one side leaves this pit alive!"
    },
    'arena_fight_mid': {
        speaker: 'Arena Announcer',
        mood: 'bloodthirsty',
        dialogue: "I love the smell of sweat and blood in the morning! Keep it coming!"
    },
    'arena_victory': {
        speaker: 'Arena Announcer',
        mood: 'impressed',
        dialogue: "We have a winner! Clean up the mess and bring them back to the lobby!"
    },
    'arena_entrance': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "You make your way through the corridors into the arena."
    },
    'arena_indoor': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "The air grows stale and cold... you are in an indoor pit."
    },
    'arena_outdoor_night': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "The moon and stars shine down on the open arena."
    },
    'arena_outdoor_day': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "The sun shines brightly down on the open arena."
    },
    'grishnak_entry': {
        speaker: 'Arena Announcer',
        mood: 'neutral',
        dialogue: "In one corner, the crowd favourite, the ferocious champion Grishnak! In the other corner, his prey."
    }
};

window.dialogueData = dialogueData;

window.triggerAmbientDialogue = function(key) {
    const data = window.dialogueData[key];
    if (data) {
        window.showMessage(`${data.speaker} (${data.mood}): "${data.dialogue}"`);
        if (window.playDialogue) window.playDialogue(key);
    }
};
