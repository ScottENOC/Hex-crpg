With flying units, we should avoid people wasting timePoints. If the player clicks to do a melee attack while flying, don't make it use the timePoints but miss. Just tell the player they can't do melee attacks while flying. Also, have the ai decide something else to do. If they can attack someone else, they should do so, otherwise, move towards favourable terrain or away from the flyer.

Also, make sure this works with two flying entities. If both are flying, they should be able to melee attack each other (overriding both the rule that you can't melee attack or be attacked).

Any unit that gains flying (such as by me using the cheap button) should gain the action to toggle between flying and landing. This should cost 1 timepoint to use. Also, our ai needs a way to decide when to use that. Our eagle is basically a non combatant, for visibility. It should always be flying. It's ai behaviour should be to fly around scouting - prioritising getting to a spot it can bring visibility to tiles we currently cannot see, particularly focussed on tiles the longer it has been since we have been able to see them. And especially, if there was an enemy entity that we could previously see, that we can no longer see, trying to find this enemy.

Also, enemies shouldn't 'aggro' if they see an eagle. They have no reason to assume it's a summoned eagle scouting on behalf of a druid. it's just a bird as far as they know.

When selecting which tiles to highlight red (indicating that we can attack that tile), we should take into account flying. ie if we have a melee weapon, don't select a tile as red if flying rules would prevent us from attacking it

Our enemy entities display a red dot in the hex. Please remove this.

There's still references to Paladin in the game. You can select a level in paladin from 2nd level onwards, but not at initial character creation.

Also if you select see all skills, then you can see a paladin skill tree - remove this please.

I think selecting 'see all skills' hides your own racial tree. Lets just show ALL skill trees and skills including racial.

Elf skill tree doesn't have any skills. Lets add a skill to make elves see better in low light conditions. I'm not 100% sure how our lighting system works, but this should both reduce the impac of por lighting on how many hexes away they can see, and reduce the penalty for finding stealthed creatures based on low light

Add an auto save function. This should save to a new save file. Auto save should be undertaken every time you leave combat. You should be able to load this save  via the 'load game' button.

Lets include an iron man feature. his should be optional for scenario 2 and 3, but mandatory for scenario 1. Add a button to allow selection of this for scenarios 2 and 3 and demonstrate it is on for scenario 1. Iron man mode disables auto save, and means that any time you save or quick save, it returns you to the title screen and deletes all other save files related to this run. Iron man should be set on a save game by save game basis. So, I create a character called Bob on ironman. If I save Bob's game, it returns me to the title screen. I then start a game as Terry, and save it. It doesn't return me to the title screen. I then load Bob's game, kill an enemy and then save. This should delete my first Bob save and return me to the title screen. It shouldn't delete my save file as Terry

