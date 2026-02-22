// monsters.js

const monsterTemplates = {
    'goblin': {
        name: 'Goblin',
        color: 'green',
        hp: 10,
        expValue: 100,
        riderSize: 2,
        tags: ['humanoid'],
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
        skills: {
            'health': 1,
            'unarmed_hit': 1,
            'unarmed_dmg': 1,
            'fastMovement': 1,
            'timePointRate': 6,
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

function createMonster(type, hex, customSkills = null, customEquipment = null, side = 'enemy') {
    const template = monsterTemplates[type] || monsterTemplates['goblin'];
    const monster = new window.Enemy(template.name, template.color, hex, 3, template.hp, template.expValue);
    monster.side = side;
    monster.canLoot = template.canLoot !== undefined ? template.canLoot : true;
    monster.riderSize = template.riderSize || 0;
    monster.mountSize = template.mountSize || 0;
    monster.tags = template.tags ? [...template.tags] : [];
    
    if (template.extraHexes) monster.extraHexes = template.extraHexes;

    // Special Spider Initialization
    if (type === 'spider') {
        monster.spiderImage = Math.random() < 0.5 ? 'spider1' : 'spider2';
        monster.hasUsedWeb = false;
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
