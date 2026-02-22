// gameEngine.js

window.gamePhase = 'WAITING'; // WAITING, PLAYER_TURN, AI_TURN
window.isPausedForReaction = false;

function getEntityAtHex(q, r) {
    return window.entities.find(e => e.alive && e.getAllHexes().some(h => h.q === q && h.r === r));
}

function getMinDistance(entA, entB) {
    const hexesA = entA.getAllHexes();
    const hexesB = entB.getAllHexes();
    let minD = Infinity;
    hexesA.forEach(ha => {
        hexesB.forEach(hb => {
            const d = window.distance(ha, hb);
            if (d < minD) minD = d;
        });
    });
    return minD;
}

function syncBackToPlayer(entity) {
    if (entity.side === 'player' && window.party) {
        const char = window.party.find(p => p.name === entity.name);
        if (char) {
            char.hp = entity.hp;
            char.currentMana = entity.currentMana;
            char.offhandAttackAvailable = entity.offhandAttackAvailable;
            if (char === window.player) window.showCharacter(); 
        }
    }
}

function playerMoveProcess(player, path) {
    if (!path || path.length === 0) {
        finalizePlayerAction(player, true);
        return;
    }

    if (player.webbedDuration > 0) {
        window.showMessage(`${player.name} is webbed and cannot move! (${Math.ceil(player.webbedDuration)} TP remaining)`);
        finalizePlayerAction(player, true);
        return;
    }

    const previousHex = { q: player.hex.q, r: player.hex.r };
    const nextHex = path[0];

    checkMovementReactions(player, nextHex, (forceEnd) => {
        const occupant = getEntityAtHex(nextHex.q, nextHex.r);
        
        if (forceEnd && occupant && occupant !== player && occupant !== player.riding) {
            window.showMessage(`Halted inside ${occupant.name}'s hex! Shunted back.`);
            player.hex = previousHex;
        } else {
            player.hex = nextHex;
            if (player.riding) player.riding.hex = { q: nextHex.q, r: nextHex.r };
        }
        
        const moveEntity = player.riding || player;
        let baseMoveCost = 5;
        if (player.isStealthed) {
            let stealthPenalty = 4;
            if (player.skills?.speedy_stealth) stealthPenalty -= 2;
            baseMoveCost += stealthPenalty;
        }
        if (moveEntity.skills) {
            if (moveEntity.skills['fastMovement']) {
                const isLightOrNoArmor = !moveEntity.equipped || !moveEntity.equipped.armor || window.items[moveEntity.equipped.armor].id === 'light_armor';
                if (isLightOrNoArmor) baseMoveCost -= moveEntity.skills['fastMovement'];
            }
            if (moveEntity.skills['swift_step']) {
                const isUnarmored = (!moveEntity.equipped || !moveEntity.equipped.armor) && (!moveEntity.equipped || !moveEntity.equipped.offhand || window.items[moveEntity.equipped.offhand].type !== 'shield');
                if (isUnarmored) baseMoveCost -= 1;
            }
        }
        baseMoveCost = Math.max(1, baseMoveCost);
        const terrain = window.getTerrainAt(player.hex.q, player.hex.r);
        const stepCost = baseMoveCost * terrain.moveCostMult;
        
        let canAfford = true;
        if (player.riding) {
            if (player.riding.timePoints >= 80 + stepCost) {
                spendTP(player.riding, stepCost);
            } else {
                window.showMessage("Mount is exhausted!");
                canAfford = false;
            }
        } else {
            if (player.timePoints >= 80 + stepCost) {
                spendTP(player, stepCost);
            } else {
                canAfford = false;
            }
        }

        if (forceEnd || !canAfford) {
            if (forceEnd) {
                window.showMessage("Your turn was halted!");
                let threshold = 80;
                if (player.skills && player.skills['quickRecovery']) threshold -= player.skills['quickRecovery'];
                player.timePoints = threshold; 
            }
            finalizePlayerAction(player, true);
        } else {
            path.shift();
            let threshold = 80;
            if (player.skills && player.skills['quickRecovery']) threshold -= player.skills['quickRecovery'];
            
            const mountExhausted = player.riding && player.riding.timePoints <= 80;
            
            // Check if current hex is occupied by another friendly (squeezing)
            const isSqueezing = window.entities.some(e => e.alive && e !== player && e !== player.riding && e.hex.q === player.hex.q && e.hex.r === player.hex.r);

            if ((player.timePoints > threshold && !mountExhausted && path.length > 0) || (isSqueezing && path.length > 0)) {
                setTimeout(() => playerMoveProcess(player, path), 100);
            } else {
                finalizePlayerAction(player, true);
            }
        }
    });
}

function finalizePlayerAction(player, actionHandled) {
    if (!player) return;

    if (actionHandled !== 'main_attack' && actionHandled !== false) {
        player.offhandAttackAvailable = false;
    }

    let threshold = 80;
    if (player.skills && player.skills['quickRecovery']) {
        threshold -= player.skills['quickRecovery'];
    }

    const shouldEndTurn = (Math.floor(player.timePoints) <= threshold) || (actionHandled === true);

    if (shouldEndTurn) {
        window.clearHighlights();
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        
        if (player.riding && player.riding.timePoints > 80) {
            player.riding.timePoints = 80;
        }

        window.drawMap();
        window.renderEntities();
    } else {
        updatePlayerUI();
        window.updateActionButtons();
    }
    window.updateTurnIndicator();
    syncBackToPlayer(player);

    // Sync World Map Indicator Position
    if (player.name.includes("Player") && window.battleToWorld) {
        const wp = window.battleToWorld(player.hex.q, player.hex.r);
        window.playerWorldPos = { x: wp.col, y: wp.row };
    }
}

function checkMovementReactions(movingEntity, nextHex, callback) {
    const potentialReactors = window.entities.filter(e => e.alive && e !== movingEntity && window.areAdjacent(nextHex, e.hex));
    let allOptions = [];
    potentialReactors.forEach(r => {
        const weaponId = (r.equipped && r.equipped.weapon) ? r.equipped.weapon : null;
        if (weaponId === 'spear') {
            if (r.skills['spear_intercept'] && r.timePoints >= 5) {
                allOptions.push({ id: `intercept_${r.name}`, name: `${r.name}: Intercept`, tpCost: 5, reactor: r });
            }
            if (r.skills['spear_halt'] && r.timePoints >= 1) {
                allOptions.push({ id: `halt_${r.name}`, name: `${r.name}: Halt`, tpCost: 1, reactor: r });
            }
        }
        if (r.skills['sidestep']) {
            let tpCost = 6;
            if (r.skills['sidestep_mastery']) tpCost -= 1;
            if (r.timePoints >= tpCost) {
                allOptions.push({ id: `sidestep_${r.name}`, name: `${r.name}: Sidestep`, tpCost: tpCost, reactor: r });
            }
        }
    });

    if (allOptions.length > 0) {
        const playerOption = allOptions.find(o => o.reactor.side === 'player' && o.reactor.name !== 'Wolf');
        if (playerOption) {
            window.requestReaction(playerOption.reactor, allOptions.filter(o => o.reactor.side === 'player'), (choiceId) => {
                if (choiceId) {
                    const opt = allOptions.find(o => o.id === choiceId);
                    if (choiceId.startsWith('intercept')) {
                        spendTP(opt.reactor, 5);
                        window.showMessage(`${opt.reactor.name} reacts with Spear Intercept!`);
                        resolveAttack(opt.reactor, movingEntity, false);
                        callback(false);
                    } else if (choiceId.startsWith('halt')) {
                        spendTP(opt.reactor, 1);
                        window.showMessage(`${opt.reactor.name} reacts with Spear Halt!`);
                        callback(true); 
                    } else if (choiceId.startsWith('sidestep')) {
                        const reactor = opt.reactor;
                        const cost = opt.tpCost;
                        window.showMessage(`${reactor.name} Sidesteps! Select an adjacent free hex.`);
                        // Highlight adjacent free hexes
                        window.clearHighlights();
                        const neighbors = window.getNeighbors(reactor.hex.q, reactor.hex.r);
                        neighbors.forEach(nh => {
                            if (!getEntityAtHex(nh.q, nh.r) && window.getTerrainAt(nh.q, nh.r).name !== 'Water') {
                                window.highlightedHexes.push({ q: nh.q, r: nh.r, type: 'move' });
                            }
                        });
                        window.drawMap();
                        
                        // Wait for a click
                        const board = document.getElementById('mapCanvas');
                        const sidestepHandler = (ev) => {
                            const clickedHex = window.screenToHex({x: ev.clientX, y: ev.clientY});
                            if (window.highlightedHexes.some(h => h.q === clickedHex.q && h.r === clickedHex.r)) {
                                reactor.hex = clickedHex;
                                if (reactor.riding) reactor.riding.hex = { q: clickedHex.q, r: clickedHex.r };
                                spendTP(reactor, cost);
                                window.clearHighlights();
                                window.drawMap();
                                window.renderEntities();
                                board.removeEventListener('click', sidestepHandler);
                                callback(false);
                            }
                        };
                        board.addEventListener('click', sidestepHandler);
                    }
                } else {
                    callback(false);
                }
            });
        } else {
            callback(false);
        }
    } else {
        callback(false);
    }
}

function getHexesInRange(startHex, range) {
    const results = [];
    for (let q = -range; q <= range; q++) {
        for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
            const hex = { q: startHex.q + q, r: startHex.r + r };
            if (window.isHexInBounds(hex)) {
                results.push(hex);
            }
        }
    }
    return results;
}

function updatePlayerUI() {
    if (!window.currentTurnEntity || window.currentTurnEntity.side !== 'player') return;

    window.clearHighlights();
    const player = window.currentTurnEntity;
    
    window.highlightedHexes.push({ q: player.hex.q, r: player.hex.r, type: 'turn' });

    let threshold = 80;
    if (player.skills && player.skills['quickRecovery']) {
        threshold -= player.skills['quickRecovery'];
    }
    
    const moveEntity = player.riding || player;
    const availableTP = moveEntity.timePoints - 80; 
    
    // Optimized UI: Only check visible range for movement highlights
    // Instead of all mapCols, check a radius around player
    const visibleRange = 20; // Optimization
    const hexes = getHexesInRange(player.hex, visibleRange);

    hexes.forEach(h => {
        if (h.q === player.hex.q && h.r === player.hex.r) return;
        
        const path = window.findPath(player.hex, h, availableTP, moveEntity);
        const dist = window.distance(player.hex, h);
        
        let baseCost = 5;
        if (moveEntity.skills) {
            if (moveEntity.skills['fastMovement']) {
                const isLightOrNoArmor = !moveEntity.equipped || !moveEntity.equipped.armor || window.items[moveEntity.equipped.armor].id === 'light_armor';
                if (isLightOrNoArmor) baseCost -= moveEntity.skills['fastMovement'];
            }
            if (moveEntity.skills['swift_step']) {
                const isUnarmored = (!moveEntity.equipped || !moveEntity.equipped.armor) && (!moveEntity.equipped || !moveEntity.equipped.offhand || window.items[moveEntity.equipped.offhand].type !== 'shield');
                if (isUnarmored) baseCost -= 1;
            }
        }
        const terrain = window.getTerrainAt(h.q, h.r);
        const minStepCost = Math.max(1, baseCost) * terrain.moveCostMult;

        const canStep = availableTP >= minStepCost;

        if (player.timePoints > threshold && (path || (dist === 1 && canStep))) {
            if (!getEntityAtHex(h.q, h.r)) {
                window.highlightedHexes.push({ ...h, type: 'move' });
            }
        }
    });

    let attackRange = 1;
    if (player.equipped && player.equipped.weapon) {
        attackRange += (window.items[player.equipped.weapon].range || 0);
    }
    const attackHexes = getHexesInRange(player.hex, attackRange);
    attackHexes.forEach(h => {
        const target = getEntityAtHex(h.q, h.r);
        if (target && target.side !== player.side) {
            window.highlightedHexes.push({ ...h, type: 'attack' });
        }
    });

    window.drawMap();
    window.renderEntities();
}

