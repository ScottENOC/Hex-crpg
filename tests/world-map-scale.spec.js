// tests/world-map-scale.spec.js
// The world map is meant to be a scaled-down summary of the local map: one
// grid cell = WORLD_HEX_SIZE local hexes (worldMapCellFromLocalHex,
// campaign2World.js), with the crossroads as the shared origin. Every
// settlement/fort/camp marker is written by scaling its real local
// coordinate down, rather than a hand-picked grid index — this covers the
// actual scale math and catches any settlement drifting back out of sync
// with its local position.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

function findMarker(worldMapData, name) {
    for (const row of worldMapData) {
        const found = row.find(c => c.n === name);
        if (found) return found;
    }
    return null;
}

test.describe('World map scale', () => {
    test('worldMapCellFromLocalHex scales by WORLD_HEX_SIZE relative to the crossroads', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            return {
                atOrigin: window.worldMapCellFromLocalHex(cp),
                oneNorth: window.worldMapCellFromLocalHex({ q: cp.q, r: cp.r - window.WORLD_HEX_SIZE }),
                oneEast: window.worldMapCellFromLocalHex({ q: cp.q + window.WORLD_HEX_SIZE, r: cp.r }),
            };
        });
        expect(result.atOrigin).toEqual({ row: 6, col: 6 });
        expect(result.oneNorth).toEqual({ row: 5, col: 6 });
        expect(result.oneEast).toEqual({ row: 6, col: 7 });
    });

    test('Silverhart lands 4 world-hexes north of Hollowmere, not 6', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const hollowmere = findFn(window.worldMapData, 'Hollowmere');
            const silverhart = findFn(window.worldMapData, 'Silverhart');
            function findFn(data, name) {
                for (const row of data) { const f = row.find(c => c.n === name); if (f) return f; }
                return null;
            }
            const hollowmereRow = data => { for (let y = 0; y < data.length; y++) if (data[y].some(c => c.n === 'Hollowmere')) return y; return -1; };
            const silverhartRow = data => { for (let y = 0; y < data.length; y++) if (data[y].some(c => c.n === 'Silverhart')) return y; return -1; };
            return { hollowmereRow: hollowmereRow(window.worldMapData), silverhartRow: silverhartRow(window.worldMapData) };
        });
        expect(result.hollowmereRow).toBe(6);
        expect(result.silverhartRow).toBe(2); // 6 - WORLD_HEX_SIZE*4/WORLD_HEX_SIZE = 6-4
    });

    test('Old Mac\'s Farmstead is marked on the world map (previously missing) at the correct row', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const cell = await page.evaluate(() => {
            for (let y = 0; y < window.worldMapData.length; y++) {
                const found = window.worldMapData[y].find(c => c.n === "Old Mac's Farmstead");
                if (found) return { ...found, row: y };
            }
            return null;
        });
        expect(cell).not.toBeNull();
        expect(cell.row).toBe(7);
    });

    test('the goblin camp is marked on the world map (previously missing entirely)', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const cell = await page.evaluate(() => {
            for (const row of window.worldMapData) {
                const found = row.find(c => c.n === 'Skarn-tooth Camp');
                if (found) return found;
            }
            return null;
        });
        expect(cell).not.toBeNull();
        expect(cell.o).toBe('g');
    });

    test('Ridgehold Fort and Skarnak\'s Hold both stay visible even though their real local coordinates round to the same grid cell', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => ({
            ridgehold: (() => { for (const row of window.worldMapData) { const f = row.find(c => c.n === 'Ridgehold Fort'); if (f) return f; } return null; })(),
            skarnak: (() => { for (const row of window.worldMapData) { const f = row.find(c => c.n === "Skarnak's Hold"); if (f) return f; } return null; })(),
        }));
        expect(result.ridgehold).not.toBeNull();
        expect(result.skarnak).not.toBeNull();
    });

    test('the river runs near Hollowmere\'s row, not far to the north, and never sits on a settlement cell', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const path = window.worldRiverPath || [];
            const rows = [...new Set(path.map(p => p.y))];
            const overlapsSettlement = path.some(pt => window.worldMapData[pt.y]?.[pt.x]?.n);
            return { rows, overlapsSettlement };
        });
        // Hollowmere is row 6 — the river should run adjacent to it (row
        // 5-6) for almost its whole length, with a single-hex bend up to
        // row 4 at its western end where it meets its mountain source
        // (see worldRiverPath's comment, worldMap.js).
        result.rows.forEach(r => expect(r).toBeGreaterThanOrEqual(4));
        result.rows.forEach(r => expect(r).toBeLessThanOrEqual(6));
        expect(result.overlapsSettlement).toBe(false);
    });

    test('setWorldMapMarker is a no-op when worldMapData is empty (e.g. Campaign 1)', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const threw = await page.evaluate(() => {
            try {
                window.setWorldMapMarker({ q: 0, r: 0 }, { t: 'G', f: 'V', o: 'h', p: 1, n: 'Test' });
                return false;
            } catch (e) {
                return true;
            }
        });
        expect(threw).toBe(false);
    });
});
