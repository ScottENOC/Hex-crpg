const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('render performance tuning', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page);
  });

  test('wide-zoom visibility shortcut preserves the original visibility result', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fast = window.isVisibleToPlayer;
      const original = fast && fast.__original;
      const friendlies = window.entities.filter(e => e.alive && e.side === 'player');
      if (!fast?.__wideZoomBounds || typeof original !== 'function' || !friendlies.length) {
        return { installed: false, mismatches: [] };
      }

      const p = friendlies[0].hex;
      const probes = [];
      for (let dq = -35; dq <= 35; dq += 5) {
        for (let dr = -35; dr <= 35; dr += 5) probes.push({ q: p.q + dq, r: p.r + dr });
      }
      probes.push({ q: p.q + 1000, r: p.r + 1000 });
      probes.push({ q: p.q - 1000, r: p.r - 1000 });

      const mismatches = [];
      for (const hex of probes) {
        const expected = original(hex, friendlies);
        const actual = fast(hex, friendlies);
        if (expected !== actual) mismatches.push({ hex, expected, actual });
      }
      return { installed: true, mismatches };
    });

    expect(result.installed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('extreme explored-world warm frame remains below the original 120ms guard', async ({ page }) => {
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
