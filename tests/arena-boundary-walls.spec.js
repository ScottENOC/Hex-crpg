const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('arena fight: solid boundary walls, no reachable edge water', () => {
    test('the outer ring of the arena hexagon is always Wall, even on a water-roll arena', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const originalRandom = Math.random;
            Math.random = () => 0.01; // forces isWaterArena=true (and other rolls true)
            window.startArenaFight();
            Math.random = originalRandom;

            const arenaSize = 25;
            const ringHexes = [];
            for (let q = -arenaSize; q <= arenaSize; q++) {
                for (let r = -arenaSize; r <= arenaSize; r++) {
                    if (Math.abs(q) > arenaSize || Math.abs(r) > arenaSize || Math.abs(q + r) > arenaSize) continue;
                    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
                    if (dist >= arenaSize - 1) ringHexes.push({ q, r });
                }
            }
            const nonWallOnRing = ringHexes.filter(h => window.getTerrainAt(h.q, h.r).name !== 'Wall');
            return { ringCount: ringHexes.length, nonWallCount: nonWallOnRing.length, sample: nonWallOnRing.slice(0, 3) };
        });
        expect(result.ringCount).toBeGreaterThan(0);
        expect(result.nonWallCount).toBe(0);
    });

    test('no Water tile exists on the arena boundary ring on a normal (random-roll) arena', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            window.startArenaFight();
            const arenaSize = 25;
            let waterOnRing = 0;
            for (let q = -arenaSize; q <= arenaSize; q++) {
                for (let r = -arenaSize; r <= arenaSize; r++) {
                    if (Math.abs(q) > arenaSize || Math.abs(r) > arenaSize || Math.abs(q + r) > arenaSize) continue;
                    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
                    if (dist >= arenaSize - 1 && window.getTerrainAt(q, r).name === 'Water') waterOnRing++;
                }
            }
            return { waterOnRing };
        });
        expect(result.waterOnRing).toBe(0);
    });
});
