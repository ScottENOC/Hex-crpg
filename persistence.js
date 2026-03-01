// persistence.js

function saveGame(saveName = "rpg_save_game") {
    if (!window.player) {
        window.showMessage("Nothing to save yet!");
        return;
    }

    const gameState = {
        player: window.player,
        party: window.party,
        currentCampaign: window.currentCampaign,
        selectedCharacterIndex: window.selectedCharacterIndex,
        overrideTerrain: window.overrideTerrain,
        exploredHexes: Array.from(window.exploredHexes),
        lastSeenTimeMap: window.lastSeenTimeMap || {},
        ironmanMode: window.ironmanMode || false,
        mapItems: window.mapItems,
        gamePhase: window.gamePhase,
        currentTurnIndex: window.entities.indexOf(window.currentTurnEntity),
        camera: { x: window.cameraX, y: window.cameraY, zoom: window.cameraZoom },
        entities: window.entities.map(e => ({
            name: e.name,
            color: e.color,
            hex: e.hex,
            initiative: e.initiative,
            hp: e.hp,
            maxHp: e.maxHp,
            currentMana: e.currentMana,
            maxMana: e.maxMana,
            timePoints: e.timePoints,
            timePointsPerTick: e.timePointsPerTick,
            expValue: e.expValue,
            isEnemy: e instanceof window.Enemy,
            isNPC: e.isNPC,
            alive: e.alive,
            equipped: e.equipped,
            skills: e.skills,
            baseDamage: e.baseDamage,
            baseReduction: e.baseReduction,
            toHitMelee: e.toHitMelee,
            toHitRanged: e.toHitRanged,
            toHitSpell: e.toHitSpell,
            passiveDodge: e.passiveDodge,
            gold: e.gold,
            inventory: e.inventory,
            side: e.side,
            gender: e.gender,
            race: e.race,
            lastSeenTargetHex: e.lastSeenTargetHex,
            isFlying: e.isFlying,
            flyCheat: e.flyCheat,
            forcedMoveResistance: e.forcedMoveResistance,
            visionPenaltyStacks: e.visionPenaltyStacks,
            dmgPenaltyStacks: e.dmgPenaltyStacks,
            healingReduction: e.healingReduction,
            reactionBlocked: e.reactionBlocked
        })),
        saveDate: new Date().toISOString(),
        saveName: saveName
    };

    const key = saveName.startsWith("rpg_save_") ? saveName : `rpg_save_${saveName}`;

    try {
        if (window.ironmanMode) {
            // Delete all other saves for this character name
            const charName = window.party[0].name;
            const metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
            const toDelete = metadata.filter(m => m.name.includes(charName) && m.key !== key);
            
            toDelete.forEach(d => {
                localStorage.removeItem(d.key);
            });
            
            const newMetadata = metadata.filter(m => !toDelete.includes(m));
            localStorage.setItem('rpg_save_metadata', JSON.stringify(newMetadata));
        }

        localStorage.setItem(key, JSON.stringify(gameState));
        
        // Update metadata list
        let metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
        metadata = metadata.filter(m => m.key !== key);
        metadata.push({ key: key, name: saveName, date: gameState.saveDate, ironman: window.ironmanMode });
        localStorage.setItem('rpg_save_metadata', JSON.stringify(metadata));

        window.showMessage(`Game saved as "${saveName}"!`);

        if (window.ironmanMode && !saveName.includes("AutoSave")) {
            alert("Iron Man Save: Returning to title screen.");
            location.reload(); // Simplest way to return to title
        }
    } catch (e) {
        console.error("Save failed", e);
        window.showMessage("Failed to save game. Local storage might be full.");
    }
}

function loadGame(saveName = "rpg_save_game") {
    const key = saveName.startsWith("rpg_save_") ? saveName : `rpg_save_${saveName}`;
    const savedData = localStorage.getItem(key);
    if (!savedData) {
        window.showMessage(`No saved game found for "${saveName}".`);
        return;
    }

    try {
        const gameState = JSON.parse(savedData);
        
        // 1. Restore Player, Party, and Campaign Data
        window.player = gameState.player;
        window.party = gameState.party || [window.player];
        window.currentCampaign = gameState.currentCampaign || "3";
        window.selectedCharacterIndex = gameState.selectedCharacterIndex || 0;
        window.overrideTerrain = gameState.overrideTerrain || {};
        window.exploredHexes = new Set(gameState.exploredHexes || []);
        window.lastSeenTimeMap = gameState.lastSeenTimeMap || {};
        window.ironmanMode = gameState.ironmanMode || false;
        window.mapItems = gameState.mapItems || {};

        // 2. Hide Creator, Show Game
        document.getElementById("characterCreator").style.display = "none";
        document.getElementById("gameContainer").style.display = "block";
        document.getElementById("top-menu").style.display = "flex";

        // 3. Initialize Game Engine (Canvas, Listeners) if not already
        if (!window.mapCanvas) {
            window.startGameCore(true); // Tell it we are loading
        }

        // 4. Reconstruct Entities
        window.entities = gameState.entities.map(d => {
            let ent;
            if (d.isEnemy) {
                ent = new window.Enemy(d.name, d.color, d.hex, d.initiative, d.hp, d.expValue);
            } else {
                ent = new window.Entity(d.name, d.color, d.hex, d.initiative);
            }
            // Restore all properties
            Object.assign(ent, d);
            return ent;
        });

        // Restore turn state
        window.gamePhase = gameState.gamePhase || 'WAITING';
        if (gameState.currentTurnIndex !== -1 && gameState.currentTurnIndex < window.entities.length) {
            window.currentTurnEntity = window.entities[gameState.currentTurnIndex];
        } else {
            window.currentTurnEntity = null;
        }

        // Restore camera
        if (gameState.camera) {
            window.cameraX = gameState.camera.x;
            window.cameraY = gameState.camera.y;
            window.cameraZoom = gameState.camera.zoom;
        }

        // 5. Refresh UI
        window.resizeCanvas();
        window.drawMap();
        window.renderEntities();
        window.showCharacter();
        window.updateActionButtons();
        window.updateTurnIndicator();
        
        // Close modals
        document.getElementById("load-game-modal").style.display = "none";

        window.showMessage(`Game "${gameState.saveName || saveName}" loaded successfully!`);
    } catch (e) {
        console.error("Load failed", e);
        window.showMessage("Failed to load game. Save data might be corrupted.");
    }
}

function updateSaveList() {
    const listDiv = document.getElementById("save-list");
    if (!listDiv) return;
    listDiv.innerHTML = '';

    const metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
    // Sort by date (newest first)
    metadata.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (metadata.length === 0) {
        listDiv.innerHTML = '<p style="color: #888;">No saves found.</p>';
        return;
    }

    metadata.forEach(m => {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        div.style.padding = "10px";
        div.style.borderBottom = "1px solid #444";

        const info = document.createElement("div");
        const date = new Date(m.date).toLocaleString();
        info.innerHTML = `<strong>${m.name}</strong><br><small style="color: #aaa;">${date}</small>`;
        
        const loadBtn = document.createElement("button");
        loadBtn.innerText = "Load";
        loadBtn.onclick = () => loadGame(m.key);

        div.appendChild(info);
        div.appendChild(loadBtn);
        listDiv.appendChild(div);
    });
}

window.saveGame = saveGame;
window.loadGame = loadGame;
window.updateSaveList = updateSaveList;

window.saveGame = saveGame;
window.loadGame = loadGame;
