const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('asset scheduler keeps renderer image traffic behind the offline startup barrier', () => {
  const source = read('assetLoadScheduler.js');

  assert.match(source, /window\.__hexOfflineReady/,
    'scheduler must observe the offline/local-copy readiness promise');
  assert.match(source, /if \(offlineStartupPending\) return false;/,
    'normal renderer requests must remain parked while the local copy is being prepared');
  assert.match(source, /\(immediate && !offlineStartupPending\) \|\| mayStartNow\(record\.path\)/,
    'even immediate renderer requests must respect the startup barrier');
  assert.match(source, /releaseManagedDeferred\(\);[\s\S]*schedulePump\(\);/,
    'parked renderer requests must resume after the startup barrier settles');
});

test('performance backpressure does not remove restored directional clothing', () => {
  const source = read('assetLoadScheduler.js');

  for (const marker of [
    'top_blouse',
    'top_dress',
    'top_shirt_f',
    'top_masc_laced',
    'pants_trousers_front.png',
    'pants_trousers_back.png',
    'briefs_female_side.png',
    'bra_side.png',
  ]) {
    assert.ok(source.includes(marker), `restored clothing asset must remain scheduled: ${marker}`);
  }
  assert.match(source, /topPath\(top,'side'\)/,
    'directional clothing side views must remain in the game manifest');
  assert.match(source, /topPath\(top,'back'\)/,
    'directional clothing back views must remain in the game manifest');
});

test('monk gear does not repeatedly sweep every NPC while hooks are becoming ready', () => {
  const source = read('monkGear.js');

  assert.match(source, /let initialNpcScanDone = false;/,
    'initial NPC compatibility scan must be explicitly one-shot');
  assert.match(source, /function scanNpcsOnce\(\)/,
    'monk compatibility code must retain the one-shot scan helper');
  assert.match(source, /function wrappedBuildNPC\(/,
    'future NPCs must still receive monk gear through creation rather than polling');
  assert.match(source, /setInterval\(\(\) => \{ if \(install\(\)\) clearInterval\(timer\); \}, 1000\)/,
    'hook installation may retry slowly, not four times per second');
  assert.doesNotMatch(source, /setInterval\([\s\S]{0,160},\s*250\)/,
    'do not reintroduce the 250 ms whole-world compatibility poll');
});

test('monk gear keeps all three views without referencing the corrupt side PNG', () => {
  const source = read('monkGear.js');

  assert.ok(source.includes('monk_trousers_front.png'));
  assert.ok(source.includes('monk_trousers_back.png'));
  assert.ok(source.includes('pants_baggy_wraps_side.png'));
  assert.ok(!source.includes('monk_trousers_side.png'));
  assert.ok(source.includes('monk_wrap_front.png'));
  assert.ok(source.includes('monk_wrap_side.png'));
  assert.ok(source.includes('monk_wrap_back.png'));
});
