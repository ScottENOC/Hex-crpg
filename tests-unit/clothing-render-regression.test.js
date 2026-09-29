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

test('outerwear uses a canonical armour-relative envelope while undergarments stay compact', () => {
    const rendererSource = read('humanoidRenderer.js');
    const layersSource = read('clothingLayers.js');

    excludes(rendererSource, '!window.clothingSystem.visibleSlotsReady(entity,view)');
    contains(rendererSource, 'front:{x:.03,y:.205,w:.94,h:.810}');
    contains(rendererSource, 'side: {x:.18,y:.205,w:.64,h:.810}');
    contains(rendererSource, 'armourY:-.010');

    contains(layersSource, "const BUILD='20260929-clothing-layers-v18'");
    contains(layersSource, 'const OUTERWEAR={top:.195,waist:.535,bottom:1.005};');
    contains(layersSource, '...outerwearTargets(.077,.846)');
    contains(layersSource, '...outerwearTargets(.212,.576)');
    contains(layersSource, "if(slot==='shirt'||slot==='pants'){");
    contains(layersSource, 'ctx.drawImage(source,trim.x,trim.y,trim.w,trim.h,targetX,targetY,targetW,targetH);');
    excludes(layersSource, 'OUTERWEAR_WIDTH_USAGE');

    contains(layersSource, "if(slot==='underwear') return set.underwear;");
    contains(layersSource, "if(slot==='bra') return set.bra;");
    contains(layersSource, 'bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18}');
    contains(layersSource, 'bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18}');
    contains(layersSource, "if(itemId==='top_shirt_f') return {...set.shirt,y:set.shirt.y-.03,h:set.shirt.h+.06};");
    contains(layersSource, 'dy-=targetH*.60;');
    contains(layersSource, "if(itemId==='underwear_bra'){");
    contains(layersSource, 'const trim=l.sourceTone?toneBounds(img):opaqueBounds(img);');
    contains(layersSource, 'drawFittedGarment(ctx,rendered,trim,target,bounds,slot,e,itemId)');
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

test('bootstrap cache keys force the current clothing layer bundle', () => {
    const indexSource = read('index.html');
    const creationSource = read('characterCreation.js');
    const clothingLoaderSource = read('clothingSystem.js');

    contains(indexSource, '<script src="characterCreation.js?v=8"></script>');
    contains(creationSource, 'clothingSystem.js?build=20260928-clothing-v8');
    contains(clothingLoaderSource, "const BUILD='20260928-clothing-v8';");
});
