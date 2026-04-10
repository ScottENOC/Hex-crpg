// main.js - VERSION 2.0 - DEFINITIVE
console.log("--- MAIN.JS VERSION 2.0 LOADED ---");

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM Content Loaded - Preloading assets and setting up listeners");
    preloadAssets();

    const createCharacterButton = document.getElementById("createCharacterButton");
    if (createCharacterButton) {
        createCharacterButton.addEventListener("click", window.startGame);
    }

    // Asset Preloading Logic
    async function preloadAssets() {
        const priorityImages = [
            {key: 'floor1', src: 'images/arenaHexFloor1.png'},
            {key: 'floor2', src: 'images/arenaHexFloor2.png'},
            {key: 'floor3', src: 'images/arenaHexFloor3.png'},
            {key: 'floor4', src: 'images/arenaHexFloor4.png'}
        ];
        
        const otherImages = [
            {key: 'playerBase', src: 'images/elf.png'},
            {key: 'leatherArmor', src: 'images/elfleatherarmour.png'},
            {key: 'chainArmor', src: 'images/elfchainarmour.png'},
            {key: 'monsterDefault', src: 'images/goblin.png'},
            {key: 'orcBase', src: 'images/orc.png'},
            {key: 'swordIcon', src: 'images/sword.png'},
            {key: 'humanBase', src: 'images/humanfemale.png'},
            {key: 'humanHair', src: 'images/humanfemalehair.png'},
            {key: 'humanMaleHair', src: 'images/humanmalehair.png'},
            {key: 'humanLight', src: 'images/humanlightarmour.png'},
            {key: 'humanMedium', src: 'images/humanmediumarmour.png'},
            {key: 'humanHeavy', src: 'images/humanheavyarmour.png'},
            {key: 'horse', src: 'images/horse.png'},
            {key: 'nasal_helm', src: 'images/nasalHelm.png'},
            {key: 'humanMaleBase', src: 'images/humanmale.png'},
            {key: 'elfMaleBase', src: 'images/elfmale.png'},
            {key: 'elfMaleHair', src: 'images/elfmalehair.png'},
            {key: 'elfFemaleBase', src: 'images/elffemale.png'},
            {key: 'elfFemaleHair', src: 'images/elffemalehair.png'},
            {key: 'dwarfMaleBase', src: 'images/dwarfmale.png'},
            {key: 'dwarfMaleHair', src: 'images/dwarfmalehair.png'},
            {key: 'dwarfFemaleBase', src: 'images/dwarffemale.png'},
            {key: 'dwarfFemaleHair', src: 'images/dwarffemalehair.png'},
            {key: 'shield', src: 'images/shield.png'},
            {key: 'skeleton', src: 'images/skeleton.svg'},
            {key: 'zombie', src: 'images/zombie.svg'},
            {key: 'imp', src: 'images/imp.svg'},
            {key: 'wolf', src: 'images/wolf.png'},
            {key: 'torch_lit', src: 'images/torch_lit.svg'},
            {key: 'fireplace', src: 'images/fireplace.svg'},
            {key: 'axe', src: 'images/axe.png'},
            {key: 'troll', src: 'images/troll.png'},
            {key: 'spear', src: 'images/spear.png'},
            {key: 'club', src: 'images/club.png'},
            {key: 'spiderweb', src: 'images/spiderweb.png'},
            {key: 'spider1', src: 'images/spider1.png'},
            {key: 'spider2', src: 'images/spider2.png'},
            {key: 'arenaannouncer', src: 'images/arenaannouncer.png'},
            {key: 'arenamercenary', src: 'images/arenamercenary.png'},
            {key: 'arenashopkeeper', src: 'images/arenashopkeeper.png'},
            {key: 'grishnak', src: 'images/Grishnak.png'},
            {key: 'overlay_blood', src: 'images/overlay blood.png'},
            {key: 'overlay_skull', src: 'images/overlay skull.png'},
            {key: 'pedestal', src: 'images/mediumpillar.png'},
            {key: 'water', src: 'images/water.png'},
            {key: 'boar', src: 'images/boar.png'},
            {key: 'tiger', src: 'images/tiger.png'},
            {key: 'eagle', src: 'images/eagle.png'},
            {key: 'eagleflying', src: 'images/eagleflying.png'},
            {key: 'foliage', src: 'images/foliage.png'}
        ];

        window.gameVisuals = {};

        function load(asset) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => { window.gameVisuals[asset.key] = img; resolve(); };
                img.onerror = () => { console.warn("Failed:", asset.src); resolve(); };
                img.src = asset.src;
            });
        }

        // Priority load
        await Promise.all(priorityImages.map(load));
        console.log("Priority assets loaded");
        
        // Background load
        await Promise.all(otherImages.map(load));
        console.log("All assets loaded");

        // Audio pre-fetch (minimal)
        if (typeof window.playMusic === 'function') {
            console.log("Preloading audio buffers...");
        }
    }

    // Global click listener for ANY button click in the window
    window.addEventListener('click', (e) => {
        const btnId = e.target.id;
        if (btnId) console.log("Window clicked element ID:", btnId);

        if (btnId === "create-room-btn") {
            window.createRoom();
        } else if (btnId === "join-room-btn") {
            window.joinRoom();
        } else if (btnId === "leave-room-btn") {
            window.leaveRoom();
        } else if (btnId === "character-screen-btn") {
            const modal = document.getElementById("character-screen-modal");
            if (modal) {
                modal.style.display = "block";
                window.showCharacterScreen();
                if (window.updateMusicState) window.updateMusicState();
            }
        } else if (btnId === "spell-menu-btn") {
            const modal = document.getElementById("spell-menu-modal");
            if (modal) {
                modal.style.display = "block";
                window.showSpellScreen();
                if (window.updateMusicState) window.updateMusicState();
            }
        } else if (btnId === "inventory-btn") {
            console.log("Inventory button CLICKED - Opening modal");
            const modal = document.getElementById("inventory-modal");
            if (modal) {
                modal.style.display = "block";
                window.showInventoryScreen();
                if (window.updateMusicState) window.updateMusicState();
            } else {
                console.error("CRITICAL: inventory-modal not found in HTML!");
            }
        } else if (btnId === "world-map-btn") {
            const modal = document.getElementById("world-map-modal");
            if (modal) {
                modal.style.display = "block";
                window.renderWorldMap();
            }
        } else if (btnId === "move-group-btn") {
            window.groupMoveMode = !window.groupMoveMode;
            const btn = document.getElementById("move-group-btn");
            btn.innerText = `Move Group: ${window.groupMoveMode ? 'ON' : 'OFF'}`;
            btn.style.backgroundColor = window.groupMoveMode ? '#ff9800' : '#795548';
        } else if (btnId === "load-btn-initial") {
            const modal = document.getElementById("load-game-modal");
            if (modal) {
                window.updateSaveList();
                modal.style.display = "block";
            }
        } else if (btnId === "save-menu-btn") {
            const modal = document.getElementById("save-game-modal");
            if (modal) {
                const charName = window.party[0].name;
                // Default name: CharacterName + lowest available number
                let i = 1;
                while (localStorage.getItem(`rpg_save_${charName}_${i}`)) { i++; }
                document.getElementById("save-name-input").value = `${charName}_${i}`;
                modal.style.display = "block";
            }
        } else if (btnId === "load-menu-btn") {
            const modal = document.getElementById("load-game-modal");
            if (modal) {
                window.updateSaveList();
                modal.style.display = "block";
            }
        } else if (btnId === "confirm-save-btn") {
            const saveName = document.getElementById("save-name-input").value || "ManualSave";
            window.saveGame(saveName);
            document.getElementById("save-game-modal").style.display = "none";
        } else if (btnId === "quick-save-btn") {
            window.saveGame("quick_save");
        } else if (btnId === "quick-load-btn") {
            window.loadGame("quick_save");
        } else if (btnId === "settings-menu-btn") {
            const modal = document.getElementById("settings-modal");
            if (modal) {
                modal.style.display = "block";
                if (window.updateMusicState) window.updateMusicState();
            }
        } else if (btnId === "host-game-btn") {
            if (window.createRoom) window.createRoom();
        } else if (btnId === "confirm-hire-btn") {
            const mainChar = window.party[0];
            if (mainChar.gold < 100) {
                window.showMessage("Not enough gold to hire a mercenary!");
                return;
            }
            
            const race = document.getElementById("merc-race").value;
            const gender = document.getElementById("merc-gender").value;
            const cls = document.getElementById("merc-class").value;
            const voice = document.getElementById("merc-voice-select").value;
            let name = document.getElementById("merc-name").value;
            if (!name) name = window.getRandomName(race, gender);

            mainChar.gold -= 100;
            const merc = window.createCharacterData(race, cls, name, gender, voice);
            
            // Sync EXP
            const targetTotalExp = window.calculateTotalExp(mainChar.level, mainChar.exp);
            let currentTotal = 0;
            while (true) {
                const req = merc.level * 1000;
                if (currentTotal + req <= targetTotalExp) {
                    window.applyLevelUp(merc, cls);
                    currentTotal += req;
                } else {
                    merc.exp = targetTotalExp - currentTotal;
                    break;
                }
            }

            window.party.push(merc);
            
            // Spawn next to player
            const pEnt = window.entities.find(e => e.name === mainChar.name);
            const neighbors = window.getNeighbors(pEnt.hex.q, pEnt.hex.r);
            const spawnHex = neighbors.find(n => !window.getEntityAtHex(n.q, n.r) && window.getTerrainAt(n.q, n.r).name !== 'Water') || pEnt.hex;
            
            const mercEnt = new window.Entity(merc.name, "blue", spawnHex, merc.attributes.agility + 10);
            mercEnt.side = 'player';
            Object.assign(mercEnt, merc);
            mercEnt.skills = merc.skills;
            window.entities.push(mercEnt);

            window.showMessage(`${merc.name} the ${race} ${cls} joined the party!`);
            document.getElementById("mercenary-creation-modal").style.display = "none";
            window.updatePartyTabs();
            window.renderEntities();
        } else if (btnId === "cancel-hire-btn") {
            document.getElementById("mercenary-creation-modal").style.display = "none";
        } else if (btnId === "close-shop-modal") {
            document.getElementById("shop-modal").style.display = "none";
        } else if (btnId === "cheat-jerry-btn") {
            window.addJerry();
        } else if (btnId === "cheat-horse-btn") {
            // Spawn Horse logic
            const char = window.party[window.selectedCharacterIndex];
            const p = window.entities.find(e => e.name === char.name);
            if (p) {
                const neighbors = window.getNeighbors(p.hex.q, p.hex.r);
                const h = neighbors.find(n => !window.entities.some(e => e.alive && e.getAllHexes().some(oh => oh.q === n.q && oh.r === n.r)) && window.getTerrainAt(n.q, n.r).name !== 'Water');
                if (h) {
                    const horse = window.createMonster('horse', h, null, null, 'player');
                    window.entities.push(horse);
                    window.drawMap();
                    window.renderEntities();
                    window.showMessage("Horse spawned!");
                } else {
                    window.showMessage("No space for a horse!");
                }
            }
        } else if (btnId === "cheat-all-equip-btn") {
            window.addAllEquipment();
        } else if (btnId === "cheat-fly-btn") {
            window.toggleFlyCheat();
        } else if (btnId === "cheat-max-skills-btn") {
            window.cheatMaxSkills();
        } else if (btnId === "cancel-moves-btn") {
            window.cancelAllMoveOrders();
        } else if (btnId === "rest-btn") {
            window.toggleRest();
        } else if (btnId === "sleep-btn") {
            window.toggleSleep();
        }
    });

    // Modal Close Logic
    window.addEventListener('click', (e) => {
        const isCloseBtn = e.target.classList.contains('close-btn');
        const isModalOverlay = e.target.classList.contains('modal');
        
        if (isCloseBtn || isModalOverlay) {
            const modal = isCloseBtn ? e.target.closest(".modal") : e.target;
            if (modal) {
                if (modal.id === "end-run-modal" && isModalOverlay) return;
                
                modal.style.display = "none";
                window.isPausedForReaction = false;
                window.lastModalClosedTime = Date.now(); // Track for ghost click prevention
                
                if (window.updateMusicState) window.updateMusicState();
                
                if (modal.id === "character-screen-modal" && window.isInitialCharacterScreen) {
                    window.isInitialCharacterScreen = false;
                    console.log("Initial character screen closed - Starting Core");
                    window.startGameCore();
                }
            }
        }
    });

    window.initHexMap();
    if (window.initWorldMapEvents) window.initWorldMapEvents();
    
    // Initialize Roguelike data
    window.roguelikeData = JSON.parse(localStorage.getItem('rpg_roguelike_data') || JSON.stringify({
        permanentSkillBonuses: {}, // tree -> count
        relics: [],
        mercenaryGraveyard: [], // Snapshots of mercenaries
        fightsCompleted: 0
    }));

