// campaign2World.js
// Builds the seamless Hollowmere village + Hollow Tankard tavern interior for
// Campaign 2. Reuses the exact "paint terrain via overrideTerrain, no
// teleport" pattern proven by the arena lobby (see setupArenaLobby in
// gameEngine.js) — same hex grid throughout, no loading screen.

// Named destinations the crossroads signpost points toward — kept here so
// quest/dialogue code referencing them (e.g. the missing-child quest) stays
// consistent with what the sign actually says.
window.campaign2Landmarks = {
    capital: 'Silverhart',           // the kingdom's capital; shares the kingdom's name
    northVillage: 'Millbrook',       // the next village on the road north, before the capital
    eastTown: 'Reddale',
    farmstead: "Old Mac's Farmstead",
    crossroads: { q: 8, r: 24 } // q=8 keeps the long roads clear of the tavern's east wall (q:-6..6)
};

// Forest as scattered clumps rather than individual random hexes: a coarse
// grid decides whether a 4x4-hex cell has a patch at all (~40% do), and only
// within a patch cell does per-hex noise decide Forest vs Grass. Reuses
// terrain.js's pseudoRandom (a proper hash) rather than a raw sin() plane
// wave, which produced visible straight-line banding artifacts.
function isForestClump(q, r) {
    const cellSize = 4;
    const cellQ = Math.floor(q / cellSize);
    const cellR = Math.floor(r / cellSize);
    if (window.pseudoRandom(cellQ * 3.7 + 11, cellR * 5.3 + 17) >= 0.4) return false;
    return window.pseudoRandom(q * 1.3 + 4, r * 1.7 + 9) < 0.55;
}

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
        lightMult: 0.3,
        doorHex: { q: doorHex.q, r: doorHex.r }
    };
}

// Old Mac's Farmstead: a small house + fenced pasture at the end of the
// south road, just past the border of this world-map hex. Reuses
// carveBuilding for the house; the pasture is a plain rectangle of Grass
// (already the default) with fence tileObjects lining its perimeter —
// decorative only, not a collision boundary, same as table/bench.
function buildFarmstead(roadEnd) {
    const houseCenter = { q: roadEnd.q - 6, r: roadEnd.r };
    const doorHex = { q: houseCenter.q + 3, r: houseCenter.r };
    const farmHouseRegion = carveBuilding(houseCenter.q, houseCenter.r, 3, 2, doorHex, 'Wood Floor');
    window.interiorRegions.push(farmHouseRegion);

    // Short spur connecting the farmhouse door back to the south road.
    for (let q = doorHex.q + 1; q < roadEnd.q; q++) window.setTerrainAt(q, roadEnd.r, 'Path');

    // Fenced pasture west of the house.
    const pMinQ = houseCenter.q - 9, pMaxQ = houseCenter.q - 2;
    const pMinR = houseCenter.r - 4, pMaxR = houseCenter.r + 4;
    for (let q = pMinQ; q <= pMaxQ; q++) {
        window.tileObjects[`${q},${pMinR}`] = { type: 'fence_h', lightRadius: 0 };
        window.tileObjects[`${q},${pMaxR}`] = { type: 'fence_h', lightRadius: 0 };
    }
    for (let r = pMinR; r <= pMaxR; r++) {
        window.tileObjects[`${pMinQ},${r}`] = { type: 'fence_v', lightRadius: 0 };
        window.tileObjects[`${pMaxQ},${r}`] = { type: 'fence_v', lightRadius: 0 };
    }
    window.campaign2FarmPastureCenter = { q: Math.floor((pMinQ + pMaxQ) / 2), r: houseCenter.r };

    // Old Mac, just inside his door.
    if (window.campaign2OldMac) {
        const mac = window.buildNPC({ ...window.campaign2OldMac, hex: { q: houseCenter.q + 1, r: houseCenter.r } });
        window.entities.push(mac);
    }
}

