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
    'iron_grip': {
        name: 'Iron Grip',
        description: 'Reduces the TP cost of climbing (fort ramparts and similar) and lowers the chance of a failed climb in combat. Stacks with other climbing skills.',
        tree: 'strength',
        maxRanks: 1,
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
        description: 'Spend 6 TP to move to an adjacent hex when an opponent moves next to you. Requires light armor or no armor.',
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
    'sure_footed': {
        name: 'Sure-Footed',
        description: 'Reduces the TP cost of climbing (fort ramparts and similar) and lowers the chance of a failed climb in combat. Stacks with other climbing skills.',
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
    // SUBTLE SPELL: the rogue-side half of a rogue/caster multiclass — a
    // metamagic option any known non-damaging spell (Heal, Calm Animal,
    // Sanctuary, etc. — never Firebolt/Smite/burst-damage variants) can be
    // built with, at +6 mana and +5 TP, that doesn't break stealth when
    // cast. Deliberately universal across schools rather than arcane-only:
    // this is a rogue skill about HOW you cast, not a caster skill about
    // WHAT you cast, so a rogue/cleric or rogue/druid gets the same option
    // as a rogue/wizard. See the Subtle checkbox (ui.js's spell builder)
    // and the stealth-preserving check in tryCastSpell (gameEngine.js).
    'subtle_spell': {
        name: 'Subtle Spell',
        description: 'Lets you build any known non-damaging spell as Subtle (+6 mana, +5 TP): casting it no longer breaks your stealth.',
        tree: 'rogue',
        maxRanks: 1,
        prereq: 'stealth_rogue',
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
    'unarmed_reaction_block': {
        name: 'Pressure Point Strike',
        description: 'Passive: When you hit an opponent with an unarmed attack, they cannot take reactions until they next take an action.',
        tree: 'Way of the open palm',
        maxRanks: 1,
        prereq: 'unarmed_dmg',
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
    'trip_reaction': {
        name: 'Counter Trip',
        description: 'Reaction: If an opponent attacks you and misses, spend 2 TP to make a trip attempt.',
        tree: 'monk',
        maxRanks: 1,
        reaction: true,
        apply: (player) => {}
    },
    'agile_climber': {
        name: 'Agile Climber',
        description: 'Reduces movement TP penalty when moving up or down terrain levels. Also reduces the TP cost of climbing (fort ramparts and similar) and lowers the chance of a failed climb in combat — stacks with other climbing skills.',
        tree: 'monk',
        maxRanks: 1,
        apply: (player) => {}
    },
    'disarm': {
        name: 'Disarm',
        description: 'Active: Attempt to disarm an opponent (50% base chance). (5 TP)',
        tree: 'monk',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },

    // MAGIC COMMON HELPERS (per school)
    ...generateMagicSkills('arcane', 'Firebolt', 'firebolt'),
    ...generateMagicSkills('arcane', 'Counterspell', 'counterspell'),
    ...generateMagicSkills('divine', 'Heal', 'heal'),
    ...generateMagicSkills('divine', 'Smite Evil', 'smite_evil'),
    ...generateMagicSkills('divine', 'Divine Protection', 'divine_protection'),
    ...generateMagicSkills('divine', 'Divine Silence', 'divine_silence'),
    ...generateMagicSkills('divine', 'Sanctuary', 'sanctuary'),
    ...generateMagicSkills('nature', 'Summon Animal', 'summon_animal'),
    ...generateMagicSkills('nature', 'Entangle', 'entangle'),
    ...generateMagicSkills('nature', 'Calm Animal', 'calm_animal'),
    ...generateMagicSkills('nature', 'Wild Fury', 'wild_fury'),
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
    // BURST: lets any single-target damage or heal spell of this school be
    // built instead as an area burst centered on a clicked hex (a distant
    // point, not the caster — the d&d-fireball shape), at radius 1 for a
    // flat mana surcharge. The existing <school>_expand skill (above)
    // scales that radius further, +10 mana/rank, exactly like it already
    // does for the game's other AOE spell types — burst just unlocks a
    // normally single-target spell into that same system rather than
    // needing its own separate radius dial. See computeSpellVariant
    // (spellPlanner.js) / renderSpellStats (ui.js) for where the type
    // actually flips to aoe_damage/aoe_heal.
    'arcane_burst': {
        name: 'Arcane Burst',
        description: 'Lets you cast single-target Arcane damage spells (e.g. Firebolt) as an area burst centered on a point instead, at radius 1 for +8 mana. Arcane Expansion increases the radius further.',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedCastingOptions) player.unlockedCastingOptions = {};
            if (!player.unlockedCastingOptions.arcane) player.unlockedCastingOptions.arcane = {};
            player.unlockedCastingOptions.arcane.burst = true;
        }
    },
    'divine_burst': {
        name: 'Divine Burst',
        description: 'Lets you cast single-target Divine damage or heal spells (e.g. Smite Evil, Heal) as an area burst centered on a point instead, at radius 1 for +8 mana. Divine Expansion increases the radius further.',
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedCastingOptions) player.unlockedCastingOptions = {};
            if (!player.unlockedCastingOptions.divine) player.unlockedCastingOptions.divine = {};
            player.unlockedCastingOptions.divine.burst = true;
        }
    },
    'nature_burst': {
        name: 'Nature Burst',
        description: 'Lets you cast single-target Nature damage or heal spells as an area burst centered on a point instead, at radius 1 for +8 mana. Nature Expansion increases the radius further.',
        tree: 'nature',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedCastingOptions) player.unlockedCastingOptions = {};
            if (!player.unlockedCastingOptions.nature) player.unlockedCastingOptions.nature = {};
            player.unlockedCastingOptions.nature.burst = true;
        }
    },
    // Multi-target
    'arcane_targets': {
        name: 'Arcane Fork',
        description: 'Increase the number of targets for single-target Arcane spells by 1 per rank. (+15 mana per target)',
        tree: 'arcane',
        maxRanks: 6,
        apply: (player) => {}
    },
    'divine_targets': {
        name: 'Divine Presence',
        description: 'Increase the number of targets for single-target Divine spells by 1 per rank. (+15 mana per target)',
        tree: 'divine',
        maxRanks: 6,
        apply: (player) => {}
    },
    'nature_targets': {
        name: 'Nature\'s Reach',
        description: 'Increase the number of targets for single-target Nature spells by 1 per rank. (+15 mana per target)',
        tree: 'nature',
        maxRanks: 6,
        apply: (player) => {}
    },
    'learn_boar_summon': {
        name: 'Boar Summoning',
        description: 'Allows you to summon a Boar instead of a Wolf (+8 mana).',
        tree: 'nature',
        maxRanks: 1,
        prereq: 'learn_summon_animal',
        apply: (player) => {}
    },
    'learn_tiger_summon': {
        name: 'Tiger Summoning',
        description: 'Allows you to summon a Tiger instead of a Wolf (+15 mana).',
        tree: 'nature',
        maxRanks: 1,
        prereq: 'learn_summon_animal',
        apply: (player) => {}
    },
    'learn_eagle_summon': {
        name: 'Eagle Summoning',
        description: 'Allows you to summon an Eagle instead of a Wolf (+5 mana).',
        tree: 'nature',
        maxRanks: 1,
        prereq: 'learn_summon_animal',
        apply: (player) => {}
    },
    'elf_vision': {
        name: 'Keen Elf Sight',
        description: 'Increases vision range by 4 per rank.',
        tree: 'elf',
        maxRanks: 2,
        apply: (player) => {
            player.visionBonus = (player.visionBonus || 0) + 4;
        }
    },
    'elf_bow_range': {
        name: 'Elf Bow Mastery',
        description: 'Increases range with bows by 4 per rank.',
        tree: 'elf',
        maxRanks: 3,
        apply: (player) => {}
    },
    'elf_darkvision': {
        name: 'Elf Darkvision',
        description: 'Reduces vision penalties and stealth detection penalties in low light.',
        tree: 'elf',
        maxRanks: 1,
        // No flat visionBonus here on purpose — this skill's actual effect is
        // the elf_darkvision check elsewhere (gameEngine.js's canSee, hexMap.js's
        // isVisibleToPlayer/updateExploration) that pins effectiveLight to 1.0,
        // negating the low-light range penalty entirely. It was previously also
        // granting an unconditional +5 vision bonus active even in broad
        // daylight, which matched neither its own description nor the intended
        // "keeps you near the ceiling in the dark" design.
        apply: (player) => {}
    },
    'elf_foliage_expertise': {
        name: 'Woodland Stride',
        description: 'Reduced movement cost, improved stealth, and improved defense while in foliage terrain. (Anti-requisite: Druid Foliage Mastery)',
        tree: 'elf',
        maxRanks: 1,
        anti_prereq: 'druid_foliage_expertise',
        apply: (player) => {}
    },
    'druid_foliage_expertise': {
        name: 'Foliage Mastery',
        description: 'Reduced movement cost, improved stealth, and improved defense while in foliage terrain. (Anti-requisite: Woodland Stride)',
        tree: 'druid',
        maxRanks: 1,
        anti_prereq: 'elf_foliage_expertise',
        apply: (player) => {}
    },
    'druid_knowledge_nature': {
        name: 'Knowledge: Nature',
        description: 'A trained eye for tracks, kills, and the wild in general — lets you read details others would miss. Higher ranks reveal more of a trail (see the unicorn tracking mechanic) and read it in more detail. (Anti-requisite: elf Knowledge: Nature)',
        tree: 'druid',
        maxRanks: 3,
        anti_prereq: 'elf_knowledge_nature',
        apply: (player) => {}
    },
    'elf_knowledge_nature': {
        name: 'Knowledge: Nature',
        description: 'A trained eye for tracks, kills, and the wild in general — lets you read details others would miss. Higher ranks reveal more of a trail (see the unicorn tracking mechanic) and read it in more detail. (Anti-requisite: druid Knowledge: Nature)',
        tree: 'elf',
        maxRanks: 3,
        anti_prereq: 'druid_knowledge_nature',
        apply: (player) => {}
    },
    // Knowledge: Nature used to single-handedly unlock reading tracks/kills
    // AND (as of the resource-gathering system) harvesting/quality bonuses —
    // one point doing too much. It now stays a pure "read details others
    // would miss" flavor unlock; the actual mechanical hooks live in these
    // three sub-skills, each requiring it as a prereq (either the druid or
    // elf pickup — functionally identical, see hasKnowledgeNature).
    'nature_butchery': {
        name: 'Butchery',
        description: 'Cleanly harvest meat and hides from animal corpses. (Requires Knowledge: Nature)',
        tree: 'nature',
        maxRanks: 1,
        prereq_eval: (player) => window.hasKnowledgeNature(player),
        apply: (player) => {}
    },
    'nature_bounty': {
        name: "Forager's Bounty",
        description: 'Extra yield when foraging fruit/herbs/fish. (Requires Knowledge: Nature)',
        tree: 'nature',
        maxRanks: 1,
        prereq_eval: (player) => window.hasKnowledgeNature(player),
        apply: (player) => {}
    },
    'nature_ranger': {
        name: "Ranger's Instinct",
        description: 'Grants +5 to-hit against animal-tagged enemies. (Requires Knowledge: Nature)',
        tree: 'nature',
        maxRanks: 1,
        prereq_eval: (player) => window.hasKnowledgeNature(player),
        apply: (player) => {
            player.toHitVsAnimal = (player.toHitVsAnimal || 0) + 5;
        }
    },
    'knowledge_religion': {
        name: 'Knowledge: Religion',
        description: 'Training in scripture, ritual, and the theory behind divine and forbidden magic alike — lets you recognize what others would dismiss as mere grave-robbing or superstition.',
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {}
    },
    'divine_armor_ease': {
        name: 'Vestment Ease',
        description: "Reduces the mana-cost penalty for casting divine spells in armor by 1 per rank (can't reduce it below 0).",
        tree: 'divine',
        maxRanks: 2,
        apply: (player) => {}
    },
    'nature_armor_ease': {
        name: 'Wild Ease',
        description: "Reduces the mana-cost penalty for casting nature spells in armor by 1 (can't reduce it below 0).",
        tree: 'nature',
        maxRanks: 1,
        apply: (player) => {}
    },
    'dwarf_axe_mastery': {
        name: 'Dwarven Axe Mastery',
        description: 'Grants +2 damage when using an Axe.',
        tree: 'dwarf',
        maxRanks: 1,
        apply: (player) => {}
    },
    'dwarf_solid': {
        name: 'Solid as a Rock',
        description: 'Reduces chance of being moved against your will (shove, trip) by 5%.',
        tree: 'dwarf',
        maxRanks: 1,
        apply: (player) => {
            player.forcedMoveResistance = (player.forcedMoveResistance || 0) + 5;
        }
    },
    'goblin_opportunist': {
        name: 'Opportunist',
        description: 'Deals +3 damage against a target that is caught off-guard.',
        tree: 'goblin',
        maxRanks: 1,
        apply: (player) => {}
    },
    'goblin_keen_senses': {
        name: 'Keen Senses',
        description: 'Increases vision range by 3.',
        tree: 'goblin',
        maxRanks: 1,
        apply: (player) => {
            player.visionBonus = (player.visionBonus || 0) + 3;
        }
    },
    'goblin_low_light_eyes': {
        name: 'Low-Light Eyes',
        description: 'Reduced vision/stealth-detection penalties in low light — same effect as elf Darkvision, a goblin trait from a life spent in warrens and caves.',
        tree: 'goblin',
        maxRanks: 1,
        apply: (player) => {}
    },
    'goblin_quick_reflexes': {
        name: 'Quick Reflexes',
        description: 'Increases passive dodge chance by 2 per rank.',
        tree: 'goblin',
        maxRanks: 2,
        apply: (player) => {
            player.passiveDodge = (player.passiveDodge || 0) + 2;
        }
    },
    'goblin_pack_hunter': {
        name: 'Pack Hunter',
        description: 'Deals +2 damage per rank against a target that already has an ally of yours standing next to it.',
        tree: 'goblin',
        maxRanks: 3,
        apply: (player) => {}
    },
    'orc_brute_strength': {
        name: 'Brute Strength',
        description: 'Deals +2 melee damage per rank.',
        tree: 'orc',
        maxRanks: 3,
        apply: (player) => {}
    },
    'orc_thick_hide': {
        name: 'Thick Hide',
        description: 'Reduces incoming damage by 1 per rank.',
        tree: 'orc',
        maxRanks: 2,
        apply: (player) => {
            player.baseReduction = (player.baseReduction || 0) + 1;
        }
    },
    'orc_ferocity': {
        name: 'Ferocity',
        description: 'Deals +4 damage while at or below half HP — an orc fights hardest when it hurts.',
        tree: 'orc',
        maxRanks: 1,
        apply: (player) => {}
    },
    'orc_momentum': {
        name: 'Momentum',
        description: 'Deals +3 damage per rank on an attack made after covering real ground (2+ hexes) since the start of the turn.',
        tree: 'orc',
        maxRanks: 2,
        apply: (player) => {}
    },
    'orc_relentless': {
        name: 'Relentless',
        description: 'Increases current and max HP by 8 per rank.',
        tree: 'orc',
        maxRanks: 2,
        apply: (player) => {
            player.hp += 8;
            player.maxHp += 8;
        }
    },
    'cleric_trigger_damage': {
        name: 'Divine Retribution',
        description: 'Whenever your trigger spells (Divine Silence, Sanctuary) activate, the target takes 1 damage immediately per rank.',
        tree: 'cleric',
        maxRanks: 2,
        apply: (player) => {}
    },
    'cleric_trigger_mana': {
        name: 'Divine Drain',
        description: 'Whenever your trigger spells activate, the target loses 1 mana immediately per rank.',
        tree: 'cleric',
        maxRanks: 2,
        apply: (player) => {}
    },
    'cleric_trigger_vision': {
        name: 'Clouded Mind',
        description: 'Whenever your trigger spells activate, reduce target vision range by 1 hex per rank (stacks 3x).',
        tree: 'cleric',
        maxRanks: 2,
        apply: (player) => {}
    },
    'cleric_trigger_dmg_red': {
        name: 'Feeble Strike',
        description: 'Whenever your trigger spells activate, reduce target damage dealt by 1 per rank (stacks 3x).',
        tree: 'cleric',
        maxRanks: 2,
        apply: (player) => {}
    },
    'cleric_trigger_heal_red': {
        name: 'Severed Grace',
        description: 'Whenever your trigger spells activate, reduce incoming healing by 50% per rank (Max 100%).',
        tree: 'cleric',
        maxRanks: 2,
        apply: (player) => {}
    },
    'assassinate': {
        name: 'Assassinate',
        description: 'Active: If no enemies can see you, perform a high-accuracy (+50%) attack for 80 TP.',
        tree: 'rogue',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'sneak_attack_dmg': {
        name: 'Sneak Attack',
        description: 'Increases damage by 4 if the target cannot see you per rank.',
        tree: 'rogue',
        maxRanks: 3,
        apply: (player) => {}
    },
    'pickpocket': {
        name: 'Pickpocket',
        description: 'Active: Attempt to take unequipped items from an enemy who can\'t see you, or a neutral target. (5 TP)',
        tree: 'rogue',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'zone_of_control': {
        name: 'Zone of Control',
        description: 'Passive: Enemies moving out of your melee reach have their movement cost doubled (Rank 1) or tripled (Rank 2).',
        tree: 'fighter',
        maxRanks: 2,
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
    'learn_unicorn_summon': {
        name: 'Unicorn Bond',
        description: "Allows a unicorn to answer your call for a permanent animal companion — a trust earned from the druids of the grove, not bought with skill points.",
        tree: 'druid',
        maxRanks: 1,
        prereq_eval: () => false, // quest-granted only (see grantSkillRank in the druid grove questline, campaign2Dialogue.js) — never purchasable
        questGrantedOnly: true, // excluded from respec's refund pass (resolveRespec, ui.js) — nothing was ever spent on this
        apply: (player) => {}
    },
    'poison_bite': {
        name: 'Poison Bite',
        description: 'Passive: Melee attacks have a 50% chance to poison targets for 2 damage per TP tick (10 times).',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'life_drain': {
        name: 'Life Drain',
        description: 'Passive: Each melee hit steals 2 HP from the target.',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'spectral_form': {
        name: 'Spectral Form',
        description: 'Passive: All incoming damage is reduced by 2 (innate resistance from being partially incorporeal).',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'petrify_gaze': {
        name: 'Petrifying Gaze',
        description: 'Active (once per combat): Gaze at a target in line of sight to petrify them, preventing all actions for 30 TP ticks.',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'siren_song': {
        name: 'Siren Song',
        description: 'Active (once per combat): Charm all players within 8 hexes, forcing them to spend their next turn moving toward the Harpy.',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'gore_charge': {
        name: 'Gore Charge',
        description: 'Active: Charge 2–5 hexes, deal +6 damage on hit, and shove the target 1 hex back.',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'revenant_revive': {
        name: 'Revenant Undying',
        description: 'Passive: The first time this creature reaches 0 HP, it rises again at half health with renewed fury.',
        tree: 'monster_skills',
        maxRanks: 1,
        apply: (player) => {}
    },
    'furious_charge': {
        name: 'Furious Charge',
        description: 'Active: Charge an enemy 3-5 hexes away and attack for +4 damage. (10 TP)',
        tree: 'monster_skills',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'fly': {
        name: 'Fly',
        description: 'Active: Take to the air. (1 TP)',
        tree: 'monster_skills',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'land': {
        name: 'Land',
        description: 'Active: Return to the ground. (1 TP)',
        tree: 'monster_skills',
        maxRanks: 1,
        active: true,
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
    },

    // STRENGTH ADDITIONS
    'powerful_shove': {
        name: 'Powerful Shove',
        description: 'Passive: Your Shove pushes the target 1 additional hex.',
        tree: 'strength',
        maxRanks: 1,
        prereq: 'shove',
        apply: (player) => {}
    },
    'bull_rush': {
        name: 'Bull Rush',
        description: 'Active (12 TP): Move up to 2 hexes and shove the target on the final hex as one combined action.',
        tree: 'strength',
        maxRanks: 1,
        prereq: 'shove',
        active: true,
        apply: (player) => {}
    },

    // AGILITY ADDITIONS
    'slip_away': {
        name: 'Slip Away',
        description: 'Reaction (5 TP): When you are successfully hit, immediately move to any adjacent unoccupied hex. Requires light armor or no armor.',
        tree: 'agility',
        maxRanks: 1,
        prereq: 'sidestep',
        reaction: true,
        apply: (player) => {}
    },
    'acrobatics': {
        name: 'Acrobatics',
        description: 'Passive: You can move through hexes occupied by enemies at +3 TP per such hex crossed. Requires light armor or no armor.',
        tree: 'agility',
        maxRanks: 1,
        apply: (player) => {}
    },

    // ENDURANCE ADDITIONS
    'second_wind': {
        name: 'Second Wind',
        description: 'Active (10 TP): Heal yourself for 9 HP.',
        tree: 'endurance',
        maxRanks: 1,
        prereq: 'health',
        active: true,
        apply: (player) => {}
    },
    'grit': {
        name: 'Grit',
        description: 'Passive: While below 50% HP, all your actions cost 1 fewer TP.',
        tree: 'endurance',
        maxRanks: 1,
        apply: (player) => {}
    },
    'hardened': {
        name: 'Hardened',
        description: 'Passive: The first hit each combat dealing 4 or more damage is reduced by 2.',
        tree: 'endurance',
        maxRanks: 1,
        prereq: 'second_wind',
        apply: (player) => {}
    },
    'unwavering': {
        name: 'Unwavering',
        description: 'Passive: While below 50% HP, you cannot be shoved, tripped, or forcibly moved.',
        tree: 'endurance',
        maxRanks: 1,
        prereq: 'hardened',
        apply: (player) => {}
    },

    // FIGHTER ADDITIONS
    'brace': {
        name: 'Brace',
        description: 'Active (3 TP): Enter a readied stance. Your next reaction this turn costs 1 fewer TP.',
        tree: 'fighter',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'suppression': {
        name: 'Suppression',
        description: 'Passive: Enemies leaving your Zone of Control also lose 3 TP immediately, on top of the movement penalty.',
        tree: 'fighter',
        maxRanks: 1,
        prereq: 'zone_of_control',
        apply: (player) => {}
    },
    'rally': {
        name: 'Rally',
        description: 'Active (15 TP): Target an adjacent ally. They immediately gain 10 TP.',
        tree: 'fighter',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'press_the_advantage': {
        name: 'Press the Advantage',
        description: 'Passive: After hitting a target, your next attack against the same target this turn costs 2 fewer TP.',
        tree: 'fighter',
        maxRanks: 1,
        apply: (player) => {}
    },
    'weapon_swap': {
        name: 'Weapon Swap',
        description: 'Passive: Switching equipped weapons costs 0 TP.',
        tree: 'fighter',
        maxRanks: 1,
        apply: (player) => {}
    },

    // MONK ADDITIONS
    'iron_shirt': {
        name: 'Iron Shirt',
        description: 'Passive: Reduce damage received from unarmed attacks by 1.',
        tree: 'monk',
        maxRanks: 1,
        prereq: 'swift_step',
        apply: (player) => {}
    },
    'joint_lock': {
        name: 'Joint Lock',
        description: 'Reaction (3 TP): After hitting an adjacent enemy with an unarmed strike, prevent them from moving away until their next action.',
        tree: 'monk',
        maxRanks: 1,
        reaction: true,
        apply: (player) => {}
    },
    'focused_strike': {
        name: 'Focused Strike',
        description: 'Active (12 TP): An unarmed strike that, on hit, forces the target to lose 8 TP. No bonus damage.',
        tree: 'monk',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },

    // WAY OF THE OPEN PALM ADDITIONS
    'palm_strike': {
        name: 'Palm Strike',
        description: 'Active (8 TP): Push an adjacent target 1 hex in any direction. Deals no damage.',
        tree: 'Way of the open palm',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'nerve_strike': {
        name: 'Nerve Strike',
        description: 'Passive: On an unarmed hit, 30% chance the target cannot use reactions until their next action.',
        tree: 'Way of the open palm',
        maxRanks: 1,
        prereq: 'unarmed_reaction_block',
        apply: (player) => {}
    },
    'redirect': {
        name: 'Redirect',
        description: 'Reaction (3 TP): After deflecting a ranged attack, fire it at any target within range at base hit chance.',
        tree: 'Way of the open palm',
        maxRanks: 1,
        prereq: 'deflect_arrows',
        reaction: true,
        apply: (player) => {}
    },

    // CLERIC ADDITIONS
    'extended_sentence': {
        name: 'Extended Sentence',
        description: 'Passive: Your trigger spell effects last 2 additional TP ticks per rank.',
        tree: 'cleric',
        maxRanks: 2,
        prereq: 'cleric_trigger_damage',
        apply: (player) => {}
    },
    'holy_ground': {
        name: 'Holy Ground',
        description: 'Active (12 TP): Sanctify your current hex for 30 ticks. Enemies entering lose 2 TP per move into the zone; allies ending their turn there regain 1 HP.',
        tree: 'cleric',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'armistice': {
        name: 'Armistice',
        description: 'Passive: When a trigger spell activates, the attacker must spend 5 extra TP before their next attack (once per activation).',
        tree: 'cleric',
        maxRanks: 1,
        prereq: 'cleric_trigger_damage',
        apply: (player) => {}
    },
    'divine_judgment': {
        name: 'Divine Judgment',
        description: 'Passive: After being attacked 3 consecutive times without retaliating, your next divine spell costs 0 mana.',
        tree: 'cleric',
        maxRanks: 1,
        apply: (player) => {}
    },

    // DRUID ADDITIONS
    'barkskin_active': {
        name: 'Barkskin',
        description: 'Active (8 TP): Harden the skin of yourself or an adjacent ally, reducing incoming damage by 1 for 25 ticks.',
        tree: 'druid',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },
    'wild_shape_adaptation': {
        name: 'Wild Shape Adaptation',
        description: 'Passive: While outdoors (no indoor light penalty), movement costs 1 fewer TP.',
        tree: 'druid',
        maxRanks: 1,
        apply: (player) => {}
    },
    'natures_bond': {
        name: "Nature's Bond",
        description: "Passive: Your animal companion acts immediately after your turn completes, regardless of their accumulated TP.",
        tree: 'druid',
        maxRanks: 1,
        prereq: 'animal_companion',
        apply: (player) => {}
    },
    'venomous_summon': {
        name: 'Venomous Summon',
        description: 'Passive: Your summoned animal companion gains the Poison Bite ability.',
        tree: 'druid',
        maxRanks: 1,
        prereq: 'animal_companion',
        apply: (player) => {}
    },
    'natural_senses': {
        name: 'Natural Senses',
        description: 'Active: Spend your movement action this turn to sense the position of all living entities within 6 hexes, even through walls.',
        tree: 'druid',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },

    // DWARF ADDITIONS
    'stonewall': {
        name: 'Stonewall',
        description: 'Passive: Reduce all forced movement (shove, trip) by 1 additional hex.',
        tree: 'dwarf',
        maxRanks: 1,
        prereq: 'dwarf_solid',
        apply: (player) => {
            player.forcedMoveResistance = (player.forcedMoveResistance || 0) + 10;
        }
    },
    'grudge': {
        name: 'Grudge',
        description: 'Passive: The first time each combat you attack the enemy who most recently hit you, deal +2 damage.',
        tree: 'dwarf',
        maxRanks: 1,
        apply: (player) => {}
    },
    'deep_sense': {
        name: 'Deep Sense',
        description: 'Passive: In underground or indoor environments, gain +4 vision range from cave awareness.',
        tree: 'dwarf',
        maxRanks: 1,
        apply: (player) => {}
    },
    'battle_endurance': {
        name: 'Battle Endurance',
        description: 'Passive: Once per combat, when you would reach 0 HP, survive at 1 HP instead.',
        tree: 'dwarf',
        maxRanks: 1,
        prereq: 'dwarf_solid',
        apply: (player) => {}
    },

    // ELF ADDITIONS
    'keen_hearing': {
        name: 'Keen Hearing',
        description: 'Passive: Cannot be flanked or surprised. Initiative is never penalised by a hidden approach.',
        tree: 'elf',
        maxRanks: 1,
        apply: (player) => {}
    },
    'elven_grace': {
        name: 'Elven Grace',
        description: 'Passive: Sidestep and other reaction movements cost 1 fewer TP.',
        tree: 'elf',
        maxRanks: 1,
        prereq_eval: (p) => !!(p.skills['elf_foliage_expertise'] || p.skills['elf_darkvision']),
        apply: (player) => {}
    },
    'whisper_step': {
        name: 'Whisper Step',
        description: 'Passive: Moving in foliage does not break stealth and costs 1 fewer TP.',
        tree: 'elf',
        maxRanks: 1,
        apply: (player) => {}
    },
    'ageless_patience': {
        name: 'Ageless Patience',
        description: 'Passive: Feinting costs 1 fewer TP.',
        tree: 'elf',
        maxRanks: 1,
        prereq: 'elf_vision',
        apply: (player) => {}
    },

    // ROGUE ADDITIONS
    'vanish': {
        name: 'Vanish',
        description: 'Active (15 TP): Enter stealth immediately, even in combat, as long as no enemy is adjacent.',
        tree: 'rogue',
        maxRanks: 1,
        prereq: 'speedy_stealth',
        active: true,
        apply: (player) => {}
    },
    'dirty_fighting': {
        name: 'Dirty Fighting',
        description: 'Passive: When attacking a target who cannot see you, that target cannot use reactions this turn regardless of whether you hit.',
        tree: 'rogue',
        maxRanks: 1,
        apply: (player) => {}
    },
    'trap_setting': {
        name: 'Trap Setting',
        description: 'Active (15 TP): Place a hidden trap on your current hex. The next enemy to step on it triggers a free basic attack at +10% hit chance.',
        tree: 'rogue',
        maxRanks: 1,
        active: true,
        apply: (player) => {}
    },

    // NEW ARCANE SPELLS
    'learn_blink': {
        name: 'Learn Blink',
        description: 'Unlocks Blink: Teleport to any unoccupied hex within 4 hexes (10 mana, 8 TP). As a reaction when targeted by melee, costs +5 mana.',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('blink');
        }
    },
    'learn_slow': {
        name: 'Learn Slow',
        description: "Unlocks Slow: Halve a target's TP accumulation rate for 30 ticks (10 mana, 10 TP).",
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('slow');
        }
    },
    'learn_force_push': {
        name: 'Learn Force Push',
        description: 'Unlocks Force Push: Push a target 2 hexes in any direction with no damage (8 mana, 8 TP).',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('force_push');
        }
    },
    'learn_haste': {
        name: 'Learn Haste',
        description: 'Unlocks Haste: Target ally immediately gains 20 TP (15 mana, 10 TP).',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('haste');
        }
    },
    'learn_chain_lightning': {
        name: 'Learn Chain Lightning',
        description: 'Unlocks Chain Lightning: Strike a target for 3 damage; arc to nearest enemy for 2, then 1 (12 mana, 10 TP).',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('chain_lightning');
        }
    },
    'learn_energy_shield': {
        name: 'Learn Energy Shield',
        description: 'Unlocks Energy Shield: Absorb the next 6 points of incoming damage for 20 ticks (10 mana, 8 TP).',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('energy_shield');
        }
    },
    'learn_temporal_rift': {
        name: 'Learn Temporal Rift',
        description: 'Unlocks Temporal Rift: Drains the target\'s Time Points to 0, briefly displacing them in time — since a turn only comes around at 100 TP, this pushes their next turn back by a full regen from zero (20 mana, 15 TP).',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('temporal_rift');
        }
    },
    'learn_gravity_well': {
        name: 'Learn Gravity Well',
        description: 'Unlocks Gravity Well: Pull all entities within a 2-hex radius 1 hex toward a target hex (14 mana, 12 TP).',
        tree: 'arcane',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('gravity_well');
        }
    },

    // NEW DIVINE SPELLS
    'learn_curse': {
        name: 'Learn Curse',
        description: 'Unlocks Curse: If the target takes any hostile action in the next 20 ticks, they take 2 divine damage (8 mana, 8 TP).',
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('curse');
        }
    },
    'learn_command': {
        name: 'Learn Command',
        description: 'Unlocks Command: If the target attacks any ally in the next 10 ticks, they take 3 divine damage (10 mana, 10 TP).',
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('command');
        }
    },
    'learn_mark_of_guilt': {
        name: 'Learn Mark of Guilt',
        description: 'Unlocks Mark of Guilt: If the target attacks anyone other than the caster in 20 ticks, they take 2 divine damage (8 mana, 8 TP).',
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('mark_of_guilt');
        }
    },
    'learn_divine_wrath': {
        name: 'Learn Divine Wrath',
        description: 'Unlocks Divine Wrath: Deal 1 damage now; if the target advances toward the caster within 15 ticks, deal 3 more (10 mana, 10 TP).',
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('divine_wrath');
        }
    },
    'learn_excommunicate': {
        name: 'Learn Excommunicate',
        description: "Unlocks Excommunicate: The target's allies within 3 hexes cannot receive healing for 20 ticks (14 mana, 12 TP).",
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('excommunicate');
        }
    },
    'learn_condemn': {
        name: 'Learn Condemn',
        description: "Unlocks Condemn: If the target's next attack misses, they take 3 divine damage from divine rejection (10 mana, 10 TP).",
        tree: 'divine',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('condemn');
        }
    },

    // NEW NATURE SPELLS
    'learn_root': {
        name: 'Learn Root',
        description: 'Unlocks Root: Target cannot move for 5 TP ticks but can still act and cast (8 mana, 8 TP).',
        tree: 'nature',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('root');
        }
    },
    'learn_barkskin_spell': {
        name: 'Learn Barkskin (Spell)',
        description: 'Unlocks Barkskin spell: Target ally reduces all incoming damage by 1 for 30 ticks (10 mana, 8 TP).',
        tree: 'nature',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('barkskin_spell');
        }
    },
    'learn_natures_vigor': {
        name: "Learn Nature's Vigor",
        description: "Unlocks Nature's Vigor: Target ally regenerates 1 HP per 10 TP ticks for 30 ticks (8 mana, 8 TP).",
        tree: 'nature',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('natures_vigor');
        }
    },
    'learn_spore_cloud': {
        name: 'Learn Spore Cloud',
        description: "Unlocks Spore Cloud: All enemies in a 2-hex radius have TP accumulation reduced by 25% for 10 ticks (10 mana, 10 TP).",
        tree: 'nature',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('spore_cloud');
        }
    },
    'learn_call_of_the_wild': {
        name: 'Learn Call of the Wild',
        description: 'Unlocks Call of the Wild: Empower your active summon with +2 attack damage and +6 HP for 20 ticks (12 mana, 10 TP).',
        tree: 'nature',
        maxRanks: 1,
        prereq: 'learn_summon_animal',
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('call_of_the_wild');
        }
    },
    'learn_camouflage': {
        name: 'Learn Camouflage',
        description: 'Unlocks Camouflage: Target ally gains +15 to stealth for 20 ticks (8 mana, 8 TP).',
        tree: 'nature',
        maxRanks: 1,
        apply: (player) => {
            if (!player.unlockedBaseSpells) player.unlockedBaseSpells = [];
            player.unlockedBaseSpells.push('camouflage');
        }
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
        description: `Grants +2 damage when using a ${label} per rank.`,
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

    if (id === 'sword') {
        s[`sword_riposte`] = {
            name: 'Riposte',
            description: 'Reaction (5 TP): After a successful parry, immediately make a basic attack against the attacker.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: `sword_parry`,
            reaction: true,
            apply: (player) => {}
        };
        s[`sword_footwork`] = {
            name: "Duelist's Footwork",
            description: 'Passive: After successfully parrying, move 1 hex for free if an adjacent hex is unoccupied.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: `sword_parry`,
            apply: (player) => {}
        };
        s[`threatening_presence`] = {
            name: 'Threatening Presence',
            description: "Passive: Enemies within sword reach must spend 3 extra TP to cast spells.",
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            apply: (player) => {}
        };
        s[`in_the_way`] = {
            name: 'In the Way',
            description: 'Reaction (2 TP): When an adjacent ally moves away from their hex, immediately step into the hex they vacated.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: `sword_parry`,
            reaction: true,
            apply: (player) => {}
        };
        s[`bladestorm`] = {
            name: 'Bladestorm',
            description: 'Active (20 TP): Sweep your sword at all adjacent enemies simultaneously at base hit chance and damage.',
            tree: 'weapons',
            maxRanks: 1,
            active: true,
            apply: (player) => {}
        };
    }

    if (id === 'axe') {
        s[`axe_rend`] = {
            name: 'Rend',
            description: 'Passive: On a hit, target bleeds for 1 damage per 10 TP ticks for 5 cycles.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            apply: (player) => {}
        };
        s[`axe_cleave`] = {
            name: 'Armor Cleave',
            description: 'Passive: Axe attacks ignore 1 point of armor per rank (max 2 ranks).',
            tree: 'weapons',
            maxRanks: 2,
            prereq_eval: (p) => ((p.skills[dmgId] || 0) >= 2),
            apply: (player) => {}
        };
        s[`headsmans_blow`] = {
            name: "Headsman's Blow",
            description: 'Active (25 TP): A deliberate heavy chop dealing +5 damage on hit.',
            tree: 'weapons',
            maxRanks: 1,
            prereq_eval: (p) => ((p.skills[dmgId] || 0) >= 3),
            active: true,
            apply: (player) => {}
        };
        s[`hack_and_slash`] = {
            name: 'Hack and Slash',
            description: 'Active (16 TP): Attack two different adjacent enemies in sequence at base hit chance and damage.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            active: true,
            apply: (player) => {}
        };
    }

    if (id === 'bow') {
        s[`bow_point_blank`] = {
            name: 'Point Blank',
            description: 'Passive: No range penalty when shooting an adjacent target.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: hitId,
            apply: (player) => {}
        };
        s[`bow_aimed_shot`] = {
            name: 'Aimed Shot',
            description: 'Active (20 TP): Your next shot this turn deals +2 damage and, on hit, the target loses 5 TP.',
            tree: 'weapons',
            maxRanks: 1,
            active: true,
            apply: (player) => {}
        };
        s[`bow_suppressive`] = {
            name: 'Suppressive Fire',
            description: 'Reaction (8 TP): When an enemy ends movement adjacent to an ally you can see, take a free shot at them.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: dmgId,
            reaction: true,
            apply: (player) => {}
        };
        s[`bow_cover`] = {
            name: 'Cover Fire',
            description: 'Active (15 TP): Declare a 3-hex zone. Enemies entering pay 4 extra TP to move through it until your next turn.',
            tree: 'weapons',
            maxRanks: 1,
            active: true,
            apply: (player) => {}
        };
    }

    if (id === 'club') {
        s[`club_stun`] = {
            name: 'Stun Strike',
            description: 'Active (15 TP): On a hit, target loses 10 TP immediately.',
            tree: 'weapons',
            maxRanks: 1,
            active: true,
            apply: (player) => {}
        };
        s[`club_concuss`] = {
            name: 'Concuss',
            description: 'Passive: When you deal 5 or more damage in a single hit, the target cannot use reactions until their next action.',
            tree: 'weapons',
            maxRanks: 1,
            prereq: `club_stun`,
            apply: (player) => {}
        };
        s[`club_knockdown`] = {
            name: 'Knockdown',
            description: 'Active (12 TP): Swing at the target\'s legs. On a hit, automatically applies a trip attempt.',
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

    // How many prepared spells a character can have built at once (base 8,
    // see entities.js/characterCreation.js) — one of these exists per school
    // and all three stack, so a caster invested across all three trees can
    // reach 8 + 2 + 2 + 2 = 14.
    s[`${school}_spell_slots`] = {
        name: `${capitalized} Spell Mastery`,
        description: 'Increases the number of spells you can have prepared at once by 2.',
        tree: school,
        maxRanks: 1,
        apply: (player) => {
            player.maxSpellSlots = (player.maxSpellSlots || 8) + 2;
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

// The lich tree: never funded by the normal attribute pool or wildcard
// points (deliberately absent from ui.js's standardTrees list) and never
// granted through level-up. The only way to gain a rank is window.grantSkillRank
// being called directly by a necromancer-arc quest reward — which is also
// what makes the tree visible at all, since ui.js only lists a tree once the
// player already holds unspent points in it or a rank in one of its skills.
Object.assign(skills, {
    'lich_deathless_flesh': {
        name: 'Deathless Flesh',
        description: 'Your flesh forgets how to die properly. Reduces all incoming damage by 1 per rank.',
        tree: 'lich',
        maxRanks: 3,
        apply: (player) => {
            player.baseReduction = (player.baseReduction || 0) + 1;
        }
    },
    'lich_grave_chill': {
        name: 'Grave Chill',
        description: 'Melee attacks drain a sliver of the target\'s life into your own. Heals 2 HP per rank on a successful melee hit.',
        tree: 'lich',
        maxRanks: 2,
        apply: (player) => {
            player.lifeDrainOnMeleeHit = (player.lifeDrainOnMeleeHit || 0) + 2;
        }
    },
    'lich_withering_touch': {
        name: 'Withering Touch',
        description: 'Your touch withers what it strikes. Attacks apply a stacking damage-over-time.',
        tree: 'lich',
        maxRanks: 3,
        apply: (player) => {
            player.witheringTouchStacks = (player.witheringTouchStacks || 0) + 1;
        }
    },
    'lich_command_the_dead': {
        name: 'Command the Dead',
        description: 'Nearby undead recognize a kindred will and fight for you instead of against you.',
        tree: 'lich',
        maxRanks: 1,
        apply: (player) => {
            player.commandsUndead = true;
        }
    },
    'lich_soul_anchor': {
        name: 'Soul Anchor',
        description: "A fragment of you refuses to leave. Once per rest, damage that would kill you instead leaves you at 1 HP.",
        tree: 'lich',
        maxRanks: 1,
        apply: (player) => {
            player.hasSoulAnchor = true;
        }
    }
});

Object.assign(skills, {
    'persuasion': {
        name: 'Persuasion',
        description: 'A modest, bounded discount (5%/rank, capped 15%) on the cost of anything you offer someone to win their cooperation. Never unlocks an outcome by itself — you still need something they actually want.',
        tree: 'social',
        maxRanks: 3,
        apply: (player) => {}
    },
    'insight': {
        name: 'Insight',
        description: "Reads people accurately — reveals what an NPC actually wants (and flags when they're bluffing) without having to guess and risk the consequences.",
        tree: 'social',
        maxRanks: 3,
        apply: (player) => {}
    },
    'intimidation': {
        name: 'Intimidation',
        description: 'An alternative to paying someone off: lean on them instead. Trades your reputation for not having to give anything up.',
        tree: 'social',
        maxRanks: 2,
        apply: (player) => {}
    },
    'lockpicking': {
        name: 'Lockpicking',
        description: 'Skill at opening locks without the key.',
        tree: 'practical',
        maxRanks: 3,
        apply: (player) => {}
    },
    'survival': {
        name: 'Survival',
        description: 'Reduces the chance of being ambushed while resting in the wilderness.',
        tree: 'practical',
        maxRanks: 2,
        apply: (player) => {}
    },
    'appraisal': {
        name: 'Appraisal',
        description: 'A bounded improvement to shop prices, and reveals a bit more about an item than the eye alone would tell you.',
        tree: 'practical',
        maxRanks: 2,
        apply: (player) => {}
    }
});

window.skills = skills;

// Either the druid or elf pickup of Knowledge: Nature (mutually exclusive
// via anti_prereq, but functionally identical) — checked wherever the game
// wants to know "does this party member understand what happened here."
function hasKnowledgeNature(entity) {
    return !!(entity?.skills?.druid_knowledge_nature || entity?.skills?.elf_knowledge_nature);
}
window.hasKnowledgeNature = hasKnowledgeNature;

// Rank (1-3) of whichever Knowledge: Nature pickup the entity has, 0 if
// neither — used to scale how much of a trail (e.g. the unicorn's tracks,
// gameEngine.js) is visible and how much detail (direction/age) reading it
// reveals, rather than Knowledge: Nature being a flat yes/no gate.
function getKnowledgeNatureRank(entity) {
    return entity?.skills?.druid_knowledge_nature || entity?.skills?.elf_knowledge_nature || 0;
}
window.getKnowledgeNatureRank = getKnowledgeNatureRank;

function hasKnowledgeReligion(entity) {
    return !!entity?.skills?.knowledge_religion;
}
window.hasKnowledgeReligion = hasKnowledgeReligion;

// Generic "does this character actually know spell X" check — same idea as
// hasKnowledgeNature/hasKnowledgeReligion above, but for spells rather than
// knowledge skills. Lets dialogue treat a learned spell as a real source of
// in-world insight (e.g. Smite Evil training making a disciple of the dead
// feel wrong to be near, the same way Knowledge: Religion lets you read the
// literal symbols) rather than spells being purely a combat button.
// Checks unlockedBaseSpells (set the moment the underlying skill is learned,
// see e.g. learn_smite_evil's apply()) rather than createdSpells, since the
// player may not have gotten around to customizing every spell they've
// unlocked — knowing OF a spell is what should gate a dialogue option, not
// whether they bothered building a casting configuration for it yet.
function hasSpellUnlocked(entity, baseSpellId) {
    return !!(entity?.unlockedBaseSpells || []).includes(baseSpellId);
}
window.hasSpellUnlocked = hasSpellUnlocked;
