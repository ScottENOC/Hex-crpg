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
// Reddale's own smithy — previously the town had an inn, a guildhouse, and
// a manor, but nowhere to actually buy or repair gear short of a much
// longer walk back to Hollowmere or on to Silverhart.
window.campaign2ReddaleBlacksmith = {
    name: 'Torvald Anvik', title: 'Blacksmith',
    race: 'human', gender: 'male',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: ['axe', 'medium_armor'],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a4a3a',
    dialogueId: 'reddale_blacksmith'
};
window.campaign2ReddaleBlacksmithItems = ['sword', 'axe', 'spear', 'medium_armor', 'nasal_helm', 'wooden_shield'];

// A disciple of the necromancer (see the abandoned house/phylactery arc in
// campaign2World.js), hiding in plain sight in Reddale as an ordinary
// herbalist. Deliberately just another background NPC — no new building,
// see buildReddale — investigated via Knowledge: Religion, and only
// reportable to the Watch if the player actually has evidence (see
// readDiscipleNote/campaign2Dialogue.js's reddale_disciple/reddale_captain
// trees).
window.campaign2ReddaleDisciple = {
    name: 'Mirella Thorn',
    title: 'Herbalist',
    race: 'human', gender: 'female',
    classLevels: [],
    skillPicks: [],
    equipment: [],
    side: 'neutral',
    factionId: 'necromancer_cult',
    color: '#4a3a5a',
    dialogueId: 'reddale_disciple'
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
    customSkills: { health: 3, axe_hit: 2, axe_dmg: 2, stealth_rogue: 2 },
    customEquipment: ['axe', 'medium_armor', 'wooden_shield'],
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
    { name: 'Goblin Warrior', title: 'Goblin Warrior', monsterType: 'goblin', customSkills: { health: 1, sword_hit: 1, sword_dmg: 1 }, customEquipment: ['sword'], color: '#5a7a3a' },
    { name: 'Goblin Warrior', title: 'Goblin Warrior', monsterType: 'goblin', customSkills: { health: 1, spear_hit: 1, spear_dmg: 1 }, customEquipment: ['spear'], color: '#3a6a4a' },
    { name: 'Goblin Skulker', title: 'Goblin Skulker', monsterType: 'goblin', customSkills: { health: 1, bow_hit: 1, stealth_rogue: 2 }, customEquipment: ['bow'], color: '#6a5a2a' }
];

// Skarnak's Hold: the orc_raiders faction's first real settlement (see
// buildOrcStronghold, campaign2World.js) — built the same way the goblin
// camp's roster is (buildOrcNPC wraps window.createMonster('orc', ...)
// rather than the raceData/buildNPC playable-character path, since
// raceData has no 'orc' entry).
window.campaign2OrcWarlord = {
    name: 'Warlord Grukk Ironhide', title: 'Warlord of Skarnak\'s Hold', monsterType: 'orc',
    customSkills: { health: 4, meleeDamage: 3, axe_hit: 2, axe_dmg: 2, heavy_armor_training: 1 },
    customEquipment: ['axe', 'heavy_armor', 'wooden_shield'],
    color: '#7a3a1f', dialogueId: 'orc_warlord'
};
window.campaign2OrcGuards = [
    { name: 'Orc Guard', title: 'Stronghold Guard', monsterType: 'orc', customSkills: { health: 2, axe_hit: 1, axe_dmg: 1 }, customEquipment: ['axe', 'medium_armor'], color: '#8a5a2a' },
    { name: 'Orc Guard', title: 'Stronghold Guard', monsterType: 'orc', customSkills: { health: 2, spear_hit: 1, spear_dmg: 1 }, customEquipment: ['spear', 'medium_armor'], color: '#6a4a1a' },
    { name: 'Orc Skirmisher', title: 'Stronghold Skirmisher', monsterType: 'orc', customSkills: { health: 2, bow_hit: 1, bow_dmg: 1 }, customEquipment: ['bow', 'light_armor'], color: '#9a6a3a' },
    { name: 'Orc Guard', title: 'Stronghold Guard', monsterType: 'orc', customSkills: { health: 2, club_hit: 1, club_dmg: 1 }, customEquipment: ['club', 'medium_armor', 'wooden_shield'], color: '#7a5a2a' },
];
window.campaign2OrcTraderItems = ['axe', 'spear', 'club', 'medium_armor', 'wooden_shield', 'torch', 'potion_health'];

// Ser Aldric Thorne: a captive paladin, tied up at the goblin camp, rescued
// by whichever resolution path the player takes. Built like Wren Talbot
// (createCharacterData + manual skill purchase, real window.party member) —
// not via buildNPC/createMonster, since he's a companion, not an NPC/enemy.
// Level-1 fighter + level-1 cleric (his class bonuses are combined into one
// attribute pool in campaign2World.js's buildGoblinCamp/rescue logic).
window.campaign2Paladin = { name: 'Ser Aldric Thorne', title: 'Wandering Paladin', race: 'human', gender: 'male', color: '#d4c9a8', voice: 'pc_1' };

