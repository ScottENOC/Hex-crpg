const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('King Alaric Corrin: gold-tinted heavy armor and helm', () => {
    test('the king spawns wearing heavy armor and a nasal helm, flagged for gold tinting', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            window.teleportPartyToLocation('Silverhart (Capital)');
            const king = window.entities.find(e => e.name === 'King Alaric Corrin');
            return { found: !!king, equipped: king?.equipped, goldGear: king?.goldGear };
        });
        expect(result.found).toBe(true);
        expect(result.equipped.armor).toBe('heavy_armor');
        expect(result.equipped.helmet).toBe('nasal_helm');
        expect(result.goldGear).toBe(true);
    });

    test('equipToMonster actually assigns the helmet slot (regression: it silently no-op\'d before)', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const m = window.createMonster('goblin', { q: 0, r: 0 });
            window.equipToMonster(m, 'nasal_helm');
            return m.equipped.helmet;
        });
        expect(result).toBe('nasal_helm');
    });

    test('getGoldTintedSprite pushes a near-grayscale armor image to a strong gold hue instead of leaving it unchanged', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const img = window.gameVisuals.humanHeavy;
            const tinted = window.getGoldTintedSprite(img);
            const c = document.createElement('canvas');
            c.width = tinted.width; c.height = tinted.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(tinted, 0, 0);
            const data = ctx.getImageData(0, 0, c.width, c.height).data;
            // Find a fully-opaque pixel and confirm it reads as gold (r,g high, b low).
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 255) {
                    return { r: data[i], g: data[i + 1], b: data[i + 2] };
                }
            }
            return null;
        });
        expect(result).not.toBeNull();
        expect(result.r).toBeGreaterThan(result.b);
        expect(result.g).toBeGreaterThan(result.b);
    });
});
