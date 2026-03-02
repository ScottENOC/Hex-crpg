We aren't making great use of our screen real estate. There's our inventory tracker at the top, and then our menu bar. That's all fine. Then the rest of it needs work. I don't need it to say 'Hex RPG' in big letters. Kill that off. We then can move the other stuff up so there is no gap between the bottom of the menu and the top of the map. We also don't need all the details on the right: Character, Name: Edith, Race: human, Class: fighter, Level: 1 Hp: 10/0, Mana 0/0, Damage: 1, and then the word Inventory (but it doesn't actually show our inventory. Lets remove that from the right hand side.

We do want a way to see details about entities, above and beyond what we can see in the initiative tracker. But maybe this can be a popup if we need it (maybe if you click on someone's box in the initiative tracker, or you right click them in the battle map?). Lets just show a summary. Name, race, equipped items, spells effecting them, hp, mana, conditions and abilities effecting them etc.

Then, can we have the game map and side bar (which now just has our action buttons and chat log) adjust dynamically with window size. Like, the map runs from the bottom of the menu bar to the bottom of our window. And between the map and the side bar we use full width. Also ideally if our window gets too narrow, we should move the side bar out from the side. Our chat box coud move to the bottom of the screen, like in baldurs gate 1. Our action buttons could maybe be layered on top of the map (i.e. just higher on the screen than the chat bar that has been moved to the bottom of the screen. This will help set us up for small screens and eventually phones.

Can you run through all of our move gestures and adapt to also support phones. Scroll to zoom replaced with pinch to zoom. Top menu bar might need to wrap to two layers if the width is too small. Make sure any mouse hover or right click also has a phone supported option

I think elf characters are still using elfleatherarmour.png, elfchainarmour.png. They should just use humanlightarmour.png, humanmediumarmour.png, humanheavyarmour.png like the other races. 

When someone has a dagger equipped, please use sword.png but shrink it to 50% size.

I've added a bunch more audio files in /audio/dialogue. Please tie all of these to the respective dialogue triggers, I've used the consistent naming format. Please note I changed the Grishnak announcement to be from the announcer not the narrator. I also removed arena\_victory\_return from the dialogue, this is covered by arena\_victory.

The trigger for Arena\_lobby\_1 is way too early. Can we add 100 timePoints to the trigger.

Can our player start with 100 gold on a fresh run of Scenario 1.

I've added arena\_lobby\_4 to dialogue as text and a matching audio file, which should trigger when you talk to the mercenary in the Arena lobby.

During character creation, can you have the effects of our decisions race and class) visible. i.e. tell us what skills the races and classes get each level.





