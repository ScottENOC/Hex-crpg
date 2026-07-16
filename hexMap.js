// hexMap.js
let mapCanvas, mapCtx;
let hexSize = 30;
const mapOffsetX = 50;
const mapOffsetY = 50;
let playerPos = { q: 0, r: 0 };
let highlightedHexes = [];

// Offscreen tile cache
const tileCache = {};

function preRenderTile(terrainName, style) {
    const canvas = document.createElement('canvas');
    const size = hexSize * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Flat-top hex drawing logic
    ctx.beginPath();
    for (let i=0; i<6; i++) {
        const angle = Math.PI/180 * (60 * i);
        const px = size/2 + hexSize * Math.cos(angle);
        const py = size/2 + hexSize * Math.sin(angle);
        if (i===0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    
    if (style.fill) {
        ctx.fillStyle = style.fill;
        ctx.fill();
    }
    ctx.strokeStyle = style.stroke || "#555";
    ctx.stroke();
    
    tileCache[terrainName] = canvas;
}

// Camera variables
window.cameraX = 0;
window.cameraY = 0;
window.cameraZoom = 1.0;
// true  = camera follows the local player while moving
// false = user panned manually; camera stays put until player stops or Space is pressed
window.cameraFollowEnabled = true;

// Mouse tracking for panning
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
window.totalDragDistance = 0;

// Touch tracking
let lastTouchX = 0;
let lastTouchY = 0;
let lastPinchDist = 0;
let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let longPressTimer = null;

// Flat-top hexToPixel formula - UPDATED for camera
function hexToPixel(q, r) {
  const x = (hexSize * (3/2 * q) + mapOffsetX) * window.cameraZoom + window.cameraX + (window.shakeOffsetX || 0);
  const y = (hexSize * (Math.sqrt(3) * r + Math.sqrt(3)/2 * q) + mapOffsetY) * window.cameraZoom + window.cameraY + (window.shakeOffsetY || 0);
  return { x, y };
}

function drawHex(x, y, size, style = { stroke: "#555" }) {
  const zoomedSize = size * window.cameraZoom;
  mapCtx.beginPath();
  for (let i=0; i<6; i++) {
    const angle = Math.PI/180 * (60 * i);
    const px = x + zoomedSize * Math.cos(angle);
    const py = y + zoomedSize * Math.sin(angle);
    if (i===0) mapCtx.moveTo(px, py);
    else mapCtx.lineTo(px, py);
  }
  mapCtx.closePath();
  if (style.stroke !== undefined) {
      mapCtx.strokeStyle = style.stroke;
      mapCtx.lineWidth = style.lineWidth || 1;
      mapCtx.stroke();
  }
  if (style.fill) {
      mapCtx.fillStyle = style.fill;
      mapCtx.fill();
  }
}

// Draws a terrain image clipped to the true flat-top hex shape. A flat-top
// hex with "radius" size is 2*size wide but only sqrt(3)*size tall — drawing
// a plain square image at 2*size square (as terrain rendering used to)
// overflows above/below the hex into neighboring hexes' screen space, and
// since hexes are drawn in column-major order, later-drawn neighbors then
// partially overwrite earlier ones. That's what caused the path tile's
// "chevron"/vertical-line artifact, the fog-of-war shadow overlay missing a
// wedge on one side, and the thin seam between vertically stacked hexes —
// all the same root cause. Clipping to the actual hex polygon fixes all of
// them at once, regardless of what the source image looks like.
//
// The clip+drawImage work itself is repeated for every single hex of a
// given terrain, every frame — with thousands of grass/path/forest hexes
// on screen at once (especially zoomed way out), that's real per-frame
// cost for pixel-identical output. `hexTileCache` composites each unique
// (image, pixel size) combination into its own small offscreen canvas once,
// and every later hex of that terrain/zoom just blits the cached canvas —
// a single drawImage, no clip/path setup. Sizes are rounded to the nearest
// pixel so a slowly-changing zoom reuses the same handful of cache entries
// instead of growing unbounded.
const hexTileCache = {};

// Animated tiles (e.g. a multi-frame water sprite sheet): register a
// terrain's cacheKey here once with how many frames its image contains
// (laid out left-to-right in one sheet, like a filmstrip) and how long each
// frame holds. Nothing else has to change at the call site — drawHexImage
// looks this up automatically. A tile that's never registered here behaves
// exactly as a static one (frameCount 1), so this adds real animation
// support without touching the cost of anything that doesn't use it.
window.animatedTileConfig = {};
function registerAnimatedTile(cacheKey, frameCount, frameDurationMs) {
    window.animatedTileConfig[cacheKey] = { frameCount, frameDurationMs };
}
window.registerAnimatedTile = registerAnimatedTile;

// One shared clock for every animated tile, so all water hexes (say) are
// always on the same frame — looks like one body of water animating
// together, not a field of independently-flickering hexes, and it also
// means there's still only ever (frame count) cache entries total for that
// terrain, not one per hex.
function currentAnimationFrame(cacheKey) {
    const cfg = window.animatedTileConfig[cacheKey];
    if (!cfg) return { frame: 0, frameCount: 1 };
    return { frame: Math.floor(performance.now() / cfg.frameDurationMs) % cfg.frameCount, frameCount: cfg.frameCount };
}

function getCachedHexTile(cacheKey, img, zoomedSize, frame, frameCount) {
    const sizeKey = Math.round(zoomedSize);
    const key = `${cacheKey}_${sizeKey}_${frame}`;
    let tile = hexTileCache[key];
    if (tile) return tile;

    const w = sizeKey * 2;
    const h = Math.round(sizeKey * Math.sqrt(3));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const cx = w / 2, cy = h / 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i);
        const px = cx + sizeKey * Math.cos(angle);
        const py = cy + sizeKey * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip();
    if (frameCount > 1) {
        const frameW = img.naturalWidth / frameCount;
        ctx.drawImage(img, frame * frameW, 0, frameW, img.naturalHeight, cx - sizeKey, cy - h / 2, w, h);
    } else {
        ctx.drawImage(img, cx - sizeKey, cy - h / 2, w, h);
    }

    hexTileCache[key] = canvas;
    return canvas;
}

function drawHexImage(img, x, y, zoomedSize, cacheKey) {
    if (cacheKey) {
        const { frame, frameCount } = currentAnimationFrame(cacheKey);
        const tile = getCachedHexTile(cacheKey, img, zoomedSize, frame, frameCount);
        mapCtx.drawImage(tile, x - tile.width / 2, y - tile.height / 2);
        return;
    }
    // No stable cache key (e.g. per-hex-random arena floor variants) —
    // fall back to drawing directly, clipped but uncached.
    mapCtx.save();
    mapCtx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i);
        const px = x + zoomedSize * Math.cos(angle);
        const py = y + zoomedSize * Math.sin(angle);
        if (i === 0) mapCtx.moveTo(px, py);
        else mapCtx.lineTo(px, py);
    }
    mapCtx.closePath();
    mapCtx.clip();
    const h = zoomedSize * Math.sqrt(3);
    mapCtx.drawImage(img, x - zoomedSize, y - h / 2, zoomedSize * 2, h);
    mapCtx.restore();
}

// Visual variety for the three terrain types that dominate the map (grass,
// foliage, water) — purely cosmetic, same gameplay stats regardless of
// which variant renders. Each hex's variant is a deterministic function of
// its own (q, r) via pseudoRandom (terrain.js), salted differently per
// terrain type so grass/foliage/water don't all pick "the same" index for a
// given hex — not randomized per frame, so it's stable across redraws
// without needing to store anything per hex.
// Overlay sprites drawn on top of the plain dark-green foliage hex — the
// variety comes from what's growing there, not a different-colored hex.
// tree_small's canvas is taller than one hex on purpose (a real tree reads
// taller than the ground it's rooted in) and visually spills into the hex
// north of it, so anyone standing in either hex needs to see through it.
const FOLIAGE_OVERLAYS = ['bush_small', 'bush_large', 'tree_small'];
const GRASS_VARIANTS_DEFAULT = ['grass_1', 'grass_1', 'grass_2', 'grass_3'];
const GRASS_VARIANTS_LUSH = ['grass_3', 'grass_3', 'grass_1', 'grass_2'];
const WATER_VARIANTS = ['water', 'water', 'water_1', 'water_2'];

