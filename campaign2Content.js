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
        name: 'Wick Hallow',
        title: 'Storekeeper',
        race: 'human', gender: 'male',
        classLevels: ['fighter'],
        skillPicks: ['health'],
        equipment: [],
        side: 'neutral',
        factionId: 'silverhart_kingdom',
        color: '#a67c4e',
        dialogueId: 'wick_hallow'
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
        dialogueId: 'dray_coltayne',
        expValue: 300, gold: 15
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
        color: '#8c4b4b',
        expValue: 150, gold: 10
    },
    {
        name: 'Hask Greel',
        title: 'Ironbond Enforcer',
        race: 'human', gender: 'male',
        classLevels: ['fighter', 'fighter'],
        skillPicks: ['health', 'axe_hit', 'axe_dmg'],
        equipment: ['axe', 'light_armor'],
        side: 'neutral',
        expValue: 150, gold: 10,
        factionId: 'ironbond_company',
        color: '#8c4b4b'
    }
];

// Background patrons rounding out the room. Yvette carries a breadcrumb for
// the borderlands/orc-raider thread (see npcDialogueTrees.yvette_marlow) —
// not a quest yet, just a reason to look north eventually.
window.campaign2BackgroundPatrons = [
    { name: 'Yvette Marlow', title: 'Tavern Patron', race: 'human', gender: 'female', color: '#cfa8d8', dialogueId: 'yvette_marlow' },
    { name: 'Hendra Wells', title: 'Worried Mother', race: 'human', gender: 'female', color: '#c9a06a', dialogueId: 'hendra_wells' },
    { name: 'Tavern Patron', title: 'Tavern Patron', race: 'human', gender: 'male', color: '#cfcf8a' }
];

// Tam Wells, Hendra's son — not placed in the world at scene setup; spawned
// dynamically out along the west road once the "missing_child" quest's
// wilderness encounter triggers (see campaign2Dialogue.js).
window.campaign2Tam = { name: 'Tam Wells', title: 'Village Boy', race: 'human', gender: 'male', color: '#e0c080' };

// Ironbond Company investigator, sent weeks after the tavern brawl to ask
// around about the three men who never reported back. Not placed at scene
// setup — spawned into the tavern by triggerGuildInvestigatorEncounter()
// once enough in-game time has passed (see campaign2Dialogue.js).
window.campaign2GuildInvestigator = {
    name: 'Renn Ashby', title: 'Ironbond Company Investigator',
    race: 'human', gender: 'female',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: [],
    side: 'neutral', factionId: 'ironbond_company', color: '#7d8fa8',
    dialogueId: 'guild_investigator'
};

// Old Mac, out at the farmstead the south road leads to (past the border of
// this world hex). Placed by buildFarmstead() in campaign2World.js.
window.campaign2OldMac = {
    name: 'Old Mac',
    title: 'Farmer',
    race: 'human', gender: 'male',
    classLevels: ['fighter'],
    skillPicks: ['health'],
    equipment: ['club'],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#7a8c5a',
    dialogueId: 'old_mac'
};

// --- Reddale: the east road's small town. Bigger than Millbrook/Emberlode's
// single-building stubs — a guardhouse, a Reeve's house (the town's ranking
// authority, same idea as Hollowmere's off-map Baron but present in person
// here), and an inn. See buildReddale in campaign2World.js.
window.campaign2ReddaleCaptain = {
    name: 'Captain Ilsa Rennick',
    title: 'Captain of the Watch',
    race: 'human', gender: 'female',
    classLevels: ['fighter', 'fighter'],
    skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training', 'shield_proficiency'],
    equipment: ['sword', 'wooden_shield', 'heavy_armor'],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#4a5a7a',
    dialogueId: 'reddale_captain'
};
window.campaign2ReddaleGuard = {
    name: 'Watchman Bram Oswick',
    title: 'Town Guard',
    race: 'human', gender: 'male',
    classLevels: ['fighter'],
    skillPicks: ['health', 'spear_hit', 'spear_dmg', 'light_armor_training'],
    equipment: ['spear', 'light_armor'],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#5a6a8a',
    dialogueId: 'reddale_guard'
};
window.campaign2ReddaleReeve = {
    name: 'Reeve Aldous Finch',
    title: 'Reeve of Reddale',
    race: 'human', gender: 'male',
    classLevels: [],
    skillPicks: [],
    equipment: [],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#8a7a4a',
    dialogueId: 'reddale_reeve'
};
window.campaign2ReddaleInnkeeper = {
    name: 'Nella Brook',
    title: 'Innkeeper',
    race: 'human', gender: 'female',
    classLevels: [],
    skillPicks: [],
    equipment: [],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#a0724a',
    dialogueId: 'reddale_innkeeper'
};

