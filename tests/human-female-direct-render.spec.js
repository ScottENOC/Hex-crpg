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
  const facingSource = await (await page.request.get(`${ROOT}/facingSystem.js?v=5`)).text();
  const nameSource = await (await page.request.get(`${ROOT}/name.js`)).text();

  expect(facingSource).toContain('const RIG_SEED_CANVAS');
  expect(facingSource).toContain('artWidth = dh * HUMAN_FEMALE_RENDER_ASPECT');
  expect(facingSource).toContain('riggedDrawImage(RIG_SEED_CANVAS, dx, dy, dw, dh)');
  expect(facingSource).not.toContain('riggedDrawImage(originalImg');
  expect(facingSource).not.toContain('ctx.globalAlpha = 0');
  expect(nameSource).not.toContain('humanFemaleMapPolish.js');
});