function pickVariantKey(q, r, salt, keys) {
    const roll = window.pseudoRandom(q * 7.13 + salt, r * 5.71 + salt * 1.7);
    return keys[Math.min(keys.length - 1, Math.floor(roll * keys.length))];
}

// Precomputed once, at world-gen time (campaign2World.js's setupVillageScene,
// right after all water is painted) — a Set of every hex adjacent to water,
// so this is a single Set.has() per grass hex per frame instead of scanning
// 6 neighbors, which matters a lot given grass is the overwhelming majority
// of on-screen hexes once zoomed out.
function isGrassNearWater(q, r) {
    return !!(window._grassNearWaterSet && window._grassNearWaterSet.has(`${q},${r}`));
}

function getVisibleHexes() {
    const rect = mapCanvas.getBoundingClientRect();
    const margin = 2 * hexSize * window.cameraZoom;
    
    // Corners of the screen in hex coords
    const tl = screenToHex({x: rect.left - margin, y: rect.top - margin});
    const br = screenToHex({x: rect.right + margin, y: rect.bottom + margin});
    const tr = screenToHex({x: rect.right + margin, y: rect.top - margin});
    const bl = screenToHex({x: rect.left - margin, y: rect.bottom + margin});

    // Approximate range
    const minQ = Math.min(tl.q, br.q, tr.q, bl.q);
    const maxQ = Math.max(tl.q, br.q, tr.q, bl.q);
    const minR = Math.min(tl.r, br.r, tr.r, bl.r);
    const maxR = Math.max(tl.r, br.r, tr.r, bl.r);

    return { minQ, maxQ, minR, maxR };
}

