// ui.js

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
    
    const playerEntity = window.entities.find(e => e.name.includes("Player"));
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
        // Initialize sleep timer for all player entities if needed
        window.entities.forEach(e => {
            if (e.side === 'player' && e.name !== 'Wolf' && e.name !== 'Horse') {
                if (e.sleepRemainingSeconds <= 0) {
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
  if (!window.player){document.getElementById("character-info").innerText="No character yet.";return;}
  
  let txt=`<p><strong>Name: ${window.player.name}</strong></p>
<p>Race: ${window.player.race}</p>
<p>Class: ${window.player.class}</p>
<p>Level: ${window.player.level}</p>
<p>HP: ${window.player.hp}/${window.player.maxHp}</p>
<p>Mana: ${Number(window.player.currentMana).toFixed(1)}/${window.player.maxMana}</p>
<p>Damage: ${window.player.baseDamage}</p>
`;
  document.getElementById("character-info").innerHTML=txt;
}

function showCharacterScreen() {
    if (!window.player) return;

    const char = window.player;
    const contentDiv = document.getElementById("character-screen-content");
    contentDiv.innerHTML = ''; 

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
                    <option value="paladin">Paladin</option>
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
    const standardTrees = ['arcane', 'divine', 'nature', 'strength', 'endurance', 'agility', 'weapons', 'way_of_the_open_palm'];

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

    treesToShow.forEach(tree => {
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
                if (skill.prereq) {
                    const prereqRanks = playerSkills[skill.prereq] || 0;
                    if (prereqRanks === 0) prereqMet = false;
                }
                if (skill.prereq_eval) {
                    if (!skill.prereq_eval(char)) prereqMet = false;
                }

                const hasPoints = availablePoints[tree] > 0;
                const hasWildcardPoints = availablePoints.wildcard > 0;
                const canUseWildcard = hasWildcardPoints && !['elf', 'dwarf', 'human', 'fighter', 'rogue', 'cleric', 'wizard', 'druid'].includes(tree);
                const canLearn = (hasPoints || canUseWildcard) && !isMaxed && prereqMet;
                const buttonLabel = maxRanks === 1 ? 'Learn' : `+1 Rank (${currentRanks})`;
                
                if (prereqMet || currentRanks > 0) {
                    treeHtml += `
                        <div class="skill-item" style="padding-left: 20px; margin-bottom: 10px;">
                            <strong>${skill.name}</strong>: ${skill.description}
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

    const isExclusion = ['elf', 'dwarf', 'human', 'fighter', 'rogue', 'cleric', 'wizard', 'druid', 'paladin'].includes(skill.tree);

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
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

function updateActionButtons() {
    const buttonsDiv = document.getElementById('actions');
    if (!buttonsDiv) return;
    
    const preservedButtons = [];
    buttonsDiv.querySelectorAll('button').forEach(btn => {
        if (!btn.id.startsWith('skill-btn-') && !btn.id.startsWith('spell-btn-') && 
            btn.id !== 'cancel-action-btn' && btn.id !== 'wait-action-btn' && 
            btn.id !== 'mount-action-btn' && btn.id !== 'dismount-action-btn') {
            preservedButtons.push(btn.cloneNode(true));
        }
    });
    buttonsDiv.innerHTML = '';
    preservedButtons.forEach(btn => buttonsDiv.appendChild(btn));

    if (window.currentTurnEntity && window.currentTurnEntity.side === "player") {
        const player = window.currentTurnEntity;
        const charData = window.player; 
        
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
            window.finalizePlayerAction(player, true);
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
                let weaponReqMet = true;
                if (skillKey.endsWith('_feint')) {
                    const weaponType = skillKey.split('_')[0];
                    const eq = charData.equipped.weapon;
                    if (!eq || !window.items[eq].id.includes(weaponType)) weaponReqMet = false;
                } else if (skillKey === 'quarterstaff_trip') {
                    const eq = charData.equipped.weapon;
                    const isAnimal = charData.race === 'wolf'; 
                    if (eq !== 'quarterstaff' && !isAnimal) weaponReqMet = false;
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
                    window.playerAction = { type: 'spell', index: index };
                    window.showMessage(`Spell ready: ${spell.name}. Click a target in range (${spell.range}).`);
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
    const baseId = document.getElementById("spell-base-select").value;
    const base = window.baseSpells[baseId];
    const options = player.unlockedCastingOptions[base.school] || {};
    let html = '';
    if (base.type === 'summon') {
        html += `
            <div class="form-group">
                <label>Animal to Summon:</label>
                <select id="spell-animal-select" onchange="window.renderSpellStats()">
                    ${base.summons.map(animalId => `<option value="${animalId}">${window.monsterTemplates[animalId].name}</option>`).join('')}
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
    document.getElementById("spell-options-container").innerHTML = html;
    window.renderSpellStats();
}

function renderSpellStats() {
    const player = window.player;
    const baseId = document.getElementById("spell-base-select").value;
    const base = window.baseSpells[baseId];
    const speed = document.getElementById("spell-speed-select").value;
    const rangeBonus = parseInt(document.getElementById("spell-range-bonus").value) || 0;
    const magBonus = parseInt(document.getElementById("spell-magnitude-bonus").value) || 0;
    let manaCost = base.baseMana;
    let tpCost = 10;
    let magnitude = base.baseMagnitude * (1 + magBonus);
    let range = (base.baseRange || 1) + rangeBonus;
    let effRange = 0, effMag = 0, effSpeed = 0;
    if (base.school === 'arcane') {
        effRange = player.skills['arcane_eff_range'] || 0;
        effMag = player.skills['arcane_eff_magnitude'] || 0;
        effSpeed = player.skills['arcane_eff_speed'] || 0;
    }
    if (speed === 'quickened') { tpCost = 5; manaCost += Math.max(0, 5 - effSpeed); }
    if (speed === 'slowed') { tpCost = 20; manaCost -= 4; }
    
    const castingManaMod = (manaCost - base.baseMana); // Speed cost
    
    manaCost += Math.max(0, rangeBonus - effRange);
    const rangeManaMod = Math.max(0, rangeBonus - effRange);

    manaCost += (magBonus * Math.max(0, 5 - effMag));
    const coreManaCost = base.baseMana + (magBonus * Math.max(0, 5 - effMag));

    const cap = player.manaCaps[base.school] || 10;
    const overCap = manaCost > cap;
    let statsHtml = `
        <p><strong>Total Mana Cost:</strong> ${manaCost.toFixed(1)} ${overCap ? '<span style="color:#f44336; font-weight: bold;">(EXCEEDS CAP: ' + cap + ')</span>' : ''}</p>
        <p><strong>Core Mana Cost (Maint):</strong> ${coreManaCost.toFixed(1)}</p>
        <p><strong>TP Cost:</strong> ${tpCost}</p>
        <p><strong>Magnitude:</strong> ${magnitude}</p>
        <p><strong>Range:</strong> ${range}</p>
    `;
    document.getElementById("spell-stats-display").innerHTML = statsHtml;
    const animalId = document.getElementById("spell-animal-select") ? document.getElementById("spell-animal-select").value : null;
    window.currentSpellCalc = { name: base.name, school: base.school, manaCost, coreManaCost, tpCost, magnitude, range, type: base.type, baseId, animalId };
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
    const slots = [{ label: 'Weapon', key: 'weapon' }, { label: 'Off-hand', key: 'offhand' }, { label: 'Armor/Barding', key: 'armor' }, { label: 'Helmet', key: 'helmet' }];
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

            const available = count - equipCount;
            const canBeOffhand = item.canOffhand || item.type === 'shield';
            const mainHandWeapon = player.equipped.weapon ? window.items[player.equipped.weapon] : null;
            const showOffhandBtn = canBeOffhand && mainHandWeapon && mainHandWeapon.hands === 1 && available > 0;

            html += `<div style="margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;">
                <strong>${item.name} x${count}</strong> (${item.type})
                ${equipCount > 0 ? `<br><span style="color: #4caf50; font-size: 0.8em;">Equipped: ${equipCount}</span>` : ''}
                <br><span style="font-size: 0.8em; color: #aaa;">${item.damage ? 'Dmg: +' + item.damage : ''} ${item.range ? 'Range: +' + item.range : ''} ${item.hands ? 'Hands: ' + item.hands : ''}</span>
                <br>
                ${available > 0 ? `<button onclick="window.equipItem('${itemId}')">Equip</button>` : ''}
                ${showOffhandBtn ? `<button onclick="window.equipItem('${itemId}', true)" style="margin-left:5px;">Equip Off-hand</button>` : ''}
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
    updatePlayerUI();
}

function equipItem(itemId, isOffhand = false) {
    const player = window.player;
    const item = window.items[itemId];
    const playerEntity = window.entities.find(e => e.name === player.name);
    if (!playerEntity) return;
    if (window.gamePhase !== 'PLAYER_TURN' || window.currentTurnEntity !== playerEntity) { showMessage("It must be this character's turn to change equipment."); return; }
    if (playerEntity.timePoints < 1) { showMessage("Not enough Time Points to change equipment."); return; }
    if (item.type === 'weapon') {
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
    updatePlayerUI();
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

function doLevelUp() {
    const cls = document.getElementById("level-up-class-select").value;
    const expReq = window.player.level * 1000;
    if (window.player.exp < expReq) return;
    window.player.exp -= expReq;
    window.player.level += 1;
    const cb = window.classData[cls].bonus;
    for (let key in cb) window.player.attributes[key] = (window.player.attributes[key] || 0) + cb[key];
    
    const rb = window.raceData[window.player.race].bonus;
    for (let key in rb) window.player.attributes[key] = (window.player.attributes[key] || 0) + rb[key];

    window.showMessage(`Level UP! You are now level ${window.player.level} ${cls}.`);
    showCharacter();
    showCharacterScreen();
}

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
        .filter(e => e.alive && e.hasBeenSeenByPlayer && !e.rider)
        .sort((a, b) => b.timePoints - a.timePoints);

    sortedEntities.forEach(entity => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('turn-indicator-item');
        if (entity === window.currentTurnEntity) itemDiv.classList.add('current-turn');
        const portraitDiv = document.createElement('div');
        portraitDiv.classList.add('turn-indicator-portrait');
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
                baseImg.src = 'images/elf.png'; baseImg.classList.add('portrait-layer');
                portraitDiv.appendChild(baseImg);
                if (entity.equipped && entity.equipped.armor) {
                    const armorImg = document.createElement('img');
                    const armorId = entity.equipped.armor;
                    armorImg.src = (armorId === 'medium_armor' || armorId === 'heavy_armor') ? 'images/elfchainarmour.png' : 'images/elfleatherarmour.png';
                    armorImg.classList.add('portrait-layer'); portraitDiv.appendChild(armorImg);
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
        let infoHtml = `<p><strong>${entity.name.split(' ')[0]}</strong></p><p>HP: ${entity.hp}/${entity.maxHp} | TP: ${Math.floor(entity.timePoints)}</p>`;
        if (entity.maxMana > 0 || entity.currentMana > 0) infoHtml += `<p>MP: ${entity.currentMana || 0}/${entity.maxMana || 0}</p>`;
        if (entity.riding) {
            const m = entity.riding;
            infoHtml += `<p style="border-top: 1px solid #555; margin-top: 2px; padding-top: 2px; font-size: 0.9em; color: #aaa;">${m.name}: ${m.hp}/${m.maxHp} HP | ${Math.floor(m.timePoints)} TP</p>`;
        }
        infoDiv.innerHTML = infoHtml;
        itemDiv.appendChild(portraitDiv);
        itemDiv.appendChild(infoDiv);
        indicatorBar.appendChild(itemDiv);
    });
}

function requestReaction(entity, options, callback, customMsg = null) {
    const isSentientAlly = entity.side === 'player' && entity.name !== 'Wolf';
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
window.updatePartyTabs = updatePartyTabs;
window.selectCharacterByName = selectCharacterByName;
window.addJerry = addJerry;
window.requestReaction = requestReaction;
