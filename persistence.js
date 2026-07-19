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

// Bumped whenever a save's *shape* changes in a way old data can't just
// fall through `!== undefined ? saved : default` for — a field renamed, a
// structure restructured, something that needs an actual one-time
// transform. SAVE_MIGRATIONS below runs, in order, every migration whose
// key is > the save's own saveVersion, each mutating gameState in place
// before loadGame reads any of it. A save with no saveVersion at all
// (everything written before this existed) is treated as version 0, so
// every migration ever added runs against it.
const SAVE_VERSION = 1;
const SAVE_MIGRATIONS = {
    // Example shape for the next one that's actually needed:
    // 2: (gameState) => { gameState.someRenamedField = gameState.someOldField; },
};
function runSaveMigrations(gameState) {
    const from = gameState.saveVersion || 0;
    Object.keys(SAVE_MIGRATIONS)
        .map(Number)
        .filter(v => v > from)
        .sort((a, b) => a - b)
        .forEach(v => { try { SAVE_MIGRATIONS[v](gameState); } catch (e) { console.error(`Save migration ${v} failed`, e); } });
    gameState.saveVersion = SAVE_VERSION;
}

// Plain flag/value fields that just need "save whatever's on window, restore
// it (or a default if the save predates the field entirely)" — no ordering
// dependency on other restore steps, no cross-referencing another entity, no
// special data-structure conversion. This is the single source of truth for
// that whole category: adding a new such field to a future feature means
// adding ONE line here, not one line in buildGameStateObject AND a matching
// line in loadGame that's easy to forget (see the buy_field/tavern-brawl
// flags this list backfills below — both were added to the game without
// ever being added here, so saving/loading mid-feature silently reset them).
// Anything with real restore logic (entities, terrain/tileObjects diffing,
// the camera, turn state, the regional NPC baron, party/player themselves)
// stays hand-written in buildGameStateObject/loadGame instead — this list is
// deliberately only for fields where a generic `!== undefined ? : default`
// is the entire restore logic.
const SIMPLE_PERSISTED_FIELDS = [
    { key: 'lastSeenTimeMap', default: {} },
    { key: 'ironmanMode', default: false },
    { key: 'difficultyMode', default: 'normal' },
    { key: 'mapItems', default: {} },
    { key: 'isInArena', default: false },
    { key: 'indoorLightMult', default: 1.0 },
    { key: 'worldSeconds', default: 0 },
    { key: 'activeSpells', default: [] },
    { key: 'interiorRegions', default: [] },
    { key: 'hollowmereEventFired', default: false },
    { key: 'hollowmereFightTriggered', default: false },
    { key: 'hollowmereVictoryBonusGiven', default: false },
    { key: 'hollowmereSoldiersWaitingOutside', default: false },
    { key: 'hollowmereQuestOfferFired', default: false },
    { key: 'borderWarSallyActive', default: false },
    { key: 'campaign2AbandonedHouseTriggered', default: false },
    { key: 'campaign2PlayerCottageBuilt', default: false },
    { key: 'campaign2PlayerCottageUpgraded', default: false },
    { key: 'campaign2AbandonedHouseRenovated', default: false },
    { key: 'campaign2SilverhartManorGranted', default: false },
    { key: 'campaign2SilverhartManorFortified', default: false },
    { key: 'clothingDisplayMode', default: 'armor' },
    { key: 'goblinScoutNoteRead', default: false },
    { key: 'goblinVouchedByMarta', default: false },
    { key: 'emberlodeRaided', default: false },
    { key: 'questLog', default: [] },
    { key: 'benchedCompanions', default: [] },
    { key: 'worldMapNotes', default: {} },
    { key: 'activeStealthMission', default: null },
    { key: 'guildAssassinTriggered', default: false },
    // The Stardew-style homestead (buyPlayerField/getFieldBoundaryHexes/
    // placeFieldFence/buyFieldLamb/plantAppleTree, campaign2World.js) — the
    // fences/sheep/trees themselves ride along on the existing
    // tileObjects/entities diffing, but the "have I bought the field, and
    // where are its bounds" bookkeeping needs its own slot or buy_field
    // looks available again (and isFieldFullyFenced/plantAppleTree stop
    // working) the moment a save is reloaded.
    { key: 'campaign2PlayerFieldBought', default: false },
    { key: 'campaign2PlayerField', default: null },
    // The Tavern Brawl (startTavernBrawl/endTavernBrawl, campaign2Dialogue.js)
    // — without these, reloading mid-brawl would both let the "whole tavern"
    // offer fire again (tavernBrawlTriggered resets) and strand Garrick/Mira/
    // Oskar permanently aiControlled (tavernBrawlActive resets, so
    // checkCombatEnd's dispatch to endTavernBrawl never fires for that fight).
    { key: 'tavernBrawlActive', default: false },
    { key: 'tavernBrawlTriggered', default: false },
];

