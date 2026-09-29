const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('pathfinding fast path', () => {
    test('realtime player routing skips occupancy visibility while combat keeps it', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__pathfindingFastPathInstalled && window.performancePathfindingStats);

        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
            if (!player) return { ok: false, reason: 'no player' };

            const start = { q: player.hex.q, r: player.hex.r };
            const target = window.getNeighbors(start.q, start.r).find(h => {
                const terrain = window.getTerrainAtFloor(h.q, h.r, player.floor || 0);
                const occupied = window.entities.some(e => e.alive && e.hex?.q === h.q && e.hex?.r === h.r && (e.floor || 0) === (player.floor || 0));
                return !terrain.impassable && !occupied;
            });
            if (!target) return { ok: false, reason: 'no unoccupied adjacent route' };

            const savedVisible = window.isVisibleToPlayer;
            const savedExplored = window.isHexExplored;
            const savedCombat = window.isInCombat;
            let visibleCalls = 0;
            let exploredCalls = 0;

            window.isVisibleToPlayer = (...args) => {
                visibleCalls++;
                return savedVisible(...args);
            };
            window.isHexExplored = (...args) => {
                exploredCalls++;
                return savedExplored(...args);
            };

            const before = { ...window.performancePathfindingStats };
            // Give the synthetic NPC the minimum real entity state used by
            // occupancy/path rules. The previous fixture omitted its hex and
            // could fail before reaching the fast-path behaviour under test.
            const npc = {
                side: 'neutral', name: 'Path Perf NPC', alive: true,
                hex: { ...start }, floor: player.floor || 0,
                equipped: {}, skills: {}, prefersRoads: false
            };
            const preferred = [`${start.q},${start.r}`, `${target.q},${target.r}`];

            try {
                window.isInCombat = false;
                const npcPath = window.findPath(start, target, undefined, npc, true, preferred);
                const npcCounts = { visibleCalls, exploredCalls };

                visibleCalls = 0;
                exploredCalls = 0;
                const realtimePlayerPath = window.findPath(start, target, undefined, player, true, preferred);
                const realtimeCounts = { visibleCalls, exploredCalls };

                visibleCalls = 0;
                exploredCalls = 0;
                window.isInCombat = true;
                const combatPlayerPath = window.findPath(start, target, undefined, player, true, preferred);
                const combatCounts = { visibleCalls, exploredCalls };

                const after = window.performancePathfindingStats;
                return {
                    ok: true,
                    npcPathLength: npcPath?.length || 0,
                    realtimePlayerPathLength: realtimePlayerPath?.length || 0,
                    combatPlayerPathLength: combatPlayerPath?.length || 0,
                    npcCounts,
                    realtimeCounts,
                    combatCounts,
                    optimizedNpcDelta: after.optimizedNpcCalls - before.optimizedNpcCalls,
                    realtimeOptimizedDelta: after.realtimePlayerOptimized - before.realtimePlayerOptimized,
                    combatPlayerDelta: after.combatPlayerCalls - before.combatPlayerCalls,
                    preferredSetDelta: after.preferredSetCalls - before.preferredSetCalls
                };
            } finally {
                window.isInCombat = savedCombat;
                window.isVisibleToPlayer = savedVisible;
                window.isHexExplored = savedExplored;
            }
        });

        expect(result.ok).toBe(true);
        expect(result.npcPathLength).toBeGreaterThan(0);
        expect(result.realtimePlayerPathLength).toBeGreaterThan(0);
        expect(result.combatPlayerPathLength).toBeGreaterThan(0);

        expect(result.npcCounts.visibleCalls).toBe(0);
        expect(result.npcCounts.exploredCalls).toBe(0);

        // Realtime player routing still consults exploration/terrain knowledge,
        // but does not waste time checking actor visibility/occupancy.
        expect(result.realtimeCounts.visibleCalls).toBe(0);
        expect(result.realtimeCounts.exploredCalls).toBeGreaterThan(0);

        // Turn-based combat retains the original side-aware occupancy rules.
        expect(result.combatCounts.visibleCalls).toBeGreaterThan(0);
        expect(result.combatCounts.exploredCalls).toBeGreaterThan(0);

        expect(result.optimizedNpcDelta).toBeGreaterThan(0);
        expect(result.realtimeOptimizedDelta).toBeGreaterThan(0);
        expect(result.combatPlayerDelta).toBeGreaterThan(0);
        expect(result.preferredSetDelta).toBeGreaterThanOrEqual(3);
    });
});
