// hexMap.js
let hexSize = 30;
const mapOffsetX = 50;
const mapOffsetY = 50;
let playerPos = { q: 0, r: 0 };
let highlightedHexes = [];

// Camera variables
window.cameraX = 0;
window.cameraY = 0;
window.cameraZoom = 1.0;

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
  const x = (hexSize * (3/2 * q) + mapOffsetX) * window.cameraZoom + window.cameraX;
  const y = (hexSize * (Math.sqrt(3) * r + Math.sqrt(3)/2 * q) + mapOffsetY) * window.cameraZoom + window.cameraY;
  return { x, y };
}

function drawHex(x, y, size, style = { stroke: "#555" }) {
  const zoomedSize = size * window.cameraZoom;
  window.mapCtx.beginPath();
  for (let i=0; i<6; i++) {
    const angle = Math.PI/180 * (60 * i);
    const px = x + zoomedSize * Math.cos(angle);
    const py = y + zoomedSize * Math.sin(angle);
    if (i===0) window.mapCtx.moveTo(px, py);
    else window.mapCtx.lineTo(px, py);
  }
  window.mapCtx.closePath();
  window.mapCtx.strokeStyle = style.stroke;
  window.mapCtx.lineWidth = style.lineWidth || 1;
  window.mapCtx.stroke();
  if (style.fill) {
      window.mapCtx.fillStyle = style.fill;
      window.mapCtx.fill();
  }
}

function getVisibleHexes() {
    const rect = window.mapCanvas.getBoundingClientRect();
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
  if (!window.mapCtx) return;
  window.mapCtx.clearRect(0,0,window.mapCanvas.width,window.mapCanvas.height);
  
  const bounds = getVisibleHexes();
  const visibleAndExplored = [];

  // 1. Gather visible hexes
  for (let q = bounds.minQ; q <= bounds.maxQ; q++) {
      for (let r = bounds.minR; r <= bounds.maxR; r++) {
          const visible = isVisibleToPlayer({q, r});
          const explored = window.isHexExplored(q, r);
          if (visible || explored) visibleAndExplored.push({q, r, visible});
      }
  }

  // No sorting needed for flat-top hexes as long as we draw in a consistent order
  // visibleAndExplored.sort((a, b) => (a.r + a.q/2) - (b.r + b.q/2));

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
          if (floorImg && floorImg.complete) {
              window.mapCtx.drawImage(floorImg, x - zoomedSize, y - zoomedSize, zoomedSize * 2, zoomedSize * 2);
          } else {
              drawHex(x, y, hexSize, { stroke: "#555", fill: terrain.color });
          }

          // Overlays (10% Blood, 1% Skull)
          if (noise < 0.1 && window.gameVisuals.overlay_blood.complete) {
              window.mapCtx.drawImage(window.gameVisuals.overlay_blood, x - zoomedSize/2, y - zoomedSize/2, zoomedSize, zoomedSize);
          } else if (noise > 0.99 && window.gameVisuals.overlay_skull.complete) {
              const skullSize = zoomedSize * 0.25;
              window.mapCtx.drawImage(window.gameVisuals.overlay_skull, x - skullSize/2, y - skullSize/2, skullSize, skullSize);
          }
      } else if (terrain.name === 'Pedestal' && window.gameVisuals.pedestal.complete) {
          const blockedHexes = [{q: q, r: r-1}, {q: q+1, r: r-1}];
          const needsTransparency = window.entities.some(e => e.alive && blockedHexes.some(bh => e.getAllHexes().some(h => h.q === bh.q && h.r === bh.r)));
          if (needsTransparency) window.mapCtx.globalAlpha = 0.5;
          window.mapCtx.drawImage(window.gameVisuals.pedestal, x - zoomedSize, y - zoomedSize, zoomedSize * 2, zoomedSize * 2);
          if (needsTransparency) window.mapCtx.globalAlpha = 1.0;
      } else if (terrain.name === 'Foliage' && window.gameVisuals.foliage.complete) {
          window.mapCtx.drawImage(window.gameVisuals.foliage, x - zoomedSize, y - zoomedSize, zoomedSize * 2, zoomedSize * 2);
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
      if (terrain.name === 'Water' && window.gameVisuals.water.complete) {
          const {x, y} = hexToPixel(q, r);
          const zoomedSize = hexSize * window.cameraZoom;
          window.mapCtx.globalAlpha = 0.5;
          window.mapCtx.drawImage(window.gameVisuals.water, x - zoomedSize, y - zoomedSize, zoomedSize * 2, zoomedSize * 2);
          window.mapCtx.globalAlpha = 1.0;
      }
  });

  // 5. PASS 4: Highlights
  highlightedHexes.forEach(hex => {
      const {x,y} = hexToPixel(hex.q, hex.r);
      if (hex.type === 'move') {
          drawHex(x,y, hexSize, { stroke: '#00f', lineWidth: 2 * window.cameraZoom, fill: 'rgba(0,0,255,0.1)'});
      } else if (hex.type === 'attack') {
          drawHex(x,y, hexSize, { stroke: '#f00', lineWidth: 2 * window.cameraZoom, fill: 'rgba(255,0,0,0.1)'});
      } else if (hex.type === 'turn') {
          drawHex(x,y, hexSize, { stroke: '#ff0', lineWidth: 4 * window.cameraZoom });
      }
  });

  // 6. PASS 5: Night Filter
  if (window.lightLevel < 1.0) {
      window.mapCtx.fillStyle = `rgba(0,0,0,${(1.0 - window.lightLevel) * 0.7})`; 
      window.mapCtx.fillRect(0, 0, window.mapCanvas.width, window.mapCanvas.height);
  }
}