function setupVillageScene() {
    window.overrideTerrain = {};
    window.tileObjects = {};
    window.exploredHexes = new Set();
    window.lastSeenTimeMap = {};
    window.entities = [];

    // --- Village exterior: grass with scattered forest clumps ---
    for (let q = -30; q <= 30; q++) {
        for (let r = -30; r <= 30; r++) {
            // Inside the tavern footprint is handled below; everything else
            // outside that is grass (terrain.js also grass-falls-back for
            // campaign 2, this is just explicit/deliberate village ground).
            window.setTerrainAt(q, r, isForestClump(q, r) ? 'Forest' : 'Grass');
        }
    }

    // --- A small stream just north of the village, crossed by a bridge
    // where the north road passes over it (the road is painted later in
    // this function and simply overwrites the water at the crossing hex,
    // which is exactly what a bridge deck looks like here). ---
    for (let q = -20; q <= 28; q++) {
        window.setTerrainAt(q, -25, 'Water');
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
        { minQ: -5, maxQ: 5, minR: -3, maxR: 3, lightMult: 0.15, doorHex: { q: 0, r: 4 } },
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

    // --- Crossroads: a short connector from the village out to a signpost,
    // then four roads running a good distance out toward the edges of this
    // world-map hex (mostly straight, with a gentle wiggle once well clear
    // of the village itself). Hollowmere sits right where the north-south
    // road passes it, with the crossroads just south of the general store.
    const CP = window.campaign2Landmarks.crossroads;
    for (let r = 7; r <= CP.r - 1; r++) window.setTerrainAt(CP.q, r, 'Path'); // village ring -> crossroads
    window.setTerrainAt(CP.q, CP.r, 'Path');
    window.tileObjects[`${CP.q},${CP.r}`] = { type: 'signpost', lightRadius: 0 };

    // Walks actual hex-adjacent steps (the same neighbor offsets getNeighbors
    // uses) so the road is always contiguous — no gaps from a wiggle jumping
    // more than one hex sideways in axial coordinates. The "wiggle" is an
    // occasional one-hex lateral side-step folded into the walk itself,
    // rather than an independent offset recomputed each step. Returns the
    // final hex reached, so callers can place something at a road's end.
    const paintRoad = (primary, length, wiggleAfter = 45, wiggleChance = 0.12) => {
        const laterals = primary.r !== 0 ? [{ q: 1, r: 0 }, { q: -1, r: 0 }] : [{ q: 0, r: 1 }, { q: 0, r: -1 }];
        let q = CP.q, r = CP.r;
        for (let i = 1; i <= length; i++) {
            q += primary.q; r += primary.r;
            window.setTerrainAt(q, r, 'Path');
            if (i > wiggleAfter && Math.abs(Math.sin(i * 0.37)) < wiggleChance) {
                const lat = laterals[Math.sin(i * 1.7) > 0 ? 0 : 1];
                q += lat.q; r += lat.r;
                window.setTerrainAt(q, r, 'Path');
            }
        }
        return { q, r };
    };
    // One world-map hex is WORLD_HEX_SIZE local hexes across (see
    // terrain.js's battleToWorld scale convention) — the border of "this"
    // hex from the crossroads. The south road is extended well past it,
    // into the next world hex, to reach Old Mac's Farmstead.
    const WORLD_HEX_SIZE = 130;
    paintRoad({ q: 0, r: -1 }, WORLD_HEX_SIZE); // North: back past the village, on to Millbrook and the capital, Silverhart
    const farmRoadEnd = paintRoad({ q: 0, r: 1 }, WORLD_HEX_SIZE + 40); // South: past the hex border, to Old Mac's Farmstead
    paintRoad({ q: 1, r: 0 }, WORLD_HEX_SIZE); // East: Reddale
    paintRoad({ q: -1, r: 0 }, WORLD_HEX_SIZE); // West: unmarked but for a skull and crossbones

    buildFarmstead(farmRoadEnd);

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
    if (window.updatePartyTabs) window.updatePartyTabs(); // populate the character-select tab (main char + Wren)
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

// Reads the crossroads signpost — pure flavor/navigation text, no state.
function readSignpost() {
    const l = window.campaign2Landmarks;
    window.showDialogue({ name: 'Signpost' },
        `A weathered signpost creaks at the crossroads.\n` +
        `North: ${l.northVillage}, then the capital, ${l.capital}.\n` +
        `South: ${l.farmstead}.\n` +
        `East: ${l.eastTown}.\n` +
        `West: no name — just a skull and crossbones carved into the wood.`
    );
}

window.setupVillageScene = setupVillageScene;
window.toggleDoor = toggleDoor;
window.readSignpost = readSignpost;
