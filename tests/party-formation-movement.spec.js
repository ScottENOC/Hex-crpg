const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('group-move formation destination safety', () => {
    test('a follower whose "close" formation offset would land inside a wall gets snapped to the nearest passable hex instead of silently halting', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Build a small isolated wall so a known offset is guaranteed blocked,
            // regardless of where Hollowmere's real buildings happen to sit.
            const leaderHex = { q: 60, r: 60 };
            window.setTerrainAt(61, 60, 'Wall'); // directly east of the leader's target

            const leader = window.entities.find(e => e.name === window.party[0].name);
            leader.hex = { q: leaderHex.q - 1, r: leaderHex.r };

            const follower = window.entities.find(e => e.name === 'Wren Talbot');
            // Position the follower 1 hex east of the leader *before* the move -
            // "close" formation preserves this relative offset onto the new destination.
            follower.hex = { q: leaderHex.q, r: leaderHex.r };

            window.assignGroupMoveDestinations(leader, leaderHex);

            return {
                followerDestination: follower.destination,
                rawWouldHaveBeen: { q: leaderHex.q + 1, r: leaderHex.r },
                blockedTerrain: window.getTerrainAt(leaderHex.q + 1, leaderHex.r).name
            };
        });

        expect(result.blockedTerrain).toBe('Wall');
        expect(result.followerDestination).toBeTruthy();
        // Must NOT be the wall hex itself.
        expect(result.followerDestination).not.toEqual(result.rawWouldHaveBeen);
        const dest = await page.evaluate((d) => window.getTerrainAt(d.q, d.r).name, result.followerDestination);
        expect(dest).not.toBe('Wall');
    });
});
