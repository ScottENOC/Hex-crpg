const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'weaponReadiness.js'), 'utf8');
const contains = text => assert.ok(source.includes(text), `Expected source to contain: ${text}`);

test('weapon readiness applies only to actual party members', () => {
  contains('function isPartyMember(entity)');
  contains("if (!entity || entity.side !== 'player') return false;");
  contains('return members.some(member => member === entity || member?.name === entity.name);');
  contains('if (!isPartyMember(entity)) return EMPTY_PLAN;');
  contains('if (!isPartyMember(entity)) return original.apply(this, arguments);');
});

test('weapon readiness does not poll the render integration forever', () => {
  contains('[50, 150, 500, 1500, 5000].forEach(delay => setTimeout(settle, delay));');
  assert.ok(!source.includes('setInterval(settle'), 'readiness integration must not run a 10 Hz startup poll');
});
