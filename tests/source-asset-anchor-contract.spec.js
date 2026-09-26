const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('weapon source grip aligns to canonical body hand without moving anatomy', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__humanFemaleReferenceRigCalibrated === true);
    await page.waitForFunction(() => window.__directionalWeaponTuningApplied === true);

    const state = await page.evaluate(() => ({
        sourceSword: window.ITEM_SOURCE_RIGS?.sword?.gripPrimary,
        compatibilitySword: window.ITEM_GRIPS?.sword,
        bodyGrip: window.HUMAN_FEMALE_REFERENCE_RIGS?.front?.anchors?.mainHandGrip,
        renderTarget: window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female?.front?.mainHand,
    }));

    expect(state.sourceSword).toBeTruthy();
    expect(state.compatibilitySword).toEqual(state.sourceSword);
    expect(state.renderTarget).toEqual(state.bodyGrip);
    // Source artwork coordinates and target anatomy coordinates are deliberately
    // different spaces; tuning one must never rewrite the other.
    expect(state.sourceSword).not.toEqual(state.bodyGrip);
});

test('armour source silhouette extents map exactly to shoulder-top and foot-sole targets', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__humanFemaleReferenceRigCalibrated === true);
    await page.waitForFunction(() => window.__directionalEquipmentFitTuningApplied === true);

    const state = await page.evaluate(() => {
        const trim = {
            originalWidth:1024, originalHeight:1024,
            trimLeft:300, trimTop:100, trimWidth:424, trimHeight:700,
        };
        const image = document.createElement('canvas');
        image.width = 1024;
        image.height = 1024;
        const fit = window.computeHumanFemaleMeasuredArmourFit(image, 'front', trim);
        const anchors = window.HUMAN_FEMALE_REFERENCE_RIGS.front.anchors;
        const cfg = window.CHAR_CONFIG.human_female;
        return {
            fit,
            expectedTop: cfg.bodyH * ((anchors.armourShoulderTopLeft.y + anchors.armourShoulderTopRight.y) / 2),
            expectedBottom: cfg.bodyH * Math.max(anchors.leftFootSole.y, anchors.rightFootSole.y),
        };
    });

    expect(state.fit.sourceAnchors.topExtent.y).toBeCloseTo(100/1024, 8);
    expect(state.fit.sourceAnchors.bottomExtent.y).toBeCloseTo(800/1024, 8);
    expect(state.fit.targetAnchors.top.name).toBe('armourShoulderTop');
    expect(state.fit.targetAnchors.bottom.name).toBe('footSole');
    expect(state.fit.visibleTop).toBeCloseTo(state.expectedTop, 8);
    expect(state.fit.visibleBottom).toBeCloseTo(state.expectedBottom, 8);
});
