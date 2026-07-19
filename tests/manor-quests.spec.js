const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue, clickDialogueOption } = require('./helpers.js');

test.describe('Baron manor content: steward bribery and the tribute quest', () => {
    test('the steward can be bribed (leverage system) and it flags him as bribed', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.party[0].skills = { ...(window.party[0].skills || {}), insight: 3 }; // guarantee full leverage signal
            window.party[0].gold = 100;
            const steward = window.entities.find(e => e.name === 'Steward Halvard Greer');
            window.npcDialogueTrees.reddale_steward(steward);
        });
        await clickDialogueOption(page, "Try to read him");
        const before = await page.evaluate(() => window.party[0].gold);
        await clickDialogueOption(page, "Offer");
        const result = await page.evaluate(() => {
            const steward = window.entities.find(e => e.name === 'Steward Halvard Greer');
            return { bribed: steward.bribed, gold: window.party[0].gold };
        });
        expect(result.bribed).toBe(true);
        expect(result.gold).toBeLessThan(before);
    });

    test('a bribed guard never fails the stealth mission, even if seen', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.factions.ironbond_company.standing = 10;
            const steward = window.entities.find(e => e.name === 'Steward Halvard Greer');
            steward.bribed = true;

            (window.questLog = window.questLog || []).push({ id: 'spy_on_baron', title: 'x', giver: 'y', status: 'active', description: 'z' });
            window.startStealthMission({
                questId: 'spy_on_baron', guardName: 'Steward Halvard Greer', evidenceKey: 'baron_tariffs',
                itemId: 'baron_tariff_evidence', evidenceFlavor: 'the tally', factionSpiedOn: 'silverhart_kingdom',
                failStandingHit: -20, objectiveText: 'test'
            });

            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.isStealthed = false;
            steward.hex = { q: player.hex.q + 1, r: player.hex.r }; // adjacent, would normally guarantee detection
            window.checkStealthMissionStatus();

            return {
                mission: window.activeStealthMission,
                questStatus: (window.questLog || []).find(q => q.id === 'spy_on_baron')?.status,
            };
        });
        expect(result.mission).not.toBe(null);
        expect(result.questStatus).toBe('active');
    });

    test('the Baron offers the tribute quest and turning in a red gem completes it', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 0; // below the espionage-quest threshold, so this must be the fallback branch
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.npcDialogueTrees.reddale_baron(baron);
        });
        await clickDialogueOption(page, "I'll bring you a tribute");
        const questAfterOffer = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'baron_tribute'));
        expect(questAfterOffer.status).toBe('active');

        await page.evaluate(() => {
            window.player.inventory.push('gem_red');
            const baron = window.entities.find(e => e.name === 'Baron Corwin Aldervale');
            window.npcDialogueTrees.reddale_baron(baron);
        });
        const before = await page.evaluate(() => ({ standing: window.factions.silverhart_kingdom.standing, gold: window.party[0].gold || 0 }));
        await clickDialogueOption(page, "Present the gem");
        const after = await page.evaluate(() => ({
            questStatus: (window.questLog || []).find(q => q.id === 'baron_tribute')?.status,
            hasGem: window.player.inventory.includes('gem_red'),
            standing: window.factions.silverhart_kingdom.standing,
            gold: window.party[0].gold || 0,
        }));
        expect(after.questStatus).toBe('completed');
        expect(after.hasGem).toBe(false);
        expect(after.standing).toBeGreaterThan(before.standing);
        expect(after.gold).toBeGreaterThan(before.gold);
    });
});
