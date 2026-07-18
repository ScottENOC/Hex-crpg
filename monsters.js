// monsters.js

const monsterTemplates = {
    'goblin': {
        name: 'Goblin',
        color: 'green',
        hp: 10,
        expValue: 100,
        riderSize: 2,
        tags: ['humanoid'],
        voice: 'goblin_1',
        skills: {
            'meleeDamage': 1,
            'health': 1,
            'stealth_rogue': 1
        },
        defaultEquipment: 'random'
    },
    'elite_goblin': {
        name: 'Elite Goblin',
        color: '#006400', 
        hp: 20,
        expValue: 300,
        riderSize: 2,
        tags: ['humanoid'],
        voice: 'goblin_1',
        skills: {
            'meleeDamage': 2,
            'health': 2,
            'fastMovement': 1,
            'sword_hit': 1,
            'sword_dmg': 1,
            'sword_parry': 1,
            'stealth_rogue': 1
        },
        defaultEquipment: ['sword', 'light_armor', 'wooden_shield']
    },
    'orc': {
        name: 'Orc',
        color: '#a52a2a',
        hp: 10,
        expValue: 200,
        riderSize: 3,
        tags: ['humanoid'],
        voice: 'goblin_1',
        skills: {
            'health': 3
        },
        defaultEquipment: 'savage'
    },
    // Human brigands — worldPulse.js's bandit_activity/checkBanditCampSeeding
    // (campaign2World.js) spawn these when Aldervale's security collapses.
    // Deliberately a notch tougher than a goblin (real highwaymen, not
    // wildlife) but not elite-tier — a small camp of these should be a fair
    // fight for a party actually equipped to go looking for one.
    'bandit': {
        name: 'Bandit',
        color: '#6b4a3a',
        hp: 14,
        expValue: 150,
        riderSize: 2,
        tags: ['humanoid'],
        voice: 'pc_1',
        skills: {
            'meleeDamage': 1,
            'health': 2,
            'sword_hit': 1
        },
        defaultEquipment: ['sword', 'light_armor']
    },
    // A real objective, not a combatant in the usual sense — high HP (the
    // point of the sally-out fight), no weapon, no loot. Its only "attack"
    // is the isSiegeEngine behaviorTick branch in gameEngine.js, which calls
    // window.damageWall instead of tryAttack. The ambient open-world copy
    // (buildNorthwatchFort) sets noAttack:true so it's purely cosmetic
    // there; the sally-out arena's copy leaves noAttack unset so it's the
    // real fight target.
    'siege_engine': {
        name: 'Siege Engine',
        color: '#4a3a2a',
        hp: 60,
        expValue: 400,
        canLoot: false,
        tags: ['construct'],
        voice: null,
        skills: {},
        defaultEquipment: []
    },
    'wolf': {
        name: 'Wolf',
        color: '#808080', 
        hp: 10,
        expValue: 50,
        canLoot: false,
        mountSize: 2,
        tags: ['animal'],
        visionBonus: 10,
        behaviorType: 'wander',
        skills: {
            'health': 1,
            'unarmed_hit': 1,
            'unarmed_dmg': 1,
            'fastMovement': 1,
            'timePointRate': 6,
            'keen_scent': 1,
            'quarterstaff_trip': 1 
        },
        defaultEquipment: []
    },
    'horse': {
        name: 'Horse',
        color: '#8b4513', 
        hp: 10,
        expValue: 150,
        canLoot: false,
        mountSize: 3,
        extraHexes: [{q: 0, r: 1}], 
        tags: ['animal'],
        skills: {
            'health': 4,
            'fastMovement': 2
        },
        defaultEquipment: []
    },
    'troll': {
        name: 'Troll',
        color: '#4b5320', 
        hp: 10,
        expValue: 500,
        riderSize: 6,
        extraHexes: [{q: 0, r: 1}, {q: 1, r: 0}], 
        tags: ['giant'],
        voice: 'goblin_1',
        skills: {
            'health': 5,
            'meleeDamage': 3,
            'club_hit': 1,
            'regeneration': 1
        },
        defaultEquipment: ['club']
    },
    'dragon_young': {
        name: 'Young Dragon',
        color: '#4a8c5c',
        hp: 70,
        expValue: 1500,
        riderSize: 0,
        tags: ['dragon', 'flying'],
        isFlying: true,
        dragonSizeTier: 1,
        extraHexes: [{ q: 0, r: 1 }],
        skills: { 'health': 5, 'meleeDamage': 3, 'arcane_mana': 2, 'firebolt_hit': 1, 'firebolt_dmg': 1 },
        createdSpells: [
            { name: 'Dragon Breath', baseId: 'dragon_breath', school: 'arcane', type: 'aoe_damage', manaCost: 15, tpCost: 10, magnitude: 12, range: 3, radius: 1 }
        ],
        defaultEquipment: []
    },
    'dragon_adult': {
        name: 'Adult Dragon',
        color: '#a5401f',
        hp: 160,
        expValue: 4000,
        riderSize: 0,
        tags: ['dragon', 'flying'],
        isFlying: true,
        dragonSizeTier: 2,
        extraHexes: [{ q: 0, r: 1 }, { q: 1, r: 0 }, { q: 1, r: -1 }],
        skills: { 'health': 10, 'meleeDamage': 6, 'arcane_mana': 3, 'firebolt_hit': 2, 'firebolt_dmg': 2, 'arcane_expand': 1 },
        createdSpells: [
            { name: 'Dragon Breath', baseId: 'dragon_breath', school: 'arcane', type: 'aoe_damage', manaCost: 25, tpCost: 10, magnitude: 22, range: 4, radius: 2 }
        ],
        defaultEquipment: []
    },
    'dragon_ancient': {
        name: 'Ancient Dragon',
        color: '#1c3f6e',
        hp: 320,
        expValue: 9000,
        riderSize: 0,
        tags: ['dragon', 'flying'],
        isFlying: true,
        dragonSizeTier: 3,
        extraHexes: [{ q: 0, r: 1 }, { q: 1, r: 0 }, { q: 1, r: -1 }, { q: -1, r: 1 }, { q: 0, r: -1 }],
        skills: { 'health': 18, 'meleeDamage': 10, 'arcane_mana': 4, 'firebolt_hit': 3, 'firebolt_dmg': 3, 'arcane_expand': 2, 'arcane_targets': 2 },
        createdSpells: [
            { name: 'Dragon Breath', baseId: 'dragon_breath', school: 'arcane', type: 'aoe_damage', manaCost: 35, tpCost: 10, magnitude: 35, range: 5, radius: 3 }
        ],
        defaultEquipment: []
    },
    'skeleton': {
        name: 'Skeleton',
        color: '#f5f5dc',
        hp: 12,
        expValue: 150,
        tags: ['undead'],
        skills: { 'health': 1 },
        defaultEquipment: 'random'
    },
    'zombie': {
        name: 'Zombie',
        color: '#6b8e23',
        hp: 25,
        expValue: 200,
        tags: ['undead'],
        skills: { 'health': 3, 'meleeDamage': 1 },
        defaultEquipment: []
    },
    'imp': {
        name: 'Imp',
        color: '#ff4500',
        hp: 8,
        expValue: 250,
        tags: ['demon'],
        skills: { 'firebolt_hit': 1 },
        defaultEquipment: []
    },
    'spider': {
        name: 'Spider',
        color: '#444',
        hp: 10,
        expValue: 120,
        tags: ['animal', 'spider'],
        skills: {
            'meleeDamage': 1,
            'health': 1,
            'poison_bite': 1
        },
        defaultEquipment: []
    },
    'bear': {
        name: 'Bear',
        color: '#4a3520',
        hp: 30,
        expValue: 200,
        canLoot: false,
        tags: ['animal'],
        behaviorType: 'wander',
        skills: {
            'health': 3,
            'unarmed_hit': 2,
            'unarmed_dmg': 3,
            'meleeDamage': 1
        },
        defaultEquipment: []
    },
    'ogre': {
        name: 'Ogre',
        color: '#5a6a3a',
        hp: 50,
        expValue: 450,
        riderSize: 4,
        extraHexes: [{ q: 0, r: 1 }],
        tags: ['giant'],
        skills: {
            'health': 5,
            'meleeDamage': 4,
            'club_hit': 2,
            'club_dmg': 2
        },
        defaultEquipment: ['club']
    },
    'boar': {
        name: 'Boar',
        color: '#8d6e63',
        hp: 25,
        expValue: 250,
        canLoot: false,
        mountSize: 3,
        extraHexes: [{q: 0, r: 1}],
        tags: ['animal'],
        skills: {
            'health': 3,
            'meleeDamage': 2,
            'furious_charge': 1,
            'fastMovement': 1
        },
        defaultEquipment: []
    },
    'tiger': {
        name: 'Tiger',
        color: '#ff9800',
        hp: 35,
        expValue: 400,
        canLoot: false,
        mountSize: 3,
        extraHexes: [{q: 0, r: 1}],
        tags: ['animal'],
        skills: {
            'health': 4,
            'meleeDamage': 4,
            'furious_charge': 1,
            'fastMovement': 2,
            'stealth_rogue': 2,
            'quickRecovery': 5,
            'initiativeBonus': 5
        },
        defaultEquipment: []
    },
    'eagle': {
        name: 'Eagle',
        color: '#795548',
        hp: 10,
        expValue: 100,
        canLoot: false,
        mountSize: 0,
        tags: ['animal', 'flying'],
        skills: {
            'health': 1,
            'fastMovement': 3,
            'elf_darkvision': 1
        },
        defaultEquipment: []
    },
    // Not a mount (mountSize: 0, deliberately — the druids' unicorn is a
    // Nature summon-companion, never a rideable animal, so it can't be
    // reached by riderSize checks). Only ever obtainable as the ONE
    // permanent animal companion, gated by the learn_unicorn_summon skill
    // (quest-granted only — see the druid grove questline, campaign2Dialogue.js)
    // — see the ui.js dropdown filter and resolveSpell's guard in
    // gameEngine.js, both keyed off spell.animalId === 'unicorn'.
    'unicorn': {
        name: 'Unicorn',
        color: '#f5f5f0',
        hp: 50,
        expValue: 800,
        canLoot: false,
        mountSize: 0,
        tags: ['animal', 'fey'],
        visionBonus: 15,
        skills: {
            'health': 6,
            'meleeDamage': 5,
            'furious_charge': 1,
            'fastMovement': 2,
            'quickRecovery': 5,
            'initiativeBonus': 5
        },
        defaultEquipment: []
    },
    // ── NEW MONSTERS ──────────────────────────────────────────────────────────

    'wraith': {
        name: 'Wraith',
        color: '#7b2d8b',
        hp: 22,
        expValue: 400,
        tags: ['undead', 'flying'],
        skills: {
            'health': 1,
            'meleeDamage': 2,
            'life_drain': 1,
            'spectral_form': 1,
            'fastMovement': 2,
            'timePointRate': 4
        },
        defaultEquipment: []
    },

    'basilisk': {
        name: 'Basilisk',
        color: '#6b7c2d',
        hp: 35,
        expValue: 500,
        tags: ['animal', 'reptile'],
        skills: {
            'health': 3,
            'meleeDamage': 3,
            'petrify_gaze': 1
        },
        defaultEquipment: []
    },

    'harpy': {
        name: 'Harpy',
        color: '#c97c5d',
        hp: 18,
        expValue: 350,
        tags: ['humanoid', 'flying'],
        skills: {
            'health': 1,
            'meleeDamage': 1,
            'siren_song': 1,
            'fastMovement': 1,
            'timePointRate': 3
        },
        defaultEquipment: []
    },

    'minotaur': {
        name: 'Minotaur',
        color: '#4a2c0a',
        hp: 10,
        expValue: 600,
        riderSize: 5,
        extraHexes: [{ q: 0, r: 1 }],
        tags: ['humanoid', 'giant'],
        skills: {
            'health': 5,
            'meleeDamage': 4,
            'gore_charge': 1,
            'club_hit': 1
        },
        defaultEquipment: ['club']
    },

    'revenant': {
        name: 'Revenant',
        color: '#b0c4de',
        hp: 10,
        expValue: 550,
        tags: ['undead', 'humanoid'],
        skills: {
            'health': 3,
            'meleeDamage': 2,
            'revenant_revive': 1,
            'sword_hit': 1,
            'sword_dmg': 1,
            'heavy_armor_training': 1
        },
        defaultEquipment: ['sword', 'heavy_armor']
    },

    // ──────────────────────────────────────────────────────────────────────────
    'wolf_rider_goblin': {
        name: 'Wolf Rider Goblin',
        color: '#2e8b57',
        hp: 10,
        expValue: 200,
        riderSize: 2,
        isRider: true,
        mountType: 'wolf',
        preferredTerrain: 'Bushes',
        skills: {
            'riding': 1,
            'meleeDamage': 1,
            'health': 1,
            'stealth_rogue': 1
        },
        defaultEquipment: ['bow', 'spear', 'wooden_shield']
    },

    // ──────────────────────────────────────────────────────────────────────────
    // isSkirmisher: hit-and-run — aiProcess (gameEngine.js) special-cases
    // this flag to back off one hex the moment something closes to melee
    // range, rather than standing and trading like every other ranged
    // monster, then just shoots normally once it's back out to bow range.
    // Deliberately NOT a chase-forever kiter (that's the "too annoying"
    // failure mode) — it only reacts to being adjacent, so a player who
    // closes distance in one move corners it in one more.
    'horse_archer': {
        name: 'Horse Archer',
        color: '#8a6d3b',
        hp: 12,
        expValue: 220,
        riderSize: 2,
        isRider: true,
        mountType: 'horse',
        isSkirmisher: true,
        preferredTerrain: 'Grass',
        skills: {
            'riding': 1,
            'bow_hit': 2,
            'bow_dmg': 1,
            'health': 1,
            'fastMovement': 1
        },
        defaultEquipment: ['bow']
    }
};