function drawMap() {
  if (!mapCtx) return;
  invalidateLightSourcesCache();
  refreshVisibilityCacheIfStale();
  if (window.applyScreenShake) window.applyScreenShake();
  mapCtx.clearRect(0,0,mapCanvas.width,mapCanvas.height);

  const bounds = getVisibleHexes();
  const visibleAndExplored = [];

  // Computed once per drawMap() call, not once per hex — isVisibleToPlayer
  // otherwise re-filters the entire (100+ entity) window.entities array on
  // every single call, and this gather loop alone calls it once per hex in
  // the *rectangular bounding box* (which over-covers the actual hex-shaped
  // visible area — e.g. ~675 calls for ~84 hexes actually kept). That
  // redundant re-filtering was measured at ~15ms of drawMap's ~20ms in a
  // dense scene (Silverhart) — this alone doesn't change any behavior,
  // just avoids repeating the same array scan hundreds of times per frame.
  const friendlies = window.entities.filter(e => e.alive && e.side === 'player');

  // 1. Gather visible hexes
  for (let q = bounds.minQ; q <= bounds.maxQ; q++) {
      for (let r = bounds.minR; r <= bounds.maxR; r++) {
          const visible = isVisibleToPlayer({q, r}, friendlies);
          const explored = window.isHexExplored(q, r);
          if (visible || explored) visibleAndExplored.push({q, r, visible});
      }
  }

  // No sorting needed for flat-top hexes as long as we draw in a consistent order
  // visibleAndExplored.sort((a, b) => (a.r + a.q/2) - (b.r + b.q/2));

  // Guard: complete=true on both loaded AND broken images; naturalWidth===0 means broken
  const imgOk = img => img && img.complete && img.naturalWidth !== 0;

  // 2. PASS 1: Base Terrain & Foliage
  visibleAndExplored.forEach(({q, r, visible}) => {
      const terrain = window.getTerrainAt(q, r);
      const {x, y} = hexToPixel(q, r);
      const zoomedSize = hexSize * window.cameraZoom;

      // SPECIAL: Arena/Lobby Floor Randomization
      if ((window.currentCampaign === "1" || window.isInArena) && terrain.name === 'Cave Floor') {
          const noise = Math.abs(Math.sin(q * 12.9898 + r * 78.233));
          const floorNum = Math.floor(noise * 4) + 1;
          const floorImg = window.gameVisuals[`floor${floorNum}`];
          if (imgOk(floorImg)) {
              drawHexImage(floorImg, x, y, zoomedSize, `floor${floorNum}`);
          } else {
              drawHex(x, y, hexSize, { stroke: "#555", fill: terrain.color });
          }

          // Overlays (10% Blood, 1% Skull) — already smaller than the hex,
          // so no clipping needed.
          if (noise < 0.1 && imgOk(window.gameVisuals.overlay_blood)) {
              mapCtx.drawImage(window.gameVisuals.overlay_blood, x - zoomedSize/2, y - zoomedSize/2, zoomedSize, zoomedSize);
          } else if (noise > 0.99 && imgOk(window.gameVisuals.overlay_skull)) {
              const skullSize = zoomedSize * 0.25;
              mapCtx.drawImage(window.gameVisuals.overlay_skull, x - skullSize/2, y - skullSize/2, skullSize, skullSize);
          }
      } else if (terrain.name === 'Pedestal' && imgOk(window.gameVisuals.pedestal)) {
          const blockedHexes = [{q: q, r: r-1}, {q: q+1, r: r-1}];
          const needsTransparency = window.entities.some(e => e.alive && blockedHexes.some(bh => e.getAllHexes().some(h => h.q === bh.q && h.r === bh.r)));
          if (needsTransparency) mapCtx.globalAlpha = 0.5;
          drawHexImage(window.gameVisuals.pedestal, x, y, zoomedSize, 'pedestal');
          if (needsTransparency) mapCtx.globalAlpha = 1.0;
      } else if (terrain.name === 'Forest' || terrain.name === 'Foliage') {
          // Both terrain types render the same way: the plain dark-green hex
          // (terrain.js's 'foliage' image happens to be the same forest
          // green) plus a randomly-picked bush/tree overlay for variety.
          // 'Forest' is what campaign 2's wilderness actually paints;
          // 'Foliage' exists as a distinct gameplay terrain (see the
          // elf/druid foliage-expertise skills) but nothing paints it yet.
          if (imgOk(window.gameVisuals.foliage)) {
              drawHexImage(window.gameVisuals.foliage, x, y, zoomedSize, 'foliage');
          } else {
              drawHex(x, y, hexSize, { stroke: "#555", fill: terrain.color });
          }
          const overlayKey = pickVariantKey(q, r, 401, FOLIAGE_OVERLAYS);
          const overlayImg = window.gameVisuals[overlayKey];
          if (imgOk(overlayImg)) {
              // Seasonal leaf color — see getSeasonalLeafTint (worldTime.js).
              // Aspect ratio is read from the original <img> (naturalWidth/
              // Height) before any tinting, since getRecoloredHairSprite
              // returns a <canvas> (width/height only, no naturalWidth).
              let drawImg = overlayImg;
              if (window.getSeasonalLeafTint && window.getRecoloredHairSprite) {
                  const tint = window.getSeasonalLeafTint();
                  const tinted = window.getRecoloredHairSprite(overlayImg, tint.hue, tint.light, tint.sat);
                  if (tinted) drawImg = tinted;
              }
              const isTall = overlayKey === 'tree_small';
              const footprint = isTall ? [{ q, r }, { q, r: r - 1 }] : [{ q, r }];
              const occupied = footprint.some(fh => window.entities.some(e => e.alive && e.getAllHexes && e.getAllHexes().some(h => h.q === fh.q && h.r === fh.r)));
              const w = zoomedSize * 1.7;
              const h = w * (overlayImg.naturalHeight / overlayImg.naturalWidth);
              if (occupied) mapCtx.globalAlpha = 0.4;
              mapCtx.drawImage(drawImg, x - w / 2, y + zoomedSize * 0.6 - h, w, h);
              if (occupied) mapCtx.globalAlpha = 1.0;
          }
      } else if (terrain.name === 'Wood Floor' && imgOk(window.gameVisuals.wood_floor)) {
          drawHexImage(window.gameVisuals.wood_floor, x, y, zoomedSize, 'wood_floor');
      } else if (terrain.name === 'Path' && imgOk(window.gameVisuals.path)) {
          drawHexImage(window.gameVisuals.path, x, y, zoomedSize, 'path');
      } else if (terrain.name === 'Dirt' && imgOk(window.gameVisuals.dirt)) {
          drawHexImage(window.gameVisuals.dirt, x, y, zoomedSize, 'dirt');
      } else if (terrain.name === 'Grass') {
          // "Lusher"/darker variants weighted higher right next to water — a
          // cheap direct lookup against the sparse overrideTerrain dict
          // (water is always explicitly painted, never a fallback default),
          // not a full getNeighbors()/getTerrainAt() call, since this runs
          // for every grass hex on screen every frame.
          const keys = isGrassNearWater(q, r) ? GRASS_VARIANTS_LUSH : GRASS_VARIANTS_DEFAULT;
          const key = pickVariantKey(q, r, 211, keys);
          if (imgOk(window.gameVisuals[key])) {
              drawHexImage(window.gameVisuals[key], x, y, zoomedSize, key);
          } else {
              drawHex(x, y, hexSize, { stroke: "#555", fill: terrain.color });
          }
      } else if (terrain.name !== 'Water') {
          drawHex(x, y, hexSize, { stroke: "#555", fill: terrain.color });
      } else {
          drawHex(x, y, hexSize, { stroke: "#555", fill: terrain.color });
      }

      if (!visible) drawHex(x, y, hexSize, { fill: "rgba(0,0,0,0.6)" });
  });

  // 3. PASS 2: Entities & Items
  if (window.renderEntities) window.renderEntities();

  // 4. PASS 3: Water Overlay (50% Transparency) - DRAWN ON TOP OF CHARACTERS
  visibleAndExplored.forEach(({q, r}) => {
      const terrain = window.getTerrainAt(q, r);
      if (terrain.name === 'Water') {
          const key = pickVariantKey(q, r, 311, WATER_VARIANTS);
          const img = window.gameVisuals[key];
          if (imgOk(img)) {
              const {x, y} = hexToPixel(q, r);
              const zoomedSize = hexSize * window.cameraZoom;
              mapCtx.globalAlpha = 0.5;
              drawHexImage(img, x, y, zoomedSize, key);
              mapCtx.globalAlpha = 1.0;
          }
      }
  });

  // 4b. PASS 3b: Enemy vision-range overlay while stealthed. Only enemies the
  // player can currently see are shown (you don't get intel on enemies you
  // haven't spotted), and only the on-screen hex set already gathered above
  // is checked, so cost is bounded by (screen hexes) x (visible enemy count)
  // with hasLineOfSight's existing per-pair memoization doing the heavy
  // lifting — cheap even with several enemies in view. No facing/cone yet
  // (that's a separate, bigger mechanic) so this is a plain vision-range
  // radius clipped by line of sight, not a true cone.
  if (window.player?.isStealthed) {
      const visibleEnemies = window.entities.filter(e => e.alive && e.side === 'enemy' && isVisibleToPlayer(e.hex, friendlies));
      if (visibleEnemies.length) {
          visibleAndExplored.forEach(({q, r, visible}) => {
              if (!visible) return;
              const seenByAny = visibleEnemies.some(en => {
                  const visionRange = (window.LIVE_VISION_RANGE || 25) + (en.visionBonus || 0);
                  return distance(en.hex, {q, r}) <= visionRange && hasLineOfSight(en.hex, {q, r});
              });
              if (seenByAny) {
                  const {x, y} = hexToPixel(q, r);
                  drawHex(x, y, hexSize, { fill: 'rgba(255,0,0,0.10)' });
              }
          });
      }
  }

  // 5. PASS 4: Highlights
  highlightedHexes.forEach(hex => {
      const {x,y} = hexToPixel(hex.q, hex.r);
      if (hex.type === 'move') {
          drawHex(x,y, hexSize, { stroke: '#00f', lineWidth: 2 * window.cameraZoom, fill: 'rgba(0,0,255,0.1)'});
      } else if (hex.type === 'attack') {
          // Distinct from the enemy allegiance outline (also red) so
          // "reachable with my current weapon" doesn't visually collide
          // with "this is an enemy".
          drawHex(x,y, hexSize, { stroke: '#ff9800', lineWidth: 2 * window.cameraZoom, fill: 'rgba(255,152,0,0.12)'});
      } else if (hex.type === 'turn') {
          drawHex(x,y, hexSize, { stroke: '#ff0', lineWidth: 4 * window.cameraZoom });
      }
  });

  // 6. PASS 5: Night Filter
  if (window.lightLevel < 1.0) {
      mapCtx.fillStyle = `rgba(0,0,0,${(1.0 - window.lightLevel) * 0.7})`;
      mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
  }

  // 7. PASS 6: Floating combat text (damage/heal/miss) - always on top
  if (window.renderFloatingTexts) window.renderFloatingTexts(mapCtx, hexToPixel, window.cameraZoom);

  // Speech bubbles render after renderEntities (gameEngine.js), not here —
  // drawMap() always runs before renderEntities() in every call site, so
  // drawing bubbles in this pass put them underneath whichever character
  // sprite got rendered on top of them next.
}

function clearHighlights() {
    window.highlightedHexes.length = 0;
}

// Corrected flat-top screenToHex formula - UPDATED for camera
function screenToHex(pos){
  const rect = mapCanvas.getBoundingClientRect();
  const screenX = pos.x - rect.left;
  const screenY = pos.y - rect.top;

  // Adjust for camera and zoom
  const x = (screenX - window.cameraX) / window.cameraZoom - mapOffsetX;
  const y = (screenY - window.cameraY) / window.cameraZoom - mapOffsetY;

  // Inverse of flat-top hexToPixel
  const q_float = (x * 2/3) / hexSize;
  const r_float = (-x / 3 + Math.sqrt(3)/3 * y) / hexSize;

  return hexRound(q_float, r_float);
}

function hexRound(q,r){
  let x=q,z=r,y=-x-z;
  let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);
  const xd=Math.abs(rx-x),yd=Math.abs(ry-y),zd=Math.abs(rz-z);
  if (xd>yd && xd>zd) rx=-ry-rz;
  else if (yd>zd) ry=-rx-rz;
  else rz=-rx-ry;
  return {q:rx,r:rz};
}

function distance(a,b){return (Math.abs(a.q-b.q)+Math.abs(a.q+a.r-b.q-b.r)+Math.abs(a.r-b.r))/2;}
function areAdjacent(a,b){return distance(a,b)===1;}

function getNeighbors(q, r) {
    const dirs = [
        {q:1, r:0}, {q:1, r:-1}, {q:0, r:-1},
        {q:-1, r:0}, {q:-1, r:1}, {q:0, r:1}
    ];
    return dirs.map(d => ({q: q + d.q, r: r + d.r})).filter(h => window.isHexInBounds(h));
}

