const { test, expect } = require('@playwright/test');

test('suppresses synthetic click after a map touchend but preserves genuine clicks', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__movementTapDedupeInstalled === true);

  const result = await page.evaluate(() => {
    const canvas = document.getElementById('mapCanvas');
    let clicks = 0;
    canvas.addEventListener('click', () => { clicks++; });

    function touchEnd(x, y) {
      const touch = new Touch({
        identifier: 1,
        target: canvas,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pageX: x,
        pageY: y,
      });
      canvas.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        changedTouches: [touch],
        touches: [],
        targetTouches: [],
      }));
    }

    touchEnd(120, 160);
    const synthetic = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 160,
    });
    const syntheticDispatchResult = canvas.dispatchEvent(synthetic);
    const afterSynthetic = clicks;

    // A click far enough away cannot be the compatibility click for that tap.
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 260,
    }));

    return {
      afterSynthetic,
      afterGenuine: clicks,
      syntheticPrevented: !syntheticDispatchResult || synthetic.defaultPrevented,
      config: window.__movementTapDedupeConfig,
      suppressed: window.__lastSuppressedSyntheticMapClick,
    };
  });

  expect(result.config.maxDelayMs).toBeGreaterThanOrEqual(500);
  expect(result.config.maxDistancePx).toBeLessThanOrEqual(25);
  expect(result.afterSynthetic).toBe(0);
  expect(result.syntheticPrevented).toBe(true);
  expect(result.suppressed).toBeTruthy();
  expect(result.afterGenuine).toBe(1);
});
