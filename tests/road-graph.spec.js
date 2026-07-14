// tests/road-graph.spec.js
// Road-network census: buildRoadGraph (hexMap.js) flood-fills every painted
// 'Path' hex into connected components. World-build now runs
// connectAllRoadNetworks (greedily bridges any disconnected islands with a
// straight Path connector) so "all roads lead to Rome" - one single network
// - is the actual invariant, not just an observed count. If a future road
// addition creates a genuinely-intentional isolated network, this test
// needs an explicit update, not a silent pass.
//
// Silverhart's curtain-wall gate used to be a real locked checkpoint
// (Palisade Wall terrain with a reputation-gated door, not Path), which
// made the interior road network its own separate, intentional component.
// Per the player's request that door is gone — the gate is now a plain,
// permanently open Path approach — so the whole map genuinely is one
// single connected network now, no carve-out needed.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('road graph', () => {
    test('all road terrain forms a single connected network', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const graph = window._roadGraph;
            const throneCenter = window.campaign2PalaceThroneCenter;
            // A Path hex in the courtyard, just inside the curtain wall —
            // now reachable through the (no longer gated) entrance.
            const throneComponent = graph.componentOf.get(`${throneCenter.q},${throneCenter.r + 10}`);
            return {
                hexCount: graph.hexCount,
                componentCount: graph.componentCount,
                throneComponentMatchesCrossroads: throneComponent !== undefined && throneComponent === graph.componentOf.get(`${window.campaign2Landmarks.crossroads.q},${window.campaign2Landmarks.crossroads.r}`),
            };
        });
        expect(result.hexCount).toBeGreaterThan(0);
        expect(result.componentCount).toBe(1);
        expect(result.throneComponentMatchesCrossroads).toBe(true);
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
