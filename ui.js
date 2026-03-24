// ui.js

window.updatePartyTabs = updatePartyTabs;
window.selectCharacterByName = selectCharacterByName;
window.addJerry = addJerry;
window.requestReaction = requestReaction;

function updatePartyTabs() {
    const partyDiv = document.getElementById("party-selection");
    if (!partyDiv) return;
    partyDiv.innerHTML = '';

    // All living friendly entities
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player');

    friendlies.forEach((ent, index) => {
        const btn = document.createElement("button");
        btn.innerText = ent.name.split(' ')[0]; // Short name
        btn.style.fontSize = "0.8em";
        btn.style.padding = "2px 5px";
        if (window.player && ent.name === window.player.name) {
            btn.style.border = "2px solid #ffeb3b";
            btn.style.backgroundColor = "#555";
        }
        btn.onclick = () => window.selectCharacterByName(ent.name);
        partyDiv.appendChild(btn);
    });
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
        window.isResting = true;
        showMessage("Resting until restored...");
    } else {
        window.isResting = false;
        showMessage("Stopped resting.");
    }
    updateRestButton();
}

function updateRestButton() {
    const btn = document.getElementById("rest-btn");
    if (!btn) return;
    if (window.isResting) {
        btn.innerText = "Stop Waiting";
        btn.style.backgroundColor = "#f44336";
    } else {
        btn.innerText = "Rest until Restored";
        btn.style.backgroundColor = "#607d8b";
    }
}

function toggleSleep() {
    if (!window.isSleeping) {
        const enemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
        if (enemySeen) {
            showMessage("Cannot sleep while enemies are nearby!");
            return;
        }
        window.isSleeping = true;
        
        // Initialize sleep timer for all player entities if needed (only if they don't have time left)
        window.entities.forEach(e => {
            if (e.side === 'player' && e.name !== 'Wolf' && e.name !== 'Horse') {
                if (!e.sleepRemainingSeconds || e.sleepRemainingSeconds <= 0) {
                    e.sleepRemainingSeconds = 8 * 3600; // 8 hours
                }
            }
        });
        showMessage("Going to sleep...");
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
        btn.innerText = "Stop Waiting";
        btn.style.backgroundColor = "#f44336";
    } else {
        // Show remaining if any
        const sentient = window.entities.find(e => e.alive && e.side === 'player' && e.name !== 'Wolf' && e.name !== 'Horse');
        if (sentient && sentient.sleepRemainingSeconds > 0) {
            const hrs = (sentient.sleepRemainingSeconds / 3600).toFixed(1);
            btn.innerText = `Resume Sleep (${hrs}h left)`;
        } else {
            btn.innerText = "Sleep";
        }
        btn.style.backgroundColor = "#3f51b5";
    }
}

