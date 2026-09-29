const { test, expect } = require('@playwright/test');

const ROOT = 'http://127.0.0.1:3000';

test.describe('explicit clothing rendering regression', () => {
  test('outerwear uses a canonical armour-relative envelope while undergarments stay compact', async ({ page }) => {
    const [rendererSource, layersSource] = await Promise.all([
      page.request.get(`${ROOT}/humanoidRenderer.js`).then(r => r.text()),
      page.request.get(`${ROOT}/clothingLayers.js`).then(r => r.text()),
    ]);

    expect(rendererSource).not.toContain('!window.clothingSystem.visibleSlotsReady(entity,view)');
    expect(rendererSource).toContain('front:{x:.03,y:.205,w:.94,h:.810}');
    expect(rendererSource).toContain('side: {x:.18,y:.205,w:.64,h:.810}');
    expect(rendererSource).toContain('armourY:-.010');

    expect(layersSource).toContain("const BUILD='20260929-clothing-layers-v16'");
    expect(layersSource).toContain('const OUTERWEAR={top:.195,waist:.535,bottom:1.005};');
    expect(layersSource).toContain('...outerwearTargets(.077,.846)');
    expect(layersSource).toContain('...outerwearTargets(.212,.576)');
    expect(layersSource).toContain("if(slot==='shirt'||slot==='pants'){");
    expect(layersSource).toContain('ctx.drawImage(source,trim.x,trim.y,trim.w,trim.h,targetX,targetY,targetW,targetH);');
    expect(layersSource).not.toContain('OUTERWEAR_WIDTH_USAGE');

    expect(layersSource).toContain("if(slot==='underwear') return set.underwear;");
    expect(layersSource).toContain("if(slot==='bra') return set.bra;");
    expect(layersSource).toContain('bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18}');
    expect(layersSource).toContain('bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18}');
    expect(layersSource).toContain('const trim=l.sourceTone?toneBounds(img):opaqueBounds(img);');
    expect(layersSource).toContain('drawFittedGarment(ctx,rendered,trim,target,bounds,slot,e,itemId)');
  });

  test('transparent underwear assets and alternate styles are wired as PNGs', async ({ page }) => {
    const layersSource = await page.request.get(`${ROOT}/clothingLayers.js`).then(r => r.text());
    const pngAssets = [
      'briefs_female_front.png',
      'briefs_female_back.png',
      'briefs_gstring_front.png',
      'briefs_gstring_side.png',
      'briefs_gstring_back.png',
      'bra_front.png',
      'bra_back.png',
      'bra_strapless_front.png',
      'bra_strapless_side.png',
      'bra_strapless_back.png',
    ];

    for (const asset of pngAssets) {
      expect(layersSource).toContain(`images/equipment/clothing/${asset}`);
    }
    expect(layersSource).toContain("underwear_briefs_gstring:twoToneGarment('underwear'");
    expect(layersSource).toContain("underwear_bra_strapless:twoToneGarment('bra'");
    expect(layersSource).not.toContain('images/equipment/clothing/briefs_female_front.jpg');
    expect(layersSource).not.toContain('images/equipment/clothing/bra_front.jpg');
  });

  test('bootstrap cache keys force the current clothing layer bundle', async ({ page }) => {
    const [indexSource, creationSource, clothingLoaderSource] = await Promise.all([
      page.request.get(`${ROOT}/index.html`).then(r => r.text()),
      page.request.get(`${ROOT}/characterCreation.js`).then(r => r.text()),
      page.request.get(`${ROOT}/clothingSystem.js`).then(r => r.text()),
    ]);

    expect(indexSource).toContain('<script src="characterCreation.js?v=8"></script>');
    expect(creationSource).toContain('clothingSystem.js?build=20260928-clothing-v8');
    expect(clothingLoaderSource).toContain("const BUILD='20260928-clothing-v8';");
  });
});
