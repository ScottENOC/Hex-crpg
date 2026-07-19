// tests/class-levels-tracking.spec.js
// classLevels (characterCreation.js/ui.js): a total-per-class level counter
// (order not tracked) seeded at creation and incremented on every
// applyLevelUp, used for dialogue gating (e.g. "you have at least 1 Druid
// level") and for the planned respec system. Save-compatibility for
// pre-existing characters is not a concern — hasClassLevel just treats a
// missing/undefined classLevels as no levels in anything.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('classLevels tracking', () => {
    test('a fresh character starts with 1 level in their starting class', async ({ page }) => {
        await createCharacter(page, { cls: 'fighter' });
        await page.waitForTimeout(500);
        const classLevels = await page.evaluate(() => window.player.classLevels);
        expect(classLevels).toEqual({ fighter: 1 });
    });

    test('applyLevelUp increments the chosen class, leaving others untouched', async ({ page }) => {
        await createCharacter(page, { cls: 'fighter' });
        await page.waitForTimeout(500);

        const result = await page.evaluate(() => {
            window.player.exp = 100000;
            window.applyLevelUp(window.player, 'wizard');
            window.applyLevelUp(window.player, 'wizard');
            window.applyLevelUp(window.player, 'fighter');
            return window.player.classLevels;
        });
        expect(result).toEqual({ fighter: 2, wizard: 2 });
    });

    test('hasClassLevel reports true only once at least one level exists in that class', async ({ page }) => {
        await createCharacter(page, { cls: 'fighter' });
        await page.waitForTimeout(500);

        const before = await page.evaluate(() => window.hasClassLevel(window.player, 'druid'));
        expect(before).toBe(false);

        const after = await page.evaluate(() => {
            window.applyLevelUp(window.player, 'druid');
            return window.hasClassLevel(window.player, 'druid');
        });
        expect(after).toBe(true);

        const stillFighter = await page.evaluate(() => window.hasClassLevel(window.player, 'fighter'));
        expect(stillFighter).toBe(true);
    });

    test('hasClassLevel is false, not a throw, for a character with no classLevels history (pre-existing save compatibility)', async ({ page }) => {
        await createCharacter(page, { cls: 'fighter' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            delete window.player.classLevels;
            return window.hasClassLevel(window.player, 'fighter');
        });
        expect(result).toBe(false);
    });

    test('recruited companions also get classLevels seeded from their build class', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        const classLevels = await page.evaluate(() => {
            window.recruitFenn();
            const fenn = window.party.find(p => p.name === 'Fenn Oakheart');
            return fenn?.classLevels;
        });
        expect(classLevels).toEqual({ druid: 1 });
    });
});
