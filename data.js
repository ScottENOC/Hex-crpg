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
    }
};

const classData = {
    fighter: {
        bonus: {fighter: 1, strength: 2, endurance: 2, weapons: 4 }
    },
    rogue: {
        bonus: {rogue: 1, agility: 3, weapons: 1, endurance: 2 }
    },
    cleric: {
        bonus: {cleric: 1, divine: 2, endurance: 2, weapons: 1, strength: 1 }
    },
    wizard: {
        bonus: {wizard: 1, arcane: 5, endurance: 1 }
    },
    druid: {
        bonus: {druid: 1, nature: 2, endurance: 2, strength: 1, agility: 1 }
    },
    monk: {
        bonus: { monk: 1, weapons: 1, way_of_the_open_palm: 2, strength: 1, endurance: 1, agility: 1 }
    }
};

// Expose globals for other scripts
window.raceData = raceData;
window.classData = classData;
