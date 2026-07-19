const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

// The Baron and Ironbond's Guildmaster each spy on the other via
// spy_on_guild / spy_on_baron (campaign2Dialogue.js). Once one of those is
// active, the OTHER side confronts the player with the double-cross offer:
// keep pretending to work for your original employer, but feed us info too.
test.describe('double cross quests', () => {
    test('while spying for the Baron, Petra Voss confronts the player and offers to flip them', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({
                id: 'spy_on_guild', title: 'Eyes on the Guildhouse', giver: 'Baron Corwin Aldervale', status: 'active',
                description: 'test'
            });
            const guildmaster = window.entities.find(e => e.name === 'Petra Voss' || e.name === 'Guildmaster Petra Voss');
            window.npcDialogueTrees.reddale_guildmaster(guildmaster);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('man on the inside'))).toBe(true);
    });

    test('accepting the double cross undoes Ironbond\'s damage and trashes the kingdom\'s standing on turn-in', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.ironbond_company.standing = -30;
            (window.questLog = window.questLog || []).push({
                id: 'spy_on_guild', title: 'Eyes on the Guildhouse', giver: 'Baron Corwin Aldervale', status: 'active',
                description: 'test'
            });
            const guildmaster = window.entities.find(e => e.name === 'Petra Voss' || e.name === 'Guildmaster Petra Voss');
            window.npcDialogueTrees.reddale_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, 'man on the inside');

        const result = await page.evaluate(() => {
            window.player.inventory.push('guild_ledger_evidence');
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.npcDialogueTrees.reddale_baron(baron);
            return true;
        });
        expect(result).toBe(true);
        await clickDialogueOption(page, 'Give evidence');
        const after = await page.evaluate(() => ({
            ironbond: window.factions.ironbond_company.standing,
            kingdom: window.factions.silverhart_kingdom.standing,
            quest: (window.questLog || []).find(q => q.id === 'spy_on_guild')?.status,
        }));
        expect(after.quest).toBe('completed');
        expect(after.ironbond).toBe(0);
        expect(after.kingdom).toBe(-40);
    });

    test('declining the double cross leaves the harsher standing hit on turn-in', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({
                id: 'spy_on_guild', title: 'Eyes on the Guildhouse', giver: 'Baron Corwin Aldervale', status: 'active',
                description: 'test'
            });
            const guildmaster = window.entities.find(e => e.name === 'Petra Voss' || e.name === 'Guildmaster Petra Voss');
            window.npcDialogueTrees.reddale_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "wrong about me");

        const quest = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'spy_on_guild'));
        expect(quest.doubleCrossDeclined).toBe(true);
        expect(quest.doubleAgentFor).toBeUndefined();
    });

    test('while spying for Ironbond, the Baron confronts the player with the mirrored offer', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({
                id: 'spy_on_baron', title: 'A Look at the Ledgers', giver: 'Guildmaster Petra Voss', status: 'active',
                description: 'test'
            });
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.npcDialogueTrees.reddale_baron(baron);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('man on the inside'))).toBe(true);
    });

    test('the double cross offer only fires once per quest', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({
                id: 'spy_on_guild', title: 'Eyes on the Guildhouse', giver: 'Baron Corwin Aldervale', status: 'active',
                description: 'test'
            });
        });
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.name === 'Petra Voss' || e.name === 'Guildmaster Petra Voss');
            window.npcDialogueTrees.reddale_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "wrong about me");

        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.name === 'Petra Voss' || e.name === 'Guildmaster Petra Voss');
            window.npcDialogueTrees.reddale_guildmaster(guildmaster);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('man on the inside'))).toBe(false);
    });
});
