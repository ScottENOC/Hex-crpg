// ui.js

window.updatePartyTabs = updatePartyTabs;
window.selectCharacterByName = selectCharacterByName;
window.addJerry = addJerry;
window.requestReaction = requestReaction;

// --- Party formation (used by the group-move click handler in gameEngine.js) ---
// 'close' keeps each follower's current relative position to the leader (the
// original behavior — no reshuffling, whatever spacing they're already in).
// 'line'/'wedge' assign a fixed offset by the follower's stable party order
// instead, so the arrangement stays consistent across moves.
window.partyFormation = window.partyFormation || 'close';

function getFormationOffset(entity, leader) {
    if (window.partyFormation === 'close' || !window.party) {
        return { q: entity.hex.q - leader.hex.q, r: entity.hex.r - leader.hex.r };
    }
    const followers = window.party
        .map(p => window.entities.find(e => e.name === p.name))
        .filter(e => e && e.alive && e.side === 'player' && e !== leader && !e.rider);
    const idx = followers.indexOf(entity);
    if (idx === -1) return { q: entity.hex.q - leader.hex.q, r: entity.hex.r - leader.hex.r };

    if (window.partyFormation === 'line') {
        return { q: 0, r: idx + 1 }; // single file, south of the leader
    }
    if (window.partyFormation === 'wedge') {
        const side = idx % 2 === 0 ? 1 : -1;
        const rank = Math.floor(idx / 2) + 1;
        return { q: side * rank, r: rank }; // alternating behind-and-out-to-the-side
    }
    return { q: entity.hex.q - leader.hex.q, r: entity.hex.r - leader.hex.r };
}
window.getFormationOffset = getFormationOffset;

function cyclePartyFormation() {
    const order = ['close', 'line', 'wedge'];
    const idx = order.indexOf(window.partyFormation || 'close');
    window.partyFormation = order[(idx + 1) % order.length];
    const btn = document.getElementById('party-formation-btn');
    if (btn) btn.innerText = `Formation: ${window.partyFormation}`;
}
window.cyclePartyFormation = cyclePartyFormation;

function updatePartyTabs() {
    const partyDiv = document.getElementById("party-selection");
    if (!partyDiv) return;
    partyDiv.innerHTML = '';

    // Real party members, pets/summons/mounts — never temporary combat allies
    // (e.g. Garrick/Mira/Oskar during the Hollowmere shakedown fight, who are
    // side:'player' + aiControlled but never join window.party).
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player' && !e.aiControlled);

    friendlies.forEach((ent, index) => {
        const btn = document.createElement("button");
        btn.innerText = ent.name.split(' ')[0]; // Short name
        btn.style.fontSize = "0.8em";
        btn.style.padding = "2px 5px";
        if (window.player && ent.name === window.player.name) {
            btn.style.border = "2px solid #ffeb3b";
            btn.style.backgroundColor = "#555";
        }
        const selectAction = () => window.selectCharacterByName(ent.name);
        btn.onclick = selectAction;
        // onclick alone can be unreliable on touch devices for buttons that
        // don't already have a native tap-friendly affordance — same fix
        // already used elsewhere in this UI (e.g. the old info-mode toggle).
        btn.ontouchstart = (e) => { e.preventDefault(); selectAction(); };
        partyDiv.appendChild(btn);
    });

    if (friendlies.length > 1 && window.showTutorialTip) {
        window.showTutorialTip('multi_character', "You've got more than one character now (party member, summon, or mount) — click their name in this bar to switch who you're controlling.");
    }
}

function selectCharacterByName(name) {
    // Search in party first (for stats), then in generic entities
    let char = window.party.find(p => p.name === name);
    if (!char) {
        // Find in entities (for horses/summons)
        const ent = window.entities.find(e => e.name === name);
        if (ent) char = ent; // Use entity directly as the data source
    }

    if (char) {
        window.player = char;
        const idx = window.party.findIndex(p => p.name === name);
        if (idx !== -1) window.selectedCharacterIndex = idx;
        
        updatePartyTabs();
        showCharacter();
        if (document.getElementById("character-screen-modal").style.display === "block") showCharacterScreen();
        if (document.getElementById("spell-menu-modal").style.display === "block") showSpellScreen();
        if (document.getElementById("inventory-modal").style.display === "block") showInventoryScreen();
        updateActionButtons();
    }
}

function addJerry() {
    if (window.party.length >= 12) {
        showMessage("Party is full!");
        return;
    }

    const races = ['human', 'dwarf', 'elf'];
    const classes = ['fighter', 'rogue', 'cleric', 'wizard', 'druid', 'monk'];
    const genders = ['female', 'male'];
    const randRace = races[Math.floor(Math.random() * races.length)];
    const randCls = classes[Math.floor(Math.random() * classes.length)];
    const randGender = genders[Math.floor(Math.random() * genders.length)];
    
    const jerry = window.createCharacterData(randRace, randCls, `Jerry ${window.party.length}`, randGender);
    window.party.push(jerry);
    
    const playerEntity = window.entities.find(e => e.side === 'player');
    if (!playerEntity) {
        showMessage("No player entity found to spawn next to!");
        return;
    }
    let spawnHex = { q: playerEntity.hex.q + 1, r: playerEntity.hex.r };
    
    const directions = [
        {q:1, r:0}, {q:1, r:-1}, {q:0, r:-1},
        {q:-1, r:0}, {q:-1, r:1}, {q:0, r:1},
        {q:2, r:0}, {q:0, r:2}, {q:-2, r:0}, {q:0, r:-2}
    ];

    for (let d of directions) {
        const testHex = { q: playerEntity.hex.q + d.q, r: playerEntity.hex.r + d.r };
        const isOccupied = window.entities.some(e => e.alive && e.hex.q === testHex.q && e.hex.r === testHex.r);
        if (window.isHexInBounds(testHex) && !isOccupied && window.getTerrainAt(testHex.q, testHex.r).name !== 'Water') {
            spawnHex = testHex;
            break;
        }
    }

    const jerryEntity = new window.Entity(jerry.name, "blue", spawnHex, jerry.attributes.agility + 10);
    jerryEntity.side = 'player';
    Object.assign(jerryEntity, jerry);
    jerryEntity.skills = jerry.skills;
    
    window.entities.push(jerryEntity);
    showMessage(`${jerry.name} (the ${randRace} ${randCls}) joined the party!`);
    
    updatePartyTabs();
    window.drawMap();
    window.renderEntities();
}

function toggleRest() {
    if (!window.isResting) {
        const enemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
        if (enemySeen) {
            showMessage("Cannot rest while enemies are nearby!");
            return;
        }
        if (window.isPlayerIndoors && window.isPlayerIndoors() && window.isBuildingOccupied && window.isBuildingOccupied()) {
            showMessage("You can't rest here — someone lives here.");
            return;
        }
        window._restSafe = false;
        window.isResting = true;
        showMessage("Resting until restored...");
        if (window.showTutorialTip) window.showTutorialTip('resting', "Resting fast-forwards time to recover HP/TP/mana. Out in the wilderness it isn't fully safe — you rest without armor on and there's a chance of being caught out, worse in less secure regions. Towns, inns, and empty buildings are safer.");

        // One ambush roll per rest attempt — a big enough party (3+) always
        // keeps a watch rotation going and cancels it entirely, no toggle
        // needed. An inn room is handled separately by restAtInn (always safe).
        const inArenaLobby = window.currentCampaign === "1";
        const partySize = window.entities.filter(e => e.alive && e.side === 'player' && !e.aiControlled && !e.rider).length;
        const hasGuardShift = partySize >= 3;
        if (!hasGuardShift && !window.isInArena && !inArenaLobby) {
            const indoors = window.isPlayerIndoors && window.isPlayerIndoors();
            const chance = indoors ? 0.10 : (window.getWildernessAmbushChance ? window.getWildernessAmbushChance() : 0.2);
            if (Math.random() < chance) {
                const delay = 800 + Math.random() * 2200;
                setTimeout(() => {
                    if (window.isResting && window.triggerRestAmbush) window.triggerRestAmbush(indoors ? 'door' : 'wilderness');
                }, delay);
            }
        }
    } else {
        window.isResting = false;
        showMessage("Stopped resting.");
    }
    updateRestButton();
}

function updateRestButton() {
    const btn = document.getElementById("rest-btn");
    if (!btn) return;
    
    // Check for mobile layout
    const isMobile = window.innerWidth <= 850;
    
    if (window.isResting) {
        btn.innerText = "Stop";
        btn.style.backgroundColor = "#f44336";
    } else {
        btn.innerText = isMobile ? "Rest" : "Rest until Restored";
        btn.style.backgroundColor = "#607d8b";
    }
}

// Real-time-only "fast forward" — triples both the world clock and
// real-time movement speed together (tick()'s !inCombat branch already
// drives both off the same scaledDt, so one multiplier covers both). Has no
// effect in combat (that branch runs at a fixed 1x regardless), and turns
// itself back off the moment combat starts so the player doesn't get
// surprised by a fight playing out at 3x.
function toggleTimeSpeed() {
    window.timeSpeedMultiplier = (window.timeSpeedMultiplier === 3) ? 1 : 3;
    updateTimeSpeedButton();
}
function updateTimeSpeedButton() {
    const btn = document.getElementById("time-speed-btn");
    if (!btn) return;
    const active = window.timeSpeedMultiplier === 3;
    btn.innerText = active ? "Speed: 3x" : "Speed: 1x";
    btn.style.backgroundColor = active ? "#00acc1" : "#00838f";
}
window.toggleTimeSpeed = toggleTimeSpeed;
window.updateTimeSpeedButton = updateTimeSpeedButton;

function toggleSleep() {
    if (!window.isSleeping) {
        const enemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
        if (enemySeen) {
            showMessage("Cannot sleep while enemies are nearby!");
            return;
        }
        if (window.isPlayerIndoors && window.isPlayerIndoors() && window.isBuildingOccupied && window.isBuildingOccupied()) {
            showMessage("You can't sleep here — someone lives here.");
            return;
        }
        window.isSleeping = true;

        // Initialize sleep timer for all player entities if needed (only if they don't have time left)
        const sentientAllies = window.entities.filter(e => e.side === 'player' && e.alive && !e.rider && e.name !== 'Wolf' && e.name !== 'Horse');
        sentientAllies.forEach(e => {
            if (!e.sleepRemainingSeconds || e.sleepRemainingSeconds <= 0) {
                e.sleepRemainingSeconds = 10 * 3600; // 10 hours
            }
            e.onGuard = false;
        });

        // 3+ people can rotate a watch — one keeps armor on and stays alert
        // all night, so an ambush only catches the others off-guard. Below
        // that, everyone actually sleeps and everyone's vulnerable.
        if (sentientAllies.length >= 3) {
            const guard = sentientAllies[Math.floor(Math.random() * sentientAllies.length)];
            guard.onGuard = true;
            showMessage(`You make camp for the night. ${guard.name} takes first watch while the others sleep.`);
        } else {
            showMessage("You make camp for the night and settle in to sleep.");
        }

        // One ambush roll for the night, same idea as resting — skipped
        // entirely in the arena (no wandering encounters there).
        const inArenaLobby = window.currentCampaign === "1";
        if (!window.isInArena && !inArenaLobby) {
            const indoors = window.isPlayerIndoors && window.isPlayerIndoors();
            const chance = indoors ? 0.10 : (window.getWildernessAmbushChance ? window.getWildernessAmbushChance() : 0.2);
            if (Math.random() < chance) {
                const delay = 1500 + Math.random() * 3000;
                setTimeout(() => {
                    if (window.isSleeping && window.triggerSleepAmbush) window.triggerSleepAmbush(indoors ? 'door' : 'wilderness');
                }, delay);
            }
        }
    } else {
        window.isSleeping = false;
        showMessage("Woke up.");
    }
    updateSleepButton();
}

function updateSleepButton() {
    const btn = document.getElementById("sleep-btn");
    if (!btn) return;
    
    if (window.isSleeping) {
        btn.innerText = "Stop";
        btn.style.backgroundColor = "#f44336";
    } else {
        // Show remaining if any
        const sentient = window.entities.find(e => e.alive && e.side === 'player' && e.name !== 'Wolf' && e.name !== 'Horse');
        if (sentient && sentient.sleepRemainingSeconds > 0) {
            const hrs = (sentient.sleepRemainingSeconds / 3600).toFixed(1);
            btn.innerText = `💤 (${hrs}h)`;
        } else {
            btn.innerText = "💤";
        }
        btn.style.backgroundColor = "#3f51b5";
    }
}

function showCharacter(){
  const info = document.getElementById("character-info");
  if (!info) return;
  if (!window.player){info.innerText="No character yet.";return;}
  
  let txt=`<strong>${window.player.name}</strong> (${window.player.race} ${window.player.class} Lv${window.player.level})<br>
HP: ${Math.ceil(window.player.hp)}/${window.player.maxHp} | MP: ${Math.floor(window.player.currentMana)}/${window.player.maxMana} ${window.isInCombat ? `| TP: ${Math.floor(window.player.timePoints)}` : ''} | Dmg: ${window.player.baseDamage}
`;
  info.innerHTML=txt;
}

