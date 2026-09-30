import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const IMAGE_ROOT = path.join(ROOT, 'images');
const PNG_SIGNATURE = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const IEND_CHUNK = Buffer.from([0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) out.push(full);
  }
  return out;
}

function inspect(data) {
  const errors = [];
  if (data.length < 33 || !data.subarray(0,8).equals(PNG_SIGNATURE)) return {errors:['bad PNG signature'], firstIdat:-1};
  let offset = 8;
  let firstIdat = -1;
  let seenIend = false;
  while (offset < data.length) {
    if (offset + 12 > data.length) { errors.push(`truncated chunk header at ${offset}`); break; }
    const length = data.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd < dataStart || crcEnd > data.length) { errors.push(`chunk at ${offset} extends beyond EOF`); break; }
    const type = data.subarray(typeStart,typeStart+4).toString('ascii');
    const stored = data.readUInt32BE(dataEnd);
    const calculated = crc32(data.subarray(typeStart,dataEnd));
    if (stored !== calculated) errors.push(`${type} CRC mismatch at ${offset}`);
    if (type === 'IDAT' && firstIdat < 0) firstIdat = offset;
    if (type === 'IEND') {
      seenIend = true;
      if (length !== 0) errors.push('non-empty IEND');
      if (crcEnd !== data.length) errors.push('trailing bytes after IEND');
      break;
    }
    offset = crcEnd;
  }
  if (firstIdat < 0) errors.push('missing IDAT');
  if (!seenIend) errors.push('missing IEND');
  return {errors, firstIdat};
}

function lastIendOffset(data) {
  // Search backwards for the exact canonical IEND chunk. This is much safer
  // than looking for the ASCII letters inside compressed image data.
  for (let i = data.length - IEND_CHUNK.length; i >= 8; i -= 1) {
    if (data.subarray(i, i + IEND_CHUNK.length).equals(IEND_CHUNK)) return i;
  }
  return -1;
}

function buildIdat(data) {
  const out = Buffer.allocUnsafe(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write('IDAT', 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function inflateOk(data) {
  try {
    const inflated = zlib.inflateSync(data);
    return inflated.length > 0;
  } catch (_) {
    return false;
  }
}

function repairMalformedIdat(data) {
  const before = inspect(data);
  if (!before.errors.length) return {changed:false, data, reason:'already valid'};
  if (before.firstIdat < 0) return {changed:false, data, reason:'no parseable IDAT start'};

  const iendOffset = lastIendOffset(data);
  if (iendOffset < 0 || iendOffset <= before.firstIdat + 12) {
    return {changed:false, data, reason:'canonical IEND not found after IDAT'};
  }

  const dataStart = before.firstIdat + 8;
  // The malformed files found in this repository all retain the complete
  // compressed stream and canonical IEND, but have a damaged IDAT length field.
  // Prefer the normal layout where four bytes immediately before IEND are the
  // old IDAT CRC. If that stream does not inflate, also try the no-CRC boundary.
  const boundaries = [iendOffset - 4, iendOffset];
  for (const dataEnd of boundaries) {
    if (dataEnd <= dataStart) continue;
    const compressed = data.subarray(dataStart, dataEnd);
    if (!inflateOk(compressed)) continue;

    const repaired = Buffer.concat([
      data.subarray(0, before.firstIdat),
      buildIdat(compressed),
      IEND_CHUNK,
    ]);
    const after = inspect(repaired);
    if (!after.errors.length) return {changed:true, data:repaired, reason:`rebuilt IDAT through byte ${dataEnd}`};
  }
  return {changed:false, data, reason:'retained IDAT stream does not inflate cleanly'};
}

const files = walk(IMAGE_ROOT).sort();
let repairedCount = 0;
const unrepaired = [];
for (const file of files) {
  const original = fs.readFileSync(file);
  const initial = inspect(original);
  if (!initial.errors.length) continue;
  const rel = path.relative(ROOT,file).replaceAll(path.sep,'/');
  const repaired = repairMalformedIdat(original);
  if (!repaired.changed) {
    unrepaired.push(`${rel}: ${repaired.reason}; ${initial.errors.join(', ')}`);
    continue;
  }
  fs.writeFileSync(file, repaired.data);
  repairedCount += 1;
  console.log(`Repaired ${rel}: ${repaired.reason} (${original.length} -> ${repaired.data.length} bytes)`);
}

if (unrepaired.length) {
  console.error('\nCould not safely repair:');
  for (const item of unrepaired) console.error(`  ${item}`);
  process.exitCode = 1;
}
console.log(`\nPNG repair complete: ${repairedCount} file(s) rewritten; ${unrepaired.length} invalid file(s) left untouched.`);
