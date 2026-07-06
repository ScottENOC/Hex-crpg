// persistence.js

// Campaign 2's world is one fixed, deterministic layout (see
// setupVillageScene, campaign2World.js) — regenerated identically by code
// every time, with a snapshot of the result stashed in
// window._campaign2TerrainBaseline/_campaign2TileObjectsBaseline right after
// it runs. Rather than saving the whole (large, and only growing as more
// content gets added) terrain/tileObjects dicts, only the entries that
// differ from that baseline — an opened door, a burned-down house, whatever
// a player actually changes — need to be stored at all.
function diffAgainstBaseline(current, baseline) {
    const diff = {};
    for (const key in current) {
        const a = current[key], b = baseline[key];
        // Terrain values are singleton objects from terrainTypes, so
        // reference equality is exact and cheap; tileObjects are plain data
        // records, so compare by value instead.
        const changed = (a === b) ? false : JSON.stringify(a) !== JSON.stringify(b);
        if (changed) diff[key] = a;
    }
    return diff;
}

// Flattens one entity into the same plain-data shape used for both the
// real save and the deterministic-NPC baseline snapshot below — pulled out
// as its own function so both call sites produce byte-identical output for
// an unchanged entity (required for the entity-diffing to work at all).
function serializeEntity(e) {
    const data = {};
    for (let key in e) {
        if (typeof e[key] !== 'function') {
            // Transient per-move pathfinding cache — recomputed on demand, no
            // reason to persist (and it'd be a fat array on a mid-move NPC).
            if (key === '_pathCache' || key === '_pathCacheDest') continue;
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
}
window.serializeEntity = serializeEntity;

// Every scripted world NPC (soldiers, quest-givers, shopkeepers — anything
// built via buildNPC/buildGoblinNPC from a campaign2Content.js spec, always
// flagged isNPC:true) is exactly as deterministic as terrain already is:
// same spec + same world-gen = same NPC, every time, and there's currently
// no NPC leveling/skill-growth system to change that. So the same
// diffAgainstBaseline trick that already shrinks terrain/tileObjects saves
// applies here too — only what actually changes at runtime (hp, position,
// alive/unconscious state, inventory, reputation) needs saving, not a full
// re-dump of stats/skills/equipment the spec already defines. Party
// members, hired mercenaries, summons, and anything else built at runtime
// (siege-arena skirmishers, etc.) have no such spec baseline and keep full
// serialization — this only applies to entities present at the moment
// setupVillageScene snapshots window._campaign2NpcBaseline (campaign2World.js).
function diffEntityAgainstNpcBaseline(entity) {
    const baseline = window._campaign2NpcBaseline?.[entity.name];
    if (!entity.isNPC || !baseline) return null;
    const full = serializeEntity(entity);
    const diff = diffAgainstBaseline(full, baseline);
    diff.__diffOfName = entity.name;
    return diff;
}

function saveGame(saveName = "rpg_save_game") {
    if (!window.player) {
        window.showMessage("Nothing to save yet!");
        return;
    }

    const isCampaign2WithBaseline = window.currentCampaign === '2' && window._campaign2TerrainBaseline;

    const gameState = {
        player: window.player,
        party: window.party,
        currentCampaign: window.currentCampaign,
        selectedCharacterIndex: window.selectedCharacterIndex,
        overrideTerrain: isCampaign2WithBaseline
            ? diffAgainstBaseline(window.overrideTerrain, window._campaign2TerrainBaseline)
            : window.overrideTerrain,
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
        tileObjects: isCampaign2WithBaseline
            ? diffAgainstBaseline(window.tileObjects, window._campaign2TileObjectsBaseline)
            : window.tileObjects,
        activeSpells: window.activeSpells,
        roguelikeData: window.roguelikeData,
        factions: window.factions,
        regions: window.regions,
        companionAttitude: window.companionAttitude,
        firedBanterIds: window.firedBanterIds,
        interiorRegions: window.interiorRegions,
        hollowmereEventFired: window.hollowmereEventFired,
        hollowmereFightTriggered: window.hollowmereFightTriggered,
        hollowmereVictoryBonusGiven: window.hollowmereVictoryBonusGiven,
        hollowmereSoldiersWaitingOutside: window.hollowmereSoldiersWaitingOutside,
        hollowmereQuestOfferFired: window.hollowmereQuestOfferFired,
        borderWarSallyActive: window.borderWarSallyActive,
        campaign2AbandonedHouseTriggered: window.campaign2AbandonedHouseTriggered,
        campaign2PlayerCottageBuilt: window.campaign2PlayerCottageBuilt,
        campaign2PlayerCottageUpgraded: window.campaign2PlayerCottageUpgraded,
        campaign2AbandonedHouseRenovated: window.campaign2AbandonedHouseRenovated,
        campaign2SilverhartManorGranted: window.campaign2SilverhartManorGranted,
        campaign2SilverhartManorFortified: window.campaign2SilverhartManorFortified,
        clothingDisplayMode: window.clothingDisplayMode,
        goblinScoutNoteRead: window.goblinScoutNoteRead,
        emberlodeRaided: window.emberlodeRaided,
        questLog: window.questLog,
        benchedCompanions: window.benchedCompanions || [],
        worldMapNotes: window.worldMapNotes,
        activeStealthMission: window.activeStealthMission || null,
        guildAssassinTriggered: window.guildAssassinTriggered || false,
        // The baron is a reputation-only NPC not placed in window.entities
        // (never rendered/AI-processed), so he needs his own save/load slot.
        regionalNPCBaron: window.regionalNPCs?.baron || null,

        entities: window.entities.map(e => diffEntityAgainstNpcBaseline(e) || serializeEntity(e)),
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

        // 1. Restore Player, Party, and Campaign Data — set early, before
        // startGameCore(true) below, since it needs window.currentCampaign/
        // window.party to regenerate Campaign 2's deterministic world if the
        // engine hasn't been initialized yet this session.
        window.player = gameState.player;
        window.party = gameState.party || [window.player];
        window.currentCampaign = gameState.currentCampaign || "3";
        window.selectedCharacterIndex = gameState.selectedCharacterIndex || 0;

        // 2. Hide Creator, Show Game
        document.getElementById("characterCreator").style.display = "none";
        document.getElementById("gameContainer").style.display = "flex";
        document.getElementById("top-menu").style.display = "flex";

        // 3. Initialize Game Engine if not already, BEFORE restoring the
        // rest of the save's state below — for Campaign 2 this regenerates
        // the deterministic world (setupVillageScene) and seeds fresh
        // faction standings/terrain/tileObjects/NPC entities, all of which
        // the save's real values need to override afterward, not the other
        // way around.
        if (!window.mapCanvas) {
            window.startGameCore(true);
        }

        window.exploredHexes = new Set(gameState.exploredHexes || []);
        window.lastSeenTimeMap = gameState.lastSeenTimeMap || {};
        window.ironmanMode = gameState.ironmanMode || false;
        window.mapItems = gameState.mapItems || {};

        // Restore Global States
        window.isInArena = gameState.isInArena || false;
        window.indoorLightMult = (gameState.indoorLightMult !== undefined) ? gameState.indoorLightMult : 1.0;
        window.worldSeconds = gameState.worldSeconds || 0;
        window.activeSpells = gameState.activeSpells || [];
        window.roguelikeData = gameState.roguelikeData || { fightsCompleted: 0, mercenaryGraveyard: [], bossesDefeated: [] };
        if (!window.roguelikeData.bossesDefeated) window.roguelikeData.bossesDefeated = [];
        if (gameState.factions) window.factions = gameState.factions;
        if (gameState.regions) window.regions = gameState.regions;
        if (gameState.companionAttitude) window.companionAttitude = gameState.companionAttitude;
        if (gameState.firedBanterIds) window.firedBanterIds = gameState.firedBanterIds;
        window.interiorRegions = gameState.interiorRegions || [];
        window.hollowmereEventFired = gameState.hollowmereEventFired || false;
        window.hollowmereFightTriggered = gameState.hollowmereFightTriggered || false;
        window.hollowmereVictoryBonusGiven = gameState.hollowmereVictoryBonusGiven || false;
        window.hollowmereSoldiersWaitingOutside = gameState.hollowmereSoldiersWaitingOutside || false;
        window.hollowmereQuestOfferFired = gameState.hollowmereQuestOfferFired || false;
        window.borderWarSallyActive = gameState.borderWarSallyActive || false;
        window.campaign2AbandonedHouseTriggered = gameState.campaign2AbandonedHouseTriggered || false;
        window.campaign2PlayerCottageBuilt = gameState.campaign2PlayerCottageBuilt || false;
        window.campaign2PlayerCottageUpgraded = gameState.campaign2PlayerCottageUpgraded || false;
        window.campaign2AbandonedHouseRenovated = gameState.campaign2AbandonedHouseRenovated || false;
        window.campaign2SilverhartManorGranted = gameState.campaign2SilverhartManorGranted || false;
        window.campaign2SilverhartManorFortified = gameState.campaign2SilverhartManorFortified || false;
        window.clothingDisplayMode = gameState.clothingDisplayMode || 'armor';
        window.goblinScoutNoteRead = gameState.goblinScoutNoteRead || false;
        window.emberlodeRaided = gameState.emberlodeRaided || false;
        window.questLog = gameState.questLog || [];
        window.benchedCompanions = gameState.benchedCompanions || [];
        window.worldMapNotes = gameState.worldMapNotes || {};
        window.activeStealthMission = gameState.activeStealthMission || null;
        window.guildAssassinTriggered = gameState.guildAssassinTriggered || false;
        // Always false on load, regardless of what was saved — loading a
        // save is exactly how the player is meant to recover from Game Over.
        window.gameOver = false;
        const gameOverModal = document.getElementById('game-over-modal');
        if (gameOverModal) gameOverModal.style.display = 'none';
        if (gameState.regionalNPCBaron) {
            window.regionalNPCs = window.regionalNPCs || {};
            // The Baron is now also physically placed in Reddale (see
            // buildReddale in campaign2World.js), so startGameCore's fresh
            // world-build above already pushed a brand-new baron entity into
            // window.entities before this save data gets applied. Swap that
            // stand-in out for the restored object (keeping its rebuilt
            // hex/position) so window.entities and window.regionalNPCs.baron
            // stay the exact same object, not two diverging copies.
            const freshBaron = window.entities.find(e => e === window.regionalNPCs.baron || e.name === gameState.regionalNPCBaron.name);
            if (freshBaron) {
                gameState.regionalNPCBaron.hex = freshBaron.hex;
                const idx = window.entities.indexOf(freshBaron);
                window.entities[idx] = gameState.regionalNPCBaron;
            }
            window.regionalNPCs.baron = gameState.regionalNPCBaron;
        }

        // Terrain/tileObjects: for Campaign 2, reset to the deterministic
        // baseline (just regenerated above, or already present from earlier
        // this session) and layer the save's diff on top, rather than
        // trusting the save's dict wholesale — this also correctly discards
        // any changes made during the *current* session that aren't part of
        // the save being loaded (e.g. loading an earlier save after opening
        // a door this session should show that door closed again). Other
        // campaigns don't have a baseline to diff against, so keep restoring
        // their terrain/tileObjects in full, as before.
        if (window.currentCampaign === '2' && window._campaign2TerrainBaseline) {
            window.overrideTerrain = { ...window._campaign2TerrainBaseline };
            window.tileObjects = { ...window._campaign2TileObjectsBaseline };
            Object.assign(window.overrideTerrain, gameState.overrideTerrain || {});
            Object.assign(window.tileObjects, gameState.tileObjects || {});
        } else {
            window.overrideTerrain = gameState.overrideTerrain || {};
            window.tileObjects = gameState.tileObjects || {};
        }

        // 4. Reconstruct Entities. A diffed NPC (see diffEntityAgainstNpcBaseline,
        // above) only carries the fields that actually changed at runtime —
        // merge it back onto its window._campaign2NpcBaseline snapshot (kept
        // in memory for the whole session, same as _campaign2TerrainBaseline,
        // regardless of whether startGameCore(true) happened to re-run this
        // particular load call) to get the full data back before
        // reconstructing, rather than relying on whatever's currently in
        // window.entities (which may be stale mid-session, unlike a fresh
        // page load).
        window.entities = gameState.entities.map(d => {
            const full = d.__diffOfName
                ? { ...window._campaign2NpcBaseline?.[d.__diffOfName], ...d }
                : d;
            let ent;
            if (full.isEnemy) {
                ent = new window.Enemy(full.name, full.color, full.hex, full.initiative, full.hp, full.expValue);
            } else {
                ent = new window.Entity(full.name, full.color, full.hex, full.initiative);
            }
            Object.assign(ent, full);
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

        // Re-link the elder (she lives in window.entities and was just
        // reconstructed above) back onto window.regionalNPCs.
        const restoredElder = window.entities.find(e => e.name === 'Elder Marta Wynfield');
        if (restoredElder) {
            window.regionalNPCs = window.regionalNPCs || {};
            window.regionalNPCs.elder = restoredElder;
        }

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
        if (window.snapVisuals) window.snapVisuals();
        window.resizeCanvas();
        window.drawMap();
        window.renderEntities();
        window.showCharacter();
        window.updateActionButtons();
        window.updateTurnIndicator();

        // MULTIPLAYER SYNC: Tell all guests to update their worlds
        if (window.broadcastFullState) {
            window.broadcastFullState();
        }
        
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
