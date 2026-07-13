// tests/road-graph.spec.js
// Road-network census: buildRoadGraph (hexMap.js) flood-fills every painted
// 'Path' hex into connected components. World-build now runs
// connectAllRoadNetworks (greedily bridges any disconnected islands with a
// straight Path connector) so "all roads lead to Rome" - one single network
// - is the actual invariant, not just an observed count. If a future road
// addition creates a genuinely-intentional isolated network, this test
// needs an explicit update, not a silent pass.
//
// Silverhart's own curtain-wall gate is exactly that exception: it's a real
// locked checkpoint (Palisade Wall terrain, not Path — see
// buildSilverhartPalace, campaign2World.js), so the interior road network
// (great hall onward) is genuinely NOT reachable via the Path graph without
// going through that gate — connectAllRoadNetworks correctly refuses to
// paint a connector straight through a wall to "fix" that. A second
// component whose hexes sit inside the curtain wall is that intentional
// gate, not a regression.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('road graph', () => {
    test('all road terrain forms a single connected network, except Silverhart\'s own gated interior', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const graph = window._roadGraph;
            const throneCenter = window.campaign2PalaceThroneCenter;
            // A Path hex in the courtyard, between the throne room's own
            // door and the (locked) compound gate — genuinely inside the
            // curtain wall.
            const throneComponent = graph.componentOf.get(`${throneCenter.q},${throneCenter.r + 10}`);
            return {
                hexCount: graph.hexCount,
                componentCount: graph.componentCount,
                throneComponentDiffersFromCrossroads: throneComponent !== undefined && throneComponent !== graph.componentOf.get(`${window.campaign2Landmarks.crossroads.q},${window.campaign2Landmarks.crossroads.r}`),
            };
        });
        expect(result.hexCount).toBeGreaterThan(0);
        expect(result.componentCount).toBe(2);
        expect(result.throneComponentDiffersFromCrossroads).toBe(true);
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
