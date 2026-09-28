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
// DOMContentLoaded, after skills/monsters/npcBuilder have been defined. Loading
// from data.js keeps the branch-compatible index.html script list stable while
// giving these modules their own iOS-safe cache tokens. Listener registration
// order matters: the policy layer runs after the core wrapper is installed.
if (!window.__npcProgressionModuleLoaded) {
    window.__npcProgressionModuleLoaded = true;
    document.write('<script src="npcProgression.js?build=20260929-pc-style-npcs-v1"><\/script>');
    document.write('<script src="npcProgressionPolicy.js?build=20260929-package-policy-v3"><\/script>');
}

// Dialogue hearing installs after the rest of the blocking game scripts have
// loaded (DOMContentLoaded), but is fetched here so index.html stays stable.
// This gives source volume, distance falloff, partial intelligibility, reactive
// appearance chatter, and the elf Keen Hearing passive one cache-busted module.
if (!window.__dialogueHearingModuleLoaded) {
    window.__dialogueHearingModuleLoaded = true;
    document.write('<script src="dialogueHearing.js?build=20260929-dialogue-hearing-v1"><\/script>');
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