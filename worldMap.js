// worldMap.js

window.worldMapData = [];
window.worldMapWidth = 400;
window.worldMapHeight = 400;

// Camera state for world map
window.worldCameraX = 0;
window.worldCameraY = 0;
window.worldCameraZoom = 0.5;
window.playerWorldPos = { x: 220, y: 200 }; // Centered in Human Lands

let worldIsDragging = false;
let worldLastMouseX = 0;
let worldLastMouseY = 0;

const worldTerrainColors = {
    'W': '#005a9e', // Deep Ocean
    'G': '#2d8a2d', // Grass
    'F': '#1b5e20', // Forest
    'M': '#757575', // Mountain
    'H': '#a1887f', // Hills
    'D': '#e6be8a', // Desert
    'S': '#384d38', // Swamp
    'R': '#4fc3f7', // River
};

const factionColors = {
    'h': 'white',
    'e': '#00e676',
    'd': '#ffd600',
    'o': '#ff3d00',
    'g': '#d500f9',
    'n': '#ff9100'
};

function loadWorldMap() {
    if (!window.worldMapNotes) window.worldMapNotes = {};
    try {
        if (window.currentCampaign === "1") {
            window.worldMapData = [];
            window.worldMapWidth = 0;
            window.worldMapHeight = 0;
            return;
        }

        if (window.currentCampaign === "2") {
            // 16x16 rather than the original 12x12 so there's room for the
            // capital north of Millbrook, the orc-held east, and border forts
            // between them — without moving Hollowmere/Millbrook/Emberlode/
            // Reddale off the exact [row][col] indices campaign2World.js
            // already hardcodes when it paints them in later (row3/col6,
            // row6/col4, row6/col7).
            window.worldMapWidth = 16;
            window.worldMapHeight = 16;
            // Dwarven Kragmoor's mountain range sits in the NE corner now,
            // bordering the orc-held east rather than tucked away alone in
            // the NW — the two "greenskin-adjacent" territories (orc lands
            // and the dwarven mountains) deliberately overlap in the
            // north-east so Kragmoor reads as genuinely near the orcs, not
            // just on the same landmass. Ocean now runs along the WEST edge
            // instead of the east, so the human/orc/dwarf territories are
            // all inland and the greenskins (orc lands, east) are the
            // furthest thing from the coast.
            const MOUNTAIN_COLS = 4, MOUNTAIN_ROWS = 5; // NE corner block
            const OCEAN_COLS = 2; // westmost columns
            // Forest realm (the elves) along the SOUTH edge, spreading west
            // all the way to the ocean strip so the coastline is shared by
            // humans (west-center) and elves (south-west) rather than humans
            // alone. Kept clear of the human/orc border column (10+) so it
            // doesn't touch orc lands.
            const FOREST_ROWS = 4; // southmost rows
            const FOREST_MAX_COL = 9; // stops at the human/orc border column
            window.worldMapData = [];
            for (let y = 0; y < 16; y++) {
                const row = [];
                for (let x = 0; x < 16; x++) {
                    // Human Silverhart territory west of the border (col < 10),
                    // orc-held territory east of it (col >= 10). Sparse
                    // hills/mountains for flavor, using the same pseudoRandom
                    // hash the local terrain generators already use.
                    const isOrcLands = x >= 10;
                    const isOcean = x < OCEAN_COLS;
                    const isMountainRange = x >= 16 - MOUNTAIN_COLS && y < MOUNTAIN_ROWS;
                    const isForest = !isOcean && x <= FOREST_MAX_COL && y >= 16 - FOREST_ROWS;
                    let t = 'G';
                    const rough = window.pseudoRandom(x * 2.3 + 5, y * 1.7 + 3);
                    if (isOcean) t = 'W';
                    else if (isMountainRange) t = 'M';
                    else if (isForest) t = 'F';
                    else if (isOrcLands && rough > 0.8) t = 'M';
                    else if (isOrcLands && rough > 0.6) t = 'H';
                    // Ocean carries no faction color (unclaimed sea); the NE
                    // mountain block is Kragmoor's own territory ('d') even
                    // where it overlaps the orc-lands column range — that
                    // overlap is deliberate, see above. The southern forest
                    // belt is elven ('e') territory.
                    let o = isOcean ? '' : (isMountainRange ? 'd' : (isForest ? 'e' : (isOrcLands ? 'o' : 'h')));
                    // Trade 4 tiles each way along the dwarf/orc line so the
                    // border isn't one flat rectangle edge: the 4 northmost
                    // orc tiles (just east of the human border) flip to
                    // dwarven, which pulls Kragmoor's territory down to
                    // directly border the human lands too; the 4 southmost
                    // tiles of the mountain block trade back to the orcs to
                    // keep the overall split even.
                    if (x >= 10 && x <= 11 && y <= 1) o = 'd';
                    if (x >= 12 && x <= 15 && y === 4) o = 'o';
                    row.push({ t, f: '', o, p: 0, n: '' });
                }
                window.worldMapData.push(row);
            }
            // The elven capital, tucked into the forest belt near the coast —
            // this realm has no local-map content yet (unlike Kragmoor), so
            // it's placed directly here the same way Hollowmere is, rather
            // than derived from a local hex that doesn't exist.
            window.worldMapData[14][4] = { t: 'F', f: 'K', o: 'e', p: 2, n: "Sil'thandriel" };
            // Note: cell.f is the marker SHAPE ('K' capital/'C' city/'T' town/
            // 'V' village/'F' fort), cell.o is the faction-color code — see
            // drawWorldHex, which reads them this way.
            // Hollowmere sits at the local origin (the crossroads) by
            // definition, so this is the one marker that's genuinely fixed —
            // every other settlement/fort/camp marker is written later, once
            // its real local hex is known, via setWorldMapMarker
            // (campaign2World.js), which scales the real coordinate down by
            // WORLD_HEX_SIZE instead of a hand-picked grid cell. Doing it by
            // hand here was exactly the bug: Silverhart, the farm, and both
            // forts all ended up 1-6 cells off from where their local
            // coordinates actually place them.
            window.worldMapData[6][6] = { t: 'G', f: 'V', o: 'h', p: 1, n: 'Hollowmere' };

            // Matches the actual local stream (campaign2World.js's
            // paintStreamSegment calls: a strictly east-west line at r=-25,
            // spanning roughly q=-90..220) — that's just north of the
            // crossroads (CP.r=24), close enough to round to the same
            // WORLD_HEX_SIZE-scaled row as every settlement (row 6). Drawn
            // one row north (row 5) instead of exactly on row 6 so it reads
            // as a river next to the villages rather than a line running
            // straight through every settlement icon — still the correct
            // side (north) of the crossroads, just nudged off the settlement
            // row for legibility. Bends south toward row 6 for two columns
            // at the human/orc border crossing (unchanged — that border is
            // still at the same columns), then bends NORTH into the new NE
            // mountain range (its real source now that Kragmoor moved
            // there) instead of running flat into where the ocean used to
            // be. The west end already terminates right at x=0-1, which is
            // now the ocean strip — its mouth, unchanged.
            window.worldRiverPath = [
                { x: 0, y: 4 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 },
                { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }, { x: 9, y: 5 },
                { x: 10, y: 5 }, { x: 11, y: 6 }, { x: 12, y: 6 }, { x: 13, y: 5 }, { x: 14, y: 5 }, { x: 15, y: 4 }
            ];

            window.playerWorldPos = { x: 6, y: 6 };
            return;
        }

        // Campaign 3 (Default)
        const text = window.embeddedWorldMap || '';
        if (!text) {
            console.warn("embeddedWorldMap not found in window");
            return;
        }
        const rows = text.trim().split('\n');
        window.worldMapData = rows.map(row => row.split(',').map(cell => {
            const parts = cell.split(';');
            return { 
                t: parts[0], 
                f: parts[1], 
                o: parts[2], 
                p: parseInt(parts[3]) || 0, 
                n: parts[4] || '' 
            };
        }));
        console.log("World Map Loaded", window.worldMapWidth, "x", window.worldMapHeight);
    } catch (e) {
        console.error("Failed to load world map", e);
    }
}

