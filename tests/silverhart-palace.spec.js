const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('Silverhart Palace: the capital, one world-hex north of Millbrook', () => {
    test('the throne room, barracks, and council chamber are all carved with Wood Floor interiors', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            throne: window.getTerrainAt(window.campaign2PalaceThroneCenter.q, window.campaign2PalaceThroneCenter.r).name,
            barracks: window.getTerrainAt(window.campaign2PalaceBarracksCenter.q, window.campaign2PalaceBarracksCenter.r).name,
            council: window.getTerrainAt(window.campaign2PalaceCouncilCenter.q, window.campaign2PalaceCouncilCenter.r).name,
        }));
        expect(result.throne).toBe('Wood Floor');
        expect(result.barracks).toBe('Wood Floor');
        expect(result.council).toBe('Wood Floor');
    });

    test('the throne itself is placed at the head of the throne room', async ({ page }) => {
        await createCharacter(page);
        const hasThrone = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const seatKey = `${center.q},${center.r - 3}`;
            return window.tileObjects[seatKey]?.type === 'throne';
        });
        expect(hasThrone).toBe(true);
    });

    test('King Alaric Corrin holds court in the throne room and his dialogue reflects kingdom standing', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 50;
            const king = window.entities.find(e => e.name === 'King Alaric Corrin');
            window.npcDialogueTrees.silverhart_king(king);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.message).toContain('remembers people who make its work easier');
    });

    test('the palace is heavily guarded: at least 6 royal guards are placed across the throne room and barracks', async ({ page }) => {
        await createCharacter(page);
        const guardCount = await page.evaluate(() => window.entities.filter(e => e.title === 'Royal Guard').length);
        expect(guardCount).toBeGreaterThanOrEqual(6);
    });

    test('the Chancellor is present in the council chamber with his own dialogue', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const chancellor = window.entities.find(e => e.name === 'Chancellor Merric Vane');
            window.npcDialogueTrees.palace_chancellor(chancellor);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('borderlands'))).toBe(true);
    });

    test('Silverhart is marked on the world map as the Capital', async ({ page }) => {
        await createCharacter(page);
        const cell = await page.evaluate(() => window.worldMapData[0][6]);
        expect(cell.n).toBe('Silverhart');
        expect(cell.f).toBe('K');
    });

    test('Millbrook is unaffected by the road extension (still exactly 3 world-hexes north, not 4)', async ({ page }) => {
        await createCharacter(page);
        const cell = await page.evaluate(() => window.worldMapData[3][6]);
        expect(cell.n).toBe('Millbrook');
    });
});
