// tests/farm-and-encounters.spec.js
// Old Mac's Farmstead (extended south road, fenced pasture, quest) and
// random wilderness wolf encounters.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe("Old Mac's Farmstead", () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('the south road extends past this world hex\'s border to a farmhouse with a fenced pasture', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            let southRoadLength = 0;
            for (let i = 1; i <= 200; i++) {
                let found = false;
                for (let dq = -2; dq <= 2 && !found; dq++) if (window.getTerrainAt(cp.q + dq, cp.r + i).name === 'Path') found = true;
                if (found) southRoadLength = i; else break;
            }
            return {
                southRoadLength,
                oldMac: !!window.entities.find(e => e.name === 'Old Mac'),
                hasFence: Object.values(window.tileObjects).some(o => o.type === 'fence_h' || o.type === 'fence_v'),
                pastureCenter: window.campaign2FarmPastureCenter,
            };
        });
        expect(result.southRoadLength).toBeGreaterThan(130); // past the 130-hex world-hex border
        expect(result.oldMac).toBe(true);
        expect(result.hasFence).toBe(true);
        expect(result.pastureCenter).toBeTruthy();
    });

    test('Old Mac offers the quest, wolves can be triggered, and turning in after clearing them grants the reward', async ({ page }) => {
        await page.evaluate(() => {
            window.npcDialogueTrees.old_mac(window.entities.find(e => e.name === 'Old Mac'));
        });
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        await page.click('#dialogue-options button'); // "I'll deal with the wolves."

        const questAdded = await page.evaluate(() => !!window.questLog.find(q => q.id === 'farm_wolves' && q.status === 'active'));
        expect(questAdded).toBe(true);

        const triggered = await page.evaluate(() => {
            window.triggerFarmWolfEncounter();
            return {
                wolfCount: window.entities.filter(e => e.farmQuestWolf && e.alive).length,
                encounterState: window.questLog.find(q => q.id === 'farm_wolves').encounterState,
            };
        });
        expect(triggered.wolfCount).toBeGreaterThanOrEqual(1);
        expect(triggered.encounterState).toBe('engaged');

        const reward = await page.evaluate(() => {
            window.entities.filter(e => e.farmQuestWolf).forEach(w => w.alive = false); // clear them
            const before = { gold: window.party[0].gold, exp: window.player.exp };
            window.npcDialogueTrees.old_mac(window.entities.find(e => e.name === 'Old Mac'));
            return before;
        });
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        await page.click('#dialogue-options button'); // "Glad to help."
        const after = await page.evaluate(() => ({
            gold: window.party[0].gold,
            exp: window.player.exp,
            status: window.questLog.find(q => q.id === 'farm_wolves').status,
        }));
        expect(after.gold - reward.gold).toBe(25);
        expect(after.exp - reward.exp).toBe(150);
        expect(after.status).toBe('completed');
    });

    test('Old Mac refuses to consider the quest done while wolves are still alive', async ({ page }) => {
        await page.evaluate(() => {
            window.npcDialogueTrees.old_mac(window.entities.find(e => e.name === 'Old Mac'));
        });
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        await page.click('#dialogue-options button');
        await page.evaluate(() => window.triggerFarmWolfEncounter());

        await page.evaluate(() => window.npcDialogueTrees.old_mac(window.entities.find(e => e.name === 'Old Mac')));
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        const message = await page.evaluate(() => document.getElementById('dialogue-message').innerText);
        expect(message.toLowerCase()).toContain('still hear');

        const questStatus = await page.evaluate(() => window.questLog.find(q => q.id === 'farm_wolves').status);
        expect(questStatus).toBe('active');
    });
});

test.describe('random wilderness encounters', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('does nothing within village/farmland range (< 35 hexes from center)', async ({ page }) => {
        const before = await page.evaluate(() => window.entities.length);
        await page.evaluate(() => {
            const nearPlayer = { hex: { q: 5, r: 5 }, side: 'player' };
            window.wildernessEncounterAccum = 999;
            window.checkWildernessEncounter(nearPlayer, 200);
        });
        const after = await page.evaluate(() => window.entities.length);
        expect(after).toBe(before);
    });

    test('can spawn wolves once far enough into the wilderness, gated by an accumulator (not per-tick spam)', async ({ page }) => {
        const result = await page.evaluate(() => {
            // Force the roll to hit by monkey-patching Math.random for this check only.
            const originalRandom = Math.random;
            Math.random = () => 0; // always "hits" the encounter chance
            const farPlayer = { hex: { q: -80, r: 24 }, side: 'player' }; // west of the crossroads
            window.wildernessEncounterAccum = 0;
            const before = window.entities.filter(e => e.name === 'Wolf').length;
            window.checkWildernessEncounter(farPlayer, 50); // under the 120s threshold - should NOT roll yet
            const afterShortDelta = window.entities.filter(e => e.name === 'Wolf').length;
            window.checkWildernessEncounter(farPlayer, 100); // accumulator now past 120s - should roll
            const afterEnoughDelta = window.entities.filter(e => e.name === 'Wolf').length;
            Math.random = originalRandom;
            return { before, afterShortDelta, afterEnoughDelta };
        });
        expect(result.afterShortDelta).toBe(result.before); // no roll yet, accumulator not full
        expect(result.afterEnoughDelta).toBeGreaterThan(result.before); // rolled and spawned
    });
});