const arenaBosses = {
    'Grishnak': {
        base: 'orc',
        color: '#a52a2a',
        hp: 40,
        mana: 50,
        dialogue: 'grishnak_entry',
        skills: { 'arcane_mana': 2, 'firebolt_hit': 1, 'arcane_regen': 1 },
        spells: [
            { name: "Counterspell", baseId: 'counterspell', type: 'dispel', school: 'arcane', manaCost: 10, tpCost: 10, range: 8 },
            { name: "Firebolt", baseId: 'firebolt', type: 'damage', school: 'arcane', manaCost: 5, tpCost: 10, range: 10, magnitude: 8, needsHitCheck: true }
        ],
        equipment: ['light_armor']
    },
    'Sir Alistair': {
        // Built like a real hand-authored NPC (see window.buildNPC in
        // npcBuilder.js) — race + class levels -> attribute pool -> skills
        // purchased from it — rather than a flat ad hoc skills dict, since
        // he's a genuine human fighter/cleric paladin, not a reskinned orc.
        // See the boss-spawn code in gameEngine.js for where classLevels
        // triggers the buildNPC path instead of createMonster.
        race: 'human',
        color: '#ffd700',
        gender: 'male',
        hp: 50,
        mana: 30,
        expValue: 400,
        dialogue: 'alistair_entry',
        classLevels: ['fighter', 'fighter', 'cleric'],
        skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training', 'shield_proficiency', 'shield_bash', 'learn_heal', 'divine_mana', 'divine_mana'],
        spells: [
            { name: "Heal", baseId: 'heal', type: 'heal', school: 'divine', manaCost: 10, tpCost: 10, range: 5, magnitude: 15 }
        ],
        equipment: ['heavy_armor', 'sword', 'wooden_shield'],
        // A squire backing him up instead of the orc/goblin muscle every
        // other boss gets — another human, built the same way, just at a
        // lower class level.
        guardName: 'Squire Bram',
        guardTitle: 'Squire',
        guardRace: 'human',
        guardGender: 'male',
        guardClassLevels: ['fighter'],
        guardSkillPicks: ['health', 'sword_hit', 'sword_dmg', 'light_armor_training'],
        guardEquipment: ['sword', 'light_armor'],
        guardExpValue: 120
    },
    'Viper': {
        base: 'elite_goblin',
        color: '#4b0082',
        hp: 35,
        dialogue: 'viper_entry',
        skills: { 'stealth_rogue': 1, 'stealth_agility': 1, 'sneak_attack_dmg': 3, 'speedy_stealth': 1, 'dagger_hit': 1, 'dagger_dmg': 1 },
        equipment: ['light_armor', 'dagger']
    },
    'Krog the Unstoppable': {
        base: 'troll',
        color: '#2f4f4f',
        hp: 60,
        dialogue: 'krog_entry',
        skills: { 'shove': 1, 'health': 5, 'meleeDamage': 3, 'regeneration': 1, 'club_hit': 1 },
        equipment: ['club']
    },
    'Sylvara the Huntress': {
        base: 'goblin', 
        color: '#228b22',
        gender: 'female',
        hp: 30,
        mana: 40,
        dialogue: 'sylvara_entry',
        mount: 'tiger',
        skills: { 'learn_summon_animal': 1, 'learn_tiger_summon': 1, 'nature_mana': 2, 'bow_hit': 1, 'elf_bow_range': 1, 'riding': 1 },
        spells: [
            { name: "Summon Tiger", baseId: 'summon_animal', type: 'summon', school: 'nature', manaCost: 25, tpCost: 10, range: 3 }
        ],
        equipment: ['light_armor', 'bow']
    }
};

