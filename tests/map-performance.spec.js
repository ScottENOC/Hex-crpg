// tests/map-performance.spec.js
// Zooming out enough used to freeze the game: at extreme zoom the number of
// on-screen hexes explodes quadratically, and every hex was re-clipping and
// re-drawing its terrain image from scratch every single frame. Fixed with
// (1) a pre-rendered hex-tile cache (hexMap.js's getCachedHexTile) so a
// given terrain/zoom only pays the clip+draw cost once, and (2) a tighter
// minimum zoom (0.15, was 0.05) bounding the worst-case hex count.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('map rendering performance at extreme zoom', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('scrolling the mouse wheel out as far as possible never drops below the 0.15 zoom floor', async ({ page }) => {
        const finalZoom = await page.evaluate(async () => {
            const canvas = window.mapCanvas;
            const rect = canvas.getBoundingClientRect();
            for (let i = 0; i < 200; i++) {
                canvas.dispatchEvent(new WheelEvent('wheel', {
                    deltaY: 100, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
                    bubbles: true, cancelable: true,
                }));
            }
            return window.cameraZoom;
        });
        expect(finalZoom).toBeGreaterThanOrEqual(0.15);
        expect(finalZoom).toBeLessThan(0.2); // confirms it actually reached the floor, not just started high
    });

    test('drawMap + renderEntities stays fast even zoomed all the way out across a heavily-explored world', async ({ page }) => {
        const ms = await page.evaluate(() => {
            // Simulate a large amount of prior exploration (the worst case
            // for hex count, since drawMap renders explored-but-not-visible
            // hexes too, not just what's immediately in sight).
            for (let q = -600; q <= 600; q += 3) {
                for (let r = -600; r <= 600; r += 3) {
                    window.exploredHexes.add(`${q},${r}`);
                }
            }
            window.cameraZoom = 0.15;
            window.drawMap(); // warm the tile cache
            window.renderEntities();
            const t0 = performance.now();
            window.drawMap();
            window.renderEntities();
            return performance.now() - t0;
        });
        // Comfortably fast (was ~190ms/5fps at the old 0.05 floor with this
        // much explored terrain); generous margin for CI variance.
        expect(ms).toBeLessThan(120);
    });

    test('the hex tile cache makes a second draw at the same zoom meaningfully cheaper than the first', async ({ page }) => {
        const result = await page.evaluate(() => {
            for (let q = -400; q <= 400; q += 3) {
                for (let r = -400; r <= 400; r += 3) {
                    window.exploredHexes.add(`${q},${r}`);
                }
            }
            window.cameraZoom = 0.15;
            const t0 = performance.now();
            window.drawMap();
            const firstMs = performance.now() - t0;

            const t1 = performance.now();
            window.drawMap();
            const secondMs = performance.now() - t1;

            return { firstMs, secondMs };
        });
        expect(result.secondMs).toBeLessThan(result.firstMs);
    });

    // sceneNeedsRedraw (gameEngine.js) — the real-time tick's redraw call
    // skips entirely (not just throttles) when nothing that could change
    // the picture has happened: no camera pan/zoom, no entity mid-move, no
    // transient FX in flight, no light-level drift. This is the bigger win
    // over the ~60Hz throttle alone for how most play sessions actually
    // spend their time (standing still, reading dialogue, idling).
    test('drawMap/renderEntities are skipped entirely while the scene is truly idle', async ({ page }) => {
        const result = await page.evaluate(async () => {
            window._resetRenderPacing();
            let drawCalls = 0, renderCalls = 0;
            const realDraw = window.drawMap, realRender = window.renderEntities;
            window.drawMap = (...a) => { drawCalls++; return realDraw(...a); };
            window.renderEntities = (...a) => { renderCalls++; return realRender(...a); };

            // Let a few ticks pass with the player stationary and nothing animating.
            await new Promise(r => setTimeout(r, 300));

            window.drawMap = realDraw;
            window.renderEntities = realRender;
            return { drawCalls, renderCalls };
        });
        expect(result.drawCalls).toBe(0);
        expect(result.renderCalls).toBe(0);
    });

    test('drawMap/renderEntities still redraw every ~60Hz frame while an entity is actually moving', async ({ page }) => {
        const result = await page.evaluate(async () => {
            window._resetRenderPacing();
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.destination = { q: player.hex.q + 20, r: player.hex.r };

            let drawCalls = 0;
            const realDraw = window.drawMap;
            window.drawMap = (...a) => { drawCalls++; return realDraw(...a); };

            await new Promise(r => setTimeout(r, 300));

            window.drawMap = realDraw;
            return { drawCalls, stillMoving: !!player.destination };
        });
        expect(result.drawCalls).toBeGreaterThan(5); // ~300ms at up to 60Hz — comfortably more than a handful
        expect(result.stillMoving).toBe(true); // sanity: the move genuinely hadn't finished (20 hexes takes a while)
    });

    // hexMap.js's terrain buffer (see comment above renderTerrainPass): the
    // terrain-image pass is cached into an offscreen canvas anchored to the
    // camera, and small pans just blit that buffer at an offset instead of
    // re-walking every hex. This is the fix for "panning the camera feels
    // terrible on a phone even though the idle-skip already helps standing
    // still" — a small in-buffer pan should cost meaningfully less than the
    // first draw that had to build the buffer from scratch.
    test('small camera pans within the terrain buffer slack are cheaper than the draw that built it', async ({ page }) => {
        const result = await page.evaluate(() => {
            for (let q = -200; q <= 200; q += 2) {
                for (let r = -200; r <= 200; r += 2) {
                    window.exploredHexes.add(`${q},${r}`);
                }
            }
            window.cameraZoom = 1.0;
            const t0 = performance.now();
            window.drawMap(); // builds the terrain buffer from scratch
            const firstMs = performance.now() - t0;

            window.cameraX += 5; // small pan, well within the buffer's slack margin
            window.cameraY += 5;
            const t1 = performance.now();
            window.drawMap(); // should just blit the existing buffer
            const secondMs = performance.now() - t1;

            return { firstMs, secondMs };
        });
        expect(result.secondMs).toBeLessThan(result.firstMs);
    });

    // gameEngine.js's adaptive render-interval cap: a device too slow to
    // paint at 60fps gets backed off to a lower, achievable target instead of
    // every redraw arriving late. Simulated here by directly feeding a high
    // cost sample rather than by making the test environment itself slow.
    test('feeding a sustained high render cost backs the redraw interval off below 60fps', async ({ page }) => {
        const finalInterval = await page.evaluate(() => {
            window._resetRenderPacing();
            const start = window._getRenderIntervalMs();
            for (let i = 0; i < 20; i++) window._recordRenderCost(40); // consistently slower than a 16ms budget
            return { start, end: window._getRenderIntervalMs() };
        });
        expect(finalInterval.start).toBe(16);
        expect(finalInterval.end).toBeGreaterThan(16);
    });
});
