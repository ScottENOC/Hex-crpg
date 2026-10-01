const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'name.js'), 'utf8');

test('humanoid weapon presentation bridge loads after renderer and before readiness', () => {
  const renderer = source.indexOf("['humanoidRenderer.js','humanoidRenderer']");
  const bridge = source.indexOf("['humanoidRendererBridge.js','humanoidRendererBridge']");
  const readiness = source.indexOf("['weaponReadiness.js','weaponReadiness']");

  assert.ok(renderer >= 0, 'humanoid renderer must be loaded');
  assert.ok(bridge > renderer, 'humanoid renderer bridge must load after the renderer');
  assert.ok(readiness > bridge, 'weapon readiness must decorate the bridge, not replace it');
});
