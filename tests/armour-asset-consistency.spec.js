const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

const expected = {
  light: {
    front:'/images/equipment/armour/human/light.png',
    back:'/images/equipment/armour/human/light_back.webp',
  },
  medium: {
    front:'/images/equipment/armour/human/medium.png',
    back:'/images/equipment/armour/human/medium_back.webp',
  },
  heavy: {
    front:'/images/equipment/armour/human/heavy.png',
    back:'/images/equipment/armour/human/heavy_back.webp',
  },
};

function endsWithCanonical(pathname, suffix) {
  return pathname.endsWith(suffix);
}

test.describe('canonical human armour assets', () => {
  test('direct renderer uses the organised equipment armour art', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__canonicalArmourAssetsReady === true, { timeout:10000 });

    const direct = await page.evaluate(() => Object.fromEntries(
      Object.entries(window.ARMOUR_VISUAL_ASSETS || {}).map(([tier, pair]) => [tier, {
        front: pair.front ? new URL(pair.front.src, document.baseURI).pathname : null,
        back: pair.back ? new URL(pair.back.src, document.baseURI).pathname : null,
        frontReady: !!pair.front?.naturalWidth,
        backReady: !!pair.back?.naturalWidth,
      }]),
    ));

    for (const [tier, paths] of Object.entries(expected)) {
      expect(direct[tier].frontReady, `${tier} front decoded`).toBe(true);
      expect(direct[tier].backReady, `${tier} back decoded`).toBe(true);
      expect(endsWithCanonical(direct[tier].front, paths.front), `${tier} front source`).toBe(true);
      expect(endsWithCanonical(direct[tier].back, paths.back), `${tier} back source`).toBe(true);
    }
  });

  test('renderer, preload and inventory contain no legacy root armour paths', async ({ page }) => {
    await page.goto('/');
    const sources = await page.evaluate(async () => {
      const read = async path => {
        const response = await fetch(`${path}?armour-source-check=${Date.now()}`, { cache:'no-store' });
        if (!response.ok) throw new Error(`Unable to fetch ${path}: ${response.status}`);
        return response.text();
      };
      return {
        renderer:await read('humanoidRenderer.js'),
        preload:await read('main.js'),
        inventory:await read('equipmentInterface.js'),
      };
    });

    const legacyRootArmour = /images\/human(?:light|medium|heavy)armour(?:_front|_back)?\.(?:png|svg|webp)/;
    for (const [name, source] of Object.entries(sources)) {
      expect(source, `${name} has no legacy root armour source`).not.toMatch(legacyRootArmour);
    }

    expect(sources.renderer).toContain("images/equipment/armour/human/light.png");
    expect(sources.renderer).toContain("images/equipment/armour/human/light_back.webp");
    expect(sources.preload).toContain("images/equipment/armour/human/light.png");
    expect(sources.inventory).toContain('images/equipment/armour/human/${tier}.png');
  });
});