// Same idea as SIMPLE_PERSISTED_FIELDS, but for fields that must NOT be
// clobbered with a default when the save predates them — these are seeded
// with real starting data by world-gen (startGameCore, called from loadGame
// itself before this runs) and only need overwriting when the save actually
// has a value for them. windowKey covers the couple of cases where the
// window global's name doesn't match the saved field name.
const PRESENT_ONLY_PERSISTED_FIELDS = [
    { key: 'ironbondArc' },
    { key: 'lichHuntState' },
    { key: 'factions' },
    { key: 'regions' },
    { key: 'worldEvents' },
    { key: 'wildernessThreatMult' },
    { key: 'banditCampLowSecurityAccum', windowKey: '_banditCampLowSecurityAccum' },
    { key: 'activeBanditCamp', windowKey: '_activeBanditCamp' },
    { key: 'companionAttitude' },
    { key: 'firedBanterIds' },
];

// Extracted from saveGame so B3's exportSaveCode (below) can build the exact
// same gameState object without duplicating this ~65-line list, and without
// touching saveGame's own localStorage-writing behavior at all.
function buildGameStateObject(saveName) {
    const isCampaign2WithBaseline = window.currentCampaign === '2' && window._campaign2TerrainBaseline;

    const gameState = {
        saveVersion: SAVE_VERSION,
        player: window.player,
        party: window.party,
        currentCampaign: window.currentCampaign,
        selectedCharacterIndex: window.selectedCharacterIndex,
        overrideTerrain: isCampaign2WithBaseline
            ? diffAgainstBaseline(window.overrideTerrain, window._campaign2TerrainBaseline)
            : window.overrideTerrain,
        exploredHexes: Array.from(window.exploredHexes),
        gamePhase: window.gamePhase,
        currentTurnIndex: window.entities.indexOf(window.currentTurnEntity),
        camera: { x: window.cameraX, y: window.cameraY, zoom: window.cameraZoom },

        tileObjects: isCampaign2WithBaseline
            ? diffAgainstBaseline(window.tileObjects, window._campaign2TileObjectsBaseline)
            : window.tileObjects,
        roguelikeData: window.roguelikeData,
        // The baron is a reputation-only NPC not placed in window.entities
        // (never rendered/AI-processed), so he needs his own save/load slot.
        regionalNPCBaron: window.regionalNPCs?.baron || null,

        entities: window.entities.map(e => diffEntityAgainstNpcBaseline(e) || serializeEntity(e)),
        saveDate: new Date().toISOString(),
        saveName: saveName
    };

    SIMPLE_PERSISTED_FIELDS.forEach(({ key }) => { gameState[key] = window[key]; });
    PRESENT_ONLY_PERSISTED_FIELDS.forEach(({ key, windowKey }) => { gameState[key] = window[windowKey || key]; });

    return gameState;
}

// True if `e` is a browser's "storage quota exceeded" signal — the name is
// standard, but the numeric code differs by (mostly older) browser, so both
// are checked. Isolated into its own function so the retry logic below
// reads as "on quota exhaustion, do X" rather than an inline multi-clause
// condition.
function isQuotaExceededError(e) {
    return e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
}

// Deletes the single oldest save (by its recorded date, excluding the slot
// currently being written to and the metadata index itself) to make room.
// Returns false once there's nothing left to free — the caller's retry loop
// stops there rather than looping forever.
function freeOldestSaveSlot(excludeKey) {
    const metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
    const candidates = metadata.filter(m => m.key !== excludeKey).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (candidates.length === 0) return false;
    const oldest = candidates[0];
    localStorage.removeItem(oldest.key);
    localStorage.setItem('rpg_save_metadata', JSON.stringify(metadata.filter(m => m.key !== oldest.key)));
    return true;
}
window.freeOldestSaveSlot = freeOldestSaveSlot;

