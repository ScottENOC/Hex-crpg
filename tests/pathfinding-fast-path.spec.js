const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('pathfinding fast path', () => {
    test('NPC routing skips player-only visibility checks while player routing keeps them', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__pathfindingFastPathInstalled && window.performancePathfindingStats);

        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.alive && e.side === 'player');
            if (!player) return { ok: false, reason: 'no player' };

            const start = { q: player.hex.q, r: player.hex.r };
            const target = window.getNeighbors(start.q, start.r)
                .find(h => !window.getTerrainAtFloor(h.q, h.r, player.floor || 0).impassable);
            if (!target) return { ok: false, reason: 'no adjacent route' };

            const savedVisible = window.isVisibleToPlayer;
            const savedExplored = window.isHexExplored;
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
            const npc = {
                side: 'neutral', name: 'Path Perf NPC', floor: player.floor || 0,
                equipped: null, skills: {}, prefersRoads: false
            };
            const npcPath = window.findPath(start, target, undefined, npc, true, [`${start.q},${start.r}`, `${target.q},${target.r}`]);
            const npcCounts = { visibleCalls, exploredCalls };

            visibleCalls = 0;
            exploredCalls = 0;
            const playerPath = window.findPath(start, target, undefined, player, true, [`${start.q},${start.r}`, `${target.q},${target.r}`]);
            const playerCounts = { visibleCalls, exploredCalls };

            window.isVisibleToPlayer = savedVisible;
            window.isHexExplored = savedExplored;

            const after = window.performancePathfindingStats;
            return {
                ok: true,
                npcPathLength: npcPath?.length || 0,
                playerPathLength: playerPath?.length || 0,
                npcCounts,
                playerCounts,
                optimizedNpcDelta: after.optimizedNpcCalls - before.optimizedNpcCalls,
                preferredSetDelta: after.preferredSetCalls - before.preferredSetCalls
            };
        });

        expect(result.ok).toBe(true);
        expect(result.npcPathLength).toBeGreaterThan(0);
        expect(result.playerPathLength).toBeGreaterThan(0);
        expect(result.npcCounts.visibleCalls).toBe(0);
        expect(result.npcCounts.exploredCalls).toBe(0);
        expect(result.playerCounts.visibleCalls).toBeGreaterThan(0);
        expect(result.playerCounts.exploredCalls).toBeGreaterThan(0);
        expect(result.optimizedNpcDelta).toBeGreaterThan(0);
        expect(result.preferredSetDelta).toBeGreaterThanOrEqual(2);
    });
});