function startGameCore(isLoading = false) {
  window.gamePhase = 'WAITING';
  window.playerWorldPos = { x: 220, y: 200 };
  window.activeSpells = window.activeSpells || [];

  window.mapCanvas = document.getElementById("mapCanvas");
  window.mapCtx = window.mapCanvas.getContext("2d");
  window.resizeCanvas();

  const visuals = {
      playerBase: new Image(),
      leatherArmor: new Image(),
      chainArmor: new Image(),
      monsterDefault: new Image(),
      orcBase: new Image(),
      swordIcon: new Image(),
      // New Human Visuals
      humanBase: new Image(),
      humanHair: new Image(),
      humanLight: new Image(),
      humanMedium: new Image(),
      humanHeavy: new Image(),
      horse: new Image(),
      nasal_helm: new Image(),
      humanMaleBase: new Image(),
      elfMaleBase: new Image(),
      elfFemaleBase: new Image(),
      elfFemaleHair: new Image(),
      dwarfMaleBase: new Image(),
      dwarfFemaleBase: new Image(),
      dwarfMaleHair: new Image(),
      shield: new Image(),
      skeleton: new Image(),
      zombie: new Image(),
      imp: new Image(),
      wolf: new Image(),
      torch_lit: new Image(),
      fireplace: new Image(),
      axe: new Image(),
      troll: new Image(),
      spider1: new Image(),
      spider2: new Image(),
      arenaannouncer: new Image(),
      arenamercenary: new Image(),
      arenashopkeeper: new Image(),
      grishnak: new Image(),
      floor1: new Image(),
      floor2: new Image(),
      floor3: new Image(),
      floor4: new Image(),
      overlay_blood: new Image(),
      overlay_skull: new Image()
  };
  visuals.playerBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.leatherArmor.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.chainArmor.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.monsterDefault.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.orcBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.swordIcon.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.humanBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.humanHair.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.humanLight.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.humanMedium.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.humanHeavy.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.horse.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.nasal_helm.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.humanMaleBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.elfMaleBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.elfFemaleBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.elfFemaleHair.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.dwarfMaleBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.dwarfFemaleBase.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.dwarfMaleHair.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.shield.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.skeleton.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.zombie.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.imp.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.wolf.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.torch_lit.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.fireplace.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.axe.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.troll.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.spider1.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.spider2.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.arenaannouncer.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.arenamercenary.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.arenashopkeeper.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.grishnak.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.floor1.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.floor2.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.floor3.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.floor4.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.overlay_blood.onload = () => { window.drawMap(); window.renderEntities(); };
  visuals.overlay_skull.onload = () => { window.drawMap(); window.renderEntities(); };

  visuals.playerBase.src = 'images/elf.png';
  visuals.leatherArmor.src = 'images/elfleatherarmour.png';
  visuals.chainArmor.src = 'images/elfchainarmour.png';
  visuals.monsterDefault.src = 'images/goblin.png';
  visuals.orcBase.src = 'images/orc.png';
  visuals.swordIcon.src = 'images/sword.png';
  // Human Sources
  visuals.humanBase.src = 'images/humanfemale.png';
  visuals.humanHair.src = 'images/humanfemalehair.png';
  visuals.humanLight.src = 'images/humanlightarmour.png';
  visuals.humanMedium.src = 'images/humanmediumarmour.png';
  visuals.humanHeavy.src = 'images/humanheavyarmour.png';
  visuals.horse.src = 'images/horse.png';
  visuals.nasal_helm.src = 'images/nasalHelm.png';
  visuals.humanMaleBase.src = 'images/humanmale.png';
  visuals.elfMaleBase.src = 'images/elfmale.png';
  visuals.elfFemaleBase.src = 'images/elffemale.png';
  visuals.elfFemaleHair.src = 'images/elffemalehair.png';
  visuals.dwarfMaleBase.src = 'images/dwarfmale.png';
  visuals.dwarfFemaleBase.src = 'images/dwarffemale.png';
  visuals.dwarfMaleHair.src = 'images/dwarfmalehair.png';
  visuals.shield.src = 'images/shield.png';
  visuals.skeleton.src = 'images/skeleton.svg';
  visuals.zombie.src = 'images/zombie.svg';
  visuals.imp.src = 'images/imp.svg';
  visuals.wolf.src = 'images/wolf.png';
  visuals.torch_lit.src = 'images/torch_lit.svg';
  visuals.fireplace.src = 'images/fireplace.svg';
  visuals.axe.src = 'images/axe.png';
  visuals.troll.src = 'images/troll.png';
  visuals.spider1.src = 'images/spider1.png';
  visuals.spider2.src = 'images/spider2.png';
  visuals.arenaannouncer.src = 'images/arenaannouncer.png';
  visuals.arenamercenary.src = 'images/arenamercenary.png';
  visuals.arenashopkeeper.src = 'images/arenashopkeeper.png';
  visuals.grishnak.src = 'images/Grishnak.png';
  visuals.floor1.src = 'images/arenaHexFloor1.png';
  visuals.floor2.src = 'images/arenaHexFloor2.png';
  visuals.floor3.src = 'images/arenaHexFloor3.png';
  visuals.floor4.src = 'images/arenaHexFloor4.png';
  visuals.overlay_blood.src = 'images/overlay blood.png';
  visuals.overlay_skull.src = 'images/overlay skull.png';
  
  window.gameVisuals = visuals;

  if (window.loadWorldMap) window.loadWorldMap();

  if (isLoading) {
      document.addEventListener("keydown", window.handleMovement);
      window.mapCanvas.addEventListener("click", window.handleClick);
      if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
      return;
  }

  // Terrain generation is now implicit in getTerrainAt

  if (window.currentCampaign === "1") {
      setupArenaLobby();
      document.addEventListener("keydown", window.handleMovement);
      window.mapCanvas.addEventListener("click", window.handleClick);
      if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
      return;
  }

  const playerEntity = new window.Entity(window.party[0].name, "red", {q: window.playerPos.q, r: window.playerPos.r}, window.party[0].attributes.agility + 10);
  playerEntity.side = 'player';
  Object.assign(playerEntity, window.party[0]);
  playerEntity.skills = window.party[0].skills;

  window.entities = [playerEntity];
  
  const neighbors = window.getNeighbors(playerEntity.hex.q, playerEntity.hex.r);
  let spawnHex = neighbors.find(h => {
      const terrain = window.getTerrainAt(h.q, h.r);
      const occupant = getEntityAtHex(h.q, h.r);
      return terrain.name !== 'Water' && !occupant;
  });
  if (spawnHex) {
      const horse = window.createMonster('horse', spawnHex, null, null, 'player');
      window.entities.push(horse);
  }

  spawnNewMonster();

  window.drawMap();
  window.renderEntities();
  window.showCharacter();

  if (playerEntity.skills['initiativeBonus']) {
      playerEntity.timePoints += (playerEntity.skills['initiativeBonus'] * 5);
  }

  document.addEventListener("keydown", window.handleMovement);
  window.mapCanvas.addEventListener("click", window.handleClick);
  if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
}

