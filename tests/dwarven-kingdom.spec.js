// tests/dwarven-kingdom.spec.js
// Kragmoor, the Deepholds' one city-and-mine (see buildDwarvenKingdom,
// campaign2World.js): a real solid-mountain carve (impassable Wall exterior,
// Cave Floor rooms/tunnels), a king/foreman/trader roster, a world-map
// marker, and the quest thread connecting Silverhart's dwarven ambassador to
// the kingdom he represents.

const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('Kragmoor: a real mountain carve, not a walled perimeter', () => {
    test('the surrounding massif is solid, impassable Wall, not open ground', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const hall = window.campaign2DeepholdsHallCenter;
            // Well inside the reserved massif radius (25), but outside every
            // carved room (rooms are offset by 14-18 hexes from hall center).
            return window.getTerrainAt(hall.q + 22, hall.r + 3).name;
        });
        expect(result).toBe('Wall');
    });

    test('the Great Hall is real Cave Floor with a throne, not carved-away rock', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const hall = window.campaign2DeepholdsHallCenter;
            return {
                floor: window.getTerrainAt(hall.q, hall.r).name,
                throne: window.tileObjects[`${hall.q},${hall.r - 3}`]?.type,
            };
        });
        expect(result.floor).toBe('Cave Floor');
        expect(result.throne).toBe('throne');
    });

    test('the Deep Mine has its own ledger journal, readable via the standard journal dispatch', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const mine = window.campaign2DeepholdsMineCenter;
            return window.tileObjects[`${mine.q},${mine.r}`];
        });
        expect(result.type).toBe('journal');
        expect(result.readId).toBe('deepholds_mine_ledger');
    });

    test('the roster (King, guards, foreman, trader) is placed and neutral by default', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const byName = (n) => window.entities.find(e => e.name === n);
            return {
                king: { present: !!byName('King Balrik Deepholm'), race: byName('King Balrik Deepholm')?.race, side: byName('King Balrik Deepholm')?.side },
                guards: window.entities.filter(e => e.title === 'Hall Guard').length,
                foreman: byName('Foreman Dornik Coalbeard')?.race,
                trader: byName('Ingra Silvertongue')?.race,
            };
        });
        expect(result.king.present).toBe(true);
        expect(result.king.race).toBe('dwarf');
        expect(result.king.side).toBe('neutral');
        expect(result.guards).toBeGreaterThanOrEqual(2);
        expect(result.foreman).toBe('dwarf');
        expect(result.trader).toBe('dwarf');
    });

    test('is marked on the world map as the dwarven capital', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const cell = await page.evaluate(() => {
            for (const row of window.worldMapData) {
                const found = row.find(c => c.n === 'Kragmoor');
                if (found) return found;
            }
            return null;
        });
        expect(cell).not.toBeNull();
        expect(cell.f).toBe('K');
        expect(cell.o).toBe('d');
    });
});

test.describe('The Deepholds trader gating', () => {
    test('refuses a player below 10 standing with the Deepholds', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            const trader = window.entities.find(e => e.name === 'Ingra Silvertongue');
            window.npcDialogueTrees.deepholds_trader(trader);
        });
        const shown = await readDialogue(page);
        expect(shown.message.toLowerCase()).toContain("doesn't open");
    });

    test('opens once standing clears 10', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => { window.factions.dwarven_kingdom.standing = 10; });
        await page.evaluate(() => {
            const trader = window.entities.find(e => e.name === 'Ingra Silvertongue');
            window.npcDialogueTrees.deepholds_trader(trader);
        });
        const shown = await readDialogue(page);
        expect(shown.options.some(o => o.includes('wares'))).toBe(true);
    });
});

test.describe('"A Word to the King": the ambassador thread that actually leads somewhere', () => {
    test('is only offered once the trade toll is paid', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            const ambassador = window.entities.find(e => e.name === 'Ambassador Brokk Stonehammer');
            window.npcDialogueTrees.dwarven_ambassador(ambassador);
        });
        const shown = await readDialogue(page);
        expect(shown.options.some(o => o.includes("carry it"))).toBe(false);
    });

    test('accepting grants the sealed letter, and delivering it to the King completes the quest and adjusts both factions', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'dwarven_toll', title: 'Coin for the Deepholds', giver: 'Ambassador Brokk Stonehammer', status: 'completed' });
        });
        await page.evaluate(() => {
            const ambassador = window.entities.find(e => e.name === 'Ambassador Brokk Stonehammer');
            window.npcDialogueTrees.dwarven_ambassador(ambassador);
        });
        await clickDialogueOption(page, "I'll carry it");
        const midQuest = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'deepholds_letter'),
            hasLetter: window.party[0].inventory.includes('deepholds_sealed_letter'),
        }));
        expect(midQuest.quest.status).toBe('active');
        expect(midQuest.hasLetter).toBe(true);

        const before = await page.evaluate(() => ({
            dwarves: window.factions.dwarven_kingdom.standing,
            silverhart: window.factions.silverhart_kingdom.standing,
        }));
        await page.evaluate(() => {
            const king = window.entities.find(e => e.name === 'King Balrik Deepholm');
            window.npcDialogueTrees.dwarf_king(king);
        });
        await clickDialogueOption(page, 'Stonehammer');
        const after = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'deepholds_letter'),
            hasLetter: window.party[0].inventory.includes('deepholds_sealed_letter'),
            dwarves: window.factions.dwarven_kingdom.standing,
            silverhart: window.factions.silverhart_kingdom.standing,
        }));
        expect(after.quest.status).toBe('completed');
        expect(after.hasLetter).toBe(false);
        expect(after.dwarves).toBeGreaterThan(before.dwarves);
        expect(after.silverhart).toBeGreaterThan(before.silverhart);
    });
});

test.describe('"What Nests Below": the lower-tunnels side quest', () => {
    test('killing the vermin and returning to the King completes the quest', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            const king = window.entities.find(e => e.name === 'King Balrik Deepholm');
            window.npcDialogueTrees.dwarf_king(king);
        });
        await clickDialogueOption(page, 'lower tunnels');
        const midQuest = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'deepholds_infestation'));
        expect(midQuest.status).toBe('active');

        await page.evaluate(() => {
            window.entities.forEach(e => { if (e.deepholdsVermin) e.alive = false; });
        });
        const beforeStanding = await page.evaluate(() => window.factions.dwarven_kingdom.standing);
        await page.evaluate(() => {
            const king = window.entities.find(e => e.name === 'King Balrik Deepholm');
            window.npcDialogueTrees.dwarf_king(king);
        });
        const after = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'deepholds_infestation'),
            standing: window.factions.dwarven_kingdom.standing,
        }));
        expect(after.quest.status).toBe('completed');
        expect(after.standing).toBeGreaterThan(beforeStanding);
    });
});
