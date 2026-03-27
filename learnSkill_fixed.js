function learnSkill(skillKey) {
    const skill = window.skills[skillKey];
    const player = window.player;
    if (!skill || !player) {
        console.error("learnSkill: skill or player undefined", { skillKey, skill, player });
        return;
    }

    console.log(`[SkillSystem] Learning: ${skillKey}. Current Ranks: ${player.skills[skillKey] || 0}`);

    const standardTrees = ['arcane', 'divine', 'nature', 'strength', 'endurance', 'agility', 'weapons'];
    const isStandard = standardTrees.includes(skill.tree);

    // Check if already maxed
    const currentRanks = player.skills[skillKey] || 0;
    if (skill.maxRanks > 0 && currentRanks >= skill.maxRanks) {
        showMessage("Skill already at maximum rank.");
        return;
    }

    // Redundant Riding Check
    if (skillKey === 'riding' || skillKey === 'riding_druid' || skillKey === 'riding_paladin') {
        if (player.skills['riding'] || player.skills['riding_druid'] || player.skills['riding_paladin']) {
            showMessage("You already know how to ride!");
            return;
        }
    }

    // Deduct point
    if (player.attributes[skill.tree] > 0) {
        player.attributes[skill.tree]--;
    } else if (player.attributes.wildcard > 0 && isStandard) {
        player.attributes.wildcard--;
    } else {
        showMessage("You don't have points to learn this skill.");
        return;
    }

    // Add skill rank
    player.skills[skillKey] = (player.skills[skillKey] || 0) + 1;
    
    // CRITICAL: Sync to party array immediately so other UI parts (like prerequisites) see the object change
    const partyChar = window.party.find(p => p.name === player.name);
    if (partyChar) {
        partyChar.skills = player.skills;
        partyChar.attributes = player.attributes;
        console.log(`[SkillSystem] Synced to partyChar. Medium Training Prereq Met? ${partyChar.skills['light_armor_training'] ? 'YES' : 'NO'}`);
    }

    // Apply immediate effect if any
    if (skill.apply) {
        skill.apply(player);
    }

    // Special: Spawn horse for testing if Riding is learned
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
            } else {
                showMessage("Riding learned, but no clear space for a horse nearby!");
            }
        }
    }

    // Auto-equip armor if training is learned
    if (skillKey === 'light_armor_training' || skillKey === 'medium_armor_training' || skillKey === 'heavy_armor_training') {
        const armorMap = {
            'light_armor_training': 'light_armor',
            'medium_armor_training': 'medium_armor',
            'heavy_armor_training': 'heavy_armor'
        };
        const targetArmorId = armorMap[skillKey];
        if (player.inventory.includes(targetArmorId)) {
            player.equipped.armor = targetArmorId;
            const armorItem = window.items[targetArmorId];
            if (armorItem) {
                showMessage(`Automatically equipped ${armorItem.name}!`);
            } else {
                console.error(`[SkillSystem] Armor item ${targetArmorId} not found in window.items`);
            }
        } else {
            console.log(`[SkillSystem] ${targetArmorId} not in inventory, skipping auto-equip.`);
        }
    }

    // Synchronize player entity stats
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

    // Refresh UI
    console.log("[SkillSystem] Refreshing UI. Skills State:", JSON.stringify(player.skills));
    showCharacter();
    showCharacterScreen(); // This should now see the updated skills correctly
    updateActionButtons();
    updateTurnIndicator(); 
}
