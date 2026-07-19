// tests/war-pressure.spec.js
// window.warState is a slower, mission-driven tug of war that picks up once
// resolveNorthwatchSiege commits the player to a side. Unlike siegeState's
// zero-drift random walk, doing nothing here has a direction: pressure
// always decays slowly back toward 0. Missions (offerWarMission/
// completeWarMission) apply bounded, one-shot deltas; crossing +60 flips
// majorMissionUnlocked once.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('War pressure / mission system', () => {
    test('resolveNorthwatchSiege activates warState with the committed player side', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.resolveNorthwatchSiege('fort_fallen');
            return { active: window.warState.active, side: window.warState.playerSide, pressure: window.warState.pressure };
        });
        expect(result.active).toBe(true);
        expect(result.side).toBe('greenskin');
        expect(result.pressure).toBe(0);
    });

    test('tickWarState decays pressure toward zero in both directions and never overshoots', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.warState = { active: true, playerSide: 'human', pressure: 5, majorMissionUnlocked: false };
            for (let i = 0; i < 100; i++) window.tickWarState();
            const afterPositive = window.warState.pressure;
            window.warState.pressure = -5;
            for (let i = 0; i < 100; i++) window.tickWarState();
            const afterNegative = window.warState.pressure;
            return { afterPositive, afterNegative };
        });
        expect(result.afterPositive).toBe(0);
        expect(result.afterNegative).toBe(0);
    });

    test('offerWarMission creates an active quest-log entry; completeWarMission applies a bounded pressure delta', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.warState = { active: true, playerSide: 'human', pressure: 0, majorMissionUnlocked: false };
            const mission = window.offerWarMission('raid');
            const missionStatusActive = mission.status === 'active';
            const pressureBeforeComplete = window.warState.pressure;
            window.completeWarMission(mission.id);
            return {
                missionCreated: !!mission,
                missionStatusActive,
                pressureBeforeComplete,
                pressureAfterComplete: window.warState.pressure,
                missionStatusAfter: mission.status,
            };
        });
        expect(result.missionCreated).toBe(true);
        expect(result.missionStatusActive).toBe(true);
        expect(result.pressureBeforeComplete).toBe(0);
        expect(result.pressureAfterComplete).toBe(8); // WAR_MISSION_TYPES.raid.pressureReward
        expect(result.missionStatusAfter).toBe('completed');
    });

    test('applyWarPressure is capped to +/-100 and crossing +60 sets majorMissionUnlocked exactly once', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.warState = { active: true, playerSide: 'human', pressure: 0, majorMissionUnlocked: false };
            window.applyWarPressure(50, null);
            const unlockedBefore = window.warState.majorMissionUnlocked;
            window.applyWarPressure(20, null); // crosses 60
            const unlockedAfterCross = window.warState.majorMissionUnlocked;
            const pressureAfterCross = window.warState.pressure;
            window.applyWarPressure(1000, null); // hard clamp
            return { unlockedBefore, unlockedAfterCross, pressureAfterCross, pressureClamped: window.warState.pressure };
        });
        expect(result.unlockedBefore).toBe(false);
        expect(result.unlockedAfterCross).toBe(true);
        expect(result.pressureAfterCross).toBe(70);
        expect(result.pressureClamped).toBe(100);
    });

    test('Commander Hart offers war missions once border_war is complete and the player sided with the humans', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'border_war', title: 'The Northwatch Line', status: 'completed', resolution: 'siege_broken' });
            window.warState = { active: true, playerSide: 'human', pressure: 0, majorMissionUnlocked: false };
            const npc = { name: 'Commander Ysolde Hart' };
            const dialogueCalls = [];
            const originalShowDialogue = window.showDialogue;
            window.showDialogue = (n, text, options) => { dialogueCalls.push({ text, options }); };
            window.npcDialogueTrees.northwatch_commander(npc);
            window.showDialogue = originalShowDialogue;
            const offersScout = dialogueCalls.some(c => c.options.some(o => o.label === 'Scout enemy positions'));
            return { offersScout };
        });
        expect(result.offersScout).toBe(true);
    });
});
