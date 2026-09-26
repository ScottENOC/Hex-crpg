const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('rig debug tools', () => {
    test('exposes persistent anchor and armour width debug controls', async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.__rigDebugLoaded === true);
        await page.waitForFunction(() => window.__characterRigInstalled === true && window.__directionalEquipmentFitTuningApplied === true);
        await page.waitForFunction(() => window.__humanFemaleReferenceRigCalibrated === true);
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
        expect(state).toEqual({ enabled:true, legacy:false, stored:'true', checked:true });

        const rig = await page.evaluate(() => ({
            front: window.HUMAN_FEMALE_REFERENCE_RIGS.front.anchors,
            attachmentFront: window.DIRECTIONAL_ATTACHMENT_RIGS.human_female.front,
            armourFront: window.DIRECTIONAL_ARMOUR_RIGS.human_female.front,
        }));
        expect(rig.front.leftFoot.x).toBeCloseTo(0.305, 3);
        expect(rig.front.rightFoot.x).toBeCloseTo(0.695, 3);
        expect(rig.front.leftHand.x).toBeCloseTo(0.080, 3);
        expect(rig.front.rightHand.x).toBeCloseTo(0.920, 3);
        expect(rig.front.torsoWaistLeft.y).toBeCloseTo(0.405, 3);
        expect(rig.front.torsoHipLeft.y).toBeCloseTo(0.530, 3);
        expect(rig.attachmentFront.mainHand).toEqual(rig.front.mainHandGrip);
        expect(rig.attachmentFront.offHand).toEqual(rig.front.offHandGrip);
        expect(rig.attachmentFront.forearm).toEqual(rig.front.offForearm);
        expect(rig.armourFront.source).toBe('calibrated-body-landmarks');
        expect(rig.armourFront.waistY).toBeCloseTo(0.405, 3);

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