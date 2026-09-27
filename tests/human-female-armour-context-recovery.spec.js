const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('human-female armour compositor recovers context when the prior body record is missing', async ({ page }) => {
  await createCharacter(page, { race:'human', gender:'female' });
  await page.waitForFunction(() =>
    window.__directionalRigHandoffInstalled === true &&
    window.__directionalRigArmourCompositorInstalled === true &&
    window.__directionalEquipmentFitTuningApplied === true &&
    typeof window.computeHumanFemaleRigidArmourPlacement === 'function' &&
    !!window.HUMAN_FEMALE_EQUIPMENT_FIT?.targetVerticalByView?.front &&
    !!window.gameVisuals?.humanLight?.complete &&
    window.gameVisuals.humanLight.naturalWidth > 0
  );

  const result = await page.evaluate(() => {
    const entity = (window.entities || []).find(e =>
      e?.alive && e.race === 'human' && e.gender === 'female' && e.hex && !e.customImage
    );
    if (!entity) return { error:'no human-female entity' };

    const p = window.hexToPixel(entity.hex.q, entity.hex.r);
    const hs = Number(window.hexSize) || 1;
    const z = Number(window.cameraZoom) || 1;
    const legacyW = 1.60 * hs * z;
    const legacyH = 1.92 * hs * z;
    const topShift = 0.10 * hs * z;
    const armourW = legacyW * 1.58;
    const armourH = legacyH - topShift;

    // Construct a legacy armour rectangle centred over this actual entity,
    // but deliberately remove any cached body record first. The compositor
    // must reconstruct the body box from this armour rectangle itself.
    const legacyTop = p.y - legacyH / 2;
    const args = [
      p.x - armourW / 2,
      legacyTop + topShift,
      armourW,
      armourH,
    ];

    window.__humanFemaleLastBodyDraw = null;
    window.__directionalRigHandoffLastBody = null;
    window.__directionalRigHandoffLastArmour = null;
    window.__directionalRigHandoffLastMiss = null;

    window.mapCtx.drawImage(window.gameVisuals.humanLight, ...args);

    const armour = window.__directionalRigHandoffLastArmour;
    const body = window.__directionalRigHandoffLastBody;
    const miss = window.__directionalRigHandoffLastMiss;
    return {
      armour: armour && {
        compositionSource:armour.compositionSource,
        placementSource:armour.placementSource,
        stripDeformation:armour.stripDeformation,
        view:armour.view,
        entityName:armour.entity?.name || null,
        visibleLeftPx:armour.visibleLeftPx,
        visibleRightPx:armour.visibleRightPx,
        targetLeftPx:armour.targetLeftPx,
        targetRightPx:armour.targetRightPx,
        visibleTopPx:armour.visibleTopPx,
        visibleBottomPx:armour.visibleBottomPx,
        targetTopPx:armour.targetTopPx,
        targetBottomPx:armour.targetBottomPx,
      },
      body: body && {
        source:body.source,
        entityName:body.entity?.name || null,
        width:body.width,
        height:body.height,
      },
      miss,
      expectedEntityName:entity.name,
      expectedBodyWidth:legacyH * 0.48,
      expectedBodyHeight:legacyH,
    };
  });

  expect(result.error).toBeUndefined();
  expect(result.miss).toBeNull();
  expect(result.body).toBeTruthy();
  expect(result.body.source).toBe('armour-draw-context-recovery');
  expect(result.body.entityName).toBe(result.expectedEntityName);
  expect(result.body.width).toBeCloseTo(result.expectedBodyWidth, 6);
  expect(result.body.height).toBeCloseTo(result.expectedBodyHeight, 6);

  expect(result.armour).toBeTruthy();
  expect(result.armour.compositionSource).toBe('directional-rig-handoff-rigid');
  expect(result.armour.placementSource).toBe('armour-draw-context-recovery');
  expect(result.armour.stripDeformation).toBe(false);
  expect(result.armour.entityName).toBe(result.expectedEntityName);
  expect(result.armour.visibleLeftPx).toBeCloseTo(result.armour.targetLeftPx, 6);
  expect(result.armour.visibleRightPx).toBeCloseTo(result.armour.targetRightPx, 6);
  expect(result.armour.visibleTopPx).toBeCloseTo(result.armour.targetTopPx, 6);
  expect(result.armour.visibleBottomPx).toBeCloseTo(result.armour.targetBottomPx, 6);
});