const MONSTER_CUSTOM_IMAGE_TYPES = ['elite_goblin', 'harpy', 'wraith', 'basilisk', 'minotaur'];

function createMonster(type, hex, customSkills = null, customEquipment = null, side = 'enemy') {
    const template = monsterTemplates[type] || monsterTemplates['goblin'];
    const monster = new window.Enemy(template.name, template.color, hex, 3, template.hp, template.expValue);
    monster.side = side;
    monster.canLoot = template.canLoot !== undefined ? template.canLoot : true;
    monster.riderSize = template.riderSize || 0;
    monster.mountSize = template.mountSize || 0;
    monster.tags = template.tags ? [...template.tags] : [];
    monster.voice = template.voice || null;
    monster.visionBonus = template.visionBonus || 0;
    monster.behaviorType = template.behaviorType || 'wander';
    monster.isFlying = template.isFlying || false;
    monster.dragonSizeTier = template.dragonSizeTier || 0;
    monster.isSkirmisher = template.isSkirmisher || false;

    if (template.extraHexes) monster.extraHexes = template.extraHexes;
    if (template.createdSpells) monster.createdSpells = template.createdSpells.map(s => ({ ...s }));

    // Every horse gets a random coat from the same vetted preset list a
    // stable purchase lets the player pick from (see stable.js) — random,
    // but never an arbitrary/green color, matching "random for the arena,
    // but not colour-shift to any arbitrary rgb."
    if (type === 'horse' && window.HORSE_COAT_PRESETS) {
        const keys = Object.keys(window.HORSE_COAT_PRESETS);
        monster.coatPreset = keys[Math.floor(Math.random() * keys.length)];
    }

    // Special Spider Initialization
    if (type === 'spider') {
        monster.spiderImage = Math.random() < 0.5 ? 'spider1' : 'spider2';
        monster.hasUsedWeb = false;
    }
    // One-shot ability flags
    if (type === 'basilisk') monster.hasUsedGaze = false;
    if (type === 'harpy')    monster.hasUsedSong = false;
    if (type === 'revenant') {
        monster.revenantRevived = false;
        // Race/gender so CHAR_CONFIG sprite layering works when revenantBase sprite is added
        monster.race   = 'revenant';
        monster.gender = template.gender || 'male';
    }
    if (type === 'skeleton') {
        // Same reasoning as revenant above: race/gender routes it through
        // the CHAR_CONFIG paperdoll renderer (drawPlayerCharacter,
        // gameEngine.js) instead of the flat single-image sprite, so
        // whatever weapon/armor it's equipped with (assignRandomEquipment,
        // or a hand-picked loadout) actually shows up layered on the body.
        monster.race   = 'skeleton';
        monster.gender = template.gender || 'male';
    }

    // 1. Assign Equipment First — 'random' now picks a whole combat
    // archetype (weapon + matching skill priority) rather than just a
    // weapon roll with no skills to back it up; see assignCombatBuild below.
    const equipment = customEquipment || template.defaultEquipment;
    let pendingArchetype = null;
    if (equipment === 'random' || equipment === 'savage') {
        const pool = equipment === 'savage' ? SAVAGE_ARCHETYPES : COMBAT_ARCHETYPES;
        pendingArchetype = pool[Math.floor(Math.random() * pool.length)];
        equipToMonster(monster, pendingArchetype.weapon);
        if (pendingArchetype.offhand) equipToMonster(monster, pendingArchetype.offhand, !!pendingArchetype.offhandIsWeapon);
        if (pendingArchetype.helmet) equipToMonster(monster, pendingArchetype.helmet);
    } else if (Array.isArray(equipment)) {
        equipment.forEach(itemId => equipToMonster(monster, itemId));
    }

    // 2. Assign Skills
    monster.skills = customSkills ? { ...customSkills } : { ...template.skills };
    monster.applySkills();

    // A 'random'-equipment monster spends a few skill points down its
    // archetype's ordered priority list (mostly in sequence, with a little
    // randomness) — done after applySkills() so it doesn't get clobbered by
    // the {...template.skills} reset above.
    if (pendingArchetype) spendArchetypePoints(monster, pendingArchetype, 3);

    // Auto-build a spellbook from whatever learn_<spell> skills this
    // monster ended up with (no-op if it has none). Skipped for anything
    // with a hand-authored fixed spell list already (dragons' Dragon
    // Breath, boss configs applied after createMonster returns) so this
    // never clobbers deliberately-tuned monster abilities.
    if (window.autoBuildSpellsForEntity && (!monster.createdSpells || monster.createdSpells.length === 0)) {
        window.autoBuildSpellsForEntity(monster);
    }

    // 3. Special: Rider initialization
    if (template.isRider && template.mountType) {
        const mount = createMonster(template.mountType, hex, null, null, side);
        monster.riding = mount;
        mount.rider = monster;
        // Mount should be in the entities list too
        if (window.entities) window.entities.push(mount);
    }

    monster.gold = Math.floor(Math.random() * 5) + 5;

    // Types with their own distinct art (not just the shared monsterDefault
    // fallback) get customImage set here — this is the ONE place both the
    // map sprite render and the dialogue-portrait render already check, so
    // it fixes both at once instead of needing a separate name-based branch
    // per call site. Bosses that reuse this art (createMonster(config.base,
    // ...) then renamed) explicitly delete this in the arena boss-spawn code
    // so their existing spriteBase color-tint still applies.
    if (MONSTER_CUSTOM_IMAGE_TYPES.includes(type)) monster.customImage = type;

    return monster;
}

