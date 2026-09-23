const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Persistent siege sector system', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.SiegeSectorSystem && typeof window.activateNorthwatchSiege === 'function');
    });

    test('upgrades the six Northwatch sectors without replacing the legacy siege API', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            return {
                count: state.segments.length,
                modelVersion: state.sectorModelVersion,
                pressure: state.pressure,
                sectors: state.segments.map(s => ({
                    id: s.id,
                    integrity: s.wallIntegrity,
                    morale: s.morale,
                    reserves: s.reserves,
                    breached: s.breached,
                    eventLog: Array.isArray(s.eventLog),
                    casualties: s.casualties,
                })),
                wrappedActivate: !!window.activateNorthwatchSiege.__sectorSiegeWrapper,
                wrappedTick: !!window.tickSiegeState.__sectorSiegeWrapper,
                wrappedDamage: !!window.damageWall.__sectorSiegeWrapper,
            };
        });
        expect(result.count).toBe(6);
        expect(result.modelVersion).toBe(1);
        expect(result.pressure).toBe(0);
        expect(result.wrappedActivate).toBe(true);
        expect(result.wrappedTick).toBe(true);
        expect(result.wrappedDamage).toBe(true);
        result.sectors.forEach(s => {
            expect(s.integrity).toBeGreaterThan(99);
            expect(s.morale).toBe(100);
            expect(s.reserves).toBe(6);
            expect(s.breached).toBe(false);
            expect(s.eventLog).toBe(true);
            expect(s.casualties).toEqual({ attackers: 0, defenders: 0 });
        });
    });

    test('physical wall damage updates the matching sector and records a persistent breach', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            const sector = state.segments.find(s => s.wallHexes.length > 0);
            const target = sector.wallHexes[0];
            const before = sector.wallIntegrity;
            window.damageWall(target.q, target.r, 9999);
            const afterSector = state.segments.find(s => s.id === sector.id);
            return {
                sectorId: sector.id,
                before,
                after: afterSector.wallIntegrity,
                breached: afterSector.breached,
                breachRecorded: afterSector.breachHexes.some(h => h.q === target.q && h.r === target.r),
                terrain: window.getTerrainAt(target.q, target.r).name,
                logged: afterSector.eventLog.some(e => e.type === 'wall_damage'),
                worst: state.mostPressuredSectorId,
            };
        });
        expect(result.after).toBeLessThan(result.before);
        expect(result.breached).toBe(true);
        expect(result.breachRecorded).toBe(true);
        expect(result.terrain).toBe('Rubble');
        expect(result.logged).toBe(true);
        expect(result.worst).toBe(result.sectorId);
    });

    test('reinforcements and casualties change only the selected local sector', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            const first = state.segments[0], second = state.segments[1];
            const before = {
                firstDef: first.defenderStrength,
                firstRes: first.reserves,
                secondDef: second.defenderStrength,
                secondRes: second.reserves,
            };
            const reinforced = window.SiegeSectorSystem.reinforceSector(first.id, 3);
            window.SiegeSectorSystem.recordCasualties(first.id, 'defender', 2);
            window.SiegeSectorSystem.recordCasualties(first.id, 'attacker', 4);
            return {
                reinforced,
                before,
                first: {
                    defenderStrength: first.defenderStrength,
                    attackerStrength: first.attackerStrength,
                    reserves: first.reserves,
                    morale: first.morale,
                    casualties: first.casualties,
                    logTypes: first.eventLog.map(e => e.type),
                },
                second: {
                    defenderStrength: second.defenderStrength,
                    reserves: second.reserves,
                    casualties: second.casualties,
                },
                pressureCount: state.sectorPressure.length,
            };
        });
        expect(result.reinforced).toBe(true);
        expect(result.first.reserves).toBe(result.before.firstRes - 3);
        expect(result.first.defenderStrength).toBeGreaterThan(result.before.firstDef);
        expect(result.first.attackerStrength).toBeLessThan(10);
        expect(result.first.casualties).toEqual({ attackers: 4, defenders: 2 });
        expect(result.first.logTypes).toContain('reinforce');
        expect(result.first.logTypes).toContain('casualties');
        expect(result.second.defenderStrength).toBe(result.before.secondDef);
        expect(result.second.reserves).toBe(result.before.secondRes);
        expect(result.second.casualties).toEqual({ attackers: 0, defenders: 0 });
        expect(result.pressureCount).toBe(6);
    });

    test('legacy global pressure remains compatible while sector pressure is available separately', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            window.applySiegePressure(-40, null);
            window.SiegeSectorSystem.applySectorPressure(2, 20, 'test_assault');
            return {
                globalPressure: state.pressure,
                localPressure: state.sectorPressure[2],
                morale: state.segments[2].morale,
                logged: state.segments[2].eventLog.some(e => e.type === 'test_assault'),
            };
        });
        expect(result.globalPressure).toBeCloseTo(-40, 5);
        expect(result.localPressure).toBeGreaterThan(-100);
        expect(result.morale).toBeLessThan(100);
        expect(result.logged).toBe(true);
    });

    test('normal saves and exported save codes carry the active sector state', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            window.SiegeSectorSystem.applySectorPressure(1, 30, 'persistence_probe');
            state.segments[1].reserves = 2;
            window.saveGame('siege_sector_test');
            const stored = JSON.parse(localStorage.getItem('rpg_save_siege_sector_test'));
            const code = window.exportSaveCode();
            const exported = JSON.parse(decodeURIComponent(escape(atob(code))));
            return {
                saveWrapped: !!window.saveGame.__siegeSectorPersistence,
                loadWrapped: !!window.loadGame.__siegeSectorPersistence,
                exportWrapped: !!window.exportSaveCode.__siegeSectorPersistence,
                storedVersion: stored.siegeState?.sectorModelVersion,
                storedReserves: stored.siegeState?.segments?.[1]?.reserves,
                storedLogged: stored.siegeState?.segments?.[1]?.eventLog?.some(e => e.type === 'persistence_probe'),
                exportedVersion: exported.siegeState?.sectorModelVersion,
                exportedReserves: exported.siegeState?.segments?.[1]?.reserves,
            };
        });
        expect(result.saveWrapped).toBe(true);
        expect(result.loadWrapped).toBe(true);
        expect(result.exportWrapped).toBe(true);
        expect(result.storedVersion).toBe(1);
        expect(result.storedReserves).toBe(2);
        expect(result.storedLogged).toBe(true);
        expect(result.exportedVersion).toBe(1);
        expect(result.exportedReserves).toBe(2);
    });
});
