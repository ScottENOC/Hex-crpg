// tests/world-map-geography.spec.js
// World map tile colors now mean something real: mountain terrain ('M')
// renders grey and marks out a real range (big enough for a future dwarven
// kingdom), and a strip of open ocean ('W', using the new Deep Water local
// terrain type) borders the far east edge. The river flows from the
// mountain range to that ocean, not just an arbitrary west-to-east line.

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
    test('a real mountain range sits in the NW corner, unclaimed by any faction, colored grey', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const cell = window.worldMapData[2][1]; // inside the reserved NW block
            return { t: cell.t, o: cell.o };
        });
        expect(result.t).toBe('M');
        expect(result.o).toBe('');
    });

    test('the mountain range is a real block, not a scattering of single hexes — big enough for a future kingdom', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const count = await page.evaluate(() => {
            let n = 0;
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 4; x++) {
                    if (window.worldMapData[y][x].t === 'M') n++;
                }
            }
            return n;
        });
        expect(count).toBeGreaterThanOrEqual(15); // most of the reserved 4x5 block
    });

    test('the far east edge is a strip of open ocean, unclaimed by any faction', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const col14 = window.worldMapData.map(row => row[14]);
            const col15 = window.worldMapData.map(row => row[15]);
            return {
                col14AllOcean: col14.every(c => c.t === 'W'),
                col15AllOcean: col15.every(c => c.t === 'W'),
                unclaimed: col14.every(c => c.o === '') && col15.every(c => c.o === ''),
            };
        });
        expect(result.col14AllOcean).toBe(true);
        expect(result.col15AllOcean).toBe(true);
        expect(result.unclaimed).toBe(true);
    });

    test('the ocean strip is genuinely just a few tiles deep, not a wide wasted expanse', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const oceanCol13IsLand = await page.evaluate(() => window.worldMapData[5][13].t !== 'W');
        expect(oceanCol13IsLand).toBe(true);
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
});

test.describe('World map river: mountain to ocean', () => {
    test('the river\'s west end touches the mountain range and its east end runs into the ocean strip', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const path = window.worldRiverPath || [];
            const first = path[0];
            const last = path[path.length - 1];
            return {
                firstX: first.x, firstY: first.y,
                lastX: last.x, lastY: last.y,
                lastCellIsOcean: window.worldMapData[last.y][last.x].t === 'W',
            };
        });
        expect(result.firstX).toBeLessThanOrEqual(1);
        expect(result.firstY).toBeLessThanOrEqual(4); // touches the mountain block's southern edge
        expect(result.lastCellIsOcean).toBe(true);
    });
});