function showCharacter(){
  const info = document.getElementById("character-info");
  if (!info) return;
  if (!window.player){info.innerText="No character yet.";return;}
  
  let txt=`<strong>${window.player.name}</strong> (${window.player.race} ${window.player.class} Lv${window.player.level})<br>
HP: ${Math.ceil(window.player.hp)}/${window.player.maxHp} | MP: ${Math.floor(window.player.currentMana)}/${window.player.maxMana} | Dmg: ${window.player.baseDamage}
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
    const standardTrees = ['arcane', 'divine', 'nature', 'strength', 'endurance', 'agility', 'weapons', 'Way of the open palm', 'human', 'dwarf', 'elf', 'monk', 'rogue', 'fighter', 'cleric'];

    if (window.showAllSkillsMode) {
        Object.keys(skillTrees).forEach(t => {
            if (t !== 'paladin') treesToShow.add(t);
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
                const canUseWildcard = hasWildcardPoints && !['elf', 'dwarf', 'human', 'fighter', 'rogue', 'cleric', 'wizard', 'druid'].includes(tree);
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

    // Add a 'Done' button at the bottom
    const doneButton = document.createElement('button');
    doneButton.innerText = 'Done';
    doneButton.style.marginTop = '20px';
    doneButton.style.padding = '10px 20px';
    doneButton.style.fontSize = '1.2em';
    doneButton.style.width = '100%';
    doneButton.onclick = window.closeCharacterScreen;
    contentDiv.appendChild(doneButton);
}

function learnSkill(skillKey) {
    const skill = window.skills[skillKey];
    const player = window.player;
    if (!skill || !player) {
        console.error("learnSkill: skill or player undefined", { skillKey, skill, player });
        return;
    }

    const isExclusion = ['elf', 'dwarf', 'human', 'fighter', 'rogue', 'cleric', 'wizard', 'druid'].includes(skill.tree);

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

    if (player.attributes[skill.tree] > 0) {
        player.attributes[skill.tree]--;
    } else if (player.attributes.wildcard > 0 && !isExclusion) {
        player.attributes.wildcard--;
    } else {
        showMessage("You don't have points to learn this skill.");
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

    if (window.currentTurnEntity && window.currentTurnEntity.side === "player") {
        const player = window.currentTurnEntity;
        const charData = window.player; 
        
        const isSentientAlly = player.side === 'player' && !['Wolf', 'Horse', 'Boar', 'Tiger', 'Eagle'].includes(player.name);
        if (isSentientAlly) {
            if (!window.playerAction) {
                window.updatePlayerUI();
            } else if (window.playerAction.type === 'spell') {
                window.clearHighlights();
                highlightValidTargets(player, window.playerAction.spell);
            }
            window.drawMap();
            window.renderEntities();
        }

        if (player.offhandAttackAvailable) {
            const offhandBtn = document.createElement('button');
            offhandBtn.innerText = "Off-hand Attack";
            offhandBtn.style.backgroundColor = "#ff5722";
            offhandBtn.onclick = () => {
                window.playerAction = { type: 'offhand_attack' };
                showMessage("Off-hand Attack ready. Click a target.");
                updateActionButtons();
            };
            buttonsDiv.appendChild(offhandBtn);
        }

        const coord = `${player.hex.q},${player.hex.r}`;
        if (window.mapItems[coord] && window.mapItems[coord].length > 0) {
            const lootBtn = document.createElement('button');
            lootBtn.innerText = `Loot Hex (${window.mapItems[coord].length} items)`;
            lootBtn.style.backgroundColor = '#FFD700';
            lootBtn.style.color = '#000';
            lootBtn.onclick = () => { window.lootItems(player); };
            buttonsDiv.appendChild(lootBtn);
        }

        const waitBtn = document.createElement('button');
        waitBtn.id = 'wait-action-btn';
        waitBtn.innerText = "Wait (1 TP)";
        waitBtn.style.backgroundColor = "#9e9e9e";
        waitBtn.onclick = () => {
            window.spendTP(player, 1);
            window.finalizePlayerAction(player, 'wait');
        };
        buttonsDiv.appendChild(waitBtn);

        // STEALTH BUTTON
        if (!player.isStealthed) {
            const stealthBtn = document.createElement('button');
            stealthBtn.innerText = "Stealth (5 TP)";
            stealthBtn.style.backgroundColor = "#607d8b";
            stealthBtn.disabled = (player.timePoints < 5);
            stealthBtn.onclick = () => {
                if (window.tryStealth(player)) {
                    window.spendTP(player, 5);
                }
                window.finalizePlayerAction(player, true);
            };
            buttonsDiv.appendChild(stealthBtn);
        } else {
            const breakBtn = document.createElement('button');
            breakBtn.innerText = "Break Stealth";
            breakBtn.style.backgroundColor = "#ff9800";
            breakBtn.onclick = () => {
                window.breakStealth(player);
                window.finalizePlayerAction(player, true);
            };
            buttonsDiv.appendChild(breakBtn);
        }

        // DISMISS COMPANION BUTTON
        if (player.animalCompanion) {
            const dismissBtn = document.createElement('button');
            dismissBtn.innerText = `Dismiss ${player.animalCompanion.name}`;
            dismissBtn.style.backgroundColor = "#777";
            dismissBtn.onclick = () => {
                player.animalCompanion.alive = false;
                player.animalCompanion = null;
                showMessage("Animal companion dismissed.");
                window.drawMap();
                window.renderEntities();
                updateActionButtons();
            };
            buttonsDiv.appendChild(dismissBtn);
        }

        const hasRiding = player.skills['riding'] || player.skills['riding_druid'] || player.skills['riding_paladin'];
        if (hasRiding) {
            if (player.riding) {
                const dismountBtn = document.createElement('button');
                dismountBtn.id = 'dismount-action-btn';
                dismountBtn.innerText = "Dismount";
                dismountBtn.style.backgroundColor = "#795548";
                dismountBtn.onclick = () => {
                    window.playerAction = { type: 'dismount' };
                    showMessage("Click an adjacent empty hex to dismount.");
                    updateActionButtons();
                };
                buttonsDiv.appendChild(dismountBtn);
            } else {
                const mountBtn = document.createElement('button');
                mountBtn.id = 'mount-action-btn';
                mountBtn.innerText = "Mount";
                mountBtn.style.backgroundColor = "#795548";
                mountBtn.onclick = () => {
                    window.playerAction = { type: 'mount' };
                    showMessage("Click an adjacent mount to climb on.");
                    updateActionButtons();
                };
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
                flyBtn.disabled = player.timePoints < 1;
                flyBtn.onclick = () => {
                    player.isFlying = true;
                    window.spendTP(player, 1);
                    showMessage(`${player.name} takes to the air!`);
                    window.finalizePlayerAction(player, true);
                };
                buttonsDiv.appendChild(flyBtn);
            } else {
                const landBtn = document.createElement('button');
                landBtn.innerText = "Land (1 TP)";
                landBtn.style.backgroundColor = "#8bc34a";
                landBtn.disabled = player.timePoints < 1;
                landBtn.onclick = () => {
                    player.isFlying = false;
                    window.spendTP(player, 1);
                    showMessage(`${player.name} lands.`);
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
                    if (!eq) weaponReqMet = false; // Need a weapon to disarm? Or maybe just unarmed. 
                    // Let's say Disarm requires a weapon or "unarmed mastery"
                } else if (skillKey === 'assassinate') {
                    const eq = charData.equipped.weapon;
                    if (!eq) weaponReqMet = false;
                } else if (skillKey === 'dagger_throw') {
                    const eq = charData.equipped.weapon;
                    if (eq !== 'dagger') weaponReqMet = false;
                }
                
                if (weaponReqMet) {
                    const button = document.createElement('button');
                    button.id = `skill-btn-${skillKey}`;
                    let label = skill.name;
                    if (skillKey.endsWith('_feint')) label = `${skillKey.split('_')[0].toUpperCase()} Feint`;
                    button.innerText = label;
                    button.onclick = () => {
                        window.playerAction = { type: 'skill', id: skillKey };
                        window.showMessage(`Action set to: ${skill.name}. Click on a target.`);
                        updateActionButtons();
                    };
                    buttonsDiv.appendChild(button);
                }
            }
        }
        if (charData.createdSpells) {
            charData.createdSpells.forEach((spell, index) => {
                const button = document.createElement('button');
                button.id = `spell-btn-${index}`;
                button.innerText = spell.name;
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
    const slots = [{ label: 'Weapon', key: 'weapon' }, { label: 'Off-hand', key: 'offhand' }, { label: 'Armor/Barding', key: 'armor' }, { label: 'Helmet', key: 'helmet' }, { label: 'Accessory', key: 'accessory' }];
    slots.forEach(slot => {
        const itemId = player.equipped[slot.key];
        const item = itemId ? window.items[itemId] : null;
        const itemName = item ? item.name : 'None';
        html += `<div style="margin-bottom: 5px;"><strong>${slot.label}:</strong> ${itemName} ${itemId ? `<button onclick="window.unequipItem('${slot.key}')" style="font-size: 0.8em; margin-left: 10px;">Unequip</button>` : ''}</div>`;
    });
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
            </div>`;
        });
    }
    contentDiv.innerHTML = html;
}

