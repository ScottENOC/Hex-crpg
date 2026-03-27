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
        
        // Global States
        isInArena: window.isInArena,
        indoorLightMult: window.indoorLightMult,
        worldSeconds: window.worldSeconds,
        tileObjects: window.tileObjects,
        activeSpells: window.activeSpells,
        roguelikeData: window.roguelikeData,

        entities: window.entities.map(e => {
            const data = {};
            // Save all non-function properties
            for (let key in e) {
                if (typeof e[key] !== 'function') {
                    if (key === 'riding') {
                        data.ridingId = e.riding ? e.riding.id : null;
                    } else if (key === 'rider') {
                        data.riderId = e.rider ? e.rider.id : null;
                    } else {
                        data[key] = e[key];
                    }
                }
            }
            data.isEnemy = e instanceof window.Enemy;
            return data;
        }),
        saveDate: new Date().toISOString(),
        saveName: saveName
    };

    const isQuickSave = (saveName === "quick_save");
    const key = isQuickSave ? "rpg_save_quick_save" : `rpg_save_${saveName}`;
    const displayName = isQuickSave ? `Quicksave - ${window.party[0].name}` : saveName;

    try {
        if (window.ironmanMode) {
            const charName = window.party[0].name;
            const metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
            const toDelete = metadata.filter(m => m.name.includes(charName) && m.key !== key);
            toDelete.forEach(d => localStorage.removeItem(d.key));
            const newMetadata = metadata.filter(m => !toDelete.includes(m));
            localStorage.setItem('rpg_save_metadata', JSON.stringify(newMetadata));
        }

        localStorage.setItem(key, JSON.stringify(gameState));
        
        let metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
        metadata = metadata.filter(m => m.key !== key);
        metadata.push({ key: key, name: displayName, date: gameState.saveDate, ironman: window.ironmanMode });
        localStorage.setItem('rpg_save_metadata', JSON.stringify(metadata));

        window.showMessage(`Game saved as "${displayName}"!`);

        if (window.ironmanMode && !saveName.includes("AutoSave")) {
            alert("Iron Man Save: Returning to title screen.");
            location.reload();
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
        window.showMessage(`No saved game found.`);
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

        // Restore Global States
        window.isInArena = gameState.isInArena || false;
        window.indoorLightMult = (gameState.indoorLightMult !== undefined) ? gameState.indoorLightMult : 1.0;
        window.worldSeconds = gameState.worldSeconds || 0;
        window.tileObjects = gameState.tileObjects || {};
        window.activeSpells = gameState.activeSpells || [];
        window.roguelikeData = gameState.roguelikeData || { fightsCompleted: 0, mercenaryGraveyard: [], bossesDefeated: [] };
        if (!window.roguelikeData.bossesDefeated) window.roguelikeData.bossesDefeated = [];

        // 2. Hide Creator, Show Game
        document.getElementById("characterCreator").style.display = "none";
        document.getElementById("gameContainer").style.display = "flex";
        document.getElementById("top-menu").style.display = "flex";

        // 3. Initialize Game Engine if not already
        if (!window.mapCanvas) {
            window.startGameCore(true);
        }

        // 4. Reconstruct Entities
        window.entities = gameState.entities.map(d => {
            let ent;
            if (d.isEnemy) {
                ent = new window.Enemy(d.name, d.color, d.hex, d.initiative, d.hp, d.expValue);
            } else {
                ent = new window.Entity(d.name, d.color, d.hex, d.initiative);
            }
            Object.assign(ent, d);
            return ent;
        });

        // Relink riding/rider references
        window.entities.forEach(ent => {
            if (ent.ridingId) {
                ent.riding = window.entities.find(e => e.id === ent.ridingId);
            }
            if (ent.riderId) {
                ent.rider = window.entities.find(e => e.id === ent.riderId);
            }
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

        // Force immediate UI and lighting refresh
        if (window.updateTime) window.updateTime(0);
        window.resizeCanvas();
        window.drawMap();
        window.renderEntities();
        window.showCharacter();
        window.updateActionButtons();
        window.updateTurnIndicator();
        
        document.getElementById("load-game-modal").style.display = "none";
        window.showMessage(`Game loaded successfully!`);
    } catch (e) {
        console.error("Load failed", e);
        window.showMessage("Failed to load game. Save data might be corrupted.");
    }
}

function deleteSave(key) {
    if (!confirm("Are you sure you want to delete this save?")) return;
    
    localStorage.removeItem(key);
    let metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
    metadata = metadata.filter(m => m.key !== key);
    localStorage.setItem('rpg_save_metadata', JSON.stringify(metadata));
    
    updateSaveList();
    window.showMessage("Save deleted.");
}

function updateSaveList() {
    const listDiv = document.getElementById("save-list");
    if (!listDiv) return;
    listDiv.innerHTML = '';

    const metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
    metadata.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (metadata.length === 0) {
        listDiv.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No saves found.</p>';
        return;
    }

    metadata.forEach(m => {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        div.style.padding = "10px";
        div.style.borderBottom = "1px solid #444";
        div.style.background = "rgba(255,255,255,0.05)";
        div.style.marginBottom = "5px";
        div.style.borderRadius = "4px";

        const info = document.createElement("div");
        const date = new Date(m.date).toLocaleString();
        info.innerHTML = `<strong style="color: #fff;">${m.name}</strong><br><small style="color: #aaa;">${date}</small>`;
        
        const btnContainer = document.createElement("div");
        btnContainer.style.display = "flex";
        btnContainer.style.gap = "10px";

        const loadBtn = document.createElement("button");
        loadBtn.innerText = "Load";
        loadBtn.style.backgroundColor = "#4caf50";
        loadBtn.style.padding = "5px 15px";
        loadBtn.onclick = () => loadGame(m.key);

        const delBtn = document.createElement("button");
        delBtn.innerText = "Delete";
        delBtn.style.backgroundColor = "#f44336";
        delBtn.style.padding = "5px 10px";
        delBtn.onclick = () => deleteSave(m.key);

        btnContainer.appendChild(loadBtn);
        btnContainer.appendChild(delBtn);
        
        div.appendChild(info);
        div.appendChild(btnContainer);
        listDiv.appendChild(div);
    });
}

window.saveGame = saveGame;
window.loadGame = loadGame;
window.deleteSave = deleteSave;
window.updateSaveList = updateSaveList;
