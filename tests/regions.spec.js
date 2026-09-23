// tests/regions.spec.js
// Security/prosperity simulation (regions.js): downward baseline cascade
// from parent, upward player-delta cascade, decay stability, and gameplay
// integration with quest rewards and settlement safety.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('regions.js: security/prosperity simulation', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('seeds a village -> barony -> kingdom hierarchy', async ({ page }) => {
        const regions = await page.evaluate(() => window.regions);
        expect(regions.hollowmere.parentId).toBe('aldervale');
        expect(regions.aldervale.parentId).toBe('silverhart_kingdom');
        expect(regions.silverhart_kingdom.parentId).toBeNull();
    });

    test("a region's baseline rises and falls with its parent's current stat (the downward cascade)", async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.aldervale.security = 100;
            const high = window.getRegionBaseline(window.regions.hollowmere, 'security');
            window.regions.aldervale.security = 0;
            const low = window.getRegionBaseline(window.regions.hollowmere, 'security');
            return { high, low };
        });
        expect(result.high).toBeGreaterThan(result.low);
    });

    test('high prosperity lifts the security baseline (trade brings guards); low prosperity does not', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.hollowmere.prosperity = 90;
            const high = window.getRegionBaseline(window.regions.hollowmere, 'security');
            window.regions.hollowmere.prosperity = 10;
            const low = window.getRegionBaseline(window.regions.hollowmere, 'security');
            return { high, low };
        });
        expect(result.high).toBeGreaterThan(result.low);
    });

    test('adjustRegionStat clamps to [0, 100]', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.adjustRegionStat('hollowmere', 'security', 1000);
            const high = window.regions.hollowmere.security;
            window.adjustRegionStat('hollowmere', 'security', -1000);
            const low = window.regions.hollowmere.security;
            return { high, low };
        });
        expect(result.high).toBe(100);
        expect(result.low).toBe(0);
    });

    test('cascadeRegionStat applies a shrinking delta up the parent chain', async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = {
                hollowmere: window.regions.hollowmere.security,
                aldervale: window.regions.aldervale.security,
                kingdom: window.regions.silverhart_kingdom.security,
            };
            window.cascadeRegionStat('hollowmere', 'security', 10, 0.3);
            return {
                hollowmereDelta: window.regions.hollowmere.security - before.hollowmere,
                aldervaleDelta: window.regions.aldervale.security - before.aldervale,
                kingdomDelta: window.regions.silverhart_kingdom.security - before.kingdom,
            };
        });
        expect(result.hollowmereDelta).toBeCloseTo(10, 5);
        expect(result.aldervaleDelta).toBeCloseTo(3, 5);
        expect(result.kingdomDelta).toBeCloseTo(0.9, 5);
    });

    test('decay moves a region toward its baseline without ever overshooting, even given a huge delta', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.aldervale.security = 50;
            window.regions.hollowmere.security = 10;
            const baseline = window.getRegionBaseline(window.regions.hollowmere, 'security');
            window.tickRegions(3600 * 24 * 365 * 10);
            return { baseline, after: window.regions.hollowmere.security };
        });
        expect(result.after).toBeCloseTo(result.baseline, 0);
        expect(result.after).toBeLessThanOrEqual(100);
        expect(result.after).toBeGreaterThanOrEqual(0);
    });

    test("integration: the farm quest's reward raises Hollowmere's security (and ripples faintly to Aldervale)", async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = { hollowmere: window.regions.hollowmere.security, aldervale: window.regions.aldervale.security };
            window.npcDialogueTrees.old_mac(window.entities.find(e => e.name === 'Old Mac'));
            document.querySelector('#dialogue-options button').click();
            window.triggerFarmWolfEncounter();
            window.entities.filter(e => e.farmQuestWolf).forEach(w => w.alive = false);
            window.npcDialogueTrees.old_mac(window.entities.find(e => e.name === 'Old Mac'));
            return before;
        });
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        await page.click('#dialogue-options button');
        const after = await page.evaluate(() => ({ hollowmere: window.regions.hollowmere.security, aldervale: window.regions.aldervale.security }));
        expect(after.hollowmere).toBeGreaterThan(result.hollowmere);
        expect(after.aldervale).toBeGreaterThan(result.aldervale);
    });

    test('integration: even zero security never lets procedural wilderness enemies breach Hollowmere settlement safety', async ({ page }) => {
        const result = await page.evaluate(() => {
            const originalRandom = Math.random;
            Math.random = () => 0;
            const cp = window.campaign2Landmarks.crossroads;
            // This point is intentionally near the outer inhabited village.
            // Historically security=0 let wolves reach it; settlement safety
            // is now a hard spatial invariant independent of the region stat.
            const nearVillage = { hex: { q: cp.q - 65, r: cp.r }, side: 'player' };
            window.regions.hollowmere.security = 0;
            window.wildernessEncounterAccum = 999;
            const before = window.entities.filter(e => e.name === 'Wolf').length;
            window.checkWildernessEncounter(nearVillage, 200);
            const after = window.entities.filter(e => e.name === 'Wolf').length;
            const safety = window.SettlementSafety.settlementSafetyAt(nearVillage.hex);
            Math.random = originalRandom;
            return { spawned: after > before, protectedBy: safety?.settlement?.id || null };
        });
        expect(result.protectedBy).toBe('hollowmere');
        expect(result.spawned).toBe(false);
    });

    test('regions persist through a real save/load round-trip', async ({ page }) => {
        const security = await page.evaluate(() => {
            window.regions.hollowmere.security = 77;
            window.saveGame('regions_test_save');
            window.regions.hollowmere.security = 0;
            window.loadGame('regions_test_save');
            return window.regions.hollowmere.security;
        });
        expect(security).toBe(77);
    });
});
