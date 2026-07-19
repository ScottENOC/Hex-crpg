// Reported: turn-based combat movement looked broken (a character stopping
// short of where clicked, catching up only on some later, unrelated turn) —
// but only when Move Group was left ON going into the fight. Move Group is a
// real-time-only mechanic: assignGroupMoveDestinations (gameEngine.js)
// assigns each follower a formation-offset .destination, stepped by the
// real-time movement loop in tick() only while !isInCombat. wakeUp() already
// nulls every party member's own .destination when a fight starts, but left
// groupMoveMode/groupLeader/leaderPath itself untouched — now cleared too,
// so there's nothing left over from group-follow state for combat's
// turn-based movement to collide with.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Move Group state is cleared when combat starts', () => {
    test('wakeUp() turns groupMoveMode off and clears groupLeader/leaderPath, on top of nulling destinations', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.destination = { q: 20, r: 0 };
            window.groupMoveMode = true;
            window.groupLeader = player;
            window.leaderPath = ['1,0', '2,0', '3,0'];

            const enemy = window.createMonster('goblin', { q: 5, r: 0 }, null, null, 'enemy');
            window.entities.push(enemy);
            window.wakeUp(enemy);

            return {
                groupMoveMode: window.groupMoveMode,
                groupLeader: window.groupLeader,
                leaderPath: window.leaderPath,
                playerDestination: player.destination,
            };
        });
        expect(result.groupMoveMode).toBe(false);
        expect(result.groupLeader).toBe(null);
        expect(result.leaderPath).toBe(null);
        expect(result.playerDestination).toBe(null);
    });

    test('a follower with a leftover group-move destination has it nulled too, not just the entity that triggered wakeUp', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const leader = window.entities.find(e => e.side === 'player' && !e.rider);
            const follower = window.party.length > 1
                ? window.entities.find(e => e.side === 'player' && e.name === window.party[1].name)
                : window.entities.find(e => e.side === 'player' && e !== leader && !e.rider);
            if (!follower) return { skipped: true };
            follower.destination = { q: 15, r: 3 };
            window.groupMoveMode = true;

            const enemy = window.createMonster('goblin', { q: 5, r: 0 }, null, null, 'enemy');
            window.entities.push(enemy);
            window.wakeUp(enemy);

            return { skipped: false, followerDestination: follower.destination, groupMoveMode: window.groupMoveMode };
        });
        if (result.skipped) return;
        expect(result.followerDestination).toBe(null);
        expect(result.groupMoveMode).toBe(false);
    });
});
