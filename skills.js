// skills.js

const skills = {
    // ENDURANCE
    'health': {
        name: 'Health',
        description: 'Increases current and max HP by 10 per rank.',
        tree: 'endurance',
        maxRanks: 0,
        apply: (player) => {
            player.hp += 10;
            player.maxHp += 10;
        }
    },
    'health_regen': {
        name: 'Constitution',
        description: 'Increases health regeneration by 0.1 per rank.',
        tree: 'endurance',
        maxRanks: 0,
        apply: (player) => {}
    },
    // STRENGTH
    'meleeDamage': {
        name: 'Melee Damage',
        description: 'Increases damage dealt by melee attacks by 1 per rank.',
        tree: 'strength',
        maxRanks: 0,
        apply: (player) => {
            player.baseDamage += 1;
        }
    },
    'light_armor_training': {
        name: 'Light Armor Training',
        description: 'Allows the use of light armor.',
        tree: 'strength',
        maxRanks: 1,
        apply: (player) => {}
    },
    'medium_armor_training': {
        name: 'Medium Armor Training',
        description: 'Allows the use of medium armor.',
        tree: 'strength',
        maxRanks: 1,
        prereq: 'light_armor_training',
        apply: (player) => {}
    },
    'heavy_armor_training': {
        name: 'Heavy Armor Training',
        description: 'Allows the use of heavy armor.',
        tree: 'strength',
        maxRanks: 1,
        prereq: 'medium_armor_training',
        apply: (player) => {}
    },
    'shove': {
        name: 'Shove',
        description: 'Grants the Shove action, pushing an adjacent enemy 1 hex away.',
        tree: 'strength',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'protector': {
        name: 'Protector',
        description: 'Reaction: Use your Sword/Dagger Parry to protect an adjacent ally from an attack.',
        tree: 'fighter',
        maxRanks: 1,
        reaction: true,
        prereq_eval: (p) => (p.skills['sword_parry'] || p.skills['dagger_parry']),
        apply: (player) => {}
    },
    'battle_reflexes': {
        name: 'Battle Reflexes',
        description: 'Passive: Gain 1 Time Point every time you are attacked.',
        tree: 'fighter',
        maxRanks: 1,
        apply: (player) => {}
    },
    // AGILITY
    'timePointRate': {
        name: 'Time Point Rate',
        description: 'Increases time points gained per tick by 0.05 per rank.',
        tree: 'agility',
        maxRanks: 0,
        apply: (player) => {
            player.timePointsPerTick += 0.05;
        }
    },
    'fastMovement': {
        name: 'Fast Movement',
        description: 'Reduces move TP cost by 1 per rank if wearing light or no armor.',
        tree: 'agility',
        maxRanks: 0,
        apply: (player) => {}
    },
    'riding': {
        name: 'Riding',
        description: 'Allows mounting and riding animals of appropriate size.',
        tree: 'agility',
        maxRanks: 1,
        apply: (player) => {}
    },
    'riding_druid': {
        name: 'Nature Riding',
        description: 'Allows mounting and riding animals of appropriate size.',
        tree: 'druid',
        maxRanks: 1,
        apply: (player) => {}
    },
    'riding_paladin': {
        name: 'Divine Riding',
        description: 'Allows mounting and riding animals of appropriate size.',
        tree: 'paladin',
        maxRanks: 1,
        apply: (player) => {}
    },
    'sidestep': {
        name: 'Sidestep',
        description: 'Spend 6 TP to move to an adjacent hex when an opponent moves next to you.',
        tree: 'agility',
        maxRanks: 1,
        reaction: true,
        apply: (player) => {}
    },
    'sidestep_mastery': {
        name: 'Sidestep Mastery',
        description: 'Reduces Sidestep TP cost by 1.',
        tree: 'agility',
        maxRanks: 1,
        prereq: 'sidestep',
        apply: (player) => {}
    },
    'stealth_agility': {
        name: 'Inconspicuous',
        description: 'Grants +5 bonus to stealth checks.',
        tree: 'agility',
        maxRanks: 1,
        apply: (player) => {}
    },
    'shield_proficiency': {
        name: 'Shield Proficiency',
        description: 'Reduces damage taken by an additional 1 when a shield is equipped.',
        tree: 'weapons',
        maxRanks: 1,
        apply: (player) => {}
    },
    'shield_bash': {
        name: 'Shield Bash',
        description: 'Reaction: If an opponent attacks and misses, spend 3 TP to perform a basic attack (no weapon/skill bonuses).',
        tree: 'weapons',
        maxRanks: 1,
        prereq: 'shield_proficiency',
        reaction: true,
        apply: (player) => {}
    },
    'shield_other': {
        name: 'Shield Other',
        description: 'Reaction: If an adjacent ally is attacked, spend 1 TP to apply your shield reduction to them.',
        tree: 'weapons',
        maxRanks: 1,
        prereq: 'shield_proficiency',
        reaction: true,
        apply: (player) => {}
    },
    // ROGUE
    'quickRecovery': {
        name: 'Quick Recovery',
        description: 'Reduces turn-end threshold by 1 per rank (max 20).',
        tree: 'rogue',
        maxRanks: 20,
        apply: (player) => {}
    },
    'initiativeBonus': {
        name: 'Initiative Bonus',
        description: 'Start each combat with 5 TP per rank (max 10).',
        tree: 'rogue',
        maxRanks: 10,
        apply: (player) => {}
    },
    'dagger_quick_draw': {
        name: 'Dagger Quick Draw',
        description: 'Automatically equip another dagger from inventory after throwing.',
        tree: 'rogue',
        maxRanks: 1,
        apply: (player) => {}
    },
    'stealth_rogue': {
        name: 'Shadow Weaver',
        description: 'Grants +5 bonus to stealth checks.',
        tree: 'rogue',
        maxRanks: 1,
        apply: (player) => {}
    },
    'speedy_stealth': {
        name: 'Speedy Stealth',
        description: 'Passive: Reduces the Time Point penalty of moving while stealthed by 2.',
        tree: 'rogue',
        maxRanks: 1,
        prereq: 'quickRecovery', // Requires some rogue progression
        apply: (player) => {}
    },

    // WEAPON SKILLS
    ...generateWeaponSkills('sword', 'Sword'),
    ...generateWeaponSkills('axe', 'Axe', 3),
    ...generateWeaponSkills('bow', 'Bow'),
    ...generateWeaponSkills('spear', 'Spear'),
    ...generateWeaponSkills('dagger', 'Dagger'),
    ...generateWeaponSkills('quarterstaff', 'Quarterstaff'),
    ...generateWeaponSkills('club', 'Club'),

    // MONSTER ONLY SKILLS
    'regeneration': {
        name: 'Regeneration',
        description: '20% chance to heal 1 HP per tick.',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },

    // WAY OF THE OPEN PALM
    'unarmed_hit': {
        name: 'Unarmed Proficiency',
        description: 'Grants +5% hit chance when fighting unarmed.',
        tree: 'Way of the open palm',
        maxRanks: 1,
        apply: (player) => {}
    },
    'unarmed_dmg': {
        name: 'Unarmed Mastery',
        description: 'Grants +1 damage when fighting unarmed.',
        tree: 'Way of the open palm',
        maxRanks: 1,
        prereq: 'unarmed_hit',
        apply: (player) => {}
    },
    'deflect_arrows': {
        name: 'Deflect Arrows',
        description: 'React to deflect ranged attacks if unarmored and having an open hand. Works like Parry.',
        tree: 'Way of the open palm',
        maxRanks: 1,
        reaction: true,
        apply: (player) => {}
    },

    // MONK
    'swift_step': {
        name: 'Swift Step',
        description: 'Reduces move TP cost by 1 if wearing no armor and no shield. Stacks with Fast Movement.',
        tree: 'monk',
        maxRanks: 1,
        apply: (player) => {}
    },

    // MAGIC COMMON HELPERS (per school)
    ...generateMagicSkills('arcane', 'Firebolt', 'firebolt'),
    ...generateMagicSkills('arcane', 'Counterspell', 'counterspell'),
    ...generateMagicSkills('divine', 'Heal', 'heal'),
    ...generateMagicSkills('divine', 'Smite Evil', 'smite_evil'),
    ...generateMagicSkills('divine', 'Divine Protection', 'divine_protection'),
    ...generateMagicSkills('nature', 'Summon Animal', 'summon_animal'),
    ...generateMagicSkills('nature', 'Entangle', 'entangle'),
    'arcane_expand': {
        name: 'Arcane Expansion',
        description: 'Increase the radius of Arcane AOE spells by 1 per rank. (+10 mana per increase)',
        tree: 'arcane',
        maxRanks: 3,
        apply: (player) => {}
    },
    'divine_expand': {
        name: 'Divine Expansion',
        description: 'Increase the radius of Divine AOE spells by 1 per rank. (+10 mana per increase)',
        tree: 'divine',
        maxRanks: 3,
        apply: (player) => {}
    },
    'nature_expand': {
        name: 'Nature Expansion',
        description: 'Increase the radius of Nature AOE spells by 1 per rank. (+10 mana per increase)',
        tree: 'nature',
        maxRanks: 3,
        apply: (player) => {}
    },
    'animal_companion': {
        name: 'Animal Companion',
        description: 'Passive: Your Nature summons become permanent animal companions. (Max 1)',
        tree: 'nature',
        maxRanks: 1,
        prereq: 'learn_summon_animal',
        apply: (player) => {}
    },
    'poison_bite': {
        name: 'Poison Bite',
        description: 'Passive: Melee attacks have a 50% chance to poison targets for 2 damage per TP tick (10 times).',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'companion_str_end': {
        name: 'Companion Brawn',
        description: 'Grants +1 STR and +1 END to your animal companion.',
        tree: 'nature',
        maxRanks: 1,
        prereq: 'animal_companion',
        apply: (player) => {}
    },
    'companion_agi_end': {
        name: 'Companion Grace',
        description: 'Grants +1 AGI and +1 END to your animal companion.',
        tree: 'nature',
        maxRanks: 1,
        prereq: 'animal_companion',
        apply: (player) => {}
    }
};

function generateWeaponSkills(id, label, maxDmgRanks = 1) {
    const s = {};
    const hitId = `${id}_hit`;
    const dmgId = `${id}_dmg`;

    s[hitId] = {
        name: `${label} Proficiency`,
        description: `Grants +5% hit chance when using a ${label}.`,
        tree: 'weapons',
        maxRanks: 1,
        apply: (player) => {}
    };

    s[dmgId] = {
        name: `${label} Mastery`,
        description: `Grants +1 damage when using a ${label} per rank.`,
        tree: 'weapons',
        maxRanks: maxDmgRanks,
        prereq: hitId,
        apply: (player) => {}
    };

    if (id === 'sword' || id === 'dagger') {
        const parryId = `${id}_parry`;
        s[parryId] = {
            name: `${label} Parry`,
            description: `Unlock Parry reaction: Use 3 TP to potentially cancel an incoming attack.`,
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            reaction: true,
            apply: (player) => {}
        };
        s[`${id}_parry_chance`] = {
            name: `${label} Parry Mastery`,
            description: `Grants +5% success chance when parrying with a ${label}.`,
            tree: 'weapons',
            maxRanks: 2,
            prereq: parryId,
            apply: (player) => {}
        };
        s[`${id}_parry_cost`] = {
            name: `${label} Parry Efficiency`,
            description: `Reduces TP cost of ${label} Parry by 1.`,
            tree: 'weapons',
            maxRanks: 1,
            prereq: `${id}_parry_chance`,
            apply: (player) => {}
        };
        s[`${id}_feint`] = {
            name: `${label} Feint`,
            description: `Unlock Feint action: Use 1 TP to trick opponent into parrying.`,
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            active: true,
            apply: (player) => {}
        };
    }

    if (id === 'dagger') {
        s[`dagger_throw`] = {
            name: `Throw Dagger`,
            description: `Unlock Throw Dagger: 4 range attack, but the dagger is dropped on the target's hex.`,
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            active: true,
            apply: (player) => {}
        };
    }

    if (id === 'spear') {
        s[`spear_intercept`] = {
            name: `Spear Intercept`,
            description: `Unlock reaction to attack enemies entering adjacent hexes (5 TP).`,
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            reaction: true,
            apply: (player) => {}
        };
        s[`spear_halt`] = {
            name: `Spear Halt`,
            description: `Unlock reaction to end an opponent's turn if they move adjacent (1 TP).`,
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            reaction: true,
            apply: (player) => {}
        };
    }

    if (id === 'quarterstaff') {
        s[`quarterstaff_trip`] = {
            name: `Trip`,
            description: `Unlock Trip: 5 TP melee attack. On hit, reduce enemy TP by 5. No damage.`,
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            active: true,
            apply: (player) => {}
        };
    }

    return s;
}

function generateMagicSkills(school, spellName, spellId) {
    const s = {};
    const capitalized = school.charAt(0).toUpperCase() + school.slice(1);

    if (spellId) {
        s[`learn_${spellId}`] = {
            name: `Learn ${spellName}`,
            description: `Unlocks the ${spellName} base spell.`,
            tree: school,
            maxRanks: 1,
            apply: (player) => {
                if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
                player.unlockedBaseSpells.push(spellId);
            }
        };
    }

    s[`${school}_mana`] = {
        name: `${capitalized} Mana`,
        description: 'Increases max and current mana by 10.',
        tree: school,
        maxRanks: 0,
        apply: (player) => {
            player.maxMana += 10;
            player.currentMana += 10;
        }
    };

    s[`${school}_regen`] = {
        name: `${capitalized} Regeneration`,
        description: 'Increases mana regeneration by 0.1 per rank.',
        tree: school,
        maxRanks: 0,
        apply: (player) => {}
    };

    s[`${school}_quickened`] = {
        name: `Quickened ${capitalized}`,
        description: 'Unlock halving casting speed (TP cost 5) for +5 mana.',
        tree: school,
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedCastingOptions) player.unlockedCastingOptions = {};
            if (!player.unlockedCastingOptions[school]) player.unlockedCastingOptions[school] = {};
            player.unlockedCastingOptions[school].quickened = true;
        }
    };

    s[`${school}_slowed`] = {
        name: `Slowed ${capitalized}`,
        description: 'Unlock doubling casting speed (TP cost 20) for -4 mana.',
        tree: school,
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedCastingOptions) player.unlockedCastingOptions = {};
            if (!player.unlockedCastingOptions[school]) player.unlockedCastingOptions[school] = {};
            player.unlockedCastingOptions[school].slowed = true;
        }
    };

    s[`${school}_range`] = {
        name: `${capitalized} Range`,
        description: 'Increases spell range by 1 and mana cost by 1 per rank.',
        tree: school,
        maxRanks: 0,
        apply: (player) => {
            if (!player.unlockedCastingOptions) player.unlockedCastingOptions = {};
            if (!player.unlockedCastingOptions[school]) player.unlockedCastingOptions[school] = {};
            player.unlockedCastingOptions[school].extraRange = (player.unlockedCastingOptions[school].extraRange || 0) + 1;
        }
    };

    s[`${school}_magnitude`] = {
        name: `${capitalized} Potency`,
        description: 'Increase magnitude by 1x base for +5 mana per rank.',
        tree: school,
        maxRanks: 0,
        apply: (player) => {
            if (!player.unlockedCastingOptions) player.unlockedCastingOptions = {};
            if (!player.unlockedCastingOptions[school]) player.unlockedCastingOptions[school] = {};
            player.unlockedCastingOptions[school].extraMagnitude = (player.unlockedCastingOptions[school].extraMagnitude || 0) + 1;
        }
    };

    s[`${school}_cap`] = {
        name: `${capitalized} Cap`,
        description: 'Increases spell mana cap by 5 per rank.',
        tree: school,
        maxRanks: 0,
        apply: (player) => {
            if (!player.manaCaps) player.manaCaps = { arcane: 10, divine: 10, nature: 10 };
            player.manaCaps[school] += 5;
        }
    };

    if (school === 'arcane') {
        s[`firebolt_hit`] = {
            name: `Firebolt Proficiency`,
            description: `Grants +5% hit chance when casting Firebolt per rank.`,
            tree: 'wizard',
            maxRanks: 0,
            apply: (player) => {}
        };
        s[`arcane_eff_range`] = {
            name: `Wizard Range Efficiency`,
            description: `Reduces mana cost of extra range by 1 per rank (max 2).`,
            tree: 'wizard',
            maxRanks: 2,
            apply: (player) => {}
        };
        s[`arcane_eff_magnitude`] = {
            name: `Wizard Potency Efficiency`,
            description: `Reduces mana cost of extra potency by 1 per rank (max 2).`,
            tree: 'wizard',
            maxRanks: 2,
            apply: (player) => {}
        };
        s[`arcane_eff_speed`] = {
            name: `Wizard Speed Efficiency`,
            description: `Reduces mana cost of quickened casting by 1 per rank (max 2).`,
            tree: 'wizard',
            maxRanks: 2,
            apply: (player) => {}
        };
    }

    return s;
}

window.skills = skills;
