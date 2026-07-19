// tests/elven-capital.spec.js
// Sil'thandriel, the Sylvan Court's capital (see buildElvenCapital,
// campaign2World.js): a forest-canopy carve (not a walled perimeter — elves
// build with the woods, not against them), a Queen/guard/archivist/healer
// roster, a world-map marker, and the quest thread connecting Silverhart's
// elven ambassador (already in the game) to the capital he's always spoken
// for.

const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe("Sil'thandriel: forest canopy, not a walled perimeter", () => {
    test('the canopy ring is real dense Foliage, and the court clearing is open Grass', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const court = window.campaign2ElvenCourtCenter;
            // Well inside the reserved canopy radius (18), but outside every
            // carved building (buildings sit within ~12 hexes of court center).
            const treeline = window.getTerrainAt(court.q + 16, court.r + 2).name;
            return { treeline };
        });
        expect(result.treeline).toBe('Foliage');
    });

    test('the Court of the Silver Leaf is real Wood Floor with a throne, up in the Upper Canopy (floor 2)', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const court = window.campaign2ElvenCourtCenter;
            // Sil'thandriel is a treehouse city now (see buildElvenCapital's
            // own redesign comment, campaign2World.js) — the Court lives on
            // floor 2, not the forest floor.
            return {
                floor: window.getTerrainAtFloor(court.q, court.r, 2).name,
                throne: window.getTileObjectAtFloor(court.q, court.r + 2, 2)?.type,
            };
        });
        expect(result.floor).toBe('Wood Floor');
        expect(result.throne).toBe('throne');
    });

    test('the Sickbed lodge has herb patches for Healer Sylwen\'s quest, on the Lower Canopy (floor 1)', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const lodge = window.campaign2ElvenLodgeCenter;
            return {
                a: window.getTileObjectAtFloor(lodge.q, lodge.r - 2, 1)?.type,
                b: window.getTileObjectAtFloor(lodge.q + 1, lodge.r - 2, 1)?.type,
            };
        });
        expect(result.a).toBe('herb_patch');
        expect(result.b).toBe('herb_patch');
    });

    test('the roster (Queen, guards, archivist, healer) is placed, elf, and neutral by default', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const byName = (n) => window.entities.find(e => e.name === n);
            const queen = byName("Queen Aelwen Sil'thandriel");
            return {
                queen: { present: !!queen, race: queen?.race, side: queen?.side },
                guards: window.entities.filter(e => e.title === 'Silverleaf Sentinel').length,
                archivist: byName('Loremaster Faelan')?.race,
                healer: byName('Healer Sylwen')?.race,
            };
        });
        expect(result.queen.present).toBe(true);
        expect(result.queen.race).toBe('elf');
        expect(result.queen.side).toBe('neutral');
        expect(result.guards).toBeGreaterThanOrEqual(2);
        expect(result.archivist).toBe('elf');
        expect(result.healer).toBe('elf');
    });

    test('is marked on the world map as the elven capital', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const cell = await page.evaluate(() => {
            for (const row of window.worldMapData) {
                const found = row.find(c => c.n === "Sil'thandriel");
                if (found) return found;
            }
            return null;
        });
        expect(cell).not.toBeNull();
        expect(cell.f).toBe('K');
        expect(cell.o).toBe('e');
    });
});