function showCharacterScreen() {
    if (!window.player) return;

    const char = window.player;
    const contentDiv = document.getElementById("character-screen-content");
    if (!contentDiv) return;
    contentDiv.innerHTML = ''; 

    // SHOW ALL SKILLS TOGGLE
    const toggleDiv = document.createElement('div');
    toggleDiv.style.marginBottom = '15px';
    const toggleBtn = document.createElement('button');
    toggleBtn.innerText = window.showAllSkillsMode ? "Hide Locked Skills" : "Show All Skills";
    toggleBtn.onclick = () => {
        window.showAllSkillsMode = !window.showAllSkillsMode;
        showCharacterScreen();
    };
    toggleDiv.appendChild(toggleBtn);
    contentDiv.appendChild(toggleDiv);

    const isPartyMember = window.party.some(p => p.name === char.name);
    if (isPartyMember) {
        const expNext = char.level * 1000;
        const expDiv = document.createElement('div');
        expDiv.style.background = '#444';
        expDiv.style.padding = '10px';
        expDiv.style.marginBottom = '20px';
        expDiv.innerHTML = `
            <strong>Level:</strong> ${char.level} | 
            <strong>EXP:</strong> ${char.exp} / ${expNext}
            <button onclick="window.gainExp(1000)" style="margin-left: 20px; font-size: 0.7em;">Cheat: +1000 EXP</button>
            <button onclick="window.cheatTeleportNorthwatch && window.cheatTeleportNorthwatch()" style="margin-left: 10px; font-size: 0.7em;">Cheat: Teleport to Northwatch</button>
            <button onclick="window.cheatTeleportRidgehold && window.cheatTeleportRidgehold()" style="margin-left: 10px; font-size: 0.7em;">Cheat: Teleport to Ridgehold</button>
            <button onclick="window.cheatTeleportSilverhart && window.cheatTeleportSilverhart()" style="margin-left: 10px; font-size: 0.7em;">Cheat: Teleport to Silverhart</button>
            <button onclick="window.cheatExploreEverything && window.cheatExploreEverything()" style="margin-left: 10px; font-size: 0.7em;">Cheat: Explore Everything</button>
            <button onclick="window.cheatMaxAllSkills && window.cheatMaxAllSkills()" style="margin-left: 10px; font-size: 0.7em;">Cheat: Max All Skills</button>
        `;
        contentDiv.appendChild(expDiv);

        if (char.exp >= expNext) {
            const lvDiv = document.createElement('div');
            lvDiv.style.border = '2px solid #ffeb3b';
            lvDiv.style.padding = '10px';
            lvDiv.style.marginBottom = '20px';
            lvDiv.innerHTML = `
                <h3 style="color: #ffeb3b; margin-top: 0;">LEVEL UP READY!</h3>
                <label>Select class to level in:</label>
                <select id="level-up-class-select">
                    <option value="fighter">Fighter</option>
                    <option value="rogue">Rogue</option>
                    <option value="cleric">Cleric</option>
                    <option value="wizard">Wizard</option>
                    <option value="druid">Druid</option>
                    <option value="monk">Monk</option>
                </select>
                <button onclick="window.doLevelUp()">Gains Level</button>
            `;
            contentDiv.appendChild(lvDiv);
        }
    }

    const playerSkills = char.skills || {};
    const availablePoints = { ...char.attributes } || { wildcard: 0 };
    
    const skillTrees = {};
    for (const key in window.skills) {
        const skill = window.skills[key];
        if (!skillTrees[skill.tree]) {
            skillTrees[skill.tree] = [];
        }
        skillTrees[skill.tree].push(key);
    }

    if (availablePoints.wildcard > 0) {
        const wildcardDiv = document.createElement('div');
        wildcardDiv.innerHTML = `<h3>Wildcard Points: ${availablePoints.wildcard}</h3>`;
        contentDiv.appendChild(wildcardDiv);
        contentDiv.appendChild(document.createElement('hr'));
    }

    const treesToShow = new Set();
    const hasWildcard = availablePoints.wildcard > 0;
    const standardTrees = ['arcane', 'divine', 'nature', 'strength', 'endurance', 'agility', 'weapons', 'social', 'practical'];

    if (window.showAllSkillsMode) {
        Object.keys(skillTrees).forEach(t => {
            if (t !== 'paladin' && t !== 'monster_skills') treesToShow.add(t);
        });
    } else {
        for (const tree in availablePoints) {
            if (tree === 'wildcard') continue; 
            if (availablePoints[tree] > 0 || (hasWildcard && standardTrees.includes(tree))) {
                treesToShow.add(tree);
            }
        }
        for (const skillKey in playerSkills) {
            if (playerSkills[skillKey] > 0 && window.skills[skillKey]) {
                treesToShow.add(window.skills[skillKey].tree);
            }
        }
    }

    treesToShow.forEach(tree => {
        if (tree === 'monster_skills' || tree === 'paladin') return; // Hide internal and removed trees
        const treeDiv = document.createElement('div');
        treeDiv.className = 'skill-tree-container';
        let treeHtml = `<h3>${tree.charAt(0).toUpperCase() + tree.slice(1)} (Unspent: ${availablePoints[tree] || 0})</h3>`;
        const skillsInTree = skillTrees[tree] || [];

        if (skillsInTree.length > 0) {
            skillsInTree.forEach(skillKey => {
                const skill = window.skills[skillKey];
                let currentRanks = playerSkills[skillKey] || 0;
                
                if (skillKey === 'riding' || skillKey === 'riding_druid' || skillKey === 'riding_paladin') {
                    if (playerSkills['riding'] || playerSkills['riding_druid'] || playerSkills['riding_paladin']) {
                        currentRanks = 1;
                    }
                }

                const maxRanks = skill.maxRanks;
                const isMaxed = maxRanks > 0 && currentRanks >= maxRanks;
                
                let prereqMet = true;
                let missingPrereq = "";
                if (skill.prereq) {
                    const prereqRanks = playerSkills[skill.prereq] || 0;
                    if (prereqRanks === 0) {
                        prereqMet = false;
                        missingPrereq = `Requires: ${window.skills[skill.prereq].name}`;
                    }
                }
                if (skill.anti_prereq) {
                    if (playerSkills[skill.anti_prereq] > 0) {
                        prereqMet = false;
                        missingPrereq = `Incompatible with ${window.skills[skill.anti_prereq].name}`;
                    }
                }
                if (skill.prereq_eval) {
                    if (!skill.prereq_eval(char)) {
                        prereqMet = false;
                        missingPrereq = "Requirements not met.";
                    }
                }

                const hasPoints = (availablePoints[tree] || 0) > 0;
                const hasWildcardPoints = (availablePoints.wildcard || 0) > 0;
                const canUseWildcard = hasWildcardPoints && standardTrees.includes(tree);
                const canLearn = (hasPoints || canUseWildcard) && !isMaxed && prereqMet;
                const buttonLabel = maxRanks === 1 ? 'Learn' : `+1 Rank (${currentRanks})`;
                
                if (window.showAllSkillsMode || prereqMet || currentRanks > 0) {
                    treeHtml += `
                        <div class="skill-item" style="padding-left: 20px; margin-bottom: 10px;" title="${missingPrereq}">
                            <strong>${skill.name}</strong>: ${skill.description}
                            ${missingPrereq ? `<br><small style="color: #f44336;">${missingPrereq}</small>` : ''}
                            ${isMaxed && maxRanks === 1 ? 
                                '<span style="color: #4caf50; margin-left: 10px;">(Learned)</span>' : 
                                (isMaxed ? `<span style="color: #4caf50; margin-left: 10px;">(Max Rank: ${currentRanks})</span>` :
                                `<button onclick="window.learnSkill('${skillKey}')" ${canLearn ? '' : 'disabled'} style="margin-left: 10px;">${buttonLabel}</button>`)
                            }
                        </div>
                    `;
                }
            });
        }
        treeDiv.innerHTML = treeHtml;
        contentDiv.appendChild(treeDiv);
        contentDiv.appendChild(document.createElement('hr'));
    });
}

function learnSkill(skillKey) {
    const skill = window.skills[skillKey];
    const player = window.player;
    if (!skill || !player) {
        console.error("learnSkill: skill or player undefined", { skillKey, skill, player });
        return;
    }

    const standardTrees = ['arcane', 'divine', 'nature', 'strength', 'endurance', 'agility', 'weapons', 'social', 'practical'];
    const isStandard = standardTrees.includes(skill.tree);

    const currentRanks = player.skills[skillKey] || 0;
    if (skill.maxRanks > 0 && currentRanks >= skill.maxRanks) {
        showMessage("Skill already at maximum rank.");
        return;
    }

    if (skillKey === 'riding' || skillKey === 'riding_druid' || skillKey === 'riding_paladin') {
        if (player.skills['riding'] || player.skills['riding_druid'] || player.skills['riding_paladin']) {
            showMessage("You already know how to ride!");
            return;
        }
    }

    const rankCost = 1; // every rank costs a flat 1 point, regardless of how many ranks you already have
    if ((player.attributes[skill.tree] || 0) >= rankCost) {
        player.attributes[skill.tree] -= rankCost;
    } else if (player.attributes.wildcard >= rankCost && isStandard) {
        player.attributes.wildcard -= rankCost;
    } else {
        showMessage(`You don't have enough points to learn this skill (needs ${rankCost}).`);
        return;
    }

    player.skills[skillKey] = (player.skills[skillKey] || 0) + 1;
    
    const partyChar = window.party.find(p => p.name === player.name);
    if (partyChar) {
        partyChar.skills = player.skills;
        partyChar.attributes = player.attributes;
    }

    if (skill.apply) {
        skill.apply(player);
    }

    if (skillKey === 'riding' || skillKey === 'riding_druid' || skillKey === 'riding_paladin') {
        const playerEntity = window.entities.find(e => e.name === player.name);
        if (playerEntity) {
            const neighbors = window.getNeighbors(playerEntity.hex.q, playerEntity.hex.r);
            let spawnHex = null;
            for (let h of neighbors) {
                const isOccupied = window.entities.some(e => e.alive && e.getAllHexes().some(oh => oh.q === h.q && oh.r === h.r));
                const terrain = window.getTerrainAt(h.q, h.r);
                if (!isOccupied && terrain && terrain.name !== 'Water') {
                    spawnHex = h;
                    break;
                }
            }
            if (spawnHex) {
                const horse = window.createMonster('horse', spawnHex, null, null, 'player');
                window.entities.push(horse);
                showMessage("A Horse appeared nearby for you to ride!");
                window.drawMap();
                window.renderEntities();
            }
        }
    }

    const playerEntity = window.entities.find(e => e.name === player.name);
    if (playerEntity) {
        playerEntity.hp = player.hp;
        playerEntity.maxHp = player.maxHp;
        playerEntity.currentMana = player.currentMana;
        playerEntity.maxMana = player.maxMana;
        playerEntity.baseDamage = player.baseDamage;
        playerEntity.visionBonus = player.visionBonus;
        playerEntity.toHitRanged = player.toHitRanged;
        playerEntity.skills = player.skills;
        playerEntity.equipped = player.equipped;
    }

    showCharacter();
    showCharacterScreen();
    updateActionButtons();
    updateTurnIndicator(); 
}

function addAllEquipment() {
    if (!window.player) return;
    for (const itemId in window.items) {
        window.player.inventory.push(itemId);
        window.player.inventory.push(itemId);
    }
    showMessage("Cheat: Added 2 of every equipment piece to inventory.");
    if (document.getElementById("inventory-modal").style.display === "block") showInventoryScreen();
}

function cancelAllMoveOrders() {
    window.entities.forEach(e => {
        if (e.side === 'player') e.destination = null;
    });
    window.leaderPath = null;
    window.groupLeader = null;
    window.groupMoveMode = false;
    const btn = document.getElementById("move-group-btn");
    if (btn) {
        btn.innerText = "Move Group: OFF";
        btn.style.backgroundColor = "#795548";
    }
    showMessage("All move orders cancelled.");
    window.drawMap();
    window.renderEntities();
}

function showMessage(msg) { 
    console.log(msg);
    const logDiv = document.getElementById("message-log");
    if (logDiv) {
        const p = document.createElement("div");
        p.style.marginBottom = "2px";
        p.innerText = `> ${msg}`;
        logDiv.appendChild(p);
        requestAnimationFrame(() => {
            logDiv.scrollTop = logDiv.scrollHeight;
        });
    }
}

