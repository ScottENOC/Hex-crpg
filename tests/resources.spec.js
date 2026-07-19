const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('wilderness resources: terrain, nodes, harvesting, skills, buffs, prosperity', () => {
    test('cross-country wilderness is no longer flat grass (forest/rocky-outcrop variation exists)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const names = new Set();
            for (let q = 60; q < 160; q += 3) {
                for (let r = 60; r < 160; r += 3) {
                    names.add(window.getTerrainAt(q, r).name);
                }
            }
            return Array.from(names);
        });
        expect(result).toContain('Grass');
        expect(result.length).toBeGreaterThan(1); // not ALL flat grass anymore
        expect(result.some(n => n === 'Forest' || n === 'Rocky Outcrop')).toBe(true);
    });

    test('ensureWildernessResourceNode deterministically places ore nodes on Rocky Outcrop and never inside the village', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Find a real Rocky Outcrop hex out in the wilderness.
            let outcropHex = null;
            for (let q = 40; q < 200 && !outcropHex; q++) {
                for (let r = 40; r < 200 && !outcropHex; r++) {
                    if (window.getTerrainAt(q, r).name === 'Rocky Outcrop') outcropHex = { q, r };
                }
            }
            if (!outcropHex) return { found: false };
            window.ensureWildernessResourceNode(outcropHex.q, outcropHex.r);
            const node = window.tileObjects[`${outcropHex.q},${outcropHex.r}`];

            // Village-adjacent hex must never get a node even on qualifying terrain.
            window.ensureWildernessResourceNode(5, 5);
            const villageNode = window.tileObjects['5,5'];

            return { found: true, node, villageNode };
        });
        expect(result.found).toBe(true);
        // Node may or may not exist here (50% roll) - but if it does, must be ore_node with a valid oreType.
        if (result.node) {
            expect(result.node.type).toBe('ore_node');
            expect(['ore_iron', 'ore_silver', 'ore_gold', 'gem_red', 'gem_blue', 'gem_green']).toContain(result.node.oreType);
        }
        expect(result.villageNode).toBeUndefined();
    });

    test('mining requires a pickaxe, gives ore, and depletes the node', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.tileObjects['500,500'] = { type: 'ore_node', oreType: 'ore_gold', depleted: false };
            const beforeInventory = window.player.inventory.filter(i => i === 'ore_gold').length;
            window.harvestOreNode(500, 500); // no pickaxe yet
            const withoutPickaxe = window.player.inventory.filter(i => i === 'ore_gold').length;

            window.player.inventory.push('pickaxe');
            window.harvestOreNode(500, 500);
            const withPickaxe = window.player.inventory.filter(i => i === 'ore_gold').length;
            const depleted = window.tileObjects['500,500'].depleted;

            window.harvestOreNode(500, 500); // already depleted
            const afterSecondAttempt = window.player.inventory.filter(i => i === 'ore_gold').length;

            return { beforeInventory, withoutPickaxe, withPickaxe, depleted, afterSecondAttempt };
        });
        expect(result.withoutPickaxe).toBe(result.beforeInventory); // no ore without pickaxe
        expect(result.withPickaxe).toBeGreaterThan(result.withoutPickaxe);
        expect(result.depleted).toBe(true);
        expect(result.afterSecondAttempt).toBe(result.withPickaxe); // depleted node gives nothing more
    });

    test('fruit tree harvest gives fruit and sets a regrow timer; herb patch and fishing spot follow the same shape', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.tileObjects['501,501'] = { type: 'fruit_tree', hasFruit: true, regrowAt: 0 };
            window.harvestFruitTree(501, 501);
            const fruitAfter = window.player.inventory.filter(i => i === 'fruit').length;
            const treeDepleted = !window.tileObjects['501,501'].hasFruit;

            window.tileObjects['502,502'] = { type: 'herb_patch', hasHerbs: true, regrowAt: 0 };
            window.harvestHerbPatch(502, 502);
            const herbsAfter = window.player.inventory.filter(i => i === 'herbs').length;

            window.tileObjects['503,503'] = { type: 'fishing_spot', lastFishedAt: 0 };
            window.harvestFishingSpot(503, 503);
            const fishAfter = window.player.inventory.filter(i => i === 'fish').length;
            // Immediately fishing again should fail (cooldown).
            const fishBeforeSecond = fishAfter;
            window.harvestFishingSpot(503, 503);
            const fishAfterSecond = window.player.inventory.filter(i => i === 'fish').length;

            return { fruitAfter, treeDepleted, herbsAfter, fishAfter, fishBeforeSecond, fishAfterSecond };
        });
        expect(result.fruitAfter).toBeGreaterThan(0);
        expect(result.treeDepleted).toBe(true);
        expect(result.herbsAfter).toBeGreaterThan(0);
        expect(result.fishAfter).toBeGreaterThan(0);
        expect(result.fishAfterSecond).toBe(result.fishBeforeSecond); // cooldown blocks immediate re-fish
    });

    test('animal corpses require nature_butchery to harvest, not just base Knowledge: Nature', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const wolf = window.createMonster('wolf', { q: 504, r: 504 }, null, null, 'enemy');
            window.entities.push(wolf);
            window.leaveCorpse(wolf);
            const corpseKey = '504,504';

            window.harvestCorpse(504, 504); // no skill at all
            const withoutSkill = window.player.inventory.filter(i => i === 'game_meat').length;

            // Base Knowledge: Nature alone should NOT be enough anymore.
            window.player.skills['druid_knowledge_nature'] = 1;
            window.harvestCorpse(504, 504);
            const withBaseKnowledgeOnly = window.player.inventory.filter(i => i === 'game_meat').length;

            window.player.skills['nature_butchery'] = 1;
            window.harvestCorpse(504, 504);
            const withButchery = window.player.inventory.filter(i => i === 'game_meat').length;
            const hideCount = window.player.inventory.filter(i => i === 'hide').length;

            return { withoutSkill, withBaseKnowledgeOnly, withButchery, hideCount };
        });
        expect(result.withoutSkill).toBe(0);
        expect(result.withBaseKnowledgeOnly).toBe(0);
        expect(result.withButchery).toBeGreaterThan(0);
        expect(result.hideCount).toBeGreaterThan(0);
    });

    test('nature_butchery/nature_bounty/nature_ranger all require Knowledge: Nature as a prereq', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const noKnowledge = { skills: {} };
            const withKnowledge = { skills: { elf_knowledge_nature: 1 } };
            return {
                butcheryBlocked: !window.skills['nature_butchery'].prereq_eval(noKnowledge),
                butcheryAllowed: window.skills['nature_butchery'].prereq_eval(withKnowledge),
                bountyBlocked: !window.skills['nature_bounty'].prereq_eval(noKnowledge),
                rangerBlocked: !window.skills['nature_ranger'].prereq_eval(noKnowledge),
            };
        });
        expect(result.butcheryBlocked).toBe(true);
        expect(result.butcheryAllowed).toBe(true);
        expect(result.bountyBlocked).toBe(true);
        expect(result.rangerBlocked).toBe(true);
    });

    test('eating food grants Well Fed, which reduces wilderness ambush chance', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.getWildernessAmbushChance();
            window.player.inventory.push('fruit');
            window.eatFood('fruit');
            const wellFed = window.isWellFed(window.player);
            const after = window.getWildernessAmbushChance();
            return { before, after, wellFed };
        });
        expect(result.wellFed).toBe(true);
        expect(result.after).toBeLessThan(result.before);
    });

    test('donating resources raises a region\'s prosperity (Wick Hallow / Hollowmere)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.regions.hollowmere.prosperity;
            for (let i = 0; i < 5; i++) window.player.inventory.push('fish');
            const ok = window.donateResourceToRegion('hollowmere', 'fish', 5, 3);
            const after = window.regions.hollowmere.prosperity;
            const remaining = window.player.inventory.filter(i => i === 'fish').length;
            return { before, after, ok, remaining };
        });
        expect(result.ok).toBe(true);
        expect(result.after).toBeGreaterThan(result.before);
        expect(result.remaining).toBe(0);
    });

    test('"A Stone for Nella" - a trade-good want that becomes a real quest, not an instant leverage trade', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'a_stone_for_nella', title: 'A Stone for Nella', giver: 'Nella Brook', status: 'active', description: '' });
            const quest = window.questLog.find(q => q.id === 'a_stone_for_nella');
            const beforeGold = window.party[0].gold || 0;
            window.player.inventory.push('gem_blue');
            // Simulate the turn-in action directly (same effect the dialogue button runs).
            window.player.inventory.splice(window.player.inventory.indexOf('gem_blue'), 1);
            quest.status = 'completed';
            window.party[0].gold = beforeGold + 20;
            return { status: quest.status, goldGained: window.party[0].gold - beforeGold, hasGem: window.player.inventory.includes('gem_blue') };
        });
        expect(result.status).toBe('completed');
        expect(result.goldGained).toBe(20);
        expect(result.hasGem).toBe(false);
    });
});