function unequipItem(slot) {
    const player = window.player;
    const playerEntity = window.entities.find(e => e.name === player.name);
    if (!playerEntity) return;
    if (window.gamePhase !== 'PLAYER_TURN' || window.currentTurnEntity !== playerEntity) { showMessage("It must be this character's turn to change equipment."); return; }
    if (playerEntity.timePoints < 1) { showMessage("Not enough Time Points to change equipment."); return; }
    player.equipped[slot] = null;
    playerEntity.timePoints -= 1;
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
    if (window.gamePhase !== 'PLAYER_TURN' || window.currentTurnEntity !== playerEntity) { showMessage("It must be this character's turn to change equipment."); return; }
    if (playerEntity.timePoints < 1) { showMessage("Not enough Time Points to change equipment."); return; }
    
    if (item.type === 'accessory') {
        player.equipped.accessory = itemId;
    } else if (item.type === 'weapon') {
        if (isOffhand) player.equipped.offhand = itemId;
        else { player.equipped.weapon = itemId; if (item.hands === 2) player.equipped.offhand = null; }
    } else if (item.type === 'shield') {
        const weaponId = player.equipped.weapon;
        const weapon = weaponId ? window.items[weaponId] : null;
        if (weapon && weapon.hands === 2) player.equipped.weapon = null;
        player.equipped.offhand = itemId;
    } else if (item.type === 'armor') {
        const reqMap = { 'light_armor': 'light_armor_training', 'medium_armor': 'medium_armor_training', 'heavy_armor': 'heavy_armor_training' };
        const reqSkill = reqMap[itemId];
        if (reqSkill && (!player.skills[reqSkill] || player.skills[reqSkill] === 0)) { showMessage(`You need ${window.skills[reqSkill].name} to equip this.`); return; }
        player.equipped.armor = itemId;
    } else if (item.type === 'helmet') player.equipped.helmet = itemId;
    playerEntity.timePoints -= 1;
    syncPlayerEntity();
    showInventoryScreen();
    showCharacter();
    window.updatePlayerUI();
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
}

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
    const sortedEntities = [...window.entities]
        .filter(e => e.alive && e.hasBeenSeenByPlayer && !e.rider && !e.isNPC)
        .sort((a, b) => b.timePoints - a.timePoints);

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
        if (entity.side === 'player' && entity.name !== 'Wolf' && entity.name !== 'Horse') {
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
                                    hairImg.style.width = '45%';
                                    hairImg.style.height = '45%';
                                    hairImg.style.left = '27.5%';
                                    hairImg.style.top = '27.5%';
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
                                    if (entity.gender === 'male') hairImg.src = 'images/dwarfmalehair.png';
                                    else if (entity.gender === 'female') hairImg.src = 'images/dwarffemalehair.png';
                                    
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
                    const sizePct = entity.gender === 'male' ? 90 : 80;
                    const offsetPct = (100 - sizePct) / 2;
                    shieldImg.style.width = `${sizePct}%`; 
                    shieldImg.style.height = `${sizePct}%`; 
                    shieldImg.style.left = `${offsetPct}%`; 
                    shieldImg.style.top = `${offsetPct}%`;
                }
                portraitDiv.appendChild(shieldImg);
            }
        } else {
            const img = document.createElement('img');
            if (entity.name === 'Orc') img.src = 'images/orc.png';
            else if (entity.name === 'Wolf') img.src = 'images/wolf.png';
            else if (entity.name === 'Horse') { img.src = 'images/horse.png'; applyHorseScaling(img); }
            else if (entity.name === 'Skeleton') img.src = 'images/skeleton.svg';
            else if (entity.name === 'Zombie') img.src = 'images/zombie.svg';
            else if (entity.name === 'Imp') img.src = 'images/imp.svg';
            else if (entity.name === 'Boar') img.src = 'images/boar.png';
            else if (entity.name === 'Tiger') img.src = 'images/tiger.png';
            else if (entity.name === 'Eagle') {
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
        let infoHtml = `<p><strong>${entity.name.split(' ')[0]}</strong></p><p>HP: ${Math.ceil(entity.hp)}/${entity.maxHp} | TP: ${Math.floor(entity.timePoints)}</p>`;
        if (entity.maxMana > 0 || entity.currentMana > 0) infoHtml += `<p>MP: ${Math.floor(entity.currentMana)}/${entity.maxMana || 0}</p>`;
        if (entity.riding) {
            const m = entity.riding;
            infoHtml += `<p style="border-top: 1px solid #555; margin-top: 2px; padding-top: 2px; font-size: 0.9em; color: #aaa;">${m.name}: ${Math.ceil(m.hp)}/${m.maxHp} HP | ${Math.floor(m.timePoints)} TP</p>`;
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
                <p><strong>TP:</strong> ${Math.floor(entity.timePoints)}</p>
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

function requestReaction(entity, options, callback, customMsg = null) {
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
    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.innerText = `${opt.name} (${opt.tpCost} TP)`;
        btn.style.marginRight = "10px";
        btn.onclick = () => { modal.style.display = "none"; window.isPausedForReaction = false; callback(opt.id); };
        optDiv.appendChild(btn);
    });
    const noneBtn = document.createElement("button");
    noneBtn.innerText = "None";
    noneBtn.style.backgroundColor = "#777";
    noneBtn.onclick = () => { modal.style.display = "none"; window.isPausedForReaction = false; callback(null); };
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

    // Create a mini portrait
    portrait.innerHTML = '';
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
            opt.action();
        };
        optDiv.appendChild(btn);
    });

    modal.style.display = "block";
}