function worldHexToPixel(q, r) {
  const size = 15; // Base hex size
  const x = (size * (3/2 * q)) * window.worldCameraZoom + window.worldCameraX;
  const y = (size * (Math.sqrt(3) * r + (q % 2 === 0 ? 0 : Math.sqrt(3)/2))) * window.worldCameraZoom + window.worldCameraY;
  return { x, y };
}

// Builds the legend from whichever faction codes actually appear on the
// currently-loaded map, instead of a static list of every faction the game
// will eventually have — this campaign's explored region is still just
// Hollowmere and unclaimed territory, so a full 6-faction legend read as a
// broken/unfinished map rather than "more content coming".
const factionLegendNames = { h: 'Human Lands', e: 'Elven Realm', d: 'Dwarven Kingdom', o: 'Orc Tribes', g: 'Goblin Hordes', n: 'Unclaimed Territory' };
function updateWorldMapLegend() {
    const legendEl = document.getElementById('world-map-legend');
    if (!legendEl || !window.worldMapData.length) return;
    const seen = new Set();
    for (const row of window.worldMapData) {
        for (const cell of row) {
            if (cell && cell.o) seen.add(cell.o);
        }
    }
    legendEl.innerHTML = Array.from(seen).map(code => {
        const color = factionColors[code] || 'white';
        const name = factionLegendNames[code] || code;
        return `<div><span style="display:inline-block; width:12px; height:12px; background:${color}; border-radius:50%; margin-right:5px;"></span>${name}</div>`;
    }).join('');
}
window.updateWorldMapLegend = updateWorldMapLegend;

