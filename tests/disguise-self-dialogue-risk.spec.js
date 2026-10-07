const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Disguise Self dialogue discovery', () => {
    test('royal guard escorts reduce suspicion but do not make a queen impersonation safe', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.party[0];
            player.disguiseSelf = {
                spell: 'disguise_self',
                targetName: 'Queen Seraphine Corrin',
                targetTitle: 'Queen of the Silverhart Kingdom',
                targetFactionId: 'silverhart_kingdom',
                appearance: { gender: 'female', bodyType: 'average', hairStyle: 'brown_1', hairHue: 25, hairSaturation: 70, hairValue: 55, skinToneSlider: 45 }
            };
            const npc = { name: 'Palace Steward', title: 'Chamberlain', factionId: 'silverhart_kingdom' };
            const alone = window.disguiseDialogueSystem.suspicionScore(npc, player.disguiseSelf);
            window.party.push({ name: 'Royal Guard Denna', title: 'Royal Guard', equipped: { heavy_armor: 'heavy_armor', sword: 'sword' } });
            const escorted = window.disguiseDialogueSystem.suspicionScore(npc, player.disguiseSelf);
            return { alone, escorted };
        });
        expect(result.alone).toBeGreaterThan(result.escorted);
        expect(result.escorted).toBeGreaterThan(0);
    });

    test('the real impersonated target creates an immediate high-risk encounter', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.party[0];
            player.disguiseSelf = {
                spell: 'disguise_self',
                targetName: 'Queen Seraphine Corrin',
                targetTitle: 'Queen of the Silverhart Kingdom',
                targetFactionId: 'silverhart_kingdom',
                appearance: {}
            };
            window.entities.push({
                name: 'Queen Seraphine Corrin',
                title: 'Queen of the Silverhart Kingdom',
                factionId: 'silverhart_kingdom',
                alive: true
            });
            const npc = { name: 'Palace Steward', title: 'Chamberlain', factionId: 'silverhart_kingdom' };
            return window.disguiseDialogueSystem.suspicionScore(npc, player.disguiseSelf);
        });
        expect(result).toBeGreaterThanOrEqual(80);
    });
});
