const { test, expect } = require('@playwright/test');

test.describe('character creator randomizers', () => {
    test('fresh load starts from a randomized appearance instead of the old fixed defaults', async ({ page }) => {
        // A deterministic high random value makes the initial reroll observable
        // without relying on probabilistic "different from default" assertions.
        await page.addInitScript(() => {
            Math.random = () => 0.999;
        });
        await page.goto('/');
        await page.waitForSelector('#race-select', { state:'visible' });

        await expect(page.locator('#randomize-name-btn')).toBeVisible();
        await expect(page.locator('#randomize-appearance-btn')).toBeVisible();
        await expect(page.locator('#shirt-hue-slider')).toHaveValue('359');
        await expect(page.locator('#pants-hue-slider')).toHaveValue('359');
        await expect(page.locator('#hair-hue-slider')).toHaveValue('359');
        await expect(page.locator('#hair-style-select')).toHaveValue('curly');
        await expect(page.locator('#body-type-select')).toHaveValue('broad');
        await expect(page.locator('#skin-tone-slider')).toHaveValue('100');
        await expect(page.locator('#fantasy-skin-check')).not.toBeChecked();
    });

    test('appearance reroll preserves Fantasy colour and randomizes the active skin control', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#randomize-appearance-btn', { state:'visible' });

        const natural = await page.evaluate(() => {
            const values = [0, 0.25, 0.5, 0.75, 0.999, 0.42];
            let i = 0;
            const original = Math.random;
            Math.random = () => values[i++] ?? 0;
            document.getElementById('fantasy-skin-check').checked = false;
            window.randomizeCharacterAppearance({ sync:false });
            Math.random = original;
            return {
                fantasy: document.getElementById('fantasy-skin-check').checked,
                shirt: document.getElementById('shirt-hue-slider').value,
                pants: document.getElementById('pants-hue-slider').value,
                hair: document.getElementById('hair-hue-slider').value,
                hairStyle: document.getElementById('hair-style-select').value,
                bodyType: document.getElementById('body-type-select').value,
                skinTone: document.getElementById('skin-tone-slider').value,
            };
        });
        expect(natural).toEqual({
            fantasy:false,
            shirt:'0',
            pants:'90',
            hair:'180',
            hairStyle:'curly',
            bodyType:'broad',
            skinTone:'42',
        });

        const fantasy = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0.9;
            const check = document.getElementById('fantasy-skin-check');
            check.checked = true;
            const naturalBefore = document.getElementById('skin-tone-slider').value;
            window.randomizeCharacterAppearance({ sync:false });
            Math.random = original;
            return {
                fantasy:check.checked,
                naturalBefore,
                naturalAfter:document.getElementById('skin-tone-slider').value,
                fantasyHue:document.getElementById('skin-hue-slider').value,
            };
        });
        expect(fantasy.fantasy).toBe(true);
        expect(fantasy.naturalAfter).toBe(fantasy.naturalBefore);
        expect(fantasy.fantasyHue).toBe('324');
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