// Binary min-heap on .priority, used by findPath below instead of sorting
// the entire open-set array on every iteration (an O(n log n) full sort per
// step, run up to 5000 times, for a queue that only ever needs its single
// smallest element popped and one new element pushed each step).
function heapPush(heap, node) {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].priority <= heap[i].priority) break;
        [heap[parent], heap[i]] = [heap[i], heap[parent]];
        i = parent;
    }
}
function heapPop(heap) {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        while (true) {
            const left = 2 * i + 1, right = 2 * i + 2;
            let smallest = i;
            if (left < heap.length && heap[left].priority < heap[smallest].priority) smallest = left;
            if (right < heap.length && heap[right].priority < heap[smallest].priority) smallest = right;
            if (smallest === i) break;
            [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
            i = smallest;
        }
    }
    return top;
}

// ROAD GRAPH: scans painted 'Path' terrain into connected-component groups.
// Not a per-junction routing graph (findPath + prefersRoads already handles
// road-hugging cost-wise) — this is the connectivity census the "how many
// separate road networks exist" question needs: flood-fill every Path hex
// via hex adjacency, group into components. One call after world-build,
// re-callable any time a new road segment is painted (deterministic and
// cheap — only scans window.overrideTerrain, not the whole map).
function buildRoadGraph() {
    const pathHexes = [];
    for (const key in window.overrideTerrain) {
        if (window.overrideTerrain[key]?.name === 'Path') {
            const [q, r] = key.split(',').map(Number);
            pathHexes.push({ q, r, key });
        }
    }
    const hexSet = new Set(pathHexes.map(h => h.key));
    const componentOf = new Map();
    let componentCount = 0;
    for (const h of pathHexes) {
        if (componentOf.has(h.key)) continue;
        componentCount++;
        const stack = [h];
        componentOf.set(h.key, componentCount);
        while (stack.length) {
            const cur = stack.pop();
            for (const n of getNeighbors(cur.q, cur.r)) {
                const nKey = `${n.q},${n.r}`;
                if (hexSet.has(nKey) && !componentOf.has(nKey)) {
                    componentOf.set(nKey, componentCount);
                    stack.push({ q: n.q, r: n.r, key: nKey });
                }
            }
        }
    }
    const graph = { hexCount: pathHexes.length, componentCount, componentOf };
    window._roadGraph = graph;
    return graph;
}
window.buildRoadGraph = buildRoadGraph;

// Cube-coordinate line between two axial hexes, standard lerp+round
// technique (Red Blob Games' "hex line drawing"). Used only to bridge
// disconnected road networks with a straight Path connector.
function hexLine(a, b) {
    const ac = { x: a.q, z: a.r, y: -a.q - a.r };
    const bc = { x: b.q, z: b.r, y: -b.q - b.r };
    const n = Math.max(Math.abs(ac.x - bc.x), Math.abs(ac.y - bc.y), Math.abs(ac.z - bc.z));
    const results = [];
    for (let i = 0; i <= n; i++) {
        const t = n === 0 ? 0 : i / n;
        const x = ac.x + (bc.x - ac.x) * t;
        const y = ac.y + (bc.y - ac.y) * t;
        const z = ac.z + (bc.z - ac.z) * t;
        let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
        const xDiff = Math.abs(rx - x), yDiff = Math.abs(ry - y), zDiff = Math.abs(rz - z);
        if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
        else if (yDiff > zDiff) ry = -rx - rz;
        else rz = -rx - ry;
        results.push({ q: rx, r: rz });
    }
    return results;
}

// A connector must never punch through a building or wall — same guard
// campaign2World.js's own paintPath already applies to the village ring
// (see its comment: reshaped buildings can reach further than their old
// fixed-row footprint, so an unguarded path can cut through a wall). This
// is an ALLOWLIST of plain outdoor ground rather than a blocklist of wall
// names, on purpose: terrain.js has three separate wall tiers (impassable
// 'Wall'/'Keep Wall', the brown climb-but-costly 'Climbable Wall', and the
// 'Palisade Wall' curtain-wall tier) plus indoor floors ('Wood Floor',
// 'Cave Floor') — a blocklist has to be kept in sync with every new wall
// type that gets added; an allowlist of "these are the natural terrains a
// road may cross" doesn't, and Water is deliberately excluded too (a road
// connector has no business laying a land bridge across a river/lake).
const ROAD_SAFE_TERRAIN = new Set(['Grass', 'Forest', 'Mountain', 'Sand', 'Swamp', 'Dirt', 'Foliage', 'Rocky Outcrop', 'Rubble', 'Path']);
function isSafeToPaintRoad(q, r) {
    return ROAD_SAFE_TERRAIN.has(window.getTerrainAt(q, r).name);
}
window.isSafeToPaintRoad = isSafeToPaintRoad;

// Greedily merges every disconnected road network into one by repeatedly
// finding the two closest components (by min hex distance between any pair
// of their hexes) and connecting them, then re-running buildRoadGraph. Run
// once at world-build time — this is a one-shot content fix, not a
// per-frame system. Bails after a generous iteration cap so a genuinely-
// intentional isolated network (if one is ever added on purpose) can't
// spin this into an infinite loop.
//
// Prefers routing the connector through findPath (a fake non-side entity,
// so it's treated exactly like an NPC: full terrain knowledge, impassable
// walls always block) so it naturally detours around any building sitting
// between the two networks, rather than a straight line punching through
// one. Falls back to a straight hex line, skipping any unsafe (building)
// tile, only if no route exists at all (e.g. a network is fully walled in).
function connectAllRoadNetworks() {
    let graph = buildRoadGraph();
    let guard = 0;
    while (graph.componentCount > 1 && guard++ < 50) {
        const byComp = new Map();
        for (const [key, comp] of graph.componentOf.entries()) {
            const [q, r] = key.split(',').map(Number);
            if (!byComp.has(comp)) byComp.set(comp, []);
            byComp.get(comp).push({ q, r });
        }
        const comps = [...byComp.values()];

        // Every cross-component hex pair, nearest first. If the nearest
        // pair's connector turns out to cross something unpaveable (a
        // building, a lake — anything outside ROAD_SAFE_TERRAIN), the whole
        // connector is rejected and the next-nearest pair is tried instead,
        // rather than silently skipping just the blocked tiles (which would
        // leave a broken, non-continuous "road").
        const pairs = [];
        for (let i = 0; i < comps.length; i++) {
            for (let j = i + 1; j < comps.length; j++) {
                let best = Infinity, bestA = null, bestB = null;
                for (const h1 of comps[i]) {
                    for (const h2 of comps[j]) {
                        const d = distance(h1, h2);
                        if (d < best) { best = d; bestA = h1; bestB = h2; }
                    }
                }
                if (bestA) pairs.push({ dist: best, a: bestA, b: bestB });
            }
        }
        pairs.sort((x, y) => x.dist - y.dist);

        let merged = false;
        for (const pair of pairs) {
            const routed = findPath(pair.a, pair.b, undefined, { side: '_roadGraphConnector' }, true);
            const candidates = [routed, hexLine(pair.a, pair.b)];
            for (const candidate of candidates) {
                if (!candidate || candidate.length < 2) continue;
                const allSafe = candidate.every(h => window.isHexInBounds(h) && isSafeToPaintRoad(h.q, h.r));
                if (!allSafe) continue;
                candidate.forEach(h => window.setTerrainAt(h.q, h.r, 'Path'));
                merged = true;
                break;
            }
            if (merged) break;
        }
        if (!merged) break; // every pair blocked by unpaveable terrain — stop rather than loop forever

        graph = buildRoadGraph();
    }
    return graph;
}
window.connectAllRoadNetworks = connectAllRoadNetworks;

