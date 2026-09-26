const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('live heavy armour uses actual directional body bounds', async ({ page }) => {
  await createCharacter(page, { race:'human', gender:'female' });
  await page.waitForFunction(() => window.__directionalRigHandoffInstalled === true);
  await page.waitForFunction(() => window.__humanFemaleLastBodyDraw?.source === 'directional-rig-handoff');

  await page.evaluate(() => {
    const entity = (window.entities || []).find(e => e?.race === 'human' && e?.gender === 'female' && e?.side === 'player')
      || (window.entities || []).find(e => e?.race === 'human' && e?.gender === 'female');
    if (!entity) throw new Error('No human-female entity found');
    entity.equipped = entity.equipped || {};
    entity.equipped.armor = 'heavy_armor';
    entity.goldGear = false;
    if (window.HUMAN_FEMALE_EQUIPMENT_FIT) delete window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour;
    if (typeof window.drawMap === 'function') window.drawMap();
    if (typeof window.renderEntities === 'function') window.renderEntities();
  });

  await page.waitForFunction(() => window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour?.compositionSource === 'directional-rig-handoff-direct', null, { timeout:5000 });

  const snapshot = await page.evaluate(() => ({
    body: window.__humanFemaleLastBodyDraw && {
      width: window.__humanFemaleLastBodyDraw.width,
      height: window.__humanFemaleLastBodyDraw.height,
      source: window.__humanFemaleLastBodyDraw.source,
    },
    fit: window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour,
  }));

  expect(snapshot.body.source).toBe('directional-rig-handoff');
  expect(snapshot.body.width / snapshot.body.height).toBeCloseTo(0.48, 3);
  expect(snapshot.fit.placementSource).toBe('actual-body-draw-bounds');
  expect(snapshot.fit.compositionSource).toBe('directional-rig-handoff-direct');
  expect(snapshot.fit.bodyBounds.width).toBeCloseTo(snapshot.body.width, 3);
  expect(snapshot.fit.bodyBounds.height).toBeCloseTo(snapshot.body.height, 3);
  expect(snapshot.fit.visibleTopPx).toBeCloseTo(snapshot.fit.targetTopPx, 4);
  expect(snapshot.fit.visibleBottomPx).toBeCloseTo(snapshot.fit.targetBottomPx, 4);
});
