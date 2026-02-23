// characterCreation.js
function initializePlayer(race, cls, gender, campaign = "3") {
  window.party = [];
  window.selectedCharacterIndex = 0;
  window.currentCampaign = campaign;
  
  const mainChar = createCharacterData(race, cls, "Player (Main)", gender);
  window.party.push(mainChar);
  window.player = mainChar; // Keep window.player as a reference to the selected one for compatibility
}

function createCharacterData(race, cls, name, gender = "female") {
  // Gather all possible attribute keys to initialize them to 0
  const allAttributes = new Set(['strength', 'endurance', 'agility', 'weapons', 'divine', 'nature', 'arcane', 'wildcard', 'monk', 'Way of the open palm']);
  for (const r in window.raceData) {
    for (const attr in window.raceData[r].bonus) {
      allAttributes.add(attr);
    }
  }
  for (const c in window.classData) {
    for (const attr in window.classData[c].bonus) {
      allAttributes.add(attr);
    }
  }

  const initialAttributes = {};
  allAttributes.forEach(attr => {
    initialAttributes[attr] = 0;
  });
  
  const char = {
    name: name,
    race,
    gender,
    class: cls,
    level: 1,
    exp: 0,
    hp: 10,
    maxHp: 10,
    currentMana: 0,
    maxMana: 0,
    baseDamage: 1,
    toHitMelee: 0,
    toHitRanged: 0,
    toHitSpell: 0,
    passiveDodge: 0,
    parriesRemaining: 3,
    timePoints: 0,
    timePointsPerTick: 1,
    skills: {},
    attributes: initialAttributes,
    unlockedBaseSpells: [],
    unlockedCastingOptions: {}, 
    manaCaps: { arcane: 10, divine: 10, nature: 10 },
    createdSpells: [],
    inventory: [],
    gold: 0,
    offhandAttackAvailable: false,
    side: 'player',
    tags: ['humanoid'],
    riderSize: (race === 'human' || race === 'elf' || race === 'dwarf') ? 3 : 0,
    mountSize: 0,
    riding: null,
    rider: null,
    equipped: {
        weapon: null,
        offhand: null,
        armor: null,
        helmet: null
    }
  };

  const rb = window.raceData[race].bonus;
  for (let key in rb) char.attributes[key] += rb[key];
  const cb = window.classData[cls].bonus;
  for (let key in cb) char.attributes[key] += cb[key];

  // Starting equipment
  if (cls === 'fighter') {
    char.inventory.push('sword');
    char.equipped.weapon = 'sword';
    char.inventory.push('light_armor');
    char.equipped.armor = 'light_armor';
  } else if (cls === 'rogue') {
    char.inventory.push('dagger');
    char.equipped.weapon = 'dagger';
    char.inventory.push('torch');
    char.inventory.push('bow');
  } else if (cls === 'cleric') {
    char.inventory.push('club');
    char.equipped.weapon = 'club';
    char.inventory.push('light_armor');
    char.equipped.armor = 'light_armor';
    char.inventory.push('wooden_shield');
    char.equipped.offhand = 'wooden_shield';
  } else if (cls === 'druid') {
    char.inventory.push('club');
    char.equipped.weapon = 'club';
    char.inventory.push('light_armor');
    char.equipped.armor = 'light_armor';
  } else {
    // Default / Wizard / Monk etc.
    char.inventory.push('dagger');
    char.equipped.weapon = 'dagger';
  }
  
  return char;
}

window.initializePlayer = initializePlayer;
window.createCharacterData = createCharacterData;
