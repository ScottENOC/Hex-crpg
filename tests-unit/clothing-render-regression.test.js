const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function contains(source, text) {
    assert.ok(source.includes(text), `Expected source to contain: ${text}`);
}

function excludes(source, text) {
    assert.ok(!source.includes(text), `Expected source not to contain: ${text}`);
}

test('outerwear keeps a canonical armour-relative envelope while runtime tops use the cached stretch renderer', () => {
    const rendererSource = read('humanoidRenderer.js');
    const layersSource = read('clothingLayers.js');
    const hotPathSource = read('renderHotPathCache.js');

    excludes(rendererSource, '!window.clothingSystem.visibleSlotsReady(entity,view)');
    contains(rendererSource, 'front:{x:.03,y:.205,w:.94,h:.810}');
    contains(rendererSource, 'side: {x:.18,y:.205,w:.64,h:.810}');
    contains(rendererSource, 'armourY:-.010');

    // Clothing assets share the presentation build token; the exact fallback
    // string is intentionally not a renderer contract.
    contains(layersSource, 'const BUILD=window.PRESENTATION_BUILD||');
    contains(layersSource, 'const OUTERWEAR={top:.195,waist:.535,bottom:1.005};');
    contains(layersSource, '...outerwearTargets(.077,.846)');
    contains(layersSource, '...outerwearTargets(.212,.576)');

    // Tops are deliberately intercepted before the historical complex fitter:
    // compose colour layers once, crop to the authored alpha bounds once, then
    // stretch the resulting image into the target rectangle with one drawImage.
    contains(hotPathSource, "if (slot !== 'shirt') return originalDrawSlot.apply(this, arguments);");
    contains(hotPathSource, 'const trim = alphaBounds(img);');
    contains(hotPathSource, 'ctx.drawImage(rendered, trim.x, trim.y, trim.w, trim.h, dx, dy, dw, dh);');
    contains(hotPathSource, 'ctx.drawImage(composite, bounds.left, bounds.top, bounds.width, bounds.height);');
    contains(hotPathSource, 'shirtCompositeCache');
    contains(hotPathSource, "const isLongGarment = spec?.fitMode === 'dressSplit' || itemId === 'top_dress';");
    contains(hotPathSource, "if (itemId === 'top_shirt_f') target = { ...target, y: target.y - 0.03, h: target.h + 0.06 };");

    // Undergarments and pants still use the established fitting path; this
    // performance change is intentionally limited to shirts/dresses.
    contains(layersSource, "if(slot==='underwear') return set.underwear;");
    contains(layersSource, "if(slot==='bra') return set.bra;");
    contains(layersSource, 'bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18}');
    contains(layersSource, 'bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18}');
    contains(layersSource, 'dy-=targetH*.60;');
    contains(layersSource, "if(itemId==='underwear_bra'){");
});

test('masculine starter tops are the four new two-tone PNG overlays', () => {
    const layersSource = read('clothingLayers.js');
    const masculineAssets = [
        'top_masc_toggle.png',
        'top_masc_lacework.png',
        'top_masc_laced.png',
        'top_masc_buttoned.png',
    ];

    for (const asset of masculineAssets) {
        contains(layersSource, `images/equipment/clothing/${asset}`);
    }
    contains(layersSource, "const MASCULINE_START_TOPS=['top_masc_toggle','top_masc_lacework','top_masc_laced','top_masc_buttoned'];");
    contains(layersSource, "const FEMININE_START_TOPS=['top_blouse','top_dress','top_shirt_f'];");
    contains(layersSource, "const RETIRED_TOPS=new Set(['top_shirt','top_tunic']);");
    contains(layersSource, "for(const id of MASCULINE_START_TOPS) if(window.items[id]) window.items[id].clothingGender='male';");
    contains(layersSource, "for(const id of FEMININE_START_TOPS) if(window.items[id]) window.items[id].clothingGender='female';");
    excludes(layersSource, "top_shirt:singleLayer('shirt'");
    excludes(layersSource, "top_tunic:singleLayer('shirt'");
});

test('transparent underwear assets and alternate styles are wired as PNGs', () => {
    const layersSource = read('clothingLayers.js');
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
        contains(layersSource, `images/equipment/clothing/${asset}`);
    }
    contains(layersSource, "underwear_briefs_gstring:twoToneGarment('underwear'");
    contains(layersSource, "underwear_bra_strapless:twoToneGarment('bra'");
    excludes(layersSource, 'images/equipment/clothing/briefs_female_front.jpg');
    excludes(layersSource, 'images/equipment/clothing/bra_front.jpg');
});

test('trousers use the current front and back PNG assets', () => {
    const layersSource = read('clothingLayers.js');
    contains(layersSource, "front:'images/equipment/clothing/pants_trousers.png'");
    contains(layersSource, "back:'images/equipment/clothing/pants_trousers_back.png'");
});

test('bootstrap clothing layers all consume the shared presentation build token', () => {
    const indexSource = read('index.html');
    const creationSource = read('characterCreation.js');
    const clothingLoaderSource = read('clothingSystem.js');
    const layersSource = read('clothingLayers.js');
    const nameSource = read('name.js');

    assert.match(indexSource, /<script src="characterCreation\.js\?v=[^"]+"><\/script>/);
    contains(creationSource, 'clothingSystem.js?build=${encodeURIComponent(window.PRESENTATION_BUILD');
    contains(clothingLoaderSource, 'const BUILD=window.PRESENTATION_BUILD||');
    contains(layersSource, 'const BUILD=window.PRESENTATION_BUILD||');
    contains(nameSource, "const PRESENTATION_BUILD = '20260930-render-hotpath-cache-v1';");
    contains(nameSource, "['renderHotPathCache.js','renderHotPathCache']");
});