function renderEntities() {
  const z = window.cameraZoom || 1.0;
  
  for (const coord in window.mapItems) {
      const items = window.mapItems[coord];
      if (items && items.length > 0) {
          const [q, r] = coord.split(',').map(Number);
          const {x, y} = window.hexToPixel(q, r);
          const size = window.hexSize * 0.8 * z;
          if (window.gameVisuals.swordIcon.complete) {
              window.mapCtx.drawImage(window.gameVisuals.swordIcon, x - size/2, y - size/2, size, size);
          }
      }
  }

  // Render Tile Objects (Fireplaces etc.)
  for (const key in window.tileObjects) {
      const obj = window.tileObjects[key];
      const [q, r] = key.split(',').map(Number);
      if (window.isVisibleToPlayer({q, r})) {
          const {x, y} = window.hexToPixel(q, r);
          const size = window.hexSize * 1.5 * z;
          if (obj.type === 'fireplace' && window.gameVisuals.fireplace.complete) {
              window.mapCtx.drawImage(window.gameVisuals.fireplace, x - size/2, y - size/2, size, size);
          }
      }
  }

  // 2. Sort entities by "z-index" for layering: Rider -> Normal -> Mounts (on top)
  const sorted = [...window.entities].filter(e => e.alive && window.isVisibleToPlayer(e.hex)).sort((a, b) => {
      const az = a.rider ? 3 : (a.riding ? 1 : 2); // Mounts (has rider) get 3, Riders (riding something) get 1
      const bz = b.rider ? 3 : (b.riding ? 1 : 2);
      return az - bz;
  });

      sorted.forEach(e => {
      const {x,y} = window.hexToPixel(e.hex.q, e.hex.r);
      // Basic off-screen culling for drawing
      if (x < -100 || y < -100 || x > window.mapCanvas.width + 100 || y > window.mapCanvas.height + 100) return;
  
      if (e.isStealthed) window.mapCtx.globalAlpha = 0.5;
      
      const isSentientAlly = e.side === 'player' && e.name !== 'Wolf' && e.name !== 'Horse';
  
      if (isSentientAlly && window.gameVisuals) {
          const size = window.hexSize * 2.0 * z;
          
          if (e.race === 'human') {
              const humanSizeMult = e.gender === 'male' ? 1.8 : 1.6; // 10% vs 20% smaller than 2.0
              const humanSize = window.hexSize * humanSizeMult * z;
              const humanYOff = (humanSizeMult * -3) * z; // Proportional offset
              const humanHeightAdd = (humanSizeMult * 6) * z;
  
              // LAYER: Human Base (Gendered)
              const baseImg = e.gender === 'male' ? window.gameVisuals.humanMaleBase : window.gameVisuals.humanBase;
              if (baseImg.complete) {
                  window.mapCtx.drawImage(baseImg, x - humanSize/2, y - humanSize/2 + humanYOff, humanSize, (humanSize + humanHeightAdd));
              }
              // LAYER: Human Hair (ONLY FOR FEMALE, MOVED UP 3px * z)
              if (e.gender !== 'male' && window.gameVisuals.humanHair.complete) {
                  window.mapCtx.drawImage(window.gameVisuals.humanHair, x - humanSize/2, y - humanSize/2 + humanYOff - (3 * z), humanSize, (humanSize + humanHeightAdd));
              }
              // LAYER: Human Helmet
              if (e.equipped && e.equipped.helmet === 'nasal_helm' && window.gameVisuals.nasal_helm.complete) {
                  window.mapCtx.drawImage(window.gameVisuals.nasal_helm, x - humanSize/2, y - humanSize/2 + humanYOff, humanSize, (humanSize + humanHeightAdd));
              }
              // LAYER: Human Armour
              let armorImg = null;
              if (e.equipped && e.equipped.armor) {
                  const aid = e.equipped.armor;
                  if (aid === 'light_armor') armorImg = window.gameVisuals.humanLight;
                  else if (aid === 'medium_armor') armorImg = window.gameVisuals.humanMedium;
                  else if (aid === 'heavy_armor') armorImg = window.gameVisuals.humanHeavy;
              }
              if (armorImg && armorImg.complete) {
                  window.mapCtx.drawImage(armorImg, x - humanSize/2, y - humanSize/2 + humanYOff, humanSize, (humanSize + humanHeightAdd));
              }
              
              // LAYER: Shield (Human Scale)
              if (e.equipped && e.equipped.offhand && window.items[e.equipped.offhand].type === 'shield' && window.gameVisuals.shield.complete) {
                  window.mapCtx.drawImage(window.gameVisuals.shield, x - humanSize/2, y - humanSize/2 + humanYOff, humanSize, humanSize + humanHeightAdd);
              }
          } else {
              // LAYER: Non-human (Elf/Dwarf) Base
              let baseImg = null;
              let currentSize = size;
              let currentYOff = -6 * z;
              let currentHeight = size + 12 * z;
  
              if (e.race === 'elf') {
                  baseImg = e.gender === 'male' ? window.gameVisuals.elfMaleBase : window.gameVisuals.elfFemaleBase;
              } else if (e.race === 'dwarf') {
                  baseImg = e.gender === 'male' ? window.gameVisuals.dwarfMaleBase : window.gameVisuals.dwarfFemaleBase;
                  // Dwarf 20% smaller
                  currentSize = size * 0.8;
                  currentHeight = (size + 12 * z) * 0.8;
                  currentYOff = -2 * z; 
              } else {
                  baseImg = window.gameVisuals.playerBase; // Fallback
              }
  
              if (baseImg && baseImg.complete) {
                  window.mapCtx.drawImage(baseImg, x - currentSize/2, y - currentSize/2 + currentYOff, currentSize, currentHeight);
              }
  
              // LAYER: Dwarf Male Hair
              if (e.race === 'dwarf' && e.gender === 'male' && window.gameVisuals.dwarfMaleHair.complete) {
                  window.mapCtx.drawImage(window.gameVisuals.dwarfMaleHair, x - currentSize/2, y - currentSize/2 + currentYOff, currentSize, currentHeight);
              }
  
              // LAYER: Elf Female Hair
              if (e.race === 'elf' && e.gender === 'female' && window.gameVisuals.elfFemaleHair.complete) {
                  window.mapCtx.drawImage(window.gameVisuals.elfFemaleHair, x - currentSize/2, y - currentSize/2 + currentYOff, currentSize, currentHeight);
              }
  
              // LAYER: Non-human Armour
              let armorImg = null;
              if (e.equipped && e.equipped.armor) {
                  const armorId = e.equipped.armor;
                  if (armorId === 'medium_armor' || armorId === 'heavy_armor') armorImg = window.gameVisuals.chainArmor;
                  else if (armorId === 'light_armor') armorImg = window.gameVisuals.leatherArmor;
              }
              if (armorImg && armorImg.complete) {
                  window.mapCtx.drawImage(armorImg, x - currentSize/2, (y - currentSize/2) + (15 * z), currentSize, currentSize);
              }
              // LAYER: Shield (Elf/Dwarf Scale)
              if (e.equipped && e.equipped.offhand && window.items[e.equipped.offhand].type === 'shield' && window.gameVisuals.shield.complete) {
                  const shieldSize = currentSize;
                  window.mapCtx.drawImage(window.gameVisuals.shield, x - shieldSize/2, y - shieldSize/2 + currentYOff, shieldSize, currentHeight);
              }
          }
          
          // WEAPON LAYER: Sword or Axe
          let weaponImg = null;
          if (e.equipped?.weapon === 'sword') weaponImg = window.gameVisuals.swordIcon;
          else if (e.equipped?.weapon === 'axe') weaponImg = window.gameVisuals.axe;
  
          if (weaponImg && weaponImg.complete) {
              const weaponSize = window.hexSize * 1.0 * z; 
              window.mapCtx.drawImage(weaponImg, x - (window.hexSize/2 + 5) * z, y - weaponSize/2, weaponSize, weaponSize);
          }
      } else if ((e instanceof window.Enemy || e.customImage) && window.gameVisuals) {
          let size = window.hexSize * 1.5 * z;
          let yOffset = 0;
          let widthMult = 1.0;
  
          if (e.name === 'Horse') {
              size = window.hexSize * 4.5 * z; // 3x of 1.5
              yOffset = (Math.sqrt(3) * window.hexSize / 2) * z;
          } else if (e.name === 'Troll') {
              size = window.hexSize * 4.5 * z;
              yOffset = (Math.sqrt(3) * window.hexSize / 2) * z;
          }
  
          if (e.customImage === 'arenamercenary') widthMult = 0.85;
  
          let img = window.gameVisuals.monsterDefault;
          if (e.name === 'Orc' && window.gameVisuals.orcBase.complete) img = window.gameVisuals.orcBase;
          if (e.name === 'Grishnak' && window.gameVisuals.grishnak.complete) img = window.gameVisuals.grishnak;
          if (e.name === 'Spider' && e.spiderImage && window.gameVisuals[e.spiderImage]?.complete) img = window.gameVisuals[e.spiderImage];
          if (e.customImage && window.gameVisuals[e.customImage]?.complete) img = window.gameVisuals[e.customImage];
          if (e.name === 'Horse' && window.gameVisuals.horse.complete) img = window.gameVisuals.horse;
          if (e.name === 'Wolf' && window.gameVisuals.horse.complete) img = window.gameVisuals.horse; // Temporarily horse until visuals.wolf assigned
          if (e.name === 'Troll' && window.gameVisuals.troll.complete) img = window.gameVisuals.troll;
          if (e.name === 'Skeleton' && window.gameVisuals.skeleton.complete) img = window.gameVisuals.skeleton;
          if (e.name === 'Zombie' && window.gameVisuals.zombie.complete) img = window.gameVisuals.zombie;
          if (e.name === 'Imp' && window.gameVisuals.imp.complete) img = window.gameVisuals.imp;
          
          try {
              if (img && img.complete) {
                  const finalWidth = size * widthMult;
                  window.mapCtx.drawImage(img, x - finalWidth/2, y - size/2 + yOffset, finalWidth, size);
              }
          } catch (err) {}
  
          if (e.mountSize > 0 && e.equipped && e.equipped.armor) {
              const armorId = e.equipped.armor;
              let armorImg = (armorId === 'medium_armor' || armorId === 'heavy_armor') ? window.gameVisuals.chainArmor : window.gameVisuals.leatherArmor;
              if (armorImg && armorImg.complete) {
                  window.mapCtx.drawImage(armorImg, x - size/2, y - size/2 + (5 * z), size, size);
              }
          }
  
          if (e.extraHexes.length > 0 && e.name !== 'Horse' && e.name !== 'Troll') {
              const offsets = [{q:0, r:0}, ...e.extraHexes];
              const labels = ['f', 'l', 'r'];
              const prefix = 'T';
              offsets.forEach((off, i) => {
                  const hp = window.hexToPixel(e.hex.q + off.q, e.hex.r + off.r);
                  window.mapCtx.fillStyle = "white";
                  window.mapCtx.font = `${12 * z}px Arial`;
                  window.mapCtx.fillText(prefix + labels[i], hp.x - 5*z, hp.y + 5*z);
              });
          }
  
          // WEAPON LAYER: Axe
          if (e.equipped?.weapon === 'axe' && window.gameVisuals.axe.complete) {
              const weaponSize = window.hexSize * 0.8 * z;
              window.mapCtx.drawImage(window.gameVisuals.axe, x - (window.hexSize/2 + 5) * z, y - weaponSize/2, weaponSize, weaponSize);
          }
  
          if (e.equipped && e.equipped.weapon === 'sword' && window.gameVisuals.swordIcon.complete) {
              const weaponSize = window.hexSize * 0.8 * z;
              window.mapCtx.drawImage(window.gameVisuals.swordIcon, x - (window.hexSize/2 + 5) * z, y - weaponSize/2, weaponSize, weaponSize);
          }
          // AI State Indicator
        if (e.aiState === 'combat') {
            window.mapCtx.fillStyle = "red";
            window.mapCtx.beginPath();
            window.mapCtx.arc(x + 10*z, y - 10*z, 3*z, 0, Math.PI*2);
            window.mapCtx.fill();
        }
    } else {
        window.mapCtx.beginPath();
        window.mapCtx.arc(x, y, 10 * z, 0, 2*Math.PI);
        window.mapCtx.fillStyle = e.color;
        window.mapCtx.fill();
    }

    // UNIVERSAL LAYER: Torch
    if (e.equipped && window.gameVisuals.torch_lit.complete) {
        const hasTorch = (e.equipped.weapon === 'torch' || e.equipped.offhand === 'torch');
        if (hasTorch) {
            const tSize = window.hexSize * 1.0 * z;
            window.mapCtx.drawImage(window.gameVisuals.torch_lit, x + (window.hexSize/3)*z, y - tSize, tSize, tSize);
        }
    }

    window.mapCtx.globalAlpha = 1.0;
  });
}

function tick() {
    if (window.isPausedForReaction) return;

    // REST/SLEEP LOGIC: If resting/sleeping and anyone is ready, auto-wait to spend TP
    if (window.isResting || window.isSleeping) {
        const ready = window.entities.filter(e => e.timePoints >= 100 && e.alive && e.side === 'player' && !e.rider);
        ready.forEach(e => {
            spendTP(e, 1);
        });
        
        const sentientAllies = window.entities.filter(e => e.alive && e.side === 'player' && e.name !== 'Wolf' && e.name !== 'Horse');

        if (window.isResting) {
            const allRestored = sentientAllies.every(e => e.hp >= e.maxHp && (e.maxMana === 0 || e.currentMana >= e.maxMana));
            if (allRestored) {
                window.isResting = false;
                window.showMessage("Rest complete. Everyone is restored.");
                window.updateRestButton();
            }
        }

        if (window.isSleeping) {
            const allRested = sentientAllies.every(e => e.sleepRemainingSeconds <= 0);
            if (allRested) {
                window.isSleeping = false;
                sentientAllies.forEach(e => e.awakeSeconds = 0);
                window.showMessage("Sleep complete. Everyone is well rested.");
                window.updateSleepButton();
            }
        }

        // CHECK INTERRUPT: Enemy seen (Common for both)
        const enemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
        if (enemySeen) {
            if (window.isResting) { window.isResting = false; window.showMessage("Rest interrupted by enemy!"); window.updateRestButton(); }
            if (window.isSleeping) { window.isSleeping = false; window.showMessage("Sleep interrupted by enemy!"); window.updateSleepButton(); }
        }

        // FAST FORWARD SLEEP
        if (window.isSleeping) {
            // Speed up sleep significantly: run many ticks per real tick
            for(let i=0; i<500; i++) {
                runTickInternal();
                if (!window.isSleeping) break;
            }
            return; // Don't run extra logic this tick
        }
    }

    runTickInternal();
}

