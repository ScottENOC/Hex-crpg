const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('runtime hot-path cache is loaded by the presentation bundle', () => {
  const name = read('name.js');
  const index = read('index.html');
  assert.match(index, /<meta name="app-build" content="\d{8}-[a-z0-9-]+">/);
  assert.ok(name.includes('document.querySelector(\'meta[name="app-build"]\')?.content'));
  assert.ok(name.includes('window.PRESENTATION_BUILD = PRESENTATION_BUILD;'));
  assert.ok(name.includes("['renderHotPathCache.js','renderHotPathCache']"));
});

test('shirts use one cached stretched composite instead of per-frame strip warping', () => {
  const source = read('renderHotPathCache.js');
  assert.ok(source.includes("if (slot !== 'shirt') return originalDrawSlot.apply(this, arguments);"));
  assert.ok(source.includes('shirtCompositeCache'));
  assert.ok(source.includes('ctx.drawImage(composite, bounds.left, bounds.top, bounds.width, bounds.height);'));
  assert.ok(source.includes('fix the source asset once'));
  assert.doesNotMatch(source, /for\s*\(let\s+row\s*=\s*0;\s*row\s*<\s*strips/);
});

test('initiative tracker reuses cards and changes flex order/text in place', () => {
  const source = read('renderHotPathCache.js');
  assert.ok(source.includes("card.style.order = String(order);"));
  assert.ok(source.includes('node.nodeValue = text;'));
  assert.ok(source.includes('root.refreshDirectionalTurnPortraits?.();'));
  assert.ok(source.includes('signature !== lastStructure'));
});
