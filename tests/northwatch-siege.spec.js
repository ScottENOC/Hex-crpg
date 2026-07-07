// tests/northwatch-siege.spec.js
// The Northwatch siege is an abstracted, side-agnostic simulation
// (gameEngine.js: activateNorthwatchSiege/tickSiegeState/applySiegePressure/
// resolveNorthwatchSiege) that replaces the old instant-resolve border_war
// sally fight. Left alone it's an unbiased random walk ("evenly matched");
// discrete player actions apply bounded, one-shot pressure deltas; the
// commander's reserve-dispatch stops permanently the moment he dies.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Northwatch siege state', () => {
    test('activation derives 6 wall segments from the fort region, covering all its wall hexes', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const state = window.activateNorthwatchSiege();
            const totalSegmentHexes = state.segments.reduce((sum, s) => sum + s.wallHexes.length, 0);
            return {
                active: state.active,
                segmentCount: state.segments.length,
                totalSegmentHexes,
                fortWallHexCount: (window.campaign2NorthwatchFortRegion?.wallHexes || []).length,
            };
        });
        expect(result.active).toBe(true);
        expect(result.segmentCount).toBe(6);
        expect(result.totalSegmentHexes).toBe(result.fortWallHexCount);
    });

    test('activateNorthwatchSiege is idempotent — calling it again while active does not reset progress', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.applySiegePressure(-40, null);
            const pressureAfterFirstDelta = window.siegeState.pressure;
            window.activateNorthwatchSiege(); // should be a no-op while active
            return { pressureAfterFirstDelta, pressureAfterSecondCall: window.siegeState.pressure };
        });
        expect(result.pressureAfterFirstDelta).toBeCloseTo(-40, 5);
        expect(result.pressureAfterSecondCall).toBeCloseTo(-40, 5); // unchanged, not reset to 0
    });

    test('left alone (commander dead, so no reserve dispatch), pressure has no directional bias over many trials', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            let fortFallenCount = 0, siegeBrokenCount = 0, undecided = 0;
            const TRIALS = 30, MAX_TICKS_PER_TRIAL = 60000;
            for (let t = 0; t < TRIALS; t++) {
                window.activateNorthwatchSiege();
                window.siegeState.commanderAlive = false; // isolate pure drift, no reserve-dispatch bias
                let ticks = 0;
                while (window.siegeState.active && ticks++ < MAX_TICKS_PER_TRIAL) {
                    window.tickSiegeState();
                }
                if (!window.siegeState.active) {
                    if (window.siegeState.pressure >= 100) fortFallenCount++;
                    else if (window.siegeState.pressure <= -100) siegeBrokenCount++;
                } else {
                    undecided++;
                }
                window.siegeState = null; // reset for the next trial
            }
            return { fortFallenCount, siegeBrokenCount, undecided, TRIALS };
        });
        const decided = result.fortFallenCount + result.siegeBrokenCount;
        expect(decided).toBeGreaterThan(result.TRIALS * 0.7); // most trials should resolve within the cap
        const fortFallenRatio = result.fortFallenCount / decided;
        expect(fortFallenRatio).toBeGreaterThan(0.25); // no strong bias either direction
        expect(fortFallenRatio).toBeLessThan(0.75);
    });

    test('commander reserve dispatch strengthens the most-pressured segment, and stops the instant he dies', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.siegeState.segments[0].attackerStrength = 50; // deliberately the worst-pressured segment
            const before = window.siegeState.segments[0].defenderStrength;
            for (let i = 0; i < 20; i++) window.tickSiegeState();
            const afterAlive = window.siegeState.segments[0].defenderStrength;

            window.siegeState.commanderAlive = false;
            const afterCommanderDeath = window.siegeState.segments[0].defenderStrength;
            for (let i = 0; i < 20; i++) window.tickSiegeState();
            const afterMoreTicksNoCommander = window.siegeState.segments[0].defenderStrength;

            return { before, afterAlive, afterCommanderDeath, afterMoreTicksNoCommander };
        });
        expect(result.afterAlive).toBeGreaterThan(result.before); // reserves were dispatched
        expect(result.afterMoreTicksNoCommander).toBeCloseTo(result.afterCommanderDeath, 5); // no further dispatch once he's dead
    });

    test('applySiegePressure clamps to +/-100 and resolveNorthwatchSiege sets quest resolution + swings faction/region reputation', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'border_war', title: 'The Northwatch Line', status: 'active', resolution: null });
            const orcBefore = window.factions.orc_raiders.standing;
            const securityBefore = window.regions?.aldervale?.security;

            window.applySiegePressure(-500, null); // way past the clamp
            const clampedPressure = window.siegeState.pressure;

            const quest = window.questLog.find(q => q.id === 'border_war');
            return {
                clampedPressure,
                questStatus: quest.status,
                questResolution: quest.resolution,
                orcAfter: window.factions.orc_raiders.standing,
                orcBefore,
                securityAfter: window.regions?.aldervale?.security,
                securityBefore,
            };
        });
        expect(result.clampedPressure).toBe(-100);
        expect(result.questStatus).toBe('completed');
        expect(result.questResolution).toBe('siege_broken');
        expect(result.orcAfter).toBeLessThan(result.orcBefore); // human win hurts orc_raiders standing
        expect(result.securityAfter).toBeGreaterThan(result.securityBefore);
    });

    test('reaching +100 resolves as fort_fallen and swings reputation the other way', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'border_war', title: 'The Northwatch Line', status: 'active', resolution: null });
            const orcBefore = window.factions.orc_raiders.standing;
            window.applySiegePressure(500, null);
            const quest = window.questLog.find(q => q.id === 'border_war');
            return { questResolution: quest.resolution, orcAfter: window.factions.orc_raiders.standing, orcBefore };
        });
        expect(result.questResolution).toBe('fort_fallen');
        expect(result.orcAfter).toBeGreaterThan(result.orcBefore); // goblin/orc win helps their standing
    });
});