function runTickInternal() {
    if (window.currentTurnEntity) return;
    
    const readyEntities = window.entities.filter(e => e.timePoints >= 100 && e.alive && !e.rider);
    if (readyEntities.length > 0) {
        readyEntities.sort((a, b) => (b.timePoints !== a.timePoints) ? (b.timePoints - a.timePoints) : (Math.random() - 0.5));
        window.currentTurnEntity = readyEntities[0];
        window.currentTurnEntity.parriesRemaining = 3;
        takeTurn(window.currentTurnEntity);
    } else {
        window.entities.forEach(e => { 
            if (e.alive) {
                // PASSIVE AI: Don't gain TP if idle enemy
                if (e.side === 'enemy' && e.aiState === 'idle') return;

                if (e.timePoints < 150) {
                    const tpGained = e.timePointsPerTick;
                    e.timePoints += tpGained;

                    // POISON TICK
                    if (e.poisonTicks > 0) {
                        e.hp -= e.poisonDamage || 2;
                        e.poisonTicks--;
                        if (e.hp <= 0 && e.alive) {
                            e.alive = false;
                            window.showMessage(`${e.name} died from poison!`);
                            checkCombatEnd();
                        }
                    }

                    // Mana Regeneration
                    let regen = 0.1;
                    if (e.skills?.arcane_regen) regen += e.skills.arcane_regen * 0.1;
                    if (e.skills?.divine_regen) regen += e.skills.divine_regen * 0.1;
                    if (e.skills?.nature_regen) regen += e.skills.nature_regen * 0.1;
                    
                    e.currentMana = Math.min(e.maxMana || 0, (e.currentMana || 0) + (regen * tpGained));

                    // Health Regeneration
                    let hRegen = 0.1;
                    if (e.skills?.health_regen) hRegen += e.skills.health_regen * 0.1;
                    if (e.side === 'player') {
                        e.hp = Math.min(e.maxHp, e.hp + (hRegen * tpGained));
                    }

                    // Ongoing Spell Costs (2.5% of core mana cost per TP gained)
                    const mySpells = (window.activeSpells || []).filter(s => s.casterName === e.name);
                    let totalUpkeep = 0;
                    mySpells.forEach(s => {
                        const cost = s.coreManaCost * 0.025 * tpGained;
                        totalUpkeep += cost;
                        e.currentMana -= cost;
                        if (e.currentMana <= 0) {
                            e.currentMana = 0;
                            window.showMessage(`Spell ${s.name} faded due to lack of mana.`);
                            window.cancelSpell(s.spellInstanceId);
                        }
                    });

                    // REST INTERRUPT: Net negative mana
                    if (window.isResting && e.side === 'player' && (totalUpkeep > regen * tpGained) && e.currentMana < e.maxMana * 0.1) {
                        window.isResting = false;
                        window.showMessage("Rest stopped: maintenance costs too high.");
                        window.updateRestButton();
                    }
                }
                
                if (e.skills['regeneration'] && Math.random() < 0.2) {
                    e.hp = Math.min(e.maxHp, e.hp + 1);
                }
            }
        });
        if (window.updateTime) window.updateTime(0.4);

        // AMBIENT DIALOGUE (Arena Lobby)
        if (window.currentCampaign === "1" && !window.isInArena) {
            window.lobbyTPSpent = (window.lobbyTPSpent || 0) + 1;
            if (window.lobbyTPSpent > 150 && !window.hasTriggeredImpatience) {
                window.triggerAmbientDialogue('arena_lobby_1');
                window.hasTriggeredImpatience = true;
            }
        }
    }
    window.updateTurnIndicator();
}

function takeTurn(entity) {
    let threshold = 80;
    if (entity.skills && entity.skills['quickRecovery']) threshold -= entity.skills['quickRecovery'];

    const isSentientAlly = entity.side === 'player' && entity.name !== 'Wolf' && entity.name !== 'Horse';
    if (entity.side === 'player') {
        window.gamePhase = isSentientAlly ? 'PLAYER_TURN' : 'AI_TURN';
        if (isSentientAlly) window.showMessage(`It is ${entity.name}'s turn!`);
        window.selectCharacterByName(entity.name);

        // AUTO-MOVE LOGIC
        if (entity.destination) {
            autoMoveProcess(entity);
            return;
        }

        if (!isSentientAlly) {
            aiProcess(entity);
        }
    } else {
        window.gamePhase = 'AI_TURN';
        aiProcess(entity);
    }
    window.updateTurnIndicator();
}

function autoMoveProcess(entity) {
    if (window.isPausedForReaction) {
        setTimeout(() => autoMoveProcess(entity), 100);
        return;
    }

    let threshold = 80;
    if (entity.skills && entity.skills['quickRecovery']) threshold -= entity.skills['quickRecovery'];

    if (Math.floor(entity.timePoints) <= threshold || !entity.alive || !entity.destination) {
        finalizePlayerAction(entity, true);
        return;
    }

    // COMBAT INTERRUPT
    const enemies = window.entities.filter(e => e.alive && e.side === 'enemy');
    const seenEnemy = enemies.find(e => {
        const d = window.distance(entity.hex, e.hex);
        const visionCap = 30 + (entity.visionBonus || 0);
        return d <= visionCap && window.hasLineOfSight(entity.hex, e.hex);
    });
    
    const isSqueezing = window.entities.some(e => e.alive && e !== entity && e !== entity.riding && e.hex.q === entity.hex.q && e.hex.r === entity.hex.r);

    if (seenEnemy && !isSqueezing) {
        window.showMessage(`Enemy ${seenEnemy.name} spotted! Engaging combat.`);
        entity.destination = null;
        entity.timePoints = 0; // Stop turn and reset
        if (seenEnemy.aiState === 'idle') wakeUp(seenEnemy);
        finalizePlayerAction(entity, true);
        return;
    }

    if (entity.hex.q === entity.destination.q && entity.hex.r === entity.destination.r) {
        entity.destination = null;
        finalizePlayerAction(entity, true);
        return;
    }

    const moveEntity = entity.riding || entity;
    const availableTP = moveEntity.timePoints - 80;

    // STAY TOGETHER: Slow down if too far ahead of leader
    if (window.groupLeader && entity !== window.groupLeader) {
        const distToLeader = window.distance(entity.hex, window.groupLeader.hex);
        const leaderRemainingDist = window.distance(window.groupLeader.hex, window.groupLeader.destination || window.groupLeader.hex);
        const myRemainingDist = window.distance(entity.hex, entity.destination);
        
        // If I am significantly closer to target than leader is, WAIT
        if (distToLeader > 5 && myRemainingDist < leaderRemainingDist) {
            entity.timePoints = threshold;
            finalizePlayerAction(entity, true);
            return;
        }
    }

    // First check if ANY path exists regardless of current TP
    const fullPath = window.findPath(entity.hex, entity.destination, undefined, moveEntity, true, window.leaderPath);
    
    if (fullPath && fullPath.length > 1) {
        // Path exists. Can we take at least one step?
        const stepPath = window.findPath(entity.hex, fullPath[1], availableTP, moveEntity, false, window.leaderPath);
        if (stepPath && stepPath.length > 1) {
            // Yes, move as far as possible
            playerMoveProcess(entity, fullPath.slice(1));
        } else {
            // Path exists but not enough TP for even 1 step: AUTO PASS
            entity.timePoints = threshold;
            finalizePlayerAction(entity, true);
        }
    } else {
        // Totally blocked
        if (window.distance(entity.hex, entity.destination) > 0) {
            window.showMessage(`${entity.name} path to destination is blocked.`);
            entity.destination = null;
        }
        finalizePlayerAction(entity, true);
    }
}

function aiProcess(entity) {
    if (window.isPausedForReaction) {
        setTimeout(() => aiProcess(entity), 100);
        return;
    }
    if (entity.side === 'neutral') {
        entity.timePoints = 0;
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        return;
    }

    // SPIDER WEB FLING PRIORITY
    if (entity.name === 'Spider' && !entity.hasUsedWeb && entity.timePoints >= 5) {
        const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
        const targets = window.entities.filter(e => e.alive && e.side === opponentSide && !e.webbedDuration && window.distance(entity.hex, e.hex) <= 10 && window.hasLineOfSight(entity.hex, e.hex));
        if (targets.length > 0) {
            targets.sort((a, b) => window.distance(entity.hex, a.hex) - window.distance(entity.hex, b.hex));
            const target = targets[0];
            window.showMessage(`${entity.name} flings a web at ${target.name}!`);
            target.webbedDuration = 40; // TP to spend
            entity.hasUsedWeb = true;
            spendTP(entity, 5);
            setTimeout(() => aiProcess(entity), 100);
            return;
        }
    }

    let threshold = 80;
    if (entity.skills && entity.skills['quickRecovery']) threshold -= entity.skills['quickRecovery'];
    if (Math.floor(entity.timePoints) <= threshold || !entity.alive) {
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        window.drawMap();
        window.renderEntities();
        return;
    }

    // AI STATE LOGIC
    if (entity.side === 'enemy' && entity.aiState !== 'combat') {
        // Idle behavior: Check for enemies
        const targets = window.entities.filter(e => e.alive && e.side === 'player');
        
        const visibleTarget = targets.find(t => canSee(entity, t));

        if (visibleTarget) {
            wakeUp(entity);
            window.showMessage(`${entity.name} spotted a target and engages!`);
        } else {
            // SEARCHING: If I've been hit but see no one
            if (entity.hp < entity.maxHp && !entity.lastSeenTargetHex) {
                // If I have no target but I'm hurt, wander towards "noise" or just random search
                // For now, let's keep idle wander
            }
            // Wander or stand still
            if (Math.random() < 0.3) {
                // Random move
                const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
                const valid = neighbors.filter(h => !getEntityAtHex(h.q, h.r) && window.getTerrainAt(h.q, h.r).name !== 'Water');
                if (valid.length > 0) {
                    const next = valid[Math.floor(Math.random() * valid.length)];
                    entity.hex = next; // Instant move for idle/flavor
                    spendTP(entity, 10);
                } else {
                    spendTP(entity, 10);
                }
            } else {
                spendTP(entity, 10);
            }
            setTimeout(() => aiProcess(entity), 100);
            return;
        }
    }

    // Combat Logic
    const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
    const targets = window.entities.filter(e => e.alive && e.side === opponentSide);
    const visibleTargets = targets.filter(t => canSee(entity, t));

    let target = null;
    if (visibleTargets.length > 0) {
        visibleTargets.sort((a, b) => getMinDistance(entity, a) - getMinDistance(entity, b));
        target = visibleTargets[0];
        entity.lastSeenTargetHex = { q: target.hex.q, r: target.hex.r };
    }

    let huntTargetHex = target ? target.hex : (entity.lastSeenTargetHex || null);
    if (huntTargetHex && !target && entity.hex.q === huntTargetHex.q && entity.hex.r === huntTargetHex.r) {
        entity.lastSeenTargetHex = null;
        huntTargetHex = null;
    }

    if (!huntTargetHex) { 
        entity.timePoints = threshold; 
        aiProcess(entity); 
        return; 
    }

    if (entity.canLoot) {
        const coord = `${entity.hex.q},${entity.hex.r}`;
        if (window.mapItems[coord]?.length > 0 && entity.timePoints >= 1) {
            window.lootItems(entity);
            setTimeout(() => aiProcess(entity), 100);
            return;
        }
    }

    let attackRange = 1;
    if (entity.equipped?.weapon) attackRange += (window.items[entity.equipped.weapon].range || 0);
    const dist = getMinDistance(entity, target || { getAllHexes: () => [huntTargetHex], hex: huntTargetHex });

    let hasLOE = target ? entity.getAllHexes().some(h => window.hasLineOfEffect(h, target.hex)) : false;

    if (target && dist <= attackRange && hasLOE) {
        if (entity.skills['quarterstaff_trip'] && entity.timePoints >= 5 && Math.random() > 0.5) {
            const hitChance = 50 + entity.toHitMelee - target.passiveDodge;
            if (Math.random() * 100 < hitChance) {
                window.showMessage(`${entity.name} trips ${target.name}!`);
                target.timePoints = Math.max(0, target.timePoints - 5);
            }
            spendTP(entity, 5);
        } else {
            tryAttack(entity, target);
            spendTP(entity, 10);
        }
        setTimeout(() => aiProcess(entity), 100);
    } else {
        const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
        const bestHex = neighbors.map(h => {
            let s = -window.distance(h, huntTargetHex);
            const t = window.getTerrainAt(h.q, h.r);
            if (t.name === 'Wall') s += 5;
            if (t.name === 'Water') s -= 10;
            if (getEntityAtHex(h.q, h.r)) s -= 5; 
            return {h, s};
        }).sort((a,b) => b.s - a.s)[0].h;

        const moveEntity = entity.riding || entity;
        const availableMoveTP = moveEntity.timePoints - 80;
        const path = window.findPath(entity.hex, bestHex, availableMoveTP, moveEntity);

        if (path?.length > 1) {
            const previousHex = { q: entity.hex.q, r: entity.hex.r };
            const nextHex = path[1];

            checkMovementReactions(entity, nextHex, (forceEnd) => {
                const occupant = getEntityAtHex(nextHex.q, nextHex.r);
                if (forceEnd && occupant && occupant !== entity && occupant !== entity.riding) {
                    entity.hex = previousHex;
                } else {
                    entity.hex = nextHex;
                    if (entity.riding) entity.riding.hex = { q: nextHex.q, r: nextHex.r };
                }
                const terrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
                let cost = 5;
                if (moveEntity.skills['fastMovement']) {
                    const isLightOrNoArmor = !moveEntity.equipped || !moveEntity.equipped.armor || window.items[moveEntity.equipped.armor].id === 'light_armor';
                    if (isLightOrNoArmor) cost -= moveEntity.skills['fastMovement'];
                }
                if (moveEntity.skills['swift_step']) {
                    const isUnarmored = (!moveEntity.equipped || !moveEntity.equipped.armor) && (!moveEntity.equipped || !moveEntity.equipped.offhand || window.items[moveEntity.equipped.offhand].type !== 'shield');
                    if (isUnarmored) cost -= 1;
                }

                if (entity.riding) {
                    if (entity.riding.timePoints > 80) {
                        spendTP(entity.riding, cost * terrain.moveCostMult);
                    } else {
                        setTimeout(() => aiProcess(entity), 100);
                        return;
                    }
                } else {
                    spendTP(entity, cost * terrain.moveCostMult);
                }

                if (forceEnd) entity.timePoints = threshold;
                setTimeout(() => aiProcess(entity), 100);
            });
        } else { 
            entity.timePoints = threshold; 
            setTimeout(() => aiProcess(entity), 100); 
        }
    }
}

