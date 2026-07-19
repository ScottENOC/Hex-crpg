// Fog of war/exploration (updateExploration, hexMap.js) previously only ran
// on the out-of-combat periodic tick (see tick(), gameEngine.js) plus once at
// the very start of a fight (wakeUp()). A fight that starts in previously
// unexplored terrain — an ambush, ranging into a wandering monster — then
// stayed pitch black around the party for the fight's entire remaining
// duration, no matter how the party actually moved, since nothing ever
// re-ran updateExploration() while isInCombat stayed true. Fixed by also
// refreshing it once per player-controlled character's turn (takeTurn,
// gameEngine.js's isSentientAlly branch).
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('exploration keeps updating during combat, not just the out-of-combat tick', () => {
    test('a player character\'s turn in combat reveals hexes newly in range, not just what was explored before the fight started', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            // Move the player somewhere with hexes guaranteed never explored
            // before (far from spawn), then reset exploredHexes entirely so
            // nothing nearby counts as already-seen.
            player.hex = { q: 500, r: 500 };
            window.exploredHexes = new Set();
            window.lastSeenTimeMap = {};

            const enemy = window.createMonster('goblin', { q: 502, r: 500 }, null, null, 'enemy');
            window.entities.push(enemy);
            window.isInCombat = true;
            window.currentTurnEntity = player;
            player.timePoints = 100;

            const beforeCount = window.exploredHexes.size;
            window.takeTurn(player);
            const afterCount = window.exploredHexes.size;
            const ownHexExplored = window.exploredHexes.has(`${player.hex.q},${player.hex.r}`);

            return { beforeCount, afterCount, ownHexExplored };
        });
        expect(result.beforeCount).toBe(0);
        expect(result.afterCount).toBeGreaterThan(0);
        expect(result.ownHexExplored).toBe(true);
    });
});
