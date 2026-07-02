// campaign2Content.js
// Static NPC roster specs for the Hollowmere opening (Campaign 2). Consumed
// by campaign2World.js via window.buildNPC (npcBuilder.js).
//
// Skill picks are kept shallow (rank-1 hit/dmg, a couple ranks of health) —
// these are minor NPCs, not boss-tier monsters, and sword_parry is the only
// skill here that sits behind a prerequisite (sword_dmg), which is included
// before it so the purchase order resolves correctly.

window.campaign2Npcs = [
    {
        name: 'Garrick Holt',
        title: 'Tavern Keeper',
        race: 'human', gender: 'male',
        classLevels: ['fighter'],
        skillPicks: ['health', 'club_hit', 'club_dmg'],
        equipment: ['club'],
        side: 'neutral',
        factionId: 'silverhart_kingdom',
        color: '#c69b6d',
        dialogueId: 'garrick_holt'
    },
    {
        name: 'Mira Ashbrook',
        title: 'Tavern Patron',
        race: 'human', gender: 'female',
        classLevels: ['rogue'],
        skillPicks: ['health', 'dagger_hit', 'stealth_agility'],
        equipment: ['dagger'],
        side: 'neutral',
        factionId: 'silverhart_kingdom',
        color: '#a8d8b9',
        dialogueId: 'mira_ashbrook'
    },
    {
        name: 'Oskar Vinn',
        title: 'Tavern Patron',
        race: 'human', gender: 'male',
        classLevels: ['fighter'],
        skillPicks: ['health', 'sword_hit', 'sword_dmg'],
        equipment: ['sword'],
        side: 'neutral',
        factionId: 'silverhart_kingdom',
        color: '#8aa9c6',
        dialogueId: 'oskar_vinn'
    },
    {
        name: 'Dray Coltayne',
        title: 'Ironbond Sergeant',
        race: 'human', gender: 'male',
        classLevels: ['fighter', 'fighter', 'fighter'],
        skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'sword_parry'],
        equipment: ['sword', 'medium_armor', 'wooden_shield'],
        side: 'neutral',
        factionId: 'ironbond_company',
        color: '#7a1f1f',
        dialogueId: 'dray_coltayne'
    },
    {
        name: 'Tomlin Brask',
        title: 'Ironbond Enforcer',
        race: 'human', gender: 'male',
        classLevels: ['fighter', 'fighter'],
        skillPicks: ['health', 'spear_hit', 'spear_dmg'],
        equipment: ['spear', 'light_armor'],
        side: 'neutral',
        factionId: 'ironbond_company',
        color: '#8c4b4b'
    },
    {
        name: 'Hask Greel',
        title: 'Ironbond Enforcer',
        race: 'human', gender: 'male',
        classLevels: ['fighter', 'fighter'],
        skillPicks: ['health', 'axe_hit', 'axe_dmg'],
        equipment: ['axe', 'light_armor'],
        side: 'neutral',
        factionId: 'ironbond_company',
        color: '#8c4b4b'
    }
];

// Background patrons rounding out the room. Yvette carries a breadcrumb for
// the borderlands/orc-raider thread (see npcDialogueTrees.yvette_marlow) —
// not a quest yet, just a reason to look north eventually.
window.campaign2BackgroundPatrons = [
    { name: 'Yvette Marlow', title: 'Tavern Patron', race: 'human', gender: 'female', color: '#cfa8d8', dialogueId: 'yvette_marlow' },
    { name: 'Tavern Patron', title: 'Tavern Patron', race: 'human', gender: 'male', color: '#cfcf8a' }
];

// The feudal chain of authority above Hollowmere's residents. The elder is
// placed in the village (the House building); the baron rules the barony
// Hollowmere sits in and isn't physically present yet — a reputation-only
// NPC for now, a natural next step being to actually build his holding.
window.campaign2Elder = {
    name: 'Elder Marta Wynfield',
    title: 'Village Elder',
    race: 'human', gender: 'female',
    classLevels: ['cleric'],
    skillPicks: ['health'],
    equipment: [],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#cccc99',
    dialogueId: 'marta_wynfield'
};

window.campaign2Baron = {
    name: 'Baron Corwin Aldervale',
    title: 'Baron of Aldervale',
    race: 'human', gender: 'male',
    classLevels: ['fighter', 'fighter'],
    skillPicks: ['health', 'sword_hit', 'sword_dmg'],
    equipment: ['sword', 'medium_armor'],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#4444aa'
};
