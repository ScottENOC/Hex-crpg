// tests/greenskin-spy.spec.js
// The greenskin-side mirror of the Northwatch questline: Chief Skarnub
// (goblin camp, gated on the goblin_alliance resolution + the mine-raid
// favor + the same goblinScoutNoteRead continuity signal the human
// quartermaster's breadcrumb uses) offers "A Hand on the Inside" —
// accepting flips the ambient siege engine/escorts to neutral, provisional
// allies of the player (joinGreenskinAssault) instead of the default
// always-hostile side:'enemy', making the "unforgivable act" hostility
// flip and the "destroy their siege equipment" trigger actually live for
// this path.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('greenskin_spy: joining the assault on Northwatch', () => {
    test('joinGreenskinAssault flips the siege engine and spawns escorts as neutral, factionTag-ged, non-hostile allies', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.joinGreenskinAssault();
            const engine = window.campaign2NorthwatchSiegeEngine;
            const escorts = window.entities.filter(e => e.factionTag === 'greenskin_assault' && e !== engine);
            return {
                engineSide: engine.side,
                engineFactionTag: engine.factionTag,
                engineHostileToPlayer: engine.combatDirective?.hostileToPlayer,
                escortCount: escorts.length,
                allEscortsNeutralNonHostile: escorts.every(e => e.side === 'neutral' && !e.combatDirective?.hostileToPlayer),
                playerAiding: window.playerAidingGreenskins,
                siegeActive: window.siegeState?.active,
            };
        });
        expect(result.engineSide).toBe('neutral');
        expect(result.engineFactionTag).toBe('greenskin_assault');
        expect(result.engineHostileToPlayer).toBeFalsy();
        expect(result.escortCount).toBeGreaterThan(0);
        expect(result.allEscortsNeutralNonHostile).toBe(true);
        expect(result.playerAiding).toBe(true);
        expect(result.siegeActive).toBe(true);
    });

    test('attacking a greenskin escort directly during the siege turns the whole warband hostile (symmetric with the human side)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.joinGreenskinAssault();
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const escorts = window.entities.filter(e => e.factionTag === 'greenskin_assault');
            const target = escorts[0];
            const untouched = escorts.slice(1);
            player.hex = { q: target.hex.q + 1, r: target.hex.r };
            window.tryAttack(player, target, false, false, 0, true);
            return { allNowHostile: untouched.every(e => e.combatDirective?.hostileToPlayer === true) };
        });
        expect(result.allNowHostile).toBe(true);
    });

    test('Chief Skarnub offers "A Hand on the Inside" once allied, the mine favor is done, and the scout note has been read', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', status: 'completed', resolution: 'goblin_alliance' });
            window.questLog.push({ id: 'goblin_mine_raid', title: 'A Favor for the Tribe', status: 'completed' });
            window.goblinScoutNoteRead = true;

            const npc = window.entities.find(e => e.name === 'Chief Skarnub') || { name: 'Chief Skarnub' };
            const dialogueCalls = [];
            const originalShowDialogue = window.showDialogue;
            window.showDialogue = (n, text, options) => { dialogueCalls.push({ text, options }); };
            window.npcDialogueTrees.chief_skarnub(npc);
            window.showDialogue = originalShowDialogue;

            const offeredHandOnInside = dialogueCalls.some(c => c.options.some(o => o.label.includes('help you take Northwatch')));
            if (offeredHandOnInside) {
                const opt = dialogueCalls.find(c => c.options.some(o => o.label.includes('help you take Northwatch')))
                    .options.find(o => o.label.includes('help you take Northwatch'));
                opt.action();
            }
            const quest = window.questLog.find(q => q.id === 'greenskin_spy');
            return { offeredHandOnInside, questActive: quest?.status === 'active', aiding: window.playerAidingGreenskins };
        });
        expect(result.offeredHandOnInside).toBe(true);
        expect(result.questActive).toBe(true);
        expect(result.aiding).toBe(true);
    });

    test('fort_fallen while aiding the greenskins completes greenskin_spy', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'greenskin_spy', title: 'A Hand on the Inside', status: 'active', resolution: null });
            window.playerAidingGreenskins = true;
            window.activateNorthwatchSiege();
            window.applySiegePressure(500, null);
            const quest = window.questLog.find(q => q.id === 'greenskin_spy');
            return { status: quest.status, resolution: quest.resolution };
        });
        expect(result.status).toBe('completed');
        expect(result.resolution).toBe('fort_fallen');
    });
});
