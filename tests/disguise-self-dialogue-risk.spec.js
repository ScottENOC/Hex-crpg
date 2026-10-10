const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue } = require('./helpers.js');

test.describe('Disguise Self dialogue risk integration', () => {
    test('a disguise challenge displays its dialogue instead of swallowing the interaction', async ({ page }) => {
        await createCharacter(page);

        await page.evaluate(() => {
            const player = window.party[0];
            player.disguiseSelf = {
                spell: 'disguise_self',
                targetName: 'Queen Seraphine Corrin',
                targetTitle: 'Queen of the Silverhart Kingdom',
                targetFactionId: 'silverhart_kingdom',
                appearance: { gender: 'female', bodyType: 'average' }
            };

            // Make the challenge deterministic: any positive suspicion score
            // triggers it, without making the test depend on probabilistic rolls.
            window.__originalMathRandomForDisguiseTest = Math.random;
            Math.random = () => 0;

            const npc = {
                name: 'Test Palace Steward',
                title: 'Chamberlain',
                factionId: 'silverhart_kingdom'
            };
            window.showDialogue(npc, 'Original dialogue should be intercepted.', [
                { label: 'Continue.', action: () => {} }
            ]);
        });

        const dialogue = await readDialogue(page);
        expect(dialogue.message).toContain('Disguise Self is real');
        expect(dialogue.options).toContain('Answer confidently.');
        expect(dialogue.options).toContain("Invoke Queen of the Silverhart Kingdom's authority.");
    });
});