// Odd-q offset hex neighbors, matching worldHexToPixel's layout (odd columns
// pushed down by half a hex height). Used only for the border-hex stroke
// below — approximate is fine for a stylized overview map, but this is the
// real adjacency table (redblobgames' odd-q offset directions), not a
// guess, so borders land on the correct edge of the correct hex.
const ODDQ_DIRECTIONS = [
    [[+1, 0], [+1, -1], [0, -1], [-1, -1], [-1, 0], [0, +1]], // even column
    [[+1, +1], [+1, 0], [0, -1], [-1, 0], [-1, +1], [0, +1]], // odd column
];
function getWorldNeighbors(x, y) {
    const dirs = ODDQ_DIRECTIONS[x % 2 === 0 ? 0 : 1];
    return dirs.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function renderWorldMap() {
    const canvas = document.getElementById("worldMapCanvas");
    const container = document.getElementById("world-map-container");
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    updateWorldMapLegend();

    // Render at native device pixel density so hex edges and text stay crisp
    // on high-DPI/Retina screens (iOS in particular) instead of the canvas's
    // low-res backing store getting upscaled by the browser. All drawing
    // below stays in CSS-pixel coordinates via the ctx.setTransform.
    const dpr = window.devicePixelRatio || 1;
    const cssW = container.clientWidth, cssH = container.clientHeight;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!window.worldMapInitialized && window.playerWorldPos) {
        centerOnPlayer();
        window.worldMapInitialized = true;
    }

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, cssW, cssH);

    const baseSize = 15;
    const zoomedSize = baseSize * window.worldCameraZoom;

    if (window.worldMapData.length > 0) {
        for (let y = 0; y < window.worldMapHeight; y++) {
            for (let x = 0; x < window.worldMapWidth; x++) {
                const cell = window.worldMapData[y][x];
                if (!cell) continue;

                const {x: px, y: py} = worldHexToPixel(x, y);

                if (px < -zoomedSize || px > cssW + zoomedSize || py < -zoomedSize || py > cssH + zoomedSize) continue;

                drawWorldHex(ctx, px, py, zoomedSize, cell, x, y);
            }
        }
    }

    // The river: a continuous thin blue line through the actual river cells,
    // drawn over the terrain fill so it reads clearly at any zoom level
    // instead of relying on single 'R' terrain hexes to carry the visual.
    if (window.worldRiverPath && window.worldRiverPath.length > 1) {
        ctx.beginPath();
        window.worldRiverPath.forEach((pt, i) => {
            const { x: px, y: py } = worldHexToPixel(pt.x, pt.y);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = Math.max(1.5, 3 * window.worldCameraZoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    if (window.playerWorldPos) {
        const {x: px, y: py} = worldHexToPixel(window.playerWorldPos.x, window.playerWorldPos.y);
        ctx.fillStyle = "#ffeb3b";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 6 * window.worldCameraZoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Fixed CSS-pixel font size (not scaled by zoom) so it stays crisp
        // and legible instead of shrinking into an unreadable, pixelated
        // smear at low zoom. Drawn BELOW the marker — the settlement name
        // (drawWorldHex) is drawn above its marker, so the two never overlap
        // even when the player is standing on a named hex.
        ctx.fillStyle = "white";
        ctx.font = `bold 11px Arial`;
        ctx.textAlign = "center";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 3;
        ctx.fillText("YOU", px, py + zoomedSize + 12);
        ctx.shadowBlur = 0;
    }
}

// Maps a named world-map cell to the real local hex it corresponds to, so
// "have I actually been there" can reuse the game's existing fog-of-war
// tracking (window.exploredHexes/isHexExplored) instead of inventing a
// second, parallel "visited" tracker. Forts have no built local counterpart
// (world-map abstractions only), so they're simply not in this table —
// isWorldCellVisited safely returns false for them, no indicator drawn.
const worldCellLocalHexLookup = {
    'Hollowmere': () => ({ q: 0, r: 0 }), // the tavern — always explored at game start
    'Millbrook': () => window.campaign2MillbrookCenter,
    'Silverhart': () => window.campaign2PalaceThroneCenter,
    'Reddale': () => window.campaign2ReddaleGuardhouseCenter,
    'Emberlode': () => window.campaign2EmberlodeCenter,
    "Old Mac's Farmstead": () => window.campaign2FarmHouseCenter,
};
function isWorldCellVisited(cell) {
    const getHex = cell.n && worldCellLocalHexLookup[cell.n];
    const hex = getHex && getHex();
    return !!(hex && window.isHexExplored && window.isHexExplored(hex.q, hex.r));
}

function drawWorldHex(ctx, x, y, size, cell, q, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i);
        const px = x + size * Math.cos(angle);
        const py = y + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = worldTerrainColors[cell.t] || '#000';
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.stroke();

    // Country border: stroke only the specific edge(s) that actually face a
    // different (or off-map) faction — not the hex's whole outline, which
    // would paint a solid colored ring around every border hex regardless
    // of which side(s) the border was actually on. Each side draws its own
    // line pulled slightly in from the shared edge toward its own hex
    // center, so a human/orc border shows as two parallel lines (white
    // just inside human territory, red just inside orc territory) instead
    // of one line that only one side's color can win. Map edges count as a
    // border too (there's no neighbor to compare against out there), so a
    // territory's outline stays contiguous all the way around instead of
    // stopping dead at the edge of the grid.
    if (cell.o) {
        const corners = [];
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i);
            corners.push({ x: x + size * Math.cos(angle), y: y + size * Math.sin(angle) });
        }
        const INSET = 0.12; // fraction of the way from the edge toward this hex's center
        const neighbors = getWorldNeighbors(q, r);
        const borderEdges = []; // { neighborX, neighborY } per bordering edge, or null neighbor for a map-edge border
        neighbors.forEach(n => {
            const row = window.worldMapData[n.y];
            const neighborCell = row && row[n.x];
            if (!neighborCell) {
                // Off the grid entirely — still a real border for this
                // territory, just with nothing on the other side to color.
                borderEdges.push({ n, offGrid: true });
            } else if (neighborCell.o && neighborCell.o !== cell.o) {
                borderEdges.push({ n, offGrid: false });
            }
        });
        if (borderEdges.length) {
            ctx.lineWidth = Math.max(1, 2 * window.worldCameraZoom);
            ctx.strokeStyle = factionColors[cell.o] || 'white';
            borderEdges.forEach(({ n, offGrid }) => {
                // Match each bordering neighbor to whichever hex edge (pair
                // of adjacent corners) actually faces it, by comparing the
                // neighbor's real screen-space direction against each edge
                // midpoint's direction from this hex's center — robust
                // against the offset-direction table's exact ordering,
                // since it's driven by real pixel geometry, not assumed
                // index alignment. Off-grid neighbors still have real (x,y)
                // coordinates one step past the border, so the same lookup
                // works for map-edge borders too.
                const { x: nx, y: ny } = worldHexToPixel(n.x, n.y);
                const toNeighborAngle = Math.atan2(ny - y, nx - x);
                let bestEdge = 0, bestDiff = Infinity;
                for (let i = 0; i < 6; i++) {
                    const mid = { x: (corners[i].x + corners[(i + 1) % 6].x) / 2, y: (corners[i].y + corners[(i + 1) % 6].y) / 2 };
                    const edgeAngle = Math.atan2(mid.y - y, mid.x - x);
                    let diff = Math.abs(edgeAngle - toNeighborAngle);
                    if (diff > Math.PI) diff = 2 * Math.PI - diff;
                    if (diff < bestDiff) { bestDiff = diff; bestEdge = i; }
                }
                const c1 = corners[bestEdge], c2 = corners[(bestEdge + 1) % 6];
                // Pull both endpoints slightly toward this hex's own center
                // (x,y) so the stroked line sits just inside this territory
                // rather than exactly on the shared edge.
                const p1 = { x: c1.x + (x - c1.x) * INSET, y: c1.y + (y - c1.y) * INSET };
                const p2 = { x: c2.x + (x - c2.x) * INSET, y: c2.y + (y - c2.y) * INSET };
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            });
        }
    }

    if (cell.f) {
        // 'S' (scout camp, e.g. Skarn-tooth): the tile's own faction color
        // (cell.o) reflects whose LAND it is, not who's camped on it — an
        // orc scouting party pitched on land that's still human territory —
        // so its marker is colored for the camp's actual occupants (orc
        // red) regardless of cell.o.
        const markerColor = cell.f === 'F' ? '#8d6e63' : (cell.f === 'S' ? (factionColors['o'] || 'white') : (factionColors[cell.o] || 'white'));
        let markerRadius;
        switch (cell.f) {
            case 'K': markerRadius = size * 0.45; break; // capital
            case 'C': markerRadius = size * 0.38; break; // city
            case 'T': markerRadius = size * 0.28; break; // town
            case 'F': markerRadius = size * 0.22; break; // fort
            case 'S': markerRadius = size * 0.16; break; // scout camp — smaller than even a village
            default:  markerRadius = size * 0.18; break; // village
        }

        if (cell.f === 'S') {
            // A small diamond, not a settlement dot or a fort square — reads
            // as a temporary contested outpost, not a real place.
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.moveTo(x, y - markerRadius);
            ctx.lineTo(x + markerRadius, y);
            ctx.lineTo(x, y + markerRadius);
            ctx.lineTo(x - markerRadius, y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (cell.f === 'F') {
            // Fort: a small square, not a settlement dot, so it reads as a
            // military waypoint rather than a place people actually live.
            ctx.fillStyle = markerColor;
            ctx.fillRect(x - markerRadius, y - markerRadius, markerRadius * 2, markerRadius * 2);
            ctx.strokeStyle = factionColors[cell.o] || 'black';
            ctx.lineWidth = Math.max(1, 1.5 * window.worldCameraZoom);
            ctx.strokeRect(x - markerRadius, y - markerRadius, markerRadius * 2, markerRadius * 2);
        } else {
            // Village/Town/City/Capital are all graduated dot sizes (see
            // markerRadius above) so scale alone communicates settlement
            // tier at a glance. The capital additionally gets a gold ring so
            // it's unmistakable even at a glance across a busy map.
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = cell.f === 'K' ? '#ffd700' : 'black';
            ctx.lineWidth = cell.f === 'K' ? Math.max(1.5, 2.5 * window.worldCameraZoom) : 1;
            ctx.stroke();
        }

        // Fixed CSS-pixel font size (not multiplied by zoom) for crisp,
        // legible labels at any zoom. Capitals/cities always show their
        // name; smaller settlements only once zoomed in enough to have room.
        const alwaysLabeled = cell.f === 'K' || cell.f === 'C';
        if (alwaysLabeled || window.worldCameraZoom > 1.2) {
            ctx.fillStyle = "white";
            const fontSize = cell.f === 'K' ? 13 : (cell.f === 'C' ? 11 : 9.5);
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = "center";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 3;
            ctx.fillText(cell.n, x, y - size - 4);
            ctx.shadowBlur = 0;
        }

        // A subtle ring around the marker for any named location the player
        // has actually set foot in (reuses the existing fog-of-war explored
        // set — not a new "visited" tracker) — deliberately quiet (thin,
        // translucent) so it reads as a light touch, not a bold badge.
        if (isWorldCellVisited(cell)) {
            ctx.beginPath();
            ctx.arc(x, y, markerRadius + 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(129, 199, 132, 0.75)';
            ctx.lineWidth = Math.max(1, 1.3 * window.worldCameraZoom);
            ctx.stroke();
        }
    }
}

function centerOnPlayer() {
    const container = document.getElementById("world-map-container");
    if (!container || !window.playerWorldPos) return;

    const size = 15;
    const targetX = (size * (3/2 * window.playerWorldPos.x)) * window.worldCameraZoom;
    const targetY = (size * (Math.sqrt(3) * window.playerWorldPos.y + (window.playerWorldPos.x % 2 === 0 ? 0 : Math.sqrt(3)/2))) * window.worldCameraZoom;

    window.worldCameraX = (container.clientWidth / 2) - targetX;
    window.worldCameraY = (container.clientHeight / 2) - targetY;
}

// Nearest-cell lookup — the layout (worldHexToPixel) uses an odd-q offset
// formula rather than pure axial rounding, so the simplest robust inverse is
// to find the closest cell center to the click, not solve it analytically.
function getWorldCellAtScreenPos(mouseX, mouseY) {
    if (!window.worldMapData || window.worldMapData.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (let y = 0; y < window.worldMapHeight; y++) {
        for (let x = 0; x < window.worldMapWidth; x++) {
            const { x: px, y: py } = worldHexToPixel(x, y);
            const d = (px - mouseX) * (px - mouseX) + (py - mouseY) * (py - mouseY);
            if (d < bestDist) { bestDist = d; best = { x, y }; }
        }
    }
    const zoomedSize = 15 * window.worldCameraZoom;
    if (bestDist > (zoomedSize * zoomedSize)) return null; // clicked empty space between hexes
    return best;
}

function selectWorldMapCell(x, y) {
    const cell = window.worldMapData[y] && window.worldMapData[y][x];
    if (!cell) return;
    if (!window.worldMapNotes) window.worldMapNotes = {};
    const key = `${x},${y}`;

    const panel = document.getElementById('world-map-details');
    const nameEl = document.getElementById('world-map-details-name');
    const infoEl = document.getElementById('world-map-details-info');
    const notesEl = document.getElementById('world-map-details-notes');
    const saveBtn = document.getElementById('world-map-details-save');
    if (!panel) return;

    const factionNames = { h: 'Human', e: 'Elven', d: 'Dwarven', o: 'Orc', g: 'Goblin', n: 'Neutral' };
    const settlementNames = { K: 'Capital', C: 'City', T: 'Town', V: 'Village', F: 'Fort', S: 'Scout Camp' };

    nameEl.innerText = cell.n || `Unnamed hex (${x}, ${y})`;
    const parts = [];
    // cell.f is the settlement-shape code ('C'/'T'/'V'), cell.o is the
    // faction-color code — see drawWorldHex, which reads them this way.
    if (cell.f && settlementNames[cell.f]) parts.push(settlementNames[cell.f]);
    if (cell.o && factionNames[cell.o]) parts.push(`${factionNames[cell.o]} territory`);
    if (cell.p) parts.push(`Population level ${cell.p}`);
    infoEl.innerText = parts.length ? parts.join(' — ') : 'Uncharted terrain.';
    notesEl.value = window.worldMapNotes[key] || '';
    panel.style.display = 'block';

    saveBtn.onclick = () => {
        window.worldMapNotes[key] = notesEl.value;
        window.showMessage('Map note saved.');
    };
}

function initWorldMapEvents() {
    const canvas = document.getElementById("worldMapCanvas");
    const container = document.getElementById("world-map-container");
    if (!canvas || !container) return;

    let mouseDownX = 0, mouseDownY = 0;

    canvas.addEventListener('mousedown', (e) => {
        worldIsDragging = true;
        worldLastMouseX = e.clientX;
        worldLastMouseY = e.clientY;
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!worldIsDragging) return;
        const dx = e.clientX - worldLastMouseX;
        const dy = e.clientY - worldLastMouseY;
        window.worldCameraX += dx;
        window.worldCameraY += dy;
        worldLastMouseX = e.clientX;
        worldLastMouseY = e.clientY;
        renderWorldMap();
    });

    window.addEventListener('mouseup', (e) => {
        worldIsDragging = false;
        // Only treat as a hex-select click if the mouse barely moved (not a drag-pan)
        const moved = Math.abs(e.clientX - mouseDownX) + Math.abs(e.clientY - mouseDownY);
        if (moved < 5) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const cell = getWorldCellAtScreenPos(mouseX, mouseY);
            if (cell) selectWorldMapCell(cell.x, cell.y);
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate world position under mouse before zoom
        const worldX = (mouseX - window.worldCameraX) / window.worldCameraZoom;
        const worldY = (mouseY - window.worldCameraY) / window.worldCameraZoom;

        const newZoom = Math.min(Math.max(0.01, window.worldCameraZoom * delta), 10.0);
        window.worldCameraZoom = newZoom;

        // Recalculate camera offsets
        window.worldCameraX = mouseX - worldX * window.worldCameraZoom;
        window.worldCameraY = mouseY - worldY * window.worldCameraZoom;

        renderWorldMap();
    }, { passive: false });

    // Touch support — this canvas previously had none at all, so tapping a
    // hex for details, panning, and pinch-zoom simply did nothing on
    // touch/iOS. Mirrors the same drag-vs-tap distinction and pinch-zoom
    // math already proven on the main map canvas (hexMap.js).
    let touchStartX = 0, touchStartY = 0, lastPinchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            worldIsDragging = true;
            worldLastMouseX = e.touches[0].clientX;
            worldLastMouseY = e.touches[0].clientY;
            touchStartX = worldLastMouseX;
            touchStartY = worldLastMouseY;
        } else if (e.touches.length === 2) {
            worldIsDragging = false;
            lastPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && worldIsDragging) {
            const dx = e.touches[0].clientX - worldLastMouseX;
            const dy = e.touches[0].clientY - worldLastMouseY;
            window.worldCameraX += dx;
            window.worldCameraY += dy;
            worldLastMouseX = e.touches[0].clientX;
            worldLastMouseY = e.touches[0].clientY;
            renderWorldMap();
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const delta = dist / lastPinchDist;
            lastPinchDist = dist;

            const rect = canvas.getBoundingClientRect();
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

            const worldX = (centerX - window.worldCameraX) / window.worldCameraZoom;
            const worldY = (centerY - window.worldCameraY) / window.worldCameraZoom;

            window.worldCameraZoom = Math.min(Math.max(0.01, window.worldCameraZoom * delta), 10.0);
            window.worldCameraX = centerX - worldX * window.worldCameraZoom;
            window.worldCameraY = centerY - worldY * window.worldCameraZoom;

            renderWorldMap();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        worldIsDragging = false;
        if (e.touches.length < 2) lastPinchDist = 0;
        if (e.changedTouches.length === 1) {
            const moved = Math.abs(e.changedTouches[0].clientX - touchStartX) + Math.abs(e.changedTouches[0].clientY - touchStartY);
            if (moved < 10) {
                const rect = canvas.getBoundingClientRect();
                const touchX = e.changedTouches[0].clientX - rect.left;
                const touchY = e.changedTouches[0].clientY - rect.top;
                const cell = getWorldCellAtScreenPos(touchX, touchY);
                if (cell) selectWorldMapCell(cell.x, cell.y);
            }
        }
    }, { passive: false });
}

window.loadWorldMap = loadWorldMap;
window.renderWorldMap = renderWorldMap;
window.initWorldMapEvents = initWorldMapEvents;
window.getWorldCellAtScreenPos = getWorldCellAtScreenPos;
window.selectWorldMapCell = selectWorldMapCell;
window.drawWorldHex = drawWorldHex;
window.worldHexToPixel = worldHexToPixel;
window.getWorldNeighbors = getWorldNeighbors;
