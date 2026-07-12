// tests/world-map-geography.spec.js
// World map tile colors now mean something real: mountain terrain ('M')
// renders grey and marks out a real range (Kragmoor, the dwarven kingdom,
// in the NE corner — deliberately bordering orc territory so the
// greenskins and the dwarves read as neighbors), and a strip of open ocean
// ('W', using the new Deep Water local terrain type) borders the far WEST
// edge, keeping human/orc/dwarf lands all inland and the greenskins
// furthest from the coast. The river flows from the mountain range to that
// ocean, not just an arbitrary west-to-east line.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Deep Water terrain type', () => {
    test('is a real, distinct, impassable terrain — not just shallow water with a new name', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => ({
            deepWater: window.terrainTypes.deep_water,
            water: window.terrainTypes.water,
        }));
        expect(result.deepWater.name).toBe('Deep Water');
        expect(result.deepWater.impassable).toBe(true);
        expect(result.water.impassable).toBeFalsy();
        expect(result.deepWater.color).not.toBe(result.water.color);
    });
});

test.describe('World map: mountain range and ocean strip', () => {
    test('a real mountain range sits in the NE corner, claimed by the dwarves, colored grey', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const cell = window.worldMapData[2][14]; // inside the reserved NE block
            return { t: cell.t, o: cell.o };
        });
        expect(result.t).toBe('M');
        expect(result.o).toBe('d');
    });

    test('the mountain range is a real block, not a scattering of single hexes — big enough for Kragmoor', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const count = await page.evaluate(() => {
            let n = 0;
            for (let y = 0; y < 5; y++) {
                for (let x = 12; x < 16; x++) {
                    if (window.worldMapData[y][x].t === 'M') n++;
                }
            }
            return n;
        });
        expect(count).toBeGreaterThanOrEqual(15); // most of the reserved 4x5 block
    });

    test('the far west edge is a strip of open ocean, unclaimed by any faction', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const col0 = window.worldMapData.map(row => row[0]);
            const col1 = window.worldMapData.map(row => row[1]);
            return {
                col0AllOcean: col0.every(c => c.t === 'W'),
                col1AllOcean: col1.every(c => c.t === 'W'),
                unclaimed: col0.every(c => c.o === '') && col1.every(c => c.o === ''),
            };
        });
        expect(result.col0AllOcean).toBe(true);
        expect(result.col1AllOcean).toBe(true);
        expect(result.unclaimed).toBe(true);
    });

    test('the ocean strip is genuinely just a few tiles deep, not a wide wasted expanse', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const oceanCol2IsLand = await page.evaluate(() => window.worldMapData[5][2].t !== 'W');
        expect(oceanCol2IsLand).toBe(true);
    });

    test('existing settlement markers are untouched by the new geography', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const names = await page.evaluate(() => {
            const found = [];
            for (const row of window.worldMapData) for (const cell of row) if (cell.n) found.push(cell.n);
            return found;
        });
        expect(names).toContain('Hollowmere');
        expect(names).toContain('Silverhart');
    });
});

