// campaign2World.js
// Builds the seamless Hollowmere village + Hollow Tankard tavern interior for
// Campaign 2. Reuses the exact "paint terrain via overrideTerrain, no
// teleport" pattern proven by the arena lobby (see setupArenaLobby in
// gameEngine.js) — same hex grid throughout, no loading screen.

// Carves a simple rectangular building: walls on the border, floor inside,
// one open door hex. Same overrideTerrain technique as the tavern — same
// hex grid, no separate interior map. Returns the interior bounding box so
// callers can register it for hex-local lighting.
function carveBuilding(centerQ, centerR, halfW, halfH, doorHex, floorType) {
    for (let dq = -halfW; dq <= halfW; dq++) {
        for (let dr = -halfH; dr <= halfH; dr++) {
            window.setTerrainAt(centerQ + dq, centerR + dr, 'Wall');
        }
    }
    for (let dq = -halfW + 1; dq <= halfW - 1; dq++) {
        for (let dr = -halfH + 1; dr <= halfH - 1; dr++) {
            window.setTerrainAt(centerQ + dq, centerR + dr, floorType);
        }
    }
    window.setTerrainAt(doorHex.q, doorHex.r, floorType);
    window.tileObjects[`${doorHex.q},${doorHex.r}`] = { type: 'door_open', lightRadius: 0 };
    return {
        minQ: centerQ - halfW + 1, maxQ: centerQ + halfW - 1,
        minR: centerR - halfH + 1, maxR: centerR + halfH - 1,
        lightMult: 0.3
    };
}

