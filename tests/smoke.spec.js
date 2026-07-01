// tests/smoke.spec.js
// The one test that plays the Hollowmere shakedown in real time, no
// function-call shortcuts — catches regressions in the actual scripted
// pacing/sequencing itself (the setTimeout chain in
// campaign2Dialogue.js's startHollowmereShakedown), which the fast
// hollowmere-shakedown.spec.js tests intentionally bypass.
const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue, clickDialogueOption } = require('./helpers');

test.describe('Hollowmere real-time smoke test', () => {
    test('the full scripted entrance plays out and ends in the 3-choice prompt', async ({ page }) => {
        test.setTimeout(40000);
        await createCharacter(page);

        // Scene setup fires the shakedown ~8s after load; the scripted dialogue
        // then takes ~12s more before the choice prompt appears.
        await page.waitForFunction(() => window.hollowmereEventFired === true, { timeout: 15000 });

        const doorOpenedAndSoldiersMoved = await page.waitForFunction(() => {
            const dray = window.entities.find(e => e.name === 'Dray Coltayne');
            return dray && (dray.hex.q !== 0 || dray.hex.r !== 6); // moved off their original wait hex
        }, { timeout: 10000 }).then(() => true).catch(() => false);
        expect(doorOpenedAndSoldiersMoved).toBe(true);

        const dialogue = await readDialogue(page);
        expect(dialogue.options).toHaveLength(3);
        expect(dialogue.options.some(o => o.includes('Fight'))).toBe(true);

        await clickDialogueOption(page, 'Fight');
        const combatState = await page.evaluate(() => ({
            isInCombat: window.isInCombat,
            drayHostile: window.entities.find(e => e.name === 'Dray Coltayne').side === 'enemy',
        }));
        expect(combatState.isInCombat).toBe(true);
        expect(combatState.drayHostile).toBe(true);
    });
});
