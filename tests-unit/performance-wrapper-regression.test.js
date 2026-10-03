const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('experimental render wrappers stay out of the runtime loader', () => {
  const loader = fs.readFileSync(path.join(ROOT, 'name.js'), 'utf8');
  assert.doesNotMatch(loader, /\['renderSpatialCulling\.js','renderSpatialCulling'\]/);
  assert.doesNotMatch(loader, /\['visibilityHotPathCache\.js','visibilityHotPathCache'\]/);
  assert.match(loader, /\['realtimeUiThrottle\.js','realtimeUiThrottle'\]/);
  assert.match(loader, /\['realtimeTickCadence\.js','realtimeTickCadence'\]/);
});