function wakeUp(entity) {
    if (entity.aiState === 'combat') return;
    entity.aiState = 'combat';
    
    // Set all players to 0 TP when combat starts (surprise/reset)
    window.entities.forEach(e => {
        if (e.side === 'player') e.timePoints = 0;
    });

    // Chain reaction
    const neighbors = window.entities.filter(e => e.side === entity.side && e !== entity && window.distance(e.hex, entity.hex) < 15);
    neighbors.forEach(n => {
        if (n.aiState === 'idle') {
            n.aiState = 'combat';
            window.showMessage(`${n.name} hears the commotion and wakes up!`);
        }
    });
}

function spendTP(entity, amount) {
    entity.timePoints -= amount;
    entity.totalTPSpent += amount;

    if (entity.webbedDuration > 0) {
        entity.webbedDuration = Math.max(0, entity.webbedDuration - amount);
        if (entity.webbedDuration <= 0) window.showMessage(`${entity.name} is no longer webbed.`);
    }
    
    // Stealth Penalty for movement/actions
    if (entity.isStealthed && amount > 1) {
        // Re-calculate stealth score at new position/state
        let score = 50;
        if (entity.skills?.stealth_agility) score += 5;
        if (entity.skills?.stealth_rogue) score += 5;
        const light = window.lightLevel || 1.0;
        score -= (light * 40);
        const terrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
        score += (terrain.stealthBonus || 0);
        if (entity.equipped?.armor) {
            const aid = entity.equipped.armor;
            if (aid === 'heavy_armor') score -= 30;
            else if (aid === 'medium_armor') score -= 15;
        }
        entity.stealthScore = score;
    }

    checkDisappearance(entity);
}

function checkDisappearance(entity) {
    if (entity.maxTPAllowed > 0 && entity.totalTPSpent >= entity.maxTPAllowed) {
        entity.alive = false;
        window.showMessage(`${entity.name} has vanished!`);
        window.drawMap();
        window.renderEntities();
        checkCombatEnd();
    }
}

function handleClick(e){
    // ABORT if we were dragging the camera
    if (window.totalDragDistance > 10) return;

    if (window.gamePhase !== 'PLAYER_TURN' || !window.currentTurnEntity) return;
    const player = window.currentTurnEntity;
    const clickedHex = window.screenToHex({x:e.clientX, y:e.clientY});
    const target = getEntityAtHex(clickedHex.q, clickedHex.r);
    let actionHandled = false;

    // TALK TO NPC (Campaign 1)
    if (target && target.isNPC && window.distance(player.hex, clickedHex) <= 3) {
        talkToNPC(target);
        return;
    }

    if (window.playerAction) {
        const act = window.playerAction;
        if (act.type === 'skill') {
            if (act.id === 'shove' || act.id.endsWith('_feint')) {
                if (target && target.side !== player.side && window.distance(player.hex, clickedHex) === 1) {
                    if (act.id === 'shove') actionHandled = window.tryShove(player, target);
                    else { tryAttack(player, target, true); spendTP(player, 1); actionHandled = true; }
                }
            } else if (act.id === 'quarterstaff_trip') {
                if (target && target.side !== player.side) {
                    const dist = getMinDistance(player, target);
                    let range = 1 + (player.equipped?.weapon === 'quarterstaff' ? window.items['quarterstaff'].range : 0);
                    if (dist <= range) {
                        const hitChance = 50 + player.toHitMelee - target.passiveDodge;
                        if (Math.random() * 100 < hitChance) {
                            window.showMessage(`${player.name} trips ${target.name}!`);
                            target.timePoints = Math.max(0, target.timePoints - 5);
                        } else {
                            window.showMessage(`${player.name} tries to trip ${target.name} but misses!`);
                        }
                        spendTP(player, 5); actionHandled = true;
                    } else { window.showMessage("Target out of range."); }
                }
            } else if (act.id === 'dagger_throw') {
                if (target && target.side !== player.side) {
                    const dist = getMinDistance(player, target);
                    if (dist <= 4) {
                        if (Math.random() * 100 < (50 + player.toHitRanged - target.passiveDodge)) resolveAttack(player, target, false);
                        else window.showMessage(`${player.name} throws a dagger but misses!`);
                        
                        const daggerId = player.equipped.weapon;
                        player.equipped.weapon = null;
                        const idx = window.player.inventory.indexOf(daggerId);
                        if (idx > -1) window.player.inventory.splice(idx, 1);
                        
                        const coord = `${clickedHex.q},${clickedHex.r}`;
                        if (!window.mapItems[coord]) window.mapItems[coord] = [];
                        window.mapItems[coord].push(daggerId);

                        if (player.skills['dagger_quick_draw']) {
                            const next = window.player.inventory.find(i => i === 'dagger');
                            if (next) player.equipped.weapon = next;
                        }
                        spendTP(player, 5); actionHandled = true;
                    }
                }
            }
        } else if (act.type === 'mount') {
            if (target && target.mountSize > 0 && target.side === player.side && !target.rider) {
                if (getMinDistance(player, target) <= 1) {
                    if (player.riderSize <= target.mountSize) {
                        player.riding = target;
                        target.rider = player;
                        player.hex = { q: target.hex.q, r: target.hex.r };
                        spendTP(player, 2);
                        window.showMessage(`${player.name} mounted ${target.name}.`);
                        actionHandled = true;
                    } else { window.showMessage("Mount is too small!"); }
                } else { window.showMessage("Must be adjacent to mount."); }
            }
        } else if (act.type === 'dismount') {
            if (!target && window.distance(player.hex, clickedHex) <= 1 && window.isHexInBounds(clickedHex)) {
                const mount = player.riding;
                if (mount) {
                    mount.rider = null;
                    player.riding = null;
                    player.hex = clickedHex;
                    spendTP(player, 2);
                    window.showMessage(`${player.name} dismounted.`);
                    actionHandled = true;
                }
            } else { window.showMessage("Select an adjacent empty hex to dismount."); }
        } else if (act.type === 'offhand_attack') {
            if (target && target.side !== player.side) {
                let range = 1 + (player.equipped?.offhand ? (window.items[player.equipped.offhand].range || 0) : 0);
                if (getMinDistance(player, target) <= range) { tryAttack(player, target, false, true); spendTP(player, 2); actionHandled = true; }
            }
        } else if (act.type === 'spell') {
            const spell = window.player.createdSpells[act.index];
            const dist = target ? getMinDistance(player, target) : window.distance(player.hex, clickedHex);
            if (dist <= spell.range && player.currentMana >= spell.manaCost && player.timePoints >= spell.tpCost) {
                if (spell.type === 'summon') {
                    if (!getEntityAtHex(clickedHex.q, clickedHex.r) && window.distance(player.hex, clickedHex) <= 1) {
                        const s = window.createMonster(spell.animalId, clickedHex, null, null, 'player');
                        s.maxTPAllowed = 0; // Ongoing!
                        
                        // ANIMAL COMPANION LOGIC
                        if (player.skills?.animal_companion && !player.animalCompanion) {
                            player.animalCompanion = s;
                            s.isCompanion = true;
                            
                            // Apply bonuses
                            if (player.skills.companion_str_end) {
                                s.baseDamage += 1;
                                s.maxHp += 10;
                                s.hp += 10;
                            }
                            if (player.skills.companion_agi_end) {
                                s.timePointsPerTick += 0.05;
                                s.maxHp += 10;
                                s.hp += 10;
                            }
                            
                            window.entities.push(s);
                            window.showMessage(`${player.name} summons a permanent companion: ${s.name}!`);
                        } else {
                            window.entities.push(s); 
                            // Track as active spell (with upkeep)
                            const instanceId = Date.now() + Math.random();
                            window.activeSpells.push({
                                spellInstanceId: instanceId,
                                name: spell.name,
                                casterName: player.name,
                                coreManaCost: spell.coreManaCost || spell.manaCost,
                                entityId: s.id
                            });
                        }
                        
                        actionHandled = true;
                    }
                } else if (spell.type === 'dispel') {
                    // Target summoned entity to end its spell, or any entity to end a random buff/debuff
                    if (target) {
                        const activeEffects = (window.activeSpells || []).filter(s => s.targetEntityId === target.id || s.entityId === target.id);
                        if (activeEffects.length > 0) {
                            const effect = activeEffects[Math.floor(Math.random() * activeEffects.length)];
                            window.cancelSpell(effect.spellInstanceId);
                            window.showMessage(`${player.name} dispelled ${effect.name} on ${target.name}!`);
                            actionHandled = true;
                        } else {
                            window.showMessage("No active spells found on this target.");
                        }
                    } else {
                        // Hex dispel: Preference enemy -> neutral -> friendly
                        const hexSpells = (window.activeSpells || []).filter(s => s.targetHexes && s.targetHexes.some(th => th.q === clickedHex.q && th.r === clickedHex.r));
                        if (hexSpells.length > 0) {
                            // Find casters
                            const categorized = { enemy: [], neutral: [], player: [] };
                            hexSpells.forEach(s => {
                                const caster = window.entities.find(e => e.name === s.casterName);
                                const side = caster ? caster.side : 'neutral';
                                categorized[side].push(s);
                            });
                            const priority = categorized.enemy.length > 0 ? categorized.enemy : (categorized.neutral.length > 0 ? categorized.neutral : categorized.player);
                            const effect = priority[Math.floor(Math.random() * priority.length)];
                            window.cancelSpell(effect.spellInstanceId);
                            window.showMessage(`${player.name} dispelled ${effect.name} at hex ${clickedHex.q},${clickedHex.r}!`);
                            actionHandled = true;
                        }
                    }
                } else if (spell.type === 'aoe_debuff') {
                    // Target hex and adjacent within radius
                    const center = clickedHex;
                    const affected = [center];
                    if (spell.radius > 0) {
                        for (let r = 1; r <= spell.radius; r++) {
                            const ring = window.getNeighbors(center.q, center.r); // Simplified for radius 1
                            affected.push(...ring);
                        }
                    }
                    
                    const instanceId = Date.now() + Math.random();
                    window.activeSpells.push({
                        spellInstanceId: instanceId,
                        baseId: spell.baseId,
                        name: spell.name,
                        casterName: player.name,
                        coreManaCost: spell.coreManaCost || spell.manaCost,
                        targetHexes: affected.map(h => ({q:h.q, r:h.r})),
                        debuffType: spell.debuffType
                    });
                    
                    affected.forEach(h => {
                        window.setTerrainAt(h.q, h.r, 'Swamp'); // Visual representation: Swamp doubles move cost
                    });

                    window.showMessage(`${player.name} cast ${spell.name}!`);
                    actionHandled = true;
                } else {
                    let spellHitBonus = 0;
                    if (spell.baseId === 'firebolt' && player.skills?.firebolt_hit) {
                        spellHitBonus = player.skills.firebolt_hit * 5;
                    }
                    let hit = !spell.needsHitCheck || (target && Math.random() * 100 < (50 + player.toHitSpell + spellHitBonus - target.passiveDodge));
                    if (spell.type === 'damage' && target && target.side !== player.side) {
                        const baseSpell = window.baseSpells[spell.baseId];
                        if (baseSpell && baseSpell.validTags) {
                            const hasValidTag = baseSpell.validTags.some(tag => target.tags && target.tags.includes(tag));
                            if (!hasValidTag) {
                                window.showMessage(`${spell.name} has no effect on ${target.name}!`);
                                hit = false;
                            }
                        }
                        if (hit) {
                            let red = (target.baseReduction || 0) + (target.equipped?.armor ? window.items[target.equipped.armor].reduction : 0) + (window.items[target.equipped?.offhand]?.type === 'shield' ? window.items[target.equipped.offhand].reduction : 0);
                            let fd = Math.max(1, spell.magnitude - red);
                            target.hp -= fd; syncBackToPlayer(target);
                            wakeUp(target); // WAKE UP ON HIT
                            if (target.hp <= 0 && target.alive) { target.alive = false; window.showMessage(`${target.name} defeated!`); if (target.expValue) window.gainExp(target.expValue); }
                        }
                        actionHandled = true;
                    } else if (spell.type === 'heal' && target) {
                        target.hp = Math.min(target.maxHp, target.hp + spell.magnitude);
                        syncBackToPlayer(target); actionHandled = true;
                    } else if (spell.type === 'buff' && target && target.side === player.side) {
                        // Apply ongoing buff
                        const instanceId = Date.now() + Math.random();
                        window.activeSpells.push({
                            spellInstanceId: instanceId,
                            baseId: spell.baseId,
                            name: spell.name,
                            casterName: player.name,
                            coreManaCost: spell.coreManaCost || spell.manaCost,
                            targetEntityId: target.id,
                            magnitude: spell.magnitude
                        });
                        window.showMessage(`${player.name} cast ${spell.name} on ${target.name}.`);
                        actionHandled = true;
                    }
                }
                if (actionHandled) { 
                    player.currentMana -= spell.manaCost; 
                    spendTP(player, spell.tpCost); 
                    if (player.isStealthed) breakStealth(player);
                }
            }
        }
        if (actionHandled) { window.playerAction = null; syncBackToPlayer(player); }
    } else if (target && target.side !== player.side) {
        if (window.highlightedHexes.some(h => h.type === 'attack' && h.q === clickedHex.q && h.r === clickedHex.r)) {
            tryAttack(player, target); spendTP(player, 10); actionHandled = 'main_attack';
        }
    } else if (window.highlightedHexes.some(h => h.type === 'move' && h.q === clickedHex.q && h.r === clickedHex.r)) {
        let threshold = 80;
        if (player.skills && player.skills['quickRecovery']) threshold -= player.skills['quickRecovery'];
        
        const moveEntity = player.riding || player;
        const availableTP = moveEntity.timePoints - 80; 

        let path = window.findPath(player.hex, clickedHex, availableTP, moveEntity);
        if (!path && window.distance(player.hex, clickedHex) === 1 && availableTP > 0) path = [player.hex, clickedHex];
        if (path) { path.shift(); playerMoveProcess(player, path); return; }
    } else if (!target) {
        // NO ACTION/MOVE ACTIVE: Set Destination for Auto-Move
        if (window.groupMoveMode) {
            const leader = player;
            const moveEntity = leader.riding || leader;
            const fullPath = window.findPath(leader.hex, clickedHex, undefined, moveEntity, true);
            window.leaderPath = fullPath ? fullPath.map(h => `${h.q},${h.r}`) : [];
            window.groupLeader = leader;

            const friendlies = window.entities.filter(e => e.alive && e.side === 'player' && !e.rider);
            friendlies.forEach(f => {
                const dq = f.hex.q - leader.hex.q;
                const dr = f.hex.r - leader.hex.r;
                f.destination = { q: clickedHex.q + dq, r: clickedHex.r + dr };
            });
            window.showMessage(`Group destination set.`);
        } else {
            player.destination = clickedHex;
            window.showMessage(`${player.name} destination set to ${clickedHex.q},${clickedHex.r}`);
        }
        // Force evaluation if it's currently their turn
        if (window.gamePhase === 'PLAYER_TURN' && window.currentTurnEntity === player) {
            setTimeout(() => autoMoveProcess(player), 100);
        }
    }
    finalizePlayerAction(player, actionHandled);
}

