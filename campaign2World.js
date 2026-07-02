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

// Paints a winding, variable-width stream segment starting at (startQ, startR)
// and walking in the q direction given by dqStep (+1 east, -1 west) out to
// endQ. Uses the same contiguity-safe trick as paintRoad's own wiggle: the
// centerline only ever moves by a pure primary step (dqStep, 0) or an
// *additional* pure lateral step (0, ±1) — both always valid hex-neighbor
// directions regardless of travel direction, so consecutive water hexes are
// never more than one hex apart (no diagonal jumps, no gaps). Width (1-3)
// extends from the centerline in the +r direction, each hex adjacent to the
// last, so a wide stretch is just a contiguous vertical run.
function paintStreamSegment(startQ, endQ, dqStep, startR) {
    let r = startR;
    let width = 1;
    for (let q = startQ; dqStep > 0 ? q <= endQ : q >= endQ; q += dqStep) {
        window.setTerrainAt(q, r, 'Water');
        let connectorPainted = 0; // the extra centerline-shift hex counts toward this column's width cap
        if (window.pseudoRandom(q * 0.41, 5) < 0.35) {
            r += window.pseudoRandom(q * 0.77, 13) < 0.5 ? -1 : 1;
            window.setTerrainAt(q, r, 'Water');
            connectorPainted = 1;
        }
        if (window.pseudoRandom(q * 0.53, 19) < 0.15) {
            width = 1 + Math.floor(window.pseudoRandom(q * 0.29, 43) * 3); // 1..3
        }
        const extra = Math.max(0, width - 1 - connectorPainted);
        for (let w = 1; w <= extra; w++) window.setTerrainAt(q, r + w, 'Water');
    }
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

// Wraps window.createMonster with the NPC-ish fields buildNPC normally
// provides (reputation, isNPC, dialogueId, factionId) — goblins aren't a
// playable race with a raceData attribute pool, so they're built as
// monsters (which already support custom skills/equipment) rather than
// through buildNPC's class/race attribute-purchase system.
function buildGoblinNPC({ name, title, monsterType, hex, customSkills, customEquipment, side, dialogueId }) {
    const ent = window.createMonster(monsterType, hex, customSkills || null, customEquipment || null, side || 'neutral');
    ent.name = name;
    ent.title = title || null;
    ent.isNPC = true;
    ent.dialogueId = dialogueId || null;
    ent.factionId = 'goblin_tribe';
    const playerRace = window.party && window.party[0] ? window.party[0].race : 'human';
    ent.reputation = { knowledge: 0, standing: window.seedStanding ? window.seedStanding('goblin', playerRace) : 0 };
    return ent;
}

// The Skarn-tooth goblin camp: huts on a dirt clearing at the very end of
// the west road (see the "unmarked but for a skull and crossbones"
// signpost entry) — deliberately as far from Hollowmere as the road goes,
// since a threat the village could reasonably ignore wouldn't justify the
// village's own existence. Everyone here starts side:'neutral'; nothing is
// hostile until the player (or a quest branch) makes it so.
function buildGoblinCamp(roadEnd) {
    const center = { q: roadEnd.q, r: roadEnd.r };
    const CLEARING_RADIUS = 6;
    for (let dq = -CLEARING_RADIUS; dq <= CLEARING_RADIUS; dq++) {
        for (let dr = -CLEARING_RADIUS; dr <= CLEARING_RADIUS; dr++) {
            const hex = { q: center.q + dq, r: center.r + dr };
            if (window.distance(center, hex) <= CLEARING_RADIUS) window.setTerrainAt(hex.q, hex.r, 'Dirt');
        }
    }

    window.tileObjects[`${center.q},${center.r - 2}`] = { type: 'hut_large', lightRadius: 0 }; // chief's hut
    [[-3, -1], [3, -1], [-3, 2], [3, 2], [0, 3]].forEach(([dq, dr]) => {
        window.tileObjects[`${center.q + dq},${center.r + dr}`] = { type: 'hut', lightRadius: 0 };
    });
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 }; // central campfire

    // A note by the chief's hut, foreign-make and not goblin script — a
    // breadcrumb that this tribe isn't operating alone (see
    // readGoblinScoutNote in campaign2Dialogue.js). Reuses the journal
    // sprite/click-to-read plumbing built for the abandoned house.
    window.tileObjects[`${center.q + 1},${center.r - 2}`] = { type: 'journal', lightRadius: 0, readId: 'goblin_scout_note' };

    window.campaign2GoblinCampCenter = center;

    const chief = buildGoblinNPC({ ...window.campaign2GoblinChief, hex: { q: center.q, r: center.r - 1 } });
    const lieutenant = buildGoblinNPC({ ...window.campaign2GoblinLieutenant, hex: { q: center.q - 2, r: center.r } });
    const shaman = buildGoblinNPC({ ...window.campaign2GoblinShaman, hex: { q: center.q + 2, r: center.r } });
    window.entities.push(chief, lieutenant, shaman);

    const guardHexes = [{ q: center.q - 3, r: center.r + 1 }, { q: center.q + 3, r: center.r + 1 }, { q: center.q, r: center.r + 2 }];
    (window.campaign2GoblinGuards || []).forEach((spec, i) => {
        window.entities.push(buildGoblinNPC({ ...spec, hex: guardHexes[i] || { q: center.q, r: center.r + 2 } }));
    });

    // Ser Aldric, tied up, one hex from the campfire — a real rescue target,
    // not yet a party member. See campaign2Dialogue.js for the rescue logic
    // (assault/stealth/diplomacy all eventually free him).
    if (window.campaign2Paladin) {
        const captive = new window.Entity(window.campaign2Paladin.name, window.campaign2Paladin.color, { q: center.q + 1, r: center.r - 1 }, 10);
        captive.side = 'neutral';
        captive.isNPC = true;
        captive.race = window.campaign2Paladin.race;
        captive.gender = window.campaign2Paladin.gender;
        captive.tiedUp = true;
        captive.dialogueId = 'ser_aldric_captive';
        window.entities.push(captive);
    }
}

