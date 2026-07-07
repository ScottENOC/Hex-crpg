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
// `targetR`/`driftBias` support deliberate long bends, chained across
// multiple calls: pass the previous call's returned `{q, r}` in as the next
// call's `startR` so the river continues from exactly where it left off,
// and give that next leg its own `targetR` (with `driftBias` > 0) to bend it
// toward a new heading over the length of that leg. Omitting them (as the
// original two calls do) keeps the old plain, undirected 50/50 wiggle.
function paintStreamSegment(startQ, endQ, dqStep, startR, targetR = startR, driftBias = 0) {
    let r = startR;
    let width = 1;
    for (let q = startQ; dqStep > 0 ? q <= endQ : q >= endQ; q += dqStep) {
        window.setTerrainAt(q, r, 'Water');
        let connectorPainted = 0; // the extra centerline-shift hex counts toward this column's width cap
        if (window.pseudoRandom(q * 0.41, 5) < 0.35) {
            const roll = window.pseudoRandom(q * 0.77, 13);
            if (driftBias > 0 && targetR !== r) {
                const towardSign = targetR > r ? 1 : -1;
                r += roll < (0.5 + driftBias / 2) ? towardSign : -towardSign;
            } else {
                r += roll < 0.5 ? -1 : 1;
            }
            window.setTerrainAt(q, r, 'Water');
            connectorPainted = 1;
        }
        if (window.pseudoRandom(q * 0.53, 19) < 0.15) {
            width = 1 + Math.floor(window.pseudoRandom(q * 0.29, 43) * 3); // 1..3
        }
        const extra = Math.max(0, width - 1 - connectorPainted);
        for (let w = 1; w <= extra; w++) window.setTerrainAt(q, r + w, 'Water');
    }
    return { q: endQ, r };
}

// Carves a simple rectangular building: walls on the border, floor inside,
// one open door hex. Same overrideTerrain technique as the tavern — same
// hex grid, no separate interior map. Returns the interior bounding box so
// callers can register it for hex-local lighting.
// A fixed r-range per q column is a parallelogram in screen space, not a
// rectangle — axial (q,r) shears as q changes (see hexToPixel: screen y
// depends on r + q/2). rowShift below cancels that shear so the building
// reads as an actual rectangle, zig-zagging by half a hex per column the
// way real hex-grid buildings do, instead of one long diagonal wall.
function hexRowShift(dq) {
    return Math.floor(dq / 2);
}

// A fixed 1-hex "margin column" around the floor isn't actually 1 hex of
// wall everywhere — true hex neighbors span two rows in an adjacent column,
// and which two rows shifts by parity (see hexRowShift). A uniform margin
// leaves gaps exactly at the parity seams, showing floor touching outdoor
// terrain with no wall between. Building the wall as the real hex-adjacency
// ring around the floor (rather than an assumed row range) fixes this
// regardless of any row-shift stagger.
function wallRingAroundFloor(floorHexes) {
    const floorSet = new Set(floorHexes.map(h => `${h.q},${h.r}`));
    const wallSet = new Set();
    floorHexes.forEach(h => {
        window.getNeighbors(h.q, h.r).forEach(n => {
            const key = `${n.q},${n.r}`;
            if (!floorSet.has(key)) wallSet.add(key);
        });
    });
    return [...wallSet].map(k => { const [q, r] = k.split(',').map(Number); return { q, r }; });
}

function carveBuilding(centerQ, centerR, halfW, halfH, doorHex, floorType) {
    const floorHexes = [];
    for (let dq = -halfW + 1; dq <= halfW - 1; dq++) {
        const shift = hexRowShift(dq);
        for (let dr = -halfH + 1; dr <= halfH - 1; dr++) {
            floorHexes.push({ q: centerQ + dq, r: centerR + dr + shift });
        }
    }
    wallRingAroundFloor(floorHexes).forEach(h => window.setTerrainAt(h.q, h.r, 'Wall'));
    floorHexes.forEach(h => window.setTerrainAt(h.q, h.r, floorType));
    window.setTerrainAt(doorHex.q, doorHex.r, floorType);
    window.tileObjects[`${doorHex.q},${doorHex.r}`] = { type: 'door_open', lightRadius: 0 };
    // Bounding box padded by the max row shift across the footprint's width,
    // since each column's actual r-range is offset from the center now.
    const maxShift = Math.max(Math.abs(hexRowShift(-halfW)), Math.abs(hexRowShift(halfW)));
    return {
        minQ: centerQ - halfW + 1, maxQ: centerQ + halfW - 1,
        minR: centerR - halfH + 1 - maxShift, maxR: centerR + halfH - 1 + maxShift,
        lightMult: 0.3,
        doorHex: { q: doorHex.q, r: doorHex.r }
    };
}

// hexRowShift's sign doesn't actually cancel hexToPixel's shear (screen
// y ~ r + q/2; canceling that as q varies needs shift(dq) ~ -dq/2, but
// hexRowShift returns +floor(dq/2) — so every carveBuilding room actually
// reads as a diamond/rhombus on screen, not a rectangle, confirmed visually
// on the palace). Fixing hexRowShift itself would reshape every building in
// the game (tavern, houses, Ironvein, the farm...), all of which have
// interior decorations placed at hardcoded offsets tuned against the
// current (wrong) shape — far too large a blast radius to safely re-verify
// here. carveFlatRoom is the corrected version, used only for new palace
// construction so its rooms actually read as level-topped rectangles
// ("/\/\/\/\" zig-zag reading as a flat line, not a slanted diamond edge).
function hexRowShiftFlat(dq) {
    return -Math.floor(dq / 2);
}

function carveFlatRoom(centerQ, centerR, halfW, halfH, doorHex, floorType, wallType = 'Wall') {
    const floorHexes = [];
    for (let dq = -halfW + 1; dq <= halfW - 1; dq++) {
        const shift = hexRowShiftFlat(dq);
        for (let dr = -halfH + 1; dr <= halfH - 1; dr++) {
            floorHexes.push({ q: centerQ + dq, r: centerR + dr + shift });
        }
    }
    const wallHexes = wallRingAroundFloor(floorHexes);
    wallHexes.forEach(h => window.setTerrainAt(h.q, h.r, wallType));
    floorHexes.forEach(h => window.setTerrainAt(h.q, h.r, floorType));
    if (doorHex) {
        window.setTerrainAt(doorHex.q, doorHex.r, floorType);
        window.tileObjects[`${doorHex.q},${doorHex.r}`] = { type: 'door_open', lightRadius: 0 };
    }
    const maxShift = Math.max(Math.abs(hexRowShiftFlat(-halfW)), Math.abs(hexRowShiftFlat(halfW)));
    return {
        minQ: centerQ - halfW + 1, maxQ: centerQ + halfW - 1,
        minR: centerR - halfH + 1 - maxShift, maxR: centerR + halfH - 1 + maxShift,
        lightMult: 0.3,
        doorHex: doorHex ? { q: doorHex.q, r: doorHex.r } : null,
        floorHexes, wallHexes, floorType
    };
}

// The 6 native hex directions (same order getNeighbors uses, hexMap.js) —
// carveStarFort walks these outward to build each of a star fort's 6
// points, one per direction, so the shape always has exactly 6 points
// (arbitrary point counts would need bearing-interpolation between two
// directions, not worth the complexity for a first pass).
const STAR_FORT_DIRECTIONS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