function findPath(start, target, availableTP, entity, ignoreTP = false, preferredPath = null) {
    // Built once per call instead of re-scanning window.entities (a linear
    // scan) for every single neighbor of every expanded node — with
    // iterations capped at 5000 and up to 6 neighbors each, that was up to
    // 30000 * entities.length array scans for one long-distance path, and
    // it only gets worse as a save accumulates more entities over a
    // session (dead ones stick around with alive:false forever). This is
    // the likely cause of the "click to move freezes, then teleports"
    // symptom getting more common the longer a game runs.
    const occupantsByHex = new Map();
    for (const e of window.entities) {
        if (!e.alive) continue;
        for (const h of e.getAllHexes()) {
            const k = `${h.q},${h.r}`;
            if (!occupantsByHex.has(k)) occupantsByHex.set(k, []);
            occupantsByHex.get(k).push(e);
        }
    }

    // Parent-pointer reconstruction instead of copying the whole path array
    // into every queue node (which made each node creation cost O(path
    // length so far) — for a long path that's its own O(n^2) blowup on top
    // of the occupant-scan one above).
    const cameFrom = new Map();
    const startKey = `${start.q},${start.r}`;
    const queue = [{ hex: start, cost: 0, priority: distance(start, target) }];

    const visited = new Map(); // Store min cost to each hex
    visited.set(startKey, 0);

    function reconstructPath(endKey) {
        const path = [];
        let k = endKey;
        while (k !== undefined) {
            const node = cameFrom.get(k);
            path.unshift(node ? node.hex : start);
            k = node ? node.parentKey : undefined;
        }
        return path;
    }

    let iterations = 0;
    while (queue.length > 0) {
        if (iterations++ > 5000) return null; // Increased for larger map

        const { hex: current, cost } = heapPop(queue);
        const currentKey = `${current.q},${current.r}`;

        // The heap can hold a stale (higher-cost) entry for a hex that a
        // later, cheaper route already superseded (visited.set overwrites
        // the recorded cost but doesn't remove the old queue entry — same
        // "leave it, it'll just be ignored" behavior the previous sort-based
        // queue already had). Since costs only add positive weight, a
        // stale/worse entry can't produce a better path than the one
        // already recorded, so it's safe (and cheap) to skip it outright.
        if (cost > visited.get(currentKey)) continue;

        if (current.q === target.q && current.r === target.r) return reconstructPath(currentKey);

        const neighbors = getNeighbors(current.q, current.r);
        for (let next of neighbors) {
            const key = `${next.q},${next.r}`;

            // TASK 2: Knowledge-based pathing for player
            const isPlayer = (entity.side === 'player');
            const isVisible = window.isVisibleToPlayer(next);
            const isExplored = window.isHexExplored(next.q, next.r);

            // Check for ENEMY obstacles (Living enemies only)
            // Friendlies DO NOT block movement
            // The player's own route planning matches playerMoveProcess's
            // step-execution rule (gameEngine.js): a neutral NPC (garrison
            // soldier, shopkeeper, anyone just standing around) isn't a
            // threat and shouldn't be able to wall off a whole area just by
            // being densely packed in it — only a genuine 'enemy', or an
            // NPC explicitly opted in via entity.blocksPlayerPath (a guard
            // deliberately denying access to somewhere), blocks the player.
            // AI pathing (isPlayer false) keeps the original "any other
            // side blocks" rule unchanged.
            const occupant = (occupantsByHex.get(key) || []).find(e =>
                isPlayer ? (e.side === 'enemy' || e.blocksPlayerPath) : e.side !== entity.side);

            const isLightOrNoArmorEntity = !entity.equipped || !entity.equipped.armor || window.items[entity.equipped.armor]?.id === 'light_armor';
            let acrobaticsCost = 0;
            if (occupant) {
                const isKnownObstacle = !isPlayer || isVisible;
                if (isKnownObstacle) {
                    // Acrobatics lets a lightly-armored (or unarmored) entity
                    // cross an occupied hex instead of being blocked by it,
                    // at a TP surcharge — plate-wearers stay blocked outright.
                    if (entity.skills?.acrobatics && isLightOrNoArmorEntity) {
                        acrobaticsCost = 3;
                    } else {
                        // It's a known obstacle.
                        // Task 1: If it's the target hex, it's blocked.
                        // (Old logic allowed pathing TO occupied hexes, we now block it if known).
                        continue;
                    }
                }
            }

            // Calculate cost
            let baseCost = 5;
            if (entity.skills) {
                if (entity.skills['fastMovement'] && isLightOrNoArmorEntity) {
                    baseCost -= entity.skills['fastMovement'];
                }
                if (entity.skills['swift_step']) {
                    const isUnarmored = (!entity.equipped || !entity.equipped.armor) && (!entity.equipped || !entity.equipped.offhand || window.items[entity.equipped.offhand].type !== 'shield');
                    if (isUnarmored) baseCost -= 1;
                }
            }
            baseCost = Math.max(1, baseCost) + acrobaticsCost;

            // PREFERRED PATH DISCOUNT (Stay Together)
            if (preferredPath && preferredPath.includes(key)) {
                baseCost = Math.max(1, baseCost - 2);
            }

            const terrain = window.getTerrainAt(next.q, next.r);
            // Impassable-terrain check (Wall, and now the keep's Keep Wall)
            if (terrain.impassable) {
                const isKnownWall = !isPlayer || isExplored;
                if (isKnownWall) continue;
            }

            // FOG-OF-WAR COST: the player shouldn't get to optimize a route
            // through terrain they've never seen (that would trivialise a
            // maze — click the visible destination and the engine silently
            // routes around hazards only the player character couldn't know
            // about). Unexplored hexes cost the player as plain ground;
            // known walls are still blocked above via isKnownWall, only the
            // *cost* of unexplored-but-passable terrain is hidden. NPCs
            // always path with full terrain knowledge (unaffected).
            const useKnownCost = isPlayer && !isExplored;
            let stepCost = baseCost * (useKnownCost ? 1.0 : (window.getMoveCostMult ? window.getMoveCostMult(next.q, next.r, entity) : terrain.moveCostMult));

            // ROAD PREFERENCE: an entity flagged prefersRoads (townsfolk on
            // their daily routine — the farmer walking to the pub, not a
            // ranger scouting off-trail) pays a surcharge for every off-road
            // step, so A* strongly favours following the road even when it
            // winds, while still leaving it for the last stretch to an
            // off-road destination or when cutting across is *much* shorter.
            // Bounded and additive, so it biases without ever hard-blocking.
            // Out-of-combat only — tactical combat movement ignores roads.
            if (entity && entity.prefersRoads && !window.isInCombat && terrain.name !== 'Path') {
                stepCost += 6;
            }

            const nextCost = cost + stepCost;

            // Allow one last step that crosses the availableTP threshold
            if (!ignoreTP && availableTP !== undefined && nextCost > availableTP && cost >= availableTP) continue;

            if (!visited.has(key) || nextCost < visited.get(key)) {
                visited.set(key, nextCost);
                cameFrom.set(key, { hex: next, parentKey: currentKey });
                heapPush(queue, {
                    hex: next,
                    cost: nextCost,
                    priority: nextCost + distance(next, target)
                });
            }
        }
    }
    return null;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function hexLerp(a, b, t) {
    return {
        q: lerp(a.q, b.q, t),
        r: lerp(a.r, b.r, t)
    };
}

// hasLineOfSight is called once per candidate hex by drawMap's gather loop
// and isVisibleToPlayer (up to ~700 times per frame in a dense scene) — it
// used to re-scan the entire window.entities array twice (once to find the
// viewer at `start`, once to find any torch-carrying illuminator) AND
// iterate every tileObject in the entire persistent world (every door,
// watchtower, fireplace ever placed, not just what's on screen) on every
// single call. Measured at ~20ms of drawMap's ~20ms total in Silverhart —
// effectively the entire per-frame rendering cost. None of that changes
// mid-frame, so it's computed once and cached here instead, invalidated by
// drawMap() at the top of every call (see invalidateLightSourcesCache
// below) — bounds staleness to "at most one frame old", which light
// sources never change fast enough to matter.
let _lightSourcesCache = null;

// The tileObjects half of the scan above (every door/watchtower/fireplace in
// the *entire persistent world*, not just what's nearby) is the one part of
// this cache that keeps getting more expensive as the world grows, no
// matter how small a dense scene's viewport is — unlike the viewport-bounded
// hex-gather loop, this was O(total tileObjects ever placed). tileObjects
// only actually changes when something is built/placed/destroyed (rare —
// doors toggling replace their own key's value, not the object count), so
// re-deriving the lit subset is skipped entirely whenever the key count
// hasn't moved since the last time, which is nearly always. This bounds the
// full-object-iteration cost to "once per actual world change" instead of
// "once per tick", regardless of how large tileObjects eventually gets.
let _tileLightsCache = null;
let _tileLightsCacheCount = -1;
// The count-based cache check below doesn't catch a tileObject's lightRadius
// changing in place (e.g. a fireplace being lit/doused) since the object
// count stays the same — callers that mutate lightRadius/lit without
// adding/removing a tileObject must call this explicitly.
function invalidateTileLightsCache() { _tileLightsCache = null; }
window.invalidateTileLightsCache = invalidateTileLightsCache;
function getTileLights() {
    const count = Object.keys(window.tileObjects).length;
    if (_tileLightsCache && count === _tileLightsCacheCount) return _tileLightsCache;
    const tileLights = []; // { q, r, radius }
    for (const key in window.tileObjects) {
        const obj = window.tileObjects[key];
        if (obj.lightRadius > 0 && !(obj.type === 'fireplace' && obj.lit === false)) {
            const [oq, orr] = key.split(',').map(Number);
            tileLights.push({ q: oq, r: orr, radius: obj.lightRadius });
        }
    }
    _tileLightsCache = tileLights;
    _tileLightsCacheCount = count;
    return tileLights;
}

function getLightSourcesCache() {
    if (_lightSourcesCache) return _lightSourcesCache;
    const entityLights = []; // { hex, radius }
    const viewersByHex = new Map(); // "q,r" -> entity, for the O(1) viewer lookup below
    window.entities.forEach(e => {
        if (!e.alive) return;
        viewersByHex.set(`${e.hex.q},${e.hex.r}`, e);
        if (!e.equipped) return;
        let r = 0;
        [e.equipped.weapon, e.equipped.offhand, e.equipped.accessory].forEach(iid => {
            if (iid && window.items[iid]?.lightRadius) r = Math.max(r, window.items[iid].lightRadius);
        });
        if (r > 0) entityLights.push({ hex: e.hex, radius: r });
    });
    _lightSourcesCache = { entityLights, tileLights: getTileLights(), viewersByHex };
    return _lightSourcesCache;
}
function invalidateLightSourcesCache() { _lightSourcesCache = null; }
window.invalidateLightSourcesCache = invalidateLightSourcesCache;

// Standalone "is this hex lit right now" check, factored out of the
// targetIsIlluminated logic inside hasLineOfSightUncached below so AI search
// behavior (gameEngine.js) can score candidate hexes by illumination without
// duplicating the light-source math or paying for a full LOS raycast.
function isHexIlluminated(hex) {
    const { entityLights, tileLights } = getLightSourcesCache();
    return entityLights.some(l => distance(l.hex, hex) <= l.radius) ||
        tileLights.some(l => distance({ q: l.q, r: l.r }, hex) <= l.radius);
}
window.isHexIlluminated = isHexIlluminated;

// VISIBILITY CACHE (memoizes hasLineOfSight's boolean result per start/end
// pair). Even with the light-source fix above, a stationary camera still
// re-raycasts the same ~700 candidate hexes from scratch every single 10ms
// tick — real work (walking every intermediate hex between viewer and
// target checking for walls), but wholly redundant when nothing that
// affects visibility actually changed since the last tick. Invalidated by:
// (a) a per-drawMap-call fingerprint check (any friendly's hex, vision
// bonus, or the ambient light level) — covers movement and day/night/torch
// changes; (b) setTerrainAt calling invalidateVisibilityCache directly
// (terrain.js) — covers doors opening/closing and any other real-time
// terrain mutation, which the fingerprint alone can't see.
let _visibilityCache = new Map();
function invalidateVisibilityCache() { _visibilityCache.clear(); }
window.invalidateVisibilityCache = invalidateVisibilityCache;

let _lastVisibilityFingerprint = null;
function refreshVisibilityCacheIfStale() {
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player');
    const parts = friendlies.map(f => `${f.hex.q},${f.hex.r}:${f.visionBonus || 0}:${(f.skills?.elf_darkvision || f.skills?.goblin_low_light_eyes) ? 1 : 0}`);
    parts.push(`L${(window.lightLevel || 1).toFixed(2)}`);
    const fp = parts.join('|');
    if (fp !== _lastVisibilityFingerprint) {
        _visibilityCache.clear();
        _lastVisibilityFingerprint = fp;
    }
}

function hasLineOfSight(start, end) {
    const key = `${start.q},${start.r}|${end.q},${end.r}`;
    const cached = _visibilityCache.get(key);
    if (cached !== undefined) return cached;
    const result = hasLineOfSightUncached(start, end);
    _visibilityCache.set(key, result);
    return result;
}

// LIVE_VISION_RANGE governs what's actually seen right now — enemy
// spotting, full-detail rendering, combat LOS — deliberately smaller than
// the 30-hex EXPLORE_VISION_RANGE (updateExploration, below) that permanently
// reveals fog-of-war on the map. Splitting them keeps map discovery feeling
// generous while shrinking the genuinely expensive check (a per-hex raycast,
// vs. exploration's one-time Set write) — shorter raycasts, and far more
// candidate hexes rejected by the cheap distance check before ever reaching
// hasLineOfSightUncached at all.
const LIVE_VISION_RANGE = 25;
const EXPLORE_VISION_RANGE = 30;
window.LIVE_VISION_RANGE = LIVE_VISION_RANGE;
window.EXPLORE_VISION_RANGE = EXPLORE_VISION_RANGE;

function hasLineOfSightUncached(start, end) {
    const d = distance(start, end);
    const nightFactor = window.lightLevel || 1.0;

    let baseVisionCap = LIVE_VISION_RANGE;
    let viewerTorchRadius = 0;

    const { entityLights, tileLights, viewersByHex } = getLightSourcesCache();

    const viewer = viewersByHex.get(`${start.q},${start.r}`);
    if (viewer) {
        baseVisionCap += (viewer.visionBonus || 0);
        if (viewer.equipped) {
            [viewer.equipped.weapon, viewer.equipped.offhand, viewer.equipped.accessory].forEach(iid => {
                if (iid && window.items[iid]?.lightRadius) viewerTorchRadius = Math.max(viewerTorchRadius, window.items[iid].lightRadius);
            });
        }
    }

    // Is the target illuminated by ANY source?
    const targetIsIlluminated = entityLights.some(l => distance(l.hex, end) <= l.radius)
        || tileLights.some(l => distance({ q: l.q, r: l.r }, end) <= l.radius);

    // Same 0.2 floor isVisibleToPlayer/updateExploration apply — vision never
    // drops below 20% of base range even in pitch dark. This function used to
    // multiply by the raw (unfloored) nightFactor instead, which happened to
    // stay harmless while LIVE_VISION_RANGE was 30 (30*0.15=4.5, still enough
    // headroom for most short indoor LOS checks) but became a real bug once
    // it dropped to 25 (25*0.15=3.75) — surfaced by a dim-tavern LOS test.
    let effectiveVisionCap = baseVisionCap * Math.max(0.2, nightFactor);
    effectiveVisionCap = Math.max(effectiveVisionCap, viewerTorchRadius);
    
    if (targetIsIlluminated) {
        // If target is lit up, we can see them up to our full potential vision range
        effectiveVisionCap = Math.max(effectiveVisionCap, baseVisionCap);
    }

    if (d > effectiveVisionCap) return false;

    // Note: this only ever checked the literal 'Wall' name, not the (mostly
    // unused elsewhere) blocksLOS field — Pedestal/Palisade Wall have never
    // actually blocked LOS despite declaring blocksLOS:true. Left as-is to
    // avoid changing established behavior; the keep's roofed wall is added
    // as a second explicit name here rather than switching this whole check
    // over to blocksLOS (which would also newly block LOS through every
    // existing Pedestal/Palisade Wall hex on the map). 'Climbable Wall' (the
    // star fort's actual curtain wall, carveStarFort/campaign2World.js) is a
    // third, separate terrain name that was never added here — meaning an
    // archer outside a fort could always shoot straight through its walls.
    const isOpaqueWallName = (name) => name === 'Wall' || name === 'Keep Wall' || name === 'Climbable Wall';
    const startOnWall = isOpaqueWallName(window.getTerrainAt(start.q, start.r).name);
    const endOnWall = isOpaqueWallName(window.getTerrainAt(end.q, end.r).name);
    // ELEVATED SHADOW: a wall only fully blocks sight for someone standing
    // at ground level looking through it. Someone already elevated (on a
    // wall, Pedestal, High Ground — anything with terrain.elevated) is
    // looking down/across from height, so a wall hex the ray merely grazes
    // far off in the distance shouldn't block them the same way one right
    // in front of them does — it "casts a shadow" only a short way out.
    // Adjacent-to-start/adjacent-to-end (below) already covers standing
    // right next to your own wall; this widens that same idea to a small
    // radius, but only when the viewer has the height to look past it.
    const viewerElevated = !!window.getTerrainAt(start.q, start.r).elevated;
    const ELEVATED_SHADOW_RADIUS = 3;

    for (let i = 0; i <= d; i++) {
        const t = d === 0 ? 0 : i / d;
        const current = hexRound(hexLerp(start, end, t).q, hexLerp(start, end, t).r);

        if ((current.q === start.q && current.r === start.r) || (current.q === end.q && current.r === end.r)) continue;

        const terrain = window.getTerrainAt(current.q, current.r);
        if (isOpaqueWallName(terrain.name)) {
            const adjacentToStart = distance(start, current) === 1;
            const adjacentToEnd = distance(end, current) === 1;

            if (startOnWall && adjacentToStart) continue;
            if (endOnWall && adjacentToEnd) continue;
            if (viewerElevated && distance(start, current) > ELEVATED_SHADOW_RADIUS) continue;

            return false;
        }
    }
    return true;
}

function hasLineOfEffect(start, end) {
    return hasLineOfSight(start, end);
}

// Optional 2nd arg lets a hot per-hex loop (drawMap's gather pass,
// renderEntities' tileObjects/mapItems passes) hoist the friendlies filter
// out of the loop and pass it in once, instead of every single call
// re-scanning the entire (100+ entity) window.entities array from scratch —
// with a viewport-sized bounding box calling this hundreds of times per
// frame, that re-filter alone was measured at ~15ms of a ~20ms frame in a
// dense scene (see getCachedFriendlies below). Every existing call site
// keeps working unchanged by omitting the argument.
function isVisibleToPlayer(targetHex, friendliesOverride) {
    const friendlies = friendliesOverride || window.entities.filter(e => e.alive && e.side === 'player');
    for (let f of friendlies) {
        const myHexes = f.getAllHexes();
        for (let fh of myHexes) {
            const dist = distance(fh, targetHex);

            // Vision Range affected by light
            let visionRange = LIVE_VISION_RANGE + (f.visionBonus || 0);
            const light = window.lightLevel || 1.0;

            // Elf Darkvision: treat light as 1.0 for range if they have the skill
            const effectiveLight = (f.skills?.elf_darkvision || f.skills?.goblin_low_light_eyes) ? 1.0 : light;
            let finalRange = visionRange * Math.max(0.2, effectiveLight);
            // A target hex lit by its own nearby light source (a campfire,
            // torch...) is visible up to full (undimmed) range, same as
            // hasLineOfSightUncached's targetIsIlluminated boost below — this
            // duplicated its own range cap without that boost, so a fire tile
            // standing just past the ambient-darkness floor (e.g. 6 hexes out
            // at a 5-hex dark-vision floor) was rejected before hasLineOfSight
            // ever got a chance to apply the correct, illumination-aware check.
            if (window.isHexIlluminated && window.isHexIlluminated(targetHex)) finalRange = visionRange;

            if (dist <= finalRange && hasLineOfSight(fh, targetHex)) {
                return true;
            }
        }
    }
    return false;
}

function updateExploration() {
    if (!window.entities || !window.exploredHexes) return;
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player');
    const light = window.lightLevel || 1.0;

    for (let f of friendlies) {
        f.hasBeenSeenByPlayer = true;
        const myHexes = f.getAllHexes();
        const visionRange = EXPLORE_VISION_RANGE + (f.visionBonus || 0);
        const effectiveLight = (f.skills?.elf_darkvision || f.skills?.goblin_low_light_eyes) ? 1.0 : light;
        const finalRange = visionRange * Math.max(0.2, effectiveLight);
        const intRange = Math.ceil(finalRange);

        for (let q = -intRange; q <= intRange; q++) {
            for (let r = Math.max(-intRange, -q - intRange); r <= Math.min(intRange, -q + intRange); r++) {
                const targetHex = { q: f.hex.q + q, r: f.hex.r + r };
                const dist = distance(f.hex, targetHex); 
                if (dist > finalRange) continue;
                if (!window.isHexInBounds(targetHex.q, targetHex.r)) continue;

                let canSeeThis = false;
                for (let fh of myHexes) {
                    if (hasLineOfSight(fh, targetHex)) {
                        canSeeThis = true;
                        break;
                    }
                }

                if (canSeeThis) {
                    const key = `${targetHex.q},${targetHex.r}`;
                    window.exploredHexes.add(key);
                    if (!window.lastSeenTimeMap) window.lastSeenTimeMap = {};
                    window.lastSeenTimeMap[key] = window.worldSeconds;
                    if (window.ensureWildernessResourceNode) window.ensureWildernessResourceNode(targetHex.q, targetHex.r);

                    const ent = window.getEntityAtHex(targetHex.q, targetHex.r);
                    if (ent) {
                        if (ent.side === 'enemy' && !ent.hasBeenSeenByPlayer) {
                            ent.hasBeenSeenByPlayer = true;
                            const now = Date.now();
                            if (!window.lastEnemySeenDialogueTime || (now - window.lastEnemySeenDialogueTime > 10000)) {
                                let speaker = f;
                                if (f.isSummoned || f.isCompanion) {
                                    const owner = window.entities.find(e => e.name === f.summoner);
                                    if (owner) speaker = owner;
                                }
                                if (speaker.voice && window.playDialogue) {
                                    window.playDialogue(`${speaker.voice}_enemy_seen`);
                                    window.lastEnemySeenDialogueTime = now;
                                }
                            }
                        } else {
                            ent.hasBeenSeenByPlayer = true;
                        }
                    }
                }
            }
        }
    }
}


function getHexBehind(origin, target) {
    const dir = { q: target.q - origin.q, r: target.r - origin.r };
    return { q: target.q + dir.q, r: target.r + dir.r };
}

function isHexInBounds(hex) {
    // Infinite map!
    return true;
}

function resizeCanvas() {
    const container = document.getElementById("game-board");
    if (container && mapCanvas) {
        mapCanvas.width = container.clientWidth;
        mapCanvas.height = container.clientHeight;
        drawMap();
        if (window.renderEntities) window.renderEntities();
    }
}

function initHexMap() {
  mapCanvas = document.getElementById("mapCanvas");
  if (mapCanvas) {
    mapCtx = mapCanvas.getContext("2d");
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    mapCanvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        window.totalDragDistance = 0; // Reset
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        window.cameraX += dx;
        window.cameraY += dy;
        window.totalDragDistance += Math.abs(dx) + Math.abs(dy); // Accumulate distance
        if (window.totalDragDistance > 10) window.cameraFollowEnabled = false;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        drawMap();
        window.renderEntities();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    mapCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? 0.9 : 1.1; // Multiplicative zoom for smoother feel
        
        const rect = mapCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate world position under mouse before zoom
        const worldX = (mouseX - window.cameraX) / window.cameraZoom;
        const worldY = (mouseY - window.cameraY) / window.cameraZoom;

        const newZoom = Math.min(Math.max(0.15, window.cameraZoom * delta), 5.0);
        
        window.cameraZoom = newZoom;

        // Update camera offsets to keep world position under mouse
        window.cameraX = mouseX - worldX * window.cameraZoom;
        window.cameraY = mouseY - worldY * window.cameraZoom;
        
        drawMap();
        window.renderEntities();
    }, { passive: false });

    // TOUCH SUPPORT
    mapCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            touchStartX = lastTouchX;
            touchStartY = lastTouchY;
            touchStartTime = Date.now();
            window.totalDragDistance = 0;

            // Long press for details
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                if (window.totalDragDistance < 10) {
                    const clickedHex = window.screenToHex({x: touchStartX, y: touchStartY});
                    const target = window.entities.find(ent => ent.alive && window.isVisibleToPlayer(ent.hex) && ent.getAllHexes().some(h => h.q === clickedHex.q && h.r === clickedHex.r));
                    if (target) window.showEntityDetails(target);
                }
            }, 600);
        } else if (e.touches.length === 2) {
            isDragging = false;
            lastPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: false });

    mapCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - lastTouchX;
            const dy = e.touches[0].clientY - lastTouchY;
            window.cameraX += dx;
            window.cameraY += dy;
            window.totalDragDistance += Math.abs(dx) + Math.abs(dy);
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;

            if (window.totalDragDistance > 10) window.cameraFollowEnabled = false;
            if (window.totalDragDistance > 10 && longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            drawMap();
            window.renderEntities();
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const delta = dist / lastPinchDist;
            lastPinchDist = dist;

            const rect = mapCanvas.getBoundingClientRect();
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

            const worldX = (centerX - window.cameraX) / window.cameraZoom;
            const worldY = (centerY - window.cameraY) / window.cameraZoom;

            window.cameraZoom = Math.min(Math.max(0.15, window.cameraZoom * delta), 5.0);
            window.cameraX = centerX - worldX * window.cameraZoom;
            window.cameraY = centerY - worldY * window.cameraZoom;

            drawMap();
            window.renderEntities();
        }
    }, { passive: false });

    mapCanvas.addEventListener('touchend', (e) => {
        const wasTap = e.changedTouches.length === 1 &&
                       window.totalDragDistance < 10 &&
                       (Date.now() - touchStartTime) < 600;

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (e.touches.length < 2) lastPinchDist = 0;
        if (e.touches.length === 0) isDragging = false;

        // iOS suppresses the synthetic click when touchmove calls preventDefault,
        // so fire handleClick directly for short taps.
        if (wasTap && window.handleClick) {
            const t = e.changedTouches[0];
            window.handleClick({ clientX: t.clientX, clientY: t.clientY });
        }
    });

    drawMap();
  }
}