// Three small recruitment quest chains, same "placeholder Entity + real
// stats only applied at the moment of recruitment via createCharacterData"
// shape as Ser Aldric/grantStarFortCompanion (campaign2Dialogue.js) — no
// combat stats live on these specs, just enough identity to place and talk
// to them before they join.
window.campaign2ArcherCompanion = { name: 'Reyna Fletcher', title: 'Huntress', race: 'human', gender: 'female', color: '#6a4a2a', voice: 'pc_1', dialogueId: 'reyna_fletcher' };
window.campaign2WizardCompanion = { name: 'Mirabel Quill', title: 'Wandering Scholar', race: 'elf', gender: 'female', color: '#3a2a5a', voice: 'pc_1', dialogueId: 'mirabel_quill' };
window.campaign2DruidCompanion = { name: 'Fenn Oakheart', title: 'Grove Apprentice', race: 'human', gender: 'male', color: '#3a5a2a', voice: 'pc_1', dialogueId: 'fenn_oakheart' };

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

// --- Ironbond Company vs the Baron in Reddale: the same Company from the
// Hollowmere tavern shakedown, straining for influence against the
// nobility/kingdom/soldiers here too — not a separate guild. Its Reddale
// "guildhouse" is Ironbond's local seat of power, resolved through
// espionage side-quests once one side trusts the player enough to ask
// them to spy on the other (see espionageQuests.js and
// campaign2Dialogue.js's reddale_baron/reddale_guildmaster trees). The
// Baron himself is physically placed here in Reddale (his barony's real
// seat of power), not in Hollowmere — see buildReddale in
// campaign2World.js, which pushes the existing window.regionalNPCs.baron
// entity into the world instead of building a second, duplicate Baron.
window.campaign2ReddaleGuildmaster = {
    name: 'Guildmaster Petra Voss',
    title: 'Ironbond Factor',
    race: 'human', gender: 'female',
    classLevels: ['fighter'],
    skillPicks: ['health'],
    equipment: ['club'],
    side: 'neutral',
    factionId: 'ironbond_company',
    color: '#4a7a5a',
    dialogueId: 'reddale_guildmaster'
};
window.campaign2ReddaleGuildGuard = {
    name: 'Guild Watchman Corley',
    title: 'Ironbond Watchman',
    race: 'human', gender: 'male',
    classLevels: ['fighter'],
    skillPicks: ['health'],
    equipment: ['club', 'light_armor'],
    side: 'neutral',
    factionId: 'ironbond_company',
    color: '#3a5a4a'
};
// A consequence of successfully spying on Ironbond for the Baron (see
// espionageQuests.js's checkGuildAssassinTrigger/checkGuildAssassinTail):
// once ironbond_company's standing craters, they send someone after the
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
    factionId: 'ironbond_company',
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

