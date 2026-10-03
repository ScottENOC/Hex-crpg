const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function contains(source, text) {
  assert.ok(source.includes(text), `Expected source to contain: ${text}`);
}

function excludes(source, text) {
  assert.ok(!source.includes(text), `Expected source not to contain: ${text}`);
}

test('direct humanoid compositor owns the runtime renderer stack', () => {
  const nameSource = read('name.js');
  const rendererSource = read('humanoidRenderer.js');
  const entitiesSource = read('entities.js');
  const graphicsSource = read('graphicsSettings.js');

  contains(nameSource, "['humanoidRenderer.js','humanoidRenderer']");
  for (const retired of [
    'characterRig.js',
    'facingSystem.js',
    'directionalHairTuning.js',
    'directionalWeaponTuning.js',
    'directionalEquipmentTuning.js',
    'directionalRigHandoff.js',
    'directionalCharacterUI.js',
  ]) {
    excludes(nameSource, `['${retired}'`);
  }

  excludes(entitiesSource, 'facingSystem.js?');
  excludes(graphicsSource, "script.src = 'characterRig.js");
  contains(rendererSource, 'function drawDirectionalHumanoidInBounds');
  contains(rendererSource, "compositionSource:profile?'direct-horizontal-strip-width-profile':'direct-axis-aligned-scale-translate'");
  contains(rendererSource, "human_female:{x:-.1873125,y:-.015,w:.374625,h:.2183}");
  contains(rendererSource, 'const SHIELD_OPAQUE_HEIGHT_DROP = .10;');
  contains(rendererSource, "round:{front:'images/equipment/shields/round.png',back:'images/equipment/shields/round_back.svg'}");
  contains(rendererSource, "kite:{front:'images/equipment/shields/kite.png',back:'images/equipment/shields/kite_back.png'}");
  contains(rendererSource, "helmet:'images/equipment/helmets/nasal_helm_back.svg'");
  contains(rendererSource, "heldItems:{sword:{inward:0,y:.171336564429012}}");
  contains(rendererSource, "front:'images/characters/human_male/body_broad_front.png'");
  contains(rendererSource, "side:'images/characters/human_male/body_broad_side.png'");
  contains(rendererSource, "back:'images/characters/human_male/body_broad_back.png'");
  contains(rendererSource, "front:'images/characters/elf_female/body_front.png'");
  contains(rendererSource, "side:'images/characters/elf_female/body_side.png'");
  contains(rendererSource, "back:'images/characters/elf_female/body_back.png'");
  contains(rendererSource, 'CHARACTER_PATHS.elf_female.hair = CHARACTER_PATHS.human_female.hair;');

  assert.doesNotMatch(rendererSource, /ctx\.drawImage\s*=/);
  assert.doesNotMatch(rendererSource, /\.rotate\s*\(/);
  excludes(rendererSource, 'drawStripDeformedArmour');
  excludes(rendererSource, 'drawWarpedArmour');
});