function updateActionButtons() {
    const buttonsDiv = document.getElementById('actions');
    if (!buttonsDiv) return;
    
    buttonsDiv.innerHTML = '';

    const inCombat = window.isInCombat;
    let player = inCombat ? window.currentTurnEntity : window.player;
    
    // Always try to find the actual world entity for the player side
    if (!player && window.entities) {
        player = window.entities.find(ent => ent.side === 'player' && !ent.rider);
    }
    
    // Fallback to window.player if no entity found
    if (!player) player = window.player;
    
    if (player && player.side === "player" && !player.aiControlled) {
        const charData = window.player;
        const isCasting = player.castCooldown > 0;

        const isSentientAlly = player.side === 'player' && !player.aiControlled && !['Wolf', 'Horse', 'Boar', 'Tiger', 'Eagle'].includes(player.name);
        
        // Ensure sentient logic uses the current resolved player entity
        if (isSentientAlly) {
            if (!window.playerAction) {
                window.updatePlayerUI();
            } else if (window.playerAction.type === 'spell') {
                window.clearHighlights();
                const actionSpell = window.playerAction.spell || (charData?.createdSpells || [])[window.playerAction.index];
                if (actionSpell) highlightValidTargets(player, actionSpell);
            }
            window.drawMap();
            window.renderEntities();
        }

        if (player.offhandAttackAvailable) {
            const offhandBtn = document.createElement('button');
            offhandBtn.innerText = "Off-hand Attack";
            offhandBtn.style.backgroundColor = "#ff5722";
            offhandBtn.disabled = isCasting;
            const offhandAction = () => {
                window.playerAction = { type: 'offhand_attack' };
                showMessage("Off-hand Attack ready. Click a target.");
                updateActionButtons();
            };
            offhandBtn.onclick = offhandAction;
            offhandBtn.ontouchstart = (e) => { e.preventDefault(); offhandAction(); };
            buttonsDiv.appendChild(offhandBtn);
        }

        if (window.playerIsLich) {
            const raiseBtn = document.createElement('button');
            raiseBtn.innerText = "Raise Undead";
            raiseBtn.style.backgroundColor = "#4a4a3a";
            raiseBtn.disabled = isCasting;
            const raiseAction = () => {
                window.playerAction = { type: 'raise_undead' };
                showMessage("Click an adjacent corpse (or your own horse) to raise it.");
                updateActionButtons();
            };
            raiseBtn.onclick = raiseAction;
            raiseBtn.ontouchstart = (e) => { e.preventDefault(); raiseAction(); };
            buttonsDiv.appendChild(raiseBtn);
        }

        if (inCombat) {
            const forceAttackBtn = document.createElement('button');
            forceAttackBtn.innerText = "Attack Target";
            forceAttackBtn.style.backgroundColor = "#c62828";
            forceAttackBtn.disabled = isCasting;
            const forceAttackAction = () => {
                window.playerAction = { type: 'force_attack' };
                showMessage("Attack ready — click any target, including a neutral or friendly one.");
                updateActionButtons();
            };
            forceAttackBtn.onclick = forceAttackAction;
            forceAttackBtn.ontouchstart = (e) => { e.preventDefault(); forceAttackAction(); };
            buttonsDiv.appendChild(forceAttackBtn);

            const parleyBtn = document.createElement('button');
            parleyBtn.innerText = "Parley";
            parleyBtn.style.backgroundColor = "#6d4c41";
            parleyBtn.disabled = isCasting;
            const parleyAction = () => {
                window.playerAction = { type: 'parley' };
                showMessage("Click a hostile within range to talk instead of fight.");
                updateActionButtons();
            };
            parleyBtn.onclick = parleyAction;
            parleyBtn.ontouchstart = (e) => { e.preventDefault(); parleyAction(); };
            buttonsDiv.appendChild(parleyBtn);
        }

        if (player.hex) {
            const coord = `${player.hex.q},${player.hex.r}`;
            if (window.mapItems[coord] && window.mapItems[coord].length > 0) {
                const lootBtn = document.createElement('button');
                lootBtn.innerText = `Loot Hex (${window.mapItems[coord].length} items)`;
                lootBtn.style.backgroundColor = '#FFD700';
                lootBtn.style.color = '#000';
                lootBtn.disabled = isCasting;
                lootBtn.onclick = () => { window.lootItems(player); };
                lootBtn.ontouchstart = (e) => { e.preventDefault(); window.lootItems(player); };
                buttonsDiv.appendChild(lootBtn);
                if (window.showTutorialTip) window.showTutorialTip('loot_button', "Standing over something lootable — a Loot Hex button has appeared below. Click it to pick everything up.");
            }
        }

        if (inCombat) {
            const waitBtn = document.createElement('button');
            waitBtn.id = 'wait-action-btn';
            waitBtn.innerText = "Wait (1 TP)";
            waitBtn.style.backgroundColor = "#9e9e9e";
            waitBtn.disabled = isCasting;
            const waitAction = () => {
                window.spendTP(player, 1);
                window.finalizePlayerAction(player, 'wait');
            };
            waitBtn.onclick = waitAction;
            waitBtn.ontouchstart = (e) => { e.preventDefault(); waitAction(); };
            buttonsDiv.appendChild(waitBtn);
        }

        // STEALTH BUTTON
        if (!player.isStealthed) {
            const stealthBtn = document.createElement('button');
            stealthBtn.innerText = "Stealth (5 TP)";
            stealthBtn.style.backgroundColor = "#607d8b";
            stealthBtn.disabled = isCasting || (player.timePoints < 5);
            const stealthAction = () => {
                if (window.tryStealth(player)) {
                    window.spendTP(player, 5);
                }
                if (inCombat) window.finalizePlayerAction(player, true);
                else updateActionButtons();
            };
            stealthBtn.onclick = stealthAction;
            stealthBtn.ontouchstart = (e) => { if(!stealthBtn.disabled) { e.preventDefault(); stealthAction(); } };
            buttonsDiv.appendChild(stealthBtn);
        } else {
            const breakBtn = document.createElement('button');
            breakBtn.innerText = "Break Stealth";
            breakBtn.style.backgroundColor = "#ff9800";
            breakBtn.disabled = isCasting;
            const breakAction = () => {
                window.breakStealth(player);
                if (inCombat) window.finalizePlayerAction(player, true);
                else updateActionButtons();
            };
            breakBtn.onclick = breakAction;
            breakBtn.ontouchstart = (e) => { e.preventDefault(); breakAction(); };
            buttonsDiv.appendChild(breakBtn);
        }

        // DISMISS COMPANION BUTTON
        if (player.animalCompanion) {
            const dismissBtn = document.createElement('button');
            dismissBtn.innerText = `Dismiss ${player.animalCompanion.name}`;
            dismissBtn.style.backgroundColor = "#777";
            dismissBtn.disabled = isCasting;
            const dismissAction = () => {
                player.animalCompanion.alive = false;
                player.animalCompanion = null;
                showMessage("Animal companion dismissed.");
                window.drawMap();
                window.renderEntities();
                updateActionButtons();
            };
            dismissBtn.onclick = dismissAction;
            dismissBtn.ontouchstart = (e) => { e.preventDefault(); dismissAction(); };
            buttonsDiv.appendChild(dismissBtn);
        }

        const skills = player.skills || charData?.skills || {};
        const hasRiding = skills['riding'] || skills['riding_druid'] || skills['riding_paladin'];
        if (hasRiding) {
            if (player.riding) {
                const dismountBtn = document.createElement('button');
                dismountBtn.id = 'dismount-action-btn';
                dismountBtn.innerText = "Dismount";
                dismountBtn.style.backgroundColor = "#795548";
                dismountBtn.disabled = isCasting;
                const dismountAction = () => {
                    window.playerAction = { type: 'dismount' };
                    showMessage("Click an adjacent empty hex to dismount.");
                    updateActionButtons();
                };
                dismountBtn.onclick = dismountAction;
                dismountBtn.ontouchstart = (e) => { e.preventDefault(); dismountAction(); };
                buttonsDiv.appendChild(dismountBtn);
            } else {
                const mountBtn = document.createElement('button');
                mountBtn.id = 'mount-action-btn';
                mountBtn.innerText = "Mount";
                mountBtn.style.backgroundColor = "#795548";
                mountBtn.disabled = isCasting;
                const mountAction = () => {
                    window.playerAction = { type: 'mount' };
                    showMessage("Click an adjacent mount to climb on.");
                    updateActionButtons();
                };
                mountBtn.onclick = mountAction;
                mountBtn.ontouchstart = (e) => { e.preventDefault(); mountAction(); };
                buttonsDiv.appendChild(mountBtn);
            }
        }

        // FLY / LAND BUTTONS
        const canFly = player.skills?.fly || player.isFlying || player.name === 'Eagle' || (player.tags && player.tags.includes('flying')) || player.flyCheat;
        if (canFly) {
            if (!player.isFlying) {
                const flyBtn = document.createElement('button');
                flyBtn.innerText = "Take Off (1 TP)";
                flyBtn.style.backgroundColor = "#03a9f4";
                flyBtn.disabled = isCasting || player.timePoints < 1;
                flyBtn.onclick = () => {
                    player.isFlying = true;
                    window.spendTP(player, 1);
                    showMessage(`${player.name} takes to the air!`);
                    if (window.syncCharacterToServer) window.syncCharacterToServer();
                    window.finalizePlayerAction(player, true);
                };
                buttonsDiv.appendChild(flyBtn);
            } else {
                const landBtn = document.createElement('button');
                landBtn.innerText = "Land (1 TP)";
                landBtn.style.backgroundColor = "#8bc34a";
                landBtn.disabled = isCasting || player.timePoints < 1;
                landBtn.onclick = () => {
                    player.isFlying = false;
                    window.spendTP(player, 1);
                    showMessage(`${player.name} lands.`);
                    if (window.syncCharacterToServer) window.syncCharacterToServer();
                    window.finalizePlayerAction(player, true);
                };
                buttonsDiv.appendChild(landBtn);
            }
        }

        if (window.playerAction) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancel-action-btn';
            cancelBtn.innerText = 'Cancel Current Action';
            cancelBtn.style.backgroundColor = '#f44336';
            cancelBtn.style.color = 'white';
            cancelBtn.style.marginBottom = '10px';
            cancelBtn.style.display = 'block';
            cancelBtn.onclick = () => {
                window.playerAction = null;
                window.showMessage("Action cancelled.");
                updateActionButtons();
            };
            buttonsDiv.appendChild(cancelBtn);
        }

        if (charData && charData.skills) {
            for (const skillKey in charData.skills) {
                const skill = window.skills[skillKey];
                if (skill && skill.active && charData.skills[skillKey] > 0) {
                    if (skill.tree === 'monster_skills') continue; // Handled specially (Fly/Land) or internal
                    
                    let weaponReqMet = true;
                    if (skillKey.endsWith('_feint')) {
                        const weaponType = skillKey.split('_')[0];
                        const eq = charData.equipped.weapon;
                        if (!eq || !window.items[eq] || !window.items[eq]?.id.includes(weaponType)) weaponReqMet = false;
                    } else if (skillKey === 'disarm') {
                        const eq = charData.equipped.weapon;
                        if (!eq) weaponReqMet = false; 
                    } else if (skillKey === 'assassinate') {
                        const eq = charData.equipped.weapon;
                        if (!eq) weaponReqMet = false;
                    } else if (skillKey === 'dagger_throw') {
                        const eq = charData.equipped.weapon;
                        if (eq !== 'dagger') weaponReqMet = false;
                    } else if (skillKey === 'pickpocket') {
                        if (!charData.isStealthed) weaponReqMet = false;
                    }
                    
                    if (weaponReqMet) {
                        const button = document.createElement('button');
                        button.id = `skill-btn-${skillKey}`;
                        let label = skill.name;
                        if (skillKey.endsWith('_feint')) label = `${skillKey.split('_')[0].toUpperCase()} Feint`;
                        button.innerText = label;
                        button.title = skill.description || label;
                        button.disabled = isCasting;
                        button.onclick = () => {
                            window.playerAction = { type: 'skill', id: skillKey };
                            window.showMessage(`Action set to: ${skill.name}. Click on a target.`);
                            updateActionButtons();
                        };
                        buttonsDiv.appendChild(button);
                    }
                }
            }
        }

        if (charData && charData.createdSpells) {
            charData.createdSpells.forEach((spell, index) => {
                const button = document.createElement('button');
                button.id = `spell-btn-${index}`;
                button.innerText = spell.name;
                const spellInfo = `${spell.name}: ${spell.school || ''} ${spell.type || ''}, range ${spell.range}, ${spell.tpCost} TP / ${spell.manaCost} mana.`.replace(/\s+/g, ' ').trim();
                button.title = spellInfo;
                button.disabled = isCasting || (player.timePoints < spell.tpCost);
                button.onclick = () => {
                    window.playerAction = { type: 'spell', index: index, targets: [] };
                    const targetStr = (spell.extraTargets || 0) > 0 ? `Select up to ${1 + spell.extraTargets} targets.` : "Click a target.";
                    window.showMessage(`Spell ready: ${spell.name}. ${targetStr} Range (${spell.range}).`);
                    updateActionButtons();
                };
                buttonsDiv.appendChild(button);
            });
        }
    }
}

function showSpellScreen() {
    const player = window.player;
    const contentDiv = document.getElementById("spell-menu-content");
    contentDiv.innerHTML = '';
    if (!player.unlockedBaseSpells || player.unlockedBaseSpells.length === 0) {
        contentDiv.innerHTML = '<p>You know no base spells. Learn them from your character screen.</p>';
        return;
    }
    if (window.showTutorialTip) window.showTutorialTip('spell_builder', "Pick a base spell, then adjust range/magnitude/targets with the sliders — mana and TP cost update live. Once it looks right, hit Save to add it to your action bar.");
    let html = `
        <div class="spell-form">
            <div class="form-group">
                <label>Base Spell:</label>
                <select id="spell-base-select" onchange="window.updateSpellPreview()">
                    ${player.unlockedBaseSpells.map(id => `<option value="${id}">${window.baseSpells[id].name}</option>`).join('')}
                </select>
            </div>
            <div id="spell-options-container"></div>
            <div id="spell-preview" style="margin-top: 20px; padding: 10px; background: #444; border-radius: 4px;">
                <div id="spell-stats-display"></div>
            </div>
            <button onclick="window.createSpell()" style="margin-top: 20px;">Save Spell</button>
        </div>
        <hr>
        <h3>Your Spells</h3>
        <div id="existing-spells-list">
            ${player.createdSpells.map((s, i) => `<div style="margin-bottom: 5px;"><strong>${s.name}</strong> (Mana: ${s.manaCost}, TP: ${s.tpCost}, Mag: ${s.magnitude}, Range: ${s.range})</div>`).join('')}
        </div>
    `;
    contentDiv.innerHTML = html;
    window.updateSpellPreview();
}

