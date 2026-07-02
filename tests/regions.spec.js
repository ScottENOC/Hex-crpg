// tests/regions.spec.js
// Security/prosperity simulation (regions.js): downward baseline cascade
// from parent, upward player-delta cascade, decay stability, and the two
// integration points (the farm quest reward, wilderness encounter chance).
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
        expect(result.aldervaleDelta).toBeCloseTo(3, 5); // 10 * 0.3
        expect(result.kingdomDelta).toBeCloseTo(0.9, 5); // 10 * 0.3^2
    });

    test('decay moves a region toward its baseline without ever overshooting, even given a huge delta', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.aldervale.security = 50; // pin the parent so the baseline is stable
            window.regions.hollowmere.security = 10;
            const baseline = window.getRegionBaseline(window.regions.hollowmere, 'security');
            window.tickRegions(3600 * 24 * 365 * 10); // 10 in-game years in one call
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
            document.querySelector('#dialogue-options button').click(); // "I'll deal with the wolves."
            window.triggerFarmWolfEncounter();
            window.entities.filter(e => e.farmQuestWolf).forEach(w => w.alive = false);
            window.npcDialogueTrees.old_mac(window.entities.find(e => e.name === 'Old Mac'));
            return before;
        });
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        await page.click('#dialogue-options button'); // "Glad to help."
        const after = await page.evaluate(() => ({ hollowmere: window.regions.hollowmere.security, aldervale: window.regions.aldervale.security }));
        expect(after.hollowmere).toBeGreaterThan(result.hollowmere);
        expect(after.aldervale).toBeGreaterThan(result.aldervale);
    });

    test('integration: lower Hollowmere security makes wilderness wolf encounters more likely and reach closer to the village', async ({ page }) => {
        const result = await page.evaluate(() => {
            const originalRandom = Math.random;
            Math.random = () => 0; // always "hits" the encounter chance if a roll happens at all

            // Low security: encounters should trigger just past a modest radius.
            window.regions.hollowmere.security = 0;
            window.wildernessEncounterAccum = 0;
            const nearPlayerLowSecurity = { hex: { q: 26, r: 0 }, side: 'player' }; // distance 26 from center
            const beforeLow = window.entities.filter(e => e.name === 'Wolf').length;
            window.checkWildernessEncounter(nearPlayerLowSecurity, 200);
            const afterLow = window.entities.filter(e => e.name === 'Wolf').length;

            // High security: the same distance should now be inside the safe radius (no encounter).
            window.regions.hollowmere.security = 100;
            window.wildernessEncounterAccum = 0;
            const beforeHigh = window.entities.filter(e => e.name === 'Wolf').length;
            window.checkWildernessEncounter(nearPlayerLowSecurity, 200);
            const afterHigh = window.entities.filter(e => e.name === 'Wolf').length;

            Math.random = originalRandom;
            return { spawnedAtLowSecurity: afterLow > beforeLow, spawnedAtHighSecurity: afterHigh > beforeHigh };
        });
        expect(result.spawnedAtLowSecurity).toBe(true);
        expect(result.spawnedAtHighSecurity).toBe(false);
    });

    test('regions persist through a real save/load round-trip', async ({ page }) => {
        const security = await page.evaluate(() => {
            window.regions.hollowmere.security = 77;
            window.saveGame('regions_test_save');
            window.regions.hollowmere.security = 0; // clobber in-memory to prove load restores it
            window.loadGame('regions_test_save');
            return window.regions.hollowmere.security;
        });
        expect(security).toBe(77);
    });
});
