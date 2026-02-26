Getting two errors; animalId has already been declared (ui.js 780) and window.updatePartyTabs is not a function (main.js?v=2;255)

I've added foliage.png to the /images/ folder, please use that. I think we have some foliage in scenario 3's map generator. Foliage should assist in stealth while not completely blocking line of sight, and it should make it harder for an entity in there to be hit, particularly by missile attacks (also, having our medium pedestal partially blocking you from an attack should also have a defensive bonus.

Please add foliage tiles to our map generation in the Arena scenario, although only on ones that are an 'outdoor' arena.

For our water tiles, we currently render it underneath everything else, as with all terrain. But for water specifically, I think it's better to layer it on top, but at 50% transparency. Lets try that.

Currently, when we head into an arena battle, it seems to be no-one's turn, in a sense. I can't move my characters, but no CPU action is going on. I have to click the 'wait' button to get everything going again. It should load into the battle as someone's turn. If theres no enemies on the screen, it's gotta be one of my party I guess.

When it's my character's turn, I can't see where I can move, until I click on the map. Can we fix that so it immediately shows move and attack options without clicking the mpa first.

When I start to cast a spell (and it's waiting for me to click a target, can we highlight valid targets. This should consider the range of the spell, valid targets (unoccupied hex for summon, any hex for something like entangle, friendly target for heal, enemy target for fireolt etc)

When I summon an animal that occupies more than 1 hex, the spell should attempt to summon the animal such that one of the animal's hexes is the one I clicked, and such that the animal does not overlap any other entity or impassible terrain. If it can't do that, it's not a valid hex to summon that animal in. So if I summon something 2 by 1 in the hex above me, it currently puts the reature in the spellcaster's hex and the hex above. But what it should do is summon it in the hex above the spellcaster, and the hex above that one (i.e. 1 higher than it currently does) to avoid overlap

The text chat log refers to teleporting into the arena. My world doesn't have that sort of teleporting. Just make it vague, but really, our characters just walk to where they need to go, or perhaps some sort of elevator mechanism lfits them into the arena.

There's also some text saying the sun (or moon) shine down on us because there's no roof. The code knows the time of day, month, and the ambient light level. Create two different texts - one for day and one for night about what is shining down on us, don't just say it could be either