function updateSpellPreview() {
    const player = window.player;
    const baseSelect = document.getElementById("spell-base-select");
    if (!baseSelect) return;
    const baseId = baseSelect.value;
    const base = window.baseSpells[baseId];
    const options = player.unlockedCastingOptions[base.school] || {};
    let html = '';
    if (base.type === 'summon') {
        let optionsHtml = '';
        base.summons.forEach(animalId => {
            if (animalId === 'boar' && (!player.skills?.learn_boar_summon)) return;
            if (animalId === 'tiger' && (!player.skills?.learn_tiger_summon)) return;
            if (animalId === 'eagle' && (!player.skills?.learn_eagle_summon)) return;
            // Unicorn is never an ordinary temporary summon — only listed at
            // the exact moment it could actually be cast: the druid-granted
            // skill, the permanent-companion passive, and no existing
            // companion yet (matches resolveSpell's own guard, gameEngine.js).
            if (animalId === 'unicorn' && (!player.skills?.learn_unicorn_summon || !player.skills?.animal_companion || player.animalCompanion)) return;
            optionsHtml += `<option value="${animalId}">${window.monsterTemplates[animalId].name}</option>`;
        });
        html += `
            <div class="form-group">
                <label>Animal to Summon:</label>
                <select id="spell-animal-select" onchange="window.renderSpellStats()">
                    ${optionsHtml}
                </select>
            </div>
        `;
    }
    html += `
        <div class="form-group">
            <label>Casting Speed:</label>
            <select id="spell-speed-select" onchange="window.renderSpellStats()">
                <option value="default">Default (10 TP)</option>
                ${options.quickened ? '<option value="quickened">Quickened (5 TP, +5 Mana)</option>' : ''}
                ${options.slowed ? '<option value="slowed">Slowed (20 TP, -4 Mana)</option>' : ''}
            </select>
        </div>
        <div class="form-group">
            <label>Range Bonus (Max: +${options.extraRange || 0}):</label>
            <input type="number" id="spell-range-bonus" value="0" min="0" max="${options.extraRange || 0}" onchange="window.renderSpellStats()">
            <span style="font-size: 0.8em; color: #aaa;">(+1 Mana per +1 Range)</span>
        </div>
        <div class="form-group">
            <label>Magnitude Bonus (Max: +${options.extraMagnitude || 0}x):</label>
            <input type="number" id="spell-magnitude-bonus" value="0" min="0" max="${options.extraMagnitude || 0}" onchange="window.renderSpellStats()">
            <span style="font-size: 0.8em; color: #aaa;">(+5 Mana per +1x Magnitude)</span>
        </div>
    `;
    const expandRanks = player.skills[`${base.school}_expand`] || 0;
    if (expandRanks > 0 && base.baseRadius !== undefined) {
        html += `
            <div class="form-group">
                <label>Radius Bonus (Max: +${expandRanks}):</label>
                <input type="number" id="spell-radius-bonus" value="0" min="0" max="${expandRanks}" onchange="window.renderSpellStats()">
                <span style="font-size: 0.8em; color: #aaa;">(+10 Mana per +1 Radius)</span>
            </div>
        `;
    }
    const targetRanks = player.skills[`${base.school}_targets`] || 0;
    if (targetRanks > 0 && base.type !== 'aoe_debuff' && base.type !== 'summon') {
        html += `
            <div class="form-group">
                <label>Extra Targets (Max: +${targetRanks}):</label>
                <input type="number" id="spell-targets-bonus" value="0" min="0" max="${targetRanks}" onchange="window.renderSpellStats()">
                <span style="font-size: 0.8em; color: #aaa;">(+15 Mana per +1 Target)</span>
            </div>
        `;
    }
    const optContainer = document.getElementById("spell-options-container");
    if (optContainer) optContainer.innerHTML = html;
    window.renderSpellStats();
}

function renderSpellStats() {
    const player = window.player;
    const baseSelect = document.getElementById("spell-base-select");
    if (!baseSelect) return;
    const baseId = baseSelect.value;
    const base = window.baseSpells[baseId];
    
    const speedSelect = document.getElementById("spell-speed-select");
    const speed = speedSelect ? speedSelect.value : 'default';
    
    const rangeInput = document.getElementById("spell-range-bonus");
    const rangeBonus = rangeInput ? (parseInt(rangeInput.value) || 0) : 0;
    
    const magInput = document.getElementById("spell-magnitude-bonus");
    const magBonus = magInput ? (parseInt(magInput.value) || 0) : 0;
    
    const radBonusInput = document.getElementById("spell-radius-bonus");
    const radBonus = radBonusInput ? (parseInt(radBonusInput.value) || 0) : 0;
    const targetBonusInput = document.getElementById("spell-targets-bonus");
    const targetBonus = targetBonusInput ? (parseInt(targetBonusInput.value) || 0) : 0;

    let manaCost = base.baseMana;
    let tpCost = 10;
    let magnitude = base.baseMagnitude * (1 + magBonus);
    let range = (base.baseRange || 1) + rangeBonus;
    let radius = (base.baseRadius || 0) + radBonus;
    let extraTargets = targetBonus;

    let defaultName = base.name;
    const animalId = document.getElementById("spell-animal-select") ? document.getElementById("spell-animal-select").value : null;
    if (base.type === 'summon' && animalId) {
        const animalName = window.monsterTemplates[animalId].name;
        defaultName = `Summon ${animalName}`;
    }

    let effRange = 0, effMag = 0, effSpeed = 0;
    if (base.school === 'arcane') {
        effRange = player.skills['arcane_eff_range'] || 0;
        effMag = player.skills['arcane_eff_magnitude'] || 0;
        effSpeed = player.skills['arcane_eff_speed'] || 0;
    }
    if (speed === 'quickened') { tpCost = 5; manaCost += Math.max(0, 5 - effSpeed); }
    if (speed === 'slowed') { tpCost = 20; manaCost -= 4; }
    
    manaCost += Math.max(0, rangeBonus - effRange);
    manaCost += (magBonus * Math.max(0, 5 - effMag));
    manaCost += (radBonus * 10);
    manaCost += (targetBonus * 15);

    const coreManaCost = base.baseMana + (magBonus * Math.max(0, 5 - effMag)) + (radBonus * 10) + (targetBonus * 15);

    const cap = player.manaCaps[base.school] || 10;
    const overCap = manaCost > cap;
    let statsHtml = `
        <p><strong>Total Mana Cost:</strong> ${manaCost.toFixed(1)} ${overCap ? '<span style="color:#f44336; font-weight: bold;">(EXCEEDS CAP: ' + cap + ')</span>' : ''}</p>
        <p><strong>Core Mana Cost (Maint):</strong> ${coreManaCost.toFixed(1)}</p>
        <p><strong>TP Cost:</strong> ${tpCost}</p>
        <p><strong>Magnitude:</strong> ${magnitude}</p>
        <p><strong>Range:</strong> ${range}</p>
        ${base.baseRadius !== undefined ? `<p><strong>Radius:</strong> ${radius}</p>` : ''}
        ${extraTargets > 0 ? `<p><strong>Extra Targets:</strong> ${extraTargets}</p>` : ''}
    `;
    const display = document.getElementById("spell-stats-display");
    if (display) display.innerHTML = statsHtml;
    
    if (animalId === 'boar') {
        manaCost += 8;
    } else if (animalId === 'tiger') {
        manaCost += 15;
    } else if (animalId === 'eagle') {
        manaCost += 5;
    }

    if (animalId === 'boar' || animalId === 'tiger' || animalId === 'eagle') {
        // Update display again with corrected mana
        const overCapNew = manaCost > cap;
        statsHtml = `
            <p><strong>Total Mana Cost:</strong> ${manaCost.toFixed(1)} ${overCapNew ? '<span style="color:#f44336; font-weight: bold;">(EXCEEDS CAP: ' + cap + ')</span>' : ''}</p>
            <p><strong>Core Mana Cost (Maint):</strong> ${coreManaCost.toFixed(1)}</p>
            <p><strong>TP Cost:</strong> ${tpCost}</p>
            <p><strong>Magnitude:</strong> ${magnitude}</p>
            <p><strong>Range:</strong> ${range}</p>
            ${base.baseRadius !== undefined ? `<p><strong>Radius:</strong> ${radius}</p>` : ''}
            ${extraTargets > 0 ? `<p><strong>Extra Targets:</strong> ${extraTargets}</p>` : ''}
        `;
        if (display) display.innerHTML = statsHtml;
    }

    window.currentSpellCalc = { name: defaultName, school: base.school, manaCost, coreManaCost, tpCost, magnitude, range, radius, extraTargets, type: base.type, baseId, animalId };
}

function createSpell() {
    const player = window.player;
    const calc = window.currentSpellCalc;
    const cap = player.manaCaps[calc.school] || 10;
    if (calc.manaCost > cap) { showMessage("Cannot save spell: Mana cost exceeds your cap for this school."); return; }
    const spellName = prompt("Enter a name for this spell:", calc.name);
    if (!spellName) return;
    const newSpell = { ...calc, name: spellName };
    player.createdSpells.push(newSpell);
    showSpellScreen();
    updateActionButtons();
}

function showInventoryScreen() {
    const player = window.player;
    const contentDiv = document.getElementById("inventory-content");
    if (!contentDiv) return;
    contentDiv.innerHTML = '';
    if (!player) { contentDiv.innerHTML = '<p>Character not initialized.</p>'; return; }
    let html = `<h3>Gold: ${player.gold || 0}</h3><h3>Equipped</h3>`;
    const slots = [{ label: 'Weapon', key: 'weapon' }, { label: 'Off-hand', key: 'offhand' }, { label: 'Armor/Barding', key: 'armor' }, { label: 'Helmet', key: 'helmet' }, { label: 'Accessory', key: 'accessory' }, { label: 'Clothes', key: 'clothes' }];
    slots.forEach(slot => {
        const itemId = player.equipped[slot.key];
        const item = itemId ? window.items[itemId] : null;
        const itemName = item ? item.name : 'None';
        html += `<div style="margin-bottom: 5px;"><strong>${slot.label}:</strong> ${itemName} ${itemId ? `<button onclick="window.unequipItem('${slot.key}')" style="font-size: 0.8em; margin-left: 10px;">Unequip</button>` : ''}</div>`;
    });
    // Only matters when both an armor and a clothes item are equipped at
    // once — otherwise whichever's actually equipped just shows (see
    // showClothes in drawPlayerCharacter, gameEngine.js).
    const mode = window.clothingDisplayMode === 'clothes' ? 'clothes' : 'armor';
    html += `<div style="margin-bottom: 10px;"><strong>Always show:</strong>
        <button onclick="window.setClothingDisplayMode('armor')" style="${mode === 'armor' ? 'font-weight:bold;text-decoration:underline;' : ''}">Armor</button>
        <button onclick="window.setClothingDisplayMode('clothes')" style="margin-left:5px;${mode === 'clothes' ? 'font-weight:bold;text-decoration:underline;' : ''}">Clothes</button>
    </div>`;
    html += '<h3>Backpack</h3>';
    if (player.inventory.length === 0) html += '<p>Empty</p>';
    else {
        // Group items by ID
        const counts = {};
        player.inventory.forEach(id => counts[id] = (counts[id] || 0) + 1);

        Object.keys(counts).forEach(itemId => {
            const item = window.items[itemId];
            if (!item) return;

            const count = counts[itemId];
            // How many are equipped?
            let equipCount = 0;
            if (player.equipped.weapon === itemId) equipCount++;
            if (player.equipped.offhand === itemId) equipCount++;
            if (player.equipped.armor === itemId) equipCount++;
            if (player.equipped.helmet === itemId) equipCount++;
            if (player.equipped.accessory === itemId) equipCount++;
            if (player.equipped.clothes === itemId) equipCount++;

            const available = count - equipCount;
            const canBeOffhand = item.canOffhand || item.type === 'shield';
            const mainHandWeapon = player.equipped.weapon ? window.items[player.equipped.weapon] : null;
            const showOffhandBtn = canBeOffhand && (item.type === 'shield' || (mainHandWeapon && mainHandWeapon.hands === 1)) && available > 0;

            html += `<div style="margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;">
                <strong>${item.name} x${count}</strong> (${item.type})
                ${equipCount > 0 ? `<br><span style="color: #4caf50; font-size: 0.8em;">Equipped: ${equipCount}</span>` : ''}
                <br><span style="font-size: 0.8em; color: #aaa;">${item.damage ? 'Dmg: +' + item.damage : ''} ${item.range ? 'Range: +' + item.range : ''} ${item.hands ? 'Hands: ' + item.hands : ''}</span>
                <br>
                ${available > 0 && (item.type !== 'consumable' && item.type !== 'shield') ? `<button onclick="window.equipItem('${itemId}')">Equip</button>` : ''}
                ${showOffhandBtn ? `<button onclick="window.equipItem('${itemId}', true)" style="margin-left:5px;">Equip Off-hand</button>` : ''}
                ${item.type === 'consumable' && available > 0 ? `<button onclick="window.drinkPotion('${itemId}')">Drink</button>` : ''}
                ${item.type === 'food' && available > 0 ? `<button onclick="window.eatFood('${itemId}')">Eat</button>` : ''}
            </div>`;
        });
    }
    contentDiv.innerHTML = html;
}

