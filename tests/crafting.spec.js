const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Crafting: rare materials, recipes, bounded-accuracy check', () => {
    test('the three runeforged items exist, are recipe-gated, and never exceed a mundane item\'s own tier', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const recipes = window.CRAFTING_RECIPES;
            const checks = Object.entries(recipes).map(([id, r]) => {
                const item = window.items[r.resultItemId];
                const materialsExist = Object.keys(r.materials).every(m => !!window.items[m]);
                return {
                    id, hasItem: !!item, noBuyPrice: item && item.buyPrice === undefined,
                    materialsExist,
                    weaponWithinTier: item.type !== 'weapon' || item.damage <= 3,
                    armorWithinTier: item.type !== 'armor' || item.reduction <= 2
                };
            });
            return checks;
        });
        expect(result.length).toBe(3);
        result.forEach(c => {
            expect(c.hasItem).toBe(true);
            expect(c.noBuyPrice).toBe(true);
            expect(c.materialsExist).toBe(true);
            expect(c.weaponWithinTier).toBe(true);
            expect(c.armorWithinTier).toBe(true);
        });
    });

    test('craftAtForge refuses without the runesmithing skill even with materials and gold in hand', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.player.inventory.push('starmetal_ore', 'starmetal_ore');
            window.player.gold = 1000;
            const before = window.player.inventory.length;
            const crafted = window.craftAtForge('starforged_blade');
            return { crafted, hasItemAfter: window.player.inventory.includes('starforged_blade'), invUnchanged: window.player.inventory.length === before };
        });
        expect(result.crafted).toBe(false);
        expect(result.hasItemAfter).toBe(false);
        expect(result.invUnchanged).toBe(true);
    });

    test('craftAtForge succeeds once the player holds runesmithing, consuming exact materials and gold', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.grantSkillRank(window.player, 'runesmithing');
            window.player.inventory.push('starmetal_ore', 'starmetal_ore', 'ore_iron');
            window.player.gold = 200;
            const crafted = window.craftAtForge('starforged_blade');
            return {
                crafted,
                hasBlade: window.player.inventory.includes('starforged_blade'),
                starmetalLeft: window.player.inventory.filter(i => i === 'starmetal_ore').length,
                ironUntouched: window.player.inventory.includes('ore_iron'),
                goldLeft: window.player.gold
            };
        });
        expect(result.crafted).toBe(true);
        expect(result.hasBlade).toBe(true);
        expect(result.starmetalLeft).toBe(0);
        expect(result.ironUntouched).toBe(true);
        expect(result.goldLeft).toBe(50);
    });

    test('craftWithSmith works without the player skill, but charges a real premium over craftAtForge\'s price', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.player.inventory.push('dragon_scale', 'dragon_scale', 'dragon_scale');
            window.player.gold = 1000;
            const goldBefore = window.player.gold;
            const crafted = window.craftWithSmith('dragonscale_mail');
            return { crafted, hasMail: window.player.inventory.includes('dragonscale_mail'), spent: goldBefore - window.player.gold, baseRecipeGold: window.CRAFTING_RECIPES.dragonscale_mail.gold };
        });
        expect(result.crafted).toBe(true);
        expect(result.hasMail).toBe(true);
        expect(result.spent).toBeGreaterThan(result.baseRecipeGold);
    });

    test('Kragmoor exists with a Runeforge tile and Thrain Emberhand the Runesmith', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2DeepholdsRuneforgeCenter;
            const forgeObj = center && window.tileObjects[`${center.q},${center.r}`];
            const npc = window.entities.find(e => e.name === 'Thrain Emberhand');
            return { hasCenter: !!center, forgeType: forgeObj && forgeObj.type, hasNpc: !!npc, dialogueId: npc && npc.dialogueId };
        });
        expect(result.hasCenter).toBe(true);
        expect(result.forgeType).toBe('rune_forge');
        expect(result.hasNpc).toBe(true);
        expect(result.dialogueId).toBe('deepholds_runesmith');
    });

    test('the runesmithing questline requires standing before Thrain will even craft for a stranger', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Thrain Emberhand');
            window.factions.dwarven_kingdom.standing = 0;
            window.npcDialogueTrees.deepholds_runesmith(npc);
            const msg = document.getElementById('dialogue-message').innerText;
            const trustQuestAdded = (window.questLog || []).some(q => q.id === 'kragmoor_runesmith_trust');
            return { msg, trustQuestAdded };
        });
        expect(result.trustQuestAdded).toBe(false);
        expect(result.msg).toMatch(/trust/i);
    });

    test('a dwarf PC is offered the teaching quest with only one starmetal shard required, no reputation gate beyond trust', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party[0].race = 'dwarf';
            window.factions.dwarven_kingdom.standing = 10;
            const npc = window.entities.find(e => e.name === 'Thrain Emberhand');
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'kragmoor_runesmith_trust', title: 'The Forge Trusts a Stranger', status: 'completed' });
            window.npcDialogueTrees.deepholds_runesmith(npc);
            const teachQuest = window.questLog.find(q => q.id === 'kragmoor_runesmith_teach');
            return { teachQuestAdded: !!teachQuest, description: teachQuest && teachQuest.description };
        });
        expect(result.teachQuestAdded).toBe(true);
        expect(result.description).toMatch(/1x starmetal/);
    });

    test('a non-dwarf PC needs standing 30+ (not just the trust threshold) and 2x starmetal to be offered the teaching quest', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party[0].race = 'human';
            const npc = window.entities.find(e => e.name === 'Thrain Emberhand');
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'kragmoor_runesmith_trust', title: 'The Forge Trusts a Stranger', status: 'completed' });
            window.factions.dwarven_kingdom.standing = 15; // trusted, but below the teaching threshold
            window.npcDialogueTrees.deepholds_runesmith(npc);
            const teachQuestAtLowStanding = (window.questLog || []).some(q => q.id === 'kragmoor_runesmith_teach');

            window.factions.dwarven_kingdom.standing = 30;
            window.npcDialogueTrees.deepholds_runesmith(npc);
            const teachQuest = window.questLog.find(q => q.id === 'kragmoor_runesmith_teach');
            return { teachQuestAtLowStanding, teachQuestAdded: !!teachQuest, description: teachQuest && teachQuest.description };
        });
        expect(result.teachQuestAtLowStanding).toBe(false);
        expect(result.teachQuestAdded).toBe(true);
        expect(result.description).toMatch(/2x starmetal/);
    });

    test('Millbrook\'s dragon carries dragon scales, and clearing Kragmoor\'s lower tunnels rewards a deep crystal', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const dragon = window.entities.find(e => e.isMillbrookDragon);
            const hasScales = dragon && dragon.inventory.filter(i => i === 'dragon_scale').length >= 3;

            const king = window.entities.find(e => e.name === 'King Balrik Deepholm');
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'deepholds_infestation', title: 'What Nests Below', status: 'active' });
            (window.entities || []).filter(e => e.deepholdsVermin).forEach(e => { e.alive = false; });
            const before = window.player.inventory.filter(i => i === 'deep_crystal').length;
            window.npcDialogueTrees.dwarf_king(king);
            const after = window.player.inventory.filter(i => i === 'deep_crystal').length;
            return { hasScales, crystalGranted: after > before };
        });
        expect(result.hasScales).toBe(true);
        expect(result.crystalGranted).toBe(true);
    });
});