function centerCameraOn(hex) {
    if (!hex || hex.q === undefined || hex.r === undefined) return;
    const {x, y} = hexToPixel(hex.q, hex.r);
    // hexToPixel already includes current cameraX/Y and zoom
    // We want to adjust cameraX/Y so that (x,y) is at the center of the canvas
    const rect = mapCanvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Current pixel position without camera offset:
    const worldX = (hexSize * (3/2 * hex.q) + mapOffsetX) * window.cameraZoom;
    const worldY = (hexSize * (Math.sqrt(3) * hex.r + Math.sqrt(3)/2 * hex.q) + mapOffsetY) * window.cameraZoom;

    window.cameraX = centerX - worldX;
    window.cameraY = centerY - worldY;
    
    drawMap();
    if (window.renderEntities) window.renderEntities();
}

window.centerCameraOn = centerCameraOn;

// Smoothly follow the locally-controlled player's visual position while they
// are moving. Only active when the entity has a destination so the user can
// still drag to look around when the player is stationary. Works the same
// way in single-player as in multiplayer — previously this only ever
// resolved a "local" entity via networkId, so solo games got no camera
// follow at all outside of the fixed scene-setup recenters, leaving anyone
// who walked far from the last recenter point staring at a static camera.
window.smoothFollowPlayer = function(dt) {
    if (!window.entities) return;
    let localEnt;
    if (window.multiplayer && window.multiplayer.roomCode) {
        localEnt = window.entities.find(e => e.networkId === window.multiplayer.socket.id);
    } else {
        const selected = window.party && window.party[window.selectedCharacterIndex || 0];
        localEnt = (selected && window.entities.find(e => e.name === selected.name && e.side === 'player'))
            || window.entities.find(e => e.side === 'player' && !e.rider && !e.aiControlled);
    }
    if (!localEnt) return;

    const isMoving = localEnt.destination ||
                     (localEnt.moveCooldown !== undefined && localEnt.moveCooldown > 0);

    // Re-enable follow automatically when the player stops so the next move re-engages it.
    if (!isMoving) {
        window.cameraFollowEnabled = true;
        return;
    }

    if (!window.cameraFollowEnabled) return;

    const vQ = (localEnt.visualQ !== undefined) ? localEnt.visualQ : localEnt.hex.q;
    const vR = (localEnt.visualR !== undefined) ? localEnt.visualR : localEnt.hex.r;

    const rect = mapCanvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const worldX = (hexSize * (3/2 * vQ) + mapOffsetX) * window.cameraZoom;
    const worldY = (hexSize * (Math.sqrt(3) * vR + Math.sqrt(3)/2 * vQ) + mapOffsetY) * window.cameraZoom;

    const targetX = cx - worldX;
    const targetY = cy - worldY;

    // Exponential lerp — reaches target in ~0.4s at speed=8
    const t = Math.min(1, dt * 8);
    window.cameraX += (targetX - window.cameraX) * t;
    window.cameraY += (targetY - window.cameraY) * t;
};
window.mapCanvas = mapCanvas;
window.mapCtx = mapCtx;
window.hexSize = hexSize;
window.mapOffsetX = mapOffsetX;
window.mapOffsetY = mapOffsetY;
window.cameraX = window.cameraX;
window.cameraY = window.cameraY;
window.cameraZoom = window.cameraZoom;
window.playerPos = playerPos;
window.highlightedHexes = highlightedHexes;
window.hexToPixel = hexToPixel;
window.drawHex = drawHex;
window.drawMap = drawMap;
window.resizeCanvas = resizeCanvas;
window.clearHighlights = clearHighlights;
window.screenToHex = screenToHex;
window.hexRound = hexRound;
window.distance = distance;
window.areAdjacent = areAdjacent;
window.getNeighbors = getNeighbors;
window.findPath = findPath;
window.hasLineOfSight = hasLineOfSight;
window.hasLineOfEffect = hasLineOfEffect;
window.isVisibleToPlayer = isVisibleToPlayer;
window.getVisibleHexes = getVisibleHexes;
window.getHexBehind = getHexBehind;
window.isHexInBounds = isHexInBounds;
window.initHexMap = initHexMap;
