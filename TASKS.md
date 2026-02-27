Identifier weaponSlot has already been declared at gameEngine.js 1695

window.startGameCore is not a function at main 182

within the /audio/ folder I've added /dialogue/ as a sub folder. I've added two audio files in there. They should be played when the relevant dialogue line appears on screen. the name of the audio file (everything before .wav) matches the description in dialogue.js, i.e. arena\_victory goes with     'arena\_victory': {speaker: 'Arena Announcer'    mood: 'impressed',        dialogue: "We have a winner! Clean up the mess and bring them back to the lobby!"    }.

I've also added /audio/effects/, and put parry.wav and parry2.wav in there. Whenever an entity successfully parries an attack, play one of these two sounds (flip a coin each time)