// Held items (weapons/shields/accessories/helmets) cost a flat second to
// swap; armor takes longer the heavier it is, and swapping between two
// armor tiers takes as long as the slower of the two changes (you're both
// taking the old piece off and getting the new one on).
const ARMOR_SWAP_SECONDS = { light_armor: 2, medium_armor: 4, heavy_armor: 6 };
function getEquipLockSeconds(oldItemId, newItemId) {
    const oldSec = oldItemId && ARMOR_SWAP_SECONDS[oldItemId] || (oldItemId ? 1 : 0);
    const newSec = newItemId && ARMOR_SWAP_SECONDS[newItemId] || (newItemId ? 1 : 0);
    return Math.max(oldSec, newSec);
}
// Applies the lock: outside combat this briefly stops the character's
// real-time movement (checked in autoMoveProcess); in combat, equipping is
// still gated to that character's own turn, so there's nothing to "pause".
function applyEquipLock(playerEntity, seconds) {
    if (!window.isInCombat && seconds > 0) {
        playerEntity.actionLockedUntil = performance.now() + seconds * 1000;
    }
}

// "Always show: Armor / Clothes" toggle — only matters when both an armor
// and a clothes item are equipped at once (see showClothes in
// drawPlayerCharacter, gameEngine.js).
function setClothingDisplayMode(mode) {
    window.clothingDisplayMode = mode === 'clothes' ? 'clothes' : 'armor';
    showInventoryScreen();
    window.renderEntities();
}
window.setClothingDisplayMode = setClothingDisplayMode;

function unequipItem(slot) {
    const player = window.player;
    const playerEntity = window.entities.find(e => e.name === player.name);
    if (!playerEntity) return;
    if (slot === 'clothes') {
        player.equipped.clothes = null;
        syncPlayerEntity();
        showInventoryScreen();
        showCharacter();
        window.renderEntities();
        return;
    }
    if (window.isInCombat) {
        if (window.gamePhase !== 'PLAYER_TURN' || window.currentTurnEntity !== playerEntity) { showMessage("It must be this character's turn to change equipment."); return; }
        if (playerEntity.timePoints < 1) { showMessage("Not enough Time Points to change equipment."); return; }
    }
    const removedItem = player.equipped[slot];
    player.equipped[slot] = null;
    if (window.isInCombat) playerEntity.timePoints -= 1;
    else applyEquipLock(playerEntity, getEquipLockSeconds(removedItem, null));
    syncPlayerEntity();
    showInventoryScreen();
    showCharacter();
    window.updatePlayerUI();
}

function drinkPotion(itemId) {
    const player = window.player;
    const item = window.items[itemId];
    const ent = window.entities.find(e => e.name === player.name);
    
    if (ent && ent.timePoints < 1) {
        showMessage("Not enough TP to drink.");
        return;
    }

    if (itemId === 'potion_health') {
        const healAmt = 5;
        player.hp = Math.min(player.maxHp, player.hp + healAmt);
        if (ent) {
            ent.hp = player.hp;
            window.spendTP(ent, 1);
        }
        showMessage(`You drink the ${item.name} and heal for ${healAmt} HP.`);
    }

    // Remove from inventory
    const idx = player.inventory.indexOf(itemId);
    if (idx > -1) player.inventory.splice(idx, 1);

    showInventoryScreen();
    showCharacter();
    window.renderEntities();
}

function equipItem(itemId, isOffhand = false) {
    const player = window.player;
    const item = window.items[itemId];
    const playerEntity = window.entities.find(e => e.name === player.name);
    if (!playerEntity) return;

    // Cosmetic only — no combat-turn gate, no TP cost, no equip lock,
    // unlike every other slot below.
    if (item.type === 'clothes') {
        player.equipped.clothes = itemId;
        syncPlayerEntity();
        showInventoryScreen();
        showCharacter();
        window.renderEntities();
        return;
    }

    if (window.isInCombat) {
        if (window.gamePhase !== 'PLAYER_TURN' || window.currentTurnEntity !== playerEntity) { showMessage("It must be this character's turn to change equipment."); return; }
        if (playerEntity.timePoints < 1) { showMessage("Not enough Time Points to change equipment."); return; }
    }

    let oldItemForLock = null;
    if (item.type === 'accessory') {
        oldItemForLock = player.equipped.accessory;
        player.equipped.accessory = itemId;
    } else if (item.type === 'weapon') {
        oldItemForLock = isOffhand ? player.equipped.offhand : player.equipped.weapon;
        if (isOffhand) player.equipped.offhand = itemId;
        else { player.equipped.weapon = itemId; if (item.hands === 2) player.equipped.offhand = null; }
    } else if (item.type === 'shield') {
        oldItemForLock = player.equipped.offhand;
        const weaponId = player.equipped.weapon;
        const weapon = weaponId ? window.items[weaponId] : null;
        if (weapon && weapon.hands === 2) player.equipped.weapon = null;
        player.equipped.offhand = itemId;
    } else if (item.type === 'armor') {
        const reqMap = { 'light_armor': 'light_armor_training', 'medium_armor': 'medium_armor_training', 'heavy_armor': 'heavy_armor_training' };
        const reqSkill = reqMap[itemId];
        if (reqSkill && (!player.skills[reqSkill] || player.skills[reqSkill] === 0)) {
            showMessage(`You need ${window.skills[reqSkill].name} to equip this. Learn it from your character screen's skill tree, if you have a free skill point.`);
            return;
        }
        oldItemForLock = player.equipped.armor;
        player.equipped.armor = itemId;
    } else if (item.type === 'helmet') {
        oldItemForLock = player.equipped.helmet;
        player.equipped.helmet = itemId;
    }
    if (window.isInCombat) playerEntity.timePoints -= 1;
    else applyEquipLock(playerEntity, getEquipLockSeconds(oldItemForLock, itemId));
    syncPlayerEntity();
    showInventoryScreen();
    showCharacter();
    window.updatePlayerUI();
    if (window.showTutorialTip) window.showTutorialTip('equip_item', "Equipping swaps this into the character's slot immediately — attack range, armor, and appearance all update right away. Some items briefly lock the slot from being swapped again.");
}

function syncPlayerEntity() {
    if (window.party) {
        window.party.forEach(char => {
            const ent = window.entities.find(e => e.name === char.name && e.alive);
            if (ent) {
                ent.equipped = char.equipped;
                ent.hp = char.hp;
                ent.maxHp = char.maxHp;
                ent.currentMana = char.currentMana;
                ent.maxMana = char.maxMana;
                ent.baseDamage = char.baseDamage;
                ent.baseReduction = char.baseReduction;
                ent.toHitMelee = char.toHitMelee;
                ent.toHitRanged = char.toHitRanged;
                ent.toHitSpell = char.toHitSpell;
                ent.passiveDodge = char.passiveDodge;
                ent.offhandAttackAvailable = char.offhandAttackAvailable;
                ent.side = 'player';
            }
        });
    }
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
}

function gainExp(amt) {
    window.player.exp += amt;
    // In the arena, window.player can be a standalone Entity clone rather
    // than the actual window.party record (see setupArenaLobby), so the
    // character sheet (which reads the party record) would otherwise never
    // see this gain. Keep the two in sync regardless of which one XP landed on.
    const partyChar = window.party.find(p => p.name === window.player.name);
    if (partyChar && partyChar !== window.player) partyChar.exp = window.player.exp;
    window.showMessage(`Gained ${amt} experience.`);
    if (document.getElementById("character-screen-modal").style.display === "block") showCharacterScreen();
}

function applyLevelUp(char, cls) {
    if (char.level >= (window.currentLevelCap || 50)) return;
    char.level += 1;
    const cb = window.classData[cls].bonus;
    for (let key in cb) char.attributes[key] = (char.attributes[key] || 0) + cb[key];

    const rb = window.raceData[char.race].bonus;
    for (let key in rb) char.attributes[key] = (char.attributes[key] || 0) + rb[key];

    if (!char.classLevels) char.classLevels = {}; // characters/saves predating this tracking start with no history
    char.classLevels[cls] = (char.classLevels[cls] || 0) + 1;
}

/** True if `char` has taken at least one level in `cls` (character creation counts as a level). */
function hasClassLevel(char, cls) {
    return !!(char.classLevels && char.classLevels[cls] > 0);
}
window.hasClassLevel = hasClassLevel;

function doLevelUp() {
    if (window.player.level >= (window.currentLevelCap || 50)) {
        window.showMessage("You have reached the level cap for this campaign!");
        return;
    }
    const cls = document.getElementById("level-up-class-select").value;
    const expReq = window.player.level * 1000;
    if (window.player.exp < expReq) return;
    window.player.exp -= expReq;
    
    applyLevelUp(window.player, cls);

    window.showMessage(`Level UP! You are now level ${window.player.level} ${cls}.`);
    showCharacter();
    showCharacterScreen();
}

function calculateTotalExp(level, exp) {
    let total = exp;
    for (let i = 1; i < level; i++) {
        total += i * 1000;
    }
    return total;
}

window.calculateTotalExp = calculateTotalExp;
window.applyLevelUp = applyLevelUp;

function updateActiveSpellsUI() {
    const listDiv = document.getElementById("active-spells-list");
    if (!listDiv) return;
    listDiv.innerHTML = '';
    
    if (!window.activeSpells || window.activeSpells.length === 0) {
        listDiv.innerHTML = '<p style="color: #666; margin: 0;">No active spells.</p>';
        return;
    }

    window.activeSpells.forEach(s => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.marginBottom = "3px";
        item.style.borderBottom = "1px solid #333";
        item.style.paddingBottom = "2px";
        
        let targetText = "";
        if (s.targetEntityId) {
            const targetEnt = window.entities.find(e => e.id === s.targetEntityId);
            if (targetEnt) targetText = ` on ${targetEnt.name.split(' ')[0]}`;
            else targetText = " (Target Gone)";
        }

        item.innerHTML = `
            <span><strong>${s.name}</strong> (${s.casterName}${targetText})</span>
            <button onclick="window.cancelSpell(${s.spellInstanceId})" style="font-size: 0.7em; padding: 1px 4px; background: #d32f2f; color: white; border: none; cursor: pointer;">Cancel</button>
        `;
        listDiv.appendChild(item);
    });
}

