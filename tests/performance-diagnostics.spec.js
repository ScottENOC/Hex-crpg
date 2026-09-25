const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('extended performance diagnostics', () => {
    test('distance zero and one are always visible while distance two keeps normal visibility semantics', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__adjacentVisibilityRuleInstalled && window.getExtendedPerformanceDiagnostics);

        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.alive && e.side === 'player');
            const visible = window.isVisibleToPlayer;
            const normal = visible.__original;
            if (!player || typeof normal !== 'function') return { ok: false };

            const neighbours = window.getNeighbors(player.hex.q, player.hex.r);
            const first = neighbours[0];
            const second = first && window.getNeighbors(first.q, first.r)
                .find(h => window.distance(player.hex, h) === 2);
            if (!first || !second) return { ok: false };

            const own = visible({ q: player.hex.q, r: player.hex.r });
            const adjacent = neighbours.map(h => visible(h));
            const expectedDistanceTwo = normal(second);
            const actualDistanceTwo = visible(second);
            return { ok: true, own, adjacent, expectedDistanceTwo, actualDistanceTwo };
        });

        expect(result.ok).toBe(true);
        expect(result.own).toBe(true);
        expect(result.adjacent.every(Boolean)).toBe(true);
        expect(result.actualDistanceTwo).toBe(result.expectedDistanceTwo);
    });

    test('reports render census, distributions and terrain buffer rebuilds', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.getRenderPerformanceCensus && window.performanceTerrainRebuildStats);

        await page.evaluate(() => {
            if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
            window.drawMap();
        });
        await page.waitForTimeout(100);

        const result = await page.evaluate(() => ({
            census: window.getRenderPerformanceCensus(),
            terrain: { ...window.performanceTerrainRebuildStats },
            text: window.getExtendedPerformanceDiagnostics(false)
        }));

        expect(result.census.entityAliveFloor).toBeGreaterThan(0);
        expect(result.census.entityInBounds).toBeLessThanOrEqual(result.census.entityAliveFloor);
        expect(result.census.tileObjectsInBounds).toBeLessThanOrEqual(result.census.tileObjectsTotal);
        expect(result.census.mapItemHexesInBounds).toBeLessThanOrEqual(result.census.mapItemHexesTotal);
        expect(result.text).toContain('EXTENDED RENDER DIAGNOSTICS');
        expect(result.text).toContain('Render census:');
        expect(result.text).toContain('Ring propagation experiment:');
        expect(result.terrain.rebuilds).toBeGreaterThanOrEqual(0);
    });
});
