// tests/quests.spec.js
const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption } = require('./helpers');

test.describe('village quests', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('A Missing Locket: offer -> track -> turn-in via Elder Marta', async ({ page }) => {
        // Offer
        await page.evaluate(() => window.talkToNPC(window.regionalNPCs.elder));
        await clickDialogueOption(page, 'help');
        await clickDialogueOption(page, 'keep an eye');
        const afterOffer = await page.evaluate(() => window.questLog.find(q => q.id === 'elder_locket'));
        expect(afterOffer.status).toBe('active');

        // Turn in
        const goldBefore = await page.evaluate(() => window.party[0].gold || 0);
        await page.evaluate(() => window.party[0].inventory.push('elder_locket'));
        await page.evaluate(() => window.talkToNPC(window.regionalNPCs.elder));
        await clickDialogueOption(page, 'Here you go');
        const result = await page.evaluate(() => ({
            quest: window.questLog.find(q => q.id === 'elder_locket'),
            gold: window.party[0].gold,
            hasLocket: window.party[0].inventory.includes('elder_locket'),
        }));
        expect(result.quest.status).toBe('completed');
        expect(result.gold).toBe(goldBefore + 20);
        expect(result.hasLocket).toBe(false);
    });

    test("Oskar's Wager: starts a real fight, ends safely without ever truly killing Oskar", async ({ page }) => {
        await page.evaluate(() => window.talkToNPC(window.entities.find(e => e.name === 'Oskar Vinn')));
        await clickDialogueOption(page, 'spar');
        await clickDialogueOption(page, "Let's go");

        const started = await page.evaluate(() => ({
            side: window.entities.find(e => e.name === 'Oskar Vinn').side,
            duelActive: window.oskarDuelActive,
        }));
        expect(started.side).toBe('enemy');
        expect(started.duelActive).toBe(true);

        // Drop Oskar's HP and let a real updateTime tick (the mechanism the
        // watcher actually relies on) catch the threshold and end the duel.
        const maxHp = await page.evaluate(() => {
            const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
            oskar.hp = Math.floor(oskar.maxHp * 0.5);
            window.updateTime(0);
            return oskar.maxHp;
        });
        const ended = await page.evaluate(() => {
            const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
            return {
                side: oskar.side,
                alive: oskar.alive,
                hp: oskar.hp,
                duelActive: window.oskarDuelActive,
                quest: window.questLog.find(q => q.id === 'oskars_wager'),
            };
        });
        expect(ended.side).toBe('neutral');
        expect(ended.alive).toBe(true);
        expect(ended.hp).toBe(maxHp); // healed back to full — a friendly bout, not a real wound
        expect(ended.duelActive).toBe(false);
        expect(ended.quest.status).toBe('completed');
    });
});
