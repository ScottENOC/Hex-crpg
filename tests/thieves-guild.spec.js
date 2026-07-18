const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue, clickDialogueOption } = require('./helpers.js');

test.describe("Silverhart's Thieves' Guild + reputation track", () => {
    test('the faction exists, seeds flat, and the Guildmaster + Fence are placed', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            const fence = window.entities.find(e => e.dialogueId === 'thieves_guild_fence');
            const evidence = Object.values(window.tileObjects).find(o => o.evidenceKey === 'guild_initiation_prize');
            return {
                faction: window.factions.thieves_guild,
                guildmasterPlaced: !!guildmaster,
                fencePlaced: !!fence,
                evidencePlaced: !!evidence,
            };
        });
        expect(result.faction.race).toBe(null);
        expect(result.faction.standing).toBe(0);
        expect(result.guildmasterPlaced).toBe(true);
        expect(result.fencePlaced).toBe(true);
        expect(result.evidencePlaced).toBe(true);
    });

    test('hostile standing refuses both the Fence and the Guildmaster', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = -10;
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        let dialogue = await readDialogue(page);
        expect(dialogue.options).toEqual(['...']);
        await page.evaluate(() => {
            const fence = window.entities.find(e => e.dialogueId === 'thieves_guild_fence');
            window.npcDialogueTrees.thieves_guild_fence(fence);
        });
        dialogue = await readDialogue(page);
        expect(dialogue.options).toEqual(['...']);
    });

    test('below 20 standing the Fence refuses to trade and the Guildmaster offers Initiation', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            const fence = window.entities.find(e => e.dialogueId === 'thieves_guild_fence');
            window.npcDialogueTrees.thieves_guild_fence(fence);
        });
        const fenceDialogue = await readDialogue(page);
        expect(fenceDialogue.options.some(o => o.toLowerCase().includes('show me'))).toBe(false);

        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        const gmDialogue = await readDialogue(page);
        expect(gmDialogue.options.some(o => o.includes("I'll do it"))).toBe(true);
    });

    test('accepting Initiation starts the stealth mission and it can be completed to raise standing', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll do it.");
        const afterAccept = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'guild_initiation'),
            mission: window.activeStealthMission,
        }));
        expect(afterAccept.quest.status).toBe('active');
        expect(afterAccept.mission.guardName).toBe('Perrin Vance');
        expect(afterAccept.mission.evidenceKey).toBe('guild_initiation_prize');

        const result = await page.evaluate(() => {
            const before = window.factions.thieves_guild.standing;
            const evidenceHex = Object.entries(window.tileObjects).find(([, o]) => o.evidenceKey === 'guild_initiation_prize')[0];
            const [q, r] = evidenceHex.split(',').map(Number);
            window.searchEvidence(q, r);
            return {
                after: window.factions.thieves_guild.standing,
                before,
                hasItem: window.player.inventory.includes('guild_initiation_prize'),
                questStatus: (window.questLog || []).find(q => q.id === 'guild_initiation')?.status,
                missionCleared: window.activeStealthMission === null,
            };
        });
        expect(result.hasItem).toBe(true);
        expect(result.missionCleared).toBe(true);
        expect(result.questStatus).toBe('completed');
        expect(result.after).toBeGreaterThan(result.before);
    });

    test('at 20+ standing the Fence sells the accepted stock, and 50+ unlocks the member stock', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => { window.factions.thieves_guild.standing = 25; });
        await page.evaluate(() => {
            const fence = window.entities.find(e => e.dialogueId === 'thieves_guild_fence');
            window.npcDialogueTrees.thieves_guild_fence(fence);
        });
        await clickDialogueOption(page, 'Show me what you');
        let shopItems = await page.evaluate(() => window.campaign2ThievesGuildFenceItems);
        expect(shopItems).toContain('dagger');

        await page.evaluate(() => { window.factions.thieves_guild.standing = 55; });
        await page.evaluate(() => {
            const fence = window.entities.find(e => e.dialogueId === 'thieves_guild_fence');
            window.npcDialogueTrees.thieves_guild_fence(fence);
        });
        const memberDialogue = await readDialogue(page);
        expect(memberDialogue.message).toContain('Corvin vouches for you now');
    });
});