function saveGame(saveName = "rpg_save_game") {
    if (!window.player) {
        window.showMessage("Nothing to save yet!");
        return;
    }

    const gameState = buildGameStateObject(saveName);

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

        const serialized = JSON.stringify(gameState);
        // Quota exhaustion (a real risk — the entity/tileObjects diffing
        // keeps individual saves small, but nothing previously stopped many
        // separate named saves from piling up over a long playthrough): free
        // the oldest save and retry, up to a handful of times, before giving
        // up with the plain error message this always showed.
        let freedAnySlot = false;
        for (let attempt = 0; ; attempt++) {
            try {
                localStorage.setItem(key, serialized);
                break;
            } catch (quotaErr) {
                if (!isQuotaExceededError(quotaErr) || attempt >= 5 || !freeOldestSaveSlot(key)) throw quotaErr;
                freedAnySlot = true;
            }
        }

        let metadata = JSON.parse(localStorage.getItem('rpg_save_metadata') || "[]");
        metadata = metadata.filter(m => m.key !== key);
        metadata.push({ key: key, name: displayName, date: gameState.saveDate, ironman: window.ironmanMode });
        localStorage.setItem('rpg_save_metadata', JSON.stringify(metadata));

        window.showMessage(freedAnySlot
            ? `Game saved as "${displayName}"! (freed space by clearing an older save)`
            : `Game saved as "${displayName}"!`);

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
        runSaveMigrations(gameState);

        // 1. Restore Player, Party, and Campaign Data — set early, before
        // startGameCore(true) below, since it needs window.currentCampaign/
        // window.party to regenerate Campaign 2's deterministic world if the
        // engine hasn't been initialized yet this session.
        window.player = gameState.player;
        window.party = gameState.party || [window.player];
        // Every party member's saved `.inventory` is its own duplicate
        // snapshot of the same shared pool (an accessor property serializes
        // to a plain array copy per member — see wireSharedInventory,
        // partyInventory.js) — merge:false re-attaches everyone to ONE
        // canonical copy (the player's) instead of concatenating N copies
        // of the same items back together.
        window.partyInventory = undefined;
        if (window.wireSharedInventory) {
            window.wireSharedInventory(window.player, { merge: false });
            window.party.forEach(p => { if (p !== window.player) window.wireSharedInventory(p, { merge: false }); });
        }
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

        // Every plain flag/value field in SIMPLE_PERSISTED_FIELDS — see its
        // own comment above for what qualifies. `!== undefined` (not `||`)
        // so a legitimately-falsy saved value (worldSeconds: 0, an empty
        // string, etc.) is never mistaken for "this save predates the field."
        SIMPLE_PERSISTED_FIELDS.forEach(({ key, default: def }) => {
            window[key] = (gameState[key] !== undefined) ? gameState[key] : def;
        });
        // Fields that must NOT be clobbered with a default when absent —
        // see PRESENT_ONLY_PERSISTED_FIELDS' own comment above.
        PRESENT_ONLY_PERSISTED_FIELDS.forEach(({ key, windowKey }) => {
            if (gameState[key] !== undefined) window[windowKey || key] = gameState[key];
        });

        window.roguelikeData = gameState.roguelikeData || { fightsCompleted: 0, mercenaryGraveyard: [], bossesDefeated: [] };
        if (!window.roguelikeData.bossesDefeated) window.roguelikeData.bossesDefeated = [];
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

// B3 (mobile roadmap): a portable save code, so a player can move a save
// between the Safari-tested copy and the installed Capacitor app — separate
// localStorage origins (see Silverhart Saga's App Store prep notes) — or
// between two devices entirely, by just copying text. base64 of the exact
// same JSON saveGame() writes, via buildGameStateObject() above, so nothing
// about save *content* is duplicated — only the "where does it go" differs
// (a clipboard-friendly string vs. a localStorage key).
function exportSaveCode() {
    if (!window.player) {
        window.showMessage("Nothing to export yet!");
        return null;
    }
    const gameState = buildGameStateObject('exported_save');
    const json = JSON.stringify(gameState);
    // btoa is Latin1-only; encodeURIComponent/unescape round-trips any
    // Unicode in names/dialogue text through it safely (a well-known JS
    // idiom for base64-encoding arbitrary UTF-8 strings).
    return btoa(unescape(encodeURIComponent(json)));
}
window.exportSaveCode = exportSaveCode;

// UI wiring for the settings-modal buttons (index.html) — puts the code in
// the textarea (and tries the clipboard, best-effort) rather than an alert,
// since save codes are long and an alert box truncates/can't be selected
// reliably on mobile.
function handleExportSaveCode() {
    const code = window.exportSaveCode();
    if (!code) return;
    const textarea = document.getElementById('save-code-textarea');
    if (textarea) textarea.value = code;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).then(
            () => window.showMessage("Save code copied to clipboard!"),
            () => window.showMessage("Save code ready below (clipboard copy failed — select and copy manually).")
        );
    } else {
        window.showMessage("Save code ready below — select and copy it.");
    }
}
window.handleExportSaveCode = handleExportSaveCode;

function handleImportSaveCode() {
    const textarea = document.getElementById('save-code-textarea');
    const code = textarea ? textarea.value : '';
    if (window.importSaveCode(code) && textarea) textarea.value = '';
}
window.handleImportSaveCode = handleImportSaveCode;

// Writes the decoded code into a scratch localStorage slot and hands it to
// the existing loadGame() — reuses every bit of loadGame's real restore
// logic (DOM state, engine init, all ~40 restored fields) instead of
// duplicating any of it here. Returns true/false so the settings-modal UI
// can react (e.g. clear the textarea only on success).
function importSaveCode(code) {
    if (!code || !code.trim()) {
        window.showMessage("Paste a save code first.");
        return false;
    }
    let json;
    try {
        json = decodeURIComponent(escape(atob(code.trim())));
        JSON.parse(json); // validate before touching real save slots
    } catch (e) {
        window.showMessage("That doesn't look like a valid save code.");
        return false;
    }
    const tempKey = 'rpg_save_imported_temp';
    localStorage.setItem(tempKey, json);
    try {
        loadGame('imported_temp');
    } finally {
        localStorage.removeItem(tempKey);
    }
    return true;
}
window.importSaveCode = importSaveCode;

window.saveGame = saveGame;
window.loadGame = loadGame;
window.deleteSave = deleteSave;
window.updateSaveList = updateSaveList;
