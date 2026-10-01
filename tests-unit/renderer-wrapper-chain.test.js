const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('presentation wrappers detect features through the existing renderer chain', () => {
  const braid = read('braidDirectionalHair.js');
  const alignment = read('spriteAlignmentFixes.js');

  assert.match(alignment, /function\s+wrapperChainHas\s*\(/);
  assert.match(braid, /function\s+wrapperChainHas\s*\(/);
  assert.match(braid, /wrapperChainHas\(current,\s*['"]__directionalBraidSupport['"]\)/);
  assert.match(braid, /wrapperChainHas\(current,\s*['"]__directHumanoidCompositor['"]\)/);
  assert.match(braid, /wrapped\.__braidWrappedFunction\s*=\s*current/);
  assert.match(braid, /preserveWrapperMarkers\(current,\s*wrapped\)/);
});
