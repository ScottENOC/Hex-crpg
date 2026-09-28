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
    expect(layersSource).toContain('bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18}');
    expect(layersSource).toContain('bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18}');
    expect(layersSource).toContain('if(target) drawFittedGarment(ctx,rendered,sourceBounds(img,l),target,bounds,slot);');
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