// A small house standing alone partway up the north road — the first
// breadcrumb toward a much larger plot arc (a necromancer working toward
// lichdom). The residents were taken, not killed here; skeletons left
// behind to guard the place attack on sight. A journal inside gives a vague
// account without Knowledge: Religion, and something much more specific
// with it (see readAbandonedHouseJournal in campaign2Dialogue.js).
function buildAbandonedHouse(waypoint) {
    if (!waypoint) return;
    const center = { q: waypoint.q + 6, r: waypoint.r };
    const doorHex = { q: center.q - 3, r: center.r };
    const houseRegion = carveBuilding(center.q, center.r, 3, 2, doorHex, 'Wood Floor');
    window.interiorRegions.push(houseRegion);

    for (let q = waypoint.q + 1; q < doorHex.q; q++) window.setTerrainAt(q, waypoint.r, 'Path');

    window.tileObjects[`${center.q},${center.r}`] = { type: 'journal', lightRadius: 0 };
    window.campaign2AbandonedHouseCenter = center;

    // Placed dormant (side:'enemy' but not yet aiState:'combat') — waking
    // them all up here at world-build time would make window.isInCombat
    // true for the entire game from the moment Campaign 2 loads, since
    // checkInCombat() scans every entity regardless of distance. They're
    // woken via proximity instead (see worldTime.js's tick).
    (window.campaign2AbandonedHouseSkeletons || []).forEach((hexOffset, i) => {
        const skeleton = window.createMonster('skeleton', { q: center.q + hexOffset.q, r: center.r + hexOffset.r }, null, null, 'enemy');
        window.entities.push(skeleton);
    });
}

// Millbrook: a minimal stub village at the far end of the north road, three
// world-map hexes from Hollowmere — a start, not fully built out. One
// building and a single villager for now.
function buildMillbrook(roadEnd) {
    const center = { q: roadEnd.q, r: roadEnd.r };
    const doorHex = { q: center.q, r: center.r + 3 };
    const millbrookRegion = carveBuilding(center.q, center.r, 3, 3, doorHex, 'Wood Floor');
    window.interiorRegions.push(millbrookRegion);

    for (let r = roadEnd.r + 1; r < doorHex.r; r++) window.setTerrainAt(center.q, r, 'Path');

    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.campaign2MillbrookCenter = center;

    if (window.campaign2MillbrookVillager) {
        const villager = window.buildNPC({ ...window.campaign2MillbrookVillager, hex: { q: center.q + 1, r: center.r } });
        window.entities.push(villager);
    }

    if (window.worldMapData && window.worldMapData[3] && window.worldMapData[3][6] !== undefined) {
        window.worldMapData[3][6] = { t: 'G', f: 'V', o: 'h', p: 1, n: 'Millbrook' };
    }
}

