// tests/lich-hunt.spec.js
// The other half of "you can become a lich, but what then" (lichHunt.js):
// once playerIsLich is true, crownAwareness climbs on its own and, past a
// threshold, sends a real hunting party after the player. Repelling one
// buys a respite (not permanent safety); finding and destroying the
// chapterhouse behind it is the real, permanent resolution — deliberately
// scoped to a regional fight, not an assault on the capital.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Lich hunt', () => {
    test('crownAwareness only climbs once playerIsLich, and a wave triggers past the threshold', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const beforeLich = await page.evaluate(() => {
            window.tickLichHunt(3600 * 5);
            return { active: window.lichHuntState.active, awareness: window.lichHuntState.crownAwareness };
        });
        expect(beforeLich.active).toBe(false);
        expect(beforeLich.awareness).toBe(0);

        const afterLich = await page.evaluate(() => {
            window.playerIsLich = true;
            window.tickLichHunt(3600 * 5);
            return { active: window.lichHuntState.active, awareness: window.lichHuntState.crownAwareness };
        });
        expect(afterLich.active).toBe(true);
        expect(afterLich.awareness).toBeGreaterThan(0);

        const waveState = await page.evaluate(() => {
            window.lichHuntState.crownAwareness = 65; // past LICH_HUNT_THRESHOLD (60)
            window.checkLichHuntTrigger();
            return {
                huntTriggered: window.lichHuntState.huntTriggered,
                combatantCount: window.entities.filter(e => e.isLichHuntCombatant && e.alive).length,
                chapterhouseRevealed: window.lichHuntState.chapterhouseRevealed,
                lairExplored: window.isHexExplored(window.campaign2LichChapterhouseCenter.q, window.campaign2LichChapterhouseCenter.r),
            };
        });
        expect(waveState.huntTriggered).toBe(true);
        expect(waveState.combatantCount).toBeGreaterThan(0);
        expect(waveState.chapterhouseRevealed).toBe(true);
        expect(waveState.lairExplored).toBe(true);

        // Winning the wave is a respite, not a permanent fix — awareness
        // resets to a partial (nonzero) value, not all the way to 0.
        const afterWin = await page.evaluate(() => {
            window.entities.filter(e => e.isLichHuntCombatant && e.alive).forEach(e => { e.alive = false; e.hp = -1000; });
            window.checkCombatEnd();
            return {
                huntTriggered: window.lichHuntState.huntTriggered,
                awareness: window.lichHuntState.crownAwareness,
                wavesSurvived: window.lichHuntState.wavesSurvived,
            };
        });
        expect(afterWin.huntTriggered).toBe(false);
        expect(afterWin.awareness).toBeGreaterThan(0);
        expect(afterWin.awareness).toBeLessThan(65);
        expect(afterWin.wavesSurvived).toBe(1);
    });

    test('destroying the chapterhouse permanently stops the drift', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const result = await page.evaluate(() => {
            window.playerIsLich = true;
            const goldBefore = window.party[0].gold;
            window.entities.filter(e => e.isLichChapterhouseDefender).forEach(e => { e.alive = false; e.hp = -1000; });
            window.checkCombatEnd();
            const destroyed = window.lichHuntState.chapterhouseDestroyed;
            const goldGain = window.party[0].gold - goldBefore;

            // Drift should no longer apply.
            window.lichHuntState.crownAwareness = 0;
            window.tickLichHunt(3600 * 100); // 100 hours — would easily cross the threshold if drift still applied
            return { destroyed, goldGain, awarenessAfterLongTick: window.lichHuntState.crownAwareness };
        });
        expect(result.destroyed).toBe(true);
        expect(result.goldGain).toBeGreaterThan(0);
        expect(result.awarenessAfterLongTick).toBe(0);
    });
});
