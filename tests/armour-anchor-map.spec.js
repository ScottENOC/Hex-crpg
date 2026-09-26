const { test, expect } = require('@playwright/test');

test('armour source anchor map and settings control load', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__armourAnchorDebugLoaded && window.HUMAN_FEMALE_ARMOUR_ANCHOR_MAP);

  const state = await page.evaluate(() => ({
    build: window.PRESENTATION_BUILD,
    loaded: window.__armourAnchorDebugLoaded,
    toggle: !!document.getElementById('graphics-show-armour-anchors'),
    map: window.HUMAN_FEMALE_ARMOUR_ANCHOR_MAP,
  }));

  expect(state.build).toBe('20260926-armour-source-anchor-map');
  expect(state.loaded).toBe(true);
  expect(state.toggle).toBe(true);
  expect(state.map.topExtent.body).toEqual(['armourShoulderTopLeft','armourShoulderTopRight']);
  expect(state.map.bottomExtent.body).toEqual(['leftFootSole','rightFootSole']);
  expect(state.map.leftExtent.role).toBe('diagnostic');
  expect(state.map.rightExtent.role).toBe('diagnostic');
});
