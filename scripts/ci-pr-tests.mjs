// Select a compact but useful Playwright suite for pull requests.
// Full regression coverage still runs after merge on main.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, extname } from 'node:path';

const [baseSha, headSha] = process.argv.slice(2);
if (!baseSha || !headSha) {
  console.error('usage: node scripts/ci-pr-tests.mjs <base-sha> <head-sha>');
  process.exit(2);
}

const smoke = [
  'tests/app-update.spec.js',
  'tests/breadcrumbs.spec.js',
  'tests/combat-polish.spec.js',
  'tests/world-liveliness.spec.js',
];

const changed = execFileSync('git', ['diff', '--name-only', baseSha, headSha], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(Boolean);

const allSpecs = readdirSync('tests')
  .filter(name => name.endsWith('.spec.js'))
  .map(name => `tests/${name}`);

const selected = new Set(smoke.filter(existsSync));

// A PR that adds or changes a regression test should always run that test.
for (const file of changed) {
  if (file.startsWith('tests/') && file.endsWith('.spec.js') && existsSync(file)) selected.add(file);
}

function kebabStem(file) {
  const stem = basename(file, extname(file))
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return stem;
}

// Best-effort source-to-test matching. E.g. siegeReserveDispatch.js will pick
// tests whose filenames contain siege/reserve/dispatch. This supplements,
// rather than replaces, focused regression tests added with a change.
for (const file of changed) {
  if (!/\.(js|mjs|cjs)$/.test(file) || file.startsWith('tests/')) continue;
  const stem = kebabStem(file);
  if (!stem) continue;
  const parts = stem.split('-').filter(part => part.length >= 4);
  for (const spec of allSpecs) {
    const specName = basename(spec).toLowerCase();
    if (specName.includes(stem) || (parts.length && parts.filter(part => specName.includes(part)).length >= Math.min(2, parts.length))) {
      selected.add(spec);
    }
  }
}

const tests = [...selected].sort();
if (!tests.length) {
  console.error('No PR tests selected');
  process.exit(1);
}

console.error(`Selected ${tests.length} PR Playwright files:`);
for (const test of tests) console.error(`  ${test}`);
process.stdout.write(tests.join('\n'));
