// characterCreation.js
function initializePlayer(race, cls, gender, campaign = "3", voice = "pc_1") {
  window.party = [];
  window.partyInventory = undefined; // reset the shared pool for a fresh game (see partyInventory.js)
  window.selectedCharacterIndex = 0;
  window.currentCampaign = campaign;

  // A brand-new character must never inherit transient world/combat state from
  // an earlier run in the same page. In particular, Northwatch's siege uses a
  // global state object and its physical assault can otherwise keep advancing
  // after returning to the creator, eventually stealing the new game's turn
  // queue from hundreds of hexes away.
  window.isInCombat = false;
  window.siegeState = null;
  window.borderWarSallyActive = false;
  window.greenskinAssaultTriggered = false;
  window.greenskinWaveSpawned = false;
  window.catapultHasFired = false;

  // Renderer-owned humanoid body images are loaded once by humanoidRenderer.js
  // with the current PRESENTATION_BUILD cache token. Do not rewrite Image.src
  // here: doing so makes only human-female/average temporarily unready exactly
  // when the game starts, while male and other direct-rendered bodies stay ready.
  
  const mainChar = createCharacterData(race, cls, "Player (Main)", gender, voice);
  // Bumped from 100/40 now that armor no longer comes free — enough left
  // over after buying a starting armor piece and its training skill.
  if (campaign === "1") mainChar.gold = 150;
  if (campaign === "2") mainChar.gold = 65;

  if (window.difficultyMode === 'easy') {
      mainChar.gold = Math.round(mainChar.gold * 1.5);
      if (window.grantSkillRank) window.grantSkillRank(mainChar, 'health'); // a free rank, not paid from the attribute pool
      mainChar.freeSkillRanks = { health: 1 }; // respec (resolveRespec, ui.js) preserves ranks recorded here instead of refunding them
  }

  window.party.push(mainChar);
  window.player = mainChar; // Keep window.player as a reference to the selected one for compatibility
  if (window.wireSharedInventory) window.wireSharedInventory(mainChar);
}

function createCharacterData(race, cls, name, gender = "female", voice = "pc_1") {
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
    voice,
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
    classLevels: { [cls]: 1 }, // total levels taken in each class, order not tracked — used for dialogue gating and respec
    attributes: initialAttributes,
    unlockedBaseSpells: [],
    unlockedCastingOptions: {}, 
    manaCaps: { arcane: 10, divine: 10, nature: 10 },
    maxSpellSlots: 8,
    createdSpells: [],
    inventory: [],
    gold: 0,
    offhandAttackAvailable: false,
    side: 'player',
    tags: ['humanoid'],
    riderSize: (race === 'human' || race === 'elf' || race === 'dwarf' || race === 'goblin' || race === 'orc') ? 3 : 0,
    mountSize: 0,
    riding: null,
    rider: null,
    bodyType: 'average',
    clothingColors: {},
    equipped: {
        weapon: null,
        offhand: null,
        armor: null,
        helmet: null,
        shirt: null,
        pants: null,
        bra: null,
        underwear: null
    }
  };

  const rb = window.raceData[race].bonus;
  for (let key in rb) char.attributes[key] += rb[key];
  const cb = window.classData[cls].bonus;
  for (let key in cb) char.attributes[key] += cb[key];

  // Starting equipment — no armor by default: equipping any armor tier
  // requires its matching *_armor_training skill (enforced in ui.js's
  // equipItem), and a fresh level-1 character hasn't bought any skills yet.
  // Weapons/shields aren't skill-gated, so those still start equipped;
  // starting gold is bumped a bit (see initializePlayer) so a player who
  // wants armor right away can buy both the piece and its training skill.
  if (cls === 'fighter') {
    char.inventory.push('sword');
    char.equipped.weapon = 'sword';
  } else if (cls === 'rogue') {
    char.inventory.push('dagger');
    char.equipped.weapon = 'dagger';
    char.inventory.push('torch');
    char.inventory.push('bow');
  } else if (cls === 'cleric') {
    char.inventory.push('club');
    char.equipped.weapon = 'club';
    char.inventory.push('wooden_shield');
    char.equipped.offhand = 'wooden_shield';
  } else if (cls === 'druid') {
    char.inventory.push('club');
    char.equipped.weapon = 'club';
  } else {
    // Default / Wizard / Monk etc.
    char.inventory.push('dagger');
    char.equipped.weapon = 'dagger';
  }
  
  return char;
}

window.initializePlayer = initializePlayer;
window.createCharacterData = createCharacterData;

// index.html calls this inline. main.js replaces it with the full version once
// DOMContentLoaded runs, but defining a safe early implementation here avoids a
// race/stale-cache TypeError if the campaign select is changed before main.js's
// listener has installed its copy.
if (typeof window.toggleArenaOptions !== 'function') {
  window.toggleArenaOptions = function() {
    const campaign = document.getElementById('campaign-select')?.value;
    const optionsDiv = document.getElementById('arena-roguelike-options');
    const ironmanCheck = document.getElementById('ironman-check');
    if (optionsDiv) optionsDiv.style.display = campaign === '1' ? 'block' : 'none';
    if (ironmanCheck) ironmanCheck.disabled = campaign === '4';
    if (window.updateRoguelikePreview) window.updateRoguelikePreview();
  };
}

// Keep identity/pronouns in a small compatibility module rather than forcing
// the legacy renderer to reinterpret its long-standing .gender body-art key.
// The shared build token makes this new module cache-safe in installed/iOS use.
if (!document.querySelector('script[data-identity-presentation]')) {
  const identityScript = document.createElement('script');
  identityScript.src = `identityPresentation.js?build=${encodeURIComponent(window.PRESENTATION_BUILD || 'identity-v1')}`;
  identityScript.dataset.identityPresentation = 'true';
  identityScript.async = false;
  document.head.appendChild(identityScript);
}

// Northwatch defenders exist in the persistent Campaign 2 world, but the
// attacking siege force must not exist until an explicit siege dialogue/cheat
// path activates it. This compatibility module wraps world setup + activation
// without touching unrelated encounters.
if (!document.querySelector('script[data-northwatch-siege-spawn]')) {
  const siegeSpawnScript = document.createElement('script');
  siegeSpawnScript.src = 'northwatchSiegeSpawn.js?build=20260928-explicit-siege-v1';
  siegeSpawnScript.dataset.northwatchSiegeSpawn = 'true';
  siegeSpawnScript.async = false;
  document.head.appendChild(siegeSpawnScript);
}

// Layered clothing is kept in a small compatibility module too. Loading it
// here avoids another index.html cache token and makes the feature available
// before inventory UI setup finishes.
if (!document.querySelector('script[data-layered-clothing]')) {
  const clothingScript = document.createElement('script');
  clothingScript.src = `clothingSystem.js?build=${encodeURIComponent(window.PRESENTATION_BUILD || '20260930-visibility-assets-v1')}`;
  clothingScript.dataset.layeredClothing = 'true';
  clothingScript.async = false;
  document.head.appendChild(clothingScript);
}