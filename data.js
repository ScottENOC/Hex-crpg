// data.js

// data.js is the first game script in index.html. Install the asset scheduler
// synchronously here so every later Image.src assignment is redirected,
// prioritised and concurrency-limited before any renderer/game code can run.
// document.write is safe in this narrow parser-time use: this file is loaded by
// a normal blocking <script> while the document is still being parsed.
if (!window.__assetLoadSchedulerInstalled) {
    document.write('<script src="assetLoadScheduler.js?v=2"><\/script>');
}

const raceData = {
    human: {
        bonus: { agility: 1, strength: 1, endurance: 1, wildcard: 1 }
    },
    dwarf: {
        bonus: { dwarf: 1, endurance: 2, strength: 1 }
    },
    elf: {
        bonus: {elf: 1, agility: 2, arcane: 1 }
    },
    // Quick and opportunistic rather than strong — leans into the rogue
    // archetype the same way dwarf leans fighter-tanky and elf leans
    // arcane/ranged. No endurance bonus (frailer than the other three),
    // matching the flavor of a scrappy skirmisher rather than a front-liner.
    goblin: {
        bonus: { goblin: 1, agility: 2, weapons: 1 }
    },
    // Strength, ferocity, and momentum — a front-line brawler race, the
    // opposite lean from goblin's agile-skirmisher build. Heavy endurance
    // plus strength/weapons rather than agility.
    orc: {
        bonus: { orc: 1, strength: 2, endurance: 1 }
    }
};

const classData = {
    fighter: {
        bonus: {fighter: 1, strength: 2, endurance: 2, weapons: 2 }
    },
    rogue: {
        bonus: {rogue: 1, agility: 3, weapons: 1, endurance: 2 }
    },
    cleric: {
        bonus: {cleric: 1, divine: 2, endurance: 2, weapons: 1, strength: 1 }
    },
    wizard: {
        bonus: {wizard: 1, arcane: 4, endurance: 1, agility: 1 }
    },
    druid: {
        bonus: {druid: 1, nature: 2, endurance: 2, strength: 1, agility: 1 }
    },
    monk: {
        bonus: { monk: 1, weapons: 0, 'Way of the open palm': 2, strength: 1, endurance: 2, agility: 1 }
    }
};

// Expose globals for other scripts
window.raceData = raceData;
window.classData = classData;

// Humanoid NPC progression is loaded early but defers its wrappers until
// DOMContentLoaded, after skills/monsters/npcBuilder/campaign content have been
// defined. Listener order is deliberate: generic generator -> conversion
// policy -> named authored builds -> final mode/invariant layer -> companions
// -> developer inspector.
if (!window.__npcProgressionModuleLoaded) {
    window.__npcProgressionModuleLoaded = true;
    document.write('<script src="npcProgression.js?build=20260929-pc-style-npcs-v1"><\/script>');
    document.write('<script src="npcProgressionPolicy.js?build=20260929-package-policy-v3"><\/script>');
    document.write('<script src="namedNpcProgression.js?build=20260929-authored-npcs-v1"><\/script>');
    document.write('<script src="npcProgressionModes.js?build=20260929-progression-modes-v2"><\/script>');
    document.write('<script src="companionProgression.js?build=20260929-canonical-companions-v1"><\/script>');
    document.write('<script src="devNpcInspector.js?build=20260929-dev-npc-inspector-v1"><\/script>');
}

// Dialogue hearing installs after the rest of the blocking game scripts have
// loaded (DOMContentLoaded), but is fetched here so index.html stays stable.
// This gives source volume, distance falloff, partial intelligibility, reactive
// appearance chatter, and the elf Keen Hearing passive one cache-busted module.
if (!window.__dialogueHearingModuleLoaded) {
    window.__dialogueHearingModuleLoaded = true;
    document.write('<script src="dialogueHearing.js?build=20260929-dialogue-hearing-v2"><\/script>');
}

// Optional authored appearance presets install after the progression wrappers,
// then decorate final character/NPC builds without changing the random/default
// path for anyone who does not have a preset.
if (!window.__appearancePresetsModuleLoaded) {
    window.__appearancePresetsModuleLoaded = true;
    document.write('<script src="appearancePresets.js?build=20260929-appearance-presets-v1"><\/script>');
}