function setupVillageScene() {
    window.overrideTerrain = {};
    window.tileObjects = {};
    window.exploredHexes = new Set();
    window.lastSeenTimeMap = {};
    window.entities = [];

    // --- Village exterior: hand-painted grass with light variety ---
    for (let q = -30; q <= 30; q++) {
        for (let r = -30; r <= 30; r++) {
            // Inside the tavern footprint is handled below; everything else
            // outside that is grass (terrain.js also grass-falls-back for
            // campaign 2, this is just explicit/deliberate village ground).
            const noise = Math.abs(Math.sin(q * 12.9898 + r * 78.233)) % 1;
            if (noise > 0.93) window.setTerrainAt(q, r, 'Forest');
            else window.setTerrainAt(q, r, 'Grass');
        }
    }

    // --- Tavern: walls q:-6..6, r:-4..4; floor carved q:-5..5, r:-3..3 ---
    for (let q = -6; q <= 6; q++) {
        for (let r = -4; r <= 4; r++) {
            window.setTerrainAt(q, r, 'Wall');
        }
    }
    for (let q = -5; q <= 5; q++) {
        for (let r = -3; r <= 3; r++) {
            window.setTerrainAt(q, r, 'Wood Floor');
        }
    }
    // Door at {0,4}: starts CLOSED (Wall — blocks LOS/movement) so the
    // soldiers' entrance is a real event, not just a permanent gap.
    window.setTerrainAt(0, 4, 'Wall');

    // --- A handful of other small buildings around the tavern, forming the
    // start of Hollowmere village proper. Empty inside for now — a start,
    // not fully furnished/staffed yet.
    const storeRegion = carveBuilding(14, 0, 4, 3, { q: 10, r: 0 }, 'Wood Floor');
    const chapelRegion = carveBuilding(-14, 0, 3, 3, { q: -11, r: 0 }, 'Wood Floor');
    const houseRegion = carveBuilding(0, -12, 3, 2, { q: 0, r: -10 }, 'Wood Floor');

    // General store: placed directly south of the tavern with its door
    // facing the tavern's door across a short stretch of path, so the two
    // busiest buildings read as facing each other rather than the tavern's
    // only entrance opening onto nothing.
    const generalStoreRegion = carveBuilding(0, 16, 4, 3, { q: 0, r: 13 }, 'Wood Floor');
    window.tileObjects['0,15'] = { type: 'table', lightRadius: 0 }; // counter

    // Quest item for "A Missing Locket" (Elder Marta) — tucked in the chapel.
    window.mapItems['-14,0'] = ['elder_locket'];

    // Register interior regions for hex-local indoor lighting (see worldTime.js).
    window.interiorRegions = [
        { minQ: -5, maxQ: 5, minR: -3, maxR: 3, lightMult: 0.15 },
        storeRegion,
        chapelRegion,
        houseRegion,
        generalStoreRegion
    ];

    // Fireplace for cozy interior lighting + visual marker for the door.
    window.tileObjects['-4,0'] = { type: 'fireplace', lightRadius: 6 };
    window.tileObjects['0,4'] = { type: 'door_closed', lightRadius: 0 };

    // Furniture, placed clear of spawn hexes and the door.
    window.tileObjects['1,1'] = { type: 'table', lightRadius: 0 };
    window.tileObjects['1,2'] = { type: 'bench', lightRadius: 0 };
    window.tileObjects['-2,1'] = { type: 'table', lightRadius: 0 };
    window.tileObjects['-2,2'] = { type: 'bench', lightRadius: 0 };

    // --- Outdoor paths: a ring around the tavern (clear of every building's
    // footprint) with a short spur connecting each door to it, so the
    // village reads as one place instead of four disconnected buildings.
    const paintPath = (hexes) => hexes.forEach(([q, r]) => window.setTerrainAt(q, r, 'Path'));
    for (let q = -8; q <= 8; q++) {
        paintPath([[q, -6], [q, 6]]); // north/south ring edges
    }
    for (let r = -6; r <= 6; r++) {
        paintPath([[-8, r], [8, r]]); // west/east ring edges
    }
    paintPath([[0, 5]]); // tavern door (0,4) -> south ring
    paintPath([[0, -9], [0, -8], [0, -7]]); // house door (0,-10) -> north ring
    paintPath([[9, 0]]); // store door (10,0) -> east ring
    paintPath([[-10, 0], [-9, 0]]); // chapel door (-11,0) -> west ring
    paintPath([[0, 7], [0, 8], [0, 9], [0, 10], [0, 11], [0, 12]]); // general store door (0,13) -> south ring

    // --- Permanent companion: a real party member (not a conditional tavern
    // ally like Garrick/Mira/Oskar) who stays regardless of what the player
    // does in the shakedown. Built through the same createCharacterData path
    // as the player character, then hand skills are purchased from her
    // starting attribute pool exactly like npcBuilder.js does for NPCs.
    if (!window.party.some(p => p.name === 'Wren Talbot')) {
        const companion = window.createCharacterData('human', 'fighter', 'Wren Talbot', 'female', 'pc_1');
        ['health', 'sword_hit', 'sword_dmg'].forEach(skillKey => {
            const skill = window.skills[skillKey];
            if (!skill) return;
            if (companion.attributes[skill.tree] > 0) companion.attributes[skill.tree]--;
            else if (companion.attributes.wildcard > 0) companion.attributes.wildcard--;
            companion.skills[skillKey] = (companion.skills[skillKey] || 0) + 1;
        });
        if (companion.skills.health) {
            const bonus = 10 * companion.skills.health;
            companion.hp += bonus;
            companion.maxHp += bonus;
        }
        window.party.push(companion);
    }

    // --- Party: spawn seated at a table inside the tavern ---
    window.party.forEach((p, i) => {
        const spawnHex = { q: i, r: 0 };
        const ent = new window.Entity(p.name, 'red', spawnHex, (p.attributes?.agility || 10) + 10);
        ent.side = 'player';
        Object.assign(ent, p);
        ent.hex = spawnHex;
        ent.visualQ = spawnHex.q; ent.visualR = spawnHex.r;
        ent.startQ = spawnHex.q; ent.startR = spawnHex.r;
        ent.destination = null;
        ent.moveCooldown = 0;
        window.entities.push(ent);
        if (i === 0) window.player = ent;
    });

    // --- Faction standings seeded from the player's race ---
    if (window.seedFactionStandings) window.seedFactionStandings(window.party[0].race);

    // --- NPC roster ---
    const npcHexes = {
        'Garrick Holt': { q: -3, r: -2 },
        'Mira Ashbrook': { q: 2, r: -2 },
        'Oskar Vinn': { q: 3, r: -2 },
        'Wick Hallow': { q: 0, r: 16 }
    };
    (window.campaign2Npcs || []).forEach(spec => {
        const hex = npcHexes[spec.name] || { q: 0, r: -2 };
        const ent = window.buildNPC({ ...spec, hex });
        // Soldiers wait outside until the scripted event brings them in.
        if (spec.factionId === 'ironbond_company') {
            ent.hex = { q: 0, r: 6 };
            ent.visualQ = ent.hex.q; ent.visualR = ent.hex.r;
            ent.startQ = ent.hex.q; ent.startR = ent.hex.r;
            ent.pendingEntry = true;
        }
        window.entities.push(ent);
    });

    (window.campaign2BackgroundPatrons || []).forEach((spec, i) => {
        const ent = window.buildNPC({
            ...spec,
            hex: { q: -2 + i, r: 2 },
            classLevels: [],
            skillPicks: [],
            equipment: [],
            side: 'neutral'
        });
        window.entities.push(ent);
    });

    // --- Feudal chain of authority above Hollowmere ---
    // The elder lives in the village (the House) and is reachable like any
    // other NPC. The baron rules the wider barony and isn't placed on the
    // map yet — a reputation-only figure, not pushed into window.entities,
    // so he never renders/AI-processes/collides with anything.
    if (window.campaign2Elder) {
        const elder = window.buildNPC({ ...window.campaign2Elder, hex: { q: 0, r: -12 } });
        window.entities.push(elder);
        window.regionalNPCs = window.regionalNPCs || {};
        window.regionalNPCs.elder = elder;
    }
    if (window.campaign2Baron) {
        const baron = window.buildNPC({ ...window.campaign2Baron, hex: { q: 0, r: 0 } });
        window.regionalNPCs = window.regionalNPCs || {};
        window.regionalNPCs.baron = baron;
    }

    window.hollowmereEventFired = false;

    // Outside combat, the party should mostly move together — flip the
    // existing group-move toggle on by default here and sync its button.
    window.groupMoveMode = true;
    const moveGroupBtn = document.getElementById('move-group-btn');
    if (moveGroupBtn) {
        moveGroupBtn.innerText = 'Move Group: ON';
        moveGroupBtn.style.backgroundColor = '#ff9800';
    }

    window.drawMap();
    window.renderEntities();
    window.showCharacter();
    if (window.snapVisuals) window.snapVisuals();

    setTimeout(() => {
        if (window.triggerAmbientDialogue) window.triggerAmbientDialogue('wren_intro');
    }, 2000);

    // "After a while" — the soldiers walk in a short delay after the scene
    // loads, mirroring the existing setTimeout-chained dialogue precedent
    // used by startArenaFight.
    setTimeout(() => {
        if (window.startHollowmereShakedown) window.startHollowmereShakedown();
    }, 8000);
}

// Toggles a door hex between open (walkable Wood Floor) and closed (Wall,
// blocks line-of-sight/movement via the existing wall-terrain LOS check —
// no new LOS logic needed).
function toggleDoor(q, r) {
    const key = `${q},${r}`;
    const isOpen = window.getTerrainAt(q, r).name !== 'Wall';
    if (isOpen) {
        window.setTerrainAt(q, r, 'Wall');
        window.tileObjects[key] = { type: 'door_closed', lightRadius: 0 };
    } else {
        window.setTerrainAt(q, r, 'Wood Floor');
        window.tileObjects[key] = { type: 'door_open', lightRadius: 0 };
    }
    window.drawMap();
    window.renderEntities();
}

window.setupVillageScene = setupVillageScene;
window.toggleDoor = toggleDoor;
