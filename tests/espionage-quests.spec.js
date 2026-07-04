const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue, clickDialogueOption } = require('./helpers.js');

test.describe('Reddale espionage: Merchants Guild vs the Baron', () => {
    test('the Baron is physically placed in Reddale and the Merchants Guild faction/NPCs exist', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            const guildmaster = window.entities.find(e => e.name === 'Guildmaster Petra Voss');
            const guildGuard = window.entities.find(e => e.name === 'Guild Watchman Corley');
            const steward = window.entities.find(e => e.name === 'Steward Halvard Greer');
            return {
                baronPlaced: !!baron,
                baronDialogueId: baron?.dialogueId,
                baronSide: baron?.side,
                guildFactionExists: !!window.factions.merchants_guild,
                guildmasterFaction: guildmaster?.factionId,
                guildGuardPatrols: guildGuard?.behaviorType === 'patrol',
                stewardPatrols: steward?.behaviorType === 'patrol',
            };
        });
        expect(result.baronPlaced).toBe(true);
        expect(result.baronDialogueId).toBe('reddale_baron');
        expect(result.baronSide).toBe('neutral');
        expect(result.guildFactionExists).toBe(true);
        expect(result.guildmasterFaction).toBe('merchants_guild');
        expect(result.guildGuardPatrols).toBe(true);
        expect(result.stewardPatrols).toBe(true);
    });

    test('the Baron does not offer the espionage quest below the trust threshold', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 0;
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.npcDialogueTrees.reddale_baron(baron);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes("I'll do it"))).toBe(false);
        const questExists = await page.evaluate(() => !!(window.questLog || []).find(q => q.id === 'spy_on_guild'));
        expect(questExists).toBe(false);
    });

    test('once trusted, the Baron offers the quest and it starts a stealth mission', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 25;
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.npcDialogueTrees.reddale_baron(baron);
        });
        await clickDialogueOption(page, "I'll do it");
        const result = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'spy_on_guild'),
            mission: window.activeStealthMission,
        }));
        expect(result.quest.status).toBe('active');
        expect(result.mission.guardName).toBe('Guild Watchman Corley');
        expect(result.mission.evidenceKey).toBe('guild_ledgers');
        expect(result.mission.factionSpiedOn).toBe('merchants_guild');
    });

    test('the mission fails and the spied-on faction standing drops if the guard sees the player', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 25;
            window.factions.merchants_guild.standing = 10;
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.startStealthMission({
                questId: 'spy_on_guild', guardName: 'Guild Watchman Corley', evidenceKey: 'guild_ledgers',
                itemId: 'guild_ledger_evidence', evidenceFlavor: 'the ledgers', factionSpiedOn: 'merchants_guild',
                failStandingHit: -20, objectiveText: 'test'
            });
            (window.questLog = window.questLog || []).push({ id: 'spy_on_guild', title: 'Eyes on the Guildhouse', giver: baron.name, status: 'active', description: 'test' });

            const guard = window.entities.find(e => e.name === 'Guild Watchman Corley');
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.isStealthed = false; // walking in unstealthed guarantees canSee() sees them
            guard.hex = { q: player.hex.q + 1, r: player.hex.r };
            window.checkStealthMissionStatus();

            return {
                mission: window.activeStealthMission,
                questStatus: (window.questLog || []).find(q => q.id === 'spy_on_guild')?.status,
                guildStanding: window.factions.merchants_guild.standing,
            };
        });
        expect(result.mission).toBe(null);
        expect(result.questStatus).toBe('failed');
        expect(result.guildStanding).toBeLessThan(10);
    });

    test('searchEvidence succeeds and grants the quest item when the evidenceKey matches the active mission', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.tileObjects['500,500'] = { type: 'evidence', evidenceKey: 'guild_ledgers' };
            window.startStealthMission({
                questId: 'spy_on_guild', guardName: 'Guild Watchman Corley', evidenceKey: 'guild_ledgers',
                itemId: 'guild_ledger_evidence', evidenceFlavor: 'the ledgers', factionSpiedOn: 'merchants_guild',
                failStandingHit: -20, objectiveText: 'test'
            });
            window.searchEvidence(500, 500);
            return {
                hasItem: window.player.inventory.includes('guild_ledger_evidence'),
                missionCleared: window.activeStealthMission === null,
                tileTaken: window.tileObjects['500,500'].taken,
            };
        });
        expect(result.hasItem).toBe(true);
        expect(result.missionCleared).toBe(true);
        expect(result.tileTaken).toBe(true);
    });

    test('searching evidence that does not match the active mission (or with no mission running) does nothing', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.tileObjects['501,501'] = { type: 'evidence', evidenceKey: 'baron_tariffs' };
            window.activeStealthMission = null;
            window.searchEvidence(501, 501);
            return { hasItem: window.player.inventory.includes('baron_tariff_evidence'), taken: !!window.tileObjects['501,501'].taken };
        });
        expect(result.hasItem).toBe(false);
        expect(result.taken).toBe(false);
    });

    test('turning in the evidence completes the quest and moves standing on both factions', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 25;
            window.factions.merchants_guild.standing = 10;
            (window.questLog = window.questLog || []).push({ id: 'spy_on_guild', title: 'Eyes on the Guildhouse', giver: 'Baron Corwin Aldervale', status: 'active', description: 'test' });
            window.player.inventory.push('guild_ledger_evidence');
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.npcDialogueTrees.reddale_baron(baron);
        });
        const before = await page.evaluate(() => ({ kingdom: window.factions.silverhart_kingdom.standing, guild: window.factions.merchants_guild.standing, gold: window.party[0].gold || 0 }));
        await clickDialogueOption(page, "Here");
        const after = await page.evaluate(() => ({
            questStatus: (window.questLog || []).find(q => q.id === 'spy_on_guild')?.status,
            hasItem: window.player.inventory.includes('guild_ledger_evidence'),
            kingdom: window.factions.silverhart_kingdom.standing,
            guild: window.factions.merchants_guild.standing,
            gold: window.party[0].gold || 0,
        }));
        expect(after.questStatus).toBe('completed');
        expect(after.hasItem).toBe(false);
        expect(after.kingdom).toBeGreaterThan(before.kingdom);
        expect(after.guild).toBeLessThan(before.guild);
        expect(after.gold).toBeGreaterThan(before.gold);
    });

    test('the mirrored Guildmaster quest exists and is gated on merchants_guild trust', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.merchants_guild.standing = 25;
            const guildmaster = window.entities.find(e => e.name === 'Guildmaster Petra Voss');
            window.npcDialogueTrees.reddale_guildmaster(guildmaster);
        });
        await clickDialogueOption(page, "I'll do it");
        const mission = await page.evaluate(() => window.activeStealthMission);
        expect(mission.guardName).toBe('Steward Halvard Greer');
        expect(mission.evidenceKey).toBe('baron_tariffs');
        expect(mission.factionSpiedOn).toBe('silverhart_kingdom');
    });
});
