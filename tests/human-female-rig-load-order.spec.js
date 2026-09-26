const { test, expect } = require('@playwright/test');

test('human female canonical anchors are ready before equipment consumers', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.HUMAN_FEMALE_REFERENCE_RIGS?.front?.anchors && window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female?.front);

  const state = await page.evaluate(() => {
    const a = window.HUMAN_FEMALE_REFERENCE_RIGS.front.anchors;
    const d = window.DIRECTIONAL_ATTACHMENT_RIGS.human_female.front;
    return {
      build: window.PRESENTATION_BUILD,
      ref: {
        leftFoot: a.leftFoot,
        rightFoot: a.rightFoot,
        leftFootSole: a.leftFootSole,
        rightFootSole: a.rightFootSole,
        mainHandGrip: a.mainHandGrip,
        offHandGrip: a.offHandGrip,
        shoulderTopLeft: a.armourShoulderTopLeft,
        shoulderTopRight: a.armourShoulderTopRight,
      },
      attachments: { mainHand: d.mainHand, offHand: d.offHand },
      calibrated: window.__humanFemaleReferenceRigCalibrated,
    };
  });

  expect(state.build).toBe('20260926-rig-load-order-fix');
  expect(state.ref.leftFoot).toEqual({ x: 0.305, y: 0.965 });
  expect(state.ref.rightFoot).toEqual({ x: 0.695, y: 0.965 });
  expect(state.ref.leftFootSole).toEqual({ x: 0.305, y: 0.995 });
  expect(state.ref.rightFootSole).toEqual({ x: 0.695, y: 0.995 });
  expect(state.ref.mainHandGrip).toEqual({ x: 0.08, y: 0.545 });
  expect(state.ref.offHandGrip).toEqual({ x: 0.92, y: 0.545 });
  expect(state.ref.shoulderTopLeft).toEqual({ x: 0.215, y: 0.225 });
  expect(state.ref.shoulderTopRight).toEqual({ x: 0.785, y: 0.225 });
  expect(state.attachments.mainHand).toEqual(state.ref.mainHandGrip);
  expect(state.attachments.offHand).toEqual(state.ref.offHandGrip);
  expect(state.calibrated).toBe(true);
});