// Grants a generic humanoid enemy extra "class levels" worth of stats/skills
// as the party grows stronger — same idea as a PC's level-up, just applied
// in bulk by callers (arena spawning) rather than through the real
// level-up UI. Deliberately calls skill.apply() once per *new* rank rather
// than monster.applySkills() (which re-applies every existing rank too,
// which would double-count the template's starting skills).
function applyClassLevelScaling(monster, bonusLevels) {
    if (!bonusLevels || bonusLevels <= 0) return;
    monster.classLevelsGranted = bonusLevels;
    for (let i = 0; i < bonusLevels; i++) {
        const weaponSkills = monster.equipped?.weapon
            ? [`${monster.equipped.weapon}_hit`, `${monster.equipped.weapon}_dmg`]
            : ['unarmed_hit', 'unarmed_dmg'];
        const pool = ['meleeDamage', 'health', ...weaponSkills];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        monster.skills[pick] = (monster.skills[pick] || 0) + 1;
        const skill = window.skills[pick];
        if (skill && skill.apply) skill.apply(monster);
    }
    monster.hp = monster.maxHp; // top off after any maxHp-raising skill (e.g. 'health')
    monster.expValue = Math.round(monster.expValue * (1 + bonusLevels * 0.25));
}
window.applyClassLevelScaling = applyClassLevelScaling;

