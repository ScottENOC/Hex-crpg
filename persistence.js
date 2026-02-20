// persistence.js

function saveGame() {
    if (!window.player) {
        window.showMessage("Nothing to save yet!");
        return;
    }

    const gameState = {
        player: window.player,
        party: window.party,
        selectedCharacterIndex: window.selectedCharacterIndex,
        mapTerrain: window.mapTerrain,
        exploredHexes: Array.from(window.exploredHexes),
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
            lastSeenTargetHex: e.lastSeenTargetHex
        })),
        saveDate: new Date().toISOString()
    };

    try {
        localStorage.setItem('rpg_save_game', JSON.stringify(gameState));
        window.showMessage("Game saved successfully!");
    } catch (e) {
        console.error("Save failed", e);
        window.showMessage("Failed to save game. Local storage might be full.");
    }
}

function loadGame() {
    const savedData = localStorage.getItem('rpg_save_game');
    if (!savedData) {
        window.showMessage("No saved game found.");
        return;
    }

    try {
        const gameState = JSON.parse(savedData);
        
        // 1. Restore Player, Party, and Terrain Data
        window.player = gameState.player;
        window.party = gameState.party || [window.player];
        window.selectedCharacterIndex = gameState.selectedCharacterIndex || 0;
        window.mapTerrain = gameState.mapTerrain;
        window.exploredHexes = new Set(gameState.exploredHexes || []);
        window.mapItems = gameState.mapItems || {};
        // Update the reference in terrain.js closure if needed, but since it's global:
        Object.assign(window.mapTerrain, gameState.mapTerrain);

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
        if (gameState.currentTurnIndex !== -1) {
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
        
        window.showMessage("Game loaded successfully!");
    } catch (e) {
        console.error("Load failed", e);
        window.showMessage("Failed to load game. Save data might be corrupted.");
    }
}

window.saveGame = saveGame;
window.loadGame = loadGame;
