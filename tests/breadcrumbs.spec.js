// tests/breadcrumbs.spec.js
// Orc-borderlands plotline breadcrumbs: flavor-only dialogue lines seeded in
// and around the village, well before any quest exists for them. Verifies
// they exist and mention the thread — nothing mechanical to check yet.
const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue, clickDialogueOption } = require('./helpers');

test.describe('orc-borderlands breadcrumbs', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('Yvette Marlow (background patron) worries about her son fighting orc raiders', async ({ page }) => {
        await page.evaluate(() => {
            const yvette = window.entities.find(e => e.name === 'Yvette Marlow');
            window.npcDialogueTrees.yvette_marlow(yvette);
        });
        const first = await readDialogue(page);
        expect(first.message.toLowerCase()).toContain('orc raiders');

        await clickDialogueOption(page, 'Have you heard from him');
        const followUp = await readDialogue(page);
        expect(followUp.message.toLowerCase()).toContain('worse');
    });

    test('Mira and Oskar both have an optional line about the borderlands raids', async ({ page }) => {
        const mira = await page.evaluate(() => {
            window.npcDialogueTrees.mira_ashbrook(window.entities.find(e => e.name === 'Mira Ashbrook'));
        }).then(() => readDialogue(page));
        await clickDialogueOption(page, 'Any news from further out');
        const miraFollowUp = await readDialogue(page);
        expect(miraFollowUp.message.toLowerCase()).toContain('orc raiders');

        await page.evaluate(() => {
            window.npcDialogueTrees.oskar_vinn(window.entities.find(e => e.name === 'Oskar Vinn'));
        });
        await clickDialogueOption(page, 'Heard anything worth knowing');
        const oskarFollowUp = await readDialogue(page);
        expect(oskarFollowUp.message.toLowerCase()).toContain('orc raiders');
    });
});