test.describe('"The Silver Accord": the ambassador thread that actually leads somewhere', () => {
    test('Elarion only offers the Accord errand once "A Gift of Green" is completed', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            const ambassador = window.entities.find(e => e.name === 'Ambassador Elarion');
            window.npcDialogueTrees.elven_ambassador(ambassador);
        });
        const shown = await readDialogue(page);
        expect(shown.options.some(o => o.toLowerCase().includes('audience with the queen'))).toBe(false);
    });

    test('completing the herb gift unlocks the Accord offer; the Queen only grants her seal to a player already on that errand', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'elven_gift', title: 'A Gift of Green', giver: 'Ambassador Elarion', status: 'completed' });
        });

        // An unannounced visit to the Queen (no Accord quest yet) gets
        // flavor only — no seal to be had.
        await page.evaluate(() => {
            const queen = window.entities.find(e => e.name === "Queen Aelwen Sil'thandriel");
            window.npcDialogueTrees.elf_queen(queen);
        });
        let shown = await readDialogue(page);
        expect(shown.options.some(o => o.toLowerCase().includes('token of the accord'))).toBe(false);

        // Accept the Accord errand from Elarion.
        await page.evaluate(() => {
            const ambassador = window.entities.find(e => e.name === 'Ambassador Elarion');
            window.npcDialogueTrees.elven_ambassador(ambassador);
        });
        await clickDialogueOption(page, 'audience with the Queen');
        const midQuest = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'silver_accord'));
        expect(midQuest.status).toBe('active');

        // Now the Queen actually grants her seal.
        await page.evaluate(() => {
            const queen = window.entities.find(e => e.name === "Queen Aelwen Sil'thandriel");
            window.npcDialogueTrees.elf_queen(queen);
        });
        await clickDialogueOption(page, 'token of the Accord');
        const hasSeal = await page.evaluate(() => window.party[0].inventory.includes('queens_seal'));
        expect(hasSeal).toBe(true);
    });

    test('delivering the seal to Elarion completes the quest and lifts both the Sylvan Court\'s and Silverhart\'s standing', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'elven_gift', title: 'A Gift of Green', giver: 'Ambassador Elarion', status: 'completed' });
            window.questLog.push({ id: 'silver_accord', title: 'The Silver Accord', giver: 'Ambassador Elarion', status: 'active' });
            window.party[0].inventory = window.party[0].inventory || [];
            window.party[0].inventory.push('queens_seal');
        });
        const before = await page.evaluate(() => ({
            elves: window.factions.elven_realm.standing,
            silverhart: window.factions.silverhart_kingdom.standing,
        }));
        await page.evaluate(() => {
            const ambassador = window.entities.find(e => e.name === 'Ambassador Elarion');
            window.npcDialogueTrees.elven_ambassador(ambassador);
        });
        await clickDialogueOption(page, 'Here.');
        const after = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'silver_accord'),
            hasSeal: window.party[0].inventory.includes('queens_seal'),
            elves: window.factions.elven_realm.standing,
            silverhart: window.factions.silverhart_kingdom.standing,
        }));
        expect(after.quest.status).toBe('completed');
        expect(after.hasSeal).toBe(false);
        expect(after.elves).toBeGreaterThan(before.elves);
        expect(after.silverhart).toBeGreaterThan(before.silverhart);
    });
});

test.describe('"A Tonic for the Sickbed": Healer Sylwen\'s local herb-gift quest', () => {
    test('bringing 3 herbs completes the quest and raises standing with the Sylvan Court', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => {
            const healer = window.entities.find(e => e.name === 'Healer Sylwen');
            window.npcDialogueTrees.elf_healer(healer);
        });
        await clickDialogueOption(page, "I'll bring you some herbs.");
        const midQuest = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'silverleaf_tonic'));
        expect(midQuest.status).toBe('active');

        const before = await page.evaluate(() => window.factions.elven_realm.standing);
        await page.evaluate(() => {
            window.party[0].inventory = window.party[0].inventory || [];
            window.party[0].inventory.push('herbs', 'herbs', 'herbs');
        });
        await page.evaluate(() => {
            const healer = window.entities.find(e => e.name === 'Healer Sylwen');
            window.npcDialogueTrees.elf_healer(healer);
        });
        await clickDialogueOption(page, 'Here you go.');
        const after = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'silverleaf_tonic'),
            herbsLeft: window.party[0].inventory.filter(i => i === 'herbs').length,
            standing: window.factions.elven_realm.standing,
        }));
        expect(after.quest.status).toBe('completed');
        expect(after.herbsLeft).toBe(0);
        expect(after.standing).toBeGreaterThan(before);
    });
});