// `forLoadOnly` (see gameEngine.js's startGameCore) means this call exists
// purely to regenerate the deterministic terrain/tileObjects/NPC baseline
// for a save being loaded — the NPCs/party seating it creates get thrown
// away moments later when the save's own entities replace them, but the
// scripted intro (Wren's banter, the tavern shakedown timer) must NOT be
// re-scheduled, or loading a save from hours into the game would replay
// the opening scene.
function setupVillageScene(forLoadOnly = false) {
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
    // which is exactly what a bridge deck looks like here). The stretch
    // right by the village (this original span) stays a plain 1-wide
    // straight line — further out, in both directions, it winds and
    // widens (see paintStreamSegment below). ---
    for (let q = -20; q <= 28; q++) {
        window.setTerrainAt(q, -25, 'Water');
    }
    paintStreamSegment(29, 70, 1, -25);
    paintStreamSegment(-21, -60, -1, -25);

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
    // `onStep(i, hex)` (optional) lets a caller capture the exact hex reached
    // at a given step count — used to place the abandoned house partway up
    // the north road, since the wiggle means a fixed offset from CP.q
    // wouldn't reliably land on/near the actual path at that distance.
    // `wiggleAfter` (hexes from the crossroads) keeps the village-approach
    // stretch of every road dead straight — matches how a real village's
    // immediate surroundings would be kept clear/maintained — while
    // `wiggleChance` (checked every step past that point) is high enough to
    // produce a real meander rather than the rare, isolated single-hex jogs
    // a low chance produces (which just reads as "straight with an
    // occasional zigzag," not a winding country road).
    const paintRoad = (primary, length, wiggleAfter = 18, wiggleChance = 0.35, onStep = null) => {
        const laterals = primary.r !== 0 ? [{ q: 1, r: 0 }, { q: -1, r: 0 }] : [{ q: 0, r: 1 }, { q: 0, r: -1 }];
        let q = CP.q, r = CP.r;
        let drift = 0; // signed lateral offset from the straight centerline
        const maxDrift = 2; // keeps the wander gentle rather than a runaway curve
        for (let i = 1; i <= length; i++) {
            q += primary.q; r += primary.r;
            window.setTerrainAt(q, r, 'Path');
            if (i > wiggleAfter && Math.abs(Math.sin(i * 0.37)) < wiggleChance) {
                // Once drift has wandered as far as it's allowed to, bias the
                // next step back toward center instead of picking randomly —
                // this bounds the wiggle without making it a one-off bump.
                const dir = Math.abs(drift) >= maxDrift ? -Math.sign(drift) : (Math.sin(i * 1.7) > 0 ? 1 : -1);
                const lat = laterals[dir > 0 ? 0 : 1];
                drift += dir;
                q += lat.q; r += lat.r;
                window.setTerrainAt(q, r, 'Path');
            }
            if (onStep) onStep(i, { q, r });
        }
        return { q, r };
    };
    // One world-map hex is WORLD_HEX_SIZE local hexes across (see
    // terrain.js's battleToWorld scale convention) — the border of "this"
    // hex from the crossroads. The south/west roads reach just past it; the
    // north road runs a full three world hexes, out to Millbrook.
    const WORLD_HEX_SIZE = 130;
    let abandonedHouseWaypoint = null;
    const ABANDONED_HOUSE_STEP = 200; // partway to Millbrook — "stuff in between"
    const northRoadEnd = paintRoad({ q: 0, r: -1 }, WORLD_HEX_SIZE * 3, 18, 0.35, (i, hex) => {
        if (i === ABANDONED_HOUSE_STEP) abandonedHouseWaypoint = hex;
    });
    const farmRoadEnd = paintRoad({ q: 0, r: 1 }, WORLD_HEX_SIZE + 40); // South: past the hex border, to Old Mac's Farmstead
    paintRoad({ q: 1, r: 0 }, WORLD_HEX_SIZE); // East: Reddale
    // West: runs a full two world hexes now — the goblin camp sits at the
    // original one-hex border (captured via onStep so its position is
    // unchanged from before), and Emberlode (village + gold mine) sits a
    // second hex further out, the same "extend the road, add a stub
    // settlement at the new end" pattern used for Millbrook up north.
    let goblinCampWaypoint = null;
    const westRoadEnd = paintRoad({ q: -1, r: 0 }, WORLD_HEX_SIZE * 2, 18, 0.35, (i, hex) => {
        if (i === WORLD_HEX_SIZE) goblinCampWaypoint = hex;
    });

    buildFarmstead(farmRoadEnd);
    buildGoblinCamp(goblinCampWaypoint);
    buildAbandonedHouse(abandonedHouseWaypoint);
    buildMillbrook(northRoadEnd);
    buildEmberlode(westRoadEnd);

    // Campaign 2's entire world is this one deterministic layout, regenerated
    // by this function every time it runs (fresh game or the "engine not
    // initialized yet" branch of loading a save). There's no reason to store
    // the thousands of terrain hexes and tileObjects it just painted in every
    // save — only whatever a player actually changes afterward (a door left
    // open, a future "burned house" effect, etc.) needs saving. Snapshotting
    // the result right here gives saveGame()/loadGame() (persistence.js) a
    // baseline to diff against instead.
    window._campaign2TerrainBaseline = { ...window.overrideTerrain };
    window._campaign2TileObjectsBaseline = { ...window.tileObjects };

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

    if (forLoadOnly) return; // terrain/tileObjects baseline is all a load needs — skip the scripted intro entirely

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
    window.showDialogue({ name: 'Signpost', customImage: 'journal' },
        `A weathered signpost creaks at the crossroads.\n` +
        `North: ${l.northVillage}, then the capital, ${l.capital}.\n` +
        `South: ${l.farmstead}.\n` +
        `East: ${l.eastTown}.\n` +
        `West: no name — just a skull and crossbones carved into the wood.`
    );
}

