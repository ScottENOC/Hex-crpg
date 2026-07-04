const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('goblin alliance: gifting into the camp and letting them stay', () => {
    test('the "stay" option is hidden until the chief has been gifted', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            window.npcDialogueTrees.chief_skarnub(chief);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes("don't have to leave"))).toBe(false);
    });

    test('bribing (gifting) the chief flags giftedIn and unlocks the stay option', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.party[0].skills = { ...(window.party[0].skills || {}), insight: 3 };
            window.party[0].gold = 100;
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            window.npcDialogueTrees.chief_skarnub(chief);
        });
        await clickDialogueOption(page, "Try to read him");
        await clickDialogueOption(page, "Offer");
        const giftedIn = await page.evaluate(() => window.entities.find(e => e.name === 'Chief Skarnub').giftedIn);
        expect(giftedIn).toBe(true);

        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            window.npcDialogueTrees.chief_skarnub(chief);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes("don't have to leave"))).toBe(true);
    });

    test('choosing "stay" resolves goblin_threat as goblin_alliance with the expected reputation swings', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => ({
            kingdom: window.factions.silverhart_kingdom.standing,
            goblin: window.factions.goblin_tribe.standing,
        }));
        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            chief.giftedIn = true;
            window.npcDialogueTrees.chief_skarnub(chief);
        });
        await clickDialogueOption(page, "You don't have to leave");
        const after = await page.evaluate(() => ({
            resolution: (window.questLog || []).find(q => q.id === 'goblin_threat')?.resolution,
            status: (window.questLog || []).find(q => q.id === 'goblin_threat')?.status,
            kingdom: window.factions.silverhart_kingdom.standing,
            goblin: window.factions.goblin_tribe.standing,
        }));
        expect(after.resolution).toBe('goblin_alliance');
        expect(after.status).toBe('completed');
        expect(after.kingdom).toBeLessThan(before.kingdom);
        expect(after.goblin).toBeGreaterThan(before.goblin);
    });

    test('after the alliance, the chief offers the mine-raid favor as a real quest, and completing it reuses raid_mine\'s consequences', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            chief.giftedIn = true;
            window.npcDialogueTrees.chief_skarnub(chief);
        });
        await clickDialogueOption(page, "You don't have to leave");

        // Talking to the chief again should now offer the mine-raid favor.
        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            window.npcDialogueTrees.chief_skarnub(chief);
        });
        await clickDialogueOption(page, "I'll help you raid it");
        const quest = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'goblin_mine_raid'));
        expect(quest.status).toBe('active');

        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            window.npcDialogueTrees.chief_skarnub(chief);
        });
        await clickDialogueOption(page, "Lead the raid now");
        const result = await page.evaluate(() => ({
            questStatus: (window.questLog || []).find(q => q.id === 'goblin_mine_raid')?.status,
            emberlodeRaided: window.emberlodeRaided,
        }));
        expect(result.questStatus).toBe('completed');
        expect(result.emberlodeRaided).toBe(true);
    });

    test('the alliance resolution is never treated as "safe" by Emberlode dialogue while the mine is still unraided', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'completed', description: '', resolution: 'goblin_alliance' });
            const corran = window.entities.find(e => e.name === 'Corran Vale');
            window.npcDialogueTrees.corran_vale(corran);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.message.toLowerCase()).toContain('road');
        expect(dialogue.options.some(o => o.includes("I'll see it there safely"))).toBe(false);
    });
});
