// tests/sprite-recolor.spec.js
// The old baked-in shirt/pants recolouring path is retired. Keep the small
// deterministic palette helpers that are still used for body/hair/skin variety;
// current clothing rendering has its own explicit garment-layer tests.
const { test, expect } = require('@playwright/test');

test.describe('appearance colour helpers', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof window.hashStringToHue === 'function' &&
            typeof window.pickHairPreset === 'function' &&
            typeof window.pickClothingHue === 'function' &&
            typeof window.pickNaturalSkinTone === 'function'
        );
    });

    test('hashStringToHue is deterministic and remains in range', async ({ page }) => {
        const result = await page.evaluate(() => ({
            sameTwice: window.hashStringToHue('Alice') === window.hashStringToHue('Alice'),
            differsAcrossNames: new Set(['Alice', 'Bob', 'Carol', 'Dave'].map(n => window.hashStringToHue(n))).size,
            inRange: ['A','B','C','D','Zzz'].every(n => {
                const h = window.hashStringToHue(n);
                return h >= 0 && h < 360;
            }),
        }));
        expect(result.sameTwice).toBe(true);
        expect(result.differsAcrossNames).toBeGreaterThan(1);
        expect(result.inRange).toBe(true);
    });

    test('hair and clothing palette helpers are deterministic and use natural palettes', async ({ page }) => {
        const result = await page.evaluate(() => {
            const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi'];
            const hairHues = names.map(n => window.pickHairPreset(`${n}_hair`).hue);
            const clothingHues = names.map(n => window.pickClothingHue(`${n}_shirt`));
            return {
                hairSame: window.pickHairPreset('Alice_hair').hue === window.pickHairPreset('Alice_hair').hue,
                clothingSame: window.pickClothingHue('Alice_shirt') === window.pickClothingHue('Alice_shirt'),
                hairAllValid: hairHues.every(h => [25, 45, 30, 12].includes(h)),
                clothingAllValid: clothingHues.every(h => [25, 40, 95, 150, 210, 350, 45].includes(h)),
            };
        });
        expect(result.hairSame).toBe(true);
        expect(result.clothingSame).toBe(true);
        expect(result.hairAllValid).toBe(true);
        expect(result.clothingAllValid).toBe(true);
    });

    test('NPC skin presets are deterministic natural pigments', async ({ page }) => {
        const result = await page.evaluate(() => {
            const tones = ['A','B','C','D','E','F','G','H'].map(n => window.pickNaturalSkinTone(n));
            return { tones, repeated:window.pickNaturalSkinTone('A') };
        });
        expect(result.tones[0]).toEqual(result.repeated);
        for (const tone of result.tones) {
            expect(tone.hue).toBeGreaterThanOrEqual(15);
            expect(tone.hue).toBeLessThanOrEqual(30);
            expect(tone.saturation).toBeGreaterThan(0);
            expect(tone.lightness).toBeGreaterThan(0.2);
        }
    });
});
