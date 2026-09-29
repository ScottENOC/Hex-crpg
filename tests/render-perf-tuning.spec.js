const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('render performance guard', () => {
  test('extreme explored-world warm frame remains below the 120ms guard', async ({ page }) => {
    await createCharacter(page);
    const ms = await page.evaluate(async () => {
      const drawAndMeasure = () => new Promise(resolve => {
        const before = window.performanceRenderStats?.frames || 0;
        window.drawMap();
        const poll = () => {
          const stats = window.performanceRenderStats;
          if (stats && stats.frames > before) return resolve(stats.lastFrameMs);
          requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      });

      for (let q = -600; q <= 600; q += 3) {
        for (let r = -600; r <= 600; r += 3) window.exploredHexes.add(`${q},${r}`);
      }
      window.cameraZoom = 0.15;
      if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
      await drawAndMeasure();
      return drawAndMeasure();
    });

    expect(ms).toBeLessThan(120);
  });
});
