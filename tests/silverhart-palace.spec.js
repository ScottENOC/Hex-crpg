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

    test('Queen Seraphine Corrin holds court in the great hall and her dialogue reflects kingdom standing', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 50;
            const queen = window.entities.find(e => e.name === 'Queen Seraphine Corrin');
            window.npcDialogueTrees.silverhart_queen(queen);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.message).toContain('remembers those who make its work easier');
    });

    test("the Queen's dialogue reacts to all three major arcs: greenskins, the Ironbond Company, and the necromancer plot", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.factions.goblin_tribe.standing = 40;
            window.factions.ironbond_company.merchantInfluence.silverhart_kingdom = 5;
            window.player.inventory = window.player.inventory || [];
            window.player.inventory.push('phylactery_shard');
            const queen = window.entities.find(e => e.name === 'Queen Seraphine Corrin');
            window.npcDialogueTrees.silverhart_queen(queen);
            const opts = document.getElementById('dialogue-options').innerText;
            return opts;
        });
        expect(result).toContain('greenskins');
        expect(result).toContain('Ironbond');
        expect(result).toContain('necromancy');
    });

    test('the Queen is a real fighter (sword + heavy armor + helm), not decorative', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const queen = window.entities.find(e => e.name === 'Queen Seraphine Corrin');
            return { equipped: queen.equipped, goldGear: queen.goldGear, gender: queen.gender };
        });
        expect(result.equipped.weapon).toBe('sword');
        expect(result.equipped.armor).toBe('heavy_armor');
        expect(result.equipped.helmet).toBe('nasal_helm');
        expect(result.goldGear).toBe(true);
        expect(result.gender).toBe('female');
    });

    test('the palace has additional grand rooms: a Royal Wizard\'s Tower and the Queen\'s private chambers', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            tower: window.getTerrainAt(window.campaign2PalaceTowerCenter.q, window.campaign2PalaceTowerCenter.r).name,
            bedroom: window.getTerrainAt(window.campaign2PalaceBedroomCenter.q, window.campaign2PalaceBedroomCenter.r).name,
            wizardPresent: !!window.entities.find(e => e.name === 'Court Wizard Thessaly'),
            bedPresent: window.tileObjects[`${window.campaign2PalaceBedroomCenter.q},${window.campaign2PalaceBedroomCenter.r}`]?.type === 'bed',
        }));
        expect(result.tower).toBe('Wood Floor');
        expect(result.bedroom).toBe('Wood Floor');
        expect(result.wizardPresent).toBe(true);
        expect(result.bedPresent).toBe(true);
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
        const cell = await page.evaluate(() => {
            for (const row of window.worldMapData) {
                const found = row.find(c => c.n === 'Silverhart');
                if (found) return found;
            }
            return null;
        });
        expect(cell.n).toBe('Silverhart');
        expect(cell.f).toBe('K');
    });

    test('Millbrook is unaffected by the road extension (still exactly 3 world-hexes north, not 4)', async ({ page }) => {
        await createCharacter(page);
        const cell = await page.evaluate(() => window.worldMapData[3][6]);
        expect(cell.n).toBe('Millbrook');
    });

    test('regression: the great hall reads as a level-topped rectangle on screen, not a slanted diamond', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            // carveFlatRoom's row-shift (see campaign2World.js) means the
            // hex belonging to "the same nominal row" at column offset dq is
            // at r = center.r + dr - Math.floor(dq / 2), not a fixed r — a
            // fixed-r scan (the bug this regression test originally had)
            // gives nonsense here. Reconstruct the real per-column hex the
            // same way the carving code does, and confirm it's actually
            // floor, and that its screen Y stays flat (bounded zig-zag, not
            // a growing diamond edge) across the hall's full width.
            const dr = -4; // near the back wall
            const ys = [];
            let allFloor = true;
            for (let dq = -6; dq <= 6; dq++) {
                const shift = -Math.floor(dq / 2);
                const q = center.q + dq, r = center.r + dr + shift;
                if (window.getTerrainAt(q, r).name !== 'Wood Floor') allFloor = false;
                ys.push(window.hexToPixel(q, r).y);
            }
            const spread = Math.max(...ys) - Math.min(...ys);
            const hexPixelHeight = window.hexSize * Math.sqrt(3);
            return { spread, hexPixelHeight, sampleCount: ys.length, allFloor };
        });
        expect(result.sampleCount).toBe(13);
        expect(result.allFloor).toBe(true);
        // A true diamond/rhombus shape would spread by roughly halfWidth
        // hex-heights across this range; a level rectangle only zig-zags by
        // half a hex-height between adjacent columns (row-shift parity).
        expect(result.spread).toBeLessThan(result.hexPixelHeight);
    });
});