// A hex-radius disk of floor hexes around a center point (true hex
// adjacency via BFS through getNeighbors, not a q/r rectangle) — the core
// of a star fort, and reused for each point's own lateral spread below.
function hexDisk(centerQ, centerR, radius) {
    const hexes = [{ q: centerQ, r: centerR }];
    const seen = new Set([`${centerQ},${centerR}`]);
    let frontier = [{ q: centerQ, r: centerR }];
    for (let ring = 0; ring < radius; ring++) {
        const next = [];
        frontier.forEach(h => {
            window.getNeighbors(h.q, h.r).forEach(n => {
                const key = `${n.q},${n.r}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    hexes.push(n);
                    next.push(n);
                }
            });
        });
        frontier = next;
    }
    return hexes;
}

// Builds a 6-pointed star fort: a small core disk plus 6 outward wedges
// (one per native hex direction), each wide enough at the tip to be a real
// archer platform. Returns the same bbox/doorHex shape carveFlatRoom
// returns, so fort-population code can reuse bbox-based placement helpers.
// `wallType` lets the inner keep reuse this same shape with 'keep_wall'
// instead (see buildNorthwatchFort/buildRidgeholdFort).
function carveStarFort(centerQ, centerR, coreRadius, pointLength, pointWidth, gateHex, floorType, wallType = 'Climbable Wall') {
    const floorSet = new Map();
    hexDisk(centerQ, centerR, coreRadius).forEach(h => floorSet.set(`${h.q},${h.r}`, h));

    STAR_FORT_DIRECTIONS.forEach(dir => {
        // Walk outward along this direction from the edge of the core; at
        // each step out, spread laterally by up to pointWidth via the two
        // directions adjacent to `dir` in the 6-direction cycle, so the tip
        // reads as a flat wedge (wide enough for several archers) rather
        // than a single-hex spike.
        const dirIndex = STAR_FORT_DIRECTIONS.indexOf(dir);
        const lateralA = STAR_FORT_DIRECTIONS[(dirIndex + 2) % 6];
        const lateralB = STAR_FORT_DIRECTIONS[(dirIndex + 4) % 6];
        for (let step = coreRadius + 1; step <= coreRadius + pointLength; step++) {
            const base = { q: centerQ + dir.q * step, r: centerR + dir.r * step };
            floorSet.set(`${base.q},${base.r}`, base);
            for (let w = 1; w <= pointWidth; w++) {
                const a = { q: base.q + lateralA.q * w, r: base.r + lateralA.r * w };
                const b = { q: base.q + lateralB.q * w, r: base.r + lateralB.r * w };
                floorSet.set(`${a.q},${a.r}`, a);
                floorSet.set(`${b.q},${b.r}`, b);
            }
        }
    });

    const floorHexes = [...floorSet.values()];
    const wallHexes = wallRingAroundFloor(floorHexes);
    wallHexes.forEach(h => window.setTerrainAt(h.q, h.r, wallType));
    floorHexes.forEach(h => window.setTerrainAt(h.q, h.r, floorType));
    if (gateHex) window.setTerrainAt(gateHex.q, gateHex.r, floorType); // no door tileObject — the gate is just the intended gap in an otherwise-uniformly-climbable ring

    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
    floorHexes.forEach(h => {
        minQ = Math.min(minQ, h.q); maxQ = Math.max(maxQ, h.q);
        minR = Math.min(minR, h.r); maxR = Math.max(maxR, h.r);
    });
    return {
        minQ, maxQ, minR, maxR, lightMult: 1.0,
        doorHex: gateHex ? { q: gateHex.q, r: gateHex.r } : null,
        floorHexes, wallHexes, floorType, center: { q: centerQ, r: centerR }
    };
}

// Re-stamps a room's floor and wall ring back to their intended terrain,
// undoing any accidental overwrite from a later path/corridor crossing
// through it (the actual cause of the throne room's walls getting
// partially replaced with Path — a connecting path drawn along the same
// row as the wall, or overshooting into the interior). Call this AFTER
// every path that connects to a room has been painted, so it's the true
// final word on that room's own footprint. `extraDoorHexes` lets a room
// with more than one door (e.g. the throne room's rear door to the
// bedroom) keep every door open, not just the one carveFlatRoom itself
// already knows about.
function sealRoom(region, extraDoorHexes = []) {
    if (!region) return;
    const doorKeys = new Set([region.doorHex, ...extraDoorHexes].filter(Boolean).map(h => `${h.q},${h.r}`));
    (region.floorHexes || []).forEach(h => {
        if (doorKeys.has(`${h.q},${h.r}`)) return;
        window.setTerrainAt(h.q, h.r, region.floorType);
    });
    (region.wallHexes || []).forEach(h => {
        if (doorKeys.has(`${h.q},${h.r}`)) return;
        window.setTerrainAt(h.q, h.r, 'Wall');
    });
    doorKeys.forEach(k => {
        const [q, r] = k.split(',').map(Number);
        window.setTerrainAt(q, r, region.floorType);
        if (!window.tileObjects[k]) window.tileObjects[k] = { type: 'door_open', lightRadius: 0 };
    });
}

// Old Mac's Farmstead: a small house + fenced pasture at the end of the
// south road, just past the border of this world-map hex. Reuses
// carveBuilding for the house; the pasture is a plain rectangle of Grass
// (already the default) with fence tileObjects lining its perimeter —
// decorative only, not a collision boundary, same as table/bench.
function buildFarmstead(roadEnd) {
    const houseCenter = { q: roadEnd.q - 6, r: roadEnd.r };
    window.campaign2FarmHouseCenter = houseCenter; // exposed for Old Mac's daily schedule
    const doorHex = { q: houseCenter.q + 3, r: houseCenter.r };
    const farmHouseRegion = carveBuilding(houseCenter.q, houseCenter.r, 3, 2, doorHex, 'Wood Floor');
    window.interiorRegions.push(farmHouseRegion);

    // Short spur connecting the farmhouse door back to the south road.
    for (let q = doorHex.q + 1; q < roadEnd.q; q++) window.setTerrainAt(q, roadEnd.r, 'Path');

    // Fenced pasture west of the house. Its east edge sits flush with the
    // house's own west wall (houseCenter.q - 3, matching carveBuilding's
    // halfW=3 above) rather than cutting inside the building — the two
    // areas share that wall (already stone-colored Wall terrain) instead of
    // a wooden fence running across/through the house. The wooden fence
    // only continues along that same q line above and below the house's
    // actual r-span (houseCenter.r-2..+2), where there's no wall to share.
    const pMinQ = houseCenter.q - 9, pMaxQ = houseCenter.q - 3;
    const pMinR = houseCenter.r - 4, pMaxR = houseCenter.r + 4;
    const houseMinR = houseCenter.r - 2, houseMaxR = houseCenter.r + 2;
    for (let q = pMinQ; q <= pMaxQ; q++) {
        window.tileObjects[`${q},${pMinR}`] = { type: 'fence_h', lightRadius: 0 };
        window.tileObjects[`${q},${pMaxR}`] = { type: 'fence_h', lightRadius: 0 };
    }
    for (let r = pMinR; r <= pMaxR; r++) {
        window.tileObjects[`${pMinQ},${r}`] = { type: 'fence_v', lightRadius: 0 };
        if (r < houseMinR || r > houseMaxR) {
            window.tileObjects[`${pMaxQ},${r}`] = { type: 'fence_v', lightRadius: 0 };
        }
    }
    window.campaign2FarmPastureCenter = { q: Math.floor((pMinQ + pMaxQ) / 2), r: houseCenter.r };

    // A broken section of the outer fence plus a blood trail fading away
    // toward the treeline — evidence of how the wolves actually got at the
    // sheep, and a breadcrumb pointing toward their den, which sits well
    // outside the pasture (a "bit of a walk," not visible from the farm) —
    // see triggerFarmWolfEncounter in campaign2Dialogue.js for where the
    // wolves themselves get spawned. The gap doesn't slow movement like an
    // intact fence does (getMoveCostMult only special-cases fence_h/fence_v).
    const brokenFenceHex = { q: pMinQ, r: houseCenter.r };
    window.tileObjects[`${brokenFenceHex.q},${brokenFenceHex.r}`] = { type: 'fence_broken', lightRadius: 0 };
    window.campaign2BrokenFenceHex = brokenFenceHex;
    // Well past the ~30-hex daylight vision cap (see isVisibleToPlayer in
    // hexMap.js) so the den is a genuine "go explore in that direction"
    // discovery, not something visible — or immediately engageable — from
    // the pasture itself. 34 hexes wasn't quite enough margin (visionBonus
    // and hex-distance rounding could still let the pen see/reach them), so
    // this pushes well clear of any realistic vision/reach bonus.
    window.campaign2WolfDenCenter = { q: pMinQ - 50, r: houseCenter.r + 10 };

    // Spatters get sparser and, past the first handful, only visible with
    // Knowledge: Nature (see the tileObjects render loop in gameEngine.js) —
    // a plain trail across grass in a game with limited "make it obvious" UI
    // wouldn't stay wrong. Deliberately stops short of the den itself so the
    // wolves stay a genuine "not visible" discovery, not a marker-guided walk.
    let trailHex = { ...brokenFenceHex };
    for (let i = 1; i <= 10; i++) {
        trailHex = (window.stepToward && window.stepToward(trailHex, window.campaign2WolfDenCenter)) || trailHex;
        const key = `${trailHex.q},${trailHex.r}`;
        if (window.tileObjects[key]) continue;
        if (i <= 4) {
            window.tileObjects[key] = { type: 'blood_spatter', lightRadius: 0 };
        } else if (i % 2 === 0) {
            window.tileObjects[key] = { type: 'blood_spatter_faint', lightRadius: 0 };
        }
    }

    // A sheep or two left in the (mostly) intact part of the pasture — the
    // farm reads a little more alive, and gives the player something to
    // click/talk to that isn't Old Mac. Passive, low HP, says only "Baa."
    // (see talkToNPC's dialogue dispatch in campaign2Dialogue.js).
    [{ q: houseCenter.q - 4, r: houseCenter.r - 1 }, { q: houseCenter.q - 5, r: houseCenter.r + 1 }].forEach((hex, i) => {
        const sheep = new window.Entity(`Sheep${i > 0 ? ' ' + (i + 1) : ''}`, '#f5f5f0', hex, 10);
        sheep.hp = 3;
        sheep.maxHp = 3;
        sheep.side = 'neutral';
        sheep.isNPC = true;
        sheep.customImage = 'sheep';
        sheep.tags = ['animal'];
        sheep.dialogueId = 'farm_sheep';
        window.entities.push(sheep);
    });

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
function buildGoblinNPC({ name, title, monsterType, hex, customSkills, customEquipment, side, dialogueId, color }) {
    const ent = window.createMonster(monsterType, hex, customSkills || null, customEquipment || null, side || 'neutral');
    ent.name = name;
    ent.title = title || null;
    ent.isNPC = true;
    ent.dialogueId = dialogueId || null;
    ent.factionId = 'goblin_tribe';
    // Renaming to a specific NPC name (e.g. "Goblin Skulker") breaks the
    // renderer's name-based sprite lookup, which would otherwise fall back to
    // the flat, untinted default goblin art (same issue the arena's named
    // bosses solve with spriteBase — see gameEngine.js's boss spawn code).
    if (color) {
        ent.color = color;
        ent.spriteBase = monsterType;
    }
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
    // A gift-based way into the chief's trust, same leverage/`wants` pattern
    // as Bram at the Reddale guardhouse — separate from (and much faster
    // than) grinding standing up via offerGoblinFavor. Paying it unlocks the
    // "let them stay" alliance branch in chief_skarnub's dialogue tree (see
    // campaign2Dialogue.js).
    chief.wants = {
        type: 'gold', amount: 60, offerLabel: 'gift', description: "a show of good faith, so his tribe isn't run off",
        fullHint: "Skarnub sizes up strangers by what they're willing to give up front, not just what they say.",
        partialHint: "He watches your hands more than your face — weighing whether you came empty-handed."
    };
    chief.vagueFlavor = "Hard to read. Could go either way.";
    chief.onBribeSuccess = () => {
        chief.giftedIn = true;
        window.showDialogue(chief, "Huh. Didn't expect that. Maybe you're not just another human come to run us off.", [{ label: "...", action: () => {} }]);
    };
    const lieutenant = buildGoblinNPC({ ...window.campaign2GoblinLieutenant, hex: { q: center.q - 2, r: center.r } });
    const shaman = buildGoblinNPC({ ...window.campaign2GoblinShaman, hex: { q: center.q + 2, r: center.r } });
    window.entities.push(chief, lieutenant, shaman);

    const guardHexes = [{ q: center.q - 3, r: center.r + 1 }, { q: center.q + 3, r: center.r + 1 }, { q: center.q, r: center.r + 1 }];
    // Guards mostly hold their post, but drift off to the fire, a hut (food/
    // sleep), or a neighbor's hut (to pilfer from a "friend") rather than
    // standing like statues — see behaviorTick's campRoutine case.
    const campSpots = [
        { q: center.q, r: center.r },           // the campfire
        { q: center.q - 3, r: center.r - 1 },   // a hut
        { q: center.q + 3, r: center.r - 1 },   // another hut
    ];
    (window.campaign2GoblinGuards || []).forEach((spec, i) => {
        const guard = buildGoblinNPC({ ...spec, hex: guardHexes[i] || { q: center.q, r: center.r + 2 } });
        guard.behaviorType = 'campRoutine';
        guard.homeHex = { ...guard.hex };
        guard.campSpots = campSpots;
        // Visual preference: these three render with the orc base art
        // (weapons/armor still layer on top normally) rather than the
        // flat default goblin sprite, even though they're still goblins
        // narratively (Skarn-tooth tribe, goblin_tribe faction, etc).
        guard.forceOrcSprite = true;
        window.entities.push(guard);
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

// Player housing (MVP): a surveyed plot near the crossroads the player can
// build on for free, no resource cost yet — that's a later system. Building
// swaps the plot marker for a real one-room cottage with a bed that gives a
// free version of restAtInn's safe rest (see restAtHome in gameEngine.js).
function buildPlayerCottagePlot(crossroads) {
    if (!crossroads) return;
    const plot = { q: crossroads.q + 5, r: crossroads.r + 3 };
    for (let q = crossroads.q + 1; q <= plot.q; q++) window.setTerrainAt(q, crossroads.r, 'Path');
    for (let r = crossroads.r + 1; r <= plot.r; r++) window.setTerrainAt(plot.q, r, 'Path');
    window.tileObjects[`${plot.q},${plot.r}`] = { type: 'building_plot' };
    window.campaign2PlayerCottagePlot = plot;

    if (window.campaign2HollowmereBuilder) {
        window.entities.push(window.buildNPC({ ...window.campaign2HollowmereBuilder, hex: { q: plot.q - 2, r: plot.r } }));
    }
}

// Called when the player interacts with the building_plot marker (see
// interactWithTileObject in gameEngine.js). Carves a small one-room cottage
// in place, right on the plot hex, and replaces the marker with a bed.
function buildPlayerCottage(q, r) {
    if (window.campaign2PlayerCottageBuilt) return;
    const plot = window.campaign2PlayerCottagePlot;
    if (!plot || q !== plot.q || r !== plot.r) return;
    const doorHex = { q: plot.q, r: plot.r + 2 };
    const region = carveBuilding(plot.q, plot.r, 2, 2, doorHex, 'Wood Floor');
    window.interiorRegions.push(region);
    window.tileObjects[`${plot.q},${plot.r}`] = { type: 'player_bed', lightRadius: 0 };
    window.tileObjects[`${plot.q - 1},${plot.r}`] = { type: 'fireplace', lightRadius: 5 };
    window.campaign2PlayerCottageBuilt = true;
    window.showMessage("You build a small cottage here. It's yours now — free to rest whenever you need.");
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
}
window.buildPlayerCottage = buildPlayerCottage;

// Build order target (see construction.js's upgrade_cottage): re-carves a
// bigger footprint around the same plot center, keeping the existing bed
// hex untouched (carveBuilding only paints floor/wall terrain, never
// clobbers an existing tileObject at a floor hex) and adding real furniture.
function upgradePlayerCottage() {
    if (!window.campaign2PlayerCottageBuilt || window.campaign2PlayerCottageUpgraded) return;
    const plot = window.campaign2PlayerCottagePlot;
    const doorHex = { q: plot.q, r: plot.r + 3 };
    const region = carveBuilding(plot.q, plot.r, 3, 3, doorHex, 'Wood Floor');
    window.interiorRegions.push(region);
    window.tileObjects[`${plot.q + 1},${plot.r}`] = { type: 'table' };
    window.tileObjects[`${plot.q + 1},${plot.r - 1}`] = { type: 'bench' };
    window.campaign2PlayerCottageUpgraded = true;
    window.showMessage("The builders finish their work — your cottage is now a proper country house.");
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
}
window.upgradePlayerCottage = upgradePlayerCottage;

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
    // carveFlatRoom (not carveBuilding) so the house reads as a real square
    // instead of carveBuilding's uncorrected hex-shear slant (its right
    // side sitting visibly lower than its left).
    const houseRegion = carveFlatRoom(center.q, center.r, 3, 2, doorHex, 'Wood Floor');
    window.interiorRegions.push(houseRegion);

    for (let q = waypoint.q + 1; q < doorHex.q; q++) window.setTerrainAt(q, waypoint.r, 'Path');

    window.tileObjects[`${center.q},${center.r}`] = { type: 'journal', lightRadius: 0 };
    window.campaign2AbandonedHouseCenter = center;

    // Placed dormant (side:'enemy' but not yet aiState:'combat') — waking
    // them all up here at world-build time would make window.isInCombat
    // true for the entire game from the moment Campaign 2 loads, since
    // checkInCombat() scans every entity regardless of distance. They're
    // woken via proximity instead (see worldTime.js's tick).
    //
    // hexRowShiftFlat(dq) compensates each skeleton's row for the same
    // per-column shear carveFlatRoom itself applies to the floor — without
    // it, an off-center skeleton (dq != 0) could land one row off the
    // actual (corrected) floor and end up standing in the wall.
    (window.campaign2AbandonedHouseSkeletons || []).forEach((hexOffset, i) => {
        const shift = hexRowShiftFlat(hexOffset.q);
        const skeleton = window.createMonster('skeleton', { q: center.q + hexOffset.q, r: center.r + hexOffset.r + shift }, null, null, 'enemy');
        skeleton.necromancerMinion = true; // defeating them costs necromancer_cult standing (see handleLethalDamage)
        window.entities.push(skeleton);
    });

    // A cold ritual altar in the house's back room, holding a shard of the
    // necromancer's phylactery. Interacting picks it up (once); interacting
    // again while holding it offers to return it — see interactPhylacteryAltar.
    window.tileObjects[`${center.q + 1},${center.r}`] = { type: 'journal', readId: 'phylactery_altar', lightRadius: 0 };
}

// True once every skeleton guarding the abandoned house is dead — the
// "squatting after clearing a location" acquisition path for this build
// order (see construction.js's renovate_abandoned_house).
function isAbandonedHouseCleared() {
    return !window.entities.some(e => e.alive && e.necromancerMinion);
}
window.isAbandonedHouseCleared = isAbandonedHouseCleared;

// Build order target: adds a bed once the place is cleared and paid for,
// without touching the existing journal/altar tileObjects the necromancer
// breadcrumb quest content still needs.
function renovateAbandonedHouse() {
    if (window.campaign2AbandonedHouseRenovated) return;
    const center = window.campaign2AbandonedHouseCenter;
    if (!center) return;
    window.tileObjects[`${center.q - 1},${center.r}`] = { type: 'player_bed', lightRadius: 0 };
    window.campaign2AbandonedHouseRenovated = true;
    window.showMessage("The builders clean out the wreckage and patch the walls. It's a proper second home now.");
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
}
window.renovateAbandonedHouse = renovateAbandonedHouse;

// Build order target for fortify_manor (construction.js) — only reachable
// once the Queen has actually granted the manor (see the silverhart_queen
// dialogue tree). Adds the bed that makes it a real free-rest property.
function fortifySilverhartManor() {
    if (window.campaign2SilverhartManorFortified) return;
    const center = window.campaign2SilverhartManorCenter;
    if (!center) return;
    window.tileObjects[`${center.q},${center.r}`] = { type: 'player_bed', lightRadius: 0 };
    window.tileObjects[`${center.q - 1},${center.r}`] = { type: 'fireplace', lightRadius: 5 };
    window.campaign2SilverhartManorFortified = true;
    window.showMessage("The builders patch the roof and walls. Your manor is finally livable.");
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
}
window.fortifySilverhartManor = fortifySilverhartManor;

// Millbrook: a minimal stub village at the far end of the north road, three
// world-map hexes from Hollowmere — a start, not fully built out. One
// building and a single villager for now.
function buildMillbrook(roadEnd) {
    // Offset off the through-road's own column (which continues north past
    // this point all the way to Silverhart) rather than centered directly
    // on it — building squarely on the road made the road look like it
    // "stopped at her front door" and then a second, disconnected-looking
    // stretch "came out the back of her house" toward the capital. Uses
    // carveFlatRoom (not carveBuilding) so the building itself reads as a
    // real square instead of carveBuilding's uncorrected hex-shear slant.
    const center = { q: roadEnd.q - 6, r: roadEnd.r };
    const doorHex = { q: center.q + 3, r: center.r };
    const millbrookRegion = carveFlatRoom(center.q, center.r, 3, 3, doorHex, 'Wood Floor');
    window.interiorRegions.push(millbrookRegion);

    for (let q = doorHex.q + 1; q < roadEnd.q; q++) window.setTerrainAt(q, roadEnd.r, 'Path');

    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.campaign2MillbrookCenter = center;

    if (window.campaign2MillbrookVillager) {
        const villager = window.buildNPC({ ...window.campaign2MillbrookVillager, hex: { q: center.q + 1, r: center.r } });
        window.entities.push(villager);
    }

    // Border War quest-giver 1 (the hook) — passing through, not a
    // resident, so he's placed just outside the house rather than inside.
    if (window.campaign2BorderWarQuartermaster) {
        const quartermaster = window.buildNPC({ ...window.campaign2BorderWarQuartermaster, hex: { q: doorHex.q + 1, r: doorHex.r } });
        window.entities.push(quartermaster);
    }

    if (window.worldMapData && window.worldMapData[3] && window.worldMapData[3][6] !== undefined) {
        window.worldMapData[3][6] = { t: 'G', f: 'V', o: 'h', p: 1, n: 'Millbrook' };
    }
}

// Silverhart Palace: the kingdom's capital, one more world-hex north of
// Millbrook on the same road (see setupVillageScene's northRoadEnd). Three
// separate carveBuilding wings clustered around a short courtyard, the same
// "one room per carveBuilding call" convention every other multi-building
// site here uses (see buildReddale) — a throne room (the biggest, holding
// the throne + King + his flanking guards), a barracks (most of the "lots
// of guards" ask), and a small council chamber for the Chancellor.
function buildSilverhartPalace(roadEnd) {
    // Grand Hall — the palace's real centerpiece, roughly 50% bigger in
    // each direction than the old throne room, and carved with
    // carveFlatRoom (not carveBuilding) so its outer wall actually reads as
    // a level-topped rectangle on screen instead of a slanted diamond.
    const throneCenter = { q: roadEnd.q, r: roadEnd.r };
    const throneDoor = { q: throneCenter.q, r: throneCenter.r + 4 };
    const throneRegion = carveFlatRoom(throneCenter.q, throneCenter.r, 7, 5, throneDoor, 'Wood Floor');
    window.interiorRegions.push(throneRegion);
    window.campaign2PalaceThroneCenter = throneCenter;

    for (let r = roadEnd.r + 1; r < throneDoor.r; r++) window.setTerrainAt(roadEnd.q, r, 'Path');

    // The throne itself sits at the far (north) end of the hall, opposite
    // the door, flanked by fireplaces and long tables down the hall for a
    // real "great hall" feel rather than one bare room.
    const throneSeat = { q: throneCenter.q, r: throneCenter.r - 3 };
    window.tileObjects[`${throneSeat.q},${throneSeat.r}`] = { type: 'throne' };
    window.tileObjects[`${throneSeat.q - 2},${throneSeat.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.tileObjects[`${throneSeat.q + 2},${throneSeat.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.tileObjects[`${throneCenter.q - 1},${throneCenter.r - 1}`] = { type: 'table' };
    window.tileObjects[`${throneCenter.q + 1},${throneCenter.r - 1}`] = { type: 'table' };
    window.tileObjects[`${throneCenter.q - 1},${throneCenter.r + 1}`] = { type: 'table' };
    window.tileObjects[`${throneCenter.q + 1},${throneCenter.r + 1}`] = { type: 'table' };
    window.tileObjects[`${throneCenter.q - 3},${throneCenter.r}`] = { type: 'bench' };
    window.tileObjects[`${throneCenter.q + 3},${throneCenter.r}`] = { type: 'bench' };

    if (window.campaign2SilverhartQueen) {
        const queen = window.buildNPC({ ...window.campaign2SilverhartQueen, hex: { q: throneSeat.q, r: throneSeat.r + 1 } });
        queen.goldGear = true; // recolors her armor/helm gold at render time
        window.entities.push(queen);
        window.campaign2QueenEntityName = queen.name;
    }

    // Courtyard entry point: a few hexes south of the throne room's own
    // door, safely clear of its wall/floor footprint — every externally-
    // connected wing (barracks, council, tower) branches off from here
    // instead of routing along/through the throne room's own wall row
    // (the old bug: those spurs used to run straight down throneDoor.r,
    // which IS the wall's row, carving extra "doors" through it).
    //
    // carveFlatRoom shears each column south/north by hexRowShiftFlat(dq)
    // to keep the room looking flat-topped, so the throne room's southern
    // wall does NOT sit at a single fixed r across all q — on the west
    // side (toward council/tower, negative dq) it dips several rows
    // further south than directly under the door. A horizontal corridor
    // at a single fixed row can therefore cut clean under the room's own
    // sheared wall on that side. Guard against it by reading the room's
    // real wall-ring hexes and picking a row past the deepest one actually
    // used by the westward corridors below (barracks mirrors it eastward,
    // covered by the same margin).
    const throneWallMaxR = Math.max(...throneRegion.wallHexes.map(h => h.r));
    const courtyard = { q: throneCenter.q, r: Math.max(throneDoor.r + 2, throneWallMaxR + 1) };
    for (let r = throneDoor.r + 1; r <= courtyard.r; r++) window.setTerrainAt(throneCenter.q, r, 'Path');

    // Barracks: east wing, bigger than before — off its own short spur from
    // the courtyard, where most of the "lots of guards" actually live.
    // External connection: the door opens onto its own little path apron
    // outside (never inside the room itself), which then runs west through
    // the courtyard back to the palace's own front door.
    const barracksCenter = { q: throneCenter.q + 14, r: throneCenter.r + 2 };
    const barracksDoor = { q: barracksCenter.q - 4, r: barracksCenter.r };
    const barracksRegion = carveFlatRoom(barracksCenter.q, barracksCenter.r, 4, 4, barracksDoor, 'Wood Floor');
    window.interiorRegions.push(barracksRegion);
    window.tileObjects[`${barracksCenter.q},${barracksCenter.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.tileObjects[`${barracksCenter.q},${barracksCenter.r - 1}`] = { type: 'bench' };
    window.tileObjects[`${barracksCenter.q},${barracksCenter.r + 1}`] = { type: 'bench' };
    window.tileObjects[`${barracksCenter.q - 1},${barracksCenter.r}`] = { type: 'table' };
    window.campaign2PalaceBarracksCenter = barracksCenter;
    for (let q = courtyard.q + 1; q < barracksDoor.q; q++) window.setTerrainAt(q, courtyard.r, 'Path');
    for (let r = Math.min(courtyard.r, barracksDoor.r); r <= Math.max(courtyard.r, barracksDoor.r); r++) window.setTerrainAt(barracksDoor.q - 1, r, 'Path');

    // Council chamber: west wing, mirrored, for the Chancellor. Same
    // external-connection shape as the barracks, mirrored west.
    const councilCenter = { q: throneCenter.q - 14, r: throneCenter.r + 2 };
    const councilDoor = { q: councilCenter.q + 4, r: councilCenter.r };
    const councilRegion = carveFlatRoom(councilCenter.q, councilCenter.r, 4, 3, councilDoor, 'Wood Floor');
    window.interiorRegions.push(councilRegion);
    window.tileObjects[`${councilCenter.q},${councilCenter.r}`] = { type: 'table' };
    window.tileObjects[`${councilCenter.q},${councilCenter.r - 1}`] = { type: 'bench' };
    window.campaign2PalaceCouncilCenter = councilCenter;
    for (let q = councilDoor.q + 1; q < courtyard.q; q++) window.setTerrainAt(q, courtyard.r, 'Path');
    for (let r = Math.min(courtyard.r, councilDoor.r); r <= Math.max(courtyard.r, councilDoor.r); r++) window.setTerrainAt(councilDoor.q + 1, r, 'Path');

    if (window.campaign2PalaceChancellor) {
        window.entities.push(window.buildNPC({ ...window.campaign2PalaceChancellor, hex: { q: councilCenter.q, r: councilCenter.r - 1 } }));
    }

    // Royal Wizard's Tower: a small standalone chamber further out to the
    // south-west, clear of the throne room's own wall (it used to sit close
    // enough that its own floor/wall carving overlapped and erased part of
    // the throne room's south-west corner — see sealRoom below, which is
    // the real fix, but moving the tower further out means there's nothing
    // to reseal there in the first place).
    // Pushed 2 rows further south than before so its own north wall doesn't
    // land on the same row as the courtyard's east-west corridor (which is
    // pinned to clear the throne room's sheared south wall) — otherwise the
    // straight courtyard-row path would cut directly through the tower's
    // own front wall.
    const towerCenter = { q: throneCenter.q - 15, r: throneCenter.r + 14 };
    const towerDoor = { q: towerCenter.q, r: towerCenter.r - 2 };
    const towerRegion = carveFlatRoom(towerCenter.q, towerCenter.r, 3, 3, towerDoor, 'Wood Floor');
    window.interiorRegions.push(towerRegion);
    window.tileObjects[`${towerCenter.q},${towerCenter.r}`] = { type: 'table' };
    window.tileObjects[`${towerCenter.q + 1},${towerCenter.r}`] = { type: 'journal', readId: 'wizard_tower_tome', lightRadius: 0 };
    window.tileObjects[`${towerCenter.q - 1},${towerCenter.r}`] = { type: 'fireplace', lightRadius: 5 };
    // The evidence for the wizard_vendetta quest (campaign2Dialogue.js) —
    // tucked in her own tower, findable whether or not the quest has been
    // picked up yet (same "flavor readable regardless of quest state"
    // convention as every other journal in the game).
    window.tileObjects[`${towerCenter.q},${towerCenter.r + 1}`] = { type: 'journal', readId: 'wizard_corruption_ledger', lightRadius: 0 };
    window.campaign2PalaceTowerCenter = towerCenter;
    // Like the throne room's own front door, towerDoor sits on the floor's
    // own edge rather than on the wall ring itself — the wall ring hex is
    // one further step out (north). That hex needs to be treated as part
    // of the door apron so the corridor can actually pass through it.
    const towerApron = { q: towerCenter.q, r: towerDoor.r - 1 };
    for (let r = Math.min(towerDoor.r, courtyard.r); r <= Math.max(towerDoor.r, courtyard.r); r++) window.setTerrainAt(towerDoor.q, r, 'Path');
    for (let q = Math.min(towerDoor.q, courtyard.q); q <= Math.max(towerDoor.q, courtyard.q); q++) window.setTerrainAt(q, courtyard.r, 'Path');

    if (window.campaign2RoyalWizard) {
        window.entities.push(window.buildNPC({ ...window.campaign2RoyalWizard, hex: { q: towerCenter.q, r: towerCenter.r + 1 } }));
    }

    // Queen's private chambers: through a rear door behind the throne
    // itself, a small bedroom wing — the "multiple rooms, not just a throne
    // room" scale the great hall alone doesn't give. Internal connection:
    // reached only through the throne room's own rear door, never from
    // outside the curtain wall.
    const rearDoor = { q: throneCenter.q, r: throneCenter.r - 4 };
    const bedroomCenter = { q: throneCenter.q, r: throneCenter.r - 9 };
    const bedroomDoor = { q: bedroomCenter.q, r: bedroomCenter.r + 2 };
    const bedroomRegion = carveFlatRoom(bedroomCenter.q, bedroomCenter.r, 3, 3, bedroomDoor, 'Wood Floor');
    window.interiorRegions.push(bedroomRegion);
    window.tileObjects[`${rearDoor.q},${rearDoor.r}`] = { type: 'door_open', lightRadius: 0 };
    for (let r = throneCenter.r - 5; r > bedroomDoor.r; r--) window.setTerrainAt(throneCenter.q, r, 'Path');
    window.tileObjects[`${bedroomCenter.q},${bedroomCenter.r}`] = { type: 'bed' };
    window.tileObjects[`${bedroomCenter.q + 1},${bedroomCenter.r}`] = { type: 'table' };
    window.tileObjects[`${bedroomCenter.q},${bedroomCenter.r - 1}`] = { type: 'fireplace', lightRadius: 5 };
    window.campaign2PalaceBedroomCenter = bedroomCenter;

    // Reseal every room now that all connecting paths/corridors have been
    // painted — undoes any accidental overwrite of a room's own floor/wall
    // from a spur crossing near it (the actual cause of the throne room's
    // south wall reading as broken/multi-doored, and stray Path bleeding
    // into the room just past its real door). This is the definitive fix,
    // applied last, regardless of the exact shape of the corridors above.
    sealRoom(throneRegion, [rearDoor, { q: throneCenter.q, r: throneDoor.r + 1 }]);
    sealRoom(barracksRegion);
    sealRoom(councilRegion);
    sealRoom(towerRegion, [towerApron]);
    sealRoom(bedroomRegion);

    // A real curtain wall around the whole complex — hex-distance ring
    // (same "circle" technique the arena lobby's rooms already use), so it
    // reads as a proper hexagon. Radius 23 clears every wing built above
    // (barracks' outer edge is the furthest point, at distance 20) with a
    // few hexes of courtyard to spare. Uses the new 'Palisade Wall' terrain
    // (see terrain.js) — a real barrier, not decorative, but one that CAN
    // be scaled with a ladder or real climbing skill (getMoveCostMult in
    // gameEngine.js), unlike the palace's own room walls (plain 'Wall',
    // fully impassable) or a simple fence (barely an inconvenience).
    const WALL_RADIUS = 23;
    const ringHexes = [];
    for (let q = -WALL_RADIUS; q <= WALL_RADIUS; q++) {
        for (let r = -WALL_RADIUS; r <= WALL_RADIUS; r++) {
            if (window.distance({ q: 0, r: 0 }, { q, r }) === WALL_RADIUS) {
                ringHexes.push({ q: throneCenter.q + q, r: throneCenter.r + r });
            }
        }
    }
    // The southern edge (r = throneCenter.r + WALL_RADIUS, q from
    // throneCenter.q - WALL_RADIUS to throneCenter.q) is a straight run of
    // ring hexes lining up with the existing entrance road (which runs
    // along q = throneCenter.q) — a 3-hex gate carved right where the road
    // meets the wall, flanked by two watchtowers.
    const gateHexes = [
        { q: throneCenter.q, r: throneCenter.r + WALL_RADIUS },
        { q: throneCenter.q - 1, r: throneCenter.r + WALL_RADIUS },
        { q: throneCenter.q - 2, r: throneCenter.r + WALL_RADIUS },
    ];
    const gateKeys = new Set(gateHexes.map(h => `${h.q},${h.r}`));
    ringHexes.forEach(h => {
        const key = `${h.q},${h.r}`;
        if (gateKeys.has(key)) {
            window.setTerrainAt(h.q, h.r, 'Path');
        } else {
            window.setTerrainAt(h.q, h.r, 'Palisade Wall');
        }
    });
    // Connect the gate to the existing entrance road running north from
    // roadEnd to throneDoor.
    for (let r = throneDoor.r + 1; r < throneCenter.r + WALL_RADIUS; r++) window.setTerrainAt(throneCenter.q, r, 'Path');

    // Watchtowers flanking the gate, plus one at each of the hexagon's
    // other five true corners. A hex ring's 6 corners are the well-known
    // (R,0), (R,-R), (0,-R), (-R,0), (-R,R), (0,R) axial offsets — the last
    // of those (0,R) is the gate's own south corner, so it's skipped here
    // in favor of two towers flanking the gate itself instead.
    const towerSpots = [
        { q: throneCenter.q + 2, r: throneCenter.r + 21 },                 // flanking the gate (east)
        { q: throneCenter.q - 4, r: throneCenter.r + WALL_RADIUS },        // flanking the gate (west)
        { q: throneCenter.q + WALL_RADIUS, r: throneCenter.r },            // east corner
        { q: throneCenter.q - WALL_RADIUS, r: throneCenter.r },            // west corner
        { q: throneCenter.q, r: throneCenter.r - WALL_RADIUS },            // north corner
        { q: throneCenter.q + WALL_RADIUS, r: throneCenter.r - WALL_RADIUS }, // northeast corner
        { q: throneCenter.q - WALL_RADIUS, r: throneCenter.r + WALL_RADIUS }, // southwest corner
    ];
    towerSpots.forEach(h => {
        window.setTerrainAt(h.q, h.r, 'Palisade Wall');
        window.tileObjects[`${h.q},${h.r}`] = { type: 'watchtower', lightRadius: 4 };
    });
    // A couple of ladders on far, unwatched stretches of wall — a
    // determined (or well-skilled) intruder's real way over, away from the
    // gate and its guards.
    const ladderSpots = [
        { q: throneCenter.q + 12, r: throneCenter.r - WALL_RADIUS },  // NE edge
        { q: throneCenter.q - 12, r: throneCenter.r - 11 },           // NW edge
    ];
    ladderSpots.forEach(h => {
        // The speed bonus only applies crossing the specific edge between the
        // wall hex and its interior-side neighbor (see getMoveCostMult) — the
        // neighbor closest to the throne is unambiguously "interior".
        const neighbors = window.getNeighbors(h.q, h.r);
        const interiorHex = neighbors.reduce((best, n) =>
            window.distance(n, throneCenter) < window.distance(best, throneCenter) ? n : best, neighbors[0]);
        window.tileObjects[`${h.q},${h.r}`] = { type: 'ladder', interiorHex };
    });

    // Wall guards: at the gate and atop most of the corner watchtowers —
    // "lots of royal guard on the walls" alongside the existing interior
    // posts. Each is one hex inward (toward the courtyard) from its tower/
    // gate hex, verified against the same distance formula so they land
    // just inside the wall ring rather than embedded in it.
    const wallGuards = window.campaign2WallGuards || [];
    const wallPosts = [
        { q: throneCenter.q + 2, r: throneCenter.r + 20 },              // behind the east gate tower
        { q: throneCenter.q - 4, r: throneCenter.r + WALL_RADIUS - 1 }, // behind the west gate tower
        { q: throneCenter.q + WALL_RADIUS - 1, r: throneCenter.r },     // behind the east corner tower
        { q: throneCenter.q - WALL_RADIUS + 1, r: throneCenter.r },     // behind the west corner tower
        { q: throneCenter.q, r: throneCenter.r - WALL_RADIUS + 1 },     // behind the north corner tower
        { q: throneCenter.q + WALL_RADIUS - 1, r: throneCenter.r - WALL_RADIUS + 1 }, // behind the NE corner tower
    ];
    wallGuards.forEach((g, i) => {
        if (!wallPosts[i]) return;
        const guard = window.buildNPC({ ...g, hex: wallPosts[i] });
        guard.homeHex = { ...wallPosts[i] };
        window.entities.push(guard);
    });

    // Royal guards: flanking the throne, at the great hall's own door, and
    // spread through the barracks — "lots of guards" across the whole
    // palace, not clustered in one spot.
    const guards = window.campaign2RoyalGuards || [];
    const posts = [
        { q: throneSeat.q - 1, r: throneSeat.r + 1 }, // flanking the throne
        { q: throneSeat.q + 1, r: throneSeat.r + 1 },
        { q: throneDoor.q, r: throneDoor.r - 1 },     // great hall entrance
        { q: barracksCenter.q - 1, r: barracksCenter.r },
        { q: barracksCenter.q + 1, r: barracksCenter.r },
        { q: barracksCenter.q, r: barracksCenter.r - 2 },
    ];
    guards.forEach((g, i) => {
        if (!posts[i]) return;
        const guard = window.buildNPC({ ...g, hex: posts[i] });
        guard.homeHex = { ...posts[i] };
        window.entities.push(guard);
    });

    // Silverhart sits far outside Campaign 2's hand-painted "safe radius"
    // (terrain.js only forces flat grass within |q|,|r| <= 32 of LOCAL
    // origin — everywhere else, including all the way out here, falls
    // through to the same procedural forest/rocky-outcrop/swamp/sand noise
    // the wilderness uses), so without an explicit override the capital
    // reads as a walled palace dropped in the middle of scattered
    // rock/forest clumps. Force flat Grass over a real clearing around the
    // whole complex — big enough to cover the curtain wall plus the
    // diplomatic quarter built below, with room to spare for whatever else
    // gets added to the city later. Only touches wilderness-noise terrain
    // (never Wall/Palisade Wall/Wood Floor/Path), so it can't clobber
    // anything already carved above.
    const CLEAR_RADIUS = 60;
    for (let dq = -CLEAR_RADIUS; dq <= CLEAR_RADIUS; dq++) {
        for (let dr = -CLEAR_RADIUS; dr <= CLEAR_RADIUS; dr++) {
            if (window.distance({ q: 0, r: 0 }, { q: dq, r: dr }) > CLEAR_RADIUS) continue;
            const q = throneCenter.q + dq, r = throneCenter.r + dr;
            const name = window.getTerrainAt(q, r).name;
            if (name === 'Forest' || name === 'Rocky Outcrop' || name === 'Swamp' || name === 'Sand') {
                window.setTerrainAt(q, r, 'Grass');
            }
        }
    }

    // Diplomatic Quarter: south of the gate, along the road's continued
    // extension — an elven embassy, a dwarven embassy, embassies for two
    // other human kingdoms (Aldenreach and Corvane), the Ironbond Company's
    // Silverhart office, and the kingdom's Grand Cathedral. All flavor-only
    // for now (no reputation/faction wiring for the four embassies — that
    // would be a real new system of its own, out of scope here); Ironbond's
    // office ties into the existing ironbond_company faction just by being
    // there, and the Cathedral gives Knowledge: Religion content a real
    // building to live in instead of only Hollowmere's small chapel.
    const dqCenter = throneCenter.q;

    // Gate entry: a formal arch marking where the road out of the palace
    // gate becomes the Diplomatic Quarter proper.
    window.tileObjects[`${dqCenter},${throneCenter.r + 24}`] = { type: 'gate_arch' };
    window.campaign2DiplomaticGateCenter = { q: dqCenter, r: throneCenter.r + 24 };

    // Left column (elven/aldenreach/ironbond) is pushed further south than
    // its original spacing — the elven embassy's own carveFlatRoom wall
    // ring sheared far enough north (same hex-shear effect that broke the
    // throne room's connectors) to land directly on the curtain wall's
    // south edge, reading as "the embassy's wall overlaps the palace
    // wall". Ironbond moves 2 hexes further still than the row above it,
    // widening that gap rather than just carrying the same spacing down.
    const leftShift = 4;
    const embassyRow1L = throneCenter.r + 26 + leftShift;       // elven
    const embassyRow2L = throneCenter.r + 32 + leftShift;       // aldenreach
    const officeRowL = throneCenter.r + 38 + leftShift + 2;     // ironbond

    // Right column (dwarven/corvane/cathedral): the Corvane embassy and the
    // Cathedral below it were only 6 rows apart — tight enough for their
    // own wall rings to touch. Rather than dragging Corvane/Dwarven
    // further north (which would walk them straight back into the curtain
    // wall/gate the same way the elven embassy collided with it), the fix
    // widens the row-to-row gaps instead: Dwarven stays put, Corvane's gap
    // from it grows from 6 to 10, and the Cathedral's gap from Corvane
    // grows from 6 to 14 — strictly more separation everywhere, verified
    // clear of both the curtain wall and each other.
    const embassyRow1R = throneCenter.r + 26;                   // dwarven (unchanged)
    const embassyRow2R = embassyRow1R + 10;                     // corvane
    const officeRowR = embassyRow2R + 14;                       // cathedral

    const dqPathEnd = Math.max(officeRowL, officeRowR) + 2;
    for (let r = throneCenter.r + 24; r <= dqPathEnd; r++) window.setTerrainAt(dqCenter, r, 'Path');

    const elvenCenter = { q: dqCenter - 8, r: embassyRow1L };
    const elvenDoor = { q: elvenCenter.q + 3, r: elvenCenter.r };
    window.interiorRegions.push(carveFlatRoom(elvenCenter.q, elvenCenter.r, 3, 2, elvenDoor, 'Wood Floor'));
    for (let q = elvenDoor.q + 1; q < dqCenter; q++) window.setTerrainAt(q, embassyRow1L, 'Path');
    window.tileObjects[`${elvenCenter.q},${elvenCenter.r}`] = { type: 'table' };
    window.campaign2ElvenEmbassyCenter = elvenCenter;

    const dwarvenCenter = { q: dqCenter + 8, r: embassyRow1R };
    const dwarvenDoor = { q: dwarvenCenter.q - 3, r: dwarvenCenter.r };
    window.interiorRegions.push(carveFlatRoom(dwarvenCenter.q, dwarvenCenter.r, 3, 2, dwarvenDoor, 'Wood Floor'));
    for (let q = dqCenter + 1; q < dwarvenDoor.q; q++) window.setTerrainAt(q, embassyRow1R, 'Path');
    window.tileObjects[`${dwarvenCenter.q},${dwarvenCenter.r}`] = { type: 'table' };
    window.campaign2DwarvenEmbassyCenter = dwarvenCenter;

    const aldenreachCenter = { q: dqCenter - 8, r: embassyRow2L };
    const aldenreachDoor = { q: aldenreachCenter.q + 3, r: aldenreachCenter.r };
    window.interiorRegions.push(carveFlatRoom(aldenreachCenter.q, aldenreachCenter.r, 3, 2, aldenreachDoor, 'Wood Floor'));
    for (let q = aldenreachDoor.q + 1; q < dqCenter; q++) window.setTerrainAt(q, embassyRow2L, 'Path');
    window.tileObjects[`${aldenreachCenter.q},${aldenreachCenter.r}`] = { type: 'table' };
    window.campaign2AldenreachEmbassyCenter = aldenreachCenter;

    const corvaneCenter = { q: dqCenter + 8, r: embassyRow2R };
    const corvaneDoor = { q: corvaneCenter.q - 3, r: corvaneCenter.r };
    window.interiorRegions.push(carveFlatRoom(corvaneCenter.q, corvaneCenter.r, 3, 2, corvaneDoor, 'Wood Floor'));
    for (let q = dqCenter + 1; q < corvaneDoor.q; q++) window.setTerrainAt(q, embassyRow2R, 'Path');
    window.tileObjects[`${corvaneCenter.q},${corvaneCenter.r}`] = { type: 'table' };
    window.campaign2CorvaneEmbassyCenter = corvaneCenter;

    // Central plaza and fountain: a small open square roughly midway down
    // the quarter, on the way to the Ironbond office and cathedral.
    const plazaCenter = { q: dqCenter, r: throneCenter.r + 41 };
    for (let dq = -2; dq <= 2; dq++) {
        for (let dr = -2; dr <= 2; dr++) {
            if (window.distance({ q: 0, r: 0 }, { q: dq, r: dr }) > 2) continue;
            window.setTerrainAt(plazaCenter.q + dq, plazaCenter.r + dr, 'Path');
        }
    }
    window.tileObjects[`${plazaCenter.q},${plazaCenter.r}`] = { type: 'fountain' };
    window.tileObjects[`${plazaCenter.q - 2},${plazaCenter.r}`] = { type: 'bench' };
    window.tileObjects[`${plazaCenter.q + 2},${plazaCenter.r}`] = { type: 'bench' };
    window.campaign2DiplomaticPlazaCenter = plazaCenter;

    const ironbondOfficeCenter = { q: dqCenter - 8, r: officeRowL };
    const ironbondOfficeDoor = { q: ironbondOfficeCenter.q + 4, r: ironbondOfficeCenter.r };
    window.interiorRegions.push(carveFlatRoom(ironbondOfficeCenter.q, ironbondOfficeCenter.r, 4, 3, ironbondOfficeDoor, 'Wood Floor'));
    for (let q = ironbondOfficeDoor.q + 1; q < dqCenter; q++) window.setTerrainAt(q, officeRowL, 'Path');
    window.tileObjects[`${ironbondOfficeCenter.q},${ironbondOfficeCenter.r}`] = { type: 'table' };
    window.tileObjects[`${ironbondOfficeCenter.q + 1},${ironbondOfficeCenter.r}`] = { type: 'bench' };
    window.campaign2IronbondOfficeCenter = ironbondOfficeCenter;

    const cathedralCenter = { q: dqCenter + 8, r: officeRowR };
    const cathedralDoor = { q: cathedralCenter.q - 4, r: cathedralCenter.r };
    window.interiorRegions.push(carveFlatRoom(cathedralCenter.q, cathedralCenter.r, 4, 4, cathedralDoor, 'Wood Floor'));
    for (let q = dqCenter + 1; q < cathedralDoor.q; q++) window.setTerrainAt(q, officeRowR, 'Path');
    window.tileObjects[`${cathedralCenter.q},${cathedralCenter.r - 2}`] = { type: 'throne' }; // stands in for an altar — same "focal furniture at the head of the room" reuse as the throne room
    window.tileObjects[`${cathedralCenter.q - 2},${cathedralCenter.r}`] = { type: 'bench' };
    window.tileObjects[`${cathedralCenter.q + 2},${cathedralCenter.r}`] = { type: 'bench' };
    window.campaign2CathedralCenter = cathedralCenter;

    if (window.campaign2ElvenAmbassador) {
        const elarion = window.buildNPC({ ...window.campaign2ElvenAmbassador, hex: { q: elvenCenter.q, r: elvenCenter.r + 1 } });
        elarion.hairSizeMult = 0.15; // the default full-body elf hair sprite reads absurdly oversized on him specifically
        window.entities.push(elarion);
    }
    if (window.campaign2DwarvenAmbassador) window.entities.push(window.buildNPC({ ...window.campaign2DwarvenAmbassador, hex: { q: dwarvenCenter.q, r: dwarvenCenter.r + 1 } }));
    if (window.campaign2AldenreachAmbassador) window.entities.push(window.buildNPC({ ...window.campaign2AldenreachAmbassador, hex: { q: aldenreachCenter.q, r: aldenreachCenter.r + 1 } }));
    if (window.campaign2CorvaneAmbassador) window.entities.push(window.buildNPC({ ...window.campaign2CorvaneAmbassador, hex: { q: corvaneCenter.q, r: corvaneCenter.r + 1 } }));
    if (window.campaign2IronbondEnvoy) window.entities.push(window.buildNPC({ ...window.campaign2IronbondEnvoy, hex: { q: ironbondOfficeCenter.q, r: ironbondOfficeCenter.r + 1 } }));
    if (window.campaign2HighCleric) window.entities.push(window.buildNPC({ ...window.campaign2HighCleric, hex: { q: cathedralCenter.q, r: cathedralCenter.r + 1 } }));

    // Mercenary Recruiter: a raw Entity (not buildNPC) so it renders on the
    // same arenamercenary sprite as the roguelike arena's recruiter, per the
    // player's request to reuse that character/art in the capital.
    if (window.campaign2MercenaryRecruiter) {
        const recruiterHex = { q: plazaCenter.q + 3, r: plazaCenter.r };
        const recruiter = new window.Entity(window.campaign2MercenaryRecruiter.name, 'cyan', recruiterHex, 10);
        recruiter.isNPC = true;
        recruiter.side = 'neutral';
        recruiter.gender = 'male';
        recruiter.race = 'elf';
        recruiter.customImage = 'arenamercenary';
        recruiter.dialogueId = window.campaign2MercenaryRecruiter.dialogueId;
        window.entities.push(recruiter);
        window.campaign2MercenaryRecruiterHex = recruiterHex;
    }

    // A noble family's abandoned townhouse, sitting empty past the far end
    // of the diplomatic quarter's own path (well clear of every building
    // above — no need to re-verify hex-shear collisions against a footprint
    // that far out). Reachable, visibly neglected, and grantable by the
    // Queen herself once reputation with the crown is high enough (see the
    // silverhart_queen dialogue tree) — the "granted through a quest chain"
    // acquisition path, distinct from the free cottage plot (built) and the
    // abandoned house on the north road (cleared by force).
    const manorRow = dqPathEnd + 6;
    for (let r = dqPathEnd; r <= manorRow; r++) window.setTerrainAt(dqCenter, r, 'Path');
    const manorCenter = { q: dqCenter - 10, r: manorRow };
    const manorDoor = { q: manorCenter.q + 3, r: manorCenter.r };
    const manorRegion = carveBuilding(manorCenter.q, manorCenter.r, 3, 2, manorDoor, 'Wood Floor');
    window.interiorRegions.push(manorRegion);
    for (let q = manorDoor.q + 1; q < dqCenter; q++) window.setTerrainAt(q, manorRow, 'Path');
    window.campaign2SilverhartManorCenter = manorCenter;

    if (window.campaign2ManorNeighbor) {
        window.entities.push(window.buildNPC({ ...window.campaign2ManorNeighbor, hex: { q: manorCenter.q - 5, r: manorCenter.r } }));
    }
    if (window.campaign2NobleCorstane) {
        window.entities.push(window.buildNPC({ ...window.campaign2NobleCorstane, hex: { q: manorCenter.q - 7, r: manorCenter.r } }));
    }
    if (window.campaign2SilverhartBuilder) {
        window.entities.push(window.buildNPC({ ...window.campaign2SilverhartBuilder, hex: { q: manorCenter.q + 5, r: manorCenter.r } }));
    }

    // Merchant district (MVP): a horse stable, further out still past the
    // manor — same "far enough out to skip re-verifying hex-shear
    // collisions" reasoning used for the manor above. A real merchant
    // district (shops, a proper street grid) is a bigger follow-up; this is
    // just the stable itself, reachable and functional.
    const stableRow = manorRow + 10;
    for (let r = manorRow; r <= stableRow; r++) window.setTerrainAt(dqCenter, r, 'Path');
    const stableCenter = { q: dqCenter + 10, r: stableRow };
    const stableDoor = { q: stableCenter.q - 4, r: stableCenter.r };
    const stableRegion = carveBuilding(stableCenter.q, stableCenter.r, 4, 3, stableDoor, 'Wood Floor');
    window.interiorRegions.push(stableRegion);
    for (let q = dqCenter + 1; q < stableDoor.q; q++) window.setTerrainAt(q, stableRow, 'Path');
    window.campaign2SilverhartStableCenter = stableCenter;
    window.tileObjects[`${stableCenter.q},${stableCenter.r}`] = { type: 'fence_h' }; // stalls/pen flavor
    if (window.campaign2Stablehand) {
        window.entities.push(window.buildNPC({ ...window.campaign2Stablehand, hex: { q: stableCenter.q, r: stableCenter.r - 1 } }));
    }

    // Two more merchant-district shops, further out along the same safe
    // column — a clothier (the new cosmetic 'clothes' slot's actual point
    // of sale) and a magic-item dealer (reusing the existing named magic
    // items from equipment.js; rare and priced accordingly already).
    const shopRow = stableRow + 8;
    for (let r = stableRow; r <= shopRow; r++) window.setTerrainAt(dqCenter, r, 'Path');

    const clothierCenter = { q: dqCenter - 8, r: shopRow };
    const clothierDoor = { q: clothierCenter.q + 3, r: clothierCenter.r };
    const clothierRegion = carveBuilding(clothierCenter.q, clothierCenter.r, 3, 2, clothierDoor, 'Wood Floor');
    window.interiorRegions.push(clothierRegion);
    for (let q = clothierDoor.q + 1; q < dqCenter; q++) window.setTerrainAt(q, shopRow, 'Path');
    if (window.campaign2Clothier) {
        window.entities.push(window.buildNPC({ ...window.campaign2Clothier, hex: { q: clothierCenter.q, r: clothierCenter.r + 1 } }));
    }

    const magicShopCenter = { q: dqCenter + 8, r: shopRow };
    const magicShopDoor = { q: magicShopCenter.q - 3, r: magicShopCenter.r };
    const magicShopRegion = carveBuilding(magicShopCenter.q, magicShopCenter.r, 3, 2, magicShopDoor, 'Wood Floor');
    window.interiorRegions.push(magicShopRegion);
    for (let q = dqCenter + 1; q < magicShopDoor.q; q++) window.setTerrainAt(q, shopRow, 'Path');
    if (window.campaign2MagicDealer) {
        window.entities.push(window.buildNPC({ ...window.campaign2MagicDealer, hex: { q: magicShopCenter.q, r: magicShopCenter.r + 1 } }));
    }

    // One world-hex north of Millbrook [3][6], which is itself 3 north of
    // Hollowmere [6][6] — see the world map's [0][6] Silverhart placement in
    // worldMap.js's loadWorldMap.
    if (window.worldMapData && window.worldMapData[0] && window.worldMapData[0][6] !== undefined) {
        window.worldMapData[0][6] = { t: 'G', f: 'K', o: 'h', p: 3, n: 'Silverhart' };
    }
}

// A first breadcrumb toward the Druid/unicorn quest chain — read once, same
// convention as every other journal (see readAbandonedHouseJournal etc).
window.readWizardTowerTome = function() {
    window.wizardTowerTomeRead = true;
    window.showDialogue({ name: "Thessaly's Tome", customImage: 'journal' },
        "A page near the back, in a hand shakier than the rest: \"Old magic doesn't die, it just stops answering court summons. There is a grove west of the mountains where the druids still keep faith with something older than any crown — and where, if the stories hold, something far rarer than a spell still runs wild. Not for a court wizard to go chasing. Perhaps for someone less tied to a throne.\"",
        [{ label: "Interesting.", action: () => {} }]
    );
};

// Evidence for the wizard_vendetta quest (campaign2Dialogue.js) — readable
// any time, same "flavor works regardless of quest state" convention as
// every other journal, but only actually grants the quest item once and
// only while the quest is active (so it can't be farmed or picked up
// meaninglessly before the quest is even offered).
window.readWizardCorruptionLedger = function() {
    const quest = (window.questLog || []).find(q => q.id === 'wizard_vendetta');
    if (quest && quest.status === 'active' && !window.player.inventory.includes('wizard_corruption_evidence')) {
        window.player.inventory.push('wizard_corruption_evidence');
        window.showDialogue({ name: "Thessaly's Ledger", customImage: 'journal' },
            "Tucked behind a shelf of components: a page of private accounts, dated and initialed — favors bought and sold that never crossed the crown's own books. Exactly the kind of thing someone could use against her.",
            [{ label: "Pocket it.", action: () => {} }]
        );
        return;
    }
    window.showDialogue({ name: "Thessaly's Ledger", customImage: 'journal' },
        "Columns of figures in a precise hand — mundane household accounts, as far as you can tell.",
        [{ label: "Put it back.", action: () => {} }]
    );
};

// A hidden grave off the western road — the "livestock drained of blood, not
// torn" lead High Cleric Adelram sends the player chasing (see the
// crimson_court quest in campaign2Dialogue.js's high_cleric handler). Placed
// a little off the beaten path, same "journal/readId" click-to-read plumbing
// as every other note in this world.
function buildVampireGrave(westRoadEnd) {
    const q = westRoadEnd.q - 4, r = westRoadEnd.r + 6;
    window.tileObjects[`${q},${r}`] = { type: 'journal', readId: 'vampire_grave', lightRadius: 0 };
    window.campaign2VampireGraveCenter = { q, r };
}

// The Emberwood Grove: pays off the "someone less tied to a throne" hook in
// Thessaly's tome (readWizardTowerTome below). Deliberately unmarked and
// off-road, well past Emberlode — found by exploration, same "hidden
// location, not a quest-marker destination" convention as buildVampireGrave.
// A ring of Foliage around a Grass clearing, a spring at its heart, and
// Elder Nessa Wren (the druid_grove questline's gatekeeper, campaign2Dialogue.js).
function buildDruidGrove(westRoadEnd) {
    const center = { q: westRoadEnd.q - 14, r: westRoadEnd.r - 12 };
    const CLEARING_RADIUS = 5;
    for (let dq = -CLEARING_RADIUS; dq <= CLEARING_RADIUS; dq++) {
        for (let dr = -CLEARING_RADIUS; dr <= CLEARING_RADIUS; dr++) {
            const hex = { q: center.q + dq, r: center.r + dr };
            const dist = window.distance(center, hex);
            if (dist > CLEARING_RADIUS) continue;
            window.setTerrainAt(hex.q, hex.r, dist >= CLEARING_RADIUS - 1 ? 'Foliage' : 'Grass');
        }
    }
    window.setTerrainAt(center.q, center.r - 1, 'Water'); // the grove's spring
    window.tileObjects[`${center.q + 1},${center.r - 1}`] = { type: 'herb_patch', hasHerbs: true };
    window.tileObjects[`${center.q - 1},${center.r + 1}`] = { type: 'herb_patch', hasHerbs: true };

    window.campaign2DruidGroveCenter = center;
    window.campaign2DruidGroveSpringHex = { q: center.q, r: center.r - 1 };
    // Where the trust-task's feral wolf den spawns once accepted (see
    // startDruidGroveTrial, campaign2Dialogue.js) — upstream of the spring,
    // just outside the clearing itself.
    window.campaign2DruidGroveDenHex = { q: center.q - 3, r: center.r - 8 };

    if (window.campaign2DruidElder) {
        window.entities.push(window.buildNPC({ ...window.campaign2DruidElder, hex: { q: center.q, r: center.r + 1 } }));
    }
}

window.readVampireGrave = function() {
    const player = window.party[0];
    if (player.inventory && player.inventory.includes('ashen_fang')) {
        window.showDialogue({ name: "A Shallow Grave", customImage: 'journal' },
            "You've already taken what this grave had to give.",
            [{ label: "...", action: () => {} }]
        );
        return;
    }
    window.showDialogue({ name: "A Shallow Grave", customImage: 'journal' },
        "A sheep's carcass, half-buried and long picked over by crows — but the wounds are wrong. No claw marks, no torn flesh, just two clean punctures at the throat, drained dry. Wedged nearby, half-shattered: a single, unnaturally long fang, still faintly warm to the touch.",
        [{ label: "Take the fang.", action: () => {
            if (!player.inventory) player.inventory = [];
            player.inventory.push('ashen_fang');
            window.showMessage("You take the fang. This feels like something the Cathedral should see.");
        }}]
    );
};

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
    // East: a much longer run than before, in three legs so it reads as a
    // real river bending across the landscape rather than a straight line
    // with a wiggle. Leg 1 (unchanged) drifts naturally. Leg 2 lets that
    // drift continue a while longer, unforced, so by the time it's run its
    // course the river has wandered noticeably southeast. Leg 3 then bends
    // it back with a real directional pull (driftBias) until it's heading
    // roughly east/level again, instead of continuing to wander south.
    let eastEnd = paintStreamSegment(29, 70, 1, -25);
    eastEnd = paintStreamSegment(70, 130, 1, eastEnd.r);
    paintStreamSegment(130, 220, 1, eastEnd.r, -25, 0.6);

    paintStreamSegment(-21, -90, -1, -25);

    // Precompute which grass hexes sit next to water, once, instead of every
    // grass hex checking its own 6 neighbors every render frame — grass is
    // the overwhelming majority of on-screen hexes (tens of thousands once
    // zoomed out), so a per-frame per-hex neighbor scan there is real cost;
    // scanning the comparatively tiny set of water hexes once at world-gen
    // time and building a lookup Set is orders of magnitude cheaper overall.
    // See hexMap.js's isGrassNearWater.
    window._grassNearWaterSet = new Set();
    for (const key in window.overrideTerrain) {
        if (window.overrideTerrain[key].name !== 'Water') continue;
        const [wq, wr] = key.split(',').map(Number);
        for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
            window._grassNearWaterSet.add(`${wq + dq},${wr + dr}`);
        }
    }

    // --- Tavern: walls q:-6..6, r:-4..4; floor carved q:-5..5, r:-3..3 ---
    // Row-shifted per column (see hexRowShift) so this reads as an actual
    // rectangle instead of a sheared parallelogram, with the wall built as
    // the true hex-adjacency ring around the floor (wallRingAroundFloor) so
    // there's no gap at the parity seams between columns.
    const tavernFloorHexes = [];
    for (let q = -5; q <= 5; q++) {
        const shift = hexRowShift(q);
        for (let r = -3; r <= 3; r++) {
            tavernFloorHexes.push({ q, r: r + shift });
        }
    }
    wallRingAroundFloor(tavernFloorHexes).forEach(h => window.setTerrainAt(h.q, h.r, 'Wall'));
    tavernFloorHexes.forEach(h => window.setTerrainAt(h.q, h.r, 'Wood Floor'));
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
    // Pushed 2 hexes further south than the original placement, and Mira's/
    // Oskar's houses pushed 2 hexes further out (see below) — the original
    // cluster left the general store's approach corridor too tight against
    // both houses, with the east house's floor reaching into where the path
    // was meant to run.
    // carveFlatRoom (not carveBuilding) so the store reads as a real square
    // instead of carveBuilding's uncorrected hex-shear slant — door and
    // counter both sit on the center column (dq=0, where the two carving
    // functions agree exactly), so this doesn't touch either.
    const generalStoreRegion = carveFlatRoom(0, 18, 4, 3, { q: 0, r: 15 }, 'Wood Floor');
    window.tileObjects['0,17'] = { type: 'table', lightRadius: 0 }; // counter

    // Small homes for the tavern's regular patrons — Mira and Oskar go back
    // to these at night instead of just existing at the tavern forever (see
    // updateNpcSchedules in gameEngine.js). Oskar's stays tucked west of the
    // general-store approach path with a short spur to it.
    //
    // Mira's used to sit at the same distance east (center q=6), but at
    // halfW=2 its wall ring reaches q=8 — exactly the column the north road
    // (see setupVillageScene's paintRoad below) runs down. paintRoad has no
    // "don't overwrite Wall" guard (unlike this function's own paintPath),
    // so it punched straight through Mira's east wall, and left no gap
    // between her west wall and the tavern's own (center q=6 floor starting
    // at q=5, flush against the tavern floor's own maxQ=5). Moved well
    // clear of the road instead of just nudging it, per direct feedback —
    // now sits on the far (east) side of the road, with room to spare.
    const miraHouseRegion = carveBuilding(12, 9, 2, 2, { q: 10, r: 9 }, 'Wood Floor');
    const oskarHouseRegion = carveBuilding(-6, 9, 2, 2, { q: -4, r: 9 }, 'Wood Floor');

    // Quest item for "A Missing Locket" (Elder Marta) — tucked in the chapel.
    window.mapItems['-14,0'] = ['elder_locket'];

    // Register interior regions for hex-local indoor lighting (see worldTime.js).
    // Bounds widened to cover the row-shifted floor's actual r-range across
    // all columns (see hexRowShift) — a fixed r:[-3,3] no longer covers the
    // corners once each column's floor is offset by its own shift.
    window.interiorRegions = [
        { minQ: -5, maxQ: 5, minR: -3 + hexRowShift(-5), maxR: 3 + hexRowShift(5), lightMult: 0.15, doorHex: { q: 0, r: 4 } },
        storeRegion,
        chapelRegion,
        houseRegion,
        generalStoreRegion,
        miraHouseRegion,
        oskarHouseRegion
    ];

    // Fireplace for cozy interior lighting + visual marker for the door.
    // Fixed-coordinate placements below carry a "+ hexRowShift(q)" correction
    // so they land in the same spot *relative to the walls* that they did
    // before the tavern's floor became row-shifted (see hexRowShift above) —
    // otherwise they'd drift relative to the walls/door by a hex or two.
    window.tileObjects[`-4,${0 + hexRowShift(-4)}`] = { type: 'fireplace', lightRadius: 6 };
    // Barred from the outside until the shakedown kicks off — stops the
    // player from just wandering out before the scripted scene plays. Once
    // the soldiers open it themselves (startHollowmereShakedown), the lock
    // is lifted for good, so the player can flee mid-scene or leave normally
    // afterward.
    window.tileObjects['0,4'] = { type: 'door_closed', lightRadius: 0, locked: true };

    // Furniture, placed clear of spawn hexes and the door.
    window.tileObjects[`1,${1 + hexRowShift(1)}`] = { type: 'table', lightRadius: 0 };
    window.tileObjects[`1,${2 + hexRowShift(1)}`] = { type: 'bench', lightRadius: 0 };
    window.tileObjects[`-2,${1 + hexRowShift(-2)}`] = { type: 'table', lightRadius: 0 };
    window.tileObjects[`-2,${2 + hexRowShift(-2)}`] = { type: 'bench', lightRadius: 0 };

    // --- Outdoor paths: a ring around the tavern (clear of every building's
    // footprint) with a short spur connecting each door to it, so the
    // village reads as one place instead of four disconnected buildings.
    // Never overwrite a wall — the reshaped (row-shifted) buildings' corners
    // can reach further than their old fixed-row footprint did, so a ring/
    // spur path drawn without this guard could punch a hole in a building
    // wall wherever the two happen to cross.
    const paintPath = (hexes) => hexes.forEach(([q, r]) => {
        const existing = window.getTerrainAt(q, r).name;
        if (existing === 'Wall' || existing === 'Wood Floor' || existing === 'Cave Floor') return;
        window.setTerrainAt(q, r, 'Path');
    });
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
    paintPath([[0, 7], [0, 8], [0, 9], [0, 10], [0, 11], [0, 12], [0, 13]]);
    // (0,14) is a real wall tile — a row-shift-seam artifact of the store's
    // own wall ring reaching one hex further out than its flat footprint
    // would suggest (see wallRingAroundFloor) — so the last step to the door
    // steps diagonally around it instead of straight through it.
    paintPath([[1, 14]]); // general store door (0,15) -> south ring, around the seam wall at (0,14)
    paintPath([[9, 9]]); // Mira's house door (10,9) -> the north road column (q=8), painted below
    paintPath([[-1, 9], [-2, 9], [-3, 9]]); // Oskar's house door (-4,9) -> general store spur

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
        'Wick Hallow': { q: 0, r: 18 }
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
    // Runs a full four world hexes now — Millbrook still sits at the same
    // step (captured via onStep, so its exact position is unchanged), and
    // Silverhart (the capital) sits a further hex north at the new end,
    // same "extend the road, add a stub settlement at the new end" pattern
    // used for Emberlode out west.
    let millbrookWaypoint = null;
    const northRoadEnd = paintRoad({ q: 0, r: -1 }, WORLD_HEX_SIZE * 4, 18, 0.35, (i, hex) => {
        if (i === ABANDONED_HOUSE_STEP) abandonedHouseWaypoint = hex;
        if (i === WORLD_HEX_SIZE * 3) millbrookWaypoint = hex;
    });
    const farmRoadEnd = paintRoad({ q: 0, r: 1 }, WORLD_HEX_SIZE + 40); // South: past the hex border, to Old Mac's Farmstead
    const eastRoadEnd = paintRoad({ q: 1, r: 0 }, WORLD_HEX_SIZE); // East: Reddale
    // The Border War arc: repaints the same east-road hexes as eastRoadEnd
    // above out to Reddale (idempotent — deterministic wiggle, same primary
    // direction, so it's identical over the shared range) and continues two
    // more world-hexes further east, right up against the human/orc border
    // (see worldMap.js's isOrcLands cutoff and checkOrcRaiderEncounter's
    // headingEast threshold, both already east-of-Reddale-flavored).
    // Northwatch turns off north at the 2nd world-hex; Ridgehold sits at the
    // 3rd (the road's actual end).
    let northwatchTurnHex = null;
    const borderRoadEnd = paintRoad({ q: 1, r: 0 }, WORLD_HEX_SIZE * 3, 18, 0.35, (i, hex) => {
        if (i === WORLD_HEX_SIZE * 2) northwatchTurnHex = hex;
    });
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
    buildPlayerCottagePlot(CP);
    buildAbandonedHouse(abandonedHouseWaypoint);
    buildMillbrook(millbrookWaypoint);
    buildSilverhartPalace(northRoadEnd);
    buildEmberlode(westRoadEnd);
    buildReddale(eastRoadEnd);
    buildVampireGrave(westRoadEnd);
    buildDruidGrove(westRoadEnd);
    buildNorthwatchFort(northwatchTurnHex);
    buildRidgeholdFort(borderRoadEnd);

    // Road-network connectivity (hexMap.js): every road painted above should
    // form one connected network so NPC/long-travel road-following never
    // hits a dead island. connectAllRoadNetworks greedily bridges any
    // disconnected components with a straight Path connector, then leaves
    // the final census in window._roadGraph. Must run BEFORE the terrain
    // baseline snapshot just below — otherwise its connector tiles would be
    // treated as a player-caused save diff instead of part of the
    // deterministic world-gen layout they actually are.
    if (window.connectAllRoadNetworks) window.connectAllRoadNetworks();

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

    // Same idea, applied to NPCs: every scripted world NPC (buildNPC/
    // buildGoblinNPC, always isNPC:true) is just as deterministic as the
    // terrain it stands on — same spec + same world-gen = same NPC. Snapshot
    // them here (keyed by name, which every spec already gives a unique one)
    // so saveGame/loadGame (persistence.js) can diff against this instead of
    // saving/restoring full stat/skill/equipment dumps for NPCs nothing has
    // changed on. Party members, mounts, hires, and anything built at
    // runtime (siege-arena skirmishers, etc.) are never isNPC and so never
    // get a baseline entry — they keep full serialization, unaffected.
    if (window.serializeEntity) {
        window._campaign2NpcBaseline = {};
        window.entities.forEach(e => {
            if (!e.isNPC) return;
            // Pre-compute the same hash-derived cosmetic fields renderEntities
            // would otherwise lazily assign on first draw (gameEngine.js
            // ~1465-1481) — purely a function of e.name, so doing it here
            // instead just means the baseline snapshot and the live entity
            // start identical, rather than every NPC showing a permanent
            // "changed" cosmetic diff before it's ever been rendered once.
            if (e.shirtHue === undefined && window.pickClothingHue) { e.shirtHue = window.pickClothingHue((e.name || 'x') + '_shirt'); e.clothingSatMult = 0.85; }
            if (e.pantsHue === undefined && window.pickClothingHue) { e.pantsHue = window.pickClothingHue((e.name || 'x') + '_pants'); e.clothingSatMult = 0.85; }
            if (e.skinHue === undefined && window.hashStringToHue) e.skinHue = 5 + window.hashStringToHue((e.name || 'x') + '_skin') % 40;
            if (e.hairHue === undefined && window.pickHairPreset) {
                const preset = window.pickHairPreset((e.name || 'x') + '_hair');
                e.hairHue = preset.hue; e.hairLightMult = preset.lightMult; e.hairSatMult = preset.satMult;
            }
            window._campaign2NpcBaseline[e.name] = window.serializeEntity(e);
        });
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
function toggleDoor(q, r, opener) {
    const key = `${q},${r}`;
    const existing = window.tileObjects[key] || {};
    const isOpen = window.getTerrainAt(q, r).name !== 'Wall';
    // Locked doors only yield to someone standing inside the building —
    // approximated as standing on the same indoor floor terrain the door
    // leads to, since buildings don't otherwise track a room boundary.
    if (!isOpen && existing.locked && opener) {
        const openerTerrain = window.getTerrainAt(opener.hex.q, opener.hex.r).name;
        if (openerTerrain !== 'Wood Floor' && openerTerrain !== 'Cave Floor') {
            window.showMessage("The door is locked.");
            return;
        }
    }
    const hp = existing.hp !== undefined ? existing.hp : 20;
    const maxHp = existing.maxHp !== undefined ? existing.maxHp : 20;
    if (isOpen) {
        window.setTerrainAt(q, r, 'Wall');
        window.tileObjects[key] = { type: 'door_closed', lightRadius: 0, locked: false, hp, maxHp };
    } else {
        window.setTerrainAt(q, r, 'Wood Floor');
        window.tileObjects[key] = { type: 'door_open', lightRadius: 0, locked: false, hp, maxHp };
    }
    window.drawMap();
    window.renderEntities();
}

// Doors are attackable (HP, no healing) and lockable from the inside —
// reuses the existing Wall-terrain collision/LOS system, so a destroyed
// door just becomes a permanently open, un-lockable doorway.
function attackDoor(q, r, attacker) {
    const key = `${q},${r}`;
    const door = window.tileObjects[key];
    if (!door || (door.type !== 'door_closed' && door.type !== 'door_open')) return;
    if (door.hp === undefined) door.hp = 20;
    if (door.maxHp === undefined) door.maxHp = 20;
    const weaponId = attacker?.equipped?.weapon;
    const dmg = (weaponId && window.items[weaponId]?.damage) ? window.items[weaponId].damage : 2;
    door.hp -= dmg;
    if (door.hp <= 0) {
        window.setTerrainAt(q, r, 'Wood Floor');
        window.tileObjects[key] = { type: 'door_open', lightRadius: 0, locked: false, broken: true, hp: 0, maxHp: door.maxHp };
        window.showMessage("The door is smashed off its hinges!");
    } else {
        window.showMessage(`The door takes ${dmg} damage (${Math.max(0, door.hp)}/${door.maxHp} HP).`);
    }
    window.drawMap();
    window.renderEntities();
}

function lockDoor(q, r, entity) {
    const key = `${q},${r}`;
    const door = window.tileObjects[key];
    if (!door || door.type !== 'door_closed') { window.showMessage("The door needs to be closed to lock it."); return; }
    if (door.broken) { window.showMessage("It's broken — it won't lock anymore."); return; }
    const terrainName = window.getTerrainAt(entity.hex.q, entity.hex.r).name;
    if (terrainName !== 'Wood Floor' && terrainName !== 'Cave Floor') {
        window.showMessage("You can only lock a door from the inside.");
        return;
    }
    door.locked = !door.locked;
    window.showMessage(door.locked ? "You lock the door." : "You unlock the door.");
}
window.attackDoor = attackDoor;
window.lockDoor = lockDoor;

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

// Reddale: the east road's small town — bigger than the single-building
// village stubs (Millbrook, Emberlode). A guardhouse (Captain + a watchman),
// a Reeve's house (the town's own on-the-map ranking authority, unlike
// Hollowmere's off-map Baron), and an inn.
function buildReddale(roadEnd) {
    const guardCenter = { q: roadEnd.q - 4, r: roadEnd.r };
    const guardDoor = { q: guardCenter.q + 3, r: guardCenter.r };
    const guardRegion = carveBuilding(guardCenter.q, guardCenter.r, 3, 2, guardDoor, 'Wood Floor');
    window.interiorRegions.push(guardRegion);
    window.tileObjects[`${guardCenter.q},${guardCenter.r}`] = { type: 'fireplace', lightRadius: 6 };
    for (let q = guardDoor.q + 1; q < roadEnd.q; q++) window.setTerrainAt(q, roadEnd.r, 'Path');
    window.campaign2ReddaleGuardhouseCenter = guardCenter;

    const reeveCenter = { q: roadEnd.q, r: roadEnd.r - 6 };
    const reeveDoor = { q: reeveCenter.q, r: reeveCenter.r + 2 };
    const reeveRegion = carveBuilding(reeveCenter.q, reeveCenter.r, 3, 2, reeveDoor, 'Wood Floor');
    window.interiorRegions.push(reeveRegion);
    for (let r = reeveDoor.r + 1; r < roadEnd.r; r++) window.setTerrainAt(roadEnd.q, r, 'Path');
    window.campaign2ReddaleReeveHouseCenter = reeveCenter;

    const innCenter = { q: roadEnd.q, r: roadEnd.r + 6 };
    const innDoor = { q: innCenter.q, r: innCenter.r - 2 };
    const innRegion = carveBuilding(innCenter.q, innCenter.r, 3, 2, innDoor, 'Wood Floor');
    window.interiorRegions.push(innRegion);
    window.tileObjects[`${innCenter.q},${innCenter.r}`] = { type: 'fireplace', lightRadius: 6 };
    for (let r = roadEnd.r + 1; r < innDoor.r; r++) window.setTerrainAt(roadEnd.q, r, 'Path');
    window.campaign2ReddaleInnCenter = innCenter;

    // A muster point just outside the guardhouse door, roughly where a
    // road-bound patrol would start from — used by the missing-watch quest
    // below to place the search site a stretch further out.
    window.campaign2ReddaleSearchSiteHex = { q: roadEnd.q + 18, r: roadEnd.r };

    if (window.campaign2ReddaleCaptain) {
        const captainEntity = window.buildNPC({ ...window.campaign2ReddaleCaptain, hex: { q: guardCenter.q - 1, r: guardCenter.r } });
        captainEntity.wants = null; // incorruptible - no leverage option will ever be offered
        captainEntity.incorruptibleFlavor = "She runs a tight watch. Best not even think about a bribe.";
        window.entities.push(captainEntity);
    }
    if (window.campaign2ReddaleGuard) {
        const guardEntity = window.buildNPC({ ...window.campaign2ReddaleGuard, hex: { q: guardCenter.q + 1, r: guardCenter.r } });
        guardEntity.wants = {
            type: 'gold', amount: 15, offerLabel: 'bribe', description: 'a little coin for looking the other way',
            fullHint: "Bram grumbles about the Company's pay more than most — a bit of coin would go a long way with him.",
            partialHint: "He seems unenthusiastic about the job. Might be persuadable, if you had something to offer."
        };
        guardEntity.vagueFlavor = "Hard to get a read on him.";
        guardEntity.onBribeSuccess = () => {
            window.showDialogue(guardEntity, "Much obliged. Won't remember seeing you.", [{ label: "Good.", action: () => {} }]);
        };
        window.entities.push(guardEntity);
    }
    if (window.campaign2ReddaleReeve) {
        window.entities.push(window.buildNPC({ ...window.campaign2ReddaleReeve, hex: { q: reeveCenter.q, r: reeveCenter.r } }));
    }
    if (window.campaign2ReddaleInnkeeper) {
        window.entities.push(window.buildNPC({ ...window.campaign2ReddaleInnkeeper, hex: { q: innCenter.q, r: innCenter.r } }));
    }
    if (window.campaign2ReddaleDisciple) {
        window.entities.push(window.buildNPC({ ...window.campaign2ReddaleDisciple, hex: { q: innCenter.q + 1, r: innCenter.r } }));
        // Her cult correspondence, tucked just outside the inn — the
        // evidence needed to actually report her (see readDiscipleNote and
        // reddale_captain's report option in campaign2Dialogue.js). Reuses
        // the existing journal/readId click-to-read plumbing rather than a
        // new tileObject type.
        window.tileObjects[`${innCenter.q + 2},${innCenter.r}`] = { type: 'journal', lightRadius: 0, readId: 'disciple_note' };
    }

    // Ironbond's Reddale guildhouse and the Baron's manor — the two ends of
    // the Reddale espionage side-quests (see espionageQuests.js and
    // campaign2Dialogue.js's reddale_baron/reddale_guildmaster trees). Kept
    // well clear of the other buildings/road, on their own short spurs.
    const guildCenter = { q: roadEnd.q + 8, r: roadEnd.r + 10 };
    const guildDoor = { q: guildCenter.q - 3, r: guildCenter.r };
    const guildRegion = carveBuilding(guildCenter.q, guildCenter.r, 3, 2, guildDoor, 'Wood Floor');
    window.interiorRegions.push(guildRegion);
    window.tileObjects[`${guildCenter.q},${guildCenter.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.tileObjects[`${guildCenter.q},${guildCenter.r - 1}`] = { type: 'table' };
    window.campaign2ReddaleGuildhouseCenter = guildCenter;
    // The ledgers the Baron wants his spy to find.
    const guildEvidenceHex = { q: guildCenter.q + 1, r: guildCenter.r - 1 };
    window.tileObjects[`${guildEvidenceHex.q},${guildEvidenceHex.r}`] = { type: 'evidence', evidenceKey: 'guild_ledgers' };
    window.campaign2GuildEvidenceHex = guildEvidenceHex;

    const manorCenter = { q: roadEnd.q + 8, r: roadEnd.r - 10 };
    const manorDoor = { q: manorCenter.q - 3, r: manorCenter.r };
    const manorRegion = carveBuilding(manorCenter.q, manorCenter.r, 3, 2, manorDoor, 'Wood Floor');
    window.interiorRegions.push(manorRegion);
    window.tileObjects[`${manorCenter.q},${manorCenter.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.tileObjects[`${manorCenter.q},${manorCenter.r - 1}`] = { type: 'table' };
    window.campaign2ReddaleManorCenter = manorCenter;
    // The tariff records the Guildmaster wants her spy to find.
    const manorEvidenceHex = { q: manorCenter.q + 1, r: manorCenter.r - 1 };
    window.tileObjects[`${manorEvidenceHex.q},${manorEvidenceHex.r}`] = { type: 'evidence', evidenceKey: 'baron_tariffs' };
    window.campaign2ManorEvidenceHex = manorEvidenceHex;

    if (window.campaign2ReddaleGuildmaster) {
        window.entities.push(window.buildNPC({ ...window.campaign2ReddaleGuildmaster, hex: { q: guildCenter.q, r: guildCenter.r + 1 } }));
    }
    if (window.campaign2ReddaleGuildGuard) {
        const guildGuard = window.buildNPC({ ...window.campaign2ReddaleGuildGuard, hex: { q: guildCenter.q - 1, r: guildCenter.r } });
        guildGuard.behaviorType = 'patrol';
        guildGuard.patrolPath = [{ q: guildCenter.q - 1, r: guildCenter.r }, { q: guildCenter.q + 1, r: guildCenter.r + 1 }];
        guildGuard.homeHex = { q: guildCenter.q - 1, r: guildCenter.r };
        window.entities.push(guildGuard);
    }

    // The Baron is the existing off-map-until-now regionalNPCs.baron entity
    // (see setupVillageScene above) — placed here in the flesh rather than
    // duplicating a second Baron object, so his reputation stays one single
    // source of truth wherever he's referenced.
    if (window.regionalNPCs?.baron) {
        window.regionalNPCs.baron.hex = { q: manorCenter.q, r: manorCenter.r + 1 };
        window.entities.push(window.regionalNPCs.baron);
    }
    if (window.campaign2ReddaleBaronSteward) {
        const steward = window.buildNPC({ ...window.campaign2ReddaleBaronSteward, hex: { q: manorCenter.q - 1, r: manorCenter.r } });
        steward.behaviorType = 'patrol';
        steward.patrolPath = [{ q: manorCenter.q - 1, r: manorCenter.r }, { q: manorCenter.q + 1, r: manorCenter.r + 1 }];
        steward.homeHex = { q: manorCenter.q - 1, r: manorCenter.r };
        // Bribable, same pattern as Bram at the Reddale guardhouse — pays off
        // directly against the "A Look at the Ledgers" stealth mission (see
        // espionageQuests.js's checkStealthMissionStatus), which skips its
        // detection check entirely once this guard is bribed.
        steward.wants = {
            type: 'gold', amount: 40, offerLabel: 'bribe', description: 'coin to look the other way in the back halls',
            fullHint: "Greer's salary hasn't kept pace with the Baron's tastes. He'd notice a heavy purse.",
            partialHint: "He carries himself like a man underpaid for what he puts up with."
        };
        steward.vagueFlavor = "Stiff, formal, gives nothing away.";
        steward.onBribeSuccess = () => {
            steward.bribed = true;
            window.showDialogue(steward, "The manor's a big place. A man can't watch every hallway at once.", [{ label: "Good.", action: () => {} }]);
        };
        window.entities.push(steward);
    }

    // One world-hex east of Hollowmere [6][6].
    if (window.worldMapData && window.worldMapData[6] && window.worldMapData[6][7] !== undefined) {
        window.worldMapData[6][7] = { t: 'G', f: 'T', o: 'h', p: 1, n: 'Reddale' };
    }
}

// Northwatch Fort: the Border War's active front. A 6-pointed star fort
// (see carveStarFort above) — a core plus 6 outward archer-platform wedges,
// ringed by Climbable Wall (costly-but-possible, see the elevated-terrain
// generalization in gameEngine.js). A separate, genuinely impassable/roofed
// keep sits at the core (carveFlatRoom with wallType:'Keep Wall'). Garrison
// soldiers patrol the wall ring; the commander (quest-giver 2) waits in the
// keep. A live siege engine sits just outside, already chipping at the
// north wall — Ridgehold (below) is the not-yet-besieged contrast fort.
function buildNorthwatchFort(turnHex) {
    if (!turnHex) return;
    // Short spur north off the border road to the fort's south gate.
    const SPUR_LENGTH = 24;
    for (let i = 1; i <= SPUR_LENGTH; i++) window.setTerrainAt(turnHex.q, turnHex.r - i, 'Path');
    const center = { q: turnHex.q, r: turnHex.r - SPUR_LENGTH - 10 };
    const gateHex = { q: center.q, r: center.r + 10 }; // south point, facing the road

    const fortRegion = carveStarFort(center.q, center.r, 3, 6, 2, gateHex, 'Wood Floor', 'Climbable Wall');
    window.interiorRegions.push(fortRegion);

    const keepDoor = { q: center.q, r: center.r + 3 };
    const keepRegion = carveFlatRoom(center.q, center.r, 3, 2, keepDoor, 'Wood Floor', 'Keep Wall');
    window.interiorRegions.push(keepRegion);
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };

    window.campaign2NorthwatchCenter = center;
    window.campaign2NorthwatchFortRegion = fortRegion;
    window.campaign2NorthwatchGateHex = gateHex;

    // Garrison: patrol the wall ring out of combat (behaviorType 'patrol'
    // over the fort's own wallHexes, same mechanism as any other patrol
    // NPC). In combat, combatDirective (gameEngine.js — see the "Layered
    // combat AI" plan) gives them real orders instead of the plain generic
    // AI: never leave the fort, prioritize whoever's threatening the gate,
    // then whoever's already inside the walls, and fall back toward the
    // keep once the walls are overrun rather than fighting to the last man
    // at the point of breach.
    const fortInterior = new Set([...fortRegion.floorHexes, ...fortRegion.wallHexes].map(h => `${h.q},${h.r}`));
    const wallPatrolPath = fortRegion.wallHexes.filter((h, i) => i % 3 === 0); // a sparse loop, not every single wall hex
    (window.campaign2FortSoldiers || []).forEach((spec, i) => {
        const postHex = wallPatrolPath[i % wallPatrolPath.length] || fortRegion.wallHexes[0];
        const soldier = window.buildNPC({ ...spec, hex: { q: postHex.q, r: postHex.r } });
        soldier.behaviorType = 'patrol';
        soldier.patrolPath = wallPatrolPath;
        soldier.homeHex = { ...postHex };
        soldier.factionTag = 'northwatch_human'; // the "unforgivable act" hostility flip (gameEngine.js) keys off this
        soldier.combatDirective = {
            hostileTo: 'enemy', // these soldiers are side:'neutral' toward the player — this is who they actually fight
            constraints: { stayWithinHexes: fortInterior },
            priorities: [
                { type: 'nearHex', hex: gateHex, radius: 3 },
                { type: 'insideRegion', hexes: fortInterior },
            ],
            retreatTo: { q: center.q, r: center.r },
            contingencies: [{
                id: 'retreat_if_walls_overrun',
                when: () => window.entities.filter(e =>
                    e.alive && e.side === 'enemy' && fortInterior.has(`${e.hex.q},${e.hex.r}`)
                ).length >= 5,
            }],
        };
        window.entities.push(soldier);
    });

    if (window.campaign2NorthwatchCommander) {
        const commander = window.buildNPC({ ...window.campaign2NorthwatchCommander, hex: { q: center.q, r: center.r - 1 } });
        commander.factionTag = 'northwatch_human';
        window.entities.push(commander);
    }

    // Gate lever: the deliberate, guarded way to open the fort from the
    // inside during a siege. First pull is just a warning (a nearby guard
    // stops you); a second pull actually opens it AND is, on its own, one
    // of the "unforgivable acts" (see gameEngine.js's pullNorthwatchGateLever/
    // setFactionHostileToPlayer) that turns the whole garrison hostile —
    // there's no partial-suspicion state in between.
    const leverHex = { q: gateHex.q, r: gateHex.r - 1 };
    window.tileObjects[`${leverHex.q},${leverHex.r}`] = { type: 'gate_lever' };
    window.campaign2NorthwatchGateLeverHex = leverHex;
    const leverGuardSpots = [{ q: gateHex.q - 1, r: gateHex.r - 1 }, { q: gateHex.q + 1, r: gateHex.r - 1 }];
    leverGuardSpots.forEach((spot, i) => {
        const spec = (window.campaign2FortSoldiers || [])[i];
        if (!spec) return;
        const guard = window.buildNPC({ ...spec, name: `${spec.name} (Gate Guard)`, title: 'Gate Guard', hex: spot });
        guard.behaviorType = 'guard';
        guard.homeHex = { ...spot };
        guard.factionTag = 'northwatch_human';
        guard.combatDirective = {
            hostileTo: 'enemy',
            constraints: { stayWithinHexes: fortInterior },
            priorities: [{ type: 'nearHex', hex: gateHex, radius: 3 }, { type: 'insideRegion', hexes: fortInterior }],
            retreatTo: { q: center.q, r: center.r },
            contingencies: [{
                id: 'retreat_if_walls_overrun',
                when: () => window.entities.filter(e => e.alive && e.side === 'enemy' && fortInterior.has(`${e.hex.q},${e.hex.r}`)).length >= 5,
            }],
        };
        window.entities.push(guard);
    });

    // The siege engine already battering the north wall — visible from a
    // distance the moment the fort exists, reinforcing "under siege" before
    // the player ever takes the quest. side:'neutral' + noAttack (same
    // pattern as the arena lobby's dialogue-only preview combatants,
    // gameEngine.js ~5013) so it's inert and — importantly — doesn't count
    // against the many `!entities.some(e => e.side==='enemy' && e.alive)`
    // combat-end checks used all over the game. startNorthwatchSally
    // (campaign2Dialogue.js) flips it to side:'enemy'/noAttack:false and
    // spawns its escorts once the commander's quest is actually accepted —
    // the real fight happens right here at the fort, not a separate arena
    // (matches every other Campaign 2 scripted encounter: farm wolves,
    // goblin camp, Ironvein raids all fight in place on the open map).
    const siegeHex = { q: center.q, r: center.r - 10 };
    const siegeEngine = window.createMonster('siege_engine', siegeHex, null, null, 'neutral');
    if (siegeEngine) {
        siegeEngine.isSiegeEngine = true;
        siegeEngine.isNPC = true;
        siegeEngine.aiState = 'idle';
        siegeEngine.noAttack = true;
        window.entities.push(siegeEngine);
        window.campaign2NorthwatchSiegeEngine = siegeEngine;
    }

    if (window.worldMapData && window.worldMapData[5] && window.worldMapData[5][9] !== undefined) {
        window.worldMapData[5][9] = { t: 'H', f: 'F', o: 'h', p: 1, n: 'Northwatch Fort (Under Siege)' };
    }
}

// Ridgehold Fort: populated and patrol-behaviored like Northwatch, but not
// (yet) under siege — the reserve front, contrasting with Northwatch's
// active one. Same star-fort + keep shape; no siege engine, no commander
// quest (that's Northwatch-specific for this pass — see TASKS.md-equivalent
// scoping note in the Border War plan about a second front being a
// follow-up, not this pass).
function buildRidgeholdFort(roadEnd) {
    if (!roadEnd) return;
    const center = { q: roadEnd.q + 14, r: roadEnd.r + 10 };
    const gateHex = { q: center.q - 10, r: center.r - 4 }; // west-ish point, facing the road

    for (let q = roadEnd.q + 1; q < center.q - 8; q++) window.setTerrainAt(q, roadEnd.r + Math.round((q - roadEnd.q) * 10 / 14), 'Path');

    const fortRegion = carveStarFort(center.q, center.r, 3, 6, 2, gateHex, 'Wood Floor', 'Climbable Wall');
    window.interiorRegions.push(fortRegion);

    const keepDoor = { q: center.q, r: center.r + 3 };
    const keepRegion = carveFlatRoom(center.q, center.r, 3, 2, keepDoor, 'Wood Floor', 'Keep Wall');
    window.interiorRegions.push(keepRegion);
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };

    window.campaign2RidgeholdCenter = center;
    window.campaign2RidgeholdFortRegion = fortRegion;

    const wallPatrolPath = fortRegion.wallHexes.filter((h, i) => i % 3 === 0);
    (window.campaign2FortSoldiers || []).forEach((spec, i) => {
        const postHex = wallPatrolPath[i % wallPatrolPath.length] || fortRegion.wallHexes[0];
        const soldier = window.buildNPC({ ...spec, hex: { q: postHex.q, r: postHex.r }, name: spec.name + ' (Ridgehold)' });
        soldier.behaviorType = 'patrol';
        soldier.patrolPath = wallPatrolPath;
        soldier.homeHex = { ...postHex };
        window.entities.push(soldier);
    });

    if (window.worldMapData && window.worldMapData[9] && window.worldMapData[9][9] !== undefined) {
        window.worldMapData[9][9] = { t: 'H', f: 'F', o: 'h', p: 1, n: 'Ridgehold Fort' };
    }
}

// Moves every party member (not just window.player) to a cluster around
// centerHex — used by the two fort teleport cheats below so the whole party
// arrives together instead of stranding companions back wherever they were.
function teleportPartyTo(centerHex) {
    const partyEntities = window.entities.filter(e => e.side === 'player' && !e.rider);
    partyEntities.forEach((e, i) => {
        const hex = { q: centerHex.q + (i % 3), r: centerHex.r + Math.floor(i / 3) };
        e.hex = hex;
        e.visualQ = hex.q; e.visualR = hex.r;
        e.destination = null;
    });
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
    if (window.centerCameraOn) window.centerCameraOn(centerHex);
}

// Cheat teleports — straight to the fort's gate, no travel required. Useful
// for testing/skipping ahead; not tied to any quest gate.
window.cheatTeleportNorthwatch = function() {
    if (!window.campaign2NorthwatchGateHex) { window.showMessage('Northwatch Fort has not been built yet.'); return; }
    teleportPartyTo(window.campaign2NorthwatchGateHex);
    window.showMessage('Teleported to Northwatch Fort.');
};
window.cheatTeleportRidgehold = function() {
    if (!window.campaign2RidgeholdFortRegion?.doorHex) { window.showMessage('Ridgehold Fort has not been built yet.'); return; }
    teleportPartyTo(window.campaign2RidgeholdFortRegion.doorHex);
    window.showMessage('Teleported to Ridgehold Fort.');
};

// Reads the journal at the abandoned house — the first breadcrumb toward
// the necromancer/lichdom plot arc. Knowledge: Religion reveals specifics
// (phylactery, a soul-binding ritual) that the vague version only hints at.
function readAbandonedHouseJournal() {
    window.abandonedHouseJournalRead = true;
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

// Mirella Thorn's cult correspondence — the actual evidence needed to report
// her (see reddale_captain's report option in campaign2Dialogue.js). A real
// one-shot inventory item, same convention as the phylactery shard below,
// not a bare flag.
function readDiscipleNote() {
    if (window.player.inventory.includes('disciple_evidence') || window.discipleNoteTaken) {
        window.showDialogue({ name: 'Note', customImage: 'journal' }, "Nothing left here worth reading again.");
        return;
    }
    window.discipleNoteTaken = true;
    window.player.inventory.push('disciple_evidence');
    window.showDialogue({ name: 'Note', customImage: 'journal' },
        "A folded letter, tucked behind a shelf of drying herbs. The hand is cramped and careful, signed with a sigil you recognize — the same one scratched into the phylactery altar north of Millbrook. Whoever Mirella really is, an herbalist isn't all of it."
    );
}
window.readDiscipleNote = readDiscipleNote;

// The altar's phylactery-shard: a real inventory item, not a flag. Holding it
// is what unlocks pursuing lichdom yourself; how the necromancer_cult faction
// feels about you is tracked as plain reputation (see interactPhylacteryAltar's
// two branches below and the necromancerMinion reputation hit in
// handleLethalDamage), never a bespoke one-off flag.
function interactPhylacteryAltar() {
    const npc = { name: 'Ritual Altar', customImage: 'altar_unholy' };
    const hasShard = window.player.inventory.includes('phylactery_shard');

    if (window.phylacteryReturned) {
        window.showDialogue(npc, "The altar is cold and empty now — whatever answered here once, it doesn't any longer.");
        return;
    }

    if (!hasShard && !window.phylacteryShardTaken) {
        window.phylacteryShardTaken = true;
        window.player.inventory.push('phylactery_shard');
        window.showDialogue(npc,
            "A shard of blackened bone-and-glass sits at the altar's center, faintly warm despite the cold room. It comes away in your hand more easily than it should. Whatever it's a piece of, it wants to be whole again.",
            [{ label: "Take it.", action: () => {} }]
        );
        return;
    }

    if (hasShard) {
        window.showDialogue(npc, "The altar hums faintly — it knows what you're carrying.", [
            {
                label: "Return the shard to the altar.",
                action: () => {
                    window.player.inventory = window.player.inventory.filter(i => i !== 'phylactery_shard');
                    window.phylacteryReturned = true;
                    if (window.factions?.necromancer_cult) window.adjustReputation(window.factions.necromancer_cult, 40, 30);
                    window.showDialogue({ name: 'A Cold Voice', customImage: 'altar_unholy' },
                        "...You didn't have to. Few wouldn't have kept it. I won't forget this.");
                }
            },
            {
                label: "Keep it, and try to use it yourself.",
                action: () => {
                    if (window.grantSkillRank) window.grantSkillRank(window.player, 'lich_deathless_flesh');
                    ['silverhart_kingdom', 'ironbond_company', 'goblin_tribe', 'orc_raiders'].forEach(id => {
                        if (window.factions[id]) window.adjustReputation(window.factions[id], -25, 10);
                    });
                    window.showMessage("Something in you changes. Word of it will travel, and it will not be kind.");
                }
            },
            { label: "Not now.", action: () => {} }
        ]);
        return;
    }

    window.showDialogue(npc, "A cold ritual altar, long disturbed. There's nothing left to take.");
}
window.interactPhylacteryAltar = interactPhylacteryAltar;

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