function tryAttack(attacker, target, isFeint = false, isOffhand = false) {
    if (target.side === 'neutral') {
        if (attacker.side === 'player') window.showMessage("You cannot attack a neutral character!");
        return;
    }
    // Wake up target if attacked
    if (target.side === 'enemy' && target.aiState === 'idle') wakeUp(target);

    // Battle Reflexes: Gain 1 TP when attacked
    if (target.skills?.battle_reflexes) {
        target.timePoints += 1;
    }

    // Divine Protection: Attacker loses TP
    const protections = (window.activeSpells || []).filter(s => s.baseId === 'divine_protection' && s.targetEntityId === target.id);
    protections.forEach(p => {
        attacker.timePoints -= (p.magnitude || 1);
        window.showMessage(`${attacker.name} is hindered by Divine Protection! (-${p.magnitude || 1} TP)`);
    });

    // BREAK STEALTH
    if (attacker.isStealthed) breakStealth(attacker);

    const weaponSlot = isOffhand ? 'offhand' : 'weapon';
    const weaponId = attacker.equipped?.[weaponSlot] || null;
    const weapon = weaponId ? window.items[weaponId] : null;
    const reactions = [];

    // DEFENDER REACTIONS
    if (!weapon || weapon.subType === 'melee' || (target.equipped?.weapon && window.items[target.equipped.weapon].id === 'sword_arrow_deflection')) {
        const defW = target.equipped?.weapon ? window.items[target.equipped.weapon].id : null;
        if ((defW === 'sword' || defW === 'dagger' || defW === 'sword_arrow_deflection') && target.skills[`${defW}_parry`] && target.timePoints >= 3 && target.parriesRemaining > 0) {
            let tpCost = 3;
            if (target.skills[`${defW}_parry_cost`]>0) tpCost -= 1;
            
            if (target.timePoints >= tpCost) {
                reactions.push({ id: 'parry', name: 'Parry', tpCost: tpCost, weaponId: defW });
            }
        }
    }

    // ALLY REACTIONS (Shield Other & Protector)
    const allies = window.entities.filter(e => e.alive && e.side === target.side && e !== target);
    for (let ally of allies) {
        // Distance check (adjacent to ANY of target's hexes)
        const isAdjacent = ally.getAllHexes().some(ah => target.getAllHexes().some(th => window.distance(ah, th) <= 1));
        if (!isAdjacent) continue;

        if (ally.timePoints >= 1 && ally.skills?.shield_other) {
            const shieldId = ally.equipped?.offhand;
            if (shieldId && window.items[shieldId].type === 'shield') {
                reactions.push({ id: 'shield_other', name: `Shield Other (${ally.name})`, tpCost: 1, ally: ally });
            }
        }
        
        if (ally.skills?.protector && ally.parriesRemaining > 0) {
            const weaponId = ally.equipped?.weapon;
            const w = weaponId ? window.items[weaponId] : null;
            if (w && (w.id === 'sword' || w.id === 'dagger') && ally.skills[`${w.id}_parry`]) {
                let cost = 3;
                if (ally.skills[`${w.id}_parry_cost`] > 0) cost -= 1;
                if (ally.timePoints >= cost) {
                    reactions.push({ id: `protector_parry_${ally.name}`, name: `Protect ${target.name.split(' ')[0]} (Parry: ${ally.name})`, tpCost: cost, ally: ally, weaponId: w.id });
                }
            }
        }
    }

    if (reactions.length > 0) {
        // For simplicity, we combine them but handle who spends TP.
        window.requestReaction(target, reactions, (choice) => {
            if (choice === 'parry') {
                const r = reactions.find(o => o.id === 'parry');
                spendTP(target, r.tpCost); target.parriesRemaining -= 1;
                
                let parryBonus = (target.skills[`${r.weaponId}_parry_chance`] || 0) * 10;
                let hit = Math.random() * 100 < (50 + target.toHitMelee + parryBonus - attacker.passiveDodge);
                
                if (hit) { 
                    window.showMessage(`${target.name} successfully parried ${attacker.name}!`);
                    if (isFeint) window.showMessage(`[FEINT SUCCESS] ${attacker.name} tricked ${target.name} into wasting a Parry!`);
                    return; 
                } else {
                    window.showMessage(`${target.name} tried to parry but FAILED!`);
                    if (isFeint) window.showMessage(`[FEINT FAILED] ${target.name} didn't fall for the feint.`);
                }
            } else if (choice === 'shield_other') {
                const r = reactions.find(o => o.id === 'shield_other');
                spendTP(r.ally, 1);
                const shield = window.items[r.ally.equipped.offhand];
                const bonus = shield.reduction + (r.ally.skills.shield_proficiency || 0);
                window.showMessage(`${r.ally.name} protects ${target.name} with their shield (+${bonus} reduction)!`);
                target.tempReduction = (target.tempReduction || 0) + bonus;
            } else if (choice && choice.startsWith('protector_parry_')) {
                const r = reactions.find(o => o.id === choice);
                const ally = r.ally;
                spendTP(ally, r.tpCost); ally.parriesRemaining -= 1;

                let parryBonus = (ally.skills[`${r.weaponId}_parry_chance`] || 0) * 10;
                let hit = Math.random() * 100 < (50 + ally.toHitMelee + parryBonus - attacker.passiveDodge);

                if (hit) {
                    window.showMessage(`${ally.name} successfully parried ${attacker.name} for ${target.name}!`);
                    if (isFeint) window.showMessage(`[FEINT SUCCESS] ${attacker.name} tricked ${ally.name} into wasting a Protector Parry!`);
                    return;
                } else {
                    window.showMessage(`${ally.name} tried to parry for ${target.name} but FAILED!`);
                    if (isFeint) window.showMessage(`[FEINT FAILED] ${ally.name} didn't fall for the feint.`);
                }
            }
            
            // Proceed to attack resolution
            const missCallback = () => {
                // If it's a miss, check for Shield Bash
                if (target.skills?.shield_bash && target.timePoints >= 3) {
                    const shieldId = target.equipped?.offhand;
                    if (shieldId && window.items[shieldId].type === 'shield') {
                        window.requestReaction(target, [{id:'shield_bash', name:'Shield Bash', tpCost:3}], (bashChoice) => {
                            if (bashChoice === 'shield_bash') {
                                spendTP(target, 3);
                                window.showMessage(`${target.name} counter-attacks with a Shield Bash!`);
                                // Basic attack: no weapon, no skills
                                const hitChance = 50 + target.toHitMelee - attacker.passiveDodge;
                                if (Math.random() * 100 < hitChance) {
                                    const dmg = target.baseDamage || 1;
                                    window.showMessage(`Shield Bash hits for ${dmg} damage!`);
                                    attacker.hp -= dmg;
                                    if (attacker.hp <= 0) { attacker.alive = false; window.showMessage(`${attacker.name} defeated!`); checkCombatEnd(); }
                                } else {
                                    window.showMessage("Shield Bash misses!");
                                }
                            }
                        }, "The enemy missed! Use Shield Bash?");
                    }
                }
            };

            resolveAttack(attacker, target, isFeint, isOffhand, missCallback);
            if (target.tempReduction) delete target.tempReduction;
        }, `Being attacked by ${attacker.name}`);
    } else {
        resolveAttack(attacker, target, isFeint, isOffhand);
    }
}