function equipToMonster(monster, itemId, asOffhand = false) {
    const item = window.items[itemId];
    if (!item) return;
    monster.inventory.push(itemId);
    if (item.type === 'weapon') {
        // Dual-wielding: a canOffhand weapon (dagger, club, sword...) can go
        // in the offhand slot alongside a main-hand weapon instead of the
        // usual "last weapon call wins the main slot" behavior — used by
        // the savage archetype pool below, never by the ordinary/civilized
        // one (city guards don't dual-wield).
        if (asOffhand && item.canOffhand) {
            monster.equipped.offhand = itemId;
        } else {
            monster.equipped.weapon = itemId;
            if (item.hands === 2) monster.equipped.offhand = null;
        }
    } else if (item.type === 'shield') {
        monster.equipped.offhand = itemId;
    } else if (item.type === 'armor') {
        monster.equipped.armor = itemId;
    } else if (item.type === 'helmet') {
        monster.equipped.helmet = itemId;
    }
}

// Barding: fits a light/medium/heavy barding item onto a mount (Horse,
// Wolf, Boar, Unicorn — the same set the rendering overlay in gameEngine.js
// covers). Refuses anything else, including a human armor item, so a
// barding item can never end up equipped where the overlay wouldn't match
// it, and a non-mount can never be handed barding by mistake.
const BARDABLE_NAMES = ['Horse', 'Wolf', 'Boar', 'Unicorn'];
function equipMountBarding(mount, bardingId) {
    if (!mount || !BARDABLE_NAMES.includes(mount.name)) return false;
    const item = window.items[bardingId];
    if (!item || item.subType !== 'barding') return false;
    mount.equipped = mount.equipped || { weapon: null, offhand: null, armor: null, helmet: null };
    mount.inventory = mount.inventory || [];
    mount.inventory.push(bardingId);
    mount.equipped.armor = bardingId;
    return true;
}
window.equipMountBarding = equipMountBarding;

