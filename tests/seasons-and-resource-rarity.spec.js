const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('seasonal leaf tint and rarer wilderness resources', () => {
    test('getSeasonalLeafTint is full green at the actual summer solstice (month 5) and brown/bare at the actual winter solstice (month 11)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const daySeconds = 86400;
            window.worldSeconds = 5 * 30 * daySeconds; // month index 5 (0-based)
            const summer = window.getSeasonalLeafTint();
            window.worldSeconds = 11 * 30 * daySeconds; // month index 11
            const winter = window.getSeasonalLeafTint();
            return { summer, winter };
        });
        expect(result.summer.hue).toBeGreaterThan(80); // green
        expect(result.summer.light).toBeCloseTo(1.0, 1);
        expect(result.winter.sat).toBeLessThan(0.6); // desaturated/bare
        expect(result.winter.light).toBeLessThan(0.7);
    });

    test('Campaign 2 starts in month 0 (Dawnfrost), which the actual daylight math places in deep winter, not summer', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            window.worldSeconds = 0; // game start
            const tint = window.getSeasonalLeafTint();
            return { tint, formattedTime: window.getFormattedTime() };
        });
        expect(result.formattedTime).toContain('Dawnfrost');
        // Winter-side of the cycle: low saturation/lightness, not the green peak.
        expect(result.tint.sat).toBeLessThan(0.7);
    });

    test('a tinted foliage sprite is a canvas (not the original <img>), and reading its aspect ratio from the original image still works', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const img = window.gameVisuals.tree_small;
            const tint = window.getSeasonalLeafTint();
            const tinted = window.getRecoloredHairSprite(img, tint.hue, tint.light, tint.sat);
            return {
                isCanvas: tinted instanceof HTMLCanvasElement,
                originalHasNaturalSize: img.naturalWidth > 0 && img.naturalHeight > 0,
            };
        });
        expect(result.isCanvas).toBe(true);
        expect(result.originalHasNaturalSize).toBe(true);
    });

    test('the apple sprite asset is registered and loads', async ({ page }) => {
        await createCharacter(page);
        const loaded = await page.evaluate(() => window.gameVisuals.apple && window.gameVisuals.apple.complete && window.gameVisuals.apple.naturalWidth > 0);
        expect(loaded).toBe(true);
    });

    test('ore/fruit/fish node thresholds are cut to ~10% of their original width', async ({ page }) => {
        await createCharacter(page);
        // These are just the literal thresholds from resources.js — a direct
        // regression check that nobody quietly reverts them.
        const src = await page.evaluate(() => fetch('/resources.js').then(r => r.text()));
        expect(src).toContain("roll < 0.05");
        expect(src).toContain("roll >= 0.5 && roll < 0.506");
        expect(src).toContain("roll < 0.008");
    });
});
