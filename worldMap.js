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
            window.worldMapWidth = 12;
            window.worldMapHeight = 12;
            window.worldMapData = [];
            for (let y = 0; y < 12; y++) {
                const row = [];
                for (let x = 0; x < 12; x++) {
                    row.push({ t: 'G', f: 'n', o: '', p: 0, n: '' });
                }
                window.worldMapData.push(row);
            }
            // Add Hollowmere in the middle. Note: cell.f is the marker SHAPE ('C'/'T'/'V'),
            // cell.o is the faction-color code — see drawWorldHex, which reads them this way.
            window.worldMapData[6][6] = { t: 'G', f: 'C', o: 'h', p: 1, n: 'Hollowmere' };
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

function renderWorldMap() {
    const canvas = document.getElementById("worldMapCanvas");
    const container = document.getElementById("world-map-container");
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    updateWorldMapLegend();

    if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    if (!window.worldMapInitialized && window.playerWorldPos) {
        centerOnPlayer();
        window.worldMapInitialized = true;
    }

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const baseSize = 15;
    const zoomedSize = baseSize * window.worldCameraZoom;

    if (window.worldMapData.length > 0) {
        for (let y = 0; y < window.worldMapHeight; y++) {
            for (let x = 0; x < window.worldMapWidth; x++) {
                const cell = window.worldMapData[y][x];
                if (!cell) continue;

                const {x: px, y: py} = worldHexToPixel(x, y);

                if (px < -zoomedSize || px > canvas.width + zoomedSize || py < -zoomedSize || py > canvas.height + zoomedSize) continue;

                drawWorldHex(ctx, px, py, zoomedSize, cell, x, y);
            }
        }
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
        
        ctx.fillStyle = "white";
        ctx.font = `bold ${12 * window.worldCameraZoom}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("YOU", px, py - (10 * window.worldCameraZoom));
    }
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

    if (cell.f) {
        let markerSize = size * 0.4;
        let markerColor = factionColors[cell.o] || 'white';
        
        if (cell.f === 'C') { 
            markerSize = size * 0.6;
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.moveTo(x, y - markerSize);
            ctx.lineTo(x + markerSize, y);
            ctx.lineTo(x, y + markerSize);
            ctx.lineTo(x - markerSize, y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "black";
            ctx.stroke();
        } else if (cell.f === 'T') { 
            ctx.fillStyle = markerColor;
            ctx.fillRect(x - markerSize/2, y - markerSize/2, markerSize, markerSize);
            ctx.strokeStyle = "black";
            ctx.strokeRect(x - markerSize/2, y - markerSize/2, markerSize, markerSize);
        } else if (cell.f === 'V') { 
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(x, y, markerSize/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "black";
            ctx.stroke();
        }

        if (cell.f === 'C' || (window.worldCameraZoom > 1.2 && cell.f)) {
            ctx.fillStyle = "white";
            const fontSize = cell.f === 'C' ? 10 : 8;
            ctx.font = `bold ${fontSize * window.worldCameraZoom}px Arial`;
            ctx.textAlign = "center";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            ctx.fillText(cell.n, x, y - size);
            ctx.shadowBlur = 0;
        }
    }
}

function centerOnPlayer() {
    const canvas = document.getElementById("worldMapCanvas");
    if (!canvas || !window.playerWorldPos) return;
    
    const size = 15;
    const targetX = (size * (3/2 * window.playerWorldPos.x)) * window.worldCameraZoom;
    const targetY = (size * (Math.sqrt(3) * window.playerWorldPos.y + (window.playerWorldPos.x % 2 === 0 ? 0 : Math.sqrt(3)/2))) * window.worldCameraZoom;
    
    window.worldCameraX = (canvas.width / 2) - targetX;
    window.worldCameraY = (canvas.height / 2) - targetY;
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
    const settlementNames = { C: 'City', T: 'Town', V: 'Village' };

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
}

window.loadWorldMap = loadWorldMap;
window.renderWorldMap = renderWorldMap;
window.initWorldMapEvents = initWorldMapEvents;
window.getWorldCellAtScreenPos = getWorldCellAtScreenPos;
window.selectWorldMapCell = selectWorldMapCell;