function updateTurnIndicator() {
    updateActiveSpellsUI();
    const indicatorBar = document.getElementById('turn-indicator-bar');
    if (!indicatorBar) return;
    indicatorBar.innerHTML = '';
    // Outside combat, timePoints drift continuously per-entity (they double as
    // a pacing multiplier for regen/poison/etc, not just initiative), so
    // sorting by it here made the bar visually reshuffle every refresh with
    // no real turn order to justify it. Only sort by initiative once there's
    // an actual turn order to show; otherwise keep filter-preserved (stable)
    // order.
    const sortedEntities = [...window.entities]
        .filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
    if (window.isInCombat) {
        sortedEntities.sort((a, b) => b.timePoints - a.timePoints);
    }

    sortedEntities.forEach(entity => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('turn-indicator-item');
        itemDiv.style.cursor = 'pointer';
        itemDiv.title = 'Click for details';
        itemDiv.onclick = () => window.showEntityDetails(entity);

        if (entity === window.currentTurnEntity) itemDiv.classList.add('current-turn');
        const portraitDiv = document.createElement('div');
        portraitDiv.classList.add('turn-indicator-portrait');
        if (entity.isFlying) portraitDiv.style.transform = "translateY(-5px)";

        const applyHorseScaling = (img) => {
            img.style.width = "300%"; img.style.height = "300%";
            img.style.left = "-100%"; img.style.top = "-50%";
            img.style.zIndex = "5";
        };
        // Named bosses built on race:'human'/'elf'/'dwarf' (see the boss-spawn
        // code in gameEngine.js) go through the same layered portrait as
        // real party members, not just side:'player' entities.
        if ((entity.side === 'player' || entity.race) && entity.name !== 'Wolf' && entity.name !== 'Horse') {
                            if (entity.race === 'human') {
                                const sizePct = entity.gender === 'male' ? 90 : 80;
                                const offsetPct = (100 - sizePct) / 2;
                                const applyHumanScaling = (img) => { 
                                    img.style.width = `${sizePct}%`; 
                                    img.style.height = `${sizePct}%`; 
                                    img.style.left = `${offsetPct}%`; 
                                    img.style.top = `${offsetPct}%`; 
                                };
                                const baseImg = document.createElement('img');
                                baseImg.src = entity.gender === 'male' ? 'images/humanmale.png' : 'images/humanfemale.png'; 
                                baseImg.classList.add('portrait-layer');
                                applyHumanScaling(baseImg); portraitDiv.appendChild(baseImg);
                                
                                if (entity.gender !== 'male') {
                                    const hairImg = document.createElement('img');
                                    hairImg.src = 'images/humanfemalehair.png'; hairImg.classList.add('portrait-layer');
                                    applyHumanScaling(hairImg); hairImg.style.marginTop = "-3px"; portraitDiv.appendChild(hairImg);
                                } else {
                                    const hairImg = document.createElement('img');
                                    hairImg.src = 'images/humanmalehair.png'; hairImg.classList.add('portrait-layer');
                                    // 40% smaller than 45% = 27%. Higher by 25% height = 2.5% top
                                    hairImg.style.width = '27%';
                                    hairImg.style.height = '27%';
                                    hairImg.style.left = '36.5%';
                                    hairImg.style.top = '2.5%';
                                    portraitDiv.appendChild(hairImg);
                                }
                                
                                if (entity.equipped && entity.equipped.helmet === 'nasal_helm') {
                                    const helmImg = document.createElement('img');
                                    helmImg.src = 'images/nasalHelm.png'; helmImg.classList.add('portrait-layer');
                                    applyHumanScaling(helmImg); portraitDiv.appendChild(helmImg);
                                }
            
                                if (entity.equipped && entity.equipped.armor) {
                                    const armorImg = document.createElement('img');
                                    const aid = entity.equipped.armor;
                                    if (aid === 'light_armor') armorImg.src = 'images/humanlightarmour.png';
                                    else if (aid === 'medium_armor') armorImg.src = 'images/humanmediumarmour.png';
                                    else if (aid === 'heavy_armor') armorImg.src = 'images/humanheavyarmour.png';
                                    armorImg.classList.add('portrait-layer'); applyHumanScaling(armorImg);
                                    portraitDiv.appendChild(armorImg);
                                }
                            } else {
                                const baseImg = document.createElement('img');
                                let scalingFactor = 1.0;
                                if (entity.race === 'elf') {
                                    baseImg.src = entity.gender === 'male' ? 'images/elfmale.png' : 'images/elffemale.png';
                                } else if (entity.race === 'dwarf') {
                                    baseImg.src = entity.gender === 'male' ? 'images/dwarfmale.png' : 'images/dwarffemale.png';
                                    scalingFactor = 0.8;
                                } else {
                                    baseImg.src = 'images/elf.png';
                                }
                                baseImg.classList.add('portrait-layer');
                                if (scalingFactor !== 1.0) {
                                    baseImg.style.width = `${100 * scalingFactor}%`;
                                    baseImg.style.height = `${100 * scalingFactor}%`;
                                    baseImg.style.left = `${(100 - 100 * scalingFactor) / 2}%`;
                                    baseImg.style.top = `${(100 - 100 * scalingFactor) / 2}%`;
                                }
                                portraitDiv.appendChild(baseImg);
            
                                // HAIR OVERLAYS
                                if (entity.race === 'elf') {
                                    const hairImg = document.createElement('img');
                                    if (entity.gender === 'female') hairImg.src = 'images/elffemalehair.png';
                                    else if (entity.gender === 'male') hairImg.src = 'images/elfmalehair.png';
                                    
                                    if (hairImg.src) {
                                        hairImg.classList.add('portrait-layer');
                                        if (scalingFactor !== 1.0) {
                                            hairImg.style.width = `${100 * scalingFactor}%`;
                                            hairImg.style.height = `${100 * scalingFactor}%`;
                                            hairImg.style.left = `${(100 - 100 * scalingFactor) / 2}%`;
                                            hairImg.style.top = `${(100 - 100 * scalingFactor) / 2}%`;
                                        }
                                        portraitDiv.appendChild(hairImg);
                                    }
                                } else if (entity.race === 'dwarf') {
                                    const hairImg = document.createElement('img');
                                    if (entity.gender === 'male') {
                                        hairImg.src = 'images/dwarfmalehair.png';
                                        hairImg.classList.add('portrait-layer');
                                        hairImg.style.width = `${100 * scalingFactor}%`;
                                        hairImg.style.height = `${100 * scalingFactor}%`;
                                        hairImg.style.left = `${(100 - 100 * scalingFactor) / 2}%`;
                                        hairImg.style.top = `${(100 - 100 * scalingFactor) / 2}%`;
                                    } else if (entity.gender === 'female') {
                                        hairImg.src = 'images/dwarffemalehair.png';
                                        hairImg.classList.add('portrait-layer');
                                        // 31.25% scale (25% bigger than previous 25% scale)
                                        // Dwarf scalingFactor is 0.8. 0.8 * 0.3125 = 0.25 (25%).
                                        hairImg.style.width = '25%';
                                        hairImg.style.height = '25%';
                                        hairImg.style.left = '37.5%'; // Centered
                                        hairImg.style.top = '40%';  // Dropped down by 25% height
                                    }
                                    
                                    if (hairImg.src) {
                                        portraitDiv.appendChild(hairImg);
                                    }
                                }
            
                                if (entity.equipped && entity.equipped.armor) {                    const armorImg = document.createElement('img');
                    const aid = entity.equipped.armor;
                    if (aid === 'light_armor') armorImg.src = 'images/humanlightarmour.png';
                    else if (aid === 'medium_armor') armorImg.src = 'images/humanmediumarmour.png';
                    else if (aid === 'heavy_armor') armorImg.src = 'images/humanheavyarmour.png';
                    armorImg.classList.add('portrait-layer'); 
                    if (scalingFactor !== 1.0) {
                        armorImg.style.width = `${100 * scalingFactor}%`;
                        armorImg.style.height = `${100 * scalingFactor}%`;
                        armorImg.style.left = `${(100 - 100 * scalingFactor) / 2}%`;
                        armorImg.style.top = `${(100 - 100 * scalingFactor) / 2}%`;
                    }
                    portraitDiv.appendChild(armorImg);
                }
            }
            // SHIELD LAYER (Universal)
            if (entity.equipped && entity.equipped.offhand && window.items[entity.equipped.offhand].type === 'shield') {
                const shieldImg = document.createElement('img');
                shieldImg.src = 'images/shield.png';
                shieldImg.classList.add('portrait-layer');
                if (entity.race === 'human') {
                    const bodySizePct = entity.gender === 'male' ? 90 : 80;
                    const bodyOffsetPct = (100 - bodySizePct) / 2;
                    // The shield is a hand-held item, not another full-body
                    // layer — sizing it like the body/armor layers made it
                    // balloon to cover almost the whole portrait. Scale it
                    // down the same way drawPlayerCharacter's shieldSizeMult
                    // does relative to the body, and nudge it toward the
                    // off-hand instead of dead-center.
                    const shieldPct = bodySizePct * 0.42;
                    shieldImg.style.width = `${shieldPct}%`;
                    shieldImg.style.height = `${shieldPct}%`;
                    shieldImg.style.left = `${bodyOffsetPct + bodySizePct * 0.08}%`;
                    shieldImg.style.top = `${bodyOffsetPct + bodySizePct * 0.20}%`;
                }
                portraitDiv.appendChild(shieldImg);
            }
        } else {
            const img = document.createElement('img');
            // Renamed bosses (Grishnak, Krog, etc.) carry spriteBase (their
            // underlying monster type) since e.name no longer matches a
            // generic monster name once the boss-spawn code renames them.
            const key = entity.name === 'Orc' || entity.name === 'Wolf' || entity.name === 'Horse' ||
                entity.name === 'Skeleton' || entity.name === 'Zombie' || entity.name === 'Imp' ||
                entity.name === 'Boar' || entity.name === 'Tiger' || entity.name === 'Eagle' || entity.name === 'Troll'
                ? entity.name
                : ({ orc: 'Orc', wolf: 'Wolf', troll: 'Troll', skeleton: 'Skeleton', zombie: 'Zombie', imp: 'Imp', boar: 'Boar', tiger: 'Tiger' }[entity.spriteBase] || entity.name);
            if (key === 'Orc') img.src = 'images/orc.png';
            else if (key === 'Wolf') img.src = 'images/wolf.png';
            else if (key === 'Horse') { img.src = 'images/horse.png'; applyHorseScaling(img); }
            else if (key === 'Skeleton') img.src = 'images/skeleton.svg';
            else if (key === 'Zombie') img.src = 'images/zombie.svg';
            else if (key === 'Imp') img.src = 'images/imp.svg';
            else if (key === 'Boar') img.src = 'images/boar.png';
            else if (key === 'Tiger') img.src = 'images/tiger.png';
            else if (key === 'Troll') img.src = 'images/troll.png';
            else if (key === 'Eagle') {
                img.src = entity.isFlying ? 'images/eagleflying.png' : 'images/eagle.png';
            }
            else img.src = 'images/goblin.png';
            img.classList.add('portrait-layer'); portraitDiv.appendChild(img);
        }
        if (entity.riding && entity.riding.name === 'Horse') {
            const horseImg = document.createElement('img');
            horseImg.src = 'images/horse.png'; horseImg.classList.add('portrait-layer');
            applyHorseScaling(horseImg); portraitDiv.appendChild(horseImg);
        }
        const infoDiv = document.createElement('div');
        infoDiv.classList.add('turn-indicator-info');
        const dcTag = entity.disconnected ? ' <span style="color:#f44336;font-size:0.8em">(offline)</span>' : '';
        let infoHtml = `<p><strong>${entity.name.split(' ')[0]}</strong>${dcTag}</p><p>HP: ${Math.ceil(entity.hp)}/${entity.maxHp} ${window.isInCombat ? `| TP: ${Math.floor(entity.timePoints)}` : ''}</p>`;
        if (entity.maxMana > 0 || entity.currentMana > 0) infoHtml += `<p>MP: ${Math.floor(entity.currentMana)}/${entity.maxMana || 0}</p>`;
        if (entity.riding) {
            const m = entity.riding;
            infoHtml += `<p style="border-top: 1px solid #555; margin-top: 2px; padding-top: 2px; font-size: 0.9em; color: #aaa;">${m.name}: ${Math.ceil(m.hp)}/${m.maxHp} HP ${window.isInCombat ? `| ${Math.floor(m.timePoints)} TP` : ''}</p>`;
        }
        infoDiv.innerHTML = infoHtml;
        itemDiv.appendChild(portraitDiv);
        itemDiv.appendChild(infoDiv);
        indicatorBar.appendChild(itemDiv);
    });
}

function showEntityDetails(entity) {
    const modal = document.getElementById("entity-details-modal");
    const nameSpan = document.getElementById("entity-details-name");
    const contentDiv = document.getElementById("entity-details-content");
    if (!modal || !contentDiv) return;

    nameSpan.innerText = entity.name;
    
    let html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <p><strong>Race:</strong> ${entity.race || 'Unknown'}</p>
                <p><strong>Class:</strong> ${entity.class || 'N/A'}</p>
                <p><strong>HP:</strong> ${Math.ceil(entity.hp)} / ${entity.maxHp}</p>
                ${entity.maxMana > 0 ? `<p><strong>Mana:</strong> ${Math.floor(entity.currentMana)} / ${entity.maxMana}</p>` : ''}
                ${window.isInCombat ? `<p><strong>TP:</strong> ${Math.floor(entity.timePoints)}</p>` : ''}
                <p><strong>Initiative:</strong> ${entity.initiative}</p>
            </div>
            <div>
                <p><strong>Equipped:</strong></p>
                <ul style="padding-left: 20px; font-size: 0.9em;">
    `;

    if (entity.equipped) {
        const slots = ['weapon', 'offhand', 'armor', 'helmet', 'accessory'];
        slots.forEach(slot => {
            const itemId = entity.equipped[slot];
            if (itemId) {
                const item = window.items[itemId];
                html += `<li>${slot.charAt(0).toUpperCase() + slot.slice(1)}: ${item ? item.name : itemId}</li>`;
            }
        });
    } else {
        html += `<li>None</li>`;
    }

    html += `
                </ul>
            </div>
        </div>
        <hr style="border: 0; border-top: 1px solid #444; margin: 15px 0;">
        <p><strong>Active Spells / Conditions:</strong></p>
        <ul style="padding-left: 20px; font-size: 0.9em;">
    `;

    const effects = (window.activeSpells || []).filter(s => s.targetEntityId === entity.id || s.entityId === entity.id);
    if (effects.length > 0) {
        effects.forEach(s => {
            html += `<li>${s.name} (from ${s.casterName})</li>`;
        });
    } else {
        html += `<li>Normal</li>`;
    }

    if (entity.isStealthed) html += `<li>Stealthed (Score: ${Math.floor(entity.stealthScore)})</li>`;
    if (entity.isFlying) html += `<li>Flying</li>`;
    if (entity.poisonTicks > 0) html += `<li>Poisoned (${entity.poisonTicks} ticks)</li>`;
    if (entity.webbedDuration > 0) html += `<li>Webbed (${Math.ceil(entity.webbedDuration)} TP)</li>`;
    if (entity.reactionBlocked) html += `<li>Reactions Blocked</li>`;

    html += `</ul>`;

    contentDiv.innerHTML = html;
    modal.style.display = "block";
}

window.showEntityDetails = showEntityDetails;

function showDisconnectedPlayerPanel(ent) {
    const existing = document.getElementById('disconnected-panel');
    if (existing) existing.remove();

    // Re-check: may have been resolved already
    if (!ent.disconnected) return;

    const panel = document.createElement('div');
    panel.id = 'disconnected-panel';
    panel.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        'background:#2a2a2a', 'border:2px solid #f44336', 'border-radius:8px',
        'padding:20px', 'z-index:9999', 'min-width:300px', 'text-align:center',
        'color:#fff', 'font-family:sans-serif', 'box-shadow:0 4px 20px rgba(0,0,0,0.8)'
    ].join(';');

    panel.innerHTML = `
        <h3 style="color:#f44336;margin:0 0 8px">${ent.name} — Disconnected</h3>
        <p style="color:#aaa;margin:0 0 16px;font-size:0.9em">They've been offline for 10 seconds. What should happen?</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button id="dc-take" style="padding:8px 16px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.95em">Take Control</button>
            <button id="dc-pause" style="padding:8px 16px;background:#607D8B;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.95em">Leave Paused</button>
            <button id="dc-kick" style="padding:8px 16px;background:#f44336;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.95em">Kick from Game</button>
        </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('dc-take').onclick = () => {
        delete ent.disconnected;
        delete ent.disconnectedAt;
        window.showMessage(`${ent.name} is now under host control.`);
        // If it's currently their turn, restore the action UI so the host can act
        if (window.currentTurnEntity === ent) {
            window.selectCharacterByName(ent.name);
            if (window.updateActionButtons) window.updateActionButtons();
        }
        if (window.broadcastFullState) window.broadcastFullState();
        panel.remove();
    };

    document.getElementById('dc-pause').onclick = () => {
        window.showMessage(`${ent.name} remains paused in the game.`);
        panel.remove();
    };

    document.getElementById('dc-kick').onclick = () => {
        ent.alive = false;
        delete ent.disconnected;
        window.showMessage(`${ent.name} has been kicked from the game.`);
        if (window.currentTurnEntity === ent) {
            window.currentTurnEntity = null;
            window.gamePhase = 'WAITING';
            if (window.updateTurnIndicator) window.updateTurnIndicator();
        }
        if (window.broadcastFullState) window.broadcastFullState();
        panel.remove();
    };
}