window.updateRoguelikePreview = function() {
        const campaign = document.getElementById("campaign-select").value;
        const relicsEnabled = document.getElementById("relics-activated-check").checked;
        const preview = document.getElementById("roguelike-benefits-preview");
        if (!preview) return;

        if (campaign === "1" && relicsEnabled) {
            const bonuses = window.roguelikeData.permanentSkillBonuses;
            const keys = Object.keys(bonuses);
            if (keys.length > 0) {
                let html = `<h4 style="margin: 0 0 5px 0; color: #ffeb3b;">Unlocked Roguelike Bonuses:</h4>`;
                html += `<p style="margin: 0;">`;
                html += keys.map(k => `+${bonuses[k]} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(", ");
                html += `</p>`;
                preview.innerHTML = html;
                preview.style.display = "block";
            } else {
                preview.style.display = "none";
            }
        } else {
            preview.style.display = "none";
        }
    };

    window.toggleArenaOptions = function() {
        const campaign = document.getElementById("campaign-select").value;
        const optionsDiv = document.getElementById("arena-roguelike-options");
        const ironmanCheck = document.getElementById("ironman-check");

        if (campaign === "1") {
            if (optionsDiv) optionsDiv.style.display = "block";
            if (ironmanCheck) {
                ironmanCheck.checked = true;
                ironmanCheck.disabled = true;
            }
        } else {
            if (optionsDiv) optionsDiv.style.display = "none";
            if (ironmanCheck) {
                ironmanCheck.disabled = false;
            }
        }
        window.updateRoguelikePreview();
    };
    window.toggleArenaOptions(); // Initial call

    const relicsCheck = document.getElementById("relics-activated-check");
    if (relicsCheck) {
        relicsCheck.addEventListener("change", window.updateRoguelikePreview);
    }

    const resetBtn = document.getElementById("reset-roguelike-btn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to reset all roguelike progress? This cannot be undone.")) {
                window.roguelikeData = {
                    permanentSkillBonuses: {},
                    relics: [],
                    mercenaryGraveyard: [],
                    fightsCompleted: 0
                };
                localStorage.setItem('rpg_roguelike_data', JSON.stringify(window.roguelikeData));
                window.updateRoguelikePreview();
                alert("Progress reset!");
            }
        });
    }

    
    window.updateRoguelikePreview();

    window.updateSelectionPreview = function() {
        const race = document.getElementById("race-select").value;
        const cls = document.getElementById("class-select").value;
        const preview = document.getElementById("selection-preview");
        if (!preview) return;

        const rb = window.raceData[race].bonus;
        const cb = window.classData[cls].bonus;

        let html = `<h4 style="margin: 0 0 5px 0; color: #90caf9;">Growth per Level:</h4>`;
        
        html += `<p style="margin: 0 0 5px 0;"><strong>${race.charAt(0).toUpperCase() + race.slice(1)}:</strong> `;
        html += Object.entries(rb).map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(", ");
        html += `</p>`;

        html += `<p style="margin: 0;"><strong>${cls.charAt(0).toUpperCase() + cls.slice(1)}:</strong> `;
        html += Object.entries(cb).map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(", ");
        html += `</p>`;

        preview.innerHTML = html;
    };
    window.updateSelectionPreview(); // Initial call
});

window.toggleFlyCheat = function() {
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player');
    const isAnyCheat = friendlies.some(f => f.flyCheat);
    const newState = !isAnyCheat;

    friendlies.forEach(f => {
        f.flyCheat = newState;
        if (newState) f.isFlying = true;
        else f.isFlying = false;
    });

    const btn = document.getElementById("cheat-fly-btn");
    if (btn) {
        btn.innerText = newState ? "Cheat: Remove Flying" : "Cheat: Fly All";
        btn.style.backgroundColor = newState ? "#f44336" : "#03a9f4";
    }

    window.showMessage(newState ? "All friendlies are now flying units!" : "Flying capability removed from all friendlies.");
    window.drawMap();
    window.renderEntities();
    window.updateTurnIndicator();
    if (window.updateActionButtons) window.updateActionButtons();
};

window.testVoice = function(voiceId) {
    if (window.playDialogue) window.playDialogue(`${voiceId}_enemy_seen`);
};

window.cheatMaxSkills = function() {
    window.party.forEach(char => {
        if (!char.attributes) char.attributes = { strength: 0, endurance: 0, agility: 0, wildcard: 0 };
        // Reset to base stats first to avoid double-application
        char.maxHp = 10 + ((char.attributes.endurance || 0) * 5);
        char.baseDamage = 1 + ((char.attributes.strength || 0) * 1); // Simple base
        // (Other base stats could be reset here)

        for (const skillKey in window.skills) {
            const skill = window.skills[skillKey];
            if (skill.tree === 'monster_skills') continue; // Skip flight/land
            const max = skill.maxRanks || 100;
            char.skills[skillKey] = max;
            if (skill.apply) {
                // Apply skill rank benefits
                for (let i = 0; i < max; i++) {
                    skill.apply(char);
                }
            }
        }
        char.hp = char.maxHp;
    });
    // Sync entities
    window.entities.forEach(ent => {
        const partyMember = window.party.find(p => p.name === ent.name);
        if (partyMember) {
            ent.skills = { ...partyMember.skills };
            ent.maxHp = partyMember.maxHp;
            ent.hp = partyMember.hp;
            // No need to re-apply in loop here if we synced stats
        }
    });
    window.showMessage("Cheat: All skills maxed for the party!");
    window.showCharacter();
    window.showCharacterScreen();
};
window.startGame = function() {
  console.log("Starting game...");

  // Set timestamp to prevent the click that started the game from bleeding through to the map
  window.lastModalClosedTime = Date.now();

  const race = document.getElementById("race-select").value;
  const cls = document.getElementById("class-select").value;
  const gender = document.getElementById("gender-select").value;
  const campaign = document.getElementById("campaign-select").value;
  const voice = document.getElementById("voice-select").value;
  let name = document.getElementById("character-name").value;
  if (!name) name = window.getRandomName(race, gender);

  window.initializePlayer(race, cls, gender, campaign, voice);
  window.party[0].name = name; // Update with generated name if needed
  
  window.ironmanMode = document.getElementById("ironman-check").checked;

  // Roguelike: Apply permanent skill bonuses
  window.relicsEnabled = document.getElementById("relics-activated-check").checked;
  if (campaign === "1" && window.relicsEnabled) {
      window.party.forEach(char => {
          for (const tree in window.roguelikeData.permanentSkillBonuses) {
              const bonus = window.roguelikeData.permanentSkillBonuses[tree];
              char.attributes[tree] = (char.attributes[tree] || 0) + bonus;
          }
      });
      // Give relics to inventory
      (window.roguelikeData.relics || []).forEach(rid => {
          window.party[0].inventory.push(rid);
      });
      window.roguelikeData.fightsCompleted = 0; 
      window.runMaxEnemySkills = {}; // Reset tracking
  }

  // Campaign Level Caps
  window.campaignLevelCaps = { "1": 50, "2": 5, "3": 50 };
  window.currentLevelCap = window.campaignLevelCaps[campaign] || 50;

  if (window.updatePartyTabs) window.updatePartyTabs();

  document.getElementById("characterCreator").style.display = "none";
  document.getElementById("gameContainer").style.display = "flex";
  document.getElementById("top-menu").style.display = "flex";
  
  // Flag that we are in the initial setup
  window.isInitialCharacterScreen = true;
  document.getElementById("character-screen-modal").style.display = "block";
  window.showCharacterScreen();
  // startGameCore() will be called when this modal closes
};
