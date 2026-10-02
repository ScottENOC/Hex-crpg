const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const contains = (source, text) => assert.ok(source.includes(text), `Expected source to contain: ${text}`);

test('slot-first equipment UI exposes every expanded clothing layer', () => {
    const ui = read('equipmentInterface.js');

    contains(ui, "{key:'cloak',label:'Cloak',area:'cloak'}");
    contains(ui, "{key:'coat',label:'Coat',area:'coat'}");
    contains(ui, "{key:'topOuter',label:'Top outer / Corset',area:'topOuter'}");
    contains(ui, "{key:'tights',label:'Tights / Stockings',area:'tights'}");
    contains(ui, '"cloak cloak cloak"');
    contains(ui, '"coat coat coat"');
    contains(ui, '"topOuter topOuter accessory"');
    contains(ui, '"tights tights tights"');
});

test('flexible garments can be selected and equipped into either allowed slot', () => {
    const ui = read('equipmentInterface.js');
    const garments = read('newClothingGarments.js');

    contains(garments, "slot: 'topOuter', slots: ['bra', 'topOuter']");
    contains(ui, 'function clothingSlotsFor(raw)');
    contains(ui, "if(d.type==='clothes')return clothingSlotsFor(raw).includes(slot);");
    contains(ui, 'window.equipClothingToSlot(id,slot);');
    contains(ui, 'xs=xs.filter(g=>compatible(g.raw,state.filter,p));');
});

test('expanded clothing slots unequip as cosmetic clothing rather than combat equipment', () => {
    const ui = read('equipmentInterface.js');
    const expansion = read('clothingSlotExpansion.js');

    contains(expansion, "const EXTRA_SLOTS = ['tights', 'topOuter', 'coat', 'cloak'];");
    contains(ui, 'const expanded=window.clothingSlotExpansion?.slots||[];');
    contains(ui, 'if(p?.equipped&&expanded.includes(slot))');
    contains(ui, 'none.onclick=()=>unequipSlot(slot);');
});