// Companions keep the game's established companionAttitude approval meter and
// add persistent familiarity + trust alongside it. Clothing controls consult
// familiarity + trust (never approval/romance), preserve each companion's
// initial coverage as a boundary, and allow authored stricter limits.
if (!window.__companionRelationshipsModuleLoaded) {
    window.__companionRelationshipsModuleLoaded = true;
    document.write('<script src="companionRelationships.js?build=20260929-companion-relationships-v2"><\/script>');
}

// Relationship progression is intentionally separate from the storage/
// permission layer above: familiarity grows from unique personal conversations
// and slow shared time, while trust moves only through explicit authored events.
// Wren's Campaign 2 start is authored as an existing tavern acquaintance rather
// than the generic 10/10 stranger baseline.
if (!window.__companionRelationshipProgressionModuleLoaded) {
    window.__companionRelationshipProgressionModuleLoaded = true;
    document.write('<script src="companionRelationshipProgression.js?build=20260929-companion-relationship-progression-v2"><\/script>');
}

// Wren's Millbrook personal quest sits on top of the relationship system. It is
// intentionally build-agnostic: ordinary questioning can always solve it, while
// Knowledge, Insight/Persuasion, Keen Perception and Stealth open parallel routes
// and richer evidence without making any one skill mandatory.
if (!window.__wrenParentsInvestigationModuleLoaded) {
    window.__wrenParentsInvestigationModuleLoaded = true;
    document.write('<script src="wrenParentsInvestigation.js?build=20260929-wren-parents-investigation-v2"><\/script>');
}

// Wren is an origin-character-scale companion rather than a fixed approval
// dispenser. Campaign choices and direct conversations build a persistent player
// ethos and slowly shape Wren's own loyalty, mercy and attachment security. Her
// response to the same protagonist behaviour depends on the relationship already
// built: high trust means more influence; betrayal can instead push her away.
if (!window.__wrenCharacterArcModuleLoaded) {
    window.__wrenCharacterArcModuleLoaded = true;
    document.write('<script src="wrenCharacterArc.js?build=20260929-wren-character-arc-v1"><\/script>');
}

// Affinity is separate again from approval/trust/familiarity and from Wren's
// moral character arc: friendship, romantic feeling and physical attraction can
// move independently. Canonical orientation is authored as hard attraction and
// romance caps, so player choices can develop chemistry without rewriting a
// companion's sexuality. Attraction contributes continuously from 1 upward;
// pronouns are never used as an attraction shortcut.
if (!window.__companionAffinityModuleLoaded) {
    window.__companionAffinityModuleLoaded = true;
    document.write('<script src="companionAffinity.js?build=20260929-companion-affinity-v3"><\/script>');
}

// Romance agreements interpret affinity rather than replacing it. Commitment,
// sex and exclusivity are separate authored concepts: some companions are
// monogamous, some support consensual non-monogamy, and Brother Alden can be
// romantically exclusive while explicitly allowing a partner sexual freedom.
if (!window.__companionRomanceModuleLoaded) {
    window.__companionRomanceModuleLoaded = true;
    document.write('<script src="companionRomance.js?build=20260929-companion-romance-v1"><\/script>');
}

// Wren Chapter 2 reuses Reddale's existing Ironbond/Baron politics and stealth
// mission framework. It starts after The Long Silence, follows Venn's payment
// trail through Reddale, and makes the private aftermath react to the friendship,
// romance, attraction, trust and character development already built with Wren.
if (!window.__wrenPriceOfSilenceModuleLoaded) {
    window.__wrenPriceOfSilenceModuleLoaded = true;
    document.write('<script src="wrenPriceOfSilence.js?build=20260929-wren-price-of-silence-v1"><\/script>');
}

// Declarative hints for NPC/AI skill spending. Existing gameplay prereq fields
// remain authoritative; these simply make equipment relationships explicit so
// future generators/tools do not have to infer everything from descriptions.
document.addEventListener('DOMContentLoaded', () => {
    Object.entries(window.skills || {}).forEach(([skillId, skill]) => {
        const weaponMatch = skillId.match(/^(sword|axe|bow|spear|dagger|club)_(?:hit|dmg|parry|parry_cost|parry_chance|riposte|feint)/);
        if (weaponMatch) skill.npcEquipmentWeapon = weaponMatch[1];
    });
    ['shield_proficiency', 'shield_bash', 'shield_other'].forEach(id => {
        if (window.skills?.[id]) window.skills[id].npcRequiresShield = true;
    });
    ['riding', 'riding_druid', 'riding_paladin'].forEach(id => {
        if (window.skills?.[id]) window.skills[id].npcRequiresMount = true;
    });
});