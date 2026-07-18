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

test.describe("Thieves' Guild: A Favor for the Guild (debt collection)", () => {
    async function completeInitiation(page) {
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll do it.");
        await page.evaluate(() => {
            const evidenceHex = Object.entries(window.tileObjects).find(([, o]) => o.evidenceKey === 'guild_initiation_prize')[0];
            const [q, r] = evidenceHex.split(',').map(Number);
            window.searchEvidence(q, r);
        });
    }

    test('the Guildmaster offers the favor quest only after Initiation is completed', async ({ page }) => {
        await createCharacter(page);
        await completeInitiation(page);
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes("I'll collect it"))).toBe(true);
    });

    test('threatening Marsh with the guild\'s name settles the debt and raises standing', async ({ page }) => {
        await createCharacter(page);
        await completeInitiation(page);
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll collect it");
        const before = await page.evaluate(() => ({ gold: window.party[0].gold || 0, standing: window.factions.thieves_guild.standing }));
        await page.evaluate(() => {
            const debtor = window.entities.find(e => e.name === 'Marsh Dobbins');
            window.npcDialogueTrees.thieves_guild_debtor(debtor);
        });
        await clickDialogueOption(page, 'Corvin Ashe sent me');
        await clickDialogueOption(page, 'Take the coin');
        const after = await page.evaluate(() => ({
            gold: window.party[0].gold || 0,
            standing: window.factions.thieves_guild.standing,
            questStatus: (window.questLog || []).find(q => q.id === 'guild_favor')?.status,
        }));
        expect(after.gold).toBeGreaterThan(before.gold);
        expect(after.standing).toBeGreaterThan(before.standing);
        expect(after.questStatus).toBe('completed');
    });

    test('killing Marsh instead still resolves the quest when reported to the Guildmaster', async ({ page }) => {
        await createCharacter(page);
        await completeInitiation(page);
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll collect it");
        await page.evaluate(() => {
            const debtor = window.entities.find(e => e.name === 'Marsh Dobbins');
            debtor.alive = false;
            debtor.hp = 0;
        });
        const result = await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
            return { questStatus: (window.questLog || []).find(q => q.id === 'guild_favor')?.status };
        });
        expect(result.questStatus).toBe('completed');
    });
});

