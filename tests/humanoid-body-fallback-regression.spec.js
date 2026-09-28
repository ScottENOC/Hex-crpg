const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

const ROOT = 'http://127.0.0.1:3000';

test('direct humanoid renderer declines a frame when its body image is unavailable', async ({ page }) => {
  await createCharacter(page, { race:'human', gender:'female' });
  await page.waitForFunction(() => {
    const entity = (window.entities || []).find(e => e.alive && e.race === 'human' && e.gender === 'female' && e.side === 'player');
    if (!entity) return false;
    const bodyType = entity.bodyType || 'average';
    const bodySets = window.DIRECTIONAL_CHARACTER_ASSETS?.human_female?.body;
    const body = (bodySets?.[bodyType] || bodySets?.average)?.front;
    return window.__humanoidRendererReady === true && body?.naturalWidth > 0;
  });

  const handled = await page.evaluate(() => {
    const entity = (window.entities || []).find(e => e.alive && e.race === 'human' && e.gender === 'female' && e.side === 'player');
    if (!entity) throw new Error('No player-side human female entity found');

    const bodyType = entity.bodyType || 'average';
    const bodySets = window.DIRECTIONAL_CHARACTER_ASSETS?.human_female?.body;
    const assets = bodySets?.[bodyType] || bodySets?.average;
    if (!assets) throw new Error(`Human-female direct body assets unavailable for ${bodyType}`);

    const original = assets.front;
    const pending = new Image();
    assets.front = pending;
    entity.facing = 'down';

    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const height = 240;
    const width = height * (window.HUMAN_FEMALE_RENDER_ASPECT || 0.48);

    try {
      return window.drawDirectionalHumanoidInBounds(
        ctx,
        entity,
        { left:(canvas.width-width)/2, top:20, width, height },
        'down',
      );
    } finally {
      assets.front = original;
    }
  });

  expect(handled).toBe(false);

  const rendererSource = await page.request.get(`${ROOT}/humanoidRenderer.js`).then(r => r.text());
  expect(rendererSource).toContain('if (!imageReady(sourceBody)) return false;');
  expect(rendererSource).not.toContain('if (!imageReady(sourceBody)) return true;');
});
