// tests/character-creator.spec.js
// Character creation now owns body/hair/skin appearance only. Clothing colour
// and garment selection live in the inventory/clothing systems after creation.
const { test, expect } = require('@playwright/test');

const APPEARANCE_SLIDERS = ['hair-hue-slider', 'skin-tone-slider'];

test.describe('character creator appearance controls', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#race-select', { state: 'visible' });
    });

    test('appearance controls and preview canvas exist with sensible ranges', async ({ page }) => {
        await expect(page.locator('#appearance-preview-canvas')).toBeAttached();

        const hair = page.locator('#hair-hue-slider');
        expect(await hair.getAttribute('min')).toBe('0');
        expect(await hair.getAttribute('max')).toBe('359');

        const skin = page.locator('#skin-tone-slider');
        expect(await skin.getAttribute('min')).toBe('0');
        expect(await skin.getAttribute('max')).toBe('100');

        await expect(page.locator('#fantasy-skin-check')).toBeAttached();
        await expect(page.locator('#fantasy-skin-controls')).toBeHidden();
        await expect(page.locator('#skin-hue-slider')).toBeAttached();
        await expect(page.locator('#hair-style-select')).toBeAttached();
        await expect(page.locator('#body-type-select')).toBeAttached();
        await expect(page.locator('#shirt-hue-slider')).toHaveCount(0);
        await expect(page.locator('#pants-hue-slider')).toHaveCount(0);
    });

    test('moving the hair slider changes the preview', async ({ page }) => {
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

    test('changing race and gender redraws the preview without erroring', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.selectOption('#race-select', 'elf');
        await page.selectOption('#gender-select', 'female');
        await page.evaluate(() => window.updateAppearancePreview());
        await page.waitForTimeout(200);
        expect(errors).toEqual([]);
    });

    test('chosen hair and skin values are applied to the created character', async ({ page }) => {
        await page.fill('#character-name', 'HueTestChar');
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');
        await page.selectOption('#class-select', 'fighter');
        await page.selectOption('#campaign-select', '2');
        await page.fill('#hair-hue-slider', '300');
        await page.fill('#skin-tone-slider', '60');
        for (const id of APPEARANCE_SLIDERS) await page.dispatchEvent(`#${id}`, 'input');

        await page.click('#createCharacterButton');
        await page.waitForSelector('#character-screen-modal', { state: 'visible' });
        await page.click('#character-screen-modal .close-btn');
        await page.waitForFunction(() => window.entities && window.entities.length > 0);

        const result = await page.evaluate(() => {
            const ent = window.entities.find(e => e.name === window.party[0].name);
            return {
                party: { hair: window.party[0].hairHue, skin: window.party[0].skinHue },
                entity: ent && { hair: ent.hairHue, skin: ent.skinHue },
            };
        });
        const expected = await page.evaluate(() => window.naturalSkinToneFromSlider(60));
        expect(result.party).toEqual({ hair: 300, skin: expected.hue });
        expect(result.entity).toEqual({ hair: 300, skin: expected.hue });
    });

    test('natural tones are the default and fantasy mode retains the full hue wheel', async ({ page }) => {
        const natural = await page.evaluate(() => {
            const light = window.naturalSkinToneFromSlider(0);
            const middle = window.naturalSkinToneFromSlider(50);
            const dark = window.naturalSkinToneFromSlider(100);
            return { light, middle, dark, selected:window.getPlayerSkinToneFromControls() };
        });
        expect(natural.light.lightness).toBeGreaterThan(natural.middle.lightness);
        expect(natural.middle.lightness).toBeGreaterThan(natural.dark.lightness);
        expect(natural.selected.hue).toBeGreaterThanOrEqual(16);
        expect(natural.selected.hue).toBeLessThanOrEqual(30);

        await page.check('#fantasy-skin-check');
        await page.fill('#skin-hue-slider', '220');
        const fantasy = await page.evaluate(() => window.getPlayerSkinToneFromControls());
        expect(fantasy).toEqual({ hue:220 });
        await expect(page.locator('#fantasy-skin-controls')).toBeVisible();
    });
});
