// terrain.js

const terrainTypes = {
    'grass': { name: 'Grass', color: '#90ee90', moveCostMult: 1, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    'forest': { name: 'Forest', color: '#228b22', moveCostMult: 1.5, hitBonus: -5, dodgeBonus: 10, stealthBonus: 30 },
    'mountain': { name: 'Mountain', color: '#8b8589', moveCostMult: 2, hitBonus: 10, dodgeBonus: 5, stealthBonus: 10 },
    'sand': { name: 'Sand', color: '#edc9af', moveCostMult: 1.5, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 },
    'swamp': { name: 'Swamp', color: '#4f7942', moveCostMult: 2, hitBonus: -5, dodgeBonus: 0, stealthBonus: 30 },
    'water': { name: 'Water', color: '#4169e1', moveCostMult: 2, hitBonus: -10, dodgeBonus: -5, stealthBonus: -20 },
    'wall': { name: 'Wall', color: '#696969', moveCostMult: 2, hitBonus: 5, dodgeBonus: 5, stealthBonus: 0 },
    'cave_floor': { name: 'Cave Floor', color: '#3e3e3e', moveCostMult: 1, hitBonus: 0, dodgeBonus: 0, stealthBonus: 0 }
};

window.mapItems = {}; // Key format: "q,r", Value: array of item IDs
window.exploredHexes = new Set(); // Stores "q,r" strings
window.overrideTerrain = {}; // Key format: "q,r", Value: terrain object
window.tileObjects = {}; // Key format: "q,r", Value: { type, lightRadius, etc }

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
    }
}

function getTerrainAt(q, r) {
    // 0. Check overrides
    const key = `${q},${r}`;
    if (window.overrideTerrain[key]) return window.overrideTerrain[key];

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
window.isHexExplored = isHexExplored;
window.battleToWorld = battleToWorld;
// generateTerrain is deprecated/removed
window.generateTerrain = () => {}; 
