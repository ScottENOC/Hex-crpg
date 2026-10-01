const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const contains = (source, text) => assert.ok(source.includes(text), `Expected source to contain: ${text}`);

test('shoes are a native slot in character state, equipment UI and appearance visibility', () => {
    const creation = read('characterCreation.js');
    const equipmentUi = read('equipmentInterface.js');
    const appearance = read('equipmentAppearance.js');

    contains(creation, 'shoes: null');
    contains(equipmentUi, "{key:'shoes',label:'Shoes',area:'shoes'}");
    contains(equipmentUi, '"shoes shoes shoes"');
    contains(equipmentUi, "['shoes','Shoes']");
    contains(appearance, "'shirt','pants','shoes','bra','underwear'");
    contains(appearance, "shoes:'Shoes'");
});

test('boots target shoes and keep the requested directional render tuning', () => {
    const footwear = read('footwearSystem.js');

    contains(footwear, "const SLOT = 'shoes';");
    contains(footwear, "front: 'images/equipment/clothing/boots_front.png'");
    contains(footwear, "side: 'images/equipment/clothing/boots_side.png'");
    contains(footwear, "back: 'images/equipment/clothing/boots_back.png'");
    contains(footwear, 'clothingSlot: SLOT');
    contains(footwear, 'scale: 1.30');
    contains(footwear, 'outwardShift: 0.40');
    contains(footwear, 'const PLAYER_DEFAULT_COLOR = {hue:28,saturation:68,value:32,opacity:1};');
});

test('footwear render bridge survives the asynchronous shirt hot-path replacement', () => {
    const footwear = read('footwearSystem.js');
    const hotPath = read('renderHotPathCache.js');

    contains(hotPath, 'system.drawSlot = cachedDrawSlot;');
    contains(footwear, 'if (cs.drawSlot.__footwearDrawBridge) return true;');
    contains(footwear, 'wrapped.__footwearDrawBridge = true;');
    contains(footwear, 'const bootstrapTimer = setInterval(install,100);');
    contains(footwear, 'wrapClothingDraw();');
});

test('temporary post-render footwear UI extension is gone', () => {
    const bootstrap = read('name.js');
    assert.ok(!bootstrap.includes('footwearEquipmentUI.js'));
    assert.equal(fs.existsSync(path.join(ROOT, 'footwearEquipmentUI.js')), false);
});
