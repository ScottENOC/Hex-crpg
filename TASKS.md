The arena mercenary is still too wide. Make them 5% less wide (height is perfect). The arena shopkeeper should be 10% less wide and tall

A while ago I told you to mirror the off hand weapon. I think you flipped it vertically, whereas I wanted it flipped horizontally. So, now, flip both please.

The dagger is too high and too far left. Move it 8% of a hex height down and right

We have arena\_entrance and arena\_fight\_start both go at the same time. I want the announcer to speak first, and then a slight pause before the narrator.

I've also added pc\_1\_enemy\_seen.wav to our /audio/dialogue'. The idea is that every player character and mercenary will have a 'voice' associated with them. This should be chooseable by the player when this entity is selected. i.e. at character creation for our main character, or when we''ve talked to the arena mercenary and are selection class and race for our hiereling. Build a button that lets the player select a voice, and then plays a random voice line from that player. So, eventually I'll add pc\_2\_enemy\_seen.wav, which will be the audio that someone with the player\_2 voice says when they see an enemy that has never been seen before. If a summoned animal sees an enemy, then the summoner should do the dialogue.

I've also added goblin\_1\_enemy\_seen. This audio should trigger if an enemy sees the players, but hasn't previously been aware of the players. We don't want people speaking over each other, so whoever sees first talks first.. When creating an enemy, assign them a voice type (at the moment, lets give orcs, trolls and goblins the goblin\_1 type, so they'll call this dialogue when the situation arises. Later on we'll create other enemy voice types and other lines for these enemy voices.