// --- The Skarn-tooth goblin tribe, camped a long way west (see
// buildGoblinCamp in campaign2World.js — placed at the very end of the west
// road, at this world hex's border). Built from monsters.js's goblin/
// elite_goblin templates via window.createMonster (not buildNPC — goblins
// aren't a playable race with a raceData attribute pool), with custom
// skills/equipment layered on to distinguish the named elites from rank-
// and-file guards. All start side:'neutral' — the player can assault, sneak,
// or negotiate; nothing is hostile until the player (or a quest branch)
// makes it so.
window.campaign2GoblinChief = {
    name: 'Chief Skarnub', title: 'Goblin Chief', monsterType: 'elite_goblin',
    customSkills: { health: 3, sword_hit: 2, sword_dmg: 2, sword_parry: 1, stealth_rogue: 1 },
    customEquipment: ['sword', 'medium_armor', 'wooden_shield'],
    dialogueId: 'chief_skarnub'
};
window.campaign2GoblinLieutenant = {
    // Wants the tribe to move on rather than keep pressing its luck this
    // close to a human village — the one who can broker a peaceful
    // departure if the chief is removed (see the stealth/assassination path).
    name: 'Nix Sharpear', title: 'Goblin Lieutenant', monsterType: 'elite_goblin',
    customSkills: { health: 1, dagger_hit: 2, stealth_rogue: 2, stealth_agility: 1 },
    customEquipment: ['dagger', 'light_armor'],
    dialogueId: 'nix_sharpear'
};
window.campaign2GoblinShaman = {
    name: 'Gralk the Bonecaster', title: 'Goblin Shaman', monsterType: 'elite_goblin',
    customSkills: { health: 2, learn_heal: 1, club_hit: 1 },
    customEquipment: ['club'],
    dialogueId: null
};
window.campaign2GoblinGuards = [
    { name: 'Goblin Warrior', title: 'Goblin Warrior', monsterType: 'goblin', customSkills: { health: 1, sword_hit: 1, sword_dmg: 1 }, customEquipment: ['sword'] },
    { name: 'Goblin Warrior', title: 'Goblin Warrior', monsterType: 'goblin', customSkills: { health: 1, spear_hit: 1, spear_dmg: 1 }, customEquipment: ['spear'] },
    { name: 'Goblin Skulker', title: 'Goblin Skulker', monsterType: 'goblin', customSkills: { health: 1, dagger_hit: 1, stealth_rogue: 2 }, customEquipment: ['dagger'] }
];

// Ser Aldric Thorne: a captive paladin, tied up at the goblin camp, rescued
// by whichever resolution path the player takes. Built like Wren Talbot
// (createCharacterData + manual skill purchase, real window.party member) —
// not via buildNPC/createMonster, since he's a companion, not an NPC/enemy.
// Level-1 fighter + level-1 cleric (his class bonuses are combined into one
// attribute pool in campaign2World.js's buildGoblinCamp/rescue logic).
window.campaign2Paladin = { name: 'Ser Aldric Thorne', title: 'Wandering Paladin', race: 'human', gender: 'male', color: '#d4c9a8', voice: 'pc_1' };

// The abandoned house partway up the north road: three skeletons left
// behind, positioned around the journal at its center (offsets relative to
// buildAbandonedHouse's house center).
window.campaign2AbandonedHouseSkeletons = [
    { q: -1, r: -1 }, { q: 1, r: -1 }, { q: 0, r: 1 }
];

// Millbrook, three world hexes north — a minimal stub for now.
window.campaign2MillbrookVillager = {
    name: 'Petra Hollis', title: 'Millbrook Villager', race: 'human', gender: 'female',
    classLevels: ['rogue'], skillPicks: ['health'], equipment: [],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#a8c8d8',
    dialogueId: 'petra_hollis'
};

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

