// tests/road-graph.spec.js
// Road-network census: buildRoadGraph (hexMap.js) flood-fills every painted
// 'Path' hex into connected components. World-build now runs
// connectAllRoadNetworks (greedily bridges any disconnected islands with a
// straight Path connector) so "all roads lead to Rome" - one single network
// - is the actual invariant, not just an observed count. If a future road
// addition creates a genuinely-intentional isolated network, this test
// needs an explicit update, not a silent pass.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('road graph', () => {
    test('all road terrain forms a single connected network', async ({ page }) => {
        await createCharacter(page);
        const graph = await page.evaluate(() => window._roadGraph);
        expect(graph).toBeTruthy();
        expect(graph.hexCount).toBeGreaterThan(0);
        expect(graph.componentCount).toBe(1);
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
