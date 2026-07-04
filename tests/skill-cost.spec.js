const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('skill purchase cost', () => {
    test('every rank of a skill costs a flat 1 point, not an escalating currentRanks+1', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.player.attributes.strength = 3;
            window.player.skills.meleeDamage = 0;
            window.learnSkill('meleeDamage');
            const afterRank1 = { ranks: window.player.skills.meleeDamage, points: window.player.attributes.strength };
            window.learnSkill('meleeDamage');
            const afterRank2 = { ranks: window.player.skills.meleeDamage, points: window.player.attributes.strength };
            window.learnSkill('meleeDamage');
            const afterRank3 = { ranks: window.player.skills.meleeDamage, points: window.player.attributes.strength };
            return { afterRank1, afterRank2, afterRank3 };
        });
        expect(result.afterRank1).toEqual({ ranks: 1, points: 2 });
        expect(result.afterRank2).toEqual({ ranks: 2, points: 1 });
        expect(result.afterRank3).toEqual({ ranks: 3, points: 0 });
    });
});
