const { test, expect } = require('@playwright/test');

const ROOT = 'http://127.0.0.1:3000';

test('human female tactical destinations match portrait width-to-height proportion', async ({ page }) => {
  await page.goto(`${ROOT}/index.html`);
  await page.waitForFunction(() => !!window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT?.front);
  await page.waitForFunction(() => window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT.__mapWidthPolished === true);

  const result = await page.evaluate(() => {
    const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT;
    return {
      scale: window.HUMAN_FEMALE_MAP_X_SCALE,
      frontBody: { ...layout.front.bodyDest },
      frontHair: { ...layout.front.hairDest },
      sideBody: { ...layout.side.bodyDest },
      backBody: { ...layout.back.bodyDest },
    };
  });

  // Legacy body aspect is 1.60/1.92 = 0.8333. Scaling destination X by
  // 0.576 makes the visible full-body destination 0.48x as wide as its height,
  // matching the initiative/creator renderer.
  expect(result.scale).toBeCloseTo(0.576, 3);
  expect(result.frontBody.w).toBeCloseTo(0.576, 3);
  expect(result.frontBody.x).toBeCloseTo(0.212, 3);
  expect(result.frontHair.x + result.frontHair.w / 2).toBeCloseTo(0.5, 6);
  expect(result.sideBody.x + result.sideBody.w / 2).toBeCloseTo(0.5, 6);
  expect(result.backBody.x + result.backBody.w / 2).toBeCloseTo(0.5, 6);
});
