const { test, expect } = require('@playwright/test');

const ROOT = 'http://127.0.0.1:3000';

test('human female uses neutral shared layout and map-only 0.48 aspect', async ({ page }) => {
  await page.goto(`${ROOT}/index.html`);
  await page.waitForFunction(() => !!window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT?.front);

  const state = await page.evaluate(() => ({
    aspect: window.HUMAN_FEMALE_RENDER_ASPECT,
    frontBody: { ...window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT.front.bodyDest },
    frontHair: { ...window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT.front.hairDest },
    polished: !!window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT.__mapWidthPolished,
  }));

  expect(state.aspect).toBeCloseTo(0.48, 6);
  expect(state.frontBody).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  expect(state.frontHair.w).toBeCloseTo(0.56, 6);
  expect(state.polished).toBe(false);
});

test('map replacement seeds equipment rig without drawing legacy female body', async ({ page }) => {
  const facingSource = await (await page.request.get(`${ROOT}/facingSystem.js?v=6`)).text();
  const nameSource = await (await page.request.get(`${ROOT}/name.js`)).text();

  expect(facingSource).toContain('const RIG_SEED_CANVAS');
  expect(facingSource).toContain('artWidth = dh * HUMAN_FEMALE_RENDER_ASPECT');
  expect(facingSource).toContain('riggedDrawImage(RIG_SEED_CANVAS, dx, dy, dw, dh)');
  expect(facingSource).not.toContain('riggedDrawImage(originalImg');
  expect(facingSource).not.toContain('ctx.globalAlpha = 0');
  expect(nameSource).not.toContain('humanFemaleMapPolish.js');
});

test('legacy full-body female hair is discarded before body detection', async ({ page }) => {
  const facingSource = await (await page.request.get(`${ROOT}/facingSystem.js?v=6`)).text();
  const suppression = 'if (img && img === window.gameVisuals?.humanHair) return;';
  const suppressionIndex = facingSource.indexOf(suppression);
  const bodyDetectionIndex = facingSource.indexOf('if (args.length === 4)', suppressionIndex);

  // This is intentionally a source-order contract: the obsolete full-body
  // hair sprite must be rejected before a same-size image can enter body
  // detection and be interpreted as another directional character. Do not
  // couple the regression test to explanatory comment wording.
  expect(suppressionIndex).toBeGreaterThan(-1);
  expect(bodyDetectionIndex).toBeGreaterThan(suppressionIndex);
});

test('direct female armour handoff owns final pixels and does not strip-warp them', async ({ page }) => {
  const handoffSource = await (await page.request.get(`${ROOT}/directionalRigHandoff.js`)).text();
  const nameSource = await (await page.request.get(`${ROOT}/name.js`)).text();

  expect(handoffSource).toContain('function computeRigidArmourPlacement');
  expect(handoffSource).toContain("compositionSource:'directional-rig-handoff-rigid'");
  expect(handoffSource).toContain('stripDeformation:false');
  expect(handoffSource).not.toContain('drawStripDeformedArmour(');
  expect(handoffSource).not.toContain('computeHumanFemaleMeasuredArmourPlacement(');

  const fitterIndex = nameSource.indexOf("['directionalEquipmentTuning.js','directionalEquipmentTuning']");
  const handoffIndex = nameSource.indexOf("['directionalRigHandoff.js','directionalRigHandoff']");
  expect(fitterIndex).toBeGreaterThan(-1);
  expect(handoffIndex).toBeGreaterThan(fitterIndex);
});
