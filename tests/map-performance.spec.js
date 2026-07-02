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
});
