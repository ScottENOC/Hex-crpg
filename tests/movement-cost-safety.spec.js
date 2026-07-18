// Reported: the "max all skills" cheat put 100 ranks into Fast Movement,
// driving move TP cost negative (a net TP *gain* per step) and effectively
// breaking combat. Fixed two ways: (1) Fast Movement is now capped at 1 rank
// (skills.js) — it still stacks with Swift Step, just can't itself be
// stacked; both cheatMaxSkills (main.js) and cheatMaxAllSkills
// (campaign2World.js) already respect skill.maxRanks, so this alone caps
// what either cheat can grant. (2) Every place that computes a movement TP
// cost (playerMoveProcess, autoMoveProcess, processRealTimeStep, aiProcess,
// and updatePlayerUI's highlight-range BFS — all gameEngine.js) now clamps
// the final per-step cost to a floor of 1, so even a cost that somehow ends
// up <= 0 is treated as costing 1 TP instead of being free or refunding TP.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Fast Movement is capped at 1 rank', () => {
    test('skills.js caps fastMovement at maxRanks: 1', async ({ page }) => {
        await createCharacter(page);
        const maxRanks = await page.evaluate(() => window.skills.fastMovement.maxRanks);
        expect(maxRanks).toBe(1);
    });

    test('cheatMaxSkills grants at most 1 rank of fastMovement to every party member', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.cheatMaxSkills();
            return window.party.map(p => p.skills.fastMovement || 0);
        });
        for (const ranks of result) expect(ranks).toBeLessThanOrEqual(1);
    });

    test('cheatMaxAllSkills grants at most 1 rank of fastMovement', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.cheatMaxAllSkills();
            return window.party[0].skills.fastMovement || 0;
        });
        expect(result).toBeLessThanOrEqual(1);
    });
});

test.describe('movement TP cost can never be zero or negative', () => {
    test('playerMoveProcess clamps the per-step TP cost to a floor of 1, even with an artificially huge fastMovement rank', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: 0, r: 0 };
            player.timePoints = 100;
            player.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
            player.skills = { ...player.skills, fastMovement: 100, swift_step: 5 };
            window.isInCombat = false;
            window.playerMoveProcess(player, [{ q: 1, r: 0 }]);
            return { timePoints: player.timePoints, hex: { ...player.hex } };
        });
        expect(result.hex).toEqual({ q: 1, r: 0 });
        // A single flat move (no terrain penalty) must cost at least 1 TP —
        // before the clamp, 100 ranks of fastMovement drove this negative,
        // meaning timePoints would have gone UP instead of down.
        expect(result.timePoints).toBeLessThanOrEqual(99);
    });

    test('the highlight-range BFS (updatePlayerUI) never treats a hex as reachable for free or negative cost', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: 0, r: 0 };
            player.timePoints = 90; // only 10 TP above the 80 threshold
            player.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
            player.skills = { ...player.skills, fastMovement: 100, swift_step: 5 };
            window.isInCombat = true;
            window.currentTurnEntity = player;
            window.updatePlayerUI();
            const moveHexes = window.highlightedHexes.filter(h => h.type === 'move');
            // With only 10 TP available above threshold and a real (>=1 per
            // step) cost, at most 10 hexes should ever be reachable in a
            // straight line — before the clamp, a negative step cost made
            // the BFS think it could walk arbitrarily far for free.
            const farHex = moveHexes.find(h => window.distance(player.hex, h) > 10);
            return { moveHexCount: moveHexes.length, farHexFound: !!farHex };
        });
        expect(result.farHexFound).toBe(false);
    });
});
