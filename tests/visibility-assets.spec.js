const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

function drawFacing(page, facing) {
  return page.evaluate((requestedFacing) => {
    const entity = (window.entities || []).find(e =>
      e?.alive && e.side === 'player' && e.race === 'human' && e.gender === 'female'
    );
    if (!entity) throw new Error('No player-side human female entity found');
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const ok = window.drawDirectionalHumanoidInBounds(
      ctx,
      entity,
      { left: 45, top: 10, width: 130, height: 290 },
      requestedFacing,
    );
    return {
      ok,
      layers: [...(window.__humanoidRendererLastLayerOrder || [])],
      hair: window.__humanoidRendererLastHair ? { ...window.__humanoidRendererLastHair } : null,
    };
  }, facing);
}

test.describe('visibility asset regressions', () => {
  test('trousers draw in every authored view', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__humanoidRendererReady && window.clothingSystem?.drawSlot);
    await page.evaluate(() => {
      const entity = (window.entities || []).find(e =>
        e?.alive && e.side === 'player' && e.race === 'human' && e.gender === 'female'
      );
      entity.displayClothes = true;
      entity.displayArmour = false;
      entity.equipped = { ...(entity.equipped || {}), pants:'pants_trousers', armor:null };
    });

    for (const facing of ['down', 'right', 'up']) {
      await expect.poll(async () => (await drawFacing(page, facing)).layers.includes('pants'), { timeout: 5000 }).toBe(true);
    }
  });

  test('braid uses its side and back directional art in the live renderer', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__humanoidRendererReady === true);
    await page.evaluate(() => {
      const entity = (window.entities || []).find(e =>
        e?.alive && e.side === 'player' && e.race === 'human' && e.gender === 'female'
      );
      entity.hairStyle = 'braid';
      entity.equipped = { ...(entity.equipped || {}), helmet:null };
    });

    await expect.poll(async () => (await drawFacing(page, 'right')).hair?.drew === true, { timeout: 5000 }).toBe(true);
    const right = await drawFacing(page, 'right');
    expect(right.ok).toBe(true);
    expect(right.layers).toContain('hair');
    expect(right.hair).toMatchObject({ style:'braid', view:'side', drew:true });
    expect(right.hair.sourceWidth).toBeGreaterThan(0);

    await expect.poll(async () => (await drawFacing(page, 'up')).hair?.drew === true, { timeout: 5000 }).toBe(true);
    const back = await drawFacing(page, 'up');
    expect(back.ok).toBe(true);
    expect(back.layers).toContain('hair');
    expect(back.hair).toMatchObject({ style:'braid', view:'back', drew:true });
    expect(back.hair.sourceWidth).toBeGreaterThan(0);
  });
});
