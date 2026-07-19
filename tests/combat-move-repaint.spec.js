// Reported: in turn-based combat, clicking a highlighted move hex (single-
// or multi-hex) appeared not to move the character at all — even though the
// recomputed movement-range highlight (which reads the same, already-
// updated position) showed correctly the whole time. Confirmed directly,
// and via a full handleClick-driven simulation, that the entity's actual
// position (player.hex) always updates correctly and instantly through the
// real move path — the issue is a paint that can be dropped/deferred on
// some devices for a single discrete hex jump (turn-based has no continuous
// interpolation to fall back on the way real-time movement does).
// checkMovementReactions (gameEngine.js) now schedules a follow-up
// requestAnimationFrame redraw after every step as a defensive catch-up,
// reading whatever the entity's position has settled to by the time that
// frame actually fires (not a stale captured value) — safe even though
// checkMovementReactions itself synchronously reverts its own temporary
// hex update moments later unless a caller's callback re-applies it.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('turn-based combat movement repaint', () => {
    test('a single-hex combat move schedules a requestAnimationFrame catch-up redraw, and still lands on the correct final hex', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: 0, r: 0 };
            player.timePoints = 100;
            window.isInCombat = true;
            window.currentTurnEntity = player;

            let rafCalls = 0;
            const realRaf = window.requestAnimationFrame;
            window.requestAnimationFrame = (cb) => { rafCalls++; return realRaf(cb); };

            window.playerMoveProcess(player, [{ q: 1, r: 0 }]);
            await new Promise(r => setTimeout(r, 200));

            window.requestAnimationFrame = realRaf;
            return { rafCalls, hex: { ...player.hex } };
        });
        expect(result.rafCalls).toBeGreaterThanOrEqual(1);
        expect(result.hex).toEqual({ q: 1, r: 0 });
    });
});
