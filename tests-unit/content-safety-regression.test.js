const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const contains = (source, text) => assert.ok(source.includes(text), `Expected source to contain: ${text}`);

test('18+ presentation is device-local and enabled by default', () => {
  const source = read('contentSafety.js');
  contains(source, "const STORAGE_KEY = 'rpg_adult_content_enabled';");
  contains(source, 'return stored === null ? true : stored !== \'false\';');
  contains(source, "localStorage.setItem(STORAGE_KEY, window.adultContentEnabled ? 'true' : 'false');");
  contains(source, "id=\"adult-content-toggle\"");
  contains(source, '18+ content');
});

test('safe presentation uses render-only coverage without changing real equipment', () => {
  const source = read('contentSafety.js');
  contains(source, "items.underwear = 'underwear_briefs';");
  contains(source, "items.bra = 'underwear_bra';");
  contains(source, "items.shirt = 'top_shirt_f';");
  contains(source, "items.pants = 'pants_trousers';");
  contains(source, "spec.slot === 'shirt' && (spec.fitMode === 'dressSplit'");
  contains(source, '// Male safe presentation deliberately permits a bare chest.');
  contains(source, 'const proxy = Object.create(entity || null);');
  contains(source, 'proxy.equipped = { ...(entity?.equipped || {}), [slot]: itemId };');
  contains(source, 'opacity: 1');
  assert.ok(!source.includes('entity.equipped[slot] = itemId'), 'safe fallback must not mutate real equipment');
});

test('humanoid rendering is gated until body, clothing, and equipped armour are ready', () => {
  const source = read('contentSafety.js');
  contains(source, 'const ready = bodyAndHairReady(entity, facing)');
  contains(source, '&& clothingFrameReady(entity, view)');
  contains(source, '&& equipmentFrameReady(entity, view);');
  contains(source, 'if (!isHumanoidFrameReady(entity, facing)) return;');
  contains(source, 'canvas[data-direct-humanoid-canvas="true"]:not(.content-safety-frame-ready)');
  contains(source, '#appearance-preview-canvas.content-safety-frame-pending');
});

test('content safety loads after clothing slot expansion and garment registration', () => {
  const loader = read('clothingSystem.js');
  const expansion = loader.indexOf("load('clothingSlotExpansion.js','small-clothing-slot-expansion');");
  const garments = loader.indexOf("load('newClothingGarments.js','new-clothing-garments');");
  const safety = loader.indexOf("load('contentSafety.js','content-safety');");
  assert.ok(expansion >= 0 && garments > expansion && safety > garments);
});