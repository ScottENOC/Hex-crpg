const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Campaign 1 (roguelike arena): unpainted hexes default to Wall, never Water', () => {
    test('any hex outside the hand-carved lobby resolves to Wall, not a leftover overworld biome', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            // Sample a wide grid well beyond the lobby's carved rooms/pen —
            // none of it was ever explicitly painted, so before the fix it
            // fell through to the overworld biome-noise generator (which can
            // produce Water) instead of defaulting to a safe Wall.
            let waterCount = 0;
            let sampled = 0;
            for (let q = -60; q <= 60; q += 5) {
                for (let r = -60; r <= 60; r += 5) {
                    sampled++;
                    if (window.getTerrainAt(q, r).name === 'Water') waterCount++;
                }
            }
            return { waterCount, sampled };
        });
        expect(result.sampled).toBeGreaterThan(0);
        expect(result.waterCount).toBe(0);
    });

    test('unpainted hexes just outside the pen and rooms are Wall (walkable escape route from earlier fence leak)', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            // A hex known to be well clear of any carved room/corridor/pen.
            return window.getTerrainAt(-40, 20).name;
        });
        expect(result).toBe('Wall');
    });
});
