const { test, expect } = require('@playwright/test');

test('facing renderer still installs after spending more than five seconds in character creation', async ({ page }) => {
  await page.goto('/');

  // facingSystem.js loads before startGameCore creates mapCtx. The old code
  // stopped retrying after 100 x 50ms, so ordinary time spent in the creator
  // permanently disabled the map-facing renderer.
  await page.waitForTimeout(5600);
  expect(await page.evaluate(() => !!window.__facingRendererInstalled)).toBe(false);

  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    document.body.appendChild(canvas);
    window.mapCtx = canvas.getContext('2d');
    window.CHAR_CONFIG = window.CHAR_CONFIG || { human_female: { bodyW: 1.6, bodyH: 2.0 } };
    window.__characterRigInstalled = true;
  });

  await expect.poll(() => page.evaluate(() => !!window.__facingRendererInstalled), { timeout: 1500 }).toBe(true);
});