// Mounts can invest skill points, same pool/apply mechanism as any other
// entity (window.skills[key].apply), but only in physical, animal-plausible
// skills — armor training and raw toughness, never a weapon-hit skill or
// anything from the arcane/divine trees (a horse doesn't cast spells or
// swing a sword). Deliberately a fixed allowlist rather than "whatever's in
// the strength/endurance trees," so a new skill added to those trees later
// doesn't silently become mount-purchasable without a design decision.
const MOUNT_APPROPRIATE_SKILLS = ['light_armor_training', 'medium_armor_training', 'heavy_armor_training', 'health', 'meleeDamage'];
window.MOUNT_APPROPRIATE_SKILLS = MOUNT_APPROPRIATE_SKILLS;

// Purchase tiers for a trained mount (see buyHorse, stable.js, and the
// arena shop's mount purchase, ui.js): a flat cost multiplier, a fixed set
// of skill points from the allowlist above, and — for the higher tiers —
// a free barding fitting, so paying more for training visibly means
// something even before the player buys any barding themselves.
const MOUNT_TRAINING_TIERS = {
    untrained:   { label: 'Untrained',   costMultiplier: 1,   skills: [], freeBarding: null },
    trained:     { label: 'Trained',     costMultiplier: 1.5, skills: ['light_armor_training', 'health'], freeBarding: 'light_barding' },
    war_trained: { label: 'War-Trained', costMultiplier: 2.5, skills: ['light_armor_training', 'medium_armor_training', 'health', 'health', 'meleeDamage'], freeBarding: 'medium_barding' },
};
window.MOUNT_TRAINING_TIERS = MOUNT_TRAINING_TIERS;