test.describe('World map faction borders: only the actual border edge, not the whole hex', () => {
    // drawWorldHex also draws markers/text via canvas methods (arc, fillRect,
    // fillText, etc.) this test doesn't care about — a permissive stub
    // (any unrecognized method is a no-op) avoids having to mock the whole
    // 2D context API just to observe stroke()/moveTo()/lineTo().
    function makeStubCtx(recorder) {
        const state = { last: null };
        const real = {
            beginPath() { state.last = []; },
            moveTo(px, py) { state.last.push({ x: px, y: py }); },
            lineTo(px, py) { state.last.push({ x: px, y: py }); },
            closePath() {},
            fill() {},
            stroke() { recorder(state.last, real.strokeStyle); },
        };
        return new Proxy(real, {
            get(target, prop) {
                if (prop in target) return target[prop];
                return () => {};
            },
            set(target, prop, value) { target[prop] = value; return true; },
        });
    }

    test('an interior human hex draws no border-color strokes at all', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const strokeCount = await page.evaluate((makeStubCtxSrc) => {
            eval(makeStubCtxSrc);
            // Deep interior of human territory (col < 10, away from the
            // ocean/mountain reserves and any border with orc lands).
            const { x, y } = window.worldHexToPixel(2, 5);
            const strokes = [];
            const ctx = makeStubCtx((points) => strokes.push(points));
            window.drawWorldHex(ctx, x, y, 15, window.worldMapData[5][2], 2, 5);
            // The generic faint outline stroke always fires once; anything
            // beyond that would be a border-color re-stroke.
            return strokes.length;
        }, makeStubCtx.toString());
        expect(strokeCount).toBe(1);
    });

    test('a hex right on the human/orc border draws one 2-point edge stroke per differing neighbor, never a 6-edge full outline re-stroke', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate((makeStubCtxSrc) => {
            eval(makeStubCtxSrc);
            // col 9 is human, col 10 is orc (isOrcLands = x >= 10) — (9,5) sits
            // right on that border, with no marker of its own (avoiding the
            // marker-drawing code's own stroke() calls).
            const expectedBorderCount = window.getWorldNeighbors(9, 5).filter(n => {
                const row = window.worldMapData[n.y];
                const nc = row && row[n.x];
                return nc && nc.o && nc.o !== 'h';
            }).length;
            const { x, y } = window.worldHexToPixel(9, 5);
            const strokeCalls = [];
            const ctx = makeStubCtx((points) => strokeCalls.push(points));
            window.drawWorldHex(ctx, x, y, 15, window.worldMapData[5][9], 9, 5);
            return {
                totalStrokes: strokeCalls.length,
                expectedBorderCount,
                borderStrokesAllTwoPoints: strokeCalls.slice(1).every(points => points.length === 2),
            };
        }, makeStubCtx.toString());
        expect(result.expectedBorderCount).toBeGreaterThanOrEqual(1); // sanity: this cell really is on a border
        // 1 generic outline stroke, plus exactly one 2-point edge stroke per
        // differing neighbor — never a 6-edge/full-outline re-stroke.
        expect(result.totalStrokes).toBe(1 + result.expectedBorderCount);
        expect(result.borderStrokesAllTwoPoints).toBe(true);
    });

    test('a claimed hex right on the map edge still draws a border stroke, so the outline is contiguous', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const strokeCount = await page.evaluate((makeStubCtxSrc) => {
            eval(makeStubCtxSrc);
            // Row 0 is the top map edge; col 5 is deep human territory, away
            // from any faction-differing neighbor — the only reason this
            // hex should stroke at all is the new map-edge border.
            const { x, y } = window.worldHexToPixel(5, 0);
            const strokes = [];
            const ctx = makeStubCtx((points) => strokes.push(points));
            window.drawWorldHex(ctx, x, y, 15, window.worldMapData[0][5], 5, 0);
            return strokes.length;
        }, makeStubCtx.toString());
        expect(strokeCount).toBeGreaterThan(1); // generic outline + at least one map-edge border stroke
    });

    test('border strokes on each side of a human/orc edge are pulled inward, not drawn on the exact same shared line', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate((makeStubCtxSrc) => {
            eval(makeStubCtxSrc);
            const humanHex = window.worldMapData[5][9];
            const orcHex = window.worldMapData[5][10];
            const { x: hx, y: hy } = window.worldHexToPixel(9, 5);
            const { x: ox, y: oy } = window.worldHexToPixel(10, 5);
            const humanStrokes = [];
            window.drawWorldHex(makeStubCtx((pts) => humanStrokes.push(pts)), hx, hy, 15, humanHex, 9, 5);
            const orcStrokes = [];
            window.drawWorldHex(makeStubCtx((pts) => orcStrokes.push(pts)), ox, oy, 15, orcHex, 10, 5);
            // Compare the border-facing stroke each side drew (skip index 0,
            // the generic outline) — they should not be the same segment.
            const humanBorder = humanStrokes[1];
            const orcBorder = orcStrokes.find(pts => pts.length === 2);
            return { humanBorder, orcBorder };
        }, makeStubCtx.toString());
        expect(result.humanBorder).toBeTruthy();
        expect(result.orcBorder).toBeTruthy();
        expect(result.humanBorder).not.toEqual(result.orcBorder);
    });
});

test.describe('World map: dwarf/orc border trade and southern elf forest', () => {
    test('4 northmost orc tiles flip to dwarven, pulling Kragmoor down to border the humans directly', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => ({
            row0: [window.worldMapData[0][10].o, window.worldMapData[0][11].o],
            row1: [window.worldMapData[1][10].o, window.worldMapData[1][11].o],
        }));
        expect(result.row0).toEqual(['d', 'd']);
        expect(result.row1).toEqual(['d', 'd']);
    });

    test('4 southmost mountain tiles trade back to the orcs, keeping the swap even', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => window.worldMapData[4].slice(12, 16).map(c => c.o));
        expect(result).toEqual(['o', 'o', 'o', 'o']);
    });

    test('a forested elven realm spans the southern edge, reaching the ocean in the west', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const southRow = window.worldMapData[15];
            return {
                nearOcean: southRow[2].t, nearOceanFaction: southRow[2].o,
                capital: (() => { for (const row of window.worldMapData) { const f = row.find(c => c.n === "Sil'thandriel"); if (f) return f; } return null; })(),
            };
        });
        expect(result.nearOcean).toBe('F');
        expect(result.nearOceanFaction).toBe('e');
        expect(result.capital).not.toBeNull();
        expect(result.capital.f).toBe('K');
        expect(result.capital.o).toBe('e');
    });
});

test.describe('World map river: mountain to ocean', () => {
    test('the river\'s west end runs into the ocean strip and its east end touches the mountain range', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const path = window.worldRiverPath || [];
            const first = path[0];
            const last = path[path.length - 1];
            return {
                firstCellIsOcean: window.worldMapData[first.y][first.x].t === 'W',
                lastX: last.x, lastY: last.y,
            };
        });
        expect(result.firstCellIsOcean).toBe(true);
        expect(result.lastX).toBeGreaterThanOrEqual(14);
        expect(result.lastY).toBeLessThanOrEqual(4); // touches the mountain block's southern edge
    });
});