function clearHighlights() {
    window.highlightedHexes.length = 0;
}

// Corrected flat-top screenToHex formula - UPDATED for camera
function screenToHex(pos){
  const rect = window.mapCanvas.getBoundingClientRect();
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

function findPath(start, target, availableTP, entity, ignoreTP = false, preferredPath = null) {
    const queue = [{
        hex: start,
        path: [start],
        cost: 0,
        priority: distance(start, target)
    }];
    
    const visited = new Map(); // Store min cost to each hex
    visited.set(`${start.q},${start.r}`, 0);
    
    let iterations = 0;
    while (queue.length > 0) {
        if (iterations++ > 5000) return null; // Increased for larger map

        // Sort by priority (A*)
        queue.sort((a, b) => a.priority - b.priority);
        const { hex: current, path, cost } = queue.shift();

        if (current.q === target.q && current.r === target.r) return path;

        const neighbors = getNeighbors(current.q, current.r);
        for (let next of neighbors) {
            const key = `${next.q},${next.r}`;
            
            // TASK 2: Knowledge-based pathing for player
            const isPlayer = (entity.side === 'player');
            const isVisible = window.isVisibleToPlayer(next);
            const isExplored = window.isHexExplored(next.q, next.r);

            // Check for ENEMY obstacles (Living enemies only)
            // Friendlies DO NOT block movement
            const occupant = window.entities.find(e => 
                e.alive && e.side !== entity.side &&
                e.getAllHexes().some(h => h.q === next.q && h.r === next.r)
            );

            if (occupant) {
                const isKnownObstacle = !isPlayer || isVisible;
                if (isKnownObstacle) {
                    // It's a known obstacle. 
                    // Task 1: If it's the target hex, it's blocked. 
                    // (Old logic allowed pathing TO occupied hexes, we now block it if known).
                    continue; 
                }
            }
            
            // Calculate cost
            let baseCost = 5;
            if (entity.skills) {
                if (entity.skills['fastMovement']) {
                    const isLightOrNoArmor = !entity.equipped || !entity.equipped.armor || window.items[entity.equipped.armor]?.id === 'light_armor';
                    if (isLightOrNoArmor) baseCost -= entity.skills['fastMovement'];
                }
                if (entity.skills['swift_step']) {
                    const isUnarmored = (!entity.equipped || !entity.equipped.armor) && (!entity.equipped || !entity.equipped.offhand || window.items[entity.equipped.offhand].type !== 'shield');
                    if (isUnarmored) baseCost -= 1;
                }
            }
            baseCost = Math.max(1, baseCost); 

            // PREFERRED PATH DISCOUNT (Stay Together)
            if (preferredPath && preferredPath.includes(key)) {
                baseCost = Math.max(1, baseCost - 2);
            }

            const terrain = window.getTerrainAt(next.q, next.r);
            // Wall check
            if (terrain.name === 'Wall') {
                const isKnownWall = !isPlayer || isExplored;
                if (isKnownWall) continue;
            }

            const nextCost = cost + (baseCost * terrain.moveCostMult);

            // Allow one last step that crosses the availableTP threshold
            if (!ignoreTP && availableTP !== undefined && nextCost > availableTP && cost >= availableTP) continue;

            if (!visited.has(key) || nextCost < visited.get(key)) {
                visited.set(key, nextCost);
                queue.push({
                    hex: next,
                    path: [...path, next],
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

function hasLineOfSight(start, end) {
    const d = distance(start, end);
    const nightFactor = window.lightLevel || 1.0;
    
    let baseVisionCap = 30;
    let viewerTorchRadius = 0;
    
    const viewer = window.entities.find(e => e.hex.q === start.q && e.hex.r === start.r);
    if (viewer) {
        baseVisionCap += (viewer.visionBonus || 0);
        if (viewer.equipped) {
            [viewer.equipped.weapon, viewer.equipped.offhand, viewer.equipped.accessory].forEach(iid => {
                if (iid && window.items[iid]?.lightRadius) viewerTorchRadius = Math.max(viewerTorchRadius, window.items[iid].lightRadius);
            });
        }
    }

    // Is the target illuminated by ANY source?
    let targetIsIlluminated = false;
    
    // Check entities for torches/accessories
    window.entities.forEach(e => {
        if (!e.alive || !e.equipped) return;
        let r = 0;
        [e.equipped.weapon, e.equipped.offhand, e.equipped.accessory].forEach(iid => {
            if (iid && window.items[iid]?.lightRadius) r = Math.max(r, window.items[iid].lightRadius);
        });
        if (r > 0 && distance(e.hex, end) <= r) targetIsIlluminated = true;
    });

    // Check stationary tile objects
    for (const key in window.tileObjects) {
        const obj = window.tileObjects[key];
        if (obj.lightRadius > 0) {
            const [oq, or] = key.split(',').map(Number);
            if (distance({q:oq, r:or}, end) <= obj.lightRadius) targetIsIlluminated = true;
        }
    }

    let effectiveVisionCap = baseVisionCap * nightFactor;
    effectiveVisionCap = Math.max(effectiveVisionCap, viewerTorchRadius);
    
    if (targetIsIlluminated) {
        // If target is lit up, we can see them up to our full potential vision range
        effectiveVisionCap = Math.max(effectiveVisionCap, baseVisionCap);
    }

    if (d > effectiveVisionCap) return false;

    const startOnWall = window.getTerrainAt(start.q, start.r).name === 'Wall';
    const endOnWall = window.getTerrainAt(end.q, end.r).name === 'Wall';

    // FLYING LOS BYPASS
    if (viewer && viewer.isFlying) return true;

    for (let i = 0; i <= d; i++) {
        const t = d === 0 ? 0 : i / d;
        const current = hexRound(hexLerp(start, end, t).q, hexLerp(start, end, t).r);
        
        if ((current.q === start.q && current.r === start.r) || (current.q === end.q && current.r === end.r)) continue;

        const terrain = window.getTerrainAt(current.q, current.r);
        if (terrain.name === 'Wall') {
            const adjacentToStart = distance(start, current) === 1;
            const adjacentToEnd = distance(end, current) === 1;

            if (startOnWall && adjacentToStart) continue;
            if (endOnWall && adjacentToEnd) continue;

            return false;
        }
    }
    return true;
}

function hasLineOfEffect(start, end) {
    return hasLineOfSight(start, end);
}

function isVisibleToPlayer(targetHex) {
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player');
    for (let f of friendlies) {
        // Player entities are always seen
        f.hasBeenSeenByPlayer = true;

        const myHexes = f.getAllHexes();
        for (let fh of myHexes) {
            const dist = distance(fh, targetHex);
            
            // Vision Range affected by light
            let visionRange = 30 + (f.visionBonus || 0);
            const light = window.lightLevel || 1.0;
            
            // Elf Darkvision: treat light as 1.0 for range if they have the skill
            const effectiveLight = (f.skills?.elf_darkvision) ? 1.0 : light;
            const finalRange = visionRange * Math.max(0.2, effectiveLight);

            if (dist <= finalRange && hasLineOfSight(fh, targetHex)) {
                window.exploredHexes.add(`${targetHex.q},${targetHex.r}`);
                if (!window.lastSeenTimeMap) window.lastSeenTimeMap = {};
                window.lastSeenTimeMap[`${targetHex.q},${targetHex.r}`] = window.worldSeconds;
                
                // Mark any entity at this hex as seen
                const ent = window.entities.find(e => e.alive && e.hex.q === targetHex.q && e.hex.r === targetHex.r);
                if (ent) {
                    if (ent.side === 'enemy' && !ent.hasBeenSeenByPlayer) {
                        // NEWLY SEEN ENEMY
                        ent.hasBeenSeenByPlayer = true;
                        
                        // DIALOGUE: PC sees enemy
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

                return true;
            }
        }
    }
    return false;
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
        totalDragDistance = 0; // Reset
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        window.cameraX += dx;
        window.cameraY += dy;
        totalDragDistance += Math.abs(dx) + Math.abs(dy); // Accumulate distance
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

        const newZoom = Math.min(Math.max(0.05, window.cameraZoom * delta), 5.0);
        
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

            window.cameraZoom = Math.min(Math.max(0.05, window.cameraZoom * delta), 5.0);
            window.cameraX = centerX - worldX * window.cameraZoom;
            window.cameraY = centerY - worldY * window.cameraZoom;

            drawMap();
            window.renderEntities();
        }
    }, { passive: false });

    mapCanvas.addEventListener('touchend', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (e.touches.length < 2) lastPinchDist = 0;
        if (e.touches.length === 0) isDragging = false;
    });

    drawMap();
  }
}

function centerCameraOn(hex) {
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
window.getHexBehind = getHexBehind;
window.isHexInBounds = isHexInBounds;
window.initHexMap = initHexMap;
