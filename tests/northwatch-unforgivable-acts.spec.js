// tests/northwatch-unforgivable-acts.spec.js
// Discrete (not points/suspicion-based) triggers that turn Northwatch's
// garrison hostile to the player: attacking a defender directly during the
// siege, or pulling the gate lever a second time. Everything short of an
// unforgivable act — including incidental AoE splash, which never calls
// tryAttack at all — stays excusable.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Northwatch: unforgivable acts turn the garrison hostile', () => {
    test('the gate lever warns on the first pull, and only actually opens + turns the garrison hostile on the second', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            const soldier = window.entities.find(e => e.factionTag === 'northwatch_human');
            const firstPullHostile = () => soldier.combatDirective.hostileToPlayer;

            window.pullNorthwatchGateLever();
            const afterFirst = { hostile: firstPullHostile(), gateHeld: window.siegeState.gateHeld };

            window.pullNorthwatchGateLever();
            const afterSecond = { hostile: firstPullHostile(), gateHeld: window.siegeState.gateHeld };

            return { afterFirst, afterSecond };
        });
        expect(result.afterFirst.hostile).toBeFalsy();
        expect(result.afterFirst.gateHeld).toBe(true);
        expect(result.afterSecond.hostile).toBe(true);
        expect(result.afterSecond.gateHeld).toBe(false);
    });

    test('directly attacking a Northwatch defender during an active siege turns the whole garrison hostile', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const commander = window.entities.find(e => e.factionTag === 'northwatch_human' && e.name?.includes('Commander'));
            // Two other soldiers never touched by the attack — proves the
            // WHOLE faction flips together, not just the one attacked (and
            // sidesteps the attacked target possibly dying/going unconscious
            // from the hit itself, which is a separate concern from this
            // trigger).
            const untouched = window.entities.filter(e => e.factionTag === 'northwatch_human' && e !== commander);
            player.hex = { q: commander.hex.q + 1, r: commander.hex.r };

            window.tryAttack(player, commander, false, false, 0, true); // Force-Attack a neutral target
            return {
                allUntouchedNowHostile: untouched.every(e => e.combatDirective?.hostileToPlayer === true),
            };
        });
        expect(result.allUntouchedNowHostile).toBe(true);
    });

    test('attacking a defender when no siege is active does not flip anything (nothing to be "unforgivable" about yet)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.siegeState = null; // no active siege
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const soldier = window.entities.find(e => e.factionTag === 'northwatch_human');
            player.hex = { q: soldier.hex.q + 1, r: soldier.hex.r };
            window.tryAttack(player, soldier, false, false, 0, true);
            return { hostile: soldier.combatDirective.hostileToPlayer };
        });
        expect(result.hostile).toBeFalsy();
    });
});
