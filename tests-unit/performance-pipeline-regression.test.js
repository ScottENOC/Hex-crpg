const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('humanoid-critical image requests are not blocked on offline cache readiness', () => {
  const scheduler = read('assetLoadScheduler.js');
  const renderer = read('humanoidRenderer.js');

  assert.doesNotMatch(scheduler, /offlineStartupPending/,
    'renderer image traffic must not be parked behind the offline bootstrap; this previously made all people disappear');
  assert.match(scheduler, /if \(immediate \|\| mayStartNow\(record\.path\)\) start\(\);/,
    'immediate managed image requests must be allowed to start');
  assert.match(renderer, /window\.assetManager\.request\(src\)/,
    'humanoid renderer must continue using the shared managed image cache');
  assert.match(renderer, /window\.assetManager\.whenReady\(src\)\.then/,
    'humanoid renderer must redraw when its body image becomes ready');
});

test('performance scheduling does not remove restored directional clothing', () => {
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
