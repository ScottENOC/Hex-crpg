const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git','node_modules','tests','tests-unit','test-results','playwright-report','appstore']);
const SKIP_FILES = new Set(['assetLoadScheduler.js']);

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

test('runtime images are constructed through the shared asset manager', () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file).replaceAll('\\', '/');
    if (SKIP_FILES.has(rel)) continue;
    const source = fs.readFileSync(file, 'utf8');
    source.split(/\r?\n/).forEach((line, index) => {
      if (/\bnew\s+Image\s*\(/.test(line)) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `Unmanaged Image construction remains:\n${offenders.join('\n')}`);
});