window.showDisconnectedPlayerPanel = showDisconnectedPlayerPanel;

function requestReaction(entity, options, callback, customMsg = null) {
    // Disconnected player: auto-pass all reactions
    if (entity.disconnected) { callback(null); return; }
    // ROOT CAUSE FIX: never open a reaction modal for someone who can't
    // actually decide anything — already dead, or downed/unconscious. Without
    // this, an entity that dropped to 0 HP (or was killed by something else
    // processed earlier in the same real-time batch) earlier in the very
    // same tick could still be offered a reaction moments later, and a dead
    // or unconscious character was never going to click a button — that's
    // the "stuck waiting on a corpse" failure mode, not just a timing race.
    if (!entity.alive || entity.unconscious) { callback(null); return; }
    const isSentientAlly = entity.side === 'player' && !['Wolf', 'Horse', 'Boar', 'Tiger', 'Eagle'].includes(entity.name);
    if (!isSentientAlly) {
        if (options.length > 0 && Math.random() < 0.7) callback(options[0].id);
        else callback(null);
        return;
    }
    window.isPausedForReaction = true;
    const modal = document.getElementById("reaction-modal");
    const desc = document.getElementById("reaction-description");
    const optDiv = document.getElementById("reaction-options");
    desc.innerText = customMsg || "An event has occurred! Choose a reaction:";
    optDiv.innerHTML = '';

    let resolved = false;
    const resolve = (choiceId) => {
        if (resolved) return;
        resolved = true;
        clearInterval(livenessWatcher);
        modal.style.display = "none";
        window.isPausedForReaction = false;
        callback(choiceId);
    };

    // Belt-and-braces: if the reactor dies or goes unconscious by some other
    // means while this modal is genuinely open (rather than merely never
    // clicked), stop waiting on them immediately instead of leaning on the
    // much slower generic stuck-flag watchdog in gameEngine.js's tick().
    const livenessWatcher = setInterval(() => {
        if (!entity.alive || entity.unconscious) resolve(null);
    }, 300);

    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.innerText = `${opt.name} (${opt.tpCost} TP)`;
        btn.style.marginRight = "10px";
        btn.onclick = () => resolve(opt.id);
        optDiv.appendChild(btn);
    });
    const noneBtn = document.createElement("button");
    noneBtn.innerText = "None";
    noneBtn.style.backgroundColor = "#777";
    noneBtn.onclick = () => resolve(null);
    optDiv.appendChild(noneBtn);
    modal.style.display = "block";
}

function showDialogue(npc, message, options = []) {
    window.isPausedForReaction = true;
    const modal = document.getElementById("dialogue-modal");
    const speaker = document.getElementById("dialogue-speaker");
    const portrait = document.getElementById("dialogue-portrait");
    const msg = document.getElementById("dialogue-message");
    const optDiv = document.getElementById("dialogue-options");

    speaker.innerText = npc.name;
    msg.innerText = message;
    optDiv.innerHTML = '';

    // Create a mini portrait. NPCs with real equipment use the same layered
    // body-part renderer as their map sprite, so gear shown in conversation
    // matches their stat block. Unique customImage NPCs (e.g. arena cast)
    // keep their flat art.
    portrait.innerHTML = '';
    if (!npc.customImage && npc.equipped && window.drawPlayerCharacter && window.CHAR_CONFIG?.[`${npc.race}_${npc.gender}`]) {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        canvas.classList.add('portrait-layer');
        portrait.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const hs = window.hexSize || 40;
        const cfg = window.CHAR_CONFIG[`${npc.race}_${npc.gender}`];
        const z = (100 * 0.65) / (cfg.bodyH * hs);
        window.drawPlayerCharacter(ctx, npc, 50, 65, z, 0);
    } else {
        const baseImg = document.createElement('img');
        if (npc.customImage && window.gameVisuals[npc.customImage]?.complete) {
            baseImg.src = window.gameVisuals[npc.customImage].src;
        } else if (npc.race === 'human') {
            baseImg.src = npc.gender === 'male' ? 'images/humanmale.png' : 'images/humanfemale.png';
        } else if (npc.race === 'elf') {
            baseImg.src = npc.gender === 'male' ? 'images/elfmale.png' : 'images/elffemale.png';
        } else if (npc.race === 'dwarf') {
            baseImg.src = npc.gender === 'male' ? 'images/dwarfmale.png' : 'images/dwarffemale.png';
        } else {
            baseImg.src = 'images/elf.png';
        }
        baseImg.classList.add('portrait-layer');
        portrait.appendChild(baseImg);
    }

    if (options.length === 0) {
        options.push({ label: "Goodbye", action: () => {} });
    }

    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.innerText = opt.label;
        btn.style.marginRight = "10px";
        btn.onclick = () => {
            modal.style.display = "none";
            window.isPausedForReaction = false;
            window.lastModalClosedTime = Date.now(); // Ghost click prevention
            opt.action();
        };
        optDiv.appendChild(btn);
    });

    modal.style.display = "block";
}

// options (all optional):
//   itemIds: array of item ids to restrict the buy list to (default: every
//            item in window.items that has a buyPrice — the roguelike's
//            unlimited general-goods behavior)
//   stock:   a mutable { itemId: remainingCount } object shared across calls
//            (e.g. window.hollowmereStoreStock) — decremented on purchase,
//            hidden once it hits 0. Omit for unlimited stock.
//   mounts:  whether to offer the Horse/Boar mounts (default true)
function openShop(options) {
    options = options || {};
    const restrictedIds = options.itemIds || null;
    const stock = options.stock || null;
    const showMounts = options.mounts !== false;

    const modal = document.getElementById("shop-modal");
    const buyList = document.getElementById("shop-buy-list");
    const sellList = document.getElementById("shop-sell-list");
    const goldDisplay = document.getElementById("shop-player-gold");

    const player = window.party ? window.party[0] : null;
    if (!player) {
        showMessage("You need a character to trade!");
        return;
    }
    goldDisplay.innerText = player.gold;

    buyList.innerHTML = '';
    for (const id in window.items) {
        if (restrictedIds && !restrictedIds.includes(id)) continue;
        const item = window.items[id];
        if (item.buyPrice === undefined) continue;
        if (stock && (stock[id] === undefined || stock[id] <= 0)) continue;

        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.marginBottom = "5px";
        const stockLabel = stock ? ` [${stock[id]} left]` : '';
        div.innerHTML = `<span>${item.name} (${item.buyPrice}g)${stockLabel}</span>`;
        const btn = document.createElement("button");
        btn.innerText = "Buy";
        btn.style.fontSize = "0.8em";
        btn.disabled = player.gold < item.buyPrice;
        btn.onclick = () => {
            player.gold -= item.buyPrice;
            player.inventory.push(id);
            if (stock) stock[id]--;
            openShop(options); // Refresh
            if (window.showTutorialTip) window.showTutorialTip('acquired_item', "New gear sits in your Inventory until you equip it — open the Inventory screen and click Equip on it to actually use it.");
        };
        div.appendChild(btn);
        buyList.appendChild(div);
    }

    if (showMounts) {
    // Add Horse to shop
    const horseDiv = document.createElement("div");
    horseDiv.style.display = "flex";
    horseDiv.style.justifyContent = "space-between";
    horseDiv.style.marginBottom = "5px";
    horseDiv.innerHTML = `<span>Horse (100g)</span>`;
    const buyHorseBtn = document.createElement("button");
    buyHorseBtn.innerText = "Buy";
    buyHorseBtn.style.fontSize = "0.8em";
    buyHorseBtn.disabled = player.gold < 100;
    buyHorseBtn.onclick = () => {
        player.gold -= 100;
        // Spawn Horse logic
        const pEnt = window.entities.find(e => e.name === player.name);
        const neighbors = window.getNeighbors(pEnt.hex.q, pEnt.hex.r);
        const h = neighbors.find(n => !window.entities.some(e => e.alive && e.getAllHexes().some(oh => oh.q === n.q && oh.r === n.r)) && window.getTerrainAt(n.q, n.r).name !== 'Water');
        if (h) {
            const horse = window.createMonster('horse', h, null, null, 'player');
            window.entities.push(horse);
            window.drawMap();
            window.renderEntities();
            window.showMessage("Horse purchased and joined the party!");
        } else {
            window.showMessage("No space for a horse!");
        }
        openShop(options); // Refresh
    };
    horseDiv.appendChild(buyHorseBtn);
    buyList.appendChild(horseDiv);

    // Skeleton Horse — a straightforward gold-bought mount here (the arena
    // shop, unlike Campaign 2, has no lich-path/raise-the-dead concept to
    // gate this behind), reusing the same HORSE_COAT_PRESETS.skeleton
    // recolor Campaign 2's Bone Trader/raiseSkeletonHorse mechanic uses.
    const skeletonHorseDiv = document.createElement("div");
    skeletonHorseDiv.style.display = "flex";
    skeletonHorseDiv.style.justifyContent = "space-between";
    skeletonHorseDiv.style.marginBottom = "5px";
    skeletonHorseDiv.innerHTML = `<span>Skeleton Horse (100g)</span>`;
    const buySkeletonHorseBtn = document.createElement("button");
    buySkeletonHorseBtn.innerText = "Buy";
    buySkeletonHorseBtn.style.fontSize = "0.8em";
    buySkeletonHorseBtn.disabled = player.gold < 100;
    buySkeletonHorseBtn.onclick = () => {
        player.gold -= 100;
        const pEnt = window.entities.find(e => e.name === player.name);
        const neighbors = window.getNeighbors(pEnt.hex.q, pEnt.hex.r);
        const h = neighbors.find(n => !window.entities.some(e => e.alive && e.getAllHexes().some(oh => oh.q === n.q && oh.r === n.r)) && window.getTerrainAt(n.q, n.r).name !== 'Water');
        if (h) {
            const horse = window.createMonster('horse', h, null, null, 'player');
            horse.coatPreset = 'skeleton';
            horse.undead = true;
            window.entities.push(horse);
            window.drawMap();
            window.renderEntities();
            window.showMessage("Skeleton Horse purchased and joined the party!");
        } else {
            window.showMessage("No space for a horse!");
        }
        openShop(options); // Refresh
    };
    skeletonHorseDiv.appendChild(buySkeletonHorseBtn);
    buyList.appendChild(skeletonHorseDiv);

    // Add Boar to shop
    const boarDiv = document.createElement("div");
    boarDiv.style.display = "flex";
    boarDiv.style.justifyContent = "space-between";
    boarDiv.style.marginBottom = "5px";
    boarDiv.innerHTML = `<span>Boar (150g)</span>`;
    const buyBoarBtn = document.createElement("button");
    buyBoarBtn.innerText = "Buy";
    buyBoarBtn.style.fontSize = "0.8em";
    buyBoarBtn.disabled = player.gold < 150;
    buyBoarBtn.onclick = () => {
        player.gold -= 150;
        const pEnt = window.entities.find(e => e.name === player.name);
        const neighbors = window.getNeighbors(pEnt.hex.q, pEnt.hex.r);
        const h = neighbors.find(n => !window.entities.some(e => e.alive && e.getAllHexes().some(oh => oh.q === n.q && oh.r === n.r)) && window.getTerrainAt(n.q, n.r).name !== 'Water');
        if (h) {
            const boar = window.createMonster('boar', h, null, null, 'player');
            window.entities.push(boar);
            window.drawMap();
            window.renderEntities();
            window.showMessage("Boar purchased and joined the party!");
        } else {
            window.showMessage("No space for a boar!");
        }
        openShop(options);
    };
    boarDiv.appendChild(buyBoarBtn);
    buyList.appendChild(boarDiv);
    }

    sellList.innerHTML = '';
    const inventory = player.inventory || [];
    const counts = {};
    inventory.forEach(id => counts[id] = (counts[id] || 0) + 1);

    for (const id in counts) {
        const item = window.items[id];
        if (!item) continue;
        // Gathered raw materials (food/resource items) aren't buyable, so they
        // carry an explicit sellPrice instead of half a buyPrice.
        const sellPrice = item.sellPrice || Math.floor((item.buyPrice || 0) * 0.5);
        if (sellPrice <= 0) continue;

        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.marginBottom = "5px";
        div.innerHTML = `<span>${item.name} x${counts[id]} (${sellPrice}g)</span>`;
        const btn = document.createElement("button");
        btn.innerText = "Sell";
        btn.style.fontSize = "0.8em";
        btn.onclick = () => {
            player.gold += sellPrice;
            const idx = player.inventory.indexOf(id);
            if (idx > -1) player.inventory.splice(idx, 1);
            openShop(options); // Refresh
        };
        div.appendChild(btn);
        sellList.appendChild(div);
    }

    modal.style.display = "block";
}

