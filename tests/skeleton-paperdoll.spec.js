// tests/skeleton-paperdoll.spec.js
// Skeletons now render through the same CHAR_CONFIG paperdoll system player
// characters and revenants use (skeletonBase.svg, a real limbed body) rather
// than the old flat single-image sprite — so whatever they're equipped with
// (assignRandomEquipment, monsters.js) actually layers on visibly.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Skeleton paperdoll rendering', () => {
    test('createMonster sets race/gender on a skeleton so it qualifies for CHAR_CONFIG rendering', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const s = window.createMonster('skeleton', { q: 0, r: 0 }, null, null, 'enemy');
            return {
                race: s.race,
                gender: s.gender,
                hasConfig: !!window.CHAR_CONFIG?.[`${s.race}_${s.gender}`],
                customImage: s.customImage,
            };
        });
        expect(result.race).toBe('skeleton');
        expect(['male', 'female']).toContain(result.gender);
        expect(result.customImage).toBeUndefined();
    });

    test('skeletonBase art asset is wired into gameVisuals', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            return { src: window.gameVisuals.skeletonBase?.src || '' };
        });
        expect(result.src).toContain('skeletonBase.svg');
    });

    test('an equipped skeleton still applies its weapon skill normally (paperdoll change is visual-only)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const s = window.createMonster('skeleton', { q: 0, r: 0 }, { health: 2, sword_hit: 1 }, ['sword'], 'enemy');
            return { equippedWeapon: s.equipped?.weapon, skillRank: s.skills?.sword_hit };
        });
        expect(result.equippedWeapon).toBe('sword');
        expect(result.skillRank).toBe(1);
    });
});