test.describe("Thieves' Guild: Blood Price + The Big Score", () => {
    async function completeInitiation(page) {
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll do it.");
        await page.evaluate(() => {
            const evidenceHex = Object.entries(window.tileObjects).find(([, o]) => o.evidenceKey === 'guild_initiation_prize')[0];
            const [q, r] = evidenceHex.split(',').map(Number);
            window.searchEvidence(q, r);
        });
    }
    async function completeFavor(page) {
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll collect it");
        await page.evaluate(() => {
            const debtor = window.entities.find(e => e.name === 'Marsh Dobbins');
            debtor.alive = false;
            debtor.hp = 0;
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
    }

    test('Blood Price offers after Favor is done, and killing Silas resolves it with a Kingdom standing cost', async ({ page }) => {
        await createCharacter(page);
        await completeInitiation(page);
        await completeFavor(page);
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        const offerDialogue = await readDialogue(page);
        expect(offerDialogue.options.some(o => o.includes("I'll handle it"))).toBe(true);
        await clickDialogueOption(page, "I'll handle it");

        const before = await page.evaluate(() => ({
            kingdom: window.factions.silverhart_kingdom.standing,
            guild: window.factions.thieves_guild.standing,
        }));
        await page.evaluate(() => {
            const informant = window.entities.find(e => e.name === 'Silas Crane');
            informant.alive = false;
            informant.hp = 0;
        });
        const after = await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
            return {
                kingdom: window.factions.silverhart_kingdom.standing,
                guild: window.factions.thieves_guild.standing,
                questStatus: (window.questLog || []).find(q => q.id === 'guild_blood_price')?.status,
            };
        });
        expect(after.questStatus).toBe('completed');
        expect(after.guild).toBeGreaterThan(before.guild);
        expect(after.kingdom).toBeLessThan(before.kingdom);
    });

    test('The Big Score is only offered to full members (standing 50+), and completing it steals from the Chancellor', async ({ page }) => {
        await createCharacter(page);
        await completeInitiation(page);
        await completeFavor(page);
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll handle it");
        await page.evaluate(() => {
            const informant = window.entities.find(e => e.name === 'Silas Crane');
            informant.alive = false;
            informant.hp = 0;
            window.factions.thieves_guild.standing = 30; // below the 50 threshold
        });
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        const belowThreshold = await readDialogue(page);
        expect(belowThreshold.options.some(o => o.includes("I'm in"))).toBe(false);

        await page.evaluate(() => { window.factions.thieves_guild.standing = 55; });
        await page.evaluate(() => {
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        const offerDialogue = await readDialogue(page);
        expect(offerDialogue.options.some(o => o.includes("I'm in"))).toBe(true);
        await clickDialogueOption(page, "I'm in");

        const mission = await page.evaluate(() => window.activeStealthMission);
        expect(mission.guardName).toBe('Chancellor Merric Vane');
        expect(mission.evidenceKey).toBe('guild_big_score_prize');

        const before = await page.evaluate(() => ({ gold: window.party[0].gold || 0, standing: window.factions.thieves_guild.standing }));
        const after = await page.evaluate(() => {
            const evidenceHex = Object.entries(window.tileObjects).find(([, o]) => o.evidenceKey === 'guild_big_score_prize')[0];
            const [q, r] = evidenceHex.split(',').map(Number);
            window.searchEvidence(q, r);
            return {
                gold: window.party[0].gold || 0,
                standing: window.factions.thieves_guild.standing,
                questStatus: (window.questLog || []).find(q => q.id === 'guild_big_score')?.status,
            };
        });
        expect(after.gold).toBeGreaterThan(before.gold);
        expect(after.standing).toBeGreaterThan(before.standing);
        expect(after.questStatus).toBe('completed');
    });
});

test.describe("Thieves' Guild: presence outside the capital", () => {
    test('a guild fence is placed in Hollowmere, Emberlode, and Reddale, sharing the same reputation gating', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const names = ['Del Ashworth', 'Rennik Coalmarrow', 'Mira Selk'];
            return names.map(name => {
                const npc = window.entities.find(e => e.name === name);
                return { name, placed: !!npc, dialogueId: npc?.dialogueId, side: npc?.side };
            });
        });
        for (const r of result) {
            expect(r.placed).toBe(true);
            expect(r.dialogueId).toBe('thieves_guild_fence');
            expect(r.side).toBe('neutral');
        }
    });

    test('the Hollowmere fence refuses trade below standing 20, same as the capital fence', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            const npc = window.entities.find(e => e.name === 'Del Ashworth');
            window.npcDialogueTrees.thieves_guild_fence(npc);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.toLowerCase().includes('show me'))).toBe(false);

        await page.evaluate(() => { window.factions.thieves_guild.standing = 25; });
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Del Ashworth');
            window.npcDialogueTrees.thieves_guild_fence(npc);
        });
        const dialogue2 = await readDialogue(page);
        expect(dialogue2.options.some(o => o.toLowerCase().includes('show me'))).toBe(true);
    });
});

test.describe("Thieves' Guild: rogue-flavor dialogue", () => {
    test('getPartyMaxClassLevel reports the highest rogue level in the active party', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party[0].classLevels = { rogue: 4 };
            return window.getPartyMaxClassLevel('rogue');
        });
        expect(result).toBe(4);
    });

    test('the Fence recognizes a heavily rogue-trained party even below trading standing', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            window.party[0].classLevels = { rogue: 5 };
            const fence = window.entities.find(e => e.dialogueId === 'thieves_guild_fence');
            window.npcDialogueTrees.thieves_guild_fence(fence);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.message).toContain("I know the look");
    });

    test('the Fence uses the plain refusal for a party without heavy rogue investment', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            window.party[0].classLevels = { fighter: 3 };
            const fence = window.entities.find(e => e.dialogueId === 'thieves_guild_fence');
            window.npcDialogueTrees.thieves_guild_fence(fence);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.message).not.toContain("I know the look");
    });

    test('the Guildmaster acknowledges a rogue-heavy party in the Initiation offer', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 0;
            window.party[0].classLevels = { rogue: 4 };
            const guildmaster = window.entities.find(e => e.dialogueId === 'thieves_guildmaster');
            window.npcDialogueTrees.thieves_guildmaster(guildmaster);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.message).toContain("most of them don't move like you do");
    });
});