// --- Silverhart Palace: the kingdom's capital, a full world-hex further
// north up the same road past Millbrook (see buildSilverhartPalace in
// campaign2World.js). Queen Seraphine Corrin — a different line from Baron
// Corwin Aldervale, who answers to her — holds court in the great hall,
// flanked by royal guards; more guards stand watch in the entry hall and
// barracks wing. All neutral, like every other authority-figure NPC so far.
// A real fighter, not a decorative throne-sitter — she's meant to be a
// significant, recurring character, not a flavor NPC: her dialogue reacts to
// all three of the kingdom's major threats (greenskin incursions, the
// Ironbond Company's growing influence, and the necromancer/lichdom plot),
// not just the player's raw reputation total.
window.campaign2SilverhartQueen = {
    name: 'Queen Seraphine Corrin',
    title: 'Queen of the Silverhart Kingdom',
    race: 'human', gender: 'female',
    classLevels: ['fighter', 'fighter'],
    skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training'],
    // Sword + heavy armor + a helm so she reads as a warrior-queen, not a
    // bare tunic — goldGear (applied after buildNPC, see campaign2World.js)
    // recolors this same armor/helm art gold rather than needing new assets.
    equipment: ['sword', 'heavy_armor', 'nasal_helm'],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#5a2a8a',
    dialogueId: 'silverhart_queen'
};
// One template, several named instances (same pattern as
// campaign2GoblinGuards) — a uniform royal guard, tougher than an ordinary
// town watchman since these stand in the king's own palace.
window.campaign2RoyalGuards = [
    { name: 'Royal Guard Denna', title: 'Royal Guard', race: 'human', gender: 'female', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training', 'shield_proficiency'], equipment: ['sword', 'wooden_shield', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Royal Guard Corwin', title: 'Royal Guard', race: 'human', gender: 'male', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'spear_hit', 'spear_dmg', 'heavy_armor_training', 'shield_proficiency'], equipment: ['spear', 'wooden_shield', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Royal Guard Ashe', title: 'Royal Guard', race: 'human', gender: 'male', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training'], equipment: ['sword', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Royal Guard Petra', title: 'Royal Guard', race: 'human', gender: 'female', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'spear_hit', 'spear_dmg', 'heavy_armor_training'], equipment: ['spear', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Royal Guard Osric', title: 'Royal Guard', race: 'human', gender: 'male', classLevels: ['fighter'], skillPicks: ['health', 'sword_hit', 'light_armor_training'], equipment: ['sword', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Royal Guard Isolde', title: 'Royal Guard', race: 'human', gender: 'female', classLevels: ['fighter'], skillPicks: ['health', 'spear_hit', 'light_armor_training'], equipment: ['spear', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' }
];
// Same template shape as campaign2RoyalGuards, posted along the new curtain
// wall (gatehouse + watchtowers) instead of inside the buildings — a
// walled royal seat needs visible wall guards, not just interior ones.
window.campaign2WallGuards = [
    { name: 'Wall Guard Brennan', title: 'Royal Guard', race: 'human', gender: 'male', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'spear_hit', 'spear_dmg', 'heavy_armor_training', 'shield_proficiency'], equipment: ['spear', 'wooden_shield', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Wall Guard Yara', title: 'Royal Guard', race: 'human', gender: 'female', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training', 'shield_proficiency'], equipment: ['sword', 'wooden_shield', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Wall Guard Tomas', title: 'Royal Guard', race: 'human', gender: 'male', classLevels: ['fighter'], skillPicks: ['health', 'spear_hit', 'light_armor_training'], equipment: ['spear', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Wall Guard Sela', title: 'Royal Guard', race: 'human', gender: 'female', classLevels: ['fighter'], skillPicks: ['health', 'sword_hit', 'light_armor_training'], equipment: ['sword', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Wall Guard Draven', title: 'Royal Guard', race: 'human', gender: 'male', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training'], equipment: ['sword', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' },
    { name: 'Wall Guard Ottilie', title: 'Royal Guard', race: 'human', gender: 'female', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'health', 'spear_hit', 'spear_dmg', 'heavy_armor_training'], equipment: ['spear', 'heavy_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#3a3a6a' }
];
// Hollowmere's builder — carries out build orders (see construction.js) for
// wood/stone or a flat gold price. One builder for now; a capital/Silverhart
// builder or others just need their own NPC + placement, reusing the same
// dialogueId and buildOrders registry.
window.campaign2HollowmereBuilder = {
    name: 'Tomas Wren', title: 'Builder',
    race: 'human', gender: 'male',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#8a6a3a',
    dialogueId: 'builder_tomas'
};
// A Silverhart-side builder, mirroring Tomas Wren in Hollowmere — same
// dialogueId ('builder_tomas'), since the dialogue tree reads generically
// from window.buildOrders and doesn't care which NPC is asking.
window.campaign2SilverhartBuilder = {
    name: 'Master Builder Hallis', title: 'Builder',
    race: 'dwarf', gender: 'female',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#6a5a3a',
    dialogueId: 'builder_tomas'
};

// Stands near the abandoned noble manor, grumbling about the eyesore —
// flavor establishing the manor as a known local nuisance well before the
// Queen ever offers to grant it (see the silverhart_queen dialogue tree).
window.campaign2ManorNeighbor = {
    name: 'Petra Ashfield', title: 'Concerned Resident',
    race: 'human', gender: 'female',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#7a6a5a',
    dialogueId: 'manor_neighbor'
};

// Silverhart's stable — sells horses in a short, vetted range of coat
// colors (see HORSE_COAT_PRESETS in stable.js) to anyone with Riding.
window.campaign2Stablehand = {
    name: 'Ossian Fell', title: 'Stablehand',
    race: 'human', gender: 'male',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#4a3a2a',
    dialogueId: 'silverhart_stablehand'
};

// Merchant district: the clothier (sells the new cosmetic 'clothes' slot
// items, equipment.js) and a rare-goods magic dealer (sells the existing
// named magic items — already priced well above ordinary gear, unchanged
// here, just given a real storefront).
window.campaign2Clothier = {
    name: 'Mirelle Sondhe', title: 'Clothier',
    race: 'human', gender: 'female',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#7a3a5a',
    dialogueId: 'silverhart_clothier'
};
window.campaign2ClothierItems = ['traveler_garb', 'fine_tunic', 'noble_doublet', 'scholars_robe'];

window.campaign2MagicDealer = {
    name: 'Corvin Ashe', title: 'Rare Goods Dealer',
    race: 'elf', gender: 'male',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#3a5a7a',
    dialogueId: 'silverhart_magic_dealer'
};

// Fourth Merchant Quarter storefront: ordinary adventuring gear, the same
// general-store role Wick Hallow's shop plays in Hollowmere, so the
// capital's own district doesn't skew entirely toward the pricier clothier/
// magic-dealer end.
window.campaign2SilverhartGeneralGoods = {
    name: 'Perrin Vance', title: 'General Goods',
    race: 'human', gender: 'male',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#5a4a2a',
    dialogueId: 'silverhart_general_goods'
};
window.campaign2SilverhartGeneralGoodsItems = ['club', 'sword', 'axe', 'spear', 'dagger', 'light_armor', 'medium_armor', 'wooden_shield', 'nasal_helm', 'torch', 'potion_health'];

// Ironbond's own quartermaster, placed at the Reddale guildhouse (see
// buildReddale) — the one world-signal for surfacePower that's a genuine
// mechanical gate rather than flavor: the good stock only opens up once the
// Company actually trusts the player (ironbond_company.standing), and only
// exists to sell at all once the Company's grip on the kingdom
// (surfacePower) is real enough to have anything worth selling. See
// ironbond_merchant in campaign2Dialogue.js.
window.campaign2IronbondMerchant = {
    name: 'Quartermaster Osric Vane', title: "Ironbond Quartermaster",
    race: 'human', gender: 'male',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: 'ironbond_company', color: '#7a1f1f',
    dialogueId: 'ironbond_merchant'
};
window.campaign2IronbondMerchantItems = ['sword_arrow_deflection', 'stormcaller_spear', 'nightowl_bow', 'bulwark_shield', 'moonlit_armor'];

// The Warrens' fence: a Thieves' Guild contact based in the slums outside
// the city wall, no faction-shunning gate (unlike the human merchants) —
// available to everyone, villain-path or not.
window.campaign2ThievesGuildFence = {
    name: 'Tessa Nightshade', title: 'Fence',
    race: 'human', gender: 'female',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#2a2a2a',
    dialogueId: 'thieves_guild_fence'
};
window.campaign2ThievesGuildFenceItems = ['dagger', 'light_armor', 'potion_health'];
// Better stock, unlocked once thieves_guild standing reaches full-member
// (50+, see thieves_guild_fence's dialogue gating in campaign2Dialogue.js) —
// same "prices/stock improve with standing" shape as the goblin trader once
// actually allied (campaign2Dialogue.js's chief_skarnub thread).
window.campaign2ThievesGuildFenceMemberItems = ['dagger', 'featherweight_dagger', 'light_armor', 'potion_health', 'shadowcloak'];

// Runs the guild's actual business — the one NPC who decides whether the
// player is watched, an odd-jobber, or a real member (see thieves_guildmaster
// dialogue, campaign2Dialogue.js).
window.campaign2ThievesGuildmaster = {
    name: 'Corvin Ashe', title: 'Guildmaster',
    race: 'human', gender: 'male',
    classLevels: ['rogue'], skillPicks: ['health', 'dagger_hit', 'stealth_agility'], equipment: ['dagger', 'light_armor'],
    side: 'neutral', factionId: null, color: '#3a2a4a',
    dialogueId: 'thieves_guildmaster'
};
// Marsh Dobbins: a small-time debtor in the Warrens who's been ducking the
// guild's collector for weeks. Target of the "A Favor for the Guild" quest
// (thieves_guildmaster) — the player can talk him down, shake him for the
// coin, or just take it by force; all three resolve the debt one way or
// another, so this is deliberately not a hard fail state.
window.campaign2ThievesGuildDebtor = {
    name: 'Marsh Dobbins', title: 'Debtor',
    race: 'human', gender: 'male',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: ['club'],
    side: 'neutral', factionId: null, color: '#5a4a3a',
    dialogueId: 'thieves_guild_debtor'
};
// The guild's reach outside Silverhart: a fence in each of the smaller
// settlements, sharing the same thieves_guild reputation track and the
// same thieves_guild_fence dialogue tree as Tessa in the capital — a
// branch office, not a separate operation. Each carries the fenceItems
// list Corvin's own operation uses; there's no "member" tier stock out
// here (the capital fence is the only one who gets that).
window.campaign2HollowmereGuildContact = {
    name: 'Del Ashworth', title: "Fence",
    race: 'human', gender: 'male',
    classLevels: ['rogue'], skillPicks: ['health', 'stealth_agility'], equipment: ['dagger', 'light_armor'],
    side: 'neutral', factionId: null, color: '#4a3a4a',
    dialogueId: 'thieves_guild_fence'
};
window.campaign2EmberlodeGuildContact = {
    name: 'Rennik Coalmarrow', title: "Fence",
    race: 'human', gender: 'male',
    classLevels: ['rogue'], skillPicks: ['health', 'stealth_agility'], equipment: ['dagger', 'light_armor'],
    side: 'neutral', factionId: null, color: '#4a3a4a',
    dialogueId: 'thieves_guild_fence'
};
window.campaign2ReddaleGuildContact = {
    name: 'Mira Selk', title: "Fence",
    race: 'human', gender: 'female',
    classLevels: ['rogue'], skillPicks: ['health', 'stealth_agility'], equipment: ['dagger', 'light_armor'],
    side: 'neutral', factionId: null, color: '#4a3a4a',
    dialogueId: 'thieves_guild_fence'
};
// Silas Crane: the Crown's informant on the guild's own turf. Target of
// "Blood Price" (thieves_guildmaster) — the third rung of the questline, and
// the point where helping the guild starts costing the player something
// with the Kingdom, not just goblins/Ironbond.
window.campaign2ThievesGuildInformant = {
    name: 'Silas Crane', title: 'Informant',
    race: 'human', gender: 'male',
    classLevels: ['rogue'], skillPicks: ['health', 'dagger_hit'], equipment: ['dagger', 'light_armor'],
    side: 'neutral', factionId: null, color: '#4a4a5a',
    dialogueId: 'thieves_guild_informant'
};
// The Bone Trader: the necromancer_cult's own equivalent of a general
// store, placed in the crypt/barrow rather than any human settlement — the
// villain-path player's alternative once human merchants refuse them (see
// isShunnedByHumanCommerce, factions.js). Neutral side/no factionId like
// the other shop NPCs — the gating happens in the dialogue tree, not here.
window.campaign2BoneTrader = {
    name: 'The Bone Trader', title: 'Grave-Goods Merchant',
    race: 'human', gender: 'male',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#4a4a3a',
    dialogueId: 'bone_trader'
};
window.campaign2BoneTraderItems = ['sword', 'axe', 'heavy_armor', 'nasal_helm', 'wooden_shield', 'potion_health'];

// The goblin camp's own trader, offered only once the tribe is genuinely
// allied (goblin_threat resolved as goblin_alliance) — chief_skarnub's
// dialogue tree gates it, this is just the inventory.
window.campaign2GoblinTraderItems = ['club', 'axe', 'spear', 'light_armor', 'wooden_shield', 'potion_health'];

window.campaign2MagicShopItems = [
    'sword_arrow_deflection', 'glowing_ring', 'orcbane_pendant', 'wolfward_charm',
    'undying_locket', 'silvertongue_ring', 'stormcaller_spear', 'nightowl_bow',
    'featherweight_dagger', 'bulwark_shield', 'ashenwood_club', 'travelers_cloakpin',
    'moonlit_armor', 'huntsman_helm',
];

// A political-intrigue quest giver: a noble with a personal grudge against
// the Court Wizard (see the wizard_vendetta quest, campaign2Dialogue.js).
// factionId is still silverhart_kingdom — she's a citizen of the same
// nation as the wizard, this is a personal feud, not a national one (see
// the royal_wizard dialogue tree's split between npc.reputation.standing,
// personal, and window.factions.silverhart_kingdom.standing, national).
window.campaign2NobleCorstane = {
    name: 'Lady Miriel Corstane', title: 'of House Corstane',
    race: 'human', gender: 'female',
    classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a2a4a',
    dialogueId: 'lady_corstane'
};

window.campaign2PalaceChancellor = {
    name: 'Chancellor Merric Vane',
    title: "The Queen's Chancellor",
    race: 'human', gender: 'male',
    classLevels: [],
    skillPicks: [],
    equipment: [],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#4a4a2a',
    dialogueId: 'palace_chancellor'
};
window.campaign2RoyalWizard = {
    name: 'Court Wizard Thessaly',
    title: "The Queen's Court Wizard",
    race: 'elf', gender: 'female',
    classLevels: ['wizard'],
    skillPicks: [],
    equipment: [],
    side: 'neutral',
    factionId: 'silverhart_kingdom',
    color: '#2a4a7a',
    dialogueId: 'royal_wizard'
};

// --- Diplomatic Quarter (south of the palace gate, see buildSilverhartPalace).
// Flavor-only ambassadors for now — no dedicated reputation/faction system
// for the four foreign nations (that would be a real system of its own);
// Ironbond's envoy and the Cathedral's cleric tie into factions that
// already exist (ironbond_company, and Knowledge: Religion content).
window.campaign2ElvenAmbassador = {
    name: 'Ambassador Elarion', title: 'Envoy of the Sylvan Court',
    race: 'elf', gender: 'male', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#3a7a4a', dialogueId: 'elven_ambassador'
};
window.campaign2DwarvenAmbassador = {
    name: 'Ambassador Brokk Stonehammer', title: 'Envoy of the Deepholds',
    race: 'dwarf', gender: 'male', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#7a5a2a', dialogueId: 'dwarven_ambassador'
};
window.campaign2AldenreachAmbassador = {
    name: 'Ambassador Cassia Wren', title: 'Envoy of Aldenreach',
    race: 'human', gender: 'female', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#7a2a4a', dialogueId: 'aldenreach_ambassador'
};
window.campaign2CorvaneAmbassador = {
    name: 'Ambassador Toren Aldwyn', title: 'Envoy of Corvane',
    race: 'human', gender: 'male', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#2a3a7a', dialogueId: 'corvane_ambassador'
};
window.campaign2IronbondEnvoy = {
    name: 'Factor Willem Drass', title: "The Ironbond Company's Silverhart Envoy",
    race: 'human', gender: 'male', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: 'ironbond_company', color: '#5a5a5a', dialogueId: 'ironbond_envoy'
};
window.campaign2HighCleric = {
    name: 'High Cleric Adelram', title: 'High Cleric of the Grand Cathedral',
    race: 'human', gender: 'male', classLevels: ['cleric'], skillPicks: [], equipment: [],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#c9a24f', dialogueId: 'high_cleric'
};

// A capital-city counterpart to the arena's Mercenary Recruiter (same
// customImage — a raw Entity, not built via buildNPC, so the arenamercenary
// sprite renders instead of the usual race/gender character layers). Offers
// a randomized fighter-for-hire; see addCompanionToRoster in roster.js for
// where hires land (active party if there's room, the bench otherwise).
window.campaign2MercenaryRecruiter = { name: 'Mercenary Recruiter', title: 'Sellsword Broker', dialogueId: 'silverhart_mercenary_broker' };

// The Retrainer: a full skill respec for a steep gold price (see
// resolveRespec, ui.js, and silverhart_retrainer, campaign2Dialogue.js).
// Placed right next to the Mercenary Recruiter, per the player's request.
window.campaign2Retrainer = { name: 'Old Hessa', title: 'Retrainer', race: 'dwarf', gender: 'female', dialogueId: 'silverhart_retrainer' };

// The Border War arc. Same template-array pattern as campaign2RoyalGuards —
// one shared roster, `.forEach(buildNPC)` against hardcoded hex offsets in
// campaign2World.js's buildNorthwatchFort/buildRidgeholdFort. `side: 'neutral'`
// like every other garrison NPC — these defend the fort, they don't fight
// the player.
// Every soldier fills both hands from the start (a 2-handed weapon alone,
// or a 1-handed weapon + shield) — no free-floating empty offhand. Archers
// carry a melee backup (a mix of sword and dagger) in reserve for when
// something closes to melee range — unequipped until the weapon-switching
// AI (aiProcess, gameEngine.js) actually needs it, which is why the bow is
// listed last in their equipment array: equipToMonster's "last weapon
// equipped wins the weapon slot" behavior is what leaves the bow equipped
// and the backup sitting in inventory as a reserve, not a duplicate.
window.campaign2FortSoldiers = [
    { name: 'Fort Soldier Halric', title: 'Border Soldier', race: 'human', gender: 'male', classLevels: ['fighter'], skillPicks: ['health', 'spear_hit', 'spear_dmg', 'light_armor_training'], equipment: ['spear', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a6a' },
    { name: 'Fort Soldier Wenna', title: 'Border Soldier', race: 'human', gender: 'female', classLevels: ['fighter'], skillPicks: ['health', 'bow_hit', 'bow_dmg', 'light_armor_training'], equipment: ['dagger', 'bow', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a6a' },
    { name: 'Fort Soldier Dunstan', title: 'Border Soldier', race: 'human', gender: 'male', classLevels: ['fighter'], skillPicks: ['health', 'sword_hit', 'sword_dmg', 'shield_proficiency'], equipment: ['sword', 'wooden_shield', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a6a' },
    { name: 'Fort Soldier Ysolt', title: 'Border Soldier', race: 'human', gender: 'female', classLevels: ['fighter'], skillPicks: ['health', 'bow_hit', 'bow_dmg', 'light_armor_training'], equipment: ['sword', 'bow', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a6a' },
    { name: 'Fort Soldier Bram', title: 'Border Soldier', race: 'human', gender: 'male', classLevels: ['fighter'], skillPicks: ['health', 'spear_hit', 'spear_dmg', 'light_armor_training'], equipment: ['spear', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a6a' },
    { name: 'Fort Soldier Cadha', title: 'Border Soldier', race: 'human', gender: 'female', classLevels: ['fighter'], skillPicks: ['health', 'sword_hit', 'sword_dmg', 'shield_proficiency'], equipment: ['sword', 'wooden_shield', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a6a' }
];

// The commander stationed in Northwatch's keep — quest-giver 2. Assigns the
// actual sally-out objective (destroy the siege engine), explicitly framing
// the player as an outside strike team because the garrison can't be spared.
// Starts with a bow equipped (her real combat option, matching a commander
// who directs the wall fight from range rather than wading straight in),
// but still owns a sword+shield in reserve for when it's actually her turn
// to fight up close — the weapon-switching AI (aiProcess, gameEngine.js)
// picks between them automatically. equipment lists the sword/shield
// before the bow for the same "last weapon equipped wins the main hand"
// reason the archer soldiers above do. Carries a health potion too, used
// automatically via the same AI.
window.campaign2NorthwatchCommander = {
    name: 'Commander Ysolde Hart', title: 'Garrison Commander of Northwatch',
    race: 'human', gender: 'female', classLevels: ['fighter', 'fighter'],
    skillPicks: ['health', 'health', 'bow_hit', 'bow_dmg', 'sword_hit', 'shield_proficiency', 'heavy_armor_training'],
    equipment: ['sword', 'wooden_shield', 'bow', 'heavy_armor', 'potion_health'],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#2a3a6a',
    dialogueId: 'northwatch_commander'
};

// Quest-giver 1 (the hook), placed in Millbrook — reachable well before the
// player ever gets near Northwatch, per the "breadcrumbs point the way"
// design. Not a soldier — a quartermaster passing through, not garrisoned.
window.campaign2BorderWarQuartermaster = {
    name: 'Quartermaster Rurik Voss', title: "The King's Quartermaster",
    race: 'human', gender: 'male', classLevels: ['fighter'],
    skillPicks: ['health', 'sword_hit'], equipment: ['sword', 'light_armor'],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#4a4a2a',
    dialogueId: 'border_war_quartermaster'
};

// The sally-out arena's escort skirmishers — the "not hundreds of soldiers"
// small fight the player actually plays. Built via window.createMonster
// (like every other goblin/orc, e.g. checkOrcRaiderEncounter's wilderness
// bands, gameEngine.js) rather than buildNPC, which only handles the
// player-race roster (see buildGoblinNPC, campaign2World.js, for the same
// distinction). `orc_raiders` faction, not `goblin_tribe` — this is the
// larger force the goblin scouts were reporting to (see the Border War
// context in campaign2Dialogue.js's border_war quest push).
window.campaign2SiegeEscortTypes = ['orc', 'orc', 'goblin', 'goblin', 'wolf_rider_goblin'];
window.campaign2MercenaryNamePool = ['Bram Ashford', 'Corvin Tale', 'Sela Dunmore', 'Petra Kesh', 'Thorne Vance', 'Mira Solberg'];

// The Emberwood Grove: the "someone less tied to a throne" breadcrumb from
// Thessaly's tome (readWizardTowerTome, campaign2World.js) pays off here.
// Placed off the west road, past Emberlode, discovered by exploration —
// same "hidden, unmarked location" convention as buildVampireGrave, not a
// quest-marker destination. Elder Nessa Wren wards the grove and gates the
// druid_grove questline (campaign2Dialogue.js).
window.campaign2DruidElder = {
    name: 'Elder Nessa Wren', title: 'Warden of the Emberwood Grove',
    race: 'elf', gender: 'female', classLevels: ['druid'],
    skillPicks: ['health', 'barkskin_active', 'wild_shape_adaptation'], equipment: ['club'],
    side: 'neutral', factionId: null, color: '#4f7942',
    dialogueId: 'elder_nessa_wren'
};

// --- Kragmoor, the Deepholds' one city-and-mine (see buildDwarvenKingdom,
// campaign2World.js). Real playable-race dwarf NPCs built through buildNPC
// (raceData/classData attribute pools), same as Emberlode's own dwarf miner
// — not the monster-template path goblin/orc NPCs use, since dwarf is a
// full playable race.
window.campaign2DwarfKing = {
    name: 'King Balrik Deepholm', title: 'King Under the Mountain',
    race: 'dwarf', gender: 'male',
    classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'axe_hit', 'axe_dmg', 'heavy_armor_training'],
    equipment: ['axe', 'heavy_armor', 'wooden_shield'],
    side: 'neutral', factionId: 'dwarven_kingdom', color: '#8a6d4a', goldGear: true,
    dialogueId: 'dwarf_king'
};
window.campaign2DwarfGuards = [
    { name: 'Hall Guard', title: 'Hall Guard', race: 'dwarf', gender: 'male', classLevels: ['fighter'], skillPicks: ['health', 'axe_hit'], equipment: ['axe', 'medium_armor'], side: 'neutral', factionId: 'dwarven_kingdom', color: '#6a5a4a' },
    { name: 'Hall Guard', title: 'Hall Guard', race: 'dwarf', gender: 'female', classLevels: ['fighter'], skillPicks: ['health', 'axe_dmg'], equipment: ['axe', 'medium_armor'], side: 'neutral', factionId: 'dwarven_kingdom', color: '#6a5a4a' },
];
window.campaign2DwarfForeman = {
    name: 'Foreman Dornik Coalbeard', title: 'Foreman of the Deep Mine',
    race: 'dwarf', gender: 'male',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: ['club'],
    side: 'neutral', factionId: 'dwarven_kingdom', color: '#5a5a5a',
    dialogueId: 'deepholds_foreman'
};
window.campaign2DwarfTrader = {
    name: 'Ingra Silvertongue', title: 'Keeper of the Vault',
    race: 'dwarf', gender: 'female',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: ['dagger'],
    side: 'neutral', factionId: 'dwarven_kingdom', color: '#5a4a3a',
    dialogueId: 'deepholds_trader'
};
window.campaign2DeepholdsTraderItems = ['sword', 'axe', 'medium_armor', 'heavy_armor', 'wooden_shield', 'nasal_helm'];

// Master Runesmith Thrain Emberhand, at the Runeforge (see
// buildDwarvenKingdom's runeforgeCenter, campaign2World.js). Runs the whole
// crafting questline in his own dialogue tree (deepholds_runesmith,
// campaign2Dialogue.js): trust him enough and he'll craft a runeforged item
// for you outright (window.craftWithSmith, crafting.js — no skill required
// of the player), or trust him further still and he'll teach you the craft
// yourself (window.craftAtForge, no fee, gated behind window.grantSkillRank
// giving 'runesmithing'). A dwarf PC skips the reputation gate on the
// teaching path entirely — see the dialogue's own race check.
window.campaign2DwarfRunesmith = {
    name: 'Thrain Emberhand', title: 'Master Runesmith',
    race: 'dwarf', gender: 'male',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: ['axe', 'medium_armor'],
    side: 'neutral', factionId: 'dwarven_kingdom', color: '#7a4a2a',
    dialogueId: 'deepholds_runesmith'
};

// The Lower Tunnels' infestation: what's actually gone quiet down there —
// same "reuse existing monster templates, tag them for the quest" pattern
// as barrowMinion/isOrcStrongholdTroll.
window.campaign2DeepholdsVermin = [
    { name: 'Cave Spider', monsterType: 'spider', customSkills: { health: 2 } },
    { name: 'Cave Spider', monsterType: 'spider', customSkills: { health: 2 } },
    { name: 'Broodmother', monsterType: 'spider', customSkills: { health: 6, meleeDamage: 4 } },
];

// --- Sil'thandriel, the Sylvan Court's capital (see buildElvenCapital,
// campaign2World.js, and worldMap.js's southern forest belt). The Sylvan
// Court is the same Court Ambassador Elarion has spoken for at Silverhart
// (elven_ambassador, campaign2Dialogue.js) since before this capital
// existed in the world — Queen Aelwen is the "the Queen" his own dialogue
// already references.
window.campaign2ElfQueen = {
    name: "Queen Aelwen Sil'thandriel", title: 'Queen of the Silver Leaf',
    race: 'elf', gender: 'female',
    classLevels: ['wizard', 'wizard'], skillPicks: [], equipment: [],
    side: 'neutral', factionId: 'elven_realm', color: '#2e7d4f',
    dialogueId: 'elf_queen'
};
window.campaign2ElfGuards = [
    { name: 'Sentinel Ilyndra', title: 'Silverleaf Sentinel', race: 'elf', gender: 'female', classLevels: ['fighter', 'fighter'], skillPicks: ['health'], equipment: ['sword', 'medium_armor'], side: 'neutral', factionId: 'elven_realm', color: '#3a7a4a' },
    { name: 'Sentinel Thaeril', title: 'Silverleaf Sentinel', race: 'elf', gender: 'male', classLevels: ['fighter', 'fighter'], skillPicks: ['health'], equipment: ['sword', 'medium_armor'], side: 'neutral', factionId: 'elven_realm', color: '#3a7a4a' },
];
window.campaign2ElfArchivist = {
    name: 'Loremaster Faelan', title: 'Keeper of the Silverleaf Archive',
    race: 'elf', gender: 'male',
    classLevels: ['wizard'], skillPicks: [], equipment: [],
    side: 'neutral', factionId: 'elven_realm', color: '#3a7a4a',
    dialogueId: 'elf_archivist'
};
window.campaign2ElfHealer = {
    name: 'Healer Sylwen', title: 'Warden of the Sickbed',
    race: 'elf', gender: 'female',
    classLevels: ['druid'], skillPicks: [], equipment: [],
    side: 'neutral', factionId: 'elven_realm', color: '#3a7a4a',
    dialogueId: 'elf_healer'
};

// --- Silverhart Commons: a tavern + market square north of the palace —
// previously the one wedge of the walled city with nothing built in it at
// all (Merchant/Noble hug the west/east walls, the Diplomatic Quarter and
// Warrens sit south of the gate). Same "populate the city out to its own
// walls" pass that added the scattered outlying houses further out. ---
window.campaign2SilverhartInnkeeper = {
    name: 'Hollis Vane', title: 'Innkeeper',
    race: 'human', gender: 'male',
    classLevels: ['fighter'], skillPicks: ['health'], equipment: [],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#6a4a2a',
    dialogueId: 'silverhart_innkeeper'
};
// Watch Sergeant Bell: the city's ordinary law, distinct from the palace's
// own royal guards (those are the Queen's personal garrison, not street
// patrol) — reacts to isShunnedByHumanCommerce the same way the merchants
// do, and points the player at the bounty board's cutpurse problem.
window.campaign2SilverhartWatchSergeant = {
    name: 'Sergeant Bell', title: 'City Watch',
    race: 'human', gender: 'female',
    classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'sword_hit'], equipment: ['sword', 'medium_armor', 'nasal_helm'],
    side: 'neutral', factionId: 'silverhart_kingdom', color: '#4a4a6a',
    dialogueId: 'silverhart_watch_sergeant'
};
// Nix the Cutpurse: the bounty board's target and the Commons' own "some
// fights" — an ordinary street bandit, not tied to any faction or quest
// chain beyond the flat bounty payout on the board itself.
window.campaign2SilverhartCutpurse = {
    name: 'Nix the Cutpurse', title: 'Wanted: Thief',
    race: 'human', gender: 'male',
    classLevels: ['rogue', 'rogue'], skillPicks: ['health', 'dagger_hit', 'stealth_agility'], equipment: ['dagger', 'light_armor'],
    side: 'enemy', factionId: null, color: '#3a2a3a'
};
// Three scattered outlying houses further out toward the city wall —
// simple flavor NPCs, no quest logic, just making the huge empty ring
// between the middle-ring houses and the wall itself feel lived-in.
window.campaign2SilverhartOutlyingResident1 = {
    name: 'Osric Fenn', title: 'Resident',
    race: 'human', gender: 'male', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#5a5a4a', dialogueId: 'silverhart_outlying_resident_1'
};
window.campaign2SilverhartOutlyingResident2 = {
    name: 'Greta Aldwyn', title: 'Resident',
    race: 'human', gender: 'female', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#5a5a4a', dialogueId: 'silverhart_outlying_resident_2'
};
window.campaign2SilverhartOutlyingResident3 = {
    name: 'Tomlin Reed', title: 'Resident',
    race: 'human', gender: 'male', classLevels: [], skillPicks: [], equipment: [],
    side: 'neutral', factionId: null, color: '#5a5a4a', dialogueId: 'silverhart_outlying_resident_3'
};
