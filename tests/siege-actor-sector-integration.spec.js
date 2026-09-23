const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Siege actors use physical sectors', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.SiegeActorSectorIntegration && !!window.SiegeSectorSystem);
    });

    test('ram and sapper are bound to the gate and rear wall sectors they physically attack', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            window.greenskinRamSapperSpawned = false;
            window.spawnBatteringRamAndSapper();
            const ram = window.campaign2NorthwatchRam;
            const sapper = window.campaign2NorthwatchSapper;
            const gateSector = window.SiegeActorSectorIntegration.nearestSectorToHex(window.campaign2NorthwatchGateHex, state);
            const rearSector = window.SiegeActorSectorIntegration.nearestSectorToHex(sapper.siegeTargetHex, state);
            return {
                wrapped: !!window.spawnBatteringRamAndSapper.__siegeSectorActorWrapper,
                ram: ram && {
                    sectorId: ram.siegeSectorId,
                    role: ram.siegeRole,
                    objective: ram.combatDirective?.siegeObjective?.hex,
                },
                sapper: sapper && {
                    sectorId: sapper.siegeSectorId,
                    role: sapper.siegeRole,
                    objective: sapper.combatDirective?.siegeObjective?.hex,
                },
                gateSectorId: gateSector?.id,
                rearSectorId: rearSector?.id,
                stateGateSectorId: state.gateSectorId,
                stateSapperSectorId: state.sapperSectorId,
            };
        });
        expect(result.wrapped).toBe(true);
        expect(result.ram).toBeTruthy();
        expect(result.sapper).toBeTruthy();
        expect(result.ram.role).toBe('battering-ram');
        expect(result.sapper.role).toBe('sapper');
        expect(result.ram.sectorId).toBe(result.gateSectorId);
        expect(result.sapper.sectorId).toBe(result.rearSectorId);
        expect(result.stateGateSectorId).toBe(result.gateSectorId);
        expect(result.stateSapperSectorId).toBe(result.rearSectorId);
        expect(result.ram.objective).toBeTruthy();
        expect(result.sapper.objective).toBeTruthy();
    });

    test('reinforcement waves exploit an existing physical breach instead of always marching at the gate', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            const gateSector = window.SiegeActorSectorIntegration.nearestSectorToHex(window.campaign2NorthwatchGateHex, state);
            const targetSector = state.segments.find(s => s.id !== gateSector?.id && s.wallHexes.length) || state.segments[0];
            const breach = targetSector.wallHexes[0];
            window.damageWall(breach.q, breach.r, 9999);
            window.greenskinSecondWaveSpawned = false;
            const before = new Set(window.entities.map(e => e.id));
            window.spawnSecondGreenskinWave();
            const wave = window.entities.filter(e => !before.has(e.id) && String(e.name).includes('II-'));
            return {
                wrapped: !!window.spawnSecondGreenskinWave.__siegeSectorActorWrapper,
                targetSectorId: targetSector.id,
                breach,
                count: wave.length,
                sectorIds: [...new Set(wave.map(e => e.siegeSectorId))],
                objectives: wave.map(e => e.combatDirective?.siegeObjective?.hex).filter(Boolean),
                primary: state.primaryAssaultSectorId,
            };
        });
        expect(result.wrapped).toBe(true);
        expect(result.count).toBeGreaterThan(20);
        expect(result.sectorIds).toEqual([result.targetSectorId]);
        expect(result.primary).toBe(result.targetSectorId);
        expect(result.objectives.length).toBe(result.count);
        result.objectives.forEach(h => expect(h).toEqual(result.breach));
    });

    test('initial assault remains gate-focused until a breach changes the tactical picture', async ({ page }) => {
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            const gateSector = window.SiegeActorSectorIntegration.nearestSectorToHex(window.campaign2NorthwatchGateHex, state);
            window.greenskinWaveSpawned = false;
            const before = new Set(window.entities.map(e => e.id));
            window.spawnGreenskinAssaultWave();
            const wave = window.entities.filter(e => !before.has(e.id) && e.siegeRole === 'assault-wave-1');
            return {
                wrapped: !!window.spawnGreenskinAssaultWave.__siegeSectorActorWrapper,
                gateSectorId: gateSector?.id,
                count: wave.length,
                sectorIds: [...new Set(wave.map(e => e.siegeSectorId))],
                primary: state.primaryAssaultSectorId,
            };
        });
        expect(result.wrapped).toBe(true);
        expect(result.count).toBeGreaterThan(30);
        expect(result.sectorIds).toEqual([result.gateSectorId]);
        expect(result.primary).toBe(result.gateSectorId);
    });
});
