const { test, expect } = require('@playwright/test');

const ROOT = 'http://127.0.0.1:3000';

test.describe('explicit clothing rendering regression', () => {
  test('undergarments are compact and clothing never gates the body renderer', async ({ page }) => {
    const [rendererSource, layersSource] = await Promise.all([
      page.request.get(`${ROOT}/humanoidRenderer.js`).then(r => r.text()),
      page.request.get(`${ROOT}/clothingLayers.js`).then(r => r.text()),
    ]);

    expect(rendererSource).not.toContain('!window.clothingSystem.visibleSlotsReady(entity,view)');
    expect(layersSource).toContain("const BUILD='20260928-clothing-layers-v10'");
    expect(layersSource).toContain("if(slot==='underwear') return set.underwear;");
    expect(layersSource).toContain("if(slot==='bra') return set.bra;");
    expect(layersSource).toContain('const trim=l.sourceTone?toneBounds(img):opaqueBounds(img);');

    await page.goto(ROOT);
    await page.waitForFunction(() => window.__humanoidRendererReady === true && window.clothingSystem?.clothingTargets);

    const targets = await page.evaluate(() => window.clothingSystem.clothingTargets);
    for (const view of ['front', 'side', 'back']) {
      expect(targets[view].underwear.h).toBeLessThanOrEqual(0.20);
      expect(targets[view].bra.h).toBeLessThanOrEqual(0.20);
      expect(targets[view].underwear.w).toBeLessThan(targets[view].shirt.w);
      expect(targets[view].bra.w).toBeLessThan(targets[view].shirt.w);
      expect(targets[view].underwear.y).toBeGreaterThan(targets[view].bra.y);
    }
  });

  test('bootstrap cache keys force the renderer and clothing hotfixes', async ({ page }) => {
    const [indexSource, nameSource, creationSource, clothingLoaderSource] = await Promise.all([
      page.request.get(`${ROOT}/index.html`).then(r => r.text()),
      page.request.get(`${ROOT}/name.js`).then(r => r.text()),
      page.request.get(`${ROOT}/characterCreation.js`).then(r => r.text()),
      page.request.get(`${ROOT}/clothingSystem.js`).then(r => r.text()),
    ]);

    expect(indexSource).toContain('<script src="name.js?v=12"></script>');
    expect(indexSource).toContain('<script src="characterCreation.js?v=6"></script>');
    expect(nameSource).toContain("const PRESENTATION_BUILD = '20260928-character-visibility-clothing-v1';");
    expect(creationSource).toContain('20260928-female-average-refresh-2');
    expect(creationSource).toContain('clothingSystem.js?build=20260928-clothing-v6');
    expect(clothingLoaderSource).toContain("const BUILD='20260928-clothing-v6';");
  });
});
