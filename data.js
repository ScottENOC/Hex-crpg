// data.js

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
