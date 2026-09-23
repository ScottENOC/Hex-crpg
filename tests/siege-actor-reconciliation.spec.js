const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Siege actor reconciliation', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.SiegeActorReconciliation && !!window.SiegeActorSectorIntegration);
    });

    test('tracks the catapult sector from its real current wall target without scanning armies', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            const catapult = window.campaign2NorthwatchCatapult;
            const targetSector = state.segments.find(s => s.wallHexes.length > 0);
            const target = targetSector.wallHexes[Math.floor(targetSector.wallHexes.length / 2)];
            catapult.currentWallTarget = { ...target };
            const changed = window.SiegeActorReconciliation.reconcile();
            return {
                changed,
                intervalMs: window.SiegeActorReconciliation.intervalMs,
                sectorId: catapult.siegeSectorId,
                stateSectorId: state.catapultSectorId,
                target,
                recordedTarget: catapult.siegeTargetHex,
                logged: targetSector.eventLog.some(e => e.type === 'catapult_target' && e.entityId === catapult.id),
            };
        });
        expect(result.changed).toBe(true);
        expect(result.intervalMs).toBeGreaterThanOrEqual(500);
        expect(result.sectorId).toBe(result.stateSectorId);
        expect(result.recordedTarget).toEqual(result.target);
        expect(result.logged).toBe(true);
    });

    test('does no strategic reconciliation work when no siege is active', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.siegeState = null;
            return window.SiegeActorReconciliation.reconcile();
        });
        expect(result).toBe(false);
    });
});
