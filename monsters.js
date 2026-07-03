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
        defaultEquipment: 'random'
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
        base: 'orc',
        // Stat template only — "base: 'orc'" just borrows the orc's tankier
        // baseline stats, but he's written and voiced as a human paladin
        // knight (title, heal spell, heavy armor + shield), so he renders
        // through the same layered human/elf/dwarf sprite system real party
        // members use (see the boss-spawn code in gameEngine.js) instead of
        // a flat monster image — that's also what was making him render as
        // a plain goblin (the generic monster sprite path's image lookup is
        // keyed by e.name, and "Sir Alistair" never matched "Orc").
        race: 'human',
        color: '#ffd700',
        gender: 'male',
        hp: 50,
        mana: 30,
        dialogue: 'alistair_entry',
        skills: { 'learn_heal': 1, 'divine_mana': 2, 'heavy_armor_training': 1, 'shield_proficiency': 1, 'sword_hit': 1, 'sword_dmg': 1, 'shield_bash': 1 },
        spells: [
            { name: "Heal", baseId: 'heal', type: 'heal', school: 'divine', manaCost: 10, tpCost: 10, range: 5, magnitude: 15 }
        ],
        equipment: ['heavy_armor', 'sword', 'wooden_shield']
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
    
    if (template.extraHexes) monster.extraHexes = template.extraHexes;

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

    // 1. Assign Equipment First
    const equipment = customEquipment || template.defaultEquipment;
    if (equipment === 'random') {
        assignRandomEquipment(monster);
    } else if (Array.isArray(equipment)) {
        equipment.forEach(itemId => equipToMonster(monster, itemId));
    }

    // 2. Assign Skills
    monster.skills = customSkills ? { ...customSkills } : { ...template.skills };
    if (type === 'orc' && monster.equipped.weapon) {
        monster.skills[`${monster.equipped.weapon}_hit`] = 1;
    }
    monster.applySkills();

    // 3. Special: Rider initialization
    if (template.isRider && template.mountType) {
        const mount = createMonster(template.mountType, hex, null, null, side);
        monster.riding = mount;
        mount.rider = monster;
        // Mount should be in the entities list too
        if (window.entities) window.entities.push(mount);
    }

    monster.gold = Math.floor(Math.random() * 5) + 5;
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

function equipToMonster(monster, itemId) {
    const item = window.items[itemId];
    if (!item) return;
    monster.inventory.push(itemId);
    if (item.type === 'weapon') {
        monster.equipped.weapon = itemId;
        if (item.hands === 2) monster.equipped.offhand = null;
    } else if (item.type === 'shield') {
        monster.equipped.offhand = itemId;
    } else if (item.type === 'armor') {
        monster.equipped.armor = itemId;
    }
}

function assignRandomEquipment(monster) {
    const lootRoll = Math.floor(Math.random() * 8);
    switch(lootRoll) {
        case 0: equipToMonster(monster, 'sword'); break;
        case 1: equipToMonster(monster, 'spear'); break;
        case 2: equipToMonster(monster, 'sword'); equipToMonster(monster, 'wooden_shield'); break;
        case 3: equipToMonster(monster, 'spear'); equipToMonster(monster, 'wooden_shield'); break;
        case 4: equipToMonster(monster, 'bow'); equipToMonster(monster, 'dagger'); break;
        case 5: equipToMonster(monster, 'bow'); equipToMonster(monster, 'sword'); break;
        case 6: equipToMonster(monster, 'bow'); break;
        case 7: equipToMonster(monster, 'axe'); break;
    }
}

window.monsterTemplates = monsterTemplates;
window.createMonster = createMonster;
window.equipToMonster = equipToMonster;
