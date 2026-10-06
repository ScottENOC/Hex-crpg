const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('humanoid renderer never replaces a visible composite with an incomplete rebuild', () => {
  const source = read('humanoidRenderer.js');

  assert.match(source, /const humanoidLastGoodCache = new WeakMap\(\)/);
  assert.match(
    source,
    /if \(previous\) \{\s*ctx\.drawImage\(previous\.canvas, bounds\.left, bounds\.top, bounds\.width, bounds\.height\);\s*return true;/
  );

  const releaseBlock = source.match(
    /finally \{([\s\S]*?)\n\s*\}\s*\n\s*if \(!rendered\)/
  );
  assert.ok(releaseBlock, 'expected compositor cleanup block');
  assert.match(
    releaseBlock[1],
    /if \(window\.__humanoidRendererLastComplete\)/
  );
  assert.match(
    releaseBlock[1],
    /window\.assetManager\?\.release/
  );
});

test('humanoid appearance identity includes physical equipment state', () => {
  const source = read('humanoidRenderer.js');
  assert.match(source, /equippedInstances/);
  assert.match(source, /function appearanceCacheKey\(entity\)/);
  assert.match(source, /function spriteCacheKey\(entity, facing\)/);
});

test('physical equipment reconciliation is event-driven rather than a render-loop poll', () => {
  const source = read('physicalWearables.js');
  assert.doesNotMatch(source, /setInterval\s*\(\s*sync/);
  assert.match(source, /DOMContentLoaded.*sync/);
  assert.match(source, /window\.physicalWearables=\{reconcile,list,current,equip,sync\}/);
});