function startMercenaryHire() {
    const modal = document.getElementById("mercenary-creation-modal");
    modal.style.display = "block";
}

function getRunMaxFriendlySkills() {
    const maxSkills = {};
    const friendlies = window.entities.filter(e => e.side === 'player');
    friendlies.forEach(f => {
        const treeTotals = {};
        // 1. Sum all ranks per tree
        for (const skillKey in window.skills) {
            const tree = window.skills[skillKey].tree;
            const ranks = f.skills[skillKey] || 0;
            treeTotals[tree] = (treeTotals[tree] || 0) + ranks;
        }
        // 2. Add unspent points
        if (f.attributes) {
            for (const tree in f.attributes) {
                // 'wildcard' is its own type for permanent bonuses
                treeTotals[tree] = (treeTotals[tree] || 0) + (f.attributes[tree] || 0);
            }
        }
        
        // 3. Update global max
        for (const tree in treeTotals) {
            maxSkills[tree] = Math.max(maxSkills[tree] || 0, treeTotals[tree]);
        }
    });
    return maxSkills;
}

function endArenaRun() {
    if (!window.relicsEnabled) {
        alert("Main Character has died. Run ended.");
        location.reload();
        return;
    }

    // 1. Snapshot Mercenaries
    const mercenaries = window.entities.filter(e => e.side === 'player' && e.name !== window.party[0].name && e.alive);
    mercenaries.forEach(m => {
        const snapshot = {
            name: m.name, race: m.race, gender: m.gender, class: m.class, level: m.level, exp: m.exp,
            attributes: { ...m.attributes }, skills: { ...m.skills }, equipped: { ...m.equipped },
            inventory: [...m.inventory]
        };
        // Spend unspent points
        // (Simplified logic: spend on random existing tree skills)
        window.roguelikeData.mercenaryGraveyard.push(snapshot);
    });

    // 2. Generate Rewards
    const maxFriendly = getRunMaxFriendlySkills();
    const maxEnemy = window.runMaxEnemySkills || {};
    const currentBonuses = window.roguelikeData.permanentSkillBonuses || {};
    
    // Rule: can only earn more if (current bonus) < (base points). 
    // Base points = total - current bonus. 
    // So: bonus < (total - bonus)  =>  2 * bonus < total
    const validFriendlyTrees = Object.keys(maxFriendly).filter(t => {
        const total = maxFriendly[t] || 0;
        const bonus = currentBonuses[t] || 0;
        return (2 * bonus) < total;
    });
    const validEnemyTrees = Object.keys(maxEnemy).filter(t => {
        const total = maxEnemy[t] || 0;
        const bonus = currentBonuses[t] || 0;
        return (2 * bonus) < total;
    });

    const choices = [];
    if (validFriendlyTrees.length > 0) {
        const tree = validFriendlyTrees[Math.floor(Math.random() * validFriendlyTrees.length)];
        choices.push({ type: 'skill', tree: tree, label: `Permanent ${tree} point (From Allies)` });
    }
    if (validEnemyTrees.length > 0) {
        const tree = validEnemyTrees[Math.floor(Math.random() * validEnemyTrees.length)];
        choices.push({ type: 'skill', tree: tree, label: `Permanent ${tree} point (From Enemies)` });
    }
    
    // Relic (Simplified: random magic item if beat > 2 fights)
    if (window.roguelikeData.fightsCompleted > 2) {
        const magicItems = Object.keys(window.items).filter(id => id.includes('sword_arrow') || id.includes('glowing'));
        const item = magicItems[Math.floor(Math.random() * magicItems.length)];
        choices.push({ type: 'relic', id: item, label: `Relic: ${window.items[item].name}` });
    }

    // 3. Show Modal
    const modal = document.getElementById("end-run-modal");
    const msg = document.getElementById("end-run-message");
    const choiceDiv = document.getElementById("reward-choices");
    
    msg.innerText = `Your journey ends here. You completed ${window.roguelikeData.fightsCompleted} matches. Choose a legacy for your next character:`;
    choiceDiv.innerHTML = '';
    
    if (choices.length === 0) {
        const btn = document.createElement("button");
        btn.innerText = "Accept Fate (No Rewards Available)";
        btn.onclick = () => location.reload();
        choiceDiv.appendChild(btn);
    } else {
        choices.forEach(c => {
            const btn = document.createElement("button");
            btn.innerText = c.label;
            btn.onclick = () => selectRoguelikeReward(c);
            choiceDiv.appendChild(btn);
        });
    }

    modal.style.display = "block";
}

function selectRoguelikeReward(choice) {
    if (choice.type === 'skill') {
        window.roguelikeData.permanentSkillBonuses[choice.tree] = (window.roguelikeData.permanentSkillBonuses[choice.tree] || 0) + 1;
    } else if (choice.type === 'relic') {
        window.roguelikeData.relics.push(choice.id);
    }
    
    localStorage.setItem('rpg_roguelike_data', JSON.stringify(window.roguelikeData));
    alert("Legacy recorded. Good luck in your next life.");
    location.reload();
}

window.endArenaRun = endArenaRun;
window.selectRoguelikeReward = selectRoguelikeReward;

window.syncMute = function(isMuted) {
    window.setAudioEnabled(!isMuted);
    const titleCheck = document.getElementById('mute-check-title');
    const menuCheck = document.getElementById('mute-check-menu');
    if (titleCheck) titleCheck.checked = isMuted;
    if (menuCheck) menuCheck.checked = isMuted;
    
    // Refresh music state when toggling mute
    if (!isMuted) updateMusicState();
};

window.updateAudioSetting = function(type, value) {
    if (window.audioSettings) {
        window.audioSettings[type] = parseFloat(value);
        if (window.updateVolumes) window.updateVolumes();
    }
};

// ALLEGIANCE OUTLINE MODE: 'combat' (default) | 'always' | 'never'.
// A player-level preference (not game-save state), so it lives in
// localStorage and survives across save files the same way audio would
// if that were persisted.
window.allegianceOutlineMode = localStorage.getItem('rpg_allegiance_outline_mode') || 'combat';
window.setAllegianceOutlineMode = function(mode) {
    window.allegianceOutlineMode = mode;
    localStorage.setItem('rpg_allegiance_outline_mode', mode);
};

// TUTORIAL MODE: explains a mechanic the first time it happens, then
// remembers it via a set of seen-ids in localStorage so it never repeats.
// window.showTutorialTip(id, text) is the hook other systems call.
window.tutorialModeEnabled = localStorage.getItem('rpg_tutorial_enabled') !== 'false';
try {
    window.tutorialSeen = JSON.parse(localStorage.getItem('rpg_tutorial_seen') || '{}');
} catch (e) {
    window.tutorialSeen = {};
}
window.setTutorialModeEnabled = function(enabled) {
    window.tutorialModeEnabled = enabled;
    localStorage.setItem('rpg_tutorial_enabled', enabled ? 'true' : 'false');
};
window.resetTutorialMemory = function() {
    window.tutorialSeen = {};
    localStorage.removeItem('rpg_tutorial_seen');
    window.showMessage('Tutorial memory reset — tips will explain things again.');
};
window.showTutorialTip = function(id, text) {
    if (!window.tutorialModeEnabled || window.tutorialSeen[id]) return;
    window.tutorialSeen[id] = true;
    localStorage.setItem('rpg_tutorial_seen', JSON.stringify(window.tutorialSeen));
    window.showMessage(`Tip: ${text}`);
};
window.initSettingsUI = function() {
    const modeSelect = document.getElementById('allegiance-outline-mode');
    if (modeSelect) modeSelect.value = window.allegianceOutlineMode;
    const tutCheck = document.getElementById('tutorial-mode-toggle');
    if (tutCheck) tutCheck.checked = window.tutorialModeEnabled;
};

function updateMusicState() {
    if (!window.audioEnabled) return;

    const characterModal = document.getElementById("character-screen-modal");
    const spellModal = document.getElementById("spell-menu-modal");
    const inventoryModal = document.getElementById("inventory-modal");
    const settingsModal = document.getElementById("settings-modal");
    
    const inMenu = (characterModal && characterModal.style.display === "block") ||
                   (spellModal && spellModal.style.display === "block") ||
                   (inventoryModal && inventoryModal.style.display === "block") ||
                   (settingsModal && settingsModal.style.display === "block") ||
                   (document.getElementById("characterCreator").style.display === "block");

    if (inMenu) {
        window.playMusic('title');
    } else {
        // We are in the game world
        if (window.currentCampaign === "1" && !window.isInArena) {
            window.playMusic('lobby');
        } else if (window.currentCampaign === "1" && window.isInArena) {
            // Battle music state is usually handled by startArenaFight/wakeUp/checkCombatEnd
            // But if we close a menu in the arena, we might need to restore it
            const inCombat = window.entities.some(e => e.alive && e.side === 'enemy' && e.aiState === 'combat');
            if (inCombat) {
                window.playMusic('battle');
            } else {
                window.playMusic('preBattle');
            }
        } else {
            window.stopAllMusic();
        }
    }
}

// Default to muted
document.addEventListener('DOMContentLoaded', () => {
    window.syncMute(true);
    // Initial music check
    setTimeout(updateMusicState, 500); 
});

window.addAllEquipment = addAllEquipment;
window.cancelAllMoveOrders = cancelAllMoveOrders;
window.toggleRest = toggleRest;
window.updateRestButton = updateRestButton;
window.toggleSleep = toggleSleep;
window.updateSleepButton = updateSleepButton;
window.showCharacter = showCharacter;
window.showCharacterScreen = showCharacterScreen;
window.learnSkill = learnSkill;
window.showMessage = showMessage;
window.updateActionButtons = updateActionButtons;
window.updateTurnIndicator = updateTurnIndicator;
window.showSpellScreen = showSpellScreen;
window.updateSpellPreview = updateSpellPreview;
window.renderSpellStats = renderSpellStats;
window.createSpell = createSpell;
window.showInventoryScreen = showInventoryScreen;
window.equipItem = equipItem;
window.unequipItem = unequipItem;
window.syncPlayerEntity = syncPlayerEntity;
window.gainExp = gainExp;
window.doLevelUp = doLevelUp;
window.showDialogue = showDialogue;
window.openShop = openShop;
window.startMercenaryHire = startMercenaryHire;
function highlightValidTargets(caster, spell) {
    const range = spell.range || 1;
    const type = spell.type;

    // Summon: Unoccupied hexes in range
    if (type === 'summon') {
        for (let q = -range; q <= range; q++) {
            for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
                const targetHex = { q: caster.hex.q + q, r: caster.hex.r + r };
                if (window.isHexInBounds(targetHex) && window.distance(caster.hex, targetHex) <= range) {
                    const occupant = window.entities.find(e => e.alive && e.getAllHexes().some(h => h.q === targetHex.q && h.r === targetHex.r));
                    const terrain = window.getTerrainAt(targetHex.q, targetHex.r);
                    if (!occupant && terrain.name !== 'Wall' && terrain.name !== 'Water') {
                        window.highlightedHexes.push({ q: targetHex.q, r: targetHex.r, type: 'attack' });
                    }
                }
            }
        }
    } else {
        // Targets: Entities in range
        window.entities.forEach(e => {
            if (e.alive && window.isVisibleToPlayer(e.hex)) {
                const dist = window.distance(caster.hex, e.hex);
                if (dist <= range) {
                    let valid = false;
                    if (type === 'damage') valid = (e.side !== caster.side && e.side !== 'neutral');
                    else if (type === 'heal' || type === 'buff') valid = (e.side === caster.side);
                    else if (type === 'dispel') valid = true;
                    
                    if (valid) {
                        window.highlightedHexes.push({ q: e.hex.q, r: e.hex.r, type: 'attack' });
                    }
                }
            }
        });
        // AOE Debuffs can also target empty hexes
        if (type === 'aoe_debuff') {
            for (let q = -range; q <= range; q++) {
                for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
                    const h = { q: caster.hex.q + q, r: caster.hex.r + r };
                    if (window.isHexInBounds(h) && window.distance(caster.hex, h) <= range) {
                        window.highlightedHexes.push({ q: h.q, r: h.r, type: 'attack' });
                    }
                }
            }
        }
    }
}

window.highlightValidTargets = highlightValidTargets;

// Add a function to handle responsive UI shifts
window.handleResponsiveUI = function() {
    updateRestButton();
    updateSleepButton();
};

window.addEventListener('resize', () => {
    if (window.handleResponsiveUI) window.handleResponsiveUI();
});
