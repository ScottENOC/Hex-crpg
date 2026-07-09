// tests/orc-stronghold.spec.js
// Skarnak's Hold: orc_raiders' first real settlement (see buildOrcStronghold,
// campaign2World.js) — a stockade with a warlord, guards, and a trader,
// placed east of Ridgehold Fort in orc-held territory. Neutral by default
// (attackable by a human-aligned player, same as the Skarn-tooth goblin
// camp) with quest/shop content for a greenskin-aligned one.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Skarnak\'s Hold (orc stronghold)', () => {
    test('placement, roster, and default neutrality', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const state = await page.evaluate(() => {
            const center = window.campaign2OrcStrongholdCenter;
            const warlord = window.entities.find(e => e.dialogueId === 'orc_warlord');
            const trader = window.entities.find(e => e.dialogueId === 'orc_trader');
            const guards = window.entities.filter(e => e.factionId === 'orc_raiders' && e.title?.includes('Stronghold Guard'));
            const troll = window.entities.find(e => e.isOrcStrongholdTroll);
            return {
                centerExists: !!center,
                warlordName: warlord?.name,
                warlordSide: warlord?.side,
                warlordFaction: warlord?.factionId,
                traderExists: !!trader,
                traderSide: trader?.side,
                guardCount: guards.length,
                trollAlive: troll?.alive,
            };
        });
        expect(state.centerExists).toBe(true);
        expect(state.warlordName).toBe('Warlord Grukk Ironhide');
        expect(state.warlordSide).toBe('neutral');
        expect(state.warlordFaction).toBe('orc_raiders');
        expect(state.traderExists).toBe(true);
        expect(state.traderSide).toBe('neutral');
        expect(state.guardCount).toBeGreaterThan(0);
        expect(state.trollAlive).toBe(true);
    });

    test('trader refuses low-trust players; warlord quest grants trust once the troll is dead', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const before = await page.evaluate(() => {
            const warlord = window.entities.find(e => e.dialogueId === 'orc_warlord');
            window.talkToNPC(warlord);
            const opts = Array.from(document.querySelectorAll('#dialogue-options button')).map(b => b.innerText);
            return { standing: window.factions.orc_raiders.standing, opts };
        });
        expect(before.opts).toContain("I'll deal with it.");

        const afterAccept = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('#dialogue-options button'));
            buttons.find(b => b.innerText === "I'll deal with it.").click();
            return !!window.questLog.find(q => q.id === 'orc_stronghold_trust' && q.status === 'active');
        });
        expect(afterAccept).toBe(true);

        const afterKillAndTurnIn = await page.evaluate(() => {
            const troll = window.entities.find(e => e.isOrcStrongholdTroll);
            troll.alive = false;
            troll.hp = -1000;

            const warlord = window.entities.find(e => e.dialogueId === 'orc_warlord');
            const goldBefore = window.party[0].gold;
            window.talkToNPC(warlord);
            const quest = window.questLog.find(q => q.id === 'orc_stronghold_trust');
            return {
                questStatus: quest.status,
                standing: window.factions.orc_raiders.standing,
                goldGain: window.party[0].gold - goldBefore,
            };
        });
        expect(afterKillAndTurnIn.questStatus).toBe('completed');
        expect(afterKillAndTurnIn.standing).toBeGreaterThanOrEqual(20);
        expect(afterKillAndTurnIn.goldGain).toBeGreaterThan(0);

        const traderNowOpen = await page.evaluate(() => {
            const trader = window.entities.find(e => e.dialogueId === 'orc_trader');
            window.talkToNPC(trader);
            return Array.from(document.querySelectorAll('#dialogue-options button')).map(b => b.innerText);
        });
        expect(traderNowOpen).toContain('Let me see your wares.');
    });
});
