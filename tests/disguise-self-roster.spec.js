const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Disguise Self encountered-character roster', () => {
    test('records a humanoid character and returns their appearance profile', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const npc = {
                name: 'Test Guard',
                race: 'human',
                gender: 'male',
                bodyType: 'broad',
                hairStyle: 'brown_1',
                hairHue: 210,
                hairSaturation: 65,
                hairValue: 50,
                skinToneSlider: 30,
                equipped: { armor: 'test_armor' }
            };
            window.recordDisguiseSelfEncounter(npc);
            return {
                names: window.getDisguiseSelfKnownCharacters(window.player).map(x => x.name),
                profile: window.getDisguiseSelfProfile('Test Guard', window.player)
            };
        });
        expect(result.names).toContain('Test Guard');
        expect(result.profile.appearance.gender).toBe('male');
        expect(result.profile.appearance.bodyType).toBe('broad');
        expect(result.profile.appearance.hairHue).toBe(210);
        expect(result.profile.visualEquipment.armor).toBe('test_armor');
    });

    test('does not add creatures to the humanoid disguise roster', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.recordDisguiseSelfEncounter({
                name: 'Test Wolf',
                race: 'wolf',
                tags: ['animal'],
                bodyType: 'average'
            });
            return window.getDisguiseSelfKnownCharacters(window.player).some(x => x.name === 'Test Wolf');
        });
        expect(result).toBe(false);
    });
});
