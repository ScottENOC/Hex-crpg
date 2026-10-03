const { test, expect } = require('@playwright/test');

test.describe('character creator randomizers', () => {
    test('fresh load randomizes the current appearance controls instead of obsolete clothing hues', async ({ page }) => {
        await page.addInitScript(() => {
            Math.random = () => 0.999;
        });
        await page.goto('/');
        await page.waitForSelector('#race-select', { state:'visible' });

        await expect(page.locator('#randomize-name-btn')).toBeVisible();
        await expect(page.locator('#randomize-appearance-btn')).toBeVisible();
        await expect(page.locator('#hair-hue-slider')).toHaveValue('359');
        expect(['curly','bald']).toContain(await page.locator('#hair-style-select').inputValue());
        await expect(page.locator('#body-type-select')).toHaveValue('average');
        await expect(page.locator('#skin-tone-slider')).toHaveValue('100');
        await expect(page.locator('#fantasy-skin-check')).not.toBeChecked();
        await expect(page.locator('#shirt-hue-slider')).toHaveCount(0);
        await expect(page.locator('#pants-hue-slider')).toHaveCount(0);
    });

    test('appearance reroll preserves natural/fantasy skin mode and randomizes only the active skin control', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#randomize-appearance-btn', { state:'visible' });

        const natural = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0.9;
            const check = document.getElementById('fantasy-skin-check');
            check.checked = false;
            document.getElementById('skin-tone-slider').value = '10';
            window.randomizeCharacterAppearance({ sync:false });
            Math.random = original;
            return {
                fantasy:check.checked,
                hair:Number(document.getElementById('hair-hue-slider').value),
                hairStyle:document.getElementById('hair-style-select').value,
                bodyType:document.getElementById('body-type-select').value,
                skinTone:Number(document.getElementById('skin-tone-slider').value),
            };
        });
        expect(natural.fantasy).toBe(false);
        expect(natural.hair).toBeGreaterThanOrEqual(0);
        expect(natural.hair).toBeLessThanOrEqual(359);
        expect(['brown_1','braid','curly','bald']).toContain(natural.hairStyle);
        expect(natural.bodyType).toBe('average');
        expect(natural.skinTone).toBeGreaterThanOrEqual(0);
        expect(natural.skinTone).toBeLessThanOrEqual(100);
        expect(natural.skinTone).not.toBe(10);

        const fantasy = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0.9;
            const check = document.getElementById('fantasy-skin-check');
            check.checked = true;
            document.getElementById('skin-tone-slider').value = '17';
            document.getElementById('skin-hue-slider').value = '10';
            window.randomizeCharacterAppearance({ sync:false });
            Math.random = original;
            return {
                fantasy:check.checked,
                naturalAfter:document.getElementById('skin-tone-slider').value,
                fantasyHue:document.getElementById('skin-hue-slider').value,
            };
        });
        expect(fantasy.fantasy).toBe(true);
        expect(fantasy.naturalAfter).toBe('17');
        expect(Number(fantasy.fantasyHue)).toBeGreaterThanOrEqual(0);
        expect(Number(fantasy.fantasyHue)).toBeLessThanOrEqual(359);
        expect(fantasy.fantasyHue).not.toBe('10');
    });

    test('random name button rerolls from the existing race/gender name pool', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#randomize-name-btn', { state:'visible' });
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');

        const first = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0;
            window.randomizeCharacterName();
            Math.random = original;
            return document.getElementById('character-name').value;
        });
        expect(first).toBe('Alden');

        const rerolled = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0.999;
            window.randomizeCharacterName();
            Math.random = original;
            return document.getElementById('character-name').value;
        });
        expect(rerolled).toBe('Tobias');
    });
});
