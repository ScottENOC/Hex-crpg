const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('rig debug tools', () => {
    test('exposes persistent anchor and armour width debug controls', async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.__rigDebugLoaded === true);
        await page.waitForFunction(() => window.__characterRigInstalled === true && window.__directionalEquipmentFitTuningApplied === true);
        await page.waitForFunction(() => !!document.getElementById('graphics-show-rig-anchors'));
        await page.waitForFunction(() => window.mapCtx?.drawImage?.__rigDebugOuter === true);

        const initial = await page.evaluate(() => ({
            anchors: document.getElementById('graphics-show-rig-anchors')?.checked,
            armour: document.getElementById('graphics-show-armour-width-debug')?.checked,
            outerInstalled: !!window.mapCtx?.drawImage?.__rigDebugOuter,
        }));
        expect(initial.outerInstalled).toBe(true);

        await page.evaluate(() => window.setShowRigAnchors(true));
        let state = await page.evaluate(() => ({
            enabled: window.showRigAnchors,
            legacy: window.charDebugMode,
            stored: localStorage.getItem('rpg_show_rig_anchors'),
            checked: document.getElementById('graphics-show-rig-anchors')?.checked,
        }));
        expect(state).toEqual({ enabled:true, legacy:true, stored:'true', checked:true });

        await page.evaluate(() => window.setShowArmourWidthDebug(true));
        state = await page.evaluate(() => ({
            enabled: window.showArmourWidthDebug,
            stored: localStorage.getItem('rpg_show_armour_width_debug'),
            checked: document.getElementById('graphics-show-armour-width-debug')?.checked,
            panelExists: !!document.getElementById('armour-width-debug-panel'),
        }));
        expect(state).toEqual({ enabled:true, stored:'true', checked:true, panelExists:true });

        await page.evaluate(() => {
            window.setShowRigAnchors(false);
            window.setShowArmourWidthDebug(false);
        });
    });
});
