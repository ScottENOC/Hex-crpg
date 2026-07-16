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

// One world-map grid cell = WORLD_HEX_SIZE local hexes (see setupVillageScene's
// paintRoad calls, which already measure every road in multiples of this).
// The crossroads (campaign2Landmarks.crossroads) is the local origin all
// roads radiate from, and sits at [WORLD_MAP_ORIGIN.row][WORLD_MAP_ORIGIN.col]
// on the 16x16 world grid (worldMap.js) — Hollowmere's own cell. Every other
// settlement/feature marker should be computed from its real local hex via
// worldMapCellFromLocalHex rather than hand-picked, so the world map's scale
// actually matches the local map it's meant to summarize.
window.WORLD_HEX_SIZE = 130;
window.WORLD_MAP_ORIGIN = { row: 6, col: 6 };
function worldMapCellFromLocalHex(hex) {
    const cp = window.campaign2Landmarks.crossroads;
    return {
        row: window.WORLD_MAP_ORIGIN.row + Math.round((hex.r - cp.r) / window.WORLD_HEX_SIZE),
        col: window.WORLD_MAP_ORIGIN.col + Math.round((hex.q - cp.q) / window.WORLD_HEX_SIZE),
    };
}
window.worldMapCellFromLocalHex = worldMapCellFromLocalHex;

// Writes a world-map marker at the grid cell computed from a real local hex,
// bounds-checked against the actual grid size instead of a hardcoded index.
// The grid is coarse (WORLD_HEX_SIZE local hexes per cell) so two genuinely
// distinct features can round to the same cell (e.g. Ridgehold Fort and the
// orc stronghold both sit near the same stretch of border road) — rather
// than silently overwriting whichever was placed first, this nudges to an
// adjacent free cell so both stay visible.
function setWorldMapMarker(localHex, marker) {
    if (!window.worldMapData || !window.worldMapData.length) return;
    const { row, col } = worldMapCellFromLocalHex(localHex);
    const candidates = [[row, col], [row, col + 1], [row + 1, col], [row, col - 1], [row - 1, col]];
    for (const [r, c] of candidates) {
        if (r < 0 || r >= window.worldMapData.length) continue;
        if (c < 0 || c >= window.worldMapData[r].length) continue;
        if (!window.worldMapData[r][c].n) {
            window.worldMapData[r][c] = marker;
            return;
        }
    }
    // No free adjacent cell — fall back to the original target so the
    // marker is at least written somewhere close to correct.
    if (row >= 0 && row < window.worldMapData.length && col >= 0 && col < window.worldMapData[row].length) {
        window.worldMapData[row][col] = marker;
    }
}
window.setWorldMapMarker = setWorldMapMarker;

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

// A real hex-adjacent straight line between two hexes (cube-coordinate lerp
// + cube rounding, not independent q/r lerp — that produces a "dotted" line
// of non-adjacent hexes). Extracted from the connector lines Kragmoor and
// the elven capital each hand-rolled inline; shared here so any new caller
// (carvePolygonRoom below, or a future one) doesn't have to reimplement it.
function hexLine(a, b) {
    const x1 = a.q, z1 = a.r, y1 = -x1 - z1;
    const x2 = b.q, z2 = b.r, y2 = -x2 - z2;
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1));
    const hexes = [];
    for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        let x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, z = z1 + (z2 - z1) * t;
        let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
        const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
        if (dx > dy && dx > dz) rx = -ry - rz;
        else if (dy > dz) ry = -rx - rz;
        else rz = -rx - ry;
        hexes.push({ q: rx, r: rz });
    }
    return hexes;
}
window.hexLine = hexLine;

// Builds an arbitrary room from a list of corner hexes (NOT necessarily an
// axis-aligned rectangle, unlike carveFlatRoom/carveBuilding above): walls
// are real hex-adjacent straight lines (hexLine) joining each corner to the
// next (wrapping back to the first), doorHexes are punched through those
// walls as real open doors, the interior is flood-filled with floorType via
// a wall/door-bounded BFS (so it works for any enclosed shape, not just a
// rectangle), and each door is connected to the nearest PRE-EXISTING Path
// tile by its own obstacle-avoiding BFS route (walls/doors block the
// search, so the connector actually routes around them instead of
// potentially being drawn straight through one).
function carvePolygonRoom(corners, doorHexes, floorType, wallType = 'Wall') {
    const wallHexes = [];
    const wallKeys = new Set();
    for (let i = 0; i < corners.length; i++) {
        const a = corners[i], b = corners[(i + 1) % corners.length];
        hexLine(a, b).forEach(h => {
            const key = `${h.q},${h.r}`;
            if (!wallKeys.has(key)) { wallKeys.add(key); wallHexes.push(h); }
        });
    }
    const doorKeys = new Set((doorHexes || []).map(h => `${h.q},${h.r}`));

    // Flood-fill the interior BEFORE painting anything: BFS out from the
    // centroid, blocked by any hexLine wall hex that isn't also a door.
    // hexLine (like the compound gate's old flat-row assumption, see
    // buildSilverhartPalace above) draws a straight line in pure cube
    // coordinates, which does NOT always match this engine's true hex
    // adjacency (getNeighbors, subject to the same row-shift stagger) — a
    // wall meant to be solid can have a gap the BFS slips through. A hard
    // bounding-box clamp (with a small margin) means that even if the wall
    // isn't perfectly sealed, the flood-fill can never leak out and repaint
    // the rest of the map — confirmed necessary the hard way: an earlier
    // version of this function, given a wall with exactly this kind of gap,
    // flooded thousands of hexes with floorType clear across the map before
    // hitting its old node-count safety valve.
    const centroid = {
        q: Math.round(corners.reduce((s, c) => s + c.q, 0) / corners.length),
        r: Math.round(corners.reduce((s, c) => s + c.r, 0) / corners.length),
    };
    // No margin: the corners themselves ARE the outer wall/perimeter, so the
    // interior must stay strictly within their own bounding box. A margin
    // here previously let the flood-fill swallow a door's exterior
    // neighbor too, since that neighbor could fall just outside the
    // corners but still inside a padded box — which silently absorbed the
    // door into the interior (no longer a real boundary hex at all) and
    // left the room with no actual opening for the connector to path
    // through.
    const minQ = Math.min(...corners.map(c => c.q));
    const maxQ = Math.max(...corners.map(c => c.q));
    const minR = Math.min(...corners.map(c => c.r));
    const maxR = Math.max(...corners.map(c => c.r));
    const outsideBounds = (h) => h.q < minQ || h.q > maxQ || h.r < minR || h.r > maxR;
    const isBlocking = (h) => { const key = `${h.q},${h.r}`; return outsideBounds(h) || (wallKeys.has(key) && !doorKeys.has(key)); };
    const floorHexes = [];
    const seen = new Set([`${centroid.q},${centroid.r}`]);
    if (!isBlocking(centroid)) floorHexes.push(centroid);
    let frontier = [centroid];
    while (frontier.length) {
        const next = [];
        frontier.forEach(h => {
            window.getNeighbors(h.q, h.r).forEach(n => {
                const key = `${n.q},${n.r}`;
                if (seen.has(key)) return;
                seen.add(key);
                if (isBlocking(n)) return;
                floorHexes.push(n);
                next.push(n);
            });
        });
        frontier = next;
    }

    // Reinforce the perimeter with the interior's own TRUE hex-adjacency
    // wall ring (wallRingAroundFloor, the same helper carveFlatRoom uses
    // everywhere else in this file) unioned with the original hexLine wall
    // — guarantees an airtight, walkable-consistent boundary even where
    // hexLine's cube-coordinate line doesn't land on a true neighbor of the
    // interior, instead of trusting the straight-line math alone.
    //
    // A door hex is itself part of floorHexes (see isBlocking above), so
    // wallRingAroundFloor's TRUE-adjacency ring naturally includes the
    // door's own true exterior neighbor — which, due to the very same
    // row-shift/parity mismatch hexLine can have, doesn't necessarily sit
    // at the door's hexLine-assumed position. Sealing that hex as wall too
    // would close the door from the outside entirely. Exempt every true
    // neighbor of every door hex from this reinforcement pass so each door
    // keeps a real exterior opening.
    const doorExteriorExempt = new Set();
    doorKeys.forEach(dk => {
        const [dq, dr] = dk.split(',').map(Number);
        window.getNeighbors(dq, dr).forEach(n => doorExteriorExempt.add(`${n.q},${n.r}`));
    });
    wallRingAroundFloor(floorHexes).forEach(h => {
        const key = `${h.q},${h.r}`;
        if (doorExteriorExempt.has(key)) return;
        if (!wallKeys.has(key)) { wallKeys.add(key); wallHexes.push(h); }
    });

    floorHexes.forEach(h => window.setTerrainAt(h.q, h.r, floorType));
    wallHexes.forEach(h => {
        const key = `${h.q},${h.r}`;
        if (doorKeys.has(key)) return; // doors are punched open below, not sealed as wall
        window.setTerrainAt(h.q, h.r, wallType);
    });
    (doorHexes || []).forEach(h => {
        window.setTerrainAt(h.q, h.r, floorType);
        window.tileObjects[`${h.q},${h.r}`] = { type: 'door_open', lightRadius: 0 };
    });

    // Connect each door to the nearest already-existing Path tile via BFS,
    // not a straight line — impassable terrain (walls, water, this room's
    // own perimeter) blocks the search outright, so the route actually
    // detours around obstacles instead of potentially cutting through one.
    (doorHexes || []).forEach(door => {
        const startKey = `${door.q},${door.r}`;
        const cameFrom = new Map();
        const visited = new Set([startKey]);
        let queue = [door];
        let target = null;
        // Bounded by real hex distance from the door, not just a node-count
        // cap — a node-count-only bound (the original version of this
        // function used 5000) can still wander hundreds of hexes across the
        // map before giving up, painting stray Path far from the room. A
        // real door should only ever need to reach a NEARBY road/plot.
        const MAX_CONNECT_DISTANCE = 80;
        while (queue.length && !target) {
            const next = [];
            for (const h of queue) {
                const key = `${h.q},${h.r}`;
                const terrain = window.getTerrainAt(h.q, h.r);
                if (key !== startKey && terrain.name === 'Path') { target = h; break; }
                if (key !== startKey && terrain.impassable) continue;
                if (window.distance(door, h) >= MAX_CONNECT_DISTANCE) continue;
                window.getNeighbors(h.q, h.r).forEach(n => {
                    const nKey = `${n.q},${n.r}`;
                    if (visited.has(nKey)) return;
                    visited.add(nKey);
                    cameFrom.set(nKey, h);
                    next.push(n);
                });
            }
            queue = next;
            if (visited.size > 20000) break; // absolute safety valve
        }
        if (!target) return; // nothing nearby to connect to — leave the door as-is
        let cur = target;
        while (cur && `${cur.q},${cur.r}` !== startKey) {
            const key = `${cur.q},${cur.r}`;
            if (window.getTerrainAt(cur.q, cur.r).name !== 'Path' && !doorKeys.has(key)) {
                window.setTerrainAt(cur.q, cur.r, 'Path');
            }
            cur = cameFrom.get(key);
        }
    });

    return { corners, wallHexes, doorHexes: doorHexes || [], floorHexes, floorType };
}
window.carvePolygonRoom = carvePolygonRoom;

// Cleans up a district-sized area of stray single-hex "pockets" — plain
// unset Grass hexes left fully boxed in by the wall rings of two nearby
// buildings placed close together (wallRingAroundFloor draws each
// building's wall independently, and hex row-shift can make two
// buildings' rings interlock and trap a hex between them). Cosmetic only
// (nothing can ever walk into a fully wall-enclosed hex regardless), but a
// stray green square surrounded by wall reads as broken — so it's merged
// into the surrounding wall instead of left as an odd little island.
function fillEnclosedPockets(minQ, maxQ, minR, maxR) {
    for (let q = minQ; q <= maxQ; q++) {
        for (let r = minR; r <= maxR; r++) {
            const terrain = window.getTerrainAt(q, r);
            if (terrain.name !== 'Grass') continue; // leave real floor/path/wall/water alone
            const neighbors = window.getNeighbors(q, r);
            if (neighbors.length === 6 && neighbors.every(n => window.getTerrainAt(n.q, n.r).name === 'Wall')) {
                window.setTerrainAt(q, r, 'Wall');
            }
        }
    }
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

    setWorldMapMarker(houseCenter, { t: 'G', f: 'V', o: 'h', p: 1, n: "Old Mac's Farmstead" });
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
    // The tribe's own trader — only open for business once genuinely
    // allied (goblin_trader's dialogue tree gates it); placed unconditionally
    // like every other camp NPC, same "gating happens in dialogue, not
    // placement" convention as the Bone Trader (buildLichBarrow).
    const trader = buildGoblinNPC({
        name: 'Grondle', title: 'Camp Trader', monsterType: 'goblin',
        hex: { q: center.q - 1, r: center.r + 2 }, side: 'neutral', dialogueId: 'goblin_trader', color: '#5a7a3a'
    });
    window.entities.push(chief, lieutenant, shaman, trader);

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

    // This is a scouting camp of orc-tribe greenskins pitched on land that's
    // been human territory for centuries — not a goblin nation's own turf —
    // so the underlying tile stays human ('h') rather than recoloring the
    // map, and it gets its own small 'S' (scout camp) marker rather than a
    // real settlement dot, colored to read as a contested outpost.
    setWorldMapMarker(center, { t: 'G', f: 'S', o: 'h', p: 0, n: 'Skarn-tooth Camp' });
}

// Same shape as buildGoblinNPC above, but for the orc_raiders faction —
// orc_raiders existed purely as a wilderness-encounter/reputation target
// with no settlement of its own until buildOrcStronghold below gave it one.
function buildOrcNPC({ name, title, monsterType, hex, customSkills, customEquipment, side, dialogueId, color }) {
    const ent = window.createMonster(monsterType, hex, customSkills || null, customEquipment || null, side || 'neutral');
    ent.name = name;
    ent.title = title || null;
    ent.isNPC = true;
    ent.dialogueId = dialogueId || null;
    ent.factionId = 'orc_raiders';
    if (color) {
        ent.color = color;
        ent.spriteBase = monsterType;
    }
    const playerRace = window.party && window.party[0] ? window.party[0].race : 'human';
    ent.reputation = { knowledge: 0, standing: window.seedStanding ? window.seedStanding('orc', playerRace) : 0 };
    return ent;
}

// Skarnak's Hold: a real orc stronghold, east of Ridgehold Fort in
// orc-held territory (see worldMap.js's isOrcLands cutoff) — orc_raiders'
// first actual settlement rather than just a wilderness-encounter faction.
// A stockade (wallRingAroundFloor + a gate gap facing the road) around a
// dirt clearing, same "hostile only if you make it so" convention as the
// Skarn-tooth goblin camp — a human-aligned player can raid it like any
// other fort; a greenskin-aligned one gets quests and a trader instead.
function buildOrcStronghold(roadEnd) {
    if (!roadEnd) return;
    const center = { q: roadEnd.q + 30, r: roadEnd.r - 6 };
    const CLEARING_RADIUS = 7;
    const floorHexes = [];
    for (let dq = -CLEARING_RADIUS; dq <= CLEARING_RADIUS; dq++) {
        for (let dr = -CLEARING_RADIUS; dr <= CLEARING_RADIUS; dr++) {
            const hex = { q: center.q + dq, r: center.r + dr };
            if (window.distance(center, hex) <= CLEARING_RADIUS) {
                window.setTerrainAt(hex.q, hex.r, 'Dirt');
                floorHexes.push(hex);
            }
        }
    }
    const gateHex = { q: center.q - CLEARING_RADIUS, r: center.r };
    wallRingAroundFloor(floorHexes).forEach(h => {
        if (h.q === gateHex.q && h.r === gateHex.r) return; // gap facing the road west
        window.setTerrainAt(h.q, h.r, 'Climbable Wall');
    });
    for (let q = roadEnd.q + 1; q < gateHex.q; q++) window.setTerrainAt(q, roadEnd.r + Math.round((q - roadEnd.q) * (center.r - roadEnd.r) / (gateHex.q - roadEnd.q)), 'Path');

    window.tileObjects[`${center.q},${center.r - 3}`] = { type: 'hut_large', lightRadius: 0 }; // Warlord's hut
    [[-4, -1], [4, -1], [-4, 2], [4, 2], [0, 3], [-2, 3], [2, -3]].forEach(([dq, dr]) => {
        window.tileObjects[`${center.q + dq},${center.r + dr}`] = { type: 'hut', lightRadius: 0 };
    });
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };

    window.campaign2OrcStrongholdCenter = center;

    const warlord = buildOrcNPC({ ...window.campaign2OrcWarlord, hex: { q: center.q, r: center.r - 2 } });
    const trader = buildOrcNPC({
        name: 'Kesh', title: "Stronghold Trader", monsterType: 'orc',
        hex: { q: center.q - 1, r: center.r + 2 }, side: 'neutral', dialogueId: 'orc_trader', color: '#6a4a2a'
    });
    window.entities.push(warlord, trader);

    (window.campaign2OrcGuards || []).forEach((spec, i) => {
        const guard = buildOrcNPC({ ...spec, hex: { q: center.q + (i % 2 === 0 ? -3 : 3), r: center.r + 1 + Math.floor(i / 2) } });
        guard.behaviorType = 'campRoutine';
        guard.homeHex = { ...guard.hex };
        guard.campSpots = [{ q: center.q, r: center.r }, { q: center.q - 4, r: center.r - 1 }, { q: center.q + 4, r: center.r - 1 }];
        window.entities.push(guard);
    });

    // "Prove Your Strength": a troll denning just outside the stockade has
    // been picking off scouts and cattle — the warlord's own trust-quest
    // (see orc_warlord in campaign2Dialogue.js), distinct from the goblin
    // camp's gift-based unlock for some variety. Placed well clear of the
    // stronghold itself so it reads as a real nearby threat, not camp decor.
    const trollHex = { q: center.q + CLEARING_RADIUS + 6, r: center.r + 4 };
    const troll = window.createMonster('troll', trollHex, null, null, 'neutral');
    troll.name = 'Denning Troll';
    troll.isOrcStrongholdTroll = true;
    window.entities.push(troll);
    window.campaign2OrcStrongholdTrollHex = trollHex;

    setWorldMapMarker(center, { t: 'H', f: 'F', o: 'o', p: 1, n: "Skarnak's Hold" });
}

