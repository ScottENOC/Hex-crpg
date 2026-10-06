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
    contains(layersSource, "const BUILD='20261007-unified-clothing-v4';");
    contains(layersSource, 'const OUTERWEAR={top:.195,waist:.535,bottom:1.005};');
    contains(layersSource, '...outerwearTargets(.077,.846)');
    contains(layersSource, '...outerwearTargets(.212,.576)');

    // Character clothing no longer has a second shirt renderer: clothingLayers.js
    // is the sole clothing path and humanoidRenderer.js caches final composites.
    contains(hotPathSource, 'Character clothing is rendered exclusively by clothingLayers.js');
    assert.doesNotMatch(hotPathSource, /slot !== 'shirt'/);

    // Undergarments and pants still use the established fitting path; this
    // performance change is intentionally limited to shirts/dresses.
    contains(layersSource, "if(slot==='underwear') return set.underwear;");
    contains(layersSource, "if(slot==='bra') return set.bra;");
    contains(layersSource, 'bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18}');
    contains(layersSource, 'bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18}');
    contains(layersSource, 'dy-=targetH*.60;');
    contains(layersSource, "if(itemId==='underwear_bra'){");
});

test('starter tops use retained assets and explicit directional views where authored', () => {
    const layersSource = read('clothingLayers.js');
    for (const id of ['top_blouse','top_dress','top_shirt_f','top_masc_laced']) {
        contains(layersSource, `front:'images/equipment/clothing/${id}_front.png'`);
        contains(layersSource, `side:'images/equipment/clothing/${id}_side.png'`);
        contains(layersSource, `back:'images/equipment/clothing/${id}_back.png'`);
        excludes(layersSource, `images/equipment/clothing/${id}.png`);
    }
    contains(layersSource, "const MASCULINE_START_TOPS=['top_masc_laced'];");
    contains(layersSource, "const FEMININE_START_TOPS=['top_blouse','top_dress','top_shirt_f'];");
    contains(layersSource, "const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','top_masc_lacework','traveler_garb']);");
    contains(layersSource, "for(const id of MASCULINE_START_TOPS) if(window.items[id]) window.items[id].clothingGender='male';");
    contains(layersSource, "for(const id of FEMININE_START_TOPS) if(window.items[id]) window.items[id].clothingGender='female';");
    excludes(layersSource, "top_shirt:singleLayer('shirt'");
    excludes(layersSource, "top_tunic:singleLayer('shirt'");
    excludes(layersSource, 'images/equipment/clothing/top_masc_lacework.png');
});

test('transparent underwear assets and alternate styles are wired as PNGs', () => {
    const layersSource = read('clothingLayers.js');
    const pngAssets = [
        'briefs_female_front.png',
        'briefs_female_side.png',
        'briefs_female_back.png',
        'briefs_gstring_front.png',
        'briefs_gstring_side.png',
        'briefs_gstring_back.png',
        'bra_front.png',
        'bra_side.png',
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

test('pants use the current directional PNG assets', () => {
    const layersSource = read('clothingLayers.js');
    for (const id of ['pants_baggy_wraps','pants_breeches','pants_hose','pants_lattice']) {
        contains(layersSource, `front:'images/equipment/clothing/${id}_front.png'`);
        contains(layersSource, `side:'images/equipment/clothing/${id}_side.png'`);
        contains(layersSource, `back:'images/equipment/clothing/${id}_back.png'`);
    }
});

test('bootstrap clothing layers all consume the shared presentation build token', () => {
    const indexSource = read('index.html');
    const creationSource = read('characterCreation.js');
    const clothingLoaderSource = read('clothingSystem.js');
    const layersSource = read('clothingLayers.js');
    const nameSource = read('name.js');

    assert.match(indexSource, /<script src="characterCreation\.js\?v=[^"]+"><\/script>/);
    contains(creationSource, 'clothingSystem.js?build=${encodeURIComponent(window.PRESENTATION_BUILD');
    contains(clothingLoaderSource, "const BUILD='20261007-unified-clothing-v3';");
    contains(layersSource, "const BUILD='20261007-unified-clothing-v4';");
    contains(indexSource, '<meta name="app-build" content="');
    contains(nameSource, 'document.querySelector(\'meta[name="app-build"]\')?.content');
    contains(nameSource, 'window.PRESENTATION_BUILD = PRESENTATION_BUILD;');
    contains(nameSource, "['renderHotPathCache.js','renderHotPathCache']");
});


test('core unified garments keep their authoritative directional assets even when stale item records contain clothingLayers', () => {
    const layersSource = read('clothingLayers.js');

    // The built-in GARMENTS table is the single source of truth for the core
    // renderer. Otherwise an older window.items record can silently replace the
    // directional front/back/side mapping and make a front render draw *_side.
    const specLine = layersSource.match(/function spec\(itemId\)\{[^\n]+/s)?.[0] || '';
    assert.match(specLine, /const raw=source\?\.layers\|\|/);
    assert.match(specLine, /item\?\.clothingLayers/);

    for (const id of ['underwear_briefs', 'underwear_bra', 'top_shirt_f']) {
        contains(layersSource, id + ':');
    }
    contains(layersSource, "front:'images/equipment/clothing/briefs_female_front.png'");
    contains(layersSource, "front:'images/equipment/clothing/bra_front.png'");
    contains(layersSource, "front:'images/equipment/clothing/top_shirt_f_front.png'");
});


test('registered clothing assets are not silently omitted from the garment catalogue', () => {
    const layersSource = read('clothingLayers.js');
    const newGarmentsSource = read('newClothingGarments.js');
    for (const id of ['shirt_mesh_turtleneck','shirt_collared','shirt_plunge','shirt_tie_tank','shirt_dress_lace','pants_fitted_shorts','tights_fishnet','corset_lace','cloak_full','monk_trousers','monk_wrap']) {
        assert.match(newGarmentsSource, new RegExp('\\b' + id + '\\s*:'));
    }
    contains(layersSource, 'shirt_mesh_turtleneck:1.59');
    const retiredLowerId = ['pants', 'trousers'].join('_');
    assert.doesNotMatch(layersSource, new RegExp(retiredLowerId));
    assert.doesNotMatch(newGarmentsSource, new RegExp(retiredLowerId));
});
