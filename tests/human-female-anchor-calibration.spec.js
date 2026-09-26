const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('human female canonical anatomy drives equipment anchors', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__humanFemaleReferenceRigCalibrated === true);
    await page.waitForFunction(() => window.__directionalEquipmentFitTuningApplied === true);

    const state = await page.evaluate(() => ({
        front: window.HUMAN_FEMALE_REFERENCE_RIGS.front.anchors,
        side: window.HUMAN_FEMALE_REFERENCE_RIGS.side.anchors,
        back: window.HUMAN_FEMALE_REFERENCE_RIGS.back.anchors,
        attachmentFront: window.DIRECTIONAL_ATTACHMENT_RIGS.human_female.front,
        attachmentBack: window.DIRECTIONAL_ATTACHMENT_RIGS.human_female.back,
        armourFront: window.DIRECTIONAL_ARMOUR_RIGS.human_female.front,
        verticalTarget: window.HUMAN_FEMALE_EQUIPMENT_FIT.targetVerticalByView.front,
    }));

    // Attachment centres remain centred on the visible body parts.
    expect(state.front.leftFoot.x).toBeCloseTo(0.305, 3);
    expect(state.front.rightFoot.x).toBeCloseTo(0.695, 3);
    expect(state.front.leftFoot.x + state.front.rightFoot.x).toBeCloseTo(1, 6);
    expect(state.front.leftHand.x).toBeCloseTo(0.080, 3);
    expect(state.front.rightHand.x).toBeCloseTo(0.920, 3);
    expect(state.front.leftHand.y).toBeCloseTo(0.545, 3);
    expect(state.front.mainHandGrip).toEqual(state.front.leftHand);
    expect(state.front.offHandGrip).toEqual(state.front.rightHand);

    // Extent anchors are separate: full-body armour opaque edges map to the
    // shoulder top and sole, not shoulder/foot centres.
    expect(state.front.armourShoulderTopLeft.y).toBeLessThan(state.front.torsoShoulderLeft.y);
    expect(state.front.leftFootSole.y).toBeGreaterThan(state.front.leftFoot.y);
    expect(state.verticalTarget.topAnchor).toBe('armourShoulderTop');
    expect(state.verticalTarget.bottomAnchor).toBe('footSole');
    expect(state.verticalTarget.topY).toBeCloseTo(state.front.armourShoulderTopLeft.y, 6);
    expect(state.verticalTarget.bottomY).toBeCloseTo(state.front.leftFootSole.y, 6);
    expect(state.verticalTarget.heightFrac).toBeCloseTo(
        state.front.leftFootSole.y - state.front.armourShoulderTopLeft.y,
        6
    );

    expect(state.front.torsoWaistLeft.y).toBeCloseTo(0.405, 3);
    expect(state.front.torsoHipLeft.y).toBeCloseTo(0.530, 3);
    expect(state.front.torsoWaistLeft.x + state.front.torsoWaistRight.x).toBeCloseTo(1, 6);
    expect(state.front.torsoHipLeft.x + state.front.torsoHipRight.x).toBeCloseTo(1, 6);

    expect(state.attachmentFront.mainHand).toEqual(state.front.mainHandGrip);
    expect(state.attachmentFront.offHand).toEqual(state.front.offHandGrip);
    expect(state.attachmentFront.forearm).toEqual(state.front.offForearm);
    expect(state.attachmentBack.mainHand).toEqual(state.back.mainHandGrip);
    expect(state.armourFront.source).toBe('calibrated-body-landmarks');
    expect(state.armourFront.waistY).toBeCloseTo(0.405, 3);
});