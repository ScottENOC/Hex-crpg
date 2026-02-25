// spells.js

const baseSpells = {
    'firebolt': {
        name: 'Firebolt',
        school: 'arcane',
        baseMana: 5,
        baseMagnitude: 5,
        type: 'damage',
        needsHitCheck: true
    },
    'heal': {
        name: 'Heal',
        school: 'divine',
        baseMana: 6,
        baseMagnitude: 5,
        type: 'heal'
    },
    'smite_evil': {
        name: 'Smite Evil',
        school: 'divine',
        baseMana: 3,
        baseMagnitude: 8,
        baseRange: 3,
        type: 'damage',
        needsHitCheck: true,
        validTags: ['undead', 'demon']
    },
    'divine_protection': {
        name: 'Divine Protection',
        school: 'divine',
        baseMana: 10,
        baseMagnitude: 1, // TP loss amount
        baseRange: 1,
        type: 'buff',
        ongoing: true
    },
    'summon_animal': {
        name: 'Summon Animal',
        school: 'nature',
        baseMana: 10,
        type: 'summon',
        summons: ['wolf', 'boar']
    },
    'counterspell': {
        name: 'Counterspell',
        school: 'arcane',
        baseMana: 10,
        type: 'dispel',
        baseRange: 8
    },
    'entangle': {
        name: 'Entangle',
        school: 'nature',
        baseMana: 12,
        type: 'aoe_debuff',
        baseRange: 8,
        baseRadius: 1,
        debuffType: 'entangled'
    }
};

window.baseSpells = baseSpells;
