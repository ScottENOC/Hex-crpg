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
  test('direct renderer and inventory use the organised equipment armour art', async ({ page }) => {
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

    await page.waitForFunction(() => typeof window.renderEquipmentInterface === 'function');
    const inventorySources = await page.evaluate(() => {
      const p = window.player;
      const out = {};
      for (const [tier, id] of Object.entries({ light:'light_armor', medium:'medium_armor', heavy:'heavy_armor' })) {
        p.equipped = { ...(p.equipped || {}), armor:id };
        // The live equipment UI correctly prefers the physical instance for an
        // equipped slot. This test is deliberately swapping base armour tiers,
        // so clear the previously equipped instance or it would mask the new ID.
        if (p.equippedInstances) delete p.equippedInstances.armor;
        window.renderEquipmentInterface();
        const armourSlot = [...document.querySelectorAll('#inventory-content button')]
          .find(button => button.textContent?.includes('Armour'));
        const image = armourSlot?.querySelector('img');
        out[tier] = image ? new URL(image.src, document.baseURI).pathname : null;
      }
      return out;
    });

    for (const [tier, paths] of Object.entries(expected)) {
      expect(inventorySources[tier], `${tier} inventory image exists`).toBeTruthy();
      expect(endsWithCanonical(inventorySources[tier], paths.front), `inventory uses ${paths.front}`).toBe(true);
    }
  });
});
