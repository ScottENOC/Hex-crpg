const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('zoom LOD', () => {
    test('skips only far-zoom map detail and leaves normal zoom untouched', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__zoomLodInstalled && window.zoomLodStats && window.mapCtx);

        const result = await page.evaluate(() => {
            const ctx = window.mapCtx;
            const source = document.createElement('canvas');
            source.width = 8;
            source.height = 8;
            const before = { ...window.zoomLodStats };
            const savedZoom = window.cameraZoom;

            try {
                window.cameraZoom = 0.15;
                ctx.drawImage(source, 0, 0, 1, 1); // generic micro draw: should be skipped
                const afterFar = { ...window.zoomLodStats };

                window.cameraZoom = 1.0;
                ctx.drawImage(source, 0, 0, 1, 1); // full zoom: must pass through
                const afterFull = { ...window.zoomLodStats };

                return {
                    tierFar: window.getZoomLodTier(0.15),
                    tierMedium: window.getZoomLodTier(0.35),
                    tierFull: window.getZoomLodTier(1.0),
                    farMicroDelta: afterFar.skippedMicro - before.skippedMicro,
                    fullMicroDelta: afterFull.skippedMicro - afterFar.skippedMicro,
                };
            } finally {
                window.cameraZoom = savedZoom;
            }
        });

        expect(result.tierFar).toBe('far');
        expect(result.tierMedium).toBe('medium');
        expect(result.tierFull).toBe('full');
        expect(result.farMicroDelta).toBe(1);
        expect(result.fullMicroDelta).toBe(0);
    });

    test('does not alter gameplay visibility or pathfinding APIs', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__zoomLodInstalled && window.isVisibleToPlayer && window.findPath);

        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.alive && e.side === 'player');
            const target = { q: player.hex.q, r: player.hex.r };
            const savedZoom = window.cameraZoom;
            try {
                window.cameraZoom = 0.15;
                return {
                    visible: window.isVisibleToPlayer(target),
                    findPathType: typeof window.findPath,
                    tier: window.getZoomLodTier(),
                };
            } finally {
                window.cameraZoom = savedZoom;
            }
        });

        expect(result.visible).toBe(true);
        expect(result.findPathType).toBe('function');
        expect(result.tier).toBe('far');
    });
});