function openShop() {
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
        const item = window.items[id];
        if (item.buyPrice === undefined) continue;
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.marginBottom = "5px";
        div.innerHTML = `<span>${item.name} (${item.buyPrice}g)</span>`;
        const btn = document.createElement("button");
        btn.innerText = "Buy";
        btn.style.fontSize = "0.8em";
        btn.disabled = player.gold < item.buyPrice;
        btn.onclick = () => {
            player.gold -= item.buyPrice;
            player.inventory.push(id);
            openShop(); // Refresh
        };
        div.appendChild(btn);
        buyList.appendChild(div);
    }

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
        openShop(); // Refresh
    };
    horseDiv.appendChild(buyHorseBtn);
    buyList.appendChild(horseDiv);

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
        openShop();
    };
    boarDiv.appendChild(buyBoarBtn);
    buyList.appendChild(boarDiv);

    sellList.innerHTML = '';
    const inventory = player.inventory || [];
    const counts = {};
    inventory.forEach(id => counts[id] = (counts[id] || 0) + 1);

    for (const id in counts) {
        const item = window.items[id];
        if (!item) continue;
        const sellPrice = Math.floor((item.buyPrice || 0) * 0.5);
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
            openShop(); // Refresh
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
        for (const skillKey in window.skills) {
            const tree = window.skills[skillKey].tree;
            const ranks = f.skills[skillKey] || 0;
            maxSkills[tree] = Math.max(maxSkills[tree] || 0, ranks);
        }
        // Add unspent points
        if (f.attributes) {
            for (const tree in f.attributes) {
                if (tree === 'wildcard') continue;
                maxSkills[tree] = Math.max(maxSkills[tree] || 0, f.attributes[tree]);
            }
            // Count wildcards as general bonus to their best tree?
            // "Racial skill trees should be counted in this as normal, including counting how many wildcard skill points you have"
            maxSkills['wildcard'] = Math.max(maxSkills['wildcard'] || 0, f.attributes['wildcard']);
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
    
    const validFriendlyTrees = Object.keys(maxFriendly).filter(t => maxFriendly[t] > (window.roguelikeData.permanentSkillBonuses[t] || 0));
    const validEnemyTrees = Object.keys(maxEnemy).filter(t => maxEnemy[t] > (window.roguelikeData.permanentSkillBonuses[t] || 0));

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

function closeCharacterScreen() {
    const modal = document.getElementById("character-screen-modal");
    if (modal) {
        modal.style.display = "none";
    }
    window.updateMusicState(); // Ensure music state is updated after closing
}

window.closeCharacterScreen = closeCharacterScreen;
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