// Emberlode: a larger settlement two world-hexes west of Hollowmere (a full
// world-hex further out than the goblin camp, which sits at the first
// border — see setupVillageScene's westRoadEnd/goblinCampWaypoint split).
// A foreman's hall, a bunkhouse, and a small carved mine-tunnel interior
// with a ledger to read. Before the Skarn-tooth goblins are dealt with
// (window.questLog's goblin_threat quest, still unresolved), the road here
// is too dangerous to run ore carts on and the mine is short-staffed; once
// resolved (any path), the road reopens (see readEmberlodeLedger/the
// "Ore Road Reopened" quest in campaign2Dialogue.js).
// Each building sits on its own arm off the road's endpoint (hall to the
// west, bunkhouse south, mine north) rather than clustered together, so no
// spur's straight-line path ever has to cross another building's footprint.
function buildEmberlode(roadEnd) {
    const center = { q: roadEnd.q - 4, r: roadEnd.r };

    const hallDoor = { q: center.q + 3, r: center.r };
    const hallRegion = carveBuilding(center.q, center.r, 3, 2, hallDoor, 'Wood Floor');
    window.interiorRegions.push(hallRegion);
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };
    for (let q = hallDoor.q + 1; q < roadEnd.q; q++) window.setTerrainAt(q, roadEnd.r, 'Path');

    const bunkCenter = { q: roadEnd.q, r: roadEnd.r + 6 };
    const bunkDoor = { q: bunkCenter.q, r: bunkCenter.r - 2 };
    const bunkRegion = carveBuilding(bunkCenter.q, bunkCenter.r, 3, 2, bunkDoor, 'Wood Floor');
    window.interiorRegions.push(bunkRegion);
    for (let r = roadEnd.r + 1; r < bunkDoor.r; r++) window.setTerrainAt(roadEnd.q, r, 'Path');

    const mineCenter = { q: roadEnd.q, r: roadEnd.r - 6 };
    const mineDoor = { q: mineCenter.q, r: mineCenter.r + 2 };
    const mineRegion = carveBuilding(mineCenter.q, mineCenter.r, 3, 2, mineDoor, 'Cave Floor');
    window.interiorRegions.push(mineRegion);
    window.tileObjects[`${mineCenter.q},${mineCenter.r}`] = { type: 'journal', lightRadius: 0, readId: 'emberlode_ledger' };
    for (let r = mineDoor.r + 1; r < roadEnd.r; r++) window.setTerrainAt(roadEnd.q, r, 'Path');

    window.campaign2EmberlodeCenter = center;
    window.campaign2EmberlodeAmbushHex = { q: roadEnd.q + 15, r: roadEnd.r }; // partway back toward Hollowmere

    if (window.campaign2EmberlodeForeman) {
        window.entities.push(window.buildNPC({ ...window.campaign2EmberlodeForeman, hex: { q: center.q - 1, r: center.r } }));
    }
    if (window.campaign2EmberlodeMiner) {
        window.entities.push(window.buildNPC({ ...window.campaign2EmberlodeMiner, hex: { q: bunkCenter.q - 1, r: bunkCenter.r } }));
    }

    // Two world-hexes west of Hollowmere [6][6] (Millbrook, three hexes
    // north, registers at [3][6] the same way — one row/col per world-hex).
    if (window.worldMapData && window.worldMapData[6] && window.worldMapData[6][4] !== undefined) {
        window.worldMapData[6][4] = { t: 'G', f: 'V', o: 'h', p: 1, n: 'Emberlode' };
    }
}

