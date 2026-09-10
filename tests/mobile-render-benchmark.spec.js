const { test } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function waitForFrame(page, requestExpression) {
  return page.evaluate(async (expr) => {
    const before = window.performanceRenderStats?.frames || 0;
    // eslint-disable-next-line no-eval
    eval(expr);
    await new Promise(resolve => {
      const poll = () => {
        const s = window.performanceRenderStats;
        if (s && s.frames > before) return resolve();
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    return window.performanceRenderStats.lastFrameMs;
  }, requestExpression);
}

async function sampleFrames(page, requestExpression, count = 8) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(await waitForFrame(page, requestExpression));
  out.sort((a, b) => a - b);
  const avg = out.reduce((a, b) => a + b, 0) / out.length;
  const p50 = out[Math.floor(out.length * 0.5)];
  const p90 = out[Math.min(out.length - 1, Math.floor(out.length * 0.9))];
  return { avg, p50, p90, min: out[0], max: out[out.length - 1], samples: out };
}

test.describe('mobile rendering benchmark', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page);
  });

  test('reports pan, zoom and entity-heavy frame costs', async ({ page }) => {
    const results = {};

    // Warm normal gameplay frame.
    await page.evaluate(() => { window.cameraZoom = 1; window.drawMap(); });
    await page.waitForTimeout(100);
    results.normal = await sampleFrames(page, 'window.drawMap()');

    // Small repeated pans: should mostly hit the terrain-buffer fast path.
    results.smallPan = await sampleFrames(page,
      'window.cameraX += 8; window.cameraY += 4; window.drawMap()');

    // Large repeated pans: intended to force more buffer rebuilds.
    results.largePan = await sampleFrames(page,
      'window.cameraX += 650; window.cameraY += 350; window.drawMap()');

    // Synthetic large explored world used by the existing extreme-zoom test.
    await page.evaluate(() => {
      for (let q = -600; q <= 600; q += 3) {
        for (let r = -600; r <= 600; r += 3) window.exploredHexes.add(`${q},${r}`);
      }
      window.cameraZoom = 0.15;
      if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
    });
    await waitForFrame(page, 'window.drawMap()');
    results.extremeZoom = await sampleFrames(page, 'window.drawMap()', 5);

    // Zoom sweep over a smaller explored field.
    await page.evaluate(() => {
      window.exploredHexes.clear();
      for (let q = -220; q <= 220; q += 2) {
        for (let r = -220; r <= 220; r += 2) window.exploredHexes.add(`${q},${r}`);
      }
      window.cameraX = 0;
      window.cameraY = 0;
    });
    for (const z of [1, 0.75, 0.5, 0.25, 0.15]) {
      await page.evaluate((zoom) => {
        window.cameraZoom = zoom;
        if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
      }, z);
      await waitForFrame(page, 'window.drawMap()');
      results[`zoom_${z}`] = await sampleFrames(page, 'window.drawMap()', 4);
    }

    // Dense-entity render. Clone an existing renderable entity prototype so
    // we exercise the real draw path without inventing a special benchmark entity.
    const entityInfo = await page.evaluate(() => {
      const original = window.entities.slice();
      const template = original.find(e => e && e.alive && typeof e.getAllHexes === 'function');
      if (!template) return { added: 0 };
      const clones = [];
      for (let i = 0; i < 200; i++) {
        const clone = Object.assign(Object.create(Object.getPrototypeOf(template)), template);
        clone.hex = { q: (i % 20) - 10, r: Math.floor(i / 20) - 5 };
        clone.name = `Benchmark ${i}`;
        clone.destination = null;
        clone.alive = true;
        clones.push(clone);
      }
      window.entities = original.concat(clones);
      if (window.invalidateEntitySpatialIndex) window.invalidateEntitySpatialIndex();
      window.cameraZoom = 1;
      window.cameraX = 0;
      window.cameraY = 0;
      return { added: clones.length };
    });
    results.entityCountAdded = entityInfo.added;
    results.denseEntities = await sampleFrames(page, 'window.renderEntities()', 8);

    console.log('MOBILE_RENDER_BENCHMARK ' + JSON.stringify(results));
  });
});
