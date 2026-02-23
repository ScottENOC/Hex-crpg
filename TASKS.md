Sleep still does nothing. It should get all friendly characters and hit the wait button.

We have added a skill 'sword of arrow defelction proficiency. This sword is a magic item, built on the base item sword. It should behave exactly like a sword, except as changed by the magic item (allowing the parry skill to effect missile attacks). THis means there should be no specific proficiency for it. It is effected by skills just like any sword. Similarly, unless I provide you with a specific image file to use for a magic item, then just draw upon the default image for the base version (i.e. use sword.png for the sword of arrow deflection

When we enter into the arena fight, it takes us down to 0 timePoints. Actually, don't bother with that. it resets us to 0 when we see an enemy, so we don't need the extra set to 0 when starting the arena.

At some points it shows me having 34.00000000000000000003 health. How are we at a non integer value? Definitely don't ever show a non integer value, even though we may be able to have non integer. Maybe always round up in the display, so if you have 0.01 health you show as 1 and it makes sense you're still alive

The text for sword parry mastery shows 10% success chance, learnable 3 times. Lets drop that to 5% success and learnable twice.

I think something weird was happening when I fought a spear equipped orc. I couldn't move next to it. To clarify, if the orc has the spear skill that stops your opponents turn when they move next to you, they should successfully move next to you, use the timePoints to do so, and then end your turn.

Shield currently has two equip buttons - equip and equip off hand. SHields can only be used in off hand.

It doesn't look like my off hand weapon gets painted to the screen. For an off hand weapon, we want to flip it vertically (both flipping the image itself, and flipping it's location within the hex.
The nasalhelm.png needs to be a little bit further left (just like 3 pixels). Also make it bigger, and a bit lower