function canSee(viewer, target) {
    const d = window.distance(viewer.hex, target.hex);
    const visionCap = 30 + (viewer.visionBonus || 0);
    
    // Line of sight check first (Physical obstruction)
    if (d > visionCap || !window.hasLineOfSight(viewer.hex, target.hex)) {
        // If we lose LOS, we no longer 'see' them currently
        if (target.isStealthed) {
            if (viewer.knownStealthedTargets) viewer.knownStealthedTargets.delete(target.name);
        }
        return false;
    }

    // Stealth check
    if (target.isStealthed) {
        if (!viewer.knownStealthedTargets) viewer.knownStealthedTargets = new Set();

        // If already spotted this 'bout' of visibility, we keep seeing them
        if (viewer.knownStealthedTargets.has(target.name)) return true;

        // Spot chance: base on target's stealth score
        // stealthScore is roughly 0-60 (higher is more stealthy)
        // distance makes it easier: +5 per hex closer than 15
        const distBonus = Math.max(0, (15 - d) * 5); 
        const spotChance = Math.max(5, 100 - target.stealthScore + distBonus);
        
        // Light source bonus for viewer
        let hasLight = false;
        if (viewer.equipped) {
            const items = [viewer.equipped.weapon, viewer.equipped.offhand, viewer.equipped.accessory];
            if (items.some(iid => iid && window.items[iid]?.lightRadius)) hasLight = true;
        }
        const finalChance = hasLight ? spotChance * 1.5 : spotChance;
        
        if (Math.random() * 100 < finalChance) {
            // Spotted!
            viewer.knownStealthedTargets.add(target.name);
            return true;
        }
        return false;
    }

    return true;
}

