const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('packed directional hair remains independently recolourable', async ({ page }) => {
  await createCharacter(page);
  await page.waitForFunction(() => window.__directionalPresentationFixesBuild === '20260928-character-presentation-v5');
  await page.waitForFunction(() => {
    const hair = window.DIRECTIONAL_CHARACTER_ASSETS?.human_female?.hair?.brown_1?.front;
    return hair?.__presentationPacked && hair.width > 0 && hair.height > 0;
  });

  const result = await page.evaluate(() => {
    const hair = window.DIRECTIONAL_CHARACTER_ASSETS.human_female.hair.brown_1.front;
    const tinted = window.getRecoloredCharacterHairSprite(hair, 120, 1, 1);
    const originalCtx = hair.getContext('2d', { willReadFrequently: true });
    const tintedCtx = tinted.getContext('2d', { willReadFrequently: true });
    const original = originalCtx.getImageData(0, 0, hair.width, hair.height).data;
    const changed = tintedCtx.getImageData(0, 0, tinted.width, tinted.height).data;

    let opaque = 0;
    let rgbChanged = 0;
    for (let i = 0; i < original.length; i += 4) {
      if (original[i + 3] < 50) continue;
      opaque++;
      if (original[i] !== changed[i] || original[i + 1] !== changed[i + 1] || original[i + 2] !== changed[i + 2]) rgbChanged++;
    }

    const again = window.getRecoloredCharacterHairSprite(hair, 120, 1, 1);
    return {
      sourceIsPackedCanvas: hair instanceof HTMLCanvasElement && hair.__presentationPacked === true,
      imageCompatibility: hair.complete === true && hair.naturalWidth === hair.width && hair.naturalHeight === hair.height,
      returnsDifferentDrawable: tinted !== hair,
      opaque,
      rgbChanged,
      cached: again === tinted,
    };
  });

  expect(result.sourceIsPackedCanvas).toBe(true);
  expect(result.imageCompatibility).toBe(true);
  expect(result.returnsDifferentDrawable).toBe(true);
  expect(result.opaque).toBeGreaterThan(0);
  expect(result.rgbChanged).toBeGreaterThan(0);
  expect(result.cached).toBe(true);
});