function grantMountTraining(mount, tierId) {
    const tier = MOUNT_TRAINING_TIERS[tierId];
    if (!mount || !tier) return;
    mount.skills = mount.skills || {};
    tier.skills.forEach(skillKey => {
        if (!MOUNT_APPROPRIATE_SKILLS.includes(skillKey)) return; // belt-and-suspenders against a bad tier definition
        const skill = window.skills[skillKey];
        if (!skill) return;
        const current = mount.skills[skillKey] || 0;
        if (skill.maxRanks > 0 && current >= skill.maxRanks) return;
        mount.skills[skillKey] = current + 1;
        if (skill.apply) skill.apply(mount);
    });
    mount.hp = mount.maxHp;
    if (tier.freeBarding) equipMountBarding(mount, tier.freeBarding);
}
window.grantMountTraining = grantMountTraining;

// A "combat build" pairs one weapon (+ optional offhand) with an ordered
// list of skill picks that actually make sense for it — so a randomly
// equipped goblin/orc/skeleton reads as a coherent fighter (an axe-wielder
// only ever invests in axe_hit/axe_dmg, never sword_hit) instead of a
// random weapon roll with no matching skill behind it. `${weapon}_hit`/
// `${weapon}_dmg`/`${weapon}_parry` are generic, weapon-id-keyed lookups
// (see resolveAttack/tryAttack, gameEngine.js) — not declared in skills.js
// at all — so any weapon id here "just works" with no new skill defs
// needed. A couple of entries reuse real skills.js trees (stealth_rogue,
// sneak_attack_dmg, shield_proficiency) for extra flavor.
const COMBAT_ARCHETYPES = [
    { id: 'sword_duelist', weapon: 'sword', skills: ['sword_hit', 'fastMovement', 'sword_dmg', 'initiativeBonus', 'quickRecovery', 'health'] },
    { id: 'sword_shield_defender', weapon: 'sword', offhand: 'wooden_shield', skills: ['shield_proficiency', 'sword_hit', 'health', 'sword_dmg', 'sword_parry', 'health'] },
    { id: 'spear_reach', weapon: 'spear', skills: ['spear_hit', 'spear_dmg', 'initiativeBonus', 'health', 'meleeDamage'] },
    { id: 'spear_shield_phalanx', weapon: 'spear', offhand: 'wooden_shield', skills: ['shield_proficiency', 'spear_hit', 'health', 'spear_dmg', 'health'] },
    { id: 'axe_berserker', weapon: 'axe', skills: ['axe_hit', 'meleeDamage', 'axe_dmg', 'health', 'fastMovement'] },
    { id: 'bow_ranger', weapon: 'bow', skills: ['bow_hit', 'bow_dmg', 'fastMovement', 'health', 'initiativeBonus'] },
    { id: 'dagger_rogue', weapon: 'dagger', skills: ['dagger_hit', 'stealth_rogue', 'dagger_dmg', 'fastMovement', 'sneak_attack_dmg'] },
];
window.COMBAT_ARCHETYPES = COMBAT_ARCHETYPES;

