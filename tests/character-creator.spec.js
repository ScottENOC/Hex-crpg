// tests/character-creator.spec.js
// Shirt/pants/hair/skin color sliders on the character creator (see
// spriteRecolor.js): let the player pick their own appearance before
// starting, without touching race/gender/shape. The preview canvas is
// self-contained (doesn't depend on window.gameVisuals/CHAR_CONFIG, which
// don't exist until after game start).
const { test, expect } = require('@playwright/test');

const SLIDER_IDS = ['shirt-hue-slider', 'pants-hue-slider', 'hair-hue-slider', 'skin-hue-slider'];

test.describe('character creator appearance sliders', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#race-select', { state: 'visible' });
    });

    test('all four sliders and the preview canvas exist with sensible ranges', async ({ page }) => {
        const canvas = page.locator('#appearance-preview-canvas');
        await expect(canvas).toBeAttached();
        for (const id of SLIDER_IDS) {
            const slider = page.locator(`#${id}`);
            await expect(slider).toBeAttached();
            const min = parseInt(await slider.getAttribute('min'), 10);
            const max = parseInt(await slider.getAttribute('max'), 10);
            expect(min).toBeGreaterThanOrEqual(0);
            expect(max).toBeLessThanOrEqual(359);
            expect(max).toBeGreaterThan(min);
        }
        // Skin tone is deliberately kept to a believable tan/brown range,
        // not the full hue wheel clothing/hair get.
        expect(await page.locator('#skin-hue-slider').getAttribute('min')).toBe('5');
        expect(await page.locator('#skin-hue-slider').getAttribute('max')).toBe('45');
    });

    test('moving the shirt slider redraws the preview with different pixels', async ({ page }) => {
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');
        await page.fill('#shirt-hue-slider', '30');
        await page.evaluate(() => window.updateAppearancePreview());
        await page.waitForFunction(() => {
            const c = document.getElementById('appearance-preview-canvas');
            const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            return data.some(v => v !== 0); // not entirely blank/transparent
        }, { timeout: 5000 });

        const before = await page.evaluate(() => {
            const c = document.getElementById('appearance-preview-canvas');
            return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
        });

        await page.fill('#shirt-hue-slider', '220');
        await page.evaluate(() => window.updateAppearancePreview());

        const after = await page.evaluate(() => {
            const c = document.getElementById('appearance-preview-canvas');
            return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
        });
        expect(before.join(',')).not.toBe(after.join(','));
    });

    test('moving the hair slider alone also changes the preview (the hair overlay is drawn and recolored)', async ({ page }) => {
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');
        await page.evaluate(() => window.updateAppearancePreview());
        await page.waitForFunction(() => {
            const c = document.getElementById('appearance-preview-canvas');
            const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            return data.some(v => v !== 0);
        }, { timeout: 5000 });

        const before = await page.evaluate(() => {
            const c = document.getElementById('appearance-preview-canvas');
            return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
        });

        await page.fill('#hair-hue-slider', '300');
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

    test('all four chosen hues are applied to the created character, not the name-derived defaults', async ({ page }) => {
        await page.fill('#character-name', 'HueTestChar');
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');
        await page.selectOption('#class-select', 'fighter');
        await page.selectOption('#campaign-select', '2');
        await page.fill('#shirt-hue-slider', '220');
        await page.fill('#pants-hue-slider', '10');
        await page.fill('#hair-hue-slider', '300');
        await page.fill('#skin-hue-slider', '15');
        for (const id of SLIDER_IDS) await page.dispatchEvent(`#${id}`, 'input');

        await page.click('#createCharacterButton');
        await page.waitForSelector('#character-screen-modal', { state: 'visible' });
        await page.click('#character-screen-modal .close-btn');
        await page.waitForFunction(() => window.entities && window.entities.length > 0);

        const result = await page.evaluate(() => {
            const ent = window.entities.find(e => e.name === window.party[0].name);
            return {
                party: { shirt: window.party[0].shirtHue, pants: window.party[0].pantsHue, hair: window.party[0].hairHue, skin: window.party[0].skinHue },
                entity: ent && { shirt: ent.shirtHue, pants: ent.pantsHue, hair: ent.hairHue, skin: ent.skinHue },
            };
        });
        expect(result.party).toEqual({ shirt: 220, pants: 10, hair: 300, skin: 15 });
        expect(result.entity).toEqual({ shirt: 220, pants: 10, hair: 300, skin: 15 });
    });
});
