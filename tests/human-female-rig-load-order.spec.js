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
      bodyObserver: window.__humanFemaleBodyBoundsObserverInstalled,
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

  expect(state.build).toBe('20260927-armour-context-recovery');
  expect(state.rigVersion).toBe('measured-front-20260926');
  expect(state.attachmentSource).toBe('canonical-sprite-rig');
  expect(state.debugMutatesRig).toBe(false);
  expect(state.bodyObserver).toBe(true);

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

test('rigid armour compositor maps all four opaque extents to the body armour envelope', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.computeHumanFemaleRigidArmourPlacement === 'function');

  const result = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 1000;
    image.height = 1000;
    const ctx = image.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(250, 100, 500, 700);

    const trim = {
      originalWidth: 1000,
      originalHeight: 1000,
      trimLeft: 250,
      trimTop: 100,
      trimWidth: 500,
      trimHeight: 700,
    };
    const body = { left: 100, top: 200, width: 400, height: 600 };
    return window.computeHumanFemaleRigidArmourPlacement(image, 'front', body, trim);
  });

  expect(result.placementSource).toBe('actual-body-draw-bounds');
  expect(result.compositionSource).toBe('rigid-alpha-envelope');
  expect(result.targetTopPx).toBeCloseTo(200 + 0.225 * 600, 8);
  expect(result.targetBottomPx).toBeCloseTo(200 + 0.995 * 600, 8);
  expect(result.visibleTopPx).toBeCloseTo(result.targetTopPx, 8);
  expect(result.visibleBottomPx).toBeCloseTo(result.targetBottomPx, 8);
  expect(result.visibleLeftPx).toBeCloseTo(result.targetLeftPx, 8);
  expect(result.visibleRightPx).toBeCloseTo(result.targetRightPx, 8);
  expect(result.targetLeftPx).toBeCloseTo(bodyLeft(100, 400, result.rig), 8);
  expect(result.targetRightPx).toBeCloseTo(bodyRight(100, 400, result.rig), 8);

  function bodyLeft(left, width, rig) {
    return left + Math.min(rig.shoulderL, rig.waistL, rig.hemL) * width;
  }
  function bodyRight(left, width, rig) {
    return left + Math.max(rig.shoulderR, rig.waistR, rig.hemR) * width;
  }
});

test('legacy armour draw can recover the directional female body box without a body observer event', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.computeHumanFemaleBodyBoundsFromLegacyArmourDraw === 'function');

  const result = await page.evaluate(() => {
    const oldHex = window.hexSize;
    const oldZoom = window.cameraZoom;
    window.hexSize = 50;
    window.cameraZoom = 1;
    try {
      // Legacy female body: 80 x 96 px. The armour starts 8 px below body
      // top and preserves the same bottom edge, so its height is 88 px.
      return window.computeHumanFemaleBodyBoundsFromLegacyArmourDraw([270, 208, 60, 88]);
    } finally {
      window.hexSize = oldHex;
      window.cameraZoom = oldZoom;
    }
  });

  expect(result).toBeTruthy();
  expect(result.legacy).toEqual({ left: 260, top: 200, width: 80, height: 96 });
  expect(result.topShift).toBeCloseTo(8, 8);
  expect(result.centreX).toBeCloseTo(300, 8);
  expect(result.centreY).toBeCloseTo(248, 8);
  expect(result.bounds.top).toBeCloseTo(200, 8);
  expect(result.bounds.height).toBeCloseTo(96, 8);
  expect(result.bounds.width).toBeCloseTo(96 * 0.48, 8);
  expect(result.bounds.left).toBeCloseTo(300 - (96 * 0.48) / 2, 8);
});