// A rougher, cheaper-average alternative to COMBAT_ARCHETYPES — axe-heavy,
// shields rare (city-guard "sword+shield" discipline isn't a raider's
// style), a couple of genuine dual-wield builds (a real offhand weapon, not
// just a shield), one rare helmet. Deliberately not armor-heavy either, so
// the average total gear value comes out lower than the 'random' pool
// (~28 buyPrice-equivalent) despite the variety — every entry here is a
// single weapon, a cheap dual-wield pair, or one cheap weapon+helmet combo.
const SAVAGE_ARCHETYPES = [
    { id: 'savage_axe', weapon: 'axe', skills: ['axe_hit', 'meleeDamage', 'axe_dmg', 'health'] },
    { id: 'savage_axe_berserker', weapon: 'axe', skills: ['axe_hit', 'meleeDamage', 'health', 'axe_dmg'] },
    { id: 'savage_axe_dualwield', weapon: 'axe', offhand: 'dagger', offhandIsWeapon: true, skills: ['axe_hit', 'meleeDamage', 'health'] },
    { id: 'savage_spear', weapon: 'spear', skills: ['spear_hit', 'spear_dmg', 'health', 'meleeDamage'] },
    { id: 'savage_club', weapon: 'club', skills: ['meleeDamage', 'health'] },
    { id: 'savage_bow', weapon: 'bow', skills: ['bow_hit', 'health', 'fastMovement'] },
    { id: 'savage_dagger_dualwield', weapon: 'dagger', offhand: 'dagger', offhandIsWeapon: true, skills: ['dagger_hit', 'stealth_rogue', 'health'] },
    { id: 'savage_sword', weapon: 'sword', skills: ['sword_hit', 'sword_dmg', 'health'] },
    { id: 'savage_club_helmed', weapon: 'club', helmet: 'nasal_helm', skills: ['meleeDamage', 'health'] },
];
window.SAVAGE_ARCHETYPES = SAVAGE_ARCHETYPES;

// Spends `points` skill ranks down an archetype's ordered priority list —
// mostly in sequence (an agile swordsman keeps investing in swordplay/speed
// before branching out), but each point has a 25% chance to jump back to a
// random earlier pick instead of advancing, so two monsters sharing the
// same archetype don't come out perfectly identical.
function spendArchetypePoints(monster, archetype, points) {
    monster.combatArchetype = archetype.id;
    let cursor = 0;
    for (let i = 0; i < points; i++) {
        const idx = (cursor > 0 && Math.random() < 0.25) ? Math.floor(Math.random() * cursor) : cursor;
        const pick = archetype.skills[Math.min(idx, archetype.skills.length - 1)];
        monster.skills[pick] = (monster.skills[pick] || 0) + 1;
        const skill = window.skills[pick];
        if (skill && skill.apply) skill.apply(monster);
        if (cursor < archetype.skills.length - 1) cursor++;
    }
    monster.hp = monster.maxHp; // top off after any maxHp-raising skill (e.g. 'health')
}
window.spendArchetypePoints = spendArchetypePoints;

// Public entry point for callers that want to hand-pick (or randomly roll)
// a full weapon+skills build outside of createMonster's own 'random'
// equipment path — e.g. giving a hand-placed monster a scaled build.
function assignCombatBuild(monster, points, archetypeId = null) {
    const archetype = archetypeId
        ? COMBAT_ARCHETYPES.find(a => a.id === archetypeId)
        : COMBAT_ARCHETYPES[Math.floor(Math.random() * COMBAT_ARCHETYPES.length)];
    if (!archetype) return;
    equipToMonster(monster, archetype.weapon);
    if (archetype.offhand) equipToMonster(monster, archetype.offhand);
    spendArchetypePoints(monster, archetype, points);
}
window.assignCombatBuild = assignCombatBuild;

window.monsterTemplates = monsterTemplates;
window.createMonster = createMonster;
window.equipToMonster = equipToMonster;
