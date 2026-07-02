// tests/character-creator.spec.js
// Clothing-color slider on the character creator (see spriteRecolor.js):
// lets the player pick their own tunic hue before starting, without touching
// race/gender/shape. The preview canvas is self-contained (doesn't depend on
// window.gameVisuals/CHAR_CONFIG, which don't exist until after game start).
const { test, expect } = require('@playwright/test');

test.describe('character creator tunic-color slider', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#race-select', { state: 'visible' });
    });

    test('slider and preview canvas exist with sensible defaults', async ({ page }) => {
        const slider = page.locator('#tunic-hue-slider');
        const canvas = page.locator('#appearance-preview-canvas');
        await expect(slider).toBeAttached();
        await expect(canvas).toBeAttached();
        expect(await slider.getAttribute('min')).toBe('0');
        expect(await slider.getAttribute('max')).toBe('359');
    });

    test('moving the slider redraws the preview canvas with different pixels', async ({ page }) => {
        // Force a known race/gender so the preview image is deterministic.
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');
        await page.fill('#tunic-hue-slider', '30');
        await page.evaluate(() => window.updateAppearancePreview());
        // Give the (possibly async-loading) preview image a moment to settle.
        await page.waitForFunction(() => {
            const c = document.getElementById('appearance-preview-canvas');
            const ctx = c.getContext('2d');
            const data = ctx.getImageData(0, 0, c.width, c.height).data;
            return data.some(v => v !== 0); // not entirely blank/transparent
        }, { timeout: 5000 });

        const before = await page.evaluate(() => {
            const c = document.getElementById('appearance-preview-canvas');
            return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
        });

        await page.fill('#tunic-hue-slider', '220');
        await page.evaluate(() => window.updateAppearancePreview());

        const after = await page.evaluate(() => {
            const c = document.getElementById('appearance-preview-canvas');
            return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
        });

        expect(before.join(',')).not.toBe(after.join(','));
    });

    test('changing race/gender selects a different base sprite for the preview without erroring', async ({ page }) => {
        await page.selectOption('#race-select', 'elf');
        await page.selectOption('#gender-select', 'female');
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.evaluate(() => window.updateAppearancePreview());
        await page.waitForTimeout(200);
        expect(errors).toEqual([]);
    });

    test('the chosen hue is applied to the created character\'s tintHue, not the name-derived default', async ({ page }) => {
        await page.fill('#character-name', 'HueTestChar');
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');
        await page.selectOption('#class-select', 'fighter');
        await page.selectOption('#campaign-select', '2');
        await page.fill('#tunic-hue-slider', '220');
        await page.dispatchEvent('#tunic-hue-slider', 'input');

        await page.click('#createCharacterButton');
        await page.waitForSelector('#character-screen-modal', { state: 'visible' });
        await page.click('#character-screen-modal .close-btn');
        await page.waitForFunction(() => window.entities && window.entities.length > 0);

        const result = await page.evaluate(() => {
            const ent = window.entities.find(e => e.name === window.party[0].name);
            return { partyHue: window.party[0].tintHue, entityHue: ent && ent.tintHue };
        });
        expect(result.partyHue).toBe(220);
        expect(result.entityHue).toBe(220);
    });
});
