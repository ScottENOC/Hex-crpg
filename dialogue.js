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
    'arena_fight_start': {
        speaker: 'Arena Announcer',
        mood: 'booming',
        dialogue: "Let the carnage begin! Only one side leaves this pit alive!"
    },
    'arena_fight_mid': {
        speaker: 'Arena Announcer',
        mood: 'bloodthirsty',
        dialogue: "I love the smell of magic and sweat in the morning! Keep it coming!"
    },
    'arena_victory': {
        speaker: 'Arena Announcer',
        mood: 'impressed',
        dialogue: "We have a winner! Clean up the mess and bring them back to the lobby!"
    }
};

window.dialogueData = dialogueData;

window.triggerAmbientDialogue = function(key) {
    const data = window.dialogueData[key];
    if (data) {
        window.showMessage(`${data.speaker} (${data.mood}): "${data.dialogue}"`);
    }
};