// Kragmoor, the Deepholds' one city-and-mine: a real Moria-style hold —
// a genuinely solid mountain (a hex-disk of impassable Wall, not a walled
// perimeter around open ground) with rooms and tunnels excavated out of
// that solid mass via carveFlatRoom, same technique buildLichBarrow's crypt
// uses, just at city scale. Lands in worldMap.js's reserved NW mountain
// block (see setWorldMapMarker below) — the ambassador at Silverhart's
// court (dwarven_ambassador, campaign2Dialogue.js) predates this kingdom's
// construction; that quest thread now actually leads somewhere real.
function buildDwarvenKingdom(anchor) {
    const MASSIF_RADIUS = 25;
    hexDisk(anchor.q, anchor.r, MASSIF_RADIUS).forEach(h => window.setTerrainAt(h.q, h.r, 'Wall'));

    // Gate Hall: just inside the mountain's south face, where the surface
    // approach road actually arrives.
    const gateCenter = { q: anchor.q, r: anchor.r + 18 };
    const gateDoor = { q: gateCenter.q, r: gateCenter.r + 3 };
    const gateRegion = carveFlatRoom(gateCenter.q, gateCenter.r, 4, 3, gateDoor, 'Cave Floor');
    window.interiorRegions.push(gateRegion);

    // A short surface approach + a Path stub right at the gate — enough for
    // connectAllRoadNetworks (hexMap.js) to bridge this into the rest of the
    // road network with its own straight connector, same as every other
    // settlement's road.
    for (let i = 1; i <= 12; i++) window.setTerrainAt(gateDoor.q, gateDoor.r + i, 'Path');

    // Great Hall: the throne room, deeper in.
    const hallCenter = { q: anchor.q, r: anchor.r };
    const hallDoor = { q: hallCenter.q, r: hallCenter.r + 5 };
    const hallRegion = carveFlatRoom(hallCenter.q, hallCenter.r, 6, 4, hallDoor, 'Cave Floor');
    window.interiorRegions.push(hallRegion);
    for (let r = gateCenter.r - 3; r > hallDoor.r; r--) window.setTerrainAt(hallCenter.q, r, 'Cave Floor');

    window.tileObjects[`${hallCenter.q},${hallCenter.r - 3}`] = { type: 'throne' };
    window.tileObjects[`${hallCenter.q - 3},${hallCenter.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.tileObjects[`${hallCenter.q + 3},${hallCenter.r}`] = { type: 'fireplace', lightRadius: 6 };
    window.campaign2DeepholdsHallCenter = hallCenter;

    if (window.campaign2DwarfKing) {
        window.entities.push(window.buildNPC({ ...window.campaign2DwarfKing, hex: { q: hallCenter.q, r: hallCenter.r - 1 } }));
    }
    (window.campaign2DwarfGuards || []).forEach((spec, i) => {
        const pos = [{ q: hallCenter.q - 2, r: hallCenter.r + 2 }, { q: hallCenter.q + 2, r: hallCenter.r + 2 }][i];
        if (!pos) return;
        window.entities.push(window.buildNPC({ ...spec, hex: pos }));
    });

    // The Deep Mine: the real ore vein — a foreman/journal ledger, same
    // shape as Emberlode's own mine room.
    const mineCenter = { q: anchor.q + 16, r: anchor.r - 4 };
    const mineDoor = { q: mineCenter.q - 4, r: mineCenter.r };
    const mineRegion = carveFlatRoom(mineCenter.q, mineCenter.r, 4, 3, mineDoor, 'Cave Floor');
    window.interiorRegions.push(mineRegion);
    for (let q = hallCenter.q + 6; q < mineDoor.q; q++) window.setTerrainAt(q, hallCenter.r - 2, 'Cave Floor');
    window.tileObjects[`${mineCenter.q},${mineCenter.r}`] = { type: 'journal', readId: 'deepholds_mine_ledger', lightRadius: 0 };
    if (window.campaign2DwarfForeman) {
        window.entities.push(window.buildNPC({ ...window.campaign2DwarfForeman, hex: { q: mineCenter.q, r: mineCenter.r + 1 } }));
    }
    window.campaign2DeepholdsMineCenter = mineCenter;

    // The Vault: the kingdom's own trader.
    const vaultCenter = { q: anchor.q - 16, r: anchor.r - 4 };
    const vaultDoor = { q: vaultCenter.q + 4, r: vaultCenter.r };
    const vaultRegion = carveFlatRoom(vaultCenter.q, vaultCenter.r, 3, 3, vaultDoor, 'Cave Floor');
    window.interiorRegions.push(vaultRegion);
    for (let q = vaultDoor.q + 1; q < hallCenter.q - 6; q++) window.setTerrainAt(q, hallCenter.r - 2, 'Cave Floor');
    if (window.campaign2DwarfTrader) {
        window.entities.push(window.buildNPC({ ...window.campaign2DwarfTrader, hex: { q: vaultCenter.q, r: vaultCenter.r + 1 } }));
    }

    // The Lower Tunnels: gone quiet, something's nesting down there — the
    // side quest (see resolveDeepholdsInfestation, campaign2Dialogue.js).
    const tunnelCenter = { q: anchor.q, r: anchor.r - 16 };
    const tunnelDoor = { q: tunnelCenter.q, r: tunnelCenter.r + 4 };
    const tunnelRegion = carveFlatRoom(tunnelCenter.q, tunnelCenter.r, 4, 3, tunnelDoor, 'Cave Floor');
    window.interiorRegions.push(tunnelRegion);
    for (let r = hallCenter.r - 5; r > tunnelDoor.r; r--) window.setTerrainAt(hallCenter.q, r, 'Cave Floor');
    window.campaign2DeepholdsTunnelCenter = tunnelCenter;
    (window.campaign2DeepholdsVermin || []).forEach((spec, i) => {
        const m = window.createMonster(spec.monsterType, { q: tunnelCenter.q + (i - 1), r: tunnelCenter.r }, spec.customSkills || null, spec.customEquipment || null, 'enemy');
        m.name = spec.name;
        m.deepholdsVermin = true;
        window.entities.push(m);
    });

    sealRoom(gateRegion);
    sealRoom(hallRegion);
    sealRoom(mineRegion);
    sealRoom(vaultRegion);
    sealRoom(tunnelRegion);

    setWorldMapMarker(gateCenter, { t: 'M', f: 'K', o: 'd', p: 2, n: 'Kragmoor' });
}

// Sil'thandriel, the Sylvan Court's capital (see worldMap.js's southern
// forest belt). Unlike Kragmoor's solid-Wall massif — dwarves carve INTO
// the mountain — the elves build WITH the forest: a ring of dense canopy
// (denser than ordinary wilderness Foliage, per isForestClump above) with
// open clearings carved out of it, not a walled perimeter. Independent of
// the road network for the same reason as Kragmoor: it needs to land
// inside a specific reserved worldMap.js region, not wherever an existing
// road happens to end.
function buildElvenCapital(anchor) {
    const CANOPY_RADIUS = 18;
    for (let dq = -CANOPY_RADIUS; dq <= CANOPY_RADIUS; dq++) {
        for (let dr = -CANOPY_RADIUS; dr <= CANOPY_RADIUS; dr++) {
            const hex = { q: anchor.q + dq, r: anchor.r + dr };
            const dist = window.distance(anchor, hex);
            if (dist > CANOPY_RADIUS) continue;
            if (dist >= CANOPY_RADIUS - 3) {
                window.setTerrainAt(hex.q, hex.r, 'Foliage'); // a real treeline, not a scattered edge
            } else if (dist >= 9) {
                // Thick woods between the treeline and the court's own
                // clearings — noticeably denser (0.7 vs isForestClump's
                // 0.55) than ordinary wilderness forest.
                if (window.pseudoRandom(hex.q * 1.7 + 3, hex.r * 2.1 + 9) < 0.7) window.setTerrainAt(hex.q, hex.r, 'Foliage');
            }
            // dist < 9 stays Grass — the court's own open clearings.
        }
    }

    // The Court of the Silver Leaf: an open throne pavilion at the heart of
    // the clearing, not tucked behind a gate — still carved as a real
    // building (Wood Floor + wall ring) since there's no separate "outdoor
    // pavilion" terrain concept yet.
    const courtCenter = { q: anchor.q, r: anchor.r };
    // The door (and approach path) face NORTH, toward the crossroads — the
    // capital sits well south of it (see the elfAnchor displacement in
    // setupVillageScene), so the surface approach needs to head back that
    // way, not further out into the forest.
    const courtDoor = { q: courtCenter.q, r: courtCenter.r - 5 };
    const courtRegion = carveFlatRoom(courtCenter.q, courtCenter.r, 6, 4, courtDoor, 'Wood Floor');
    window.interiorRegions.push(courtRegion);
    window.tileObjects[`${courtCenter.q},${courtCenter.r + 2}`] = { type: 'throne' };
    window.campaign2ElvenCourtCenter = courtCenter;

    if (window.campaign2ElfQueen) {
        window.entities.push(window.buildNPC({ ...window.campaign2ElfQueen, hex: { q: courtCenter.q, r: courtCenter.r + 1 } }));
    }
    (window.campaign2ElfGuards || []).forEach((spec, i) => {
        const pos = [{ q: courtCenter.q - 3, r: courtCenter.r - 2 }, { q: courtCenter.q + 3, r: courtCenter.r - 2 }][i];
        if (!pos) return;
        window.entities.push(window.buildNPC({ ...spec, hex: pos }));
    });

    // A short approach path north from the court's own door, out past the
    // treeline toward the crossroads — enough for connectAllRoadNetworks
    // (hexMap.js) to bridge this into the rest of the road network with
    // its own connector.
    for (let i = 1; i <= CANOPY_RADIUS + 4; i++) window.setTerrainAt(courtDoor.q, courtDoor.r - i, 'Path');

    // The Silverleaf Archive: Loremaster Faelan's small study.
    const archiveCenter = { q: anchor.q - 12, r: anchor.r + 2 };
    const archiveDoor = { q: archiveCenter.q + 3, r: archiveCenter.r };
    const archiveRegion = carveFlatRoom(archiveCenter.q, archiveCenter.r, 3, 2, archiveDoor, 'Wood Floor');
    window.interiorRegions.push(archiveRegion);
    for (let q = archiveDoor.q + 1; q < courtCenter.q - 6; q++) window.setTerrainAt(q, courtCenter.r + 2, 'Path');
    if (window.campaign2ElfArchivist) {
        window.entities.push(window.buildNPC({ ...window.campaign2ElfArchivist, hex: { q: archiveCenter.q, r: archiveCenter.r + 1 } }));
    }

    // The Sickbed: Healer Sylwen's lodge, with her own herb patches (the
    // same tileObject the druid grove's quest already uses).
    const lodgeCenter = { q: anchor.q + 12, r: anchor.r + 2 };
    const lodgeDoor = { q: lodgeCenter.q - 3, r: lodgeCenter.r };
    const lodgeRegion = carveFlatRoom(lodgeCenter.q, lodgeCenter.r, 3, 2, lodgeDoor, 'Wood Floor');
    window.interiorRegions.push(lodgeRegion);
    for (let q = courtCenter.q + 6; q < lodgeDoor.q; q++) window.setTerrainAt(q, courtCenter.r + 2, 'Path');
    window.tileObjects[`${lodgeCenter.q},${lodgeCenter.r - 2}`] = { type: 'herb_patch', hasHerbs: true };
    window.tileObjects[`${lodgeCenter.q + 1},${lodgeCenter.r - 2}`] = { type: 'herb_patch', hasHerbs: true };
    window.campaign2ElvenLodgeCenter = lodgeCenter;
    if (window.campaign2ElfHealer) {
        window.entities.push(window.buildNPC({ ...window.campaign2ElfHealer, hex: { q: lodgeCenter.q, r: lodgeCenter.r + 1 } }));
    }

    sealRoom(courtRegion);
    sealRoom(archiveRegion);
    sealRoom(lodgeRegion);

    setWorldMapMarker(anchor, { t: 'F', f: 'K', o: 'e', p: 2, n: "Sil'thandriel" });
}

// The Chapterhouse of the Silver Flame: the source of the hunting parties
// that come for a player who's become a lich (see lichHunt.js). Deliberately
// independent of Silverhart Palace's geography (which is being redesigned
// separately) — anchored off Millbrook instead, on the opposite side from
// the dragon lair (see buildDragonLair) so the two don't collide.
function buildLichChapterhouse() {
    const millbrook = window.campaign2MillbrookCenter;
    if (!millbrook) return;
    const center = { q: millbrook.q - 40, r: millbrook.r + 20 };
    const doorHex = { q: center.q + 3, r: center.r };
    const region = carveFlatRoom(center.q, center.r, 4, 3, doorHex, 'Stone Floor', 'Keep Wall');
    window.interiorRegions.push(region);
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };

    window.campaign2LichChapterhouseCenter = center;

    const inquisitor = window.buildNPC({
        name: 'Inquisitor Halden Voss', title: 'Inquisitor of the Silver Flame', race: 'human', gender: 'male',
        classLevels: ['fighter', 'cleric'], skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'heavy_armor_training'],
        equipment: ['sword', 'heavy_armor', 'nasal_helm'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#c0c0c0',
        expValue: 600, gold: 60,
    });
    inquisitor.hex = { q: center.q - 1, r: center.r };
    inquisitor.isLichChapterhouseDefender = true;
    window.entities.push(inquisitor);

    ['Witch Hunter Perren', 'Witch Hunter Oswin'].forEach((name, i) => {
        const hunter = window.buildNPC({
            name, title: 'Witch Hunter', race: 'human', gender: i === 0 ? 'female' : 'male',
            classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'sword_hit', 'sword_dmg', 'light_armor_training'],
            equipment: ['sword', 'light_armor'], side: 'neutral', factionId: 'silverhart_kingdom', color: '#a0a0a0',
            expValue: 250, gold: 20,
        });
        hunter.hex = { q: center.q + (i === 0 ? -2 : 2), r: center.r + 1 };
        hunter.isLichChapterhouseDefender = true;
        window.entities.push(hunter);
    });
}
window.buildLichChapterhouse = buildLichChapterhouse;

// A batch of small side quests + companion recruitment hooks spread across
// existing locations — two easy ones near Hollowmere, two harder ones
// further out, plus a druid recruitment tied to content the Druid Grove
// already had (its herb patches). Called last in setupVillageScene so every
// anchor global (farm/grove/abandoned-house/Reddale centers) is already set.
function buildSideQuestContent() {
    // Easy #1: a bear got into Old Mac's grain stores — Reyna Fletcher, a
    // huntress already tracking it, offers to team up (see reyna_fletcher
    // in campaign2Dialogue.js). Placed at the edge of the farm's own
    // clearing so it reads as local wilderness, not a separate site.
    const farm = window.campaign2FarmHouseCenter;
    if (farm) {
        const bearHex = { q: farm.q + 8, r: farm.r + 5 };
        const bear = window.createMonster('bear', bearHex, null, null, 'neutral');
        bear.name = 'Grain-Raiding Bear';
        bear.isSideQuestBear = true;
        window.entities.push(bear);
        window.campaign2SideQuestBearHex = bearHex;

        const reynaEnt = new window.Entity(window.campaign2ArcherCompanion.name, window.campaign2ArcherCompanion.color, { q: farm.q + 6, r: farm.r + 4 }, 10);
        reynaEnt.side = 'neutral';
        reynaEnt.isNPC = true;
        reynaEnt.race = window.campaign2ArcherCompanion.race;
        reynaEnt.gender = window.campaign2ArcherCompanion.gender;
        reynaEnt.title = window.campaign2ArcherCompanion.title;
        reynaEnt.dialogueId = window.campaign2ArcherCompanion.dialogueId;
        window.entities.push(reynaEnt);
    }

    // Easy #2: a goblin scout snatched a delivery meant for Wick Hallow's
    // store — a quick, low-stakes fetch (see wick_hallow's new branch in
    // campaign2Dialogue.js). Placed a short walk from the store itself.
    const wick = window.entities.find(e => e.name === 'Wick Hallow');
    if (wick) {
        const scoutHex = { q: wick.hex.q - 6, r: wick.hex.r + 4 };
        const scout = window.createMonster('goblin', scoutHex, null, ['dagger'], 'neutral');
        scout.name = 'Goblin Scout';
        scout.isDeliveryThief = true;
        scout.inventory.push('potion_health'); // the "stolen delivery" — dropped/looted on death
        window.entities.push(scout);
        window.campaign2DeliveryThiefHex = scoutHex;
    }

    // Harder #1: an ogre demanding a toll further up the north road, past
    // the abandoned house — Petra Hollis (Millbrook) has already heard
    // travelers' rumors about it (see her dialogue's new branch).
    const abandoned = window.campaign2AbandonedHouseCenter;
    if (abandoned) {
        const ogreHex = { q: abandoned.q + 12, r: abandoned.r + 8 };
        const ogre = window.createMonster('ogre', ogreHex, null, null, 'neutral');
        ogre.name = 'Toll-Taker Ogre';
        ogre.isTollOgre = true;
        window.entities.push(ogre);
        window.campaign2TollOgreHex = ogreHex;
    }

    // Harder #2: a small spider-infested ruin near Reddale — Mirabel Quill
    // is after a book/reagent inside and needs the spiders cleared first
    // (see mirabel_quill in campaign2Dialogue.js). A miniature version of
    // the dragon lair's "carve a small den, place a monster" shape.
    const guildhouse = window.campaign2ReddaleGuildhouseCenter;
    if (guildhouse) {
        const ruinCenter = { q: guildhouse.q + 14, r: guildhouse.r - 10 };
        for (let dq = -3; dq <= 3; dq++) {
            for (let dr = -3; dr <= 3; dr++) {
                const hex = { q: ruinCenter.q + dq, r: ruinCenter.r + dr };
                if (window.distance(ruinCenter, hex) <= 3) window.setTerrainAt(hex.q, hex.r, 'Rocky Outcrop');
            }
        }
        window.campaign2SpiderRuinCenter = ruinCenter;
        ['spider', 'spider'].forEach((type, i) => {
            const spider = window.createMonster(type, { q: ruinCenter.q + (i === 0 ? -1 : 1), r: ruinCenter.r }, null, null, 'neutral');
            spider.isSpiderRuinDefender = true;
            window.entities.push(spider);
        });

        const mirabelEnt = new window.Entity(window.campaign2WizardCompanion.name, window.campaign2WizardCompanion.color, { q: guildhouse.q + 10, r: guildhouse.r - 8 }, 10);
        mirabelEnt.side = 'neutral';
        mirabelEnt.isNPC = true;
        mirabelEnt.race = window.campaign2WizardCompanion.race;
        mirabelEnt.gender = window.campaign2WizardCompanion.gender;
        mirabelEnt.title = window.campaign2WizardCompanion.title;
        mirabelEnt.dialogueId = window.campaign2WizardCompanion.dialogueId;
        window.entities.push(mirabelEnt);
    }

    // Druid companion: Fenn Oakheart, a grove apprentice distinct from
    // Elder Nessa Wren (the existing unicorn-quest NPC) — recruited via a
    // simple herb-gathering fetch using the grove's two existing
    // herb_patch tileObjects, not combat.
    const grove = window.campaign2DruidGroveCenter;
    if (grove) {
        const fennEnt = new window.Entity(window.campaign2DruidCompanion.name, window.campaign2DruidCompanion.color, { q: grove.q + 1, r: grove.r + 2 }, 10);
        fennEnt.side = 'neutral';
        fennEnt.isNPC = true;
        fennEnt.race = window.campaign2DruidCompanion.race;
        fennEnt.gender = window.campaign2DruidCompanion.gender;
        fennEnt.title = window.campaign2DruidCompanion.title;
        fennEnt.dialogueId = window.campaign2DruidCompanion.dialogueId;
        window.entities.push(fennEnt);
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

// The Vessel-Seeker's Crypt: pays off the abandoned house/altar breadcrumb
// with an actual dungeon crawl, once the player is genuinely hunting the
// necromancer rather than just having stumbled onto a haunted house (see
// necromancer_hunt, campaign2Dialogue.js — Captain Rennick offers it once
// Mirella Thorn is exposed). Three rooms connected by corridors, same
// carveFlatRoom + sealRoom pattern the Silverhart palace's wings use: an
// entrance chamber, an ossuary, and the ritual chamber where Malachar
// himself waits. Hidden, off-road, well past the abandoned house — found
// by exploration, same convention as the vampire grave/druid grove.
// cryptMinion is a SEPARATE tag from necromancerMinion (the abandoned
// house's skeletons) specifically so isAbandonedHouseCleared's global
// `.some()` check isn't accidentally gated behind clearing the crypt too —
// see the reputation-on-kill hook in handleLethalDamage (gameEngine.js),
// which checks both tags.
function buildNecromancerCrypt() {
    const anchor = window.campaign2AbandonedHouseCenter;
    if (!anchor) return;
    const entranceCenter = { q: anchor.q + 18, r: anchor.r + 22 };

    const entranceDoor = { q: entranceCenter.q - 3, r: entranceCenter.r };
    const entranceRegion = carveFlatRoom(entranceCenter.q, entranceCenter.r, 3, 2, entranceDoor, 'Cave Floor');
    window.interiorRegions.push(entranceRegion);

    const ossuaryCenter = { q: entranceCenter.q + 8, r: entranceCenter.r };
    const ossuaryDoor = { q: ossuaryCenter.q - 3, r: ossuaryCenter.r };
    const ossuaryRegion = carveFlatRoom(ossuaryCenter.q, ossuaryCenter.r, 3, 3, ossuaryDoor, 'Cave Floor');
    window.interiorRegions.push(ossuaryRegion);
    for (let q = entranceCenter.q + 4; q < ossuaryDoor.q; q++) window.setTerrainAt(q, entranceCenter.r, 'Cave Floor');

    const ritualCenter = { q: ossuaryCenter.q + 9, r: ossuaryCenter.r };
    const ritualDoor = { q: ritualCenter.q - 3, r: ritualCenter.r };
    const ritualRegion = carveFlatRoom(ritualCenter.q, ritualCenter.r, 4, 3, ritualDoor, 'Cave Floor');
    window.interiorRegions.push(ritualRegion);
    for (let q = ossuaryCenter.q + 4; q < ritualDoor.q; q++) window.setTerrainAt(q, ossuaryCenter.r, 'Cave Floor');

    // Corridors are painted last (above), so re-stamp each room's true
    // footprint now in case a corridor overshot into it.
    sealRoom(entranceRegion);
    sealRoom(ossuaryRegion);
    sealRoom(ritualRegion);

    window.campaign2NecromancerCryptCenter = entranceCenter;
    window.campaign2NecromancerRitualCenter = ritualCenter;

    // Entrance chamber: a light guard, same dormant-until-seen skeletons
    // as the abandoned house.
    [{ q: -1, r: -1 }, { q: 1, r: 1 }].forEach(off => {
        const s = window.createMonster('skeleton', { q: entranceCenter.q + off.q, r: entranceCenter.r + off.r }, null, null, 'enemy');
        s.cryptMinion = true;
        window.entities.push(s);
    });
    window.tileObjects[`${entranceCenter.q},${entranceCenter.r - 1}`] = { type: 'journal', readId: 'crypt_entrance_note', lightRadius: 0 };

    // The ossuary: tougher fare guarding the way to the ritual chamber.
    [
        { off: { q: -1, r: -1 }, type: 'zombie' },
        { off: { q: 1, r: -1 }, type: 'zombie' },
        { off: { q: 0, r: 1 }, type: 'wraith' },
    ].forEach(({ off, type }) => {
        const m = window.createMonster(type, { q: ossuaryCenter.q + off.q, r: ossuaryCenter.r + off.r }, null, null, 'enemy');
        m.cryptMinion = true;
        window.entities.push(m);
    });

    // Malachar himself: built off the revenant template (already the
    // strongest undead humanoid in the roster, real sword/armor rig) then
    // renamed and given custom skills — the same "reuse a base monster's
    // art, override name/stats" pattern arena bosses already use, so no new
    // art asset is needed for a one-off named boss.
    const boss = window.createMonster('revenant', { q: ritualCenter.q, r: ritualCenter.r }, {
        health: 8, meleeDamage: 6, sword_hit: 3, sword_dmg: 3, life_drain: 2, spectral_form: 1, heavy_armor_training: 1,
    }, ['sword', 'heavy_armor'], 'enemy');
    boss.name = 'Malachar, the Vessel-Seeker';
    boss.hp = 90; boss.maxHp = 90;
    boss.spriteBase = 'revenant';
    boss.cryptMinion = true;
    boss.isNecromancerBoss = true;
    window.entities.push(boss);

    const escort = window.createMonster('wraith', { q: ritualCenter.q - 1, r: ritualCenter.r + 1 }, null, null, 'enemy');
    escort.cryptMinion = true;
    window.entities.push(escort);
}
window.buildNecromancerCrypt = buildNecromancerCrypt;

window.readCryptEntranceNote = function() {
    window.showDialogue({ name: "A Warning, Carved in Bone", customImage: 'journal' },
        "Scratched into the stone by a hand that clearly didn't have much time left: \"IT WANTS A BODY THAT WON'T DIE. IT ALREADY HAS THE SHARD. DON'T LET IT FINISH THE REST.\"",
        [{ label: "...", action: () => {} }]
    );
};

// The Barrow of Corvin Ashgrave: pays off "he achieves lichdom despite our
// efforts" — Malachar (the crypt boss) was only ever a lieutenant/vessel
// candidate; the necromancer himself, Corvin Ashgrave, completes the ritual
// off-screen regardless of how the crypt or the abandoned-house altar went
// (see necromancer_lichdom, campaign2Dialogue.js, time-gated off
// necromancerDefeatedAt in worldTime.js). Two rooms: a guarded antechamber
// holding the phylactery_core itself, then Ashgrave's sanctum — the player
// must reach and resolve the core BEFORE killing Ashgrave for the kill to
// stick; killed first, his body "dies" but he isn't actually gone (see
// checkCombatEnd's necromancer_lichdom branch, gameEngine.js).
function buildLichBarrow() {
    const anchor = window.campaign2NecromancerRitualCenter;
    if (!anchor) return;
    const anteCenter = { q: anchor.q + 14, r: anchor.r - 6 };

    const anteDoor = { q: anteCenter.q - 3, r: anteCenter.r };
    const anteRegion = carveFlatRoom(anteCenter.q, anteCenter.r, 3, 3, anteDoor, 'Cave Floor');
    window.interiorRegions.push(anteRegion);

    const sanctumCenter = { q: anteCenter.q + 9, r: anteCenter.r };
    const sanctumDoor = { q: sanctumCenter.q - 3, r: sanctumCenter.r };
    const sanctumRegion = carveFlatRoom(sanctumCenter.q, sanctumCenter.r, 4, 3, sanctumDoor, 'Cave Floor');
    window.interiorRegions.push(sanctumRegion);
    for (let q = anteCenter.q + 4; q < sanctumDoor.q; q++) window.setTerrainAt(q, anteCenter.r, 'Cave Floor');

    sealRoom(anteRegion);
    sealRoom(sanctumRegion);

    window.campaign2LichBarrowCenter = anteCenter;
    window.campaign2LichSanctumCenter = sanctumCenter;

    // The antechamber: tougher guards than the crypt had, plus the
    // phylactery_core the player must destroy or bind before Ashgrave's
    // eventual death can be made to last.
    [
        { off: { q: -1, r: -1 }, type: 'wraith' },
        { off: { q: 1, r: -1 }, type: 'wraith' },
        { off: { q: 0, r: 1 }, type: 'zombie' },
    ].forEach(({ off, type }) => {
        const m = window.createMonster(type, { q: anteCenter.q + off.q, r: anteCenter.r + off.r }, null, null, 'enemy');
        m.barrowMinion = true;
        window.entities.push(m);
    });
    window.tileObjects[`${anteCenter.q},${anteCenter.r - 2}`] = { type: 'journal', readId: 'lich_phylactery_core', lightRadius: 0 };

    // The Bone Trader: villain-path alternative to the human merchants that
    // refuse a lich player (see isShunnedByHumanCommerce, factions.js) —
    // reachable by anyone who clears the antechamber, not gated further.
    if (window.campaign2BoneTrader) {
        window.entities.push(window.buildNPC({ ...window.campaign2BoneTrader, hex: { q: anteCenter.q + 1, r: anteCenter.r + 2 } }));
    }

    // Corvin Ashgrave himself — same "reuse a base monster's art, override
    // name/stats" pattern Malachar used, scaled up a tier since he's the
    // real necromancer, not a lieutenant.
    const boss = window.createMonster('revenant', { q: sanctumCenter.q, r: sanctumCenter.r }, {
        health: 12, meleeDamage: 8, sword_hit: 4, sword_dmg: 4, life_drain: 3, spectral_form: 2, heavy_armor_training: 2,
    }, ['sword', 'heavy_armor'], 'enemy');
    boss.name = 'Corvin Ashgrave, the Lich';
    boss.hp = 130; boss.maxHp = 130;
    boss.spriteBase = 'revenant';
    boss.barrowMinion = true;
    boss.isLichBoss = true;
    window.entities.push(boss);

    const escort = window.createMonster('wraith', { q: sanctumCenter.q + 1, r: sanctumCenter.r - 1 }, null, null, 'enemy');
    escort.barrowMinion = true;
    window.entities.push(escort);
}
window.buildLichBarrow = buildLichBarrow;

window.readLichPhylacteryCoreNote = function() {
    if (window.lichPhylacteryDestroyed || window.lichPhylacteryBound) {
        window.showDialogue({ name: 'Corvin Ashgrave\'s Phylactery', customImage: 'altar_unholy' },
            "Whatever it was, it's spent now — there's nothing left to decide about it.");
        return;
    }
    window.showDialogue({ name: 'Corvin Ashgrave\'s Phylactery', customImage: 'altar_unholy' },
        "A blackened shard, bound in wire and old wax, humming faintly even from across the room. This is what's keeping him from staying dead. Whatever you do with it, do it now — before he knows you found it.",
        [
            {
                label: "Destroy it.",
                action: () => {
                    window.lichPhylacteryDestroyed = true;
                    if (window.factions?.necromancer_cult) window.adjustReputation(window.factions.necromancer_cult, -20, 15);
                    if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'security', 5);
                    window.showMessage("The shard cracks apart in your hands like old ash. Whatever tether Ashgrave had to this world just snapped.");
                }
            },
            {
                label: "Bind it to yourself instead.",
                action: () => {
                    window.lichPhylacteryBound = true;
                    window.playerIsLich = true;
                    window.lichBecameKnownAt = window.worldSeconds;
                    if (window.grantSkillRank) {
                        window.grantSkillRank(window.player, 'lich_grave_chill');
                        window.grantSkillRank(window.player, 'lich_withering_touch');
                    }
                    ['silverhart_kingdom', 'ironbond_company'].forEach(id => {
                        if (window.factions[id]) window.adjustReputation(window.factions[id], -20, 15);
                    });
                    window.showMessage("You take the shard instead of breaking it. Something of Ashgrave's undeath settles into you, cold and patient.");
                    if (window.triggerLichCompanionFallout) window.triggerLichCompanionFallout();
                }
            },
            { label: "Leave it for now.", action: () => {} }
        ]
    );
};

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

    setWorldMapMarker(center, { t: 'G', f: 'V', o: 'h', p: 1, n: 'Millbrook' });
}

// A dragon, out past Millbrook — pure "there's a threat in the wilds" flavor
// with no tie to the main plotlines. Its rampage (stolen sheep, a burned
// barn) is told entirely through Petra Hollis's dialogue (campaign2Dialogue.js's
// petra_hollis tree) rather than any ambient sighting or simulated raid — the
// lair itself only exists so the quest has a real destination and a real
// fight at the end of it. Deliberately far from Millbrook (window.distance
// works out to exactly 100 for a pure-q offset at the same r) and well off
// the north road's column, so nothing stumbles onto it by accident.
function buildDragonLair() {
    const millbrook = window.campaign2MillbrookCenter;
    if (!millbrook) return;
    const center = { q: millbrook.q + 100, r: millbrook.r };
    const OUTER_RADIUS = 6;
    const DEN_RADIUS = 2;
    for (let dq = -OUTER_RADIUS; dq <= OUTER_RADIUS; dq++) {
        for (let dr = -OUTER_RADIUS; dr <= OUTER_RADIUS; dr++) {
            const hex = { q: center.q + dq, r: center.r + dr };
            const d = window.distance(center, hex);
            if (d <= DEN_RADIUS) window.setTerrainAt(hex.q, hex.r, 'Cave Floor');
            else if (d <= OUTER_RADIUS) window.setTerrainAt(hex.q, hex.r, 'Rocky Outcrop');
        }
    }

    const dragon = window.createMonster('dragon_young', { q: center.q, r: center.r });
    dragon.name = 'Ashveil';
    dragon.title = 'the Ember-Scaled';
    dragon.isMillbrookDragon = true;
    dragon.behaviorType = 'stationary'; // guards its hoard, doesn't wander off to be found by accident
    // The hoard: far more gold than any single encounter elsewhere in the
    // game, plus a couple of real treasures. Both the gold and the inventory
    // transfer to the player automatically on the kill (handleLethalDamage,
    // gameEngine.js) — no separate lootable object needed. Pushed directly
    // rather than via equipToMonster so nothing here ends up worn/wielded,
    // just carried hoard.
    dragon.gold = 750;
    dragon.inventory.push('glowing_ring', 'stormcaller_spear');
    window.entities.push(dragon);

    window.campaign2DragonLairCenter = center;
}
window.buildDragonLair = buildDragonLair;

// Reveals a wide radius of terrain around the dragon's lair the moment Petra
// tells the player roughly where to look — same exploredHexes mechanism
// cheatExploreEverything (above) uses, just scoped to one area instead of
// the whole world.
function revealDragonLairArea() {
    const center = window.campaign2DragonLairCenter;
    if (!center) return;
    const REVEAL_RADIUS = 10;
    for (let dq = -REVEAL_RADIUS; dq <= REVEAL_RADIUS; dq++) {
        for (let dr = -REVEAL_RADIUS; dr <= REVEAL_RADIUS; dr++) {
            const hex = { q: center.q + dq, r: center.r + dr };
            if (window.distance(center, hex) <= REVEAL_RADIUS) window.exploredHexes.add(`${hex.q},${hex.r}`);
        }
    }
    if (window.drawMap) window.drawMap();
}
window.revealDragonLairArea = revealDragonLairArea;

// Dead entities stay in window.entities with alive:false (see
// checkDisappearance/handleLethalDamage) rather than being spliced out, so
// this is a simple lookup, not a separately tracked flag.
window.isMillbrookDragonSlain = function() {
    const dragon = window.entities.find(e => e.isMillbrookDragon);
    return !dragon || !dragon.alive;
};

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
    // halfH=5 below means the floor's own south edge sits at
    // throneCenter.r+4 — the real wall-ring row (one hex further out, where
    // it actually meets the flanking wall hexes) is throneCenter.r+5, same
    // "door must sit on the wall row, not a floor row short of it" fix
    // already applied to rearDoor below.
    const throneDoor = { q: throneCenter.q, r: throneCenter.r + 5 };
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
    window.tileObjects[`${throneSeat.q + 2},${throneSeat.r-2}`] = { type: 'fireplace', lightRadius: 6 };
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
    // rearDoor must sit on the throne room's actual wall-ring row. With
    // carveFlatRoom(throneCenter, 7, 5, ...), that row is throneCenter.r-5,
    // NOT throneCenter.r-4 (a floor row, one step short of it) — the
    // previous r-4 value meant the real wall hex at r-5 was never in
    // sealRoom's exceptions list below, so every reseal repainted it back
    // to Wall regardless of the corridor loop having set it to Path: a
    // door graphic one hex short of an otherwise-untouched, re-sealed Wall.
    const rearDoor = { q: throneCenter.q, r: throneCenter.r - 5 };
    const bedroomCenter = { q: throneCenter.q, r: throneCenter.r - 9 };
    // bedroomDoor sits one hex inside the bedroom's own floor (its real
    // south wall row is bedroomCenter.r+3, not +2 — see the sealRoom call
    // below), so it's kept only as the corridor-painting loop's bound, NOT
    // passed to carveFlatRoom as a doorHex — that used to auto-place a
    // second, spurious door graphic on plain interior floor, stacking with
    // rearDoor and the wall's real door into three doors in a row where
    // there should be exactly one (rearDoor, the throne room's own north
    // wall gap — the single passage between the two rooms).
    const bedroomDoor = { q: bedroomCenter.q, r: bedroomCenter.r + 2 };
    const bedroomRegion = carveFlatRoom(bedroomCenter.q, bedroomCenter.r, 3, 3, null, 'Wood Floor');
    window.interiorRegions.push(bedroomRegion);
    window.setTerrainAt(rearDoor.q, rearDoor.r, 'Wood Floor');
    window.tileObjects[`${rearDoor.q},${rearDoor.r}`] = { type: 'door_open', lightRadius: 0 };
    for (let r = rearDoor.r - 1; r > bedroomDoor.r; r--) window.setTerrainAt(throneCenter.q, r, 'Path');
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
    sealRoom(throneRegion, [rearDoor]);
    sealRoom(barracksRegion);
    sealRoom(councilRegion);
    sealRoom(towerRegion, [towerApron]);
    // The bedroom's own true wall-ring row (its south side) is
    // bedroomCenter.r+3, one hex further out than bedroomDoor. It needs to
    // stay passable (not resealed to solid Wall, which would cut the
    // bedroom off from rearDoor entirely) but deliberately gets no door
    // tileObject of its own — rearDoor above is the only door between the
    // throne room and the bedroom. Reopened as plain floor immediately
    // after sealing, with any tileObject there removed, rather than passed
    // to sealRoom as a door exception (which would recreate a second door
    // graphic right next to rearDoor).
    sealRoom(bedroomRegion);
    const bedroomWallGap = { q: bedroomCenter.q, r: bedroomCenter.r + 3 };
    window.setTerrainAt(bedroomWallGap.q, bedroomWallGap.r, 'Wood Floor');
    delete window.tileObjects[`${bedroomWallGap.q},${bedroomWallGap.r}`];

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
    // throneCenter.q sits right at the ring's own southern CORNER (where the
    // pure-hex-distance south edge and southeast edge meet), not partway
    // along a flat straight run — its two real ring-adjacent neighbors are
    // one hex apart on EACH of those two edges, at different r
    // (throneCenter.r+WALL_RADIUS for the south edge, throneCenter.r+
    // WALL_RADIUS-1 for the southeast edge), not the same row 3 hexes wide
    // the old code assumed. Leaving the whole ring solid here (no
    // carved-out gap) and placing the actual gated door one hex further IN
    // (on the approach road, where it visibly meets both real neighbors)
    // reads correctly instead of a gate graphic sitting on the corner hex
    // with nothing visibly connecting to either flanking wall.
    ringHexes.forEach(h => window.setTerrainAt(h.q, h.r, 'Palisade Wall'));
    const gateDoorHex = { q: throneCenter.q, r: throneCenter.r + WALL_RADIUS - 1 };
    // Connect the gate to the existing entrance road running north from
    // roadEnd to throneDoor — stops one hex short of the solid ring (the
    // gate door hex itself is the last step, handled by the locking pass
    // below) so it doesn't repaint over the wall it's supposed to meet.
    for (let r = throneDoor.r + 1; r < gateDoorHex.r; r++) window.setTerrainAt(throneCenter.q, r, 'Path');

    // Reputation-gated checkpoints, deepest room = highest bar: the
    // compound gate, the great hall's own door, and the door to the Queen's
    // private chambers (rearDoor, carved above) each start closed and
    // locked behind a rising silverhart_kingdom standing threshold — even
    // a human player has to actually earn their way further in, not just
    // walk to the throne. toggleDoor's accessThreshold check re-evaluates
    // live every time someone tries the door, so there's no separate
    // "unlock" step to wire up elsewhere — clearing the threshold IS the
    // unlock, the next time it's opened.
    // Per the player's request, the compound gate's own reputation-gated
    // door is gone — this is now a plain, permanently open approach.
    window.setTerrainAt(gateDoorHex.q, gateDoorHex.r, 'Path');
    window.setTerrainAt(throneDoor.q, throneDoor.r, 'Wall');
    window.tileObjects[`${throneDoor.q},${throneDoor.r}`] = {
        type: 'door_closed', lightRadius: 0, locked: true, hp: 30, maxHp: 30,
        accessThreshold: { faction: 'silverhart_kingdom', standing: 15 },
        accessDeniedMessage: 'A guard blocks the great hall doors. "Her Majesty isn\'t holding audience for the likes of you."'
    };
    window.setTerrainAt(rearDoor.q, rearDoor.r, 'Wall');
    window.tileObjects[`${rearDoor.q},${rearDoor.r}`] = {
        type: 'door_closed', lightRadius: 0, locked: true, hp: 20, maxHp: 20,
        accessThreshold: { faction: 'silverhart_kingdom', standing: 40 },
        accessDeniedMessage: "This leads to the Queen's private chambers. It's locked, and clearly not for you."
    };

    // Watchtowers flanking the gate, plus one at each of the hexagon's
    // other five true corners. A hex ring's 6 corners are the well-known
    // (R,0), (R,-R), (0,-R), (-R,0), (-R,R), (0,R) axial offsets — the last
    // of those (0,R) is the gate's own south corner, so it's skipped here
    // in favor of two towers flanking the gate itself instead.
    const towerSpots = [
        { q: throneCenter.q + 2, r: throneCenter.r + 21 },                 // flanking the gate (east)
        { q: throneCenter.q - 2, r: throneCenter.r + WALL_RADIUS },        // flanking the gate (west)
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


    // A real ring road around the curtain wall — a second hex-distance
    // circle (same technique as WALL_RADIUS above), a few hexes further
    // out, giving the merchant/noble districts an actual street to front
    // onto instead of the old single-file corridor that ran nearly 60-80
    // hexes off into the distance. Connects to the existing entrance road
    // at the gate.
    const RING_ROAD_RADIUS = WALL_RADIUS + 7; // 30 — enough clearance to feel like a real town green, not a moat
    for (let q = -RING_ROAD_RADIUS; q <= RING_ROAD_RADIUS; q++) {
        for (let r = -RING_ROAD_RADIUS; r <= RING_ROAD_RADIUS; r++) {
            if (window.distance({ q: 0, r: 0 }, { q, r }) === RING_ROAD_RADIUS) {
                window.setTerrainAt(throneCenter.q + q, throneCenter.r + r, 'Path');
            }
        }
    }
    // Extend the entrance road from the gate out to meet the ring. Starts
    // one hex PAST the wall ring (WALL_RADIUS + 1), not AT it — the ring
    // hex at WALL_RADIUS is the solid corner the gate door (one hex
    // further in) closes against; painting Path over it here would repave
    // straight through that wall.
    for (let r = throneCenter.r + WALL_RADIUS + 1; r <= throneCenter.r + RING_ROAD_RADIUS; r++) window.setTerrainAt(throneCenter.q, r, 'Path');
    window.campaign2SilverhartRingRoadRadius = RING_ROAD_RADIUS;
    // Just outside the gate on the entrance road — the right spot to arrive
    // at Silverhart, since the gate itself is a real reputation-gated door
    // (see gateDoorHex above): teleporting in should still leave that check
    // in place, not drop the party straight into the throne room.
    window.campaign2PalaceGateExteriorHex = { q: throneCenter.q, r: throneCenter.r + WALL_RADIUS + 1 };

    // The city, thought of as concentric rings around the palace: the
    // "nice" districts (Merchant, Noble) hug the curtain wall directly on
    // its west/east faces — as close to the palace as the wall allows —
    // rather than sitting off a single corridor. Real short street grids
    // (two parallel streets + a cross-alley, which also happens to cross
    // the ring road automatically, connecting the whole thing), buildings
    // carved with carveFlatRoom (a level-topped rectangle) rather than
    // carveBuilding (a slanted rhombus — the old shape complaint).
    const DISTRICT_SPAN = 9; // rows north/south of throneCenter.r each district's streets run

    // --- Merchant Quarter (hugging the west wall) ---
    const merchantNearQ = throneCenter.q - 27; // just outside the wall (radius 23)
    const merchantFarQ = throneCenter.q - 40;  // past the ring road (radius 30)
    for (let r = throneCenter.r - DISTRICT_SPAN; r <= throneCenter.r + DISTRICT_SPAN; r++) {
        window.setTerrainAt(merchantNearQ, r, 'Path');
        window.setTerrainAt(merchantFarQ, r, 'Path');
    }
    for (let q = merchantFarQ; q <= throneCenter.q - RING_ROAD_RADIUS; q++) window.setTerrainAt(q, throneCenter.r, 'Path'); // cross-alley out to the ring road — NOT all the way to throneCenter.q, which would cut straight through the throne room's own floor

    const stableCenter = { q: merchantNearQ - 4, r: throneCenter.r - 6 };
    const stableDoor = { q: stableCenter.q + 4, r: stableCenter.r };
    window.interiorRegions.push(carveFlatRoom(stableCenter.q, stableCenter.r, 4, 3, stableDoor, 'Wood Floor'));
    window.campaign2SilverhartStableCenter = stableCenter;
    window.tileObjects[`${stableCenter.q},${stableCenter.r}`] = { type: 'fence_h' }; // stalls/pen flavor
    if (window.campaign2Stablehand) {
        window.entities.push(window.buildNPC({ ...window.campaign2Stablehand, hex: { q: stableCenter.q, r: stableCenter.r - 1 } }));
    }

    const generalGoodsCenter = { q: merchantNearQ - 3, r: throneCenter.r + 6 };
    const generalGoodsDoor = { q: generalGoodsCenter.q + 3, r: generalGoodsCenter.r };
    window.interiorRegions.push(carveFlatRoom(generalGoodsCenter.q, generalGoodsCenter.r, 3, 2, generalGoodsDoor, 'Wood Floor'));
    window.campaign2SilverhartGeneralGoodsCenter = generalGoodsCenter;
    if (window.campaign2SilverhartGeneralGoods) {
        window.entities.push(window.buildNPC({ ...window.campaign2SilverhartGeneralGoods, hex: { q: generalGoodsCenter.q, r: generalGoodsCenter.r + 1 } }));
    }

    const clothierCenter = { q: merchantFarQ + 3, r: throneCenter.r - 6 };
    const clothierDoor = { q: clothierCenter.q - 3, r: clothierCenter.r };
    window.interiorRegions.push(carveFlatRoom(clothierCenter.q, clothierCenter.r, 3, 2, clothierDoor, 'Wood Floor'));
    if (window.campaign2Clothier) {
        window.entities.push(window.buildNPC({ ...window.campaign2Clothier, hex: { q: clothierCenter.q, r: clothierCenter.r + 1 } }));
    }

    const magicShopCenter = { q: merchantFarQ + 3, r: throneCenter.r + 6 };
    const magicShopDoor = { q: magicShopCenter.q - 3, r: magicShopCenter.r };
    window.interiorRegions.push(carveFlatRoom(magicShopCenter.q, magicShopCenter.r, 3, 2, magicShopDoor, 'Wood Floor'));
    if (window.campaign2MagicDealer) {
        window.entities.push(window.buildNPC({ ...window.campaign2MagicDealer, hex: { q: magicShopCenter.q, r: magicShopCenter.r + 1 } }));
    }
    fillEnclosedPockets(merchantFarQ - 5, merchantNearQ + 5, throneCenter.r - DISTRICT_SPAN - 2, throneCenter.r + DISTRICT_SPAN + 2);
    // Re-stamp the two streets: a building's own wall ring can land right on
    // top of the street column it fronts (carved after the street was first
    // painted), silently splitting the road into disconnected fragments —
    // repaint last so the street always wins.
    for (let r = throneCenter.r - DISTRICT_SPAN; r <= throneCenter.r + DISTRICT_SPAN; r++) {
        window.setTerrainAt(merchantNearQ, r, 'Path');
        window.setTerrainAt(merchantFarQ, r, 'Path');
    }
    for (let q = merchantFarQ; q <= throneCenter.q - RING_ROAD_RADIUS; q++) window.setTerrainAt(q, throneCenter.r, 'Path');

    // --- Noble Quarter (hugging the east wall, mirrored) ---
    const nobleNearQ = throneCenter.q + 27;
    const nobleFarQ = throneCenter.q + 40;
    for (let r = throneCenter.r - DISTRICT_SPAN; r <= throneCenter.r + DISTRICT_SPAN; r++) {
        window.setTerrainAt(nobleNearQ, r, 'Path');
        window.setTerrainAt(nobleFarQ, r, 'Path');
    }
    for (let q = throneCenter.q + RING_ROAD_RADIUS; q <= nobleFarQ; q++) window.setTerrainAt(q, throneCenter.r, 'Path'); // cross-alley out to the ring road — NOT all the way to throneCenter.q, which would cut straight through the throne room's own floor

    // The Corstane family's abandoned townhouse — grantable by the Queen
    // once reputation with the crown is high enough (see the
    // silverhart_queen dialogue tree), distinct from the free cottage plot
    // (built) and the abandoned house on the north road (cleared by force).
    const manorCenter = { q: nobleNearQ + 4, r: throneCenter.r - 6 };
    const manorDoor = { q: manorCenter.q - 4, r: manorCenter.r };
    const manorRegion = carveFlatRoom(manorCenter.q, manorCenter.r, 4, 3, manorDoor, 'Wood Floor');
    // The west wall (manorCenter.q-4, exactly nobleNearQ) sits right on the
    // Noble Quarter's own street column, which gets fully re-stamped to
    // Path later — unlike a building merely fronting the street, this
    // wall's own door lived on that same column, so the whole wall
    // (not just a front face) was being erased. Shrink the building by one
    // column on the west side only (the east wall and everything else stay
    // put): the old floor column becomes the new wall, the old wall column
    // is abandoned to the street, and the door moves in to match.
    const manorOldWallQ = manorCenter.q - 4;
    const manorNewWallQ = manorOldWallQ + 1;
    const manorNewDoor = { q: manorNewWallQ, r: manorCenter.r };
    manorRegion.wallHexes = manorRegion.wallHexes.filter(h => h.q !== manorOldWallQ);
    const manorShiftedFloor = manorRegion.floorHexes.filter(h => h.q === manorNewWallQ && !(h.q === manorNewDoor.q && h.r === manorNewDoor.r));
    manorRegion.floorHexes = manorRegion.floorHexes.filter(h => h.q !== manorNewWallQ);
    manorRegion.wallHexes.push(...manorShiftedFloor);
    manorShiftedFloor.forEach(h => window.setTerrainAt(h.q, h.r, 'Wall'));
    manorRegion.doorHex = manorNewDoor;
    manorRegion.floorHexes.push(manorNewDoor);
    window.setTerrainAt(manorNewDoor.q, manorNewDoor.r, 'Wood Floor');
    delete window.tileObjects[`${manorDoor.q},${manorDoor.r}`];
    window.tileObjects[`${manorNewDoor.q},${manorNewDoor.r}`] = { type: 'door_open', lightRadius: 0 };
    window.interiorRegions.push(manorRegion);
    window.campaign2SilverhartManorCenter = manorCenter;
    if (window.campaign2NobleCorstane) {
        window.entities.push(window.buildNPC({ ...window.campaign2NobleCorstane, hex: { q: manorCenter.q, r: manorCenter.r + 1 } }));
    }

    // A manually-carved 6-corner building (carvePolygonRoom) at fixed
    // absolute coordinates, replacing the old plain rectangle — per the
    // player's own corner list, with a door on the west edge (facing back
    // toward the rest of the Noble Quarter street network) and Master
    // Builder Hallis placed well inside the footprint.
    {
        // Same 6 points the player gave, reordered into their actual cyclic
        // (angular) order around the hexagon — the original listing order
        // zigzagged back and forth instead of tracing the perimeter, which
        // made carvePolygonRoom draw a self-crossing, pinched shape instead
        // of a clean hexagon.
        const builderHouseCorners = [
            { q: 42, r: -491 },
            { q: 38, r: -486 },
            { q: 34, r: -491 },
            { q: 34, r: -495 },
            { q: 38, r: -495 },
            { q: 42, r: -495 },
        ];
        const builderHouseDoor = { q: 34, r: -493 };
        // A second door at the south corner (38,-486) — the hexagon's only
        // other entrance sat clear across the building on the west corner,
        // reading as a solid, doorless wall to anyone approaching from
        // this side. Pre-painting its one Grass exterior neighbor as Path
        // before carving gives carvePolygonRoom's own door-to-path BFS an
        // instant, distance-1 target — without this, that BFS (which
        // freely walks through this room's own walkable floor, since floor
        // isn't impassable) found it shorter to cut straight across the
        // interior to the west door's own connector than to go around
        // outside, painting a stray Path trail through the middle of the
        // room.
        const builderHouseSouthDoor = { q: 38, r: -486 };
        window.setTerrainAt(38, -485, 'Path');
        const builderHouseRegion = window.carvePolygonRoom(builderHouseCorners, [builderHouseDoor, builderHouseSouthDoor], 'Wood Floor');
        // Heal the shape: carvePolygonRoom's per-door connector BFS walks
        // freely through this room's own walkable floor (floor isn't
        // impassable), and with the hexagon's true wall/floor boundary
        // zigzagging into q=35 at some rows (not a clean vertical wall),
        // the west door's connector wandered along that zigzag and
        // overwrote several real wall hexes there to Path — a walk-around
        // bypass of the wall a few rows from the door, undetectable by eye
        // but found by an interior-audit walk of the capital. Re-stamp the
        // region's own authoritative floor/wall/door hexes over whatever
        // the connector passes left behind.
        builderHouseRegion.floorHexes.forEach(h => window.setTerrainAt(h.q, h.r, 'Wood Floor'));
        builderHouseRegion.wallHexes.forEach(h => window.setTerrainAt(h.q, h.r, 'Wall'));
        builderHouseRegion.doorHexes.forEach(h => {
            window.setTerrainAt(h.q, h.r, 'Wood Floor');
            window.tileObjects[`${h.q},${h.r}`] = { type: 'door_open', lightRadius: 0 };
        });
        window.interiorRegions.push(builderHouseRegion);
        // Exposed so the Noble Quarter's later street re-stamp (below) can
        // skip this building's own footprint entirely — it's wide enough
        // that nobleNearQ's column cuts across real interior floor, not
        // just a front wall, so even the wall hexes here can't be safely
        // treated as "a wall the street is allowed to overwrite" the way
        // every other district building's wall is.
        window.campaign2SilverhartBuilderHouseFootprint = new Set(
            [...builderHouseRegion.floorHexes, ...builderHouseRegion.wallHexes].map(h => `${h.q},${h.r}`)
        );
        if (window.campaign2SilverhartBuilder) {
            window.entities.push(window.buildNPC({ ...window.campaign2SilverhartBuilder, hex: { q: 38, r: -492 } }));
        }
    }

    const neighborHouseCenter = { q: nobleFarQ - 3, r: throneCenter.r - 6 };
    const neighborHouseDoor = { q: neighborHouseCenter.q + 3, r: neighborHouseCenter.r };
    window.interiorRegions.push(carveFlatRoom(neighborHouseCenter.q, neighborHouseCenter.r, 3, 2, neighborHouseDoor, 'Wood Floor'));
    window.campaign2SilverhartNeighborHouseCenter = neighborHouseCenter;
    if (window.campaign2ManorNeighbor) {
        window.entities.push(window.buildNPC({ ...window.campaign2ManorNeighbor, hex: { q: neighborHouseCenter.q, r: neighborHouseCenter.r + 1 } }));
    }
    fillEnclosedPockets(nobleNearQ - 5, nobleFarQ + 5, throneCenter.r - DISTRICT_SPAN - 2, throneCenter.r + DISTRICT_SPAN + 2);
    // Re-stamp the two streets for the same reason as the Merchant Quarter above.
    // A building's own front WALL is fine to overwrite here (that's the
    // whole point — the street always wins over a wall it fronts), but
    // Master Builder Hallis's hexagon is wide enough that nobleNearQ's
    // column cuts across its actual interior, not just a front wall —
    // blindly stamping Path there opened a walk-around gap straight past
    // both of the building's real doors. Skip its whole footprint here.
    const builderHouseFootprint = window.campaign2SilverhartBuilderHouseFootprint || new Set();
    for (let r = throneCenter.r - DISTRICT_SPAN; r <= throneCenter.r + DISTRICT_SPAN; r++) {
        if (!builderHouseFootprint.has(`${nobleNearQ},${r}`)) window.setTerrainAt(nobleNearQ, r, 'Path');
        if (!builderHouseFootprint.has(`${nobleFarQ},${r}`)) window.setTerrainAt(nobleFarQ, r, 'Path');
    }
    for (let q = throneCenter.q + RING_ROAD_RADIUS; q <= nobleFarQ; q++) window.setTerrainAt(q, throneCenter.r, 'Path');
    // Petra Ashfield's neighbor house has its own door on this same
    // nobleFarQ column, so the street re-stamp above erased its entire
    // east wall, not just the front face it was fronting. Restore the
    // 3 real wall hexes (everything but the door itself) that sit on it.
    [
        { q: nobleFarQ, r: neighborHouseCenter.r - 3 },
        { q: nobleFarQ, r: neighborHouseCenter.r - 2 },
        { q: nobleFarQ, r: neighborHouseCenter.r - 1 },
    ].forEach(h => window.setTerrainAt(h.q, h.r, 'Wall'));

    // --- A small cluster of plain cottages tucked north of the manor
    // district, between q=32 and q=37 (kept clear of the curtain wall's
    // own corridor at q=31 and Master Builder Hallis's hexagon to the
    // east) and r=-506 to -519. Deliberately not packed solid — real gaps
    // between them, same as everywhere else in Silverhart. Doors face east
    // (the road side); the spur steps one hex clear of the building before
    // turning, so it never overwrites the building's own wall hexes. ---
    const cottageCenters = [
        { q: 35, r: -507, halfW: 2, halfH: 2 },
        { q: 35, r: -513, halfW: 2, halfH: 2 },
        { q: 35, r: -519, halfW: 2, halfH: 2 },
    ];
    // Each door gets exactly one Path hex immediately outside it — a tiny,
    // self-contained road island that never has to know where anything
    // else (the palace's own curtain wall at q=31, a neighboring building's
    // wall, another cottage) actually is. connectAllRoadNetworks (run once,
    // near the end of world-build) then bridges every such island into the
    // rest of the network itself, routing through findPath so it always
    // detours around impassable terrain instead of drawing a straight line
    // through it — unlike the old manual spine/spur connectors here, which
    // repeatedly cut straight through walls they didn't know were in the way.
    window.campaign2SilverhartCottageCenters = [];
    cottageCenters.forEach(({ q, r, halfW, halfH }) => {
        const center = { q, r };
        const door = { q: center.q + halfW, r: center.r };
        const room = carveFlatRoom(center.q, center.r, halfW, halfH, door, 'Wood Floor');
        window.interiorRegions.push(room);
        window.setTerrainAt(door.q + 1, door.r, 'Path');
        window.tileObjects[`${center.q},${center.r}`] = { type: 'table' };
        window.campaign2SilverhartCottageCenters.push(center);
    });

    // --- Middle-class ring: a handful of plain houses further out, past
    // the inner ring road, cheaper than anything hugging the wall. A
    // second ring road (same hex-distance-circle technique) at radius 45,
    // connected to the inner one by extending the south entrance road. ---
    const MIDDLE_RING_RADIUS = 45;
    for (let q = -MIDDLE_RING_RADIUS; q <= MIDDLE_RING_RADIUS; q++) {
        for (let r = -MIDDLE_RING_RADIUS; r <= MIDDLE_RING_RADIUS; r++) {
            if (window.distance({ q: 0, r: 0 }, { q, r }) === MIDDLE_RING_RADIUS) {
                window.setTerrainAt(throneCenter.q + q, throneCenter.r + r, 'Path');
            }
        }
    }
    for (let r = throneCenter.r + RING_ROAD_RADIUS; r <= throneCenter.r + MIDDLE_RING_RADIUS; r++) window.setTerrainAt(throneCenter.q, r, 'Path');
    window.campaign2SilverhartMiddleRingRadius = MIDDLE_RING_RADIUS;

    // 6 plain houses spaced around the middle ring's own hexagon corners
    // (the same 6 axial offsets the palace wall's towers use), each a
    // short spur off the ring itself.
    const MIDDLE_RING_CORNERS = [
        { q: MIDDLE_RING_RADIUS, r: 0 }, { q: MIDDLE_RING_RADIUS, r: -MIDDLE_RING_RADIUS }, { q: 0, r: -MIDDLE_RING_RADIUS },
        { q: -MIDDLE_RING_RADIUS, r: 0 }, { q: -MIDDLE_RING_RADIUS, r: MIDDLE_RING_RADIUS }, { q: 0, r: MIDDLE_RING_RADIUS },
    ];
    window.campaign2SilverhartMiddleRingHouses = [];
    MIDDLE_RING_CORNERS.forEach((offset, i) => {
        const ringHex = { q: throneCenter.q + offset.q, r: throneCenter.r + offset.r };
        const inward = { q: Math.round(offset.q * 0.9), r: Math.round(offset.r * 0.9) };
        const houseCenter = { q: throneCenter.q + inward.q, r: throneCenter.r + inward.r };
        // The south corner (offset {0, MIDDLE_RING_RADIUS}) computes to
        // exactly (throneCenter.q, throneCenter.r+41) — the same fixed
        // point the Diplomatic Quarter's own central plaza uses AND sits
        // directly on the quarter's own north-south dqCenter street, since
        // all three were placed independently; a small eastward nudge just
        // lands on the (also independently placed) cathedral instead.
        // +14 clears the whole Diplomatic Quarter building cluster,
        // confirmed empirically against every other district building's
        // own floor/wall footprint.
        const isSouthCorner = offset.q === 0 && offset.r === MIDDLE_RING_RADIUS;
        if (isSouthCorner) { houseCenter.q += 14; houseCenter.r = throneCenter.r + 44; }
        // Door faces toward the ring along whichever axis the ring
        // direction is stronger on, using the house's own real wall row
        // (centerR+/-2 or centerQ+/-2, halfW=halfH=2 below) — NOT ringHex
        // itself (the old bug: doorHex used to BE ringHex, several hexes
        // away from the house's own wall, so the real wall stayed solid
        // with no opening, and the door graphic floated out at the ring,
        // unconnected to anything). The shifted south corner is a special
        // case: its ring point sits due WEST now (not south), so its door
        // faces west instead of the usual south — a south-facing door here
        // would send the ring-connector cube-lerp diagonally back through
        // the house's own east-shifted wall to reach it.
        // The west corner (offset {-45,45}) is a tie on both axes (|q|===|r|)
        // and used to fall through to the south-facing branch below; per the
        // player's request its door instead faces west (further left),
        // toward the same side its own offset leans.
        const isWestCorner = offset.q === -MIDDLE_RING_RADIUS && offset.r === MIDDLE_RING_RADIUS;
        const doorHex = isSouthCorner
            ? { q: houseCenter.q - 2, r: houseCenter.r }
            : isWestCorner
                ? { q: houseCenter.q - 2, r: houseCenter.r }
                : Math.abs(offset.r) >= Math.abs(offset.q)
                    ? { q: houseCenter.q, r: houseCenter.r + (offset.r >= 0 ? 2 : -2) }
                    : { q: houseCenter.q + (offset.q >= 0 ? 2 : -2), r: houseCenter.r };
        const room = carveFlatRoom(houseCenter.q, houseCenter.r, 2, 2, doorHex, 'Wood Floor');
        if (isWestCorner) {
            // wallRingAroundFloor's own hex-adjacency math leaves a lone
            // wall hex jutting into this row (exactly where the old
            // south-facing door used to sit) even though the row on either
            // side of it is open floor — a stray notch, not a real wall.
            // Fold it into the interior instead.
            const strayWallHex = { q: houseCenter.q, r: houseCenter.r + 2 };
            window.setTerrainAt(strayWallHex.q, strayWallHex.r, 'Wood Floor');
            room.wallHexes = room.wallHexes.filter(h => !(h.q === strayWallHex.q && h.r === strayWallHex.r));
            room.floorHexes.push(strayWallHex);
        }
        window.interiorRegions.push(room);
        const floorKeys = new Set(room.floorHexes.map(h => `${h.q},${h.r}`));
        // A real hex line (cube-coordinate lerp + cube rounding, same
        // technique as Kragmoor's road connector) all the way from the
        // door to the ring, not 3 partial steps that used to stop short of
        // both endpoints. Never paints over the house's own interior floor —
        // a straight line from the door can clip a diagonal-adjacent floor
        // hex near the start before it's actually clear of the building.
        const x1 = doorHex.q, z1 = doorHex.r, y1 = -x1 - z1;
        const x2 = ringHex.q, z2 = ringHex.r, y2 = -x2 - z2;
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1));
        for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            let x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, z = z1 + (z2 - z1) * t;
            let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
            const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
            if (dx > dy && dx > dz) rx = -ry - rz;
            else if (dy > dz) ry = -rx - rz;
            else rz = -rx - ry;
            if (floorKeys.has(`${rx},${rz}`)) continue;
            window.setTerrainAt(rx, rz, 'Path');
        }
        window.campaign2SilverhartMiddleRingHouses.push(houseCenter);
    });
    // The SW middle-ring house's own wallRingAroundFloor computation
    // leaves a single true-adjacency gap right next to its door — a real
    // hole in the wall, not the abandoned/ruined look it might suggest.
    window.setTerrainAt(-32, -452, 'Wall');

    // --- City wall: a much bigger version of the palace's own curtain
    // wall (same Palisade Wall terrain — climbable with a ladder/skill,
    // never a fully-impassable barrier), radius 60, one gate aligned with
    // the south entrance road. ---
    const CITY_WALL_RADIUS = 60;
    const cityWallHexes = [];
    for (let q = -CITY_WALL_RADIUS; q <= CITY_WALL_RADIUS; q++) {
        for (let r = -CITY_WALL_RADIUS; r <= CITY_WALL_RADIUS; r++) {
            if (window.distance({ q: 0, r: 0 }, { q, r }) === CITY_WALL_RADIUS) {
                cityWallHexes.push({ q: throneCenter.q + q, r: throneCenter.r + r });
            }
        }
    }
    const cityGateHexes = [
        { q: throneCenter.q, r: throneCenter.r + CITY_WALL_RADIUS },
        { q: throneCenter.q - 1, r: throneCenter.r + CITY_WALL_RADIUS },
        { q: throneCenter.q - 2, r: throneCenter.r + CITY_WALL_RADIUS },
    ];
    const cityGateKeys = new Set(cityGateHexes.map(h => `${h.q},${h.r}`));
    cityWallHexes.forEach(h => {
        window.setTerrainAt(h.q, h.r, cityGateKeys.has(`${h.q},${h.r}`) ? 'Path' : 'Palisade Wall');
    });
    for (let r = throneCenter.r + MIDDLE_RING_RADIUS; r <= throneCenter.r + CITY_WALL_RADIUS; r++) window.setTerrainAt(throneCenter.q, r, 'Path');
    [{ q: throneCenter.q + 2, r: throneCenter.r + CITY_WALL_RADIUS - 2 }, { q: throneCenter.q - 4, r: throneCenter.r + CITY_WALL_RADIUS }].forEach(h => {
        window.setTerrainAt(h.q, h.r, 'Palisade Wall');
        window.tileObjects[`${h.q},${h.r}`] = { type: 'watchtower', lightRadius: 4 };
    });
    window.campaign2SilverhartCityWallRadius = CITY_WALL_RADIUS;
    window.campaign2SilverhartCityGateHex = cityGateHexes[1];

    // --- The Warrens: slums just outside the city wall, cheap ramshackle
    // housing — and, tucked behind them with no signage, the Thieves'
    // Guild. Placement/NPCs only this pass; quest content is a follow-up. ---
    const warrensRow = throneCenter.r + CITY_WALL_RADIUS + 6;
    for (let r = throneCenter.r + CITY_WALL_RADIUS; r <= warrensRow; r++) window.setTerrainAt(throneCenter.q, r, 'Path');
    for (let q = -6; q <= 6; q += 3) window.setTerrainAt(throneCenter.q + q, warrensRow, 'Path');

    [-6, -3, 3].forEach((dq, i) => {
        const shackCenter = { q: throneCenter.q + dq, r: warrensRow + (i % 2 === 0 ? -3 : 3) };
        const shackDoor = { q: shackCenter.q, r: shackCenter.r + (i % 2 === 0 ? 2 : -2) };
        window.interiorRegions.push(carveFlatRoom(shackCenter.q, shackCenter.r, 2, 2, shackDoor, 'Wood Floor'));
    });

    const thievesGuildCenter = { q: throneCenter.q + 6, r: warrensRow + 4 };
    const thievesGuildDoor = { q: thievesGuildCenter.q, r: thievesGuildCenter.r - 2 };
    window.interiorRegions.push(carveFlatRoom(thievesGuildCenter.q, thievesGuildCenter.r, 3, 2, thievesGuildDoor, 'Wood Floor'));
    window.campaign2ThievesGuildCenter = thievesGuildCenter;
    if (window.campaign2ThievesGuildFence) {
        window.entities.push(window.buildNPC({ ...window.campaign2ThievesGuildFence, hex: { q: thievesGuildCenter.q, r: thievesGuildCenter.r + 1 } }));
    }
    window.campaign2SilverhartWarrensCenter = { q: throneCenter.q, r: warrensRow };

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
    // gate becomes the Diplomatic Quarter proper — one row further in
    // (throneCenter.r+23, the palace curtain wall's own ring row) than the
    // original placement, per the player's request. That row sits on the
    // wall ring itself, painted solid Palisade Wall by the curtain-wall
    // loop earlier, so it needs opening to Path to host the arch.
    window.setTerrainAt(dqCenter, throneCenter.r + 23, 'Path');
    window.tileObjects[`${dqCenter},${throneCenter.r + 23}`] = { type: 'gate_arch' };
    window.campaign2DiplomaticGateCenter = { q: dqCenter, r: throneCenter.r + 23 };

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

    const corvaneCenter = { q: dqCenter + 8, r: embassyRow2R-3 };
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

    const ironbondOfficeCenter = { q: dqCenter - 7, r: officeRowL -2 };
    // halfW=3 below means the floor's own east edge sits at
    // ironbondOfficeCenter.q+2 — the real wall-ring column (one hex further
    // out, where the door actually needs to sit to open into the room) is
    // ironbondOfficeCenter.q+3, not +4 (a hex of open Path floating past
    // the wall with nothing behind it — the door graphic didn't actually
    // open anything).
    const ironbondOfficeDoor = { q: ironbondOfficeCenter.q + 3, r: ironbondOfficeCenter.r };
    const ironbondOfficeRegion = carveFlatRoom(ironbondOfficeCenter.q, ironbondOfficeCenter.r, 3, 2, ironbondOfficeDoor, 'Wood Floor');
    window.interiorRegions.push(ironbondOfficeRegion);
    // Bump the top-right corner out one more step along the same diagonal
    // the top wall already runs on, per the player's request: the old
    // corner (ironbondOfficeCenter.q+3, .r-3) opens into floor, and a new
    // wall corner goes up one hex further out (.q+4, .r-4). Building this
    // as a carvePolygonRoom quad instead (straight lines between just the
    // 4 corners) cut a straight diagonal across the room instead of
    // following the true zigzag hex-adjacency edge, shrinking the floor
    // enough to strand both the door and the envoy NPC outside it — hence
    // patching the existing carveFlatRoom shape by hand instead.
    const ironbondOldCorner = { q: ironbondOfficeCenter.q + 3, r: ironbondOfficeCenter.r - 3 };
    const ironbondNewCorner = { q: ironbondOfficeCenter.q + 4, r: ironbondOfficeCenter.r - 4 };
    window.setTerrainAt(ironbondOldCorner.q, ironbondOldCorner.r, 'Wood Floor');
    ironbondOfficeRegion.floorHexes.push(ironbondOldCorner);
    window.setTerrainAt(ironbondNewCorner.q, ironbondNewCorner.r, 'Wall');
    // Seal the old corner's two other true neighbors that aren't already
    // wall or interior floor, so opening it up doesn't leave a gap in the
    // wall ring anywhere but the new corner.
    window.getNeighbors(ironbondOldCorner.q, ironbondOldCorner.r).forEach(n => {
        if (n.q === ironbondNewCorner.q && n.r === ironbondNewCorner.r) return;
        if (ironbondOfficeRegion.floorHexes.some(h => h.q === n.q && h.r === n.r)) return;
        window.setTerrainAt(n.q, n.r, 'Wall');
    });
    // Corridor runs along the door's own row (not officeRowL, the
    // building's SOUTH wall row) — officeRowL only equals
    // ironbondOfficeCenter.r+2, which is the wall directly south of the
    // building, and painting Path along it cut a second, unintended
    // opening straight through that wall.
    for (let q = ironbondOfficeDoor.q + 1; q < dqCenter; q++) window.setTerrainAt(q, ironbondOfficeDoor.r, 'Path');
    window.tileObjects[`${ironbondOfficeCenter.q},${ironbondOfficeCenter.r}`] = { type: 'table' };
    window.tileObjects[`${ironbondOfficeCenter.q + 1},${ironbondOfficeCenter.r}`] = { type: 'bench' };
    window.campaign2IronbondOfficeCenter = ironbondOfficeCenter;
    // A leftover wall stub between the Ironbond office and its eastern
    // neighbor, spanning (6,-452) to (10,-454) — never part of either
    // building's own floor, just a stray seam left standing where the two
    // wall rings met. Cleared to open ground per the player's request.
    for (let q = 6; q <= 10; q++) {
        for (let r = -454; r <= -452; r++) {
            if (window.getTerrainAt(q, r).name === 'Wall') window.setTerrainAt(q, r, 'Grass');
        }
    }

    // Shifted (-2,-5) from its original {q: dqCenter+8, r: officeRowR} per
    // the player's request — the hex that used to be at (14,-449) now
    // lands at (12,-454).
    const cathedralCenter = { q: dqCenter + 6, r: officeRowR - 5 };
    const cathedralDoor = { q: cathedralCenter.q - 4, r: cathedralCenter.r };
    window.interiorRegions.push(carveFlatRoom(cathedralCenter.q, cathedralCenter.r, 4, 4, cathedralDoor, 'Wood Floor'));
    for (let q = dqCenter + 1; q < cathedralDoor.q; q++) window.setTerrainAt(q, cathedralDoor.r, 'Path');
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
        window.setTerrainAt(recruiterHex.q, recruiterHex.r, 'Path');
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

    // Retrainer: sits near the Mercenary Recruiter (both are "spend gold to
    // reshape your party" services) and offers a full skill respec — see
    // resolveRespec (ui.js) and silverhart_retrainer (campaign2Dialogue.js).
    // Not placed at all under Iron Man Mode, per the player's request that
    // Iron Man remove the safety net entirely.
    if (window.campaign2Retrainer && !window.ironmanMode) {
        // Moved off her old spot next to the Mercenary Recruiter to clear
        // room for the relocated cathedral (see cathedralCenter above).
        const retrainerHex = { q: 9, r: -459 };
        window.setTerrainAt(retrainerHex.q, retrainerHex.r, 'Path');
        const retrainer = window.buildNPC({ ...window.campaign2Retrainer, hex: retrainerHex });
        retrainer.hairSizeMult = 0.2; // the default dwarf-female hair sprite reads absurdly oversized on her specifically
        window.entities.push(retrainer);
        window.campaign2RetrainerHex = retrainerHex;
    }

    // Re-stamp the middle ring road one last time, now that every building up
    // to and including the Diplomatic Quarter has been carved: an embassy
    // sitting close to radius 45 (the Corvane embassy/cathedral column in
    // particular) carves its own wall ring directly on top of a stretch of
    // the road, silently splitting it into two disconnected arcs. Path is
    // safe to reassert unconditionally here (unlike the city wall's
    // Palisade Wall ring, which must stay a wall except at its gate).
    for (let q = -MIDDLE_RING_RADIUS; q <= MIDDLE_RING_RADIUS; q++) {
        for (let r = -MIDDLE_RING_RADIUS; r <= MIDDLE_RING_RADIUS; r++) {
            if (window.distance({ q: 0, r: 0 }, { q, r }) === MIDDLE_RING_RADIUS) {
                window.setTerrainAt(throneCenter.q + q, throneCenter.r + r, 'Path');
            }
        }
    }

    setWorldMapMarker(throneCenter, { t: 'G', f: 'K', o: 'h', p: 3, n: 'Silverhart' });
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

// The wild unicorn itself: the druid doesn't hand it over, only points at
// the general area — it wanders a fixed loop deep in the wilderness
// southwest of the grove, and actually finding it means reading its tracks
// back to wherever it currently is (see the unicorn_track tileObjects
// below, and isUnicornTrackVisible/showUnicornTrackDetail in gameEngine.js,
// both scaled by Knowledge: Nature rank). Talking to it once found starts
// the final trust-trial (window.npcDialogueTrees.wild_unicorn,
// campaign2Dialogue.js).
function spawnWildUnicorn() {
    const grove = window.campaign2DruidGroveCenter;
    if (!grove) return;
    const valeCenter = { q: grove.q - 20, r: grove.r + 14 };
    const RADIUS = 12;
    const WAYPOINTS = 8;
    const path = [];
    for (let i = 0; i < WAYPOINTS; i++) {
        const angle = (i / WAYPOINTS) * Math.PI * 2;
        path.push(window.hexRound(
            valeCenter.q + Math.cos(angle) * RADIUS,
            valeCenter.r + Math.sin(angle) * RADIUS
        ));
    }
    window.campaign2UnicornPatrolPath = path;
    window.campaign2UnicornPathIndex = 0;

    const unicorn = window.createMonster('unicorn', path[0], null, null, 'neutral');
    unicorn.isNPC = true;
    unicorn.noAttack = true;
    unicorn.aiState = 'idle';
    unicorn.dialogueId = 'wild_unicorn';
    window.entities.push(unicorn);
    window.campaign2UnicornEntity = unicorn;

    // Fixed track markers along the loop — not a literal movement trail,
    // just deterministic waypoint-to-waypoint hexes, so visibility/detail
    // can be computed from Knowledge: Nature rank without needing to record
    // an actual movement history.
    const trackHexes = [];
    for (let i = 0; i < path.length; i++) {
        const from = path[i];
        const to = path[(i + 1) % path.length];
        const STEPS = 3;
        for (let s = 0; s < STEPS; s++) {
            const t = s / STEPS;
            trackHexes.push({
                hex: window.hexRound(from.q + (to.q - from.q) * t, from.r + (to.r - from.r) * t),
                dirQ: to.q - from.q, dirR: to.r - from.r, segmentIndex: i,
            });
        }
    }
    window.campaign2UnicornTrackHexes = trackHexes;
    trackHexes.forEach(t => {
        const key = `${t.hex.q},${t.hex.r}`;
        if (window.tileObjects[key]) return; // never overwrite existing content
        window.tileObjects[key] = { type: 'unicorn_track', dirQ: t.dirQ, dirR: t.dirR, segmentIndex: t.segmentIndex };
    });
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
    // Wren is a tavern regular tied to the Hollowmere shakedown scene — she
    // doesn't make sense for a goblin or orc start, both of which skip the
    // tavern (and that whole scripted scene) entirely in favor of their own
    // camp/stronghold.
    if (!(window.isPlayerGreenskin && window.isPlayerGreenskin()) && !window.party.some(p => p.name === 'Wren Talbot')) {
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
        companion.dialogueId = 'companion_wren_talbot'; // "Talk" button in the party tab (updatePartyTabs, ui.js) dispatches through talkToNPC
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
    // 3rd (the road's actual end). The goblin camp now sits between Reddale
    // (1st world-hex) and Northwatch (2nd) on this same east road, alongside
    // the orcs and toward Kragmoor's NE mountain range — moved off the west
    // road so the greenskins (goblins + orcs) cluster together on the same
    // side as the dwarves, per worldMap.js's NE mountain block.
    let northwatchTurnHex = null;
    let goblinCampWaypoint = null;
    const borderRoadEnd = paintRoad({ q: 1, r: 0 }, WORLD_HEX_SIZE * 3, 18, 0.35, (i, hex) => {
        if (i === Math.round(WORLD_HEX_SIZE * 1.5)) goblinCampWaypoint = hex;
        if (i === WORLD_HEX_SIZE * 2) northwatchTurnHex = hex;
    });
    // West: runs a full two world hexes — Emberlode (village + gold mine)
    // sits at the far end, the same "extend the road, add a stub
    // settlement at the new end" pattern used for Millbrook up north.
    const westRoadEnd = paintRoad({ q: -1, r: 0 }, WORLD_HEX_SIZE * 2, 18, 0.35, () => {});

    buildFarmstead(farmRoadEnd);
    buildGoblinCamp(goblinCampWaypoint);
    buildPlayerCottagePlot(CP);
    buildAbandonedHouse(abandonedHouseWaypoint);
    buildNecromancerCrypt();
    buildLichBarrow();
    buildMillbrook(millbrookWaypoint);
    buildDragonLair();
    buildLichChapterhouse();
    buildSilverhartPalace(northRoadEnd);
    buildEmberlode(westRoadEnd);
    buildReddale(eastRoadEnd);
    buildVampireGrave(westRoadEnd);
    buildDruidGrove(westRoadEnd);
    spawnWildUnicorn();
    buildNorthwatchFort(northwatchTurnHex);
    buildRidgeholdFort(borderRoadEnd);
    buildOrcStronghold(borderRoadEnd);
    // Kragmoor, the Deepholds' one city-and-mine: independent of the road
    // network above (a mountain kingdom isn't reached by the same roads
    // everyone else uses) — a large NE displacement from the crossroads,
    // landing squarely inside worldMap.js's reserved NE mountain block,
    // bordering (and slightly overlapping) orc territory — the dwarves and
    // the greenskins are meant to be neighbors here, not on opposite sides
    // of the map. Its own short surface approach (painted inside
    // buildDwarvenKingdom) is bridged into the rest of the road network by
    // connectAllRoadNetworks below, same as any other settlement's road.
    {
        const dwarfAnchor = { q: CP.q + 900, r: CP.r - 650 };
        buildDwarvenKingdom(dwarfAnchor);
        // A direct hand-painted connector, rather than relying on
        // connectAllRoadNetworks' nearest-pair heuristic below — Kragmoor
        // sits far enough out (500+/-650+ hexes) that the heuristic
        // sometimes can't find a straight connector that clears the
        // mountain massif itself. Runs straight from the crossroads to the
        // surface end of Kragmoor's own approach spur (18+3+12 hexes south
        // of the anchor — see buildDwarvenKingdom's gateCenter/gateDoor/stub
        // offsets), which sits safely outside the massif's own radius (25),
        // so this line never needs to cross solid Wall.
        const dwarfSpurTip = { q: dwarfAnchor.q, r: dwarfAnchor.r + 18 + 3 + 12 };
        // A proper hex line (cube-coordinate lerp + cube rounding, not a
        // naive independent q/r lerp — that produces a "dotted" line of
        // non-adjacent hexes, which is exactly what fragmented this into
        // hundreds of disconnected one-hex road-graph components the first
        // time around) so every consecutive hex is a real neighbor of the
        // last, guaranteeing one unbroken Path from the crossroads to
        // Kragmoor's own spur.
        const x1 = CP.q, z1 = CP.r, y1 = -x1 - z1;
        const x2 = dwarfSpurTip.q, z2 = dwarfSpurTip.r, y2 = -x2 - z2;
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            let x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, z = z1 + (z2 - z1) * t;
            let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
            const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
            if (dx > dy && dx > dz) rx = -ry - rz;
            else if (dy > dz) ry = -rx - rz;
            else rz = -rx - ry;
            window.setTerrainAt(rx, rz, 'Path');
        }
    }
    // Sil'thandriel, the Sylvan Court's capital: same "large fixed
    // displacement + hand-painted cube-line connector" shape as Kragmoor
    // above, landing inside worldMap.js's reserved southern forest belt
    // (FOREST_ROWS/FOREST_MAX_COL) rather than tied to any existing road —
    // south and modestly west of the crossroads, clear of the farmstead
    // and druid grove already out that way.
    {
        const elfAnchor = { q: CP.q - 260, r: CP.r + 910 };
        buildElvenCapital(elfAnchor);
        // Matches buildElvenCapital's own courtDoor (anchor.r-5) + approach
        // path length (CANOPY_RADIUS(18)+4) — the surface end of its own
        // north-facing approach stub, safely outside the canopy radius.
        const elfSpurTip = { q: elfAnchor.q, r: elfAnchor.r - 5 - (18 + 4) };
        const x1 = CP.q, z1 = CP.r, y1 = -x1 - z1;
        const x2 = elfSpurTip.q, z2 = elfSpurTip.r, y2 = -x2 - z2;
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            let x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, z = z1 + (z2 - z1) * t;
            let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
            const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
            if (dx > dy && dx > dz) rx = -ry - rz;
            else if (dy > dz) ry = -rx - rz;
            else rz = -rx - ry;
            window.setTerrainAt(rx, rz, 'Path');
        }
    }
    // The carvePolygonRoom verification build (a sheared-rectangle test
    // room at fixed absolute coordinates) has served its purpose — it
    // sliced across a Silverhart ring road and partially overlapped the
    // curtain wall painted above, since those are computed relative to
    // throneCenter and happened to sweep through the same coordinates.
    // Removed outright rather than patched, now that carvePolygonRoom
    // itself is proven (see tests/carve-polygon-room.spec.js's synthetic
    // coverage, which doesn't depend on this in-game instance).
    buildSideQuestContent();

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

    // A goblin player starts in Skarn-tooth's camp, and an orc player at
    // Skarnak's Hold, instead of the Hollowmere tavern — the whole tavern
    // shakedown scene (soldiers, Dray, Wren) is human-village-specific and
    // never makes sense to trigger for either. hollowmereEventFired is
    // forced true up front (belt-and-braces on top of skipping the
    // setTimeout below) so nothing can accidentally fire it later for a
    // party that never set foot in the tavern.
    const isGoblinStart = window.party[0]?.race === 'goblin';
    const isOrcStart = window.party[0]?.race === 'orc';
    window.hollowmereEventFired = isGoblinStart || isOrcStart;
    const startCamp = isGoblinStart ? window.campaign2GoblinCampCenter : isOrcStart ? window.campaign2OrcStrongholdCenter : null;
    if (startCamp) {
        window.entities.filter(e => e.side === 'player' && !e.rider).forEach((ent, i) => {
            const hex = { q: startCamp.q + (i % 3) - 1, r: startCamp.r + 4 + Math.floor(i / 3) };
            ent.hex = hex;
            ent.visualQ = hex.q; ent.visualR = hex.r;
            ent.startQ = hex.q; ent.startR = hex.r;
        });
        if (window.centerCameraOn) window.centerCameraOn(startCamp);
    }

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
    if (isGoblinStart || isOrcStart) return; // no tavern, no Wren, no shakedown — neither camp has a scripted opener of its own yet

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

// Toggles a door hex between open (walkable) and closed (blocks LOS/movement
// via the existing wall-terrain check — no new LOS logic needed).
// closedTerrain/openTerrain default to the original Wall/Wood Floor pair
// (indoor doors) but can be overridden per-door — an outdoor gate uses
// Palisade Wall/Path instead (see the Silverhart curtain-wall gate below).
function toggleDoor(q, r, opener) {
    const key = `${q},${r}`;
    const existing = window.tileObjects[key] || {};
    const closedTerrain = existing.closedTerrain || 'Wall';
    const openTerrain = existing.openTerrain || 'Wood Floor';
    const isOpen = window.getTerrainAt(q, r).name !== closedTerrain;
    // Reputation-gated checkpoints (the Silverhart palace gate/throne room/
    // bedroom doors — see buildSilverhartPalace) refuse entry outright below
    // a faction-standing threshold, regardless of who's opening it or where
    // from — these are guarded checkpoints, not a room's own interior lock.
    if (!isOpen && existing.accessThreshold) {
        const { faction, standing } = existing.accessThreshold;
        const met = (window.factions?.[faction]?.standing ?? -Infinity) >= standing;
        if (!met) {
            window.showMessage(existing.accessDeniedMessage || "You aren't welcome here yet.");
            return;
        }
    } else if (!isOpen && existing.locked && opener) {
        // Locked doors only yield to someone standing inside the building —
        // approximated as standing on the same indoor floor terrain the door
        // leads to, since buildings don't otherwise track a room boundary.
        const openerTerrain = window.getTerrainAt(opener.hex.q, opener.hex.r).name;
        if (openerTerrain !== 'Wood Floor' && openerTerrain !== 'Cave Floor') {
            window.showMessage("The door is locked.");
            return;
        }
    }
    const hp = existing.hp !== undefined ? existing.hp : 20;
    const maxHp = existing.maxHp !== undefined ? existing.maxHp : 20;
    const shared = { lightRadius: 0, locked: existing.locked || false, hp, maxHp, closedTerrain, openTerrain, accessThreshold: existing.accessThreshold, accessDeniedMessage: existing.accessDeniedMessage };
    if (isOpen) {
        window.setTerrainAt(q, r, closedTerrain);
        window.tileObjects[key] = { type: 'door_closed', ...shared };
    } else {
        window.setTerrainAt(q, r, openTerrain);
        window.tileObjects[key] = { type: 'door_open', ...shared };
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
        const openTerrain = door.openTerrain || 'Wood Floor';
        window.setTerrainAt(q, r, openTerrain);
        window.tileObjects[key] = { type: 'door_open', lightRadius: 0, locked: false, broken: true, hp: 0, maxHp: door.maxHp, closedTerrain: door.closedTerrain, openTerrain };
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

    setWorldMapMarker(center, { t: 'G', f: 'V', o: 'h', p: 1, n: 'Emberlode' });
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
    if (window.campaign2IronbondMerchant) {
        window.entities.push(window.buildNPC({ ...window.campaign2IronbondMerchant, hex: { q: guildCenter.q + 1, r: guildCenter.r + 1 } }));
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
    setWorldMapMarker(roadEnd, { t: 'G', f: 'T', o: 'h', p: 1, n: 'Reddale' });
}

// Builds a regular hexagonal keep with a gap at each of its 6 corners
// (not mid-edge) rather than a single door — reuses the same
// hexDisk + wallRingAroundFloor pattern carveStarFort already uses. A hex
// disk's own corners sit exactly at center + direction*(radius+1), the
// same 6 native directions carveStarFort already walks, so no new geometry
// math is needed to find them. Returns the same bbox shape carveFlatRoom/
// carveStarFort return, plus `gapHexes` (6 entries) since there's no
// single doorHex here.
function carveHexKeep(centerQ, centerR, radius, floorType, wallType) {
    const floorHexes = hexDisk(centerQ, centerR, radius);
    const wallHexes = wallRingAroundFloor(floorHexes);
    const gapHexes = STAR_FORT_DIRECTIONS.map(dir => ({ q: centerQ + dir.q * (radius + 1), r: centerR + dir.r * (radius + 1) }));
    wallHexes.forEach(h => window.setTerrainAt(h.q, h.r, wallType));
    floorHexes.forEach(h => window.setTerrainAt(h.q, h.r, floorType));
    gapHexes.forEach(h => window.setTerrainAt(h.q, h.r, floorType)); // knock the corner open

    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
    [...floorHexes, ...gapHexes].forEach(h => {
        minQ = Math.min(minQ, h.q); maxQ = Math.max(maxQ, h.q);
        minR = Math.min(minR, h.r); maxR = Math.max(maxR, h.r);
    });
    return {
        minQ, maxQ, minR, maxR, lightMult: 1.0,
        doorHex: gapHexes[0],
        gapHexes, floorHexes, wallHexes, floorType, center: { q: centerQ, r: centerR }
    };
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
    const center = { q: turnHex.q, r: turnHex.r - SPUR_LENGTH - 19 };
    // Roughly double the fort's original footprint (coreRadius 3->6,
    // pointLength 6->12, pointWidth 2->4) — the tip of a wedge now sits
    // ~coreRadius+pointLength = 18 hexes out, so gateHex (past the wall
    // ring) moves out proportionally too.
    const gateHex = { q: center.q, r: center.r + 19 }; // south point, facing the road

    const CORE_RADIUS = 6, POINT_LENGTH = 12;
    const fortRegion = carveStarFort(center.q, center.r, CORE_RADIUS, POINT_LENGTH, 4, gateHex, 'Wood Floor', 'Climbable Wall');
    window.interiorRegions.push(fortRegion);

    // A real, closable gate at the south point instead of just an
    // always-open gap in the wall — reuses the existing door system
    // (toggleDoor/attackDoor, campaign2World.js) rather than a bespoke
    // mechanic. Gated by standing with the crown, not a hard lock: any
    // player who hasn't actively turned the garrison hostile (the gate-
    // lever "unforgivable act", or the siege's own hostility flip) can
    // still open it to reach the commander — this represents a guard
    // waving a recognized, non-hostile visitor through, not a puzzle.
    window.setTerrainAt(gateHex.q, gateHex.r, 'Climbable Wall');
    window.tileObjects[`${gateHex.q},${gateHex.r}`] = {
        type: 'door_closed', lightRadius: 0, locked: false,
        hp: 40, maxHp: 40,
        closedTerrain: 'Climbable Wall', openTerrain: 'Wood Floor',
        accessThreshold: { faction: 'silverhart_kingdom', standing: -20 },
        accessDeniedMessage: "The gate guards won't open up for you.",
    };

    // Regular hexagon, gapped at each of its 6 corners rather than a single
    // door — an attacker who breaches the outer wall still has to fight
    // through one of 6 chokepoints to reach the keep interior, not walk
    // straight through one gate.
    const keepRegion = carveHexKeep(center.q, center.r, 4, 'Wood Floor', 'Keep Wall');
    window.interiorRegions.push(keepRegion);
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };

    window.campaign2NorthwatchCenter = center;
    window.campaign2NorthwatchFortRegion = fortRegion;
    window.campaign2NorthwatchGateHex = gateHex;
    window.campaign2NorthwatchKeepRegion = keepRegion;
    window.campaign2NorthwatchKeepGaps = keepRegion.gapHexes;

    // MOAT: an L-shaped river bend along the fort's north and east sides,
    // sitting just outside the wall ring's own reach (CORE_RADIUS+
    // POINT_LENGTH = 18, moat set at 22 so it never overlaps a wedge tip).
    // Ties into the world's main river (which ends its eastward run around
    // q=220,r=-25, see the village-scene stream-painting calls) via a
    // bending connector leg, then continues past the fort's east side so a
    // later fort further along the road (Ridgehold, buildRidgeholdFort)
    // can pick the same river back up — see campaign2NorthwatchMoatExit.
    const MOAT_RADIUS = 22, MOAT_WIDTH = 3;
    const moatNorthR = center.r - MOAT_RADIUS;
    const moatEastQ = center.q + MOAT_RADIUS;
    const connectorEnd = paintStreamSegment(220, center.q - MOAT_RADIUS, 1, -25, moatNorthR, 0.5);
    for (let q = connectorEnd.q; q <= moatEastQ; q++) {
        for (let w = 0; w < MOAT_WIDTH; w++) window.setTerrainAt(q, moatNorthR - w, 'Water');
    }
    for (let r = moatNorthR; r <= center.r + MOAT_RADIUS; r++) {
        for (let w = 0; w < MOAT_WIDTH; w++) window.setTerrainAt(moatEastQ + w, r, 'Water');
    }
    window.campaign2NorthwatchMoatExit = { q: moatEastQ, r: center.r + MOAT_RADIUS };

    // GREENSKIN CATAPULT: a genuine siege weapon (distinct from the ambient
    // "sally target" siege engine below), sitting east of the new moat —
    // 45 hexes past the wall's own farthest reach (CORE_RADIUS+POINT_LENGTH
    // = 18). Fires slow indirect shots at the wall as long as it's crewed
    // (isCatapult block, aiProcess), and can be destroyed either by
    // wearing itself out (10 shots) or by being fought down (hp + a flat
    // baseReduction, same mechanic armor uses). Spawned idle/inert — same
    // convention the ambient siege engine below already uses — so it does
    // nothing until something (a sim script, or a future quest trigger)
    // explicitly activates it; this pass only wires the mechanic and the
    // NPC-only sim, not a real dialogue trigger.
    const catapultHex = { q: center.q + CORE_RADIUS + POINT_LENGTH + 45, r: center.r };
    const catapult = window.createMonster('siege_engine', catapultHex, null, null, 'enemy');
    if (catapult) {
        catapult.name = 'Greenskin Catapult';
        catapult.isCatapult = true;
        catapult.isNPC = true;
        catapult.aiState = 'idle';
        catapult.noAttack = true;
        catapult.hp = 80; catapult.maxHp = 80;
        catapult.baseReduction = 6;
        catapult.firesRemaining = 10;
        catapult.factionTag = 'greenskin_assault';
        catapult.canLoot = false;
        window.entities.push(catapult);
        window.campaign2NorthwatchCatapult = catapult;
        window.catapultHasFired = false;
        window.greenskinAssaultTriggered = false;
        window.greenskinWaveSpawned = false;

        const crewSpots = window.getNeighbors(catapultHex.q, catapultHex.r);
        // 3 goblin crew: hold near the catapult, flee the instant it's
        // gone — worn out or destroyed, doesn't matter which (isCatapultCrew
        // block, aiProcess).
        for (let i = 0; i < 3 && crewSpots[i]; i++) {
            const goblin = window.createMonster('goblin', crewSpots[i], null, null, 'enemy');
            if (!goblin) continue;
            goblin.name = `Catapult Crew ${i + 1}`;
            goblin.isCatapultCrew = true;
            goblin.aiState = 'idle';
            // Same wander-by-default gap as the orc guards below — a
            // wandering crew member also breaks fireCatapultShot's crew
            // adjacency check, silencing the catapult entirely.
            goblin.behaviorType = 'stationary';
            goblin.factionTag = 'greenskin_assault';
            goblin._fleeHex = { q: catapultHex.q + 30, r: catapultHex.r };
            goblin.combatDirective = {
                hostileTo: 'neutral',
                passiveUnlessThreatened: true,
                threatRadius: 3,
            };
            window.entities.push(goblin);
        }
        // 2 orc guards: normal (random savage) equipment, defend the
        // catapult, then simply fold into the general hold/assault
        // posture below like every other greenskin once it's gone — no
        // bespoke flee logic, they're combat troops, not crew.
        for (let i = 0; i < 2 && crewSpots[i + 3]; i++) {
            const orc = window.createMonster('orc', crewSpots[i + 3], null, null, 'enemy');
            if (!orc) continue;
            orc.name = `Catapult Guard ${i + 1}`;
            orc.aiState = 'idle';
            // Without an explicit behaviorType, createMonster defaults to
            // 'wander' — since 'enemy'-side entities are always fully
            // simulated (never dormant, unlike ambient neutral NPCs, see
            // ACTIVE_SIM_RADIUS in gameEngine.js), an idle catapult guard
            // would wander unboundedly over real time and could drift
            // straight through the fort's gate onto an inner wall tile.
            // 'stationary' keeps it planted at its post until something
            // actually gives it a reason to move (holdPosition's own logic
            // below, or real combat).
            orc.behaviorType = 'stationary';
            orc.factionTag = 'greenskin_assault';
            orc.combatDirective = {
                hostileTo: 'neutral',
                holdPosition: true,
                homeHex: { ...catapultHex },
                holdRadius: 15,
            };
            window.entities.push(orc);
        }
    }

    // No standing knight squad — that role is the PLAYER's, not NPCs'.
    // The sally-the-catapult option (border_war quest, once wired up)
    // starts the player at this same hidden staging hex the knights used
    // to occupy: far enough south that the besieging force never has
    // eyes on it until the player actually moves. Kept as a plain marker
    // hex, not an entity, so there's nothing here to simulate or hold
    // dormant/active state for.
    window.campaign2NorthwatchHiddenStagingHex = { q: center.q, r: center.r + 60 };

    // Garrison: patrol the wall ring out of combat (behaviorType 'patrol'
    // over the fort's own wallHexes, same mechanism as any other patrol
    // NPC). In combat, combatDirective (gameEngine.js — see the "Layered
    // combat AI" plan) gives them real orders instead of the plain generic
    // AI: never leave the fort, prioritize whoever's threatening the gate,
    // then whoever's already inside the walls, and fall back toward the
    // keep once the walls are overrun rather than fighting to the last man
    // at the point of breach.
    const fortInterior = new Set([...fortRegion.floorHexes, ...fortRegion.wallHexes].map(h => `${h.q},${h.r}`));
    // Scaled to the fort's actual footprint rather than left as a flat
    // count: a fixed "5 hostiles anywhere inside" fit the original,
    // smaller fort, but on the doubled footprint (interior area grows
    // roughly with radius^2) that same count is reached almost instantly
    // by a handful of scattered attackers, sending the entire garrison
    // sprinting for the keep at once — over a much longer retreat
    // distance — instead of only once the walls are genuinely overrun.
    // ~1.5% of the interior footprint keeps the same "walls are actually
    // breached" feel at any fort size.
    const RETREAT_TRIGGER_COUNT = Math.max(10, Math.round(fortInterior.size * 0.015));
    window.campaign2NorthwatchRetreatTriggerCount = RETREAT_TRIGGER_COUNT; // exposed for testability
    // A FIXED, NON-RANDOM 31-DEFENDER ROSTER — replaces the old cycling-
    // named-spec assignment (which left equipment effectively randomized
    // per post depending on which of the 6 named specs' own gear a given
    // tactical slot happened to land on). Every post in a given ROLE now
    // gets the exact same, deterministic loadout; only the name (cycled
    // through the same 6 named characters, in the same fixed order every
    // time) varies for flavor. Roles, by post:
    //   1  commander            — center, bow + sword/shield (unchanged)
    //   6  hexagon-point archers  — standing right in the keep's own 6 gap
    //      hexes (not one hex back), bow + dagger backup
    //  12  wide-tip archers      — 2 per wedge tip, flanking its center
    //      line, bow + dagger backup
    //   6  true-corner archers   — one per wedge-to-wedge outer boundary,
    //      bow + sword/shield backup
    //   6  notch swordsmen       — the 6 concave notches (closest the wall
    //      gets to the keep), sword/shield, no bow
    // 1+6+12+6+6 = 31.
    const nearestWallHex = (target) => fortRegion.wallHexes.reduce(
        (best, h) => window.distance(h, target) < window.distance(best, target) ? h : best, fortRegion.wallHexes[0]);
    const NAME_POOL = [
        { name: 'Halric', gender: 'male' }, { name: 'Wenna', gender: 'female' }, { name: 'Dunstan', gender: 'male' },
        { name: 'Ysolt', gender: 'female' }, { name: 'Bram', gender: 'male' }, { name: 'Cadha', gender: 'female' },
    ];
    const ARCHER_DAGGER_LOADOUT = {
        classLevels: ['fighter', 'fighter', 'fighter'],
        skillPicks: ['health', 'health', 'health', 'bow_hit', 'bow_hit', 'bow_dmg', 'bow_dmg', 'light_armor_training'],
        equipment: ['dagger', 'bow', 'light_armor'],
    };
    const ARCHER_SWORDSHIELD_LOADOUT = {
        classLevels: ['fighter', 'fighter', 'fighter'],
        skillPicks: ['health', 'health', 'health', 'bow_hit', 'bow_dmg', 'sword_hit', 'sword_dmg', 'shield_proficiency', 'light_armor_training'],
        equipment: ['sword', 'wooden_shield', 'bow', 'light_armor'],
    };
    const SWORDSMAN_LOADOUT = {
        classLevels: ['fighter', 'fighter', 'fighter'],
        skillPicks: ['health', 'health', 'health', 'sword_hit', 'sword_hit', 'sword_dmg', 'sword_dmg', 'shield_proficiency', 'light_armor_training'],
        equipment: ['sword', 'wooden_shield', 'light_armor'],
    };
    let nameIdx = 0;
    function nextDefender(roleLabel, roleIdx, loadout, postHex) {
        const person = NAME_POOL[nameIdx % NAME_POOL.length]; nameIdx++;
        const defender = window.buildNPC({
            name: person.name, title: 'Border Soldier', race: 'human', gender: person.gender,
            side: 'neutral', factionId: 'silverhart_kingdom', color: '#5a5a6a',
            hex: { q: postHex.q, r: postHex.r }, ...loadout,
        });
        defender.name = `${person.name} (${roleLabel} ${roleIdx + 1})`;
        defender.behaviorType = 'guard';
        defender.homeHex = { ...postHex };
        defender.factionTag = 'northwatch_human';
        return defender;
    }

    // LADDERS: one at each of the 6 notches — a wall defender ordered to
    // fall back (retreat_if_walls_overrun, below) has to get down off
    // Climbable Wall terrain first, and without a ladder that's real
    // climbing-down friction (see the extra TP cost on the retreat step,
    // gameEngine.js), same as climbing up already costs. A ladder at the
    // point closest to the keep gives the wall garrison a fast way down
    // right where they're already falling back toward, instead of forcing
    // every retreat through a slow climb.
    const notchWallHexes = [];
    STAR_FORT_DIRECTIONS.forEach((dir, i) => {
        const nextDir = STAR_FORT_DIRECTIONS[(i + 1) % 6];
        const notchTarget = {
            q: center.q + Math.round((dir.q + nextDir.q) / 2 * (CORE_RADIUS + 1)),
            r: center.r + Math.round((dir.r + nextDir.r) / 2 * (CORE_RADIUS + 1)),
        };
        notchWallHexes.push(nearestWallHex(notchTarget));
    });
    notchWallHexes.forEach(wallHex => {
        const interiorHex = fortRegion.floorHexes.reduce(
            (best, h) => window.distance(h, wallHex) < window.distance(best, wallHex) ? h : best, fortRegion.floorHexes[0]);
        window.tileObjects[`${wallHex.q},${wallHex.r}`] = { type: 'ladder', interiorHex: { ...interiorHex } };
    });
    window.campaign2NorthwatchLadderHexes = notchWallHexes.map(h => ({ ...h }));

    // WEDGE-TIP posts: 2 wide-tip archers flanking each tip's own center
    // line, plus 1 true-corner archer where this wedge's outer flank meets
    // the next wedge's (the outer-radius mirror of the notch calculation
    // above, which is the inner-radius version of the same "where the wall's
    // direction changes" idea).
    const wideTipPosts = [];
    const trueCornerPosts = [];
    STAR_FORT_DIRECTIONS.forEach((dir, i) => {
        const tipCenter = { q: center.q + dir.q * (CORE_RADIUS + POINT_LENGTH), r: center.r + dir.r * (CORE_RADIUS + POINT_LENGTH) };
        const lateralA = STAR_FORT_DIRECTIONS[(i + 2) % 6];
        const lateralB = STAR_FORT_DIRECTIONS[(i + 4) % 6];
        wideTipPosts.push(nearestWallHex({ q: tipCenter.q + lateralA.q * 2, r: tipCenter.r + lateralA.r * 2 }));
        wideTipPosts.push(nearestWallHex({ q: tipCenter.q + lateralB.q * 2, r: tipCenter.r + lateralB.r * 2 }));

        const nextDir = STAR_FORT_DIRECTIONS[(i + 1) % 6];
        const outerCornerTarget = {
            q: center.q + Math.round((dir.q + nextDir.q) / 2 * (CORE_RADIUS + POINT_LENGTH)),
            r: center.r + Math.round((dir.r + nextDir.r) / 2 * (CORE_RADIUS + POINT_LENGTH)),
        };
        trueCornerPosts.push(nearestWallHex(outerCornerTarget));
    });

    // HEXAGON-POINT ARCHERS: standing right in the keep's own 6 gap hexes
    // (carveHexKeep's gapHexes, radius+1 — the opening itself, not one hex
    // back from it). Ordered "don't move unless an enemy is adjacent" over
    // the usual gate/interior priorities: they hold the gap, and only fall
    // back to the hexagon's center once melee is actually on top of them.
    //
    // Verified directly (a Playwright-driven audit, not assumed): with
    // lightLevel forced to full daylight, every one of these posts has a
    // clear, unbroken sightline 10+ hexes straight down its own point —
    // comfortably past the gap and well into the star's open core, more
    // than enough to cover anyone approaching the keep. The only thing a
    // post can't see past is its own wedge's own outer wall, which is
    // correct — that's the wall doing its job, not a placement bug.
    const keepFloorInterior = new Set(keepRegion.floorHexes.map(h => `${h.q},${h.r}`));
    const keepFloorAndGaps = new Set([...keepRegion.floorHexes, ...keepRegion.gapHexes].map(h => `${h.q},${h.r}`));
    const hexagonArchers = [];
    STAR_FORT_DIRECTIONS.forEach((dir, i) => {
        const postHex = keepRegion.gapHexes[i];
        const archer = nextDefender('Point Archer', i, ARCHER_DAGGER_LOADOUT, postHex);
        archer.isHexagonArcher = true; // commander's fallen-archer reposition trigger (below) keys off this
        archer.skills = archer.skills || {};
        archer.skills.bow_cover = 1; // cover_fire (gameEngine.js) — free use the instant the wall garrison falls back
        archer.combatDirective = {
            hostileTo: 'enemy',
            outnumberWeight: 2,
            constraints: { stayWithinHexes: keepFloorAndGaps },
            priorities: [{ type: 'nearHex', hex: postHex, radius: 0 }, { type: 'insideRegion', hexes: keepFloorAndGaps }],
            retreatTo: { q: center.q, r: center.r },
            contingencies: [{
                id: 'fall_back_to_hexagon_center',
                when: (e) => window.entities.some(o => o.alive && o.side === 'enemy' && window.distance(e.hex, o.hex) <= 1),
            }],
        };
        window.entities.push(archer);
        hexagonArchers.push(archer);
    });

    // The remaining 24 wall-ring defenders (12 wide-tip archers + 6 true-
    // corner archers + 6 notch swordsmen) all share the same standing
    // orders: hold post, prioritize the gate, and fall back once the walls
    // are overrun — collected here so the melee-triangle formation below
    // can reassign each of their retreat points individually.
    const wallDefenders = [];
    const wallHexesOnly = new Set(fortRegion.wallHexes.map(h => `${h.q},${h.r}`));
    function addWallRingDefender(roleLabel, roleIdx, loadout, postHex) {
        const defender = nextDefender(roleLabel, roleIdx, loadout, postHex);
        defender.combatDirective = {
            hostileTo: 'enemy',
            outnumberWeight: 2,
            constraints: { stayWithinHexes: fortInterior },
            // HOLD GROUND + PREFER WALLS: until the wall is genuinely
            // overrun (retreat_if_walls_overrun below), a wall-ring
            // defender won't step off the wall ring itself — not outward
            // over the wall, and not inward onto the floor either — even
            // to chase a target that isn't in range yet. The wall gives
            // them a defensive + vision advantage, and climbing back down
            // later is real friction (climbDownCost above), so leaving it
            // early is a bad trade the AI shouldn't make on its own.
            holdGround: wallHexesOnly,
            preferWalls: true,
            priorities: [{ type: 'nearHex', hex: gateHex, radius: 3 }, { type: 'insideRegion', hexes: fortInterior }],
            canReinforce: true,
            retreatTo: { q: center.q, r: center.r }, // reassigned below, once the melee-triangle slots exist
            contingencies: [{
                id: 'retreat_if_walls_overrun',
                // Two conditions, both required: at least RETREAT_TRIGGER_COUNT
                // enemies have actually made it inside the walls (not just a
                // handful of scouts), AND they outnumber the defenders still
                // fighting inside — late enough that the outer wall has
                // certainly fallen, but before the defenders are so
                // outnumbered they can't fight their way clear to the keep.
                when: () => {
                    const enemiesInside = window.entities.filter(e => e.alive && e.side === 'enemy' && fortInterior.has(`${e.hex.q},${e.hex.r}`)).length;
                    if (enemiesInside < RETREAT_TRIGGER_COUNT) return false;
                    const defendersInside = window.entities.filter(e => e.alive && e.factionTag === 'northwatch_human' && fortInterior.has(`${e.hex.q},${e.hex.r}`)).length;
                    return enemiesInside > defendersInside;
                },
            }],
        };
        window.entities.push(defender);
        wallDefenders.push(defender);
    }
    wideTipPosts.forEach((postHex, i) => addWallRingDefender('Tip Archer', i, ARCHER_DAGGER_LOADOUT, postHex));
    trueCornerPosts.forEach((postHex, i) => addWallRingDefender('Flank Archer', i, ARCHER_SWORDSHIELD_LOADOUT, postHex));
    notchWallHexes.forEach((postHex, i) => addWallRingDefender('Notch Guard', i, SWORDSMAN_LOADOUT, postHex));

    // MELEE TRIANGLE FORMATION: each hexagon-point archer gets 3 melee
    // posts 2 hexes away (inward, and inward-rotated ±60° — the same
    // lateral-direction convention the corner-notch math above already
    // uses), instead of every retreating wall soldier converging on one
    // shared hexagon-center point. Anyone who breaches a gap and reaches
    // the archer now has 3 melee defenders within a single move of them —
    // a real 3-on-1 pincer at the point of breach, not the 1-on-1 a flat
    // "everyone retreats to the same hex" produces. 6 points * 3 = 18
    // slots, assigned round-robin across the 24 wall-ring defenders above.
    const meleeTriangleSlots = [];
    hexagonArchers.forEach((archer, i) => {
        const inward = STAR_FORT_DIRECTIONS[(i + 3) % 6];
        const lateralA = STAR_FORT_DIRECTIONS[(i + 2) % 6];
        const lateralB = STAR_FORT_DIRECTIONS[(i + 4) % 6];
        [inward, lateralA, lateralB].forEach(d => {
            meleeTriangleSlots.push({ q: archer.homeHex.q + d.q * 2, r: archer.homeHex.r + d.r * 2 });
        });
    });
    if (meleeTriangleSlots.length > 0) {
        wallDefenders.forEach((defender, i) => {
            const slot = meleeTriangleSlots[i % meleeTriangleSlots.length];
            defender.combatDirective.retreatTo = { q: slot.q, r: slot.r };
        });
    }

    if (window.campaign2NorthwatchCommander) {
        const commander = window.buildNPC({ ...window.campaign2NorthwatchCommander, hex: { q: center.q, r: center.r - 1 } });
        commander.factionTag = 'northwatch_human';
        commander.skills = commander.skills || {};
        commander.skills.bow_cover = 1; // cover_fire (gameEngine.js) — free use the instant the wall garrison falls back
        // Joins the fight but hangs back in the keep by default — she's a
        // commander, not a front-line soldier. Actually engages the moment
        // she's directly attacked or an enemy closes to within 3 hexes of
        // her (passiveUnlessThreatened, aiProcess), rather than either
        // never fighting at all (the old behavior — no combatDirective) or
        // wading into the walls uninvited like the rest of the garrison.
        // meleeTriggerHexes: read by the WEAPON SWITCHING block (aiProcess,
        // gameEngine.js) in addition to its usual "opponent within 1 hex of
        // me" check — she draws her sword the moment anyone's in melee
        // reach of the hexagon interior or any of the 6 archer posts, not
        // only once someone's literally standing next to her personally.
        const meleeTriggerHexes = new Set([...keepFloorInterior, ...hexagonArchers.map(a => `${a.homeHex.q},${a.homeHex.r}`)]);
        commander.combatDirective = {
            hostileTo: 'enemy',
            outnumberWeight: 2,
            constraints: { stayWithinHexes: fortInterior },
            passiveUnlessThreatened: true,
            threatRadius: 3,
            priorities: [{ type: 'insideRegion', hexes: fortInterior }],
            meleeTriggerHexes,
        };
        // FALLEN ARCHER POST: the instant the first of the 6 hexagon
        // archers dies, the commander abandons the passive keep-center
        // stance and moves to stand on that archer's own post (the body-
        // marker hex left behind, gameEngine.js's death-marker system),
        // firing her bow at anyone she can see from there. One-shot: only
        // the FIRST archer death triggers this (checked via a flag on the
        // commander herself so it survives independent of any other
        // per-entity state), matching "he will go stand on the corpse of
        // the first of those 6 archers to die."
        commander.takeFallenArcherPostOnce = true;
        window.entities.push(commander);
    }

    // Gate lever: the deliberate, guarded way to open the fort from the
    // inside during a siege. First pull is just a warning (a nearby guard
    // stops you); a second pull actually opens it AND is, on its own, one
    // of the "unforgivable acts" (see gameEngine.js's pullNorthwatchGateLever/
    // setFactionHostileToPlayer) that turns the whole garrison hostile —
    // there's no partial-suspicion state in between. No separate gate-guard
    // NPCs anymore — the fixed 31-defender roster above already covers the
    // approach to the gate (the nearest notch/flank posts), so the lever
    // itself just needs a marker, not its own guards.
    const leverHex = { q: gateHex.q, r: gateHex.r - 1 };
    window.tileObjects[`${leverHex.q},${leverHex.r}`] = { type: 'gate_lever' };
    window.campaign2NorthwatchGateLeverHex = leverHex;

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
    // Distance from center matters here beyond flavor: the wall's farthest
    // reach (coreRadius+pointLength) is now ~18 hexes, bow-armed wall
    // soldiers (campaign2FortSoldiers) have an attack range of 20
    // (equipment.js's bow, +2 more from firing off elevated wall terrain),
    // and startNorthwatchSally's escorts spread up to 3 hexes out from this
    // hex. Any closer than ~46 from center and the wall archers can snipe
    // the whole sally the instant it goes hostile, before the player's own
    // fight ever really starts — which is exactly why the sally always
    // resolved as an easy defender win. 46 clears the wall's max threat
    // radius (18 + 20 + 2 + 3 = 43) with margin to spare. (Scaled up from
    // the fort's original ~half-size footprint, same reasoning as before.)
    const siegeHex = { q: center.q, r: center.r - 46 };
    const siegeEngine = window.createMonster('siege_engine', siegeHex, null, null, 'neutral');
    if (siegeEngine) {
        siegeEngine.isSiegeEngine = true;
        siegeEngine.isNPC = true;
        siegeEngine.aiState = 'idle';
        siegeEngine.noAttack = true;
        window.entities.push(siegeEngine);
        window.campaign2NorthwatchSiegeEngine = siegeEngine;
    }

    // Oil barrels: a defender's ambush, not a trap the AI stands guard next
    // to — placed one hex past the gate lever's guards, inside the funnel an
    // attacker has to walk through after breaching the gate, well off the
    // sparse wall patrol loop. Nobody's posted beside them; the player (or,
    // symmetrically, an NPC ally) has to actually choose to firebolt one as
    // the enemy closes in.
    window.tileObjects[`${gateHex.q - 1},${gateHex.r - 4}`] = { type: 'oil_barrel' };
    window.tileObjects[`${gateHex.q + 1},${gateHex.r - 4}`] = { type: 'oil_barrel' };

    setWorldMapMarker(center, { t: 'H', f: 'F', o: 'h', p: 1, n: 'Northwatch Fort (Under Siege)' });
}

// Ridgehold Fort: populated and patrol-behaviored like Northwatch, but not
// (yet) under siege — the reserve front, contrasting with Northwatch's
// active one. Same star-fort + keep shape; no siege engine, no commander
// quest (that's Northwatch-specific for this pass — see TASKS.md-equivalent
// scoping note in the Border War plan about a second front being a
// follow-up, not this pass).
function buildRidgeholdFort(roadEnd) {
    if (!roadEnd) return;
    // Scaled up to match Northwatch's roughly-doubled footprint (coreRadius
    // 3->6, pointLength 6->12, pointWidth 2->4) for visual/tactical
    // consistency between the two star forts.
    const center = { q: roadEnd.q + 28, r: roadEnd.r + 20 };
    const gateHex = { q: center.q - 20, r: center.r - 8 }; // west-ish point, facing the road

    for (let q = roadEnd.q + 1; q < center.q - 16; q++) window.setTerrainAt(q, roadEnd.r + Math.round((q - roadEnd.q) * 20 / 28), 'Path');

    const fortRegion = carveStarFort(center.q, center.r, 6, 12, 4, gateHex, 'Wood Floor', 'Climbable Wall');
    window.interiorRegions.push(fortRegion);

    // keepDoor must sit ON the keep's own real wall row, not one hex past
    // it — halfH=2 below means the keep's floor stretches to center.r+1,
    // so the wall ring (and therefore the door) is at center.r+2. Placing
    // it any further out leaves a genuine, uncrossable Keep Wall hex
    // sitting between the door and the interior (same "door built past its
    // own wall" bug already fixed elsewhere for the throne room/rear door).
    const keepDoor = { q: center.q, r: center.r + 2 };
    const keepRegion = carveFlatRoom(center.q, center.r, 3, 2, keepDoor, 'Wood Floor', 'Keep Wall');
    window.interiorRegions.push(keepRegion);
    window.tileObjects[`${center.q},${center.r}`] = { type: 'fireplace', lightRadius: 6 };

    window.campaign2RidgeholdCenter = center;
    window.campaign2RidgeholdFortRegion = fortRegion;

    // Picks the river back up from Northwatch's moat (campaign2NorthwatchMoatExit,
    // buildNorthwatchFort) and continues it on past Ridgehold's far side, so
    // the two forts read as sitting along one continuous waterway rather
    // than Northwatch having an isolated, disconnected moat.
    if (window.campaign2NorthwatchMoatExit) {
        const exit = window.campaign2NorthwatchMoatExit;
        if (center.q > exit.q) {
            let toRidgehold = paintStreamSegment(exit.q, center.q - 24, 1, exit.r, center.r - 6, 0.5);
            paintStreamSegment(toRidgehold.q, toRidgehold.q + 60, 1, toRidgehold.r);
        }
    }

    const wallPatrolPath = fortRegion.wallHexes.filter((h, i) => i % 3 === 0);
    (window.campaign2FortSoldiers || []).forEach((spec, i) => {
        const postHex = wallPatrolPath[i % wallPatrolPath.length] || fortRegion.wallHexes[0];
        const soldier = window.buildNPC({ ...spec, hex: { q: postHex.q, r: postHex.r }, name: spec.name + ' (Ridgehold)' });
        soldier.behaviorType = 'patrol';
        soldier.patrolPath = wallPatrolPath;
        soldier.homeHex = { ...postHex };
        window.entities.push(soldier);
    });

    setWorldMapMarker(center, { t: 'H', f: 'F', o: 'h', p: 1, n: 'Ridgehold Fort' });
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

// Ironbond-arc endgame: 4 world-outcomes (see ironbondArc.js's
// checkIronbondArcEndgame) x 2 sides = the 8 scenarios. Both locations
// already exist (the throne room from buildSilverhartPalace, the guildhouse
// from buildReddale) — no new geography needed, just themed combatants and
// distinct narration/rewards per branch.
const IRONBOND_ARC_ENFORCER_SPECS = [
    { name: 'Company Blade', title: 'Ironbond Enforcer', race: 'human', gender: 'male', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'sword_hit', 'sword_dmg'], equipment: ['sword', 'medium_armor'], factionId: 'ironbond_company', color: '#8c4b4b', expValue: 200, gold: 15 },
    { name: 'Company Blade', title: 'Ironbond Enforcer', race: 'human', gender: 'female', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'axe_hit', 'axe_dmg'], equipment: ['axe', 'medium_armor', 'wooden_shield'], factionId: 'ironbond_company', color: '#8c4b4b', expValue: 200, gold: 15 },
    { name: 'Company Marksman', title: 'Ironbond Enforcer', race: 'human', gender: 'male', classLevels: ['fighter', 'rogue'], skillPicks: ['health', 'bow_hit', 'bow_dmg'], equipment: ['bow', 'light_armor'], factionId: 'ironbond_company', color: '#8c4b4b', expValue: 200, gold: 15 },
];

function spawnIronbondArcCombatants(specs, centerHex, side, count) {
    const spawned = [];
    for (let i = 0; i < count; i++) {
        const spec = specs[i % specs.length];
        const hex = { q: centerHex.q + (i % 3) - 1, r: centerHex.r + Math.floor(i / 3) + 1 };
        const npc = window.buildNPC({ ...spec, name: `${spec.name} ${i + 1}`, hex, side });
        npc.aiState = 'combat';
        npc.isIronbondArcCombatant = true;
        window.entities.push(npc);
        spawned.push(npc);
    }
    return spawned;
}

// Dispatches by (quadrant, playerSide) — the 8 scenarios. Teleports the
// party to the right location, spawns the right combatants on the right
// sides, and opens with a scene-setting dialogue. Resolution/rewards fire
// from checkCombatEnd (gameEngine.js) once every ironbondArcCombatant is
// dead — see resolveIronbondArcEndgame below.
function launchIronbondArcEndgame() {
    const arc = window.ironbondArc;
    const quadrant = arc.endgameQuadrant;
    const side = arc.playerSide;
    const throne = window.campaign2PalaceThroneCenter;
    const guildhouse = window.campaign2ReddaleGuildhouseCenter;

    const scenes = {
        // High surfacePower, low crownInfiltration: Ironbond is strong and
        // the crown never saw it coming — the coup happens at the throne room.
        coup: {
            crown: {
                location: throne, title: 'The Ironbond Coup',
                text: "Steel in the throne room! Ironbond's men are already inside — no warning, no time to muster the guard. Whatever happens here, happens now.",
                enemySide: 'ironbond', spawnCount: 5,
            },
            ironbond: {
                location: throne, title: 'The Ironbond Coup',
                text: "This is it — the Company's people are already through the gates, and the crown has no idea it's coming. Put the puppet on the throne while you still have the advantage.",
                enemySide: 'crown', spawnCount: 4,
            },
        },
        // High surfacePower, high crownInfiltration: the crown was warned in
        // time and strikes first at Ironbond's own headquarters.
        counter_raid: {
            crown: {
                location: guildhouse, title: 'The Counter-Raid',
                text: "Word reached the Queen in time — Ironbond was planning to move on the throne, but you're moving on them first, while they're still unprepared. Take the guildhouse.",
                enemySide: 'ironbond', spawnCount: 4,
            },
            ironbond: {
                location: guildhouse, title: 'The Counter-Raid',
                text: "The crown's people hit the guildhouse without warning — somehow they knew. You're caught flat-footed, but this is still your ground. Hold it.",
                enemySide: 'crown', spawnCount: 5,
            },
        },
        // Low surfacePower, low crownInfiltration: Ironbond's too weak to
        // act and the crown has no inside help — a real, unglamorous fight
        // to finish the job.
        hard_mopup: {
            crown: {
                location: guildhouse, title: 'The Hard Mop-Up',
                text: "No shortcuts here — no spy network to lean on, just the evidence and whatever muscle the Company has left to defend it. Take the guildhouse the old-fashioned way.",
                enemySide: 'ironbond', spawnCount: 3,
            },
            ironbond: {
                location: guildhouse, title: 'The Hard Mop-Up',
                text: "No warning came from inside — there was nothing inside to warn you. The crown's people are already at the door, grinding down what's left of the Company. Whatever you save today, you save with your own hands.",
                enemySide: 'crown', spawnCount: 3,
            },
        },
        // Low surfacePower, high crownInfiltration: the cleanest possible
        // resolution for the crown. For an Ironbond-sider this is the
        // worst starting position of all 8 — but per design, every
        // scenario needs a real (if long) shot at victory, not a scripted
        // loss. Two stages: hold the last stronghold the crown hasn't
        // already rolled up (a real defensive fight), then — only if that
        // holds — a hail-mary strike at the capital while the crown's
        // forces are still busy hunting down the rest of the Company.
        clean_sweep: {
            crown: {
                location: guildhouse, title: 'The Clean Sweep',
                text: "You barely need to lift a blade. Whatever quiet work you did for the crown fed a network already running the guildhouse from the inside — this is a formality more than a fight.",
                enemySide: 'ironbond', spawnCount: 2,
            },
            ironbond: {
                location: guildhouse, title: 'The Last Stronghold',
                text: "Every other Ironbond holding is falling, one after another, methodical and quiet — the crown's people were inside all along. This guildhouse is the last one standing. Hold it, rally who's left, and there's still one card to play: strike the capital now, while the crown's own forces are stretched thin finishing everyone else off.",
                enemySide: 'crown', spawnCount: 4,
                nextStage: {
                    location: throne, title: 'The Hail Mary',
                    text: "It's now or never. The throne's own guard is thinner than it's ever been — every spare soldier is out hunting the Company's last footholds. This won't come again.",
                    enemySide: 'crown', spawnCount: 3,
                },
            },
        },
    };

    const scene = scenes[quadrant]?.[side];
    if (!scene || !scene.location) return;

    const stage = arc.endgameStage || 1;
    const activeScene = (stage === 2 && scene.nextStage) ? scene.nextStage : scene;

    teleportPartyTo(activeScene.location);
    arc.activeEncounterSide = activeScene.enemySide;
    // Whichever faction the scene casts as the opposition, the spawned
    // combatants are always side:'enemy' from the player's perspective —
    // enemySide only picks their colors/equipment flavor.
    spawnIronbondArcCombatants(IRONBOND_ARC_ENFORCER_SPECS, activeScene.location, 'enemy', activeScene.spawnCount);

    window.showDialogue({ name: activeScene.title }, activeScene.text, [{ label: "Understood.", action: () => {} }]);
    window.showMessage(activeScene.text);
}
window.launchIronbondArcEndgame = launchIronbondArcEndgame;

// Called from checkCombatEnd once a stage's combatants are all dead — a
// two-stage branch (currently only clean_sweep/ironbond) advances to its
// second stage instead of resolving immediately; everything else resolves
// on the spot. Returns true if it advanced (caller should NOT also resolve).
function advanceIronbondArcEndgameStage() {
    const arc = window.ironbondArc;
    if (arc.endgameQuadrant === 'clean_sweep' && arc.playerSide === 'ironbond' && (arc.endgameStage || 1) === 1) {
        arc.endgameStage = 2;
        launchIronbondArcEndgame();
        return true;
    }
    return false;
}
window.advanceIronbondArcEndgameStage = advanceIronbondArcEndgameStage;

// Called from checkCombatEnd (gameEngine.js) once every ironbondArcCombatant
// is dead. Reward/reputation shape mirrors the quadrant's narrative: a clean
// win pays well and cheaply, a hard-fought one pays in relief rather than
// triumph, and Ironbond's two losing branches (hard_mopup, clean_sweep) are
// explicitly framed as damage control, not victory.
function resolveIronbondArcEndgame() {
    const arc = window.ironbondArc;
    const quadrant = arc.endgameQuadrant;
    const side = arc.playerSide;
    const player = window.party[0];

    const outcomes = {
        coup: {
            crown: { rep: 40, gold: 150, msg: "The coup is broken. The throne holds — barely — and everyone in the room knows how close it came.", res: 'crown_coup_defended' },
            ironbond: { rep: 40, gold: 300, msg: "The throne is yours to give. Ironbond's puppet takes the crown, and the kingdom answers to the Company now.", res: 'ironbond_coup_won' },
        },
        counter_raid: {
            crown: { rep: 35, gold: 200, msg: "The guildhouse falls before Ironbond ever launches its own move. A clean, decisive strike.", res: 'crown_raid_won' },
            ironbond: { rep: 30, gold: 100, msg: "You hold the guildhouse against the crown's surprise raid — bloodied, but the Company survives to plan its own move another day.", res: 'ironbond_raid_defended' },
        },
        hard_mopup: {
            crown: { rep: 25, gold: 80, msg: "The guildhouse falls, hex by hex, ledger by ledger. No cleverness to it — just the work, finished.", res: 'crown_mopup_won' },
            ironbond: { rep: 10, gold: 40, msg: "You save what you can. The Company survives, diminished — this was never going to be a victory, only damage control.", res: 'ironbond_mopup_survived' },
        },
        clean_sweep: {
            crown: { rep: 50, gold: 100, msg: "It's over almost before it starts. Whatever quiet work fed the network inside Ironbond, it did its job — this is barely a footnote.", res: 'crown_clean_sweep' },
            // Only reached after both stages (see advanceIronbondArcEndgameStage
            // above) — a real, earned reversal, not a guaranteed win.
            ironbond: { rep: 45, gold: 250, msg: "Against every expectation, it works. While the crown's forces were busy scouring the countryside for the last of the Company, you struck the undefended heart of it. Ironbond doesn't just survive today — it wins.", res: 'ironbond_hail_mary_won' },
        },
    };

    const outcome = outcomes[quadrant]?.[side];
    if (!outcome) return;

    arc.endgameResolution = outcome.res;
    if (side === 'crown' && window.factions?.silverhart_kingdom) {
        window.adjustReputation(window.factions.silverhart_kingdom, outcome.rep, 30);
    } else if (side === 'ironbond' && window.factions?.ironbond_company) {
        window.adjustReputation(window.factions.ironbond_company, outcome.rep, 30);
    }
    player.gold = (player.gold || 0) + outcome.gold;
    window.showMessage(`${outcome.msg} (+${outcome.gold} gold)`);
    window.questLog = window.questLog || [];
    window.questLog.push({ id: 'ironbond_arc_endgame', title: 'The Ironbond Rivalry', giver: null, status: 'complete', resolution: outcome.res, description: outcome.msg });
}
window.resolveIronbondArcEndgame = resolveIronbondArcEndgame;

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
window.cheatTeleportSilverhart = function() {
    if (!window.campaign2PalaceGateExteriorHex) { window.showMessage('Silverhart has not been built yet.'); return; }
    teleportPartyTo(window.campaign2PalaceGateExteriorHex);
    window.showMessage('Teleported to Silverhart.');
};

// Benchmarking/debug aid: marks every hex the world has ever painted
// (every settlement, road, fort, camp — anything in overrideTerrain) as
// permanently explored, so performance testing isn't confounded by
// fog-of-war reveal cost or first-time asset loads happening mid-measurement.
// Does not affect procedurally-generated wilderness between settlements
// (there's nothing there to "reveal" — it's default grass/forest noise
// either way), only the hand-built content this is meant to stress-test.
// Benchmarking/debug aid: grants max ranks of every skill to the main
// character via grantSkillRank (the same bypass-SP mechanism quest rewards
// already use), useful for load-testing anything gated behind skill checks
// without a long grind first.
window.cheatMaxAllSkills = function() {
    const player = window.party?.[0];
    if (!player || !window.skills) { window.showMessage('No character loaded.'); return; }
    let granted = 0;
    Object.keys(window.skills).forEach(key => {
        const skill = window.skills[key];
        const cap = skill.maxRanks > 0 ? skill.maxRanks : 5; // uncapped (maxRanks:0) skills get a reasonable finite ceiling here, not literally infinite
        while ((player.skills[key] || 0) < cap) {
            const before = player.skills[key] || 0;
            window.grantSkillRank(player, key);
            if ((player.skills[key] || 0) === before) break; // safety valve against any skill that can't actually be incremented
            granted++;
        }
    });
    if (window.showCharacter) window.showCharacter();
    window.showMessage(`Cheat: granted ${granted} skill ranks across every skill.`);
};

window.cheatExploreEverything = function() {
    if (!window.exploredHexes) window.exploredHexes = new Set();
    const keys = Object.keys(window.overrideTerrain);
    keys.forEach(key => window.exploredHexes.add(key));
    let unlocked = 0;
    Object.values(window.tileObjects || {}).forEach(obj => {
        if (obj && (obj.type === 'door_closed' || obj.type === 'door_open') && (obj.locked || obj.accessThreshold)) {
            obj.locked = false;
            delete obj.accessThreshold;
            unlocked++;
        }
    });
    if (window.drawMap) window.drawMap();
    window.showMessage(`Cheat: marked ${keys.length} hexes as explored, unlocked ${unlocked} doors.`);
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

function readDeepholdsMineLedger() {
    const quest = window.questLog && window.questLog.find(q => q.id === 'deepholds_infestation');
    if (quest && quest.status === 'completed') {
        window.showDialogue({ name: 'Ledger', customImage: 'journal' },
            "The last entries pick back up mid-sentence, same steady hand as before the gap: \"Tunnels clear. Back to the deep vein by first shift. Whoever cleared them out has the Deepholds' thanks, whether they know it or not.\""
        );
    } else {
        window.showDialogue({ name: 'Ledger', customImage: 'journal' },
            "Entries stop abruptly a few weeks back: \"Something's moved into the lower tunnels. Webbing on the third gallery, two crews haven't reported back. Foreman's sealed that level until it's dealt with.\""
        );
    }
}
window.readDeepholdsMineLedger = readDeepholdsMineLedger;

window.setupVillageScene = setupVillageScene;
window.toggleDoor = toggleDoor;
window.readSignpost = readSignpost;
window.readAbandonedHouseJournal = readAbandonedHouseJournal;
