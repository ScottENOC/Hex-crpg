// tests/skeleton-paperdoll.spec.js
// Skeletons render as equipped humanoids rather than a flat custom image.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Skeleton paperdoll rendering', () => {
    test('createMonster sets race/gender on a skeleton so it qualifies for humanoid rendering', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const s = window.createMonster('skeleton', { q: 0, r: 0 }, null, null, 'enemy');
            return {
                race: s.race,
                gender: s.gender,
                customImage: s.customImage,
            };
        });
        expect(result.race).toBe('skeleton');
        expect(['male', 'female']).toContain(result.gender);
        expect(result.customImage).toBeUndefined();
    });

    test('skeleton base art asset is wired into gameVisuals and eventually loads', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => {
            const img = window.gameVisuals?.skeletonBase;
            return !!img && img.complete && img.naturalWidth > 0;
        }, null, { timeout: 5000 });
        const result = await page.evaluate(() => ({
            src: window.gameVisuals.skeletonBase.src,
            naturalWidth: window.gameVisuals.skeletonBase.naturalWidth,
        }));
        expect(result.src).toContain('images/characters/creatures/skeleton_base.svg');
        expect(result.naturalWidth).toBeGreaterThan(0);
    });

    test('an equipped skeleton still applies its weapon skill normally', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const s = window.createMonster('skeleton', { q: 0, r: 0 }, { health: 2, sword_hit: 1 }, ['sword'], 'enemy');
            return { equippedWeapon: s.equipped?.weapon, skillRank: s.skills?.sword_hit };
        });
        expect(result.equippedWeapon).toBe('sword');
        expect(result.skillRank).toBe(1);
    });
});