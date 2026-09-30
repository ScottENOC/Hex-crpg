const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fx = fs.readFileSync(path.join(root, 'combatFX.js'), 'utf8');
const spells = fs.readFileSync(path.join(root, 'spells.js'), 'utf8');

const SPELL_IDS = [
  'firebolt', 'heal', 'smite_evil', 'divine_silence', 'sanctuary',
  'divine_protection', 'summon_animal', 'counterspell', 'dragon_breath',
  'entangle', 'wild_fury', 'calm_animal', 'temporal_rift'
];

test('every base spell has a visual-effect mapping', () => {
  for (const id of SPELL_IDS) {
    assert.match(spells, new RegExp(`['\"]${id}['\"]\\s*:`), `${id} should still be a base spell`);
    assert.match(fx, new RegExp(`\\b${id}\\s*:`), `${id} needs a SPELL_FX_BY_BASE entry`);
  }
});

test('Firebolt uses a travelling spell projectile rather than a target-only flash', () => {
  assert.match(fx, /case 'firebolt':[\s\S]*spawnSpellVisualProjectile\(caster\.hex, targetHex, 'firebolt'\)/);
  assert.match(fx, /const handX = from\.x/);
  assert.match(fx, /const handY = from\.y/);
});

test('spell effects adapt to graphics and reduced-motion settings', () => {
  assert.match(fx, /window\.reduceMotion/);
  assert.match(fx, /window\.renderScale/);
  assert.match(fx, /return 'simple'/);
  assert.match(fx, /return 'full'/);
});

test('successful casts are hooked without adding persisted spell state', () => {
  assert.match(fx, /window\.tryCastSpell = wrapped/);
  assert.match(fx, /result !== false && result !== 'counter_pending'/);
  assert.doesNotMatch(fx, /localStorage\.setItem\([^)]*spell/i);
  assert.doesNotMatch(fx, /new Image\(/);
});
