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
  test('trousers recover after a transient image failure and draw in every authored view', async ({ page }) => {
    let trousersRequests = 0;
    await page.route('**/images/equipment/clothing/pants_trousers.png*', async route => {
      trousersRequests += 1;
      if (trousersRequests === 1) await route.abort('failed');
      else await route.continue();
    });

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

    await expect.poll(async () => (await drawFacing(page, 'down')).layers.includes('pants'), { timeout: 5000 }).toBe(true);
    expect((await drawFacing(page, 'right')).layers).toContain('pants');
    expect((await drawFacing(page, 'up')).layers).toContain('pants');
    expect(trousersRequests).toBeGreaterThanOrEqual(2);
  });

  test('braid recovers its side/back images and uses tight directional art', async ({ page }) => {
    let sideRequests = 0;
    let backRequests = 0;
    await page.route('**/images/characters/human_female/hair_braid_side.png*', async route => {
      sideRequests += 1;
      if (sideRequests === 1) await route.abort('failed');
      else await route.continue();
    });
    await page.route('**/images/characters/human_female/hair_braid_back.png*', async route => {
      backRequests += 1;
      if (backRequests === 1) await route.abort('failed');
      else await route.continue();
    });

    await createCharacter(page, { race:'human', gender:'female' });
    await expect.poll(async () => {
      const readiness = await page.evaluate(() => {
        const set = window.DIRECTIONAL_CHARACTER_ASSETS?.human_female?.hair?.braid;
        return {
          rendererReady: !!window.__humanoidRendererReady,
          front: set?.front?.naturalWidth || 0,
          side: set?.side?.naturalWidth || 0,
          back: set?.back?.naturalWidth || 0,
        };
      });
      return { ...readiness, sideRequests, backRequests };
    }, { timeout: 10000 }).toMatchObject({ rendererReady:true, front:1254, side:175, back:192 });
    await page.evaluate(() => {
      const entity = (window.entities || []).find(e =>
        e?.alive && e.side === 'player' && e.race === 'human' && e.gender === 'female'
      );
      entity.hairStyle = 'braid';
      entity.equipped = { ...(entity.equipped || {}), helmet:null };
    });

    const right = await drawFacing(page, 'right');
    expect(right.ok).toBe(true);
    expect(right.layers).toContain('hair');
    expect(right.hair).toMatchObject({ style:'braid', view:'side', tightDirectional:true, drew:true });
    expect(right.hair.crop).toEqual({ x:0, y:0, w:1, h:1 });
    expect(right.hair.sourceWidth).toBeGreaterThan(0);
    expect(right.hair.sourceWidth).toBeLessThan(400);

    const back = await drawFacing(page, 'up');
    expect(back.ok).toBe(true);
    expect(back.layers).toContain('hair');
    expect(back.hair).toMatchObject({ style:'braid', view:'back', tightDirectional:true, drew:true });
    expect(back.hair.crop).toEqual({ x:0, y:0, w:1, h:1 });
    expect(back.hair.sourceWidth).toBeGreaterThan(0);
    expect(back.hair.sourceWidth).toBeLessThan(400);
    expect(sideRequests).toBeGreaterThanOrEqual(2);
    expect(backRequests).toBeGreaterThanOrEqual(2);
  });
});
