const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('live human-female map publishes directional body bounds before equipment fitting', async ({ page }) => {
  await createCharacter(page, { race:'human', gender:'female' });
  await page.waitForFunction(() => window.__directionalRigHandoffInstalled === true);
  await page.waitForFunction(() => window.__humanFemaleLastBodyDraw?.source === 'directional-rig-handoff');

  const snapshot = await page.evaluate(() => ({
    body: window.__humanFemaleLastBodyDraw && {
      left: window.__humanFemaleLastBodyDraw.left,
      top: window.__humanFemaleLastBodyDraw.top,
      width: window.__humanFemaleLastBodyDraw.width,
      height: window.__humanFemaleLastBodyDraw.height,
      view: window.__humanFemaleLastBodyDraw.view,
      source: window.__humanFemaleLastBodyDraw.source,
    },
    fit: window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour || null,
    build: window.PRESENTATION_BUILD,
  }));

  expect(snapshot.body).toBeTruthy();
  expect(snapshot.body.source).toBe('directional-rig-handoff');
  expect(snapshot.body.width / snapshot.body.height).toBeCloseTo(0.48, 3);

  // If starter equipment includes armour, prove the live fitter did not fall
  // back to the legacy invisible body rectangle. A null fit simply means this
  // particular campaign starter has no armour equipped.
  if (snapshot.fit) {
    expect(snapshot.fit.placementSource).toBe('actual-body-draw-bounds');
    expect(snapshot.fit.bodyBounds.width).toBeCloseTo(snapshot.body.width, 3);
    expect(snapshot.fit.bodyBounds.height).toBeCloseTo(snapshot.body.height, 3);
  }
});
