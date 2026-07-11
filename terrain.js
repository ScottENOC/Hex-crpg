// terrain.js

const terrainTypes = {
    'grass': { name: 'Grass', color: '#90ee90', moveCostMult: 1, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    'forest': { name: 'Forest', color: '#228b22', moveCostMult: 1.5, hitBonus: -5, dodgeBonus: 10, stealthBonus: 30 },
    'mountain': { name: 'Mountain', color: '#8b8589', moveCostMult: 2, hitBonus: 10, dodgeBonus: 5, stealthBonus: 10 },
    'sand': { name: 'Sand', color: '#edc9af', moveCostMult: 1.5, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    'swamp': { name: 'Swamp', color: '#4f7942', moveCostMult: 2, hitBonus: -5, dodgeBonus: 0, stealthBonus: 30 },
    'water': { name: 'Water', color: '#4169e1', moveCostMult: 2, hitBonus: -10, dodgeBonus: -5, stealthBonus: -20 },
    // Genuinely impassable (unlike shallow 'water', which just slows you
    // down) — the sea itself, and the world map's ocean edge in particular.
    // Not literally 'Wall' so it never hits the hardcoded impassable-wall
    // checks, and its name is never added to isOpaqueWallName (hexMap.js)
    // so it doesn't block line of sight — you can see across open water,
    // you just can't walk (or wade) into it.
    'deep_water': { name: 'Deep Water', color: '#0d2b52', moveCostMult: 999, hitBonus: -10, dodgeBonus: -10, stealthBonus: -20, impassable: true },
    'wall': { name: 'Wall', color: '#696969', moveCostMult: 2, hitBonus: 5, dodgeBonus: 5, stealthBonus: 0, impassable: true },
    'cave_floor': { name: 'Cave Floor', color: '#3e3e3e', moveCostMult: 1, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    'wood_floor': { name: 'Wood Floor', color: '#8d5a2b', moveCostMult: 1, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    'path': { name: 'Path', color: '#c2a878', moveCostMult: 0.9, hitBonus: 0, dodgeBonus: 0, stealthBonus: -10 },
    'dirt': { name: 'Dirt', color: '#8a6d4a', moveCostMult: 1, hitBonus: 0, dodgeBonus: 0, stealthBonus: -15 },
    'pedestal': { name: 'Pedestal', color: '#888', moveCostMult: 2, hitBonus: 10, dodgeBonus: -5, stealthBonus: 0, blocksLOS: true, elevated: true },
    'foliage': { name: 'Foliage', color: '#2e7d32', moveCostMult: 1.5, hitBonus: -10, dodgeBonus: 15, stealthBonus: 40 },
    'rocky_outcrop': { name: 'Rocky Outcrop', color: '#8a7f6b', moveCostMult: 1.5, hitBonus: 5, dodgeBonus: 0, stealthBonus: 0 },
    // A third wall tier, between plain 'Wall' (fully impassable — used for
    // the palace's actual room walls) and a fence tileObject (barely an
    // inconvenience) — a real curtain wall you CAN scale, but only with a
    // ladder or real climbing skill (see getMoveCostMult in gameEngine.js
    // for the agile_climber/ladder-tileObject discount). Not literally
    // 'Wall' so it doesn't hit any of the hardcoded impassable-terrain
    // checks scattered through pathfinding/targeting.
    'palisade_wall': { name: 'Palisade Wall', color: '#5a4632', moveCostMult: 15, hitBonus: 10, dodgeBonus: -10, stealthBonus: -30, blocksLOS: true },
    // Border-fort rampart: a real curtain wall you CAN climb onto (costly,
    // via the same elevated/height-cost logic Pedestal already uses — see
    // getMoveCostMult/the height-transition block in gameEngine.js), not
    // impassable like plain Wall. Standing here gives ranged cover and
    // blocks melee against/from ground-level entities (see
    // isCoveredFromRangedAttack and the elevation-immunity check in
    // tryAttack, both keyed off elevated, gameEngine.js).
    // climbRisk marks this as the skill-augmentable "real climb" terrain:
    // countClimbingSkills/the TP-cost stacking in getMoveCostMult (gameEngine.js)
    // and the in-combat fall chance (playerMove) both key off this flag,
    // rather than hardcoding 'Climbable Wall' by name — a future wall tier
    // could opt into the same skill interaction just by setting it too.
    'climbable_wall': { name: 'Climbable Wall', color: '#7a6a52', moveCostMult: 3, hitBonus: 15, dodgeBonus: 10, stealthBonus: 0, elevated: true, climbRisk: true },
    // The inner keep's wall: genuinely impassable (can't be climbed at all)
    // and roofed (blocks LOS, see isOpaqueWallName in hexMap.js) — the one
    // wall type in the fort that a siege engine can actually break down
    // (see damageWall/siege_wall tileObject, gameEngine.js).
    'keep_wall': { name: 'Keep Wall', color: '#4a4a4a', moveCostMult: 999, hitBonus: 10, dodgeBonus: 0, stealthBonus: 0, impassable: true },
    // What a keep_wall hex becomes once a siege engine breaks it down — a
    // walkable breach, cosmetically distinct from untouched floor.
    'rubble': { name: 'Rubble', color: '#8a8378', moveCostMult: 1.5, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    // A chasm: genuinely impassable (like Wall) but does NOT block line of
    // sight or ranged attacks — the opposite of Wall's "blocks both"
    // profile. This falls out almost entirely from existing generic checks:
    // findPath already blocks movement on any terrain.impassable (hexMap.js),
    // and hasLineOfSight's isOpaqueWallName only special-cases the literal
    // names 'Wall'/'Keep Wall' — 'Void' is deliberately never added there,
    // so it's see-and-shoot-through by construction, no LOS code changes
    // needed. Used for the arena's bridge-over-void scenario.
    'void': { name: 'Void', color: '#0a0a14', moveCostMult: 999, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0, impassable: true },
    // Arena "periodic lava flood" scenario: passable terrain, not inherently
    // dangerous — the flood toggle (window.arenaScenario.flooded, tickArenaScenario
    // in gameEngine.js) is what actually deals damage to whoever's standing
    // on a Lava hex while it's active, the same shape poisonTicks already uses.
    'lava': { name: 'Lava', color: '#b33f1e', moveCostMult: 1, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    // High ground for the lava-flood scenario: elevated (real ranged-cover/
    // melee-block rules via the same 'elevated' flag Pedestal/Climbable Wall
    // already use) but, unlike Pedestal, doesn't block LOS and is never a
    // lava hex — the safe spot to retreat to when the floor floods.
    'high_ground': { name: 'High Ground', color: '#a99873', moveCostMult: 1.3, hitBonus: 10, dodgeBonus: 5, stealthBonus: 0, elevated: true },
};

window.mapItems = {}; // Key format: "q,r", Value: array of item IDs
window.exploredHexes = new Set(); // Stores "q,r" strings
window.overrideTerrain = {}; // Key format: "q,r", Value: terrain object
window.tileObjects = {}; // Key format: "q,r", Value: { type, lightRadius, etc }
window.indoorLightMult = 1.0; // Default to outdoor (100% time-of-day lighting)

// Deterministic Pseudo-Random Number Generator
function pseudoRandom(x, y) {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

function getBiomeAtWorldPos(col, row) {
    if (!window.worldMapData || !window.worldMapData[row] || !window.worldMapData[row][col]) {
        return 'W'; // Default to Ocean if out of bounds
    }
    return window.worldMapData[row][col].t;
}

// Convert Battle Hex (q,r) to World Hex (col,row)
// Uses a simplified square-ish mapping for robustness, preserving the "Giant Hex" feel via scale
function battleToWorld(q, r) {
    const scale = 400;
    const startWorldX = 220; // Matches playerWorldPos in worldMap.js
    const startWorldY = 200;
    
    // Simple rounding for "regions"
    // This effectively tiles the world map over the coordinate plane
    const dCol = Math.floor((q + (r/2)) / scale);
    const dRow = Math.floor(r / scale);

    return {
        col: startWorldX + dCol,
        row: startWorldY + dRow
    };
}

function setTerrainAt(q, r, typeName) {
    const key = `${q},${r}`;
    const typeKey = typeName.toLowerCase().replace(' ', '_');
    if (terrainTypes[typeKey]) {
        window.overrideTerrain[key] = terrainTypes[typeKey];
        // A door opening/closing (or any other real-time terrain mutation —
        // spell walls, siege damage) can flip whether a hex blocks line of
        // sight, which hasLineOfSight's cross-tick visibility cache
        // (hexMap.js) has no other way to detect — the fingerprint check it
        // runs on its own only covers party movement/lighting changes.
        if (window.invalidateVisibilityCache) window.invalidateVisibilityCache();
    }
}

// Snaps (q,r) to the nearest point on a hex lattice spaced `cellSize` apart
// (standard cube-coordinate rounding). Used below instead of independently
// flooring q and r into a grid — flooring axial coordinates carves rhomboid
// parallelogram cells (since axial space is sheared relative to the screen,
// same shear carveFlatRoom corrects for when building rooms), which is why
// the old rocky-outcrop/swamp regions read as awkward rhombi. Snapping to
// the nearest hex-lattice cell instead makes the noise-driven region/clump
// boundaries follow true hex adjacency, so patches read as natural blobs.
// Still fully deterministic — no Math.random(), no per-session seed.
function nearestHexCell(q, r, cellSize) {
    const fx = q / cellSize, fz = r / cellSize, fy = -fx - fz;
    let rx = Math.round(fx), ry = Math.round(fy), rz = Math.round(fz);
    const xDiff = Math.abs(rx - fx), yDiff = Math.abs(ry - fy), zDiff = Math.abs(rz - fz);
    if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
    else if (yDiff > zDiff) ry = -rx - rz;
    return { q: rx * cellSize, r: rz * cellSize };
}

function getTerrainAt(q, r) {
    // 0. Check overrides
    const key = `${q},${r}`;
    if (window.overrideTerrain[key]) return window.overrideTerrain[key];

    // ROGUELIKE: Campaign 1 has no open world at all — every hex the player
    // can ever see is either the arena lobby or a real fight map, and both
    // explicitly paint every tile they intend to be walkable via
    // setTerrainAt (checked above). Any hex reaching this point is one
    // neither of those explicitly carved — i.e. it's "void" outside the
    // intended play area — so the safe default is a solid Wall, not letting
    // it fall through to the overworld biome-noise generator below (which
    // can and did produce reachable Water at lobby/arena edges).
    if (window.currentCampaign === "1" || window.isInArena) return terrainTypes['wall'];

    // CAMPAIGN 2: hand-crafted village/roads/river (all setTerrainAt overrides,
    // checked above) sit inside a wider hand-crafted "safe" radius that's
    // flat grass on purpose. Past that, unpainted hexes get sparse procedural
    // forest/rocky-outcrop clumps instead of flat grass forever in every
    // direction — the same coarse-cell-noise clump trick as the village's own
    // isForestClump, just generalized so cross-country wilderness isn't
    // completely barren. Resource nodes (ore/fruit/herbs) are layered onto
    // qualifying terrain separately, lazily, as hexes are explored (see
    // ensureWildernessResourceNode in resources.js).
    if (window.currentCampaign === '2') {
        if (Math.abs(q) <= 32 && Math.abs(r) <= 32) return terrainTypes['grass'];

        // A coarser "region" layer (much bigger cells than the clump layer
        // below) picks a broad zone — mostly temperate, with occasional
        // swampy or sandy stretches — so terrain reads as actual regions of
        // the map rather than a fine-grained checkerboard of every type
        // scattered evenly everywhere.
        const regionSize = 25;
        const regionCell = nearestHexCell(q, r, regionSize);
        const regionNoise = pseudoRandom(regionCell.q * 9.1 + 41, regionCell.r * 6.7 + 23);
        const isSwampRegion = regionNoise > 0.85;
        const isSandRegion = regionNoise < 0.12;

        const cellSize = 5;
        const cell = nearestHexCell(q, r, cellSize);
        const cellNoise = pseudoRandom(cell.q * 3.1 + 7, cell.r * 4.3 + 13);
        const hexNoise = pseudoRandom(q * 1.3 + 4, r * 1.7 + 9);

        if (isSwampRegion) {
            if (cellNoise > 0.75) return terrainTypes['swamp'];
            if (cellNoise > 0.55 && hexNoise < 0.5) return terrainTypes['forest'];
            return terrainTypes['grass'];
        }
        if (isSandRegion) {
            if (cellNoise > 0.7) return terrainTypes['sand'];
            return terrainTypes['grass'];
        }
        if (cellNoise > 0.88) return terrainTypes['rocky_outcrop'];
        if (cellNoise > 0.55 && hexNoise < 0.5) return terrainTypes['forest'];
        return terrainTypes['grass'];
    }

    // 1. Determine World Biome
    const worldPos = battleToWorld(q, r);
    const biome = getBiomeAtWorldPos(worldPos.col, worldPos.row);

    if (!biome) return terrainTypes['grass']; // Fallback

    // 2. Generate Local Variation
    const noise = pseudoRandom(q, r);
    
    // Biome Logic
    if (biome === 'W') return terrainTypes['water'];
    if (biome === 'R') return terrainTypes['water']; // Rivers are water for now

    // Walls/Obstacles
    if (noise > 0.95) return terrainTypes['wall'];

    if (biome === 'F') {
        if (noise > 0.6) return terrainTypes['forest'];
        return terrainTypes['grass'];
    }
    if (biome === 'M') {
        if (noise > 0.7) return terrainTypes['mountain'];
        if (noise > 0.9) return terrainTypes['wall'];
        return terrainTypes['grass']; // Valleys
    }
    if (biome === 'D') return terrainTypes['sand'];
    if (biome === 'S') {
        if (noise > 0.7) return terrainTypes['swamp'];
        if (noise > 0.9) return terrainTypes['water']; // Pools
        return terrainTypes['grass'];
    }

    // Default Grasslands
    if (noise > 0.9) return terrainTypes['forest']; // Occasional tree
    return terrainTypes['grass'];
}

function isHexExplored(q, r) {
    return window.exploredHexes.has(`${q},${r}`);
}

window.terrainTypes = terrainTypes;
window.getTerrainAt = getTerrainAt;
window.setTerrainAt = setTerrainAt;
window.isHexExplored = isHexExplored;
window.battleToWorld = battleToWorld;
// generateTerrain is deprecated/removed
window.generateTerrain = () => {}; 