// Hollowmere's general store: soldier-tier gear at the same prices as the
// roguelike (equipment.js's buyPrice is shared, not duplicated here), but
// with limited stock — a village store, not an unlimited armory. Heavier
// pieces (medium armor, the helm) are scarcer than basic weapons.
window.hollowmereStoreItems = ['club', 'sword', 'axe', 'spear', 'dagger', 'light_armor', 'medium_armor', 'wooden_shield', 'nasal_helm', 'torch', 'potion_health', 'pickaxe'];
window.hollowmereStoreStock = {
    club: 3, sword: 2, axe: 2, spear: 2, dagger: 3,
    light_armor: 2, medium_armor: 1, wooden_shield: 2, nasal_helm: 1,
    torch: 5, potion_health: 4, pickaxe: 2
};

// Emberlode: a mining settlement two world-hexes west of Hollowmere, past
// the Skarn-tooth goblin camp on the same road. Placed by buildEmberlode()
// in campaign2World.js; dialogue branches on the goblin_threat quest's
// resolution state (see campaign2Dialogue.js).
window.campaign2EmberlodeForeman = {
    name: 'Corran Vale', title: 'Foreman of Emberlode',
    race: 'human', gender: 'male',
    classLevels: ['fighter'], skillPicks: ['health', 'sword_hit'], equipment: ['sword', 'light_armor'],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#8a6d4a',
    dialogueId: 'corran_vale'
};
window.campaign2EmberlodeMiner = {
    name: 'Bettina Marrow', title: 'Miner',
    race: 'dwarf', gender: 'female',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: ['club'],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a5a',
    dialogueId: 'emberlode_miner'
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
    color: '#4444aa',
    dialogueId: 'reddale_baron'
};

// --- Reddale's merchants guild vs the Baron: a quiet standoff over tariffs
// and trade rights, resolved through espionage side-quests once one side
// trusts the player enough to ask them to spy on the other (see
// espionageQuests.js and campaign2Dialogue.js's reddale_baron/
// reddale_guildmaster trees). The Baron himself is physically placed here
// in Reddale (his barony's real seat of power), not in Hollowmere — see
// buildReddale in campaign2World.js, which pushes the existing
// window.regionalNPCs.baron entity into the world instead of building a
// second, duplicate Baron.
window.campaign2ReddaleGuildmaster = {
    name: 'Guildmaster Petra Voss',
    title: 'Guildmaster',
    race: 'human', gender: 'female',
    classLevels: ['fighter'],
    skillPicks: ['health'],
    equipment: ['club'],
    side: 'neutral',
    factionId: 'merchants_guild',
    color: '#4a7a5a',
    dialogueId: 'reddale_guildmaster'
};
window.campaign2ReddaleGuildGuard = {
    name: 'Guild Watchman Corley',
    title: 'Guild Watchman',
    race: 'human', gender: 'male',
    classLevels: ['fighter'],
    skillPicks: ['health'],
    equipment: ['club', 'light_armor'],
    side: 'neutral',
    factionId: 'merchants_guild',
    color: '#3a5a4a'
};
// A consequence of successfully spying on the guild for the Baron (see
// espionageQuests.js's checkGuildAssassinTrigger/checkGuildAssassinTail):
// once merchants_guild's standing craters, they send someone after the
// player directly. Bow-armed on purpose — long range, so the ambush isn't
// just another melee mob once it reveals itself.
window.campaign2GuildAssassin = {
    name: 'Guild Assassin',
    title: 'Hired Blade',
    race: 'human', gender: 'female',
    classLevels: ['fighter', 'fighter'],
    skillPicks: ['health', 'health'],
    equipment: ['bow', 'light_armor'],
    side: 'neutral',
    factionId: 'merchants_guild',
    color: '#222222'
};
window.campaign2ReddaleBaronSteward = {
    name: 'Steward Halvard Greer',
    title: "Baron's Steward",
    race: 'human', gender: 'male',
    classLevels: ['fighter'],
    skillPicks: ['health'],
    equipment: ['sword', 'light_armor'],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#333366',
    dialogueId: 'reddale_steward'
};
