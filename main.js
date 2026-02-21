// main.js - VERSION 2.0 - DEFINITIVE
console.log("--- MAIN.JS VERSION 2.0 LOADED ---");

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM Content Loaded - Setting up listeners");

    const createCharacterButton = document.getElementById("createCharacterButton");
    if (createCharacterButton) {
        createCharacterButton.addEventListener("click", window.startGame);
    }

    // Global click listener for ANY button click in the window
    window.addEventListener('click', (e) => {
        const btnId = e.target.id;
        if (btnId) console.log("Window clicked element ID:", btnId);

        if (btnId === "character-screen-btn") {
            const modal = document.getElementById("character-screen-modal");
            if (modal) {
                modal.style.display = "block";
                window.showCharacterScreen();
            }
        } else if (btnId === "spell-menu-btn") {
            const modal = document.getElementById("spell-menu-modal");
            if (modal) {
                modal.style.display = "block";
                window.showSpellScreen();
            }
        } else if (btnId === "inventory-btn") {
            console.log("Inventory button CLICKED - Opening modal");
            const modal = document.getElementById("inventory-modal");
            if (modal) {
                modal.style.display = "block";
                window.showInventoryScreen();
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
            window.loadGame(); // Default load
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
        } else if (btnId === "confirm-hire-btn") {
            const mainChar = window.party[0];
            if (mainChar.gold < 100) {
                window.showMessage("Not enough gold to hire a mercenary!");
                return;
            }
            
            const race = document.getElementById("merc-race").value;
            const gender = document.getElementById("merc-gender").value;
            const cls = document.getElementById("merc-class").value;
            let name = document.getElementById("merc-name").value;
            if (!name) name = window.getRandomName(race, gender);

            mainChar.gold -= 100;
            const merc = window.createCharacterData(race, cls, name, gender);
            
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
        if (e.target.classList.contains('close-btn')) {
            const modal = e.target.closest(".modal");
            if (modal) {
                modal.style.display = "none";
                // If this was the first character screen close, start the game
                if (modal.id === "character-screen-modal" && window.isInitialCharacterScreen) {
                    window.isInitialCharacterScreen = false;
                    console.log("Initial character screen closed - Starting Core");
                    window.startGameCore();
                }
            }
        }
        if (e.target.classList.contains('modal')) {
            const modal = e.target;
            modal.style.display = "none";
            if (modal.id === "character-screen-modal" && window.isInitialCharacterScreen) {
                window.isInitialCharacterScreen = false;
                window.startGameCore();
            }
        }
    });

    window.initHexMap();
    if (window.initWorldMapEvents) window.initWorldMapEvents();
});

window.startGame = function() {
  console.log("Starting Game Setup...");
  const race = document.getElementById("race-select").value;
  const cls = document.getElementById("class-select").value;
  const gender = document.getElementById("gender-select").value;
  const campaign = document.getElementById("campaign-select").value;
  let name = document.getElementById("character-name").value;
  if (!name) name = window.getRandomName(race, gender);

  window.initializePlayer(race, cls, gender, campaign);
  window.party[0].name = name; // Update with generated name if needed
  window.updatePartyTabs();

  document.getElementById("characterCreator").style.display = "none";
  document.getElementById("gameContainer").style.display = "block";
  document.getElementById("top-menu").style.display = "flex";
  
  // Flag that we are in the initial setup
  window.isInitialCharacterScreen = true;
  document.getElementById("character-screen-modal").style.display = "block";
  window.showCharacterScreen();
  // startGameCore() will be called when this modal closes
};