function resolveAttack(attacker, target, isFeint, isOffhand = false, missCallback = null) {
  if (isFeint) {
      if (!isOffhand) attacker.offhandAttackAvailable = (attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon');
      return;
  }
  const weaponSlot = isOffhand ? 'offhand' : 'weapon';
  const weapon = window.items[attacker.equipped?.[weaponSlot]] || null;
  const baseHit = weapon?.subType === 'ranged' ? attacker.toHitRanged : attacker.toHitMelee;
  const attackerTerrain = window.getTerrainAt(attacker.hex.q, attacker.hex.r);
  const targetTerrain = window.getTerrainAt(target.hex.q, target.hex.r);
  let hitChance = 50 + baseHit + attackerTerrain.hitBonus - (target.passiveDodge + targetTerrain.dodgeBonus);
  if (attacker.equipped?.weapon && attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon') hitChance -= 5;
  if (isOffhand) hitChance -= 5;
  if (weapon && attacker.skills[`${weapon.id}_hit`]) hitChance += 5;
  const roll = Math.floor(Math.random() * 100);
  if (roll >= hitChance) {
      window.showMessage(`${attacker.name} misses ${target.name}! (Roll: ${roll} vs Need: <${hitChance})`);
      if (!isOffhand) attacker.offhandAttackAvailable = (attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon');
      if (missCallback) missCallback();
      return;
  }
  let dmg = (attacker.baseDamage || 1) + (weapon?.damage || 0) + (attacker.skills[`${weapon?.id}_dmg`] || 0) + (attacker.skills['meleeDamage'] || 0);
  if (isOffhand) dmg -= 2;
  let red = (target.baseReduction || 0) + 
            (target.equipped?.armor && window.items[target.equipped.armor] ? window.items[target.equipped.armor].reduction : 0) + 
            (target.equipped?.offhand && window.items[target.equipped.offhand] && window.items[target.equipped.offhand].type === 'shield' ? (window.items[target.equipped.offhand].reduction + (target.skills?.shield_proficiency || 0)) : 0) +
            (target.equipped?.helmet && window.items[target.equipped.helmet] ? (window.items[target.equipped.helmet].reduction || 0) : 0) +
            (target.tempReduction || 0);
  let fd = Math.max(1, dmg - red);
  window.showMessage(`${attacker.name} hits ${target.name} for ${fd} damage! (${dmg} base - ${red} reduction)`);
  target.hp -= fd; syncBackToPlayer(target);
  
  // POISON LOGIC
  if (attacker.skills?.poison_bite && Math.random() < 0.5) {
      target.poisonTicks = 10;
      target.poisonDamage = 2;
      window.showMessage(`${target.name} is poisoned!`);
  }

  // Set last seen hex so they can search if stealthed
  target.lastSeenTargetHex = { q: attacker.hex.q, r: attacker.hex.r };
  
  if (window.isResting && target.side === 'player') {
      window.isResting = false;
      window.showMessage("Rest interrupted by damage!");
      window.updateRestButton();
  }

  attacker.offhandAttackAvailable = !isOffhand && (attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon');
  if (target.hp <= 0 && target.alive) {
      target.alive = false; window.showMessage(`${target.name} defeated!`);
      if (attacker.side === 'player') {
          if (target.expValue) window.gainExp(target.expValue);
          if (target.gold) window.player.gold += target.gold;
          target.inventory.forEach(i => window.player.inventory.push(i));
      }
      checkCombatEnd();
  }
}

function checkCombatEnd() {
    // Track Grishnak defeat
    const grishnak = window.entities.find(e => e.name === "Grishnak");
    if (grishnak && !grishnak.alive) {
        window.grishnakDefeated = true;
    }

    // Only check for ACTIVE enemies
    if (!window.entities.some(e => e.side === 'enemy' && e.alive)) {
        if (window.currentCampaign === "1") {
            window.isInArena = false;
            window.triggerAmbientDialogue('arena_victory');
            window.showMessage("You have won the battle! Teleporting back to the lobby...");
            setTimeout(() => {
                setupArenaLobby();
                window.drawMap();
                window.renderEntities();
                if (window.entities.length > 0) {
                    window.centerCameraOn(window.entities[0].hex);
                }
            }, 2000);
            return;
        }

        // If all active enemies are dead, maybe we can relax?
        window.entities.forEach(e => { if (e.alive) e.timePoints = 0; });
        
        // Spawn more monsters far away to keep the world populated
        spawnNewMonster(); 
        
        const p = window.entities.find(e => e.name.includes("Player"));
        if (p?.skills['initiativeBonus']) p.timePoints += p.skills['initiativeBonus'] * 5;
        window.drawMap(); window.renderEntities(); window.updateTurnIndicator();
    }
}

function spawnNewMonster() {
    const p = window.entities.find(e => e.side === 'player');
    const totalLevel = window.party.reduce((sum, c) => sum + c.level, 0);
    // Spawn a BUNCH of monsters in a large radius
    const num = 5 + Math.floor(Math.random() * 5); 
    
    for (let i = 0; i < num; i++) {
        // Range 20 to 80 hexes away
        const dist = 20 + Math.floor(Math.random() * 60);
        const angle = Math.random() * Math.PI * 2;
        // Approximate hex offset from angle/dist
        // q = dist * cos(angle)
        // r = dist * sin(angle) -ish (Axial conversion is weirder but this is random noise so fine)
        
        const qOff = Math.floor(dist * Math.cos(angle));
        const rOff = Math.floor(dist * Math.sin(angle));
        
        const h = { q: p.hex.q + qOff, r: p.hex.r + rOff };
        
        let type = 'goblin';
        const roll = Math.random();
        if (totalLevel >= 10 && roll > 0.95) type = 'troll';
        else if (roll > 0.90) type = 'zombie';
        else if (roll > 0.85) type = 'skeleton';
        else if (roll > 0.80) type = 'imp';
        else if (roll > 0.75) type = 'wolf_rider_goblin';
        else if (roll > 0.65) type = 'orc';
        else if (roll > 0.50) type = 'wolf';
        
        const template = window.monsterTemplates[type];
        const extraHexes = template.extraHexes || [];
        
        // Find preferred terrain nearby
        if (template.preferredTerrain) {
            const range = 15;
            let found = false;
            for(let dq=-range; dq<=range && !found; dq++) {
                for(let dr=Math.max(-range, -dq-range); dr<=Math.min(range, -dq+range); dr++) {
                    const th = { q: h.q + dq, r: h.r + dr };
                    const terr = window.getTerrainAt(th.q, th.r);
                    if (terr.name === template.preferredTerrain && !getEntityAtHex(th.q, th.r)) {
                        h.q = th.q; h.r = th.r;
                        found = true;
                        break;
                    }
                }
            }
        }

        const allSpawnHexes = [{q: h.q, r: h.r}, ...extraHexes.map(off => ({q: h.q + off.q, r: h.r + off.r}))];
        let canSpawn = true;
        for (let sh of allSpawnHexes) {
            // Check water and occupation
            if (window.getTerrainAt(sh.q, sh.r).name === 'Water' || getEntityAtHex(sh.q, sh.r)) {
                canSpawn = false; break;
            }
        }
        if (canSpawn) {
            const m = window.createMonster(type, h);
            m.aiState = 'idle'; // Start idle!
            window.entities.push(m);
        }
    }
}

function cancelSpell(instanceId) {
    const spellIdx = window.activeSpells.findIndex(s => s.spellInstanceId === instanceId);
    if (spellIdx === -1) return;

    const spell = window.activeSpells[spellIdx];
    // Remove entity if it was a summon
    if (spell.entityId) {
        const ent = window.entities.find(e => e.id === spell.entityId);
        if (ent) ent.alive = false;
    }

    // Restore terrain if AOE
    if (spell.targetHexes) {
        spell.targetHexes.forEach(h => {
            const key = `${h.q},${h.r}`;
            delete window.overrideTerrain[key];
        });
    }

    window.activeSpells.splice(spellIdx, 1);
    window.showMessage(`Cancelled spell: ${spell.name}`);
    window.drawMap();
    window.renderEntities();
    window.updateTurnIndicator();
}

function breakStealth(entity) {
    if (!entity.isStealthed) return;
    entity.isStealthed = false;
    entity.stealthScore = 0;
    window.showMessage(`${entity.name} is no longer stealthed.`);
    window.updateActionButtons();
}

function tryStealth(entity) {
    if (entity.isStealthed) {
        breakStealth(entity);
        return false;
    }

    // Cannot stealth if currently seen by ANY enemy (if player) or ANY player (if enemy)
    const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
    const opponents = window.entities.filter(e => e.alive && e.side === opponentSide);
    const isSeen = opponents.some(o => canSee(o, entity));
    
    if (isSeen) {
        window.showMessage(`${entity.name} cannot stealth while seen!`);
        return false;
    }

    entity.isStealthed = true;
    // Calculate initial stealth score for detection checks
    let score = 50;
    if (entity.skills?.stealth_agility) score += 5;
    if (entity.skills?.stealth_rogue) score += 5;
    const light = window.lightLevel || 1.0;
    score -= (light * 40);
    const terrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
    score += (terrain.stealthBonus || 0);
    if (entity.equipped?.armor) {
        const aid = entity.equipped.armor;
        if (aid === 'heavy_armor') score -= 30;
        else if (aid === 'medium_armor') score -= 15;
    }
    entity.stealthScore = score;

    window.showMessage(`${entity.name} is now moving stealthily.`);
    window.updateActionButtons();
    return true;
}

function tryShove(shover, target) {
    if (!window.areAdjacent(shover.hex, target.hex)) {
        window.showMessage("Target is not adjacent for shove.");
        return false;
    }
    if (shover.timePoints < 5) {
        window.showMessage("Not enough time points to shove.");
        return false;
    }

    const attackerTerrain = window.getTerrainAt(shover.hex.q, shover.hex.r);
    const targetTerrain = window.getTerrainAt(target.hex.q, target.hex.r);
    const hitChance = 50 + shover.toHitMelee + attackerTerrain.hitBonus - (target.passiveDodge + targetTerrain.dodgeBonus);
    const roll = Math.floor(Math.random() * 100);
    if (roll >= hitChance) {
        window.showMessage(`${shover.name} tries to shove ${target.name} but misses! (Roll: ${roll} vs Need: <${hitChance})`);
        spendTP(shover, 5);
        window.playerAction = null;
        return true; 
    }

    const newHex = window.getHexBehind(shover.hex, target.hex);
    const isOccupied = getEntityAtHex(newHex.q, newHex.r);

    if (isOccupied) {
        window.showMessage("Cannot shove target into an occupied hex.");
        return false;
    }

    if (!window.isHexInBounds(newHex)) {
        window.showMessage("Cannot shove target off the map.");
        return false;
    }
    
    window.showMessage(`${shover.name} shoves ${target.name}.`);
    target.hex = newHex;
    spendTP(shover, 5);
    window.playerAction = null; 
    return true;
}

function lootItems(entity) {
    const coord = `${entity.hex.q},${entity.hex.r}`;
    const items = window.mapItems[coord];
    if (!items || items.length === 0) return;

    if (entity.timePoints < 1) {
        if (entity.side === 'player') window.showMessage("Not enough TP to loot.");
        return;
    }

    items.forEach(itemId => {
        if (entity.side === 'player') {
            const char = window.party.find(p => p.name === entity.name);
            if (char) char.inventory.push(itemId);
            window.showMessage(`${entity.name} looted ${window.items[itemId].name}.`);
        } else {
            entity.inventory.push(itemId);
            window.showMessage(`${entity.name} looted ${window.items[itemId].name}.`);
        }
    });

    window.mapItems[coord] = [];
    spendTP(entity, 1);

    if (entity.side === 'player') {
        window.updateActionButtons();
        window.showInventoryScreen();
    }
    window.drawMap();
    window.renderEntities();
}

window.startGameCore = startGameCore;
window.renderEntities = renderEntities;
window.handleClick = handleClick;
window.tryAttack = tryAttack;
window.cancelSpell = cancelSpell;

function setupArenaLobby() {
    window.gamePhase = 'WAITING';
    window.entities = [];
    window.mapItems = {};
    window.overrideTerrain = {};
    window.tileObjects = {};
    window.exploredHexes = new Set(); // Reset visibility for new 'level'
    window.indoorLightMult = 0.0; // Lobby is indoor (no sun)
    window.lobbyTPSpent = 0;
    window.hasTriggeredImpatience = false;

    // Create a 20x20 stone lobby
    for (let q = -10; q <= 10; q++) {
        for (let r = -10; r <= 10; r++) {
            window.setTerrainAt(q, r, 'Wall'); // Surround with walls
            if (q > -8 && q < 8 && r > -8 && r < 8) {
                window.setTerrainAt(q, r, 'Cave Floor'); // Gritty stone lobby
            }
        }
    }

    // Spawn Party
    window.party.forEach((p, i) => {
        const spawnHex = { q: -2 + i, r: 0 };
        const playerEntity = new window.Entity(p.name, "red", spawnHex, p.attributes.agility + 10);
        playerEntity.side = 'player';
        Object.assign(playerEntity, p);
        window.entities.push(playerEntity);
    });

    // Spawn NPCs
    const announcer = new window.Entity("Arena Announcer", "yellow", {q: 2, r: -2}, 10);
    announcer.isNPC = true;
    announcer.side = 'neutral';
    announcer.gender = 'male';
    announcer.race = 'human';
    announcer.customImage = 'arenaannouncer';
    window.entities.push(announcer);

    const shopkeeper = new window.Entity("Shopkeeper", "green", {q: -2, r: 2}, 10);
    shopkeeper.isNPC = true;
    shopkeeper.side = 'neutral';
    shopkeeper.gender = 'female';
    shopkeeper.race = 'dwarf';
    shopkeeper.customImage = 'arenashopkeeper';
    window.entities.push(shopkeeper);

    const recruiter = new window.Entity("Mercenary Recruiter", "cyan", {q: 3, r: 3}, 10);
    recruiter.isNPC = true;
    recruiter.side = 'neutral';
    recruiter.gender = 'male';
    recruiter.race = 'elf';
    recruiter.customImage = 'arenamercenary';
    window.entities.push(recruiter);

    // Decorative Horse
    const horse = window.createMonster('horse', {q: -4, r: -4}, null, null, 'neutral');
    window.entities.push(horse);

    // Fireplace in the center-ish
    window.tileObjects["-1,-1"] = { type: 'fireplace', lightRadius: 12 };

    window.drawMap();
    window.renderEntities();
    window.showCharacter();
}

function startArenaFight() {
    window.showMessage("The announcer teleports you to the arena!");
    window.isInArena = true;
    window.triggerAmbientDialogue('arena_fight_start');
    
    // 1. Clear Lobby / Level Transition
    window.overrideTerrain = {}; // Remove lobby floor
    window.tileObjects = {}; // Remove lobby fireplace
    window.exploredHexes = new Set(); // Fog of war reset
    window.indoorLightMult = 0.0; // Arena is also indoor/dark
    window.entities = window.entities.filter(e => e.side === 'player'); // Only players/allies stay
    window.entities.forEach(e => e.timePoints = 0); // Reset TP for fresh initiative

    // 2. Create arena map (50x50 rectangle)
    const arenaSize = 25;
    for (let q = -arenaSize; q <= arenaSize; q++) {
        for (let r = -arenaSize; r <= arenaSize; r++) {
            if (Math.abs(q) === arenaSize || Math.abs(r) === arenaSize || Math.abs(q+r) === arenaSize) {
                 window.setTerrainAt(q, r, 'Wall');
            } else {
                 window.setTerrainAt(q, r, 'Cave Floor');
            }
        }
    }

    // 3. Spawn players at one end and center camera
    window.entities.forEach((e, i) => {
        e.hex = { q: -arenaSize + 5, r: i - Math.floor(window.entities.length/2) };
    });
    if (window.entities.length > 0) {
        window.centerCameraOn(window.entities[0].hex);
    }

    // 4. Spawn enemies
    // GRISHNAK ENCOUNTER (10% chance if not defeated)
    if (!window.grishnakDefeated && Math.random() < 0.1) {
        window.showMessage("A champion enters the arena: Grishnak!");
        const grishnak = window.createMonster('orc', { q: arenaSize - 5, r: 0 }, null, null, 'enemy');
        grishnak.name = "Grishnak";
        const schools = ['arcane'];
        schools.forEach(s => {
            const keys = Object.keys(window.skills).filter(k => window.skills[k].tree === s || window.skills[k].tree === 'wizard');
            keys.forEach(k => grishnak.skills[k] = 1);
        });
        grishnak.hp = 40;
        grishnak.maxHp = 40;
        grishnak.applySkills();
        window.entities.push(grishnak);
        for (let i = 0; i < 2; i++) {
            const spawnHex = { q: arenaSize - 5, r: (i === 0 ? -2 : 2) };
            window.entities.push(window.createMonster('orc', spawnHex, null, null, 'enemy'));
        }
    } else {
        // THEMED ENCOUNTERS
        const themes = [
            ['spider', 'spider', 'spider'],
            ['skeleton', 'skeleton', 'zombie', 'zombie'],
            ['orc', 'goblin', 'goblin'],
            ['imp', 'imp', 'imp'],
            ['wolf', 'wolf', 'wolf_rider_goblin']
        ];
        const theme = themes[Math.floor(Math.random() * themes.length)];
        theme.forEach((type, i) => {
            const spawnHex = { q: arenaSize - 5, r: i - Math.floor(theme.length/2) };
            const enemy = window.createMonster(type, spawnHex, null, null, 'enemy');
            window.entities.push(enemy);
        });
    }

    window.drawMap();
    window.renderEntities();
    window.updateTurnIndicator();
    window.gamePhase = 'WAITING';
}

function talkToNPC(npc) {
    if (npc.name === "Arena Announcer") {
        window.showDialogue(npc, "Welcome to the pits! Are you ready for your next match?", [
            { label: "I am ready to fight!", action: () => startArenaFight() },
            { label: "Not yet.", action: () => {} }
        ]);
    } else if (npc.name === "Shopkeeper") {
        window.showDialogue(npc, "Got some coin? I've got the goods. Unlimited stock, best prices in the pits!", [
            { label: "Let me see your wares.", action: () => window.openShop() },
            { label: "Maybe later.", action: () => {} }
        ]);
    } else if (npc.name === "Mercenary Recruiter") {
        window.showDialogue(npc, "Looking for some extra muscle? 100 gold and I'll find you a capable fighter who matches your experience.", [
            { label: "I'd like to hire someone (100g).", action: () => window.startMercenaryHire() },
            { label: "Not right now.", action: () => {} }
        ]);
    } else {
        window.showDialogue(npc, `You talk to ${npc.name}, but they have nothing to say.`);
    }
}

window.talkToNPC = talkToNPC;
window.setupArenaLobby = setupArenaLobby;
window.startArenaFight = startArenaFight;
window.tryStealth = tryStealth;
window.breakStealth = breakStealth;
window.lootItems = lootItems;
window.spendTP = spendTP;
window.finalizePlayerAction = finalizePlayerAction;
window.handleMovement = (e) => {};
window.tryShove = tryShove;
