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

    test('a tinted foliage sprite remains drawable at the source aspect ratio regardless of recolour backing type', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const img = window.gameVisuals.tree_small;
            const tint = window.getSeasonalLeafTint();
            const tinted = window.getRecoloredHairSprite(img, tint.hue, tint.light, tint.sat);
            const sourceWidth = img.naturalWidth || img.width || 0;
            const sourceHeight = img.naturalHeight || img.height || 0;
            const tintedWidth = tinted?.naturalWidth || tinted?.width || 0;
            const tintedHeight = tinted?.naturalHeight || tinted?.height || 0;
            return {
                hasTintedSprite: !!tinted,
                sourceWidth,
                sourceHeight,
                tintedWidth,
                tintedHeight,
            };
        });
        expect(result.hasTintedSprite).toBe(true);
        expect(result.sourceWidth).toBeGreaterThan(0);
        expect(result.sourceHeight).toBeGreaterThan(0);
        expect(result.tintedWidth).toBe(result.sourceWidth);
        expect(result.tintedHeight).toBe(result.sourceHeight);
    });

    test('the apple sprite asset is registered and loads', async ({ page }) => {
        await createCharacter(page);
        // Apple is a speculative/non-blocking asset, so character creation no
        // longer guarantees that its network load has completed synchronously.
        await page.waitForFunction(() => {
            const apple = window.gameVisuals?.apple;
            return !!apple && apple.complete && apple.naturalWidth > 0;
        }, null, { timeout: 5000 });
        const loaded = await page.evaluate(() => window.gameVisuals.apple.complete && window.gameVisuals.apple.naturalWidth > 0);
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
