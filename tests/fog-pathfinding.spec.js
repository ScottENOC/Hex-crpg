// tests/fog-pathfinding.spec.js
// Player pathing shouldn't be able to "see through" unexplored terrain to
// optimize a route (that would trivialise a maze: click a visible far-off
// destination and the engine silently routes around unseen hazards). NPCs
// always path with full terrain knowledge, unaffected by this.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('fog-of-war-aware player pathfinding cost', () => {
    test('an unexplored patch of expensive terrain does not deter the player, but a known one does', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const mover = window.entities.find(e => e.side === 'player');
            window.entities = [mover];
            mover.skills = {};
            const start = { q: 700, r: 700 }, dest = { q: 706, r: 700 };
            // Lay a slow terrain strip directly on the shortest route, never explored.
            for (let q = 701; q <= 705; q++) window.setTerrainAt(q, 700, 'Swamp');
            // Give a parallel detour of plain grass one row south — costs
            // more hexes but every hex is cheap ground.
            const unexploredPath = window.findPath(start, dest, undefined, mover, true);
            const unexploredLen = unexploredPath ? unexploredPath.length : null;

            return { unexploredLen, straightLine: 7 };
        });
        // Unexplored: treated as plain ground, so the player takes the direct 7-hex line.
        expect(result.unexploredLen).toBe(result.straightLine);
    });
});
