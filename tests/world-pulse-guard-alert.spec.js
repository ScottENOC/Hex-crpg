// tests/world-pulse-guard-alert.spec.js
// D2: guards react to nearby world events — a bandit_activity event puts
// every patrol-behaviorType entity "on alert" (a temporary visionBonus) for
// a day, removed again once the alert window elapses. See applyGuardAlert
// in worldPulse.js.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('D2: guards react to nearby world events', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('bandit_activity puts patrol entities on alert with a vision bonus', async ({ page }) => {
        const result = await page.evaluate(() => {
            const guard = window.entities.find(e => e.alive) || {};
            guard.behaviorType = 'patrol';
            guard.visionBonus = 0;
            const before = guard.visionBonus;

            window.regions.aldervale.security = 10; // makes bandit_activity eligible
            // Directly invoke the event's apply() via a forced roll landing
            // on bandit_activity: rng chosen so the roll lands past quiet
            // and inside bandit_activity's weight band deterministically
            // isn't guaranteed by index, so drive the mechanism directly
            // instead — the same call the event's apply() makes.
            window._guardAlertUntil = (window.worldSeconds || 0) + 24 * 3600;
            window.applyGuardAlert();

            return { before, after: guard.visionBonus };
        });
        expect(result.after).toBeGreaterThan(result.before);
    });

    test('the alert bonus is removed once the alert window elapses, and is idempotent either way', async ({ page }) => {
        const result = await page.evaluate(() => {
            const guard = window.entities.find(e => e.alive) || {};
            guard.behaviorType = 'patrol';
            guard.visionBonus = 0;
            guard._guardAlertBonusApplied = false;

            window.worldSeconds = 1000;
            window._guardAlertUntil = window.worldSeconds + 24 * 3600;
            window.applyGuardAlert();
            const alertBonus = guard.visionBonus;
            window.applyGuardAlert(); // calling again while still alert must not double-stack
            const afterSecondCall = guard.visionBonus;

            window.worldSeconds = window._guardAlertUntil + 1; // alert window elapsed
            window.applyGuardAlert();
            const afterExpiry = guard.visionBonus;
            window.applyGuardAlert(); // idempotent on the other side too
            const afterExpiryAgain = guard.visionBonus;

            return { alertBonus, afterSecondCall, afterExpiry, afterExpiryAgain };
        });
        expect(result.alertBonus).toBeGreaterThan(0);
        expect(result.afterSecondCall).toBe(result.alertBonus); // no double-stack
        expect(result.afterExpiry).toBe(0); // bonus fully removed
        expect(result.afterExpiryAgain).toBe(0);
    });

    test('non-patrol entities are never touched by the guard alert', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wanderer = window.entities.find(e => e.alive) || {};
            wanderer.behaviorType = 'wander';
            wanderer.visionBonus = 5;
            window._guardAlertUntil = (window.worldSeconds || 0) + 24 * 3600;
            window.applyGuardAlert();
            return wanderer.visionBonus;
        });
        expect(result).toBe(5);
    });
});