// Reads the journal at the abandoned house — the first breadcrumb toward
// the necromancer/lichdom plot arc. Knowledge: Religion reveals specifics
// (phylactery, a soul-binding ritual) that the vague version only hints at.
function readAbandonedHouseJournal() {
    const knowsReligion = window.party && window.party.some(p => window.hasKnowledgeReligion(p));
    if (knowsReligion) {
        window.showDialogue({ name: 'Journal', customImage: 'journal' },
            "The handwriting is frantic in places, careful in others. Early pages complain of neighbors and bad harvests. Later ones turn strange: notes on binding a soul to a vessel, on preparing \"the vessel\" before the body fails, half-finished diagrams that look uncomfortably like a phylactery. Whoever lived here wasn't just killed by the skeletons outside — they were close, terribly close, to becoming something that doesn't die at all."
        );
    } else {
        window.showDialogue({ name: 'Journal', customImage: 'journal' },
            "A journal, water-stained and half-legible. Pages of ordinary complaints — bad harvests, noisy neighbors — give way to frantic, cramped handwriting you can't make sense of: something about \"the vessel,\" about being almost ready. Whatever it means, it isn't good."
        );
    }
}

// A breadcrumb toward a third, larger plot arc: a foreign invasion, with the
// Skarn-tooth goblins pushed this far south as a scouting/probing force
// rather than acting alone. Deliberately vague — no invasion mechanics yet,
// just enough to make a later reveal feel earned. First read cascades a
// small security dip into Hollowmere (word of something bigger unsettles
// the region), same mechanism as the farm quest reward.
function readGoblinScoutNote() {
    if (!window.goblinScoutNoteRead) {
        window.goblinScoutNoteRead = true;
        if (window.cascadeRegionStat) window.cascadeRegionStat('hollowmere', 'security', -3);
    }
    window.showDialogue({ name: 'Note', customImage: 'journal' },
        "A scrap of oilcloth, tucked inside the hut — not goblin make, and not goblin script. A crude map marks Hollowmere and the roads around it with small tally marks, dated across several months. At the bottom, in a different hand: \"Count their walls. Count their swords. Report back before the frost.\""
    );
}
window.readGoblinScoutNote = readGoblinScoutNote;

// Emberlode's production ledger — reads differently once the goblin_threat
// quest is resolved (any path), since that's what actually reopens the road.
function readEmberlodeLedger() {
    const quest = window.questLog && window.questLog.find(q => q.id === 'goblin_threat');
    if (quest && quest.resolution) {
        window.showDialogue({ name: 'Ledger', customImage: 'journal' },
            "The most recent entries are a different hand than the rest — steadier. Cart counts climbing week over week, a note in the margin: \"Road's clear again. Back to full crews by the new moon.\""
        );
    } else {
        window.showDialogue({ name: 'Ledger', customImage: 'journal' },
            "Weeks of thin entries: half-crews, carts turned back, one line just reading \"lost another cart to the greenskins — Corran says hold the line.\" Whatever this mine used to produce, it isn't producing it now."
        );
    }
}
window.readEmberlodeLedger = readEmberlodeLedger;

window.setupVillageScene = setupVillageScene;
window.toggleDoor = toggleDoor;
window.readSignpost = readSignpost;
window.readAbandonedHouseJournal = readAbandonedHouseJournal;
