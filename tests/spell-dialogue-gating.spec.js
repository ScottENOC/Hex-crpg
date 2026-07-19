const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('spells gating dialogue choices (hasSpellUnlocked)', () => {
    test('hasSpellUnlocked reads unlockedBaseSpells, not createdSpells', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const fake = { unlockedBaseSpells: ['firebolt'], createdSpells: [] };
            const withoutIt = window.hasSpellUnlocked(fake, 'heal');
            const withIt = window.hasSpellUnlocked(fake, 'firebolt');
            const missingArrayIsSafe = window.hasSpellUnlocked({}, 'heal');
            return { withoutIt, withIt, missingArrayIsSafe };
        });
        expect(result.withoutIt).toBe(false);
        expect(result.withIt).toBe(true);
        expect(result.missingArrayIsSafe).toBe(false);
    });

    test('without Knowledge: Religion or Smite Evil, the disciple reads as an ordinary herbalist', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const disciple = window.entities.find(e => e.name === 'Mirella Thorn');
            window.npcDialogueTrees.reddale_disciple(disciple);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('unsettles') || o.includes('Look closer'))).toBe(false);
    });

    test('knowing Smite Evil (no Knowledge: Religion) is an independent way to flag her as suspected', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.party[0].unlockedBaseSpells = [...(window.party[0].unlockedBaseSpells || []), 'smite_evil'];
            const disciple = window.entities.find(e => e.name === 'Mirella Thorn');
            window.npcDialogueTrees.reddale_disciple(disciple);
        });
        await clickDialogueOption(page, 'unsettles');
        const suspected = await page.evaluate(() => window.discipleSuspected);
        expect(suspected).toBe(true);
    });
});
