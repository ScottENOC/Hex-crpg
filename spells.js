// spells.js

const baseSpells = {
    'firebolt': {
        name: 'Firebolt',
        school: 'arcane',
        baseMana: 5,
        baseMagnitude: 5,
        baseRange: 8,
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
    'divine_silence': {
        name: 'Divine Silence',
        school: 'divine',
        baseMana: 15,
        baseMagnitude: 6, // Ongoing damage
        baseRange: 8,
        type: 'debuff',
        ongoing: true,
        debuffType: 'silence_penalty'
    },
    'sanctuary': {
        name: 'Sanctuary',
        school: 'divine',
        baseMana: 12,
        baseMagnitude: 1, // TP loss amount
        baseRange: 8,
        type: 'buff',
        ongoing: true,
        debuffType: 'sanctuary_protected'
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
        // 'unicorn' is real content but not a normal option here — see
        // ui.js's updateSpellPreview, which only lists it once
        // learn_unicorn_summon is granted (druid grove questline) AND the
        // permanent-companion conditions are actually met (animal_companion,
        // no existing companion). It can never be cast as an ordinary
        // temporary summon.
        summons: ['wolf', 'boar', 'tiger', 'eagle', 'unicorn']
    },
    'counterspell': {
        name: 'Counterspell',
        school: 'arcane',
        baseMana: 10,
        type: 'dispel',
        baseRange: 8
    },
    'dragon_breath': {
        name: 'Dragon Breath',
        school: 'arcane',
        baseMana: 20,
        baseMagnitude: 15,
        baseRange: 4,
        baseRadius: 1,
        type: 'aoe_damage'
    },
    'entangle': {
        name: 'Entangle',
        school: 'nature',
        baseMana: 12,
        type: 'aoe_debuff',
        baseRange: 8,
        baseRadius: 1,
        debuffType: 'entangled'
    },
    // CALM ANIMAL: only affects a genuine wild-animal-type creature (tags
    // includes 'animal') or a rider mounted on one — resolveSpell (below)
    // redirects the debuff onto the mount itself when cast at a rider, and
    // explicitly excludes 'fey' (Unicorn) and 'dragon' despite either
    // possibly also carrying the 'animal' tag, per design: this is a
    // mundane-beast spell, not a charm for legendary creatures. The caster
    // picks a mode at cast time (calmMode: 'stay'/'come'/'chase' — see
    // ui.js's Calm Mode selector and aiProcess's CALMED check,
    // gameEngine.js) rather than the mode being baked into the base spell.
    'calm_animal': {
        name: 'Calm Animal',
        school: 'nature',
        baseMana: 8,
        baseRange: 6,
        type: 'debuff',
        debuffType: 'calmed',
        validTags: ['animal'],
        excludeTags: ['fey', 'dragon'],
        ongoing: true
    },
    'temporal_rift': {
        name: 'Temporal Rift',
        school: 'arcane',
        baseMana: 20,
        baseRange: 8,
        type: 'timeskip'
    }
};

window.baseSpells = baseSpells;
