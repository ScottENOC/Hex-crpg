// tests/road-graph.spec.js
// Road-network census: buildRoadGraph (hexMap.js) flood-fills every painted
// 'Path' hex into connected components. This isn't a claim that the world
// *should* be one connected network ("all roads lead to Rome") — today it
// isn't, several spurs/forts are painted as separate islands. The point is
// to pin down the count so a future road-painting change that accidentally
// disconnects (or connects) a network shows up as an intentional test edit,
// not a silent regression.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('road graph', () => {
    test('road terrain forms a known, fixed number of connected networks', async ({ page }) => {
        await createCharacter(page);
        const graph = await page.evaluate(() => window._roadGraph);
        expect(graph).toBeTruthy();
        expect(graph.hexCount).toBeGreaterThan(0);
        expect(graph.componentCount).toBe(9);
    });

    test('painting a fresh isolated road spur is reflected as a new component on rebuild', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.buildRoadGraph();
            // Paint a short Path segment far from any existing road, with no
            // adjacency to anything already in the graph.
            for (let i = 0; i < 3; i++) window.setTerrainAt(2000 + i, 2000, 'Path');
            const after = window.buildRoadGraph();
            return { beforeCount: before.componentCount, afterCount: after.componentCount, beforeHexes: before.hexCount, afterHexes: after.hexCount };
        });
        expect(result.afterCount).toBe(result.beforeCount + 1);
        expect(result.afterHexes).toBe(result.beforeHexes + 3);
    });
});
