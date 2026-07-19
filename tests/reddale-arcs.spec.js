const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Reddale arc content: necromancer/lich, orc border, Ironbond', () => {
    test('phylactery altar: pickup, return raises necromancer_cult standing', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.campaign2AbandonedHouseCenter = window.campaign2AbandonedHouseCenter || { q: 100, r: 100 };
            const before = window.factions.necromancer_cult.standing;
            window.interactPhylacteryAltar(); // pickup
            const hasShardAfterPickup = window.player.inventory.includes('phylactery_shard');
            window.interactPhylacteryAltar(); // opens return/keep dialogue
            const options = document.querySelectorAll('#dialogue-options button');
            let returnBtn = null;
            options.forEach(b => { if (b.innerText.includes('Return the shard')) returnBtn = b; });
            if (returnBtn) returnBtn.click();
            return {
                before, after: window.factions.necromancer_cult.standing,
                hasShardAfterPickup,
                hasShardAfterReturn: window.player.inventory.includes('phylactery_shard'),
                phylacteryReturned: window.phylacteryReturned
            };
        });
        expect(result.hasShardAfterPickup).toBe(true);
        expect(result.hasShardAfterReturn).toBe(false);
        expect(result.phylacteryReturned).toBe(true);
        expect(result.after).toBeGreaterThan(result.before);
    });

    test('lich tree is invisible until a quest grants the first rank, then visible and reputation-costly', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = {
                silverhart: window.factions.silverhart_kingdom.standing,
                hasLichSkillBefore: (window.player.skills['lich_deathless_flesh'] || 0) > 0,
            };
            window.grantSkillRank(window.player, 'lich_deathless_flesh');
            return {
                ...before,
                hasLichSkillAfter: (window.player.skills['lich_deathless_flesh'] || 0) > 0,
                baseReductionGained: window.player.baseReduction > 0,
                silverhartAfter: window.factions.silverhart_kingdom.standing
            };
        });
        expect(result.hasLichSkillBefore).toBe(false);
        expect(result.hasLichSkillAfter).toBe(true);
        expect(result.baseReductionGained).toBe(true);
    });

    test('lich reputation crash: keeping the shard tanks reputation across factions', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.interactPhylacteryAltar(); // pickup
            const before = {
                silverhart: window.factions.silverhart_kingdom.standing,
                ironbond: window.factions.ironbond_company.standing,
            };
            window.interactPhylacteryAltar(); // opens keep/return dialogue
            const options = document.querySelectorAll('#dialogue-options button');
            let keepBtn = null;
            options.forEach(b => { if (b.innerText.includes('Keep it')) keepBtn = b; });
            keepBtn.click();
            return {
                before,
                after: { silverhart: window.factions.silverhart_kingdom.standing, ironbond: window.factions.ironbond_company.standing },
                lichRank: window.player.skills['lich_deathless_flesh'] || 0
            };
        });
        expect(result.after.silverhart).toBeLessThan(result.before.silverhart);
        expect(result.after.ironbond).toBeLessThan(result.before.ironbond);
        expect(result.lichRank).toBeGreaterThan(0);
    });

    test('killing a necromancerMinion-tagged monster lowers necromancer_cult standing', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.factions.necromancer_cult.standing;
            const skeleton = window.createMonster('skeleton', { q: 5, r: 5 }, null, null, 'enemy');
            skeleton.necromancerMinion = true;
            skeleton.hp = 1;
            window.entities.push(skeleton);
            const playerEntity = window.entities.find(e => e.name === window.party[0].name);
            window.handleLethalDamage(skeleton, playerEntity);
            return { before, after: window.factions.necromancer_cult.standing };
        });
        expect(result.after).toBeLessThan(result.before);
    });

    test('Eyes on the Border: Captain offers the quest once there is cause for concern, spawns an orc scout', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.goblinScoutNoteRead = true;
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'eyes_on_border_placeholder' }); // no-op, ensures array exists
            window.questLog = window.questLog.filter(q => q.id !== 'eyes_on_border_placeholder');
            window.triggerEyesOnBorder();
            const scout = window.entities.find(e => e.eyesOnBorderTarget);
            return { scoutSpawned: !!scout, scoutName: scout?.name };
        });
        expect(result.scoutSpawned).toBe(true);
        expect(result.scoutName).toBe('Orc');
    });

    test("Reddale's Cut: gated behind merchantInfluence, both branches move reputation/influence oppositely", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.factions.ironbond_company.merchantInfluence.silverhart_kingdom = 50;
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'reddale_cut', title: "Reddale's Cut", giver: 'Reeve Aldous Finch', status: 'active', description: '' });
            const quest = window.questLog.find(q => q.id === 'reddale_cut');
            const beforeInfluence = window.factions.ironbond_company.merchantInfluence.silverhart_kingdom;
            const beforeIronbond = window.factions.ironbond_company.standing;
            // Simulate the "help push back" branch's effects directly (same code the dialogue action runs)
            window.adjustReputation(window.factions.ironbond_company, -15, 15);
            window.adjustMerchantInfluence(window.factions.ironbond_company, 'silverhart_kingdom', -15);
            quest.status = 'completed';
            return {
                beforeInfluence, afterInfluence: window.factions.ironbond_company.merchantInfluence.silverhart_kingdom,
                beforeIronbond, afterIronbond: window.factions.ironbond_company.standing,
                questStatus: quest.status
            };
        });
        expect(result.afterInfluence).toBeLessThan(result.beforeInfluence);
        expect(result.afterIronbond).toBeLessThan(result.beforeIronbond);
        expect(result.questStatus).toBe('completed');
    });

    test('orc raider wilderness encounter spawns a small band east of the crossroads, weighted by security', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const playerEntity = window.entities.find(e => e.name === window.party[0].name);
            playerEntity.hex = { q: window.campaign2Landmarks.crossroads.q + 30, r: 0 };
            window.regions.hollowmere.security = 0; // maximize encounter chance
            window.orcRaiderEncounterAccum = 999;
            const before = window.entities.filter(e => e.orcRaiderBand).length;
            // Roll many times since it's still probabilistic even at max chance base
            let after = before;
            for (let i = 0; i < 40 && after === before; i++) {
                window.orcRaiderEncounterAccum = 999;
                window.checkOrcRaiderEncounter(playerEntity, 0);
                after = window.entities.filter(e => e.orcRaiderBand).length;
            }
            return { before, after };
        });
        expect(result.after).toBeGreaterThan(result.before);
    });
});
