import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git','node_modules','tests','tests-unit','test-results','playwright-report','ios','mobile','.github','scripts']);
const SOURCE_EXTS = new Set(['.js','.html','.css']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(path.join(dir, entry.name));
  }
  return out;
}

const imageFiles = [];
function walkImages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkImages(full);
    else if (entry.isFile()) imageFiles.push(path.relative(ROOT, full).replaceAll(path.sep, '/'));
  }
}
walkImages(path.join(ROOT, 'images'));
const exact = new Set(imageFiles);
const lowerMap = new Map(imageFiles.map(p => [p.toLowerCase(), p]));

const refs = new Map();
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const source = fs.readFileSync(file, 'utf8');
  const regex = /(?:['"`(=:,\s])((?:\.\/)?images\/[A-Za-z0-9_@%+.,'()\-\/ ]+\.(?:png|jpe?g|webp|gif|svg))(?:[?#][^'"`\s)]*)?/gi;
  for (const match of source.matchAll(regex)) {
    const p = match[1].replace(/^\.\//, '');
    if (!refs.has(p)) refs.set(p, new Set());
    refs.get(p).add(rel);
  }
}

const missing = [];
for (const [p, sources] of [...refs].sort(([a],[b]) => a.localeCompare(b))) {
  if (exact.has(p)) continue;
  missing.push({ path: p, sources: [...sources].sort(), caseMatch: lowerMap.get(p.toLowerCase()) || null });
}

console.log(`Runtime image audit: ${refs.size} literal image paths checked against ${imageFiles.length} files.`);
if (!missing.length) {
  console.log('All literal runtime image paths exist with exact case.');
  process.exit(0);
}
console.log(`Missing literal paths: ${missing.length}`);
for (const item of missing) {
  console.log(`MISSING ${item.path}`);
  if (item.caseMatch) console.log(`  CASE MATCH: ${item.caseMatch}`);
  console.log(`  referenced by: ${item.sources.join(', ')}`);
}
