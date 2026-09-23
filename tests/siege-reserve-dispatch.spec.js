const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Shared Northwatch reserve dispatch', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.SiegeReserveDispatch && !!window.SiegeSectorSystem);
    });

    test('replaces local reserve stocks with one finite fort-wide pool', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            return {
                model: state.reserveModelVersion,
                pool: state.sharedReservePool,
                max: state.sharedReserveMax,
                local: state.segments.map(s => s.reserves),
                tickWrapped: !!window.tickSiegeState.__sharedReserveWrapper,
                reinforceWrapped: !!window.SiegeSectorSystem.reinforceSector.__sharedReserveWrapper,
            };
        });
        expect(result.model).toBe(1);
        expect(result.pool).toBe(result.max);
        expect(result.pool).toBeGreaterThan(0);
        expect(result.local.every(v => v === 0)).toBe(true);
        expect(result.tickWrapped).toBe(true);
        expect(result.reinforceWrapped).toBe(true);
    });

    test('commander dispatch consumes the shared pool and gives a real defender a physical sector order', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            const target = state.segments[0];
            target.attackerStrength = 40;
            window.SiegeSectorSystem.updateSummary(state);
            const poolBefore = state.sharedReservePool;
            const defenceBefore = target.defenderStrength;
            let ticks = 0;
            while (state.reserveDispatches < 1 && ticks++ < 20) window.tickSiegeState();
            const ordered = window.entities.find(e => e._siegeReserveCommitted && e.siegeSectorId === target.id);
            return {
                poolBefore,
                poolAfter: state.sharedReservePool,
                defenceBefore,
                defenceAfter: target.defenderStrength,
                dispatches: state.reserveDispatches,
                ordered: ordered ? {
                    role: ordered.siegeRole,
                    sectorId: ordered.siegeSectorId,
                    order: ordered.siegeReserveOrder,
                    objective: ordered.combatDirective?.siegeObjective?.hex,
                    canReinforce: ordered.combatDirective?.canReinforce,
                } : null,
            };
        });
        expect(result.dispatches).toBe(1);
        expect(result.poolAfter).toBe(result.poolBefore - 1);
        expect(result.defenceAfter).toBe(result.defenceBefore + 1);
        expect(result.ordered).toBeTruthy();
        expect(result.ordered.role).toBe('defender-reserve');
        expect(result.ordered.sectorId).toBe(0);
        expect(result.ordered.order?.targetHex).toBeTruthy();
        expect(result.ordered.objective).toEqual(result.ordered.order.targetHex);
        expect(result.ordered.canReinforce).toBe(false);
    });

    test('commander death stops new dispatches immediately', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            state.segments[0].attackerStrength = 50;
            window.SiegeSectorSystem.updateSummary(state);
            state.commanderAlive = false;
            const before = state.sharedReservePool;
            for (let i = 0; i < 30; i++) window.tickSiegeState();
            return { before, after: state.sharedReservePool, dispatches: state.reserveDispatches, commanderAlive: state.commanderAlive };
        });
        expect(result.commanderAlive).toBe(false);
        expect(result.after).toBe(result.before);
        expect(result.dispatches).toBe(0);
    });

    test('shared pool cannot reinforce forever', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            state.sharedReservePool = 2;
            state.sharedReserveMax = 2;
            state.segments[0].attackerStrength = 80;
            window.SiegeSectorSystem.updateSummary(state);
            const before = state.segments[0].defenderStrength;
            for (let i = 0; i < 100; i++) window.tickSiegeState();
            const afterExhaustion = state.segments[0].defenderStrength;
            for (let i = 0; i < 100; i++) window.tickSiegeState();
            return {
                before,
                afterExhaustion,
                final: state.segments[0].defenderStrength,
                pool: state.sharedReservePool,
                dispatches: state.reserveDispatches,
            };
        });
        expect(result.pool).toBe(0);
        expect(result.dispatches).toBe(2);
        expect(result.afterExhaustion).toBe(result.before + 2);
        expect(result.final).toBe(result.afterExhaustion);
    });
});
