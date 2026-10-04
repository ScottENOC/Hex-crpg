
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git','node_modules','tests','tests-unit','test-results','playwright-report','appstore']);
const SKIP_FILES = new Set(['assetLoadScheduler.js']);
const CONSTRUCTOR_PATTERNS = [
  /\bnew\s+(?:window\.)?Image\s*\(/,
  /document\.createElement\s*\(\s*['"]img['"]\s*\)/i,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(path.join(dir, entry.name));
  }
  return out;
}

test('runtime image elements are constructed through the shared asset manager', () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file).replaceAll('\\', '/');
    if (SKIP_FILES.has(rel)) continue;
    const source = fs.readFileSync(file, 'utf8');
    source.split(/\r?\n/).forEach((line, index) => {
      if (CONSTRUCTOR_PATTERNS.some(pattern => pattern.test(line))) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
    const managedVars = [...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\.)?assetManager\.createDOMImage\s*\(/g)].map(match => match[1]);
    for (const variable of new Set(managedVars)) {
      const directSrc = new RegExp(`\\b${variable}\\.src\\s*=`);
      source.split(/\r?\n/).forEach((line, index) => {
        if (directSrc.test(line)) offenders.push(`${rel}:${index + 1}: direct src assignment on managed DOM image: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(offenders, [], `Unmanaged image loading remains:\n${offenders.join('\n')}`);
});

test('the asset manager has one explicit parser-time bootstrap', () => {
  const scheduler = fs.readFileSync(path.join(ROOT, 'assetLoadScheduler.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
  const preview = fs.readFileSync(path.join(ROOT, 'spriteRigPreview.html'), 'utf8');
  const version = scheduler.match(/const SCHEDULER_VERSION = '([^']+)'/)?.[1];
  assert.ok(version, 'scheduler version missing');
  assert.ok(index.includes(`data-asset-load-scheduler src="assetLoadScheduler.js?v=${version}"`));
  assert.ok(preview.includes(`data-asset-load-scheduler src="assetLoadScheduler.js?v=${version}"`));
  assert.ok(index.indexOf('assetLoadScheduler.js') < index.indexOf('data.js'));
  assert.ok(!data.includes('assetLoadScheduler.js?v='), 'data.js must not inject the scheduler');
  assert.ok(!data.includes('__assetLoadSchedulerInstalled'), 'data.js must not own scheduler installation');
});


test('game visual catalogue remains demand-driven', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'gameEngine.js'), 'utf8');
  const scheduler = fs.readFileSync(path.join(ROOT, 'assetLoadScheduler.js'), 'utf8');

  assert.match(engine, /const lazyVisuals = new Proxy/);
  assert.doesNotMatch(engine, /Object\.entries\(visualSources\)\.map\(\(\[key, src\]\) => \[key, window\.assetManager\.request\(src\)\]\)/);
  assert.doesNotMatch(engine, /for \(const src of new Set\(Object\.values\(visualSources\)\)\)/);

  assert.doesNotMatch(scheduler, /ARENA_CRITICAL|ARENA_SOON|CAMPAIGN2_NEARBY/);
});


test('humanoid composites wait on existing source loads instead of rebuilding the same incomplete key', () => {
  const renderer = fs.readFileSync(path.join(ROOT, 'humanoidRenderer.js'), 'utf8');
  assert.match(renderer, /if \(pendingCompositeKey === key\)/);
  assert.match(renderer, /whenReady callback redraws the map/);
  assert.match(renderer, /Source records are released only after a complete composite has been produced/);
});

test('directional NPC art is loaded only for the NPC view being rendered', () => {
  const npc = fs.readFileSync(path.join(ROOT, 'npcBuilder.js'), 'utf8');
  assert.match(npc, /function ensureDirectionalNpcImage\(ent\)/);
  assert.doesNotMatch(npc, /Object\.values\(DIRECTIONAL_NPC_ART\)\.forEach\(views/);
  assert.doesNotMatch(npc, /Object\.values\(views\)\.forEach\(\{ key, src \}/);
  assert.match(npc, /const view = art\[facing\] \|\| art\.down/);
});
