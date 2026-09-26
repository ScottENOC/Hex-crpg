const { test, expect } = require('@playwright/test');

test('human female measured canonical anchors drive production attachments', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() =>
    window.HUMAN_FEMALE_REFERENCE_RIGS?.front?.anchors &&
    window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female?.front &&
    window.__humanFemaleReferenceRigCalibrated
  );

  const state = await page.evaluate(() => {
    const a = window.HUMAN_FEMALE_REFERENCE_RIGS.front.anchors;
    const d = window.DIRECTIONAL_ATTACHMENT_RIGS.human_female.front;
    return {
      build: window.PRESENTATION_BUILD,
      rigVersion: window.__humanFemaleReferenceRigVersion,
      attachmentSource: window.__humanFemaleAttachmentRigSource,
      debugMutatesRig: window.__rigDebugMutatesRig,
      ref: {
        leftFoot: a.leftFoot,
        rightFoot: a.rightFoot,
        leftFootSole: a.leftFootSole,
        rightFootSole: a.rightFootSole,
        mainHandGrip: a.mainHandGrip,
        offHandGrip: a.offHandGrip,
        shoulderLeft: a.torsoShoulderLeft,
        shoulderRight: a.torsoShoulderRight,
        shoulderTopLeft: a.armourShoulderTopLeft,
        shoulderTopRight: a.armourShoulderTopRight,
        waistLeft: a.torsoWaistLeft,
        waistRight: a.torsoWaistRight,
      },
      attachments: {
        mainHand: d.mainHand,
        offHand: d.offHand,
        shoulderLeft: d.shoulderLeft,
        shoulderRight: d.shoulderRight,
      },
    };
  });

  expect(state.build).toBe('20260926-measured-canonical-rig');
  expect(state.rigVersion).toBe('measured-front-20260926');
  expect(state.attachmentSource).toBe('canonical-sprite-rig');
  expect(state.debugMutatesRig).toBe(false);

  expect(state.ref.leftFoot).toEqual({ x: 0.310, y: 0.965 });
  expect(state.ref.rightFoot).toEqual({ x: 0.686, y: 0.965 });
  expect(state.ref.leftFootSole).toEqual({ x: 0.309, y: 0.995 });
  expect(state.ref.rightFootSole).toEqual({ x: 0.690, y: 0.995 });
  expect(state.ref.mainHandGrip).toEqual({ x: 0.070, y: 0.545 });
  expect(state.ref.offHandGrip).toEqual({ x: 0.928, y: 0.545 });
  expect(state.ref.shoulderLeft).toEqual({ x: 0.156, y: 0.250 });
  expect(state.ref.shoulderRight).toEqual({ x: 0.843, y: 0.250 });
  expect(state.ref.shoulderTopLeft).toEqual({ x: 0.183, y: 0.225 });
  expect(state.ref.shoulderTopRight).toEqual({ x: 0.817, y: 0.225 });
  expect(state.ref.waistLeft).toEqual({ x: 0.293, y: 0.405 });
  expect(state.ref.waistRight).toEqual({ x: 0.706, y: 0.405 });

  expect(state.attachments.mainHand).toEqual(state.ref.mainHandGrip);
  expect(state.attachments.offHand).toEqual(state.ref.offHandGrip);
  expect(state.attachments.shoulderLeft).toEqual(state.ref.shoulderLeft);
  expect(state.attachments.shoulderRight).toEqual(state.ref.shoulderRight);
});
