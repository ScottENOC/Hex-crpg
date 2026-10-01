import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const IMAGE_ROOT = path.join(ROOT, 'images');
const PNG_SIGNATURE = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

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

function validBitDepth(colorType, bitDepth) {
  const allowed = {
    0: new Set([1,2,4,8,16]),
    2: new Set([8,16]),
    3: new Set([1,2,4,8]),
    4: new Set([8,16]),
    6: new Set([8,16]),
  };
  return allowed[colorType]?.has(bitDepth) ?? false;
}

function parsePng(file) {
  const rel = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const data = fs.readFileSync(file);
  const errors = [];
  const warnings = [];

  if (data.length < 33 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return {rel, errors:['invalid PNG signature or file is too short'], warnings};
  }

  let offset = 8;
  let chunkIndex = 0;
  let ihdr = null;
  let paletteEntries = null;
  let seenIDAT = false;
  let leftIDATRun = false;
  let seenIEND = false;
  const idat = [];

  while (offset < data.length) {
    if (offset + 12 > data.length) {
      errors.push(`truncated chunk header at byte ${offset}`);
      break;
    }

    const length = data.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;

    if (dataEnd < dataStart || crcEnd > data.length) {
      errors.push(`chunk at byte ${offset} declares ${length} data bytes beyond EOF`);
      break;
    }

    const typeBuffer = data.subarray(typeStart, typeStart + 4);
    const type = typeBuffer.toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(type)) errors.push(`invalid chunk type ${JSON.stringify(type)} at byte ${offset}`);

    const storedCrc = data.readUInt32BE(dataEnd);
    const calculatedCrc = crc32(data.subarray(typeStart, dataEnd));
    if (storedCrc !== calculatedCrc) {
      errors.push(`${type || '????'} CRC mismatch at byte ${offset} (stored ${storedCrc.toString(16).padStart(8,'0')}, calculated ${calculatedCrc.toString(16).padStart(8,'0')})`);
    }

    const chunkData = data.subarray(dataStart, dataEnd);

    if (chunkIndex === 0 && type !== 'IHDR') errors.push('IHDR is not the first chunk');
    if (type === 'IHDR') {
      if (ihdr) errors.push('multiple IHDR chunks');
      if (length !== 13) errors.push(`IHDR length is ${length}, expected 13`);
      if (length >= 13) {
        ihdr = {
          width: chunkData.readUInt32BE(0),
          height: chunkData.readUInt32BE(4),
          bitDepth: chunkData[8],
          colorType: chunkData[9],
          compression: chunkData[10],
          filter: chunkData[11],
          interlace: chunkData[12],
        };
        if (!ihdr.width || !ihdr.height) errors.push(`invalid dimensions ${ihdr.width}x${ihdr.height}`);
        if (!validBitDepth(ihdr.colorType, ihdr.bitDepth)) errors.push(`invalid bit depth ${ihdr.bitDepth} for colour type ${ihdr.colorType}`);
        if (ihdr.compression !== 0) errors.push(`unsupported PNG compression method ${ihdr.compression}`);
        if (ihdr.filter !== 0) errors.push(`unsupported PNG filter method ${ihdr.filter}`);
        if (![0,1].includes(ihdr.interlace)) errors.push(`invalid interlace method ${ihdr.interlace}`);
      }
    } else if (type === 'PLTE') {
      if (seenIDAT) errors.push('PLTE appears after IDAT');
      if (length === 0 || length > 768 || length % 3 !== 0) errors.push(`invalid PLTE length ${length}`);
      paletteEntries = length / 3;
      if (ihdr?.colorType === 3 && paletteEntries > 2 ** ihdr.bitDepth) {
        errors.push(`PLTE has ${paletteEntries} entries but bit depth ${ihdr.bitDepth} permits at most ${2 ** ihdr.bitDepth}`);
      }
    } else if (type === 'tRNS') {
      if (seenIDAT) errors.push('tRNS appears after IDAT');
      if (ihdr?.colorType === 3 && paletteEntries != null && length > paletteEntries) {
        errors.push(`tRNS has ${length} alpha entries for only ${paletteEntries} palette entries`);
      }
    } else if (type === 'IDAT') {
      if (leftIDATRun) errors.push('IDAT chunks are not consecutive');
      seenIDAT = true;
      idat.push(chunkData);
    } else if (seenIDAT) {
      leftIDATRun = true;
    }

    if (type === 'IEND') {
      if (length !== 0) errors.push(`IEND length is ${length}, expected 0`);
      seenIEND = true;
      offset = crcEnd;
      if (offset !== data.length) errors.push(`${data.length - offset} trailing bytes after IEND`);
      break;
    }

    offset = crcEnd;
    chunkIndex += 1;
  }

  if (!ihdr) errors.push('missing IHDR');
  if (!seenIDAT) errors.push('missing IDAT');
  if (!seenIEND) errors.push('missing IEND');
  if (ihdr?.colorType === 3 && paletteEntries == null) errors.push('indexed-colour PNG is missing PLTE');

  if (idat.length) {
    try {
      const inflated = zlib.inflateSync(Buffer.concat(idat));
      if (!inflated.length) errors.push('IDAT inflates to an empty stream');
    } catch (error) {
      errors.push(`IDAT zlib stream cannot be inflated: ${error.message}`);
    }
  }

  if (ihdr?.colorType === 3) warnings.push('indexed-colour PNG');
  return {rel, errors, warnings, ...ihdr, bytes:data.length};
}

function directionalKey(rel) {
  const match = rel.match(/^(.*)_(front|back|side|side_left)\.png$/i);
  return match ? match[1] : null;
}

function findDirectionalWarnings(results) {
  const groups = new Map();
  for (const result of results) {
    const key = directionalKey(result.rel);
    if (!key || !result.width || !result.height) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }

  const warnings = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a,b) => a.width*a.height - b.width*b.height);
    const smallest = sorted[0];
    const largest = sorted.at(-1);
    const areaRatio = (largest.width * largest.height) / (smallest.width * smallest.height);
    const mixedIndexedAndTruecolour = group.some(x => x.colorType === 3) && group.some(x => x.colorType === 2 || x.colorType === 6);
    if (areaRatio >= 4 && mixedIndexedAndTruecolour) {
      warnings.push(`${key}: suspicious directional mismatch: ${smallest.rel} is ${smallest.width}x${smallest.height}, colour type ${smallest.colorType}, while ${largest.rel} is ${largest.width}x${largest.height}, colour type ${largest.colorType}`);
    }
  }
  return warnings;
}

if (!fs.existsSync(IMAGE_ROOT)) {
  console.error('PNG validation failed: images/ directory not found.');
  process.exit(1);
}

const files = walk(IMAGE_ROOT).sort();
const results = files.map(parsePng);
const failures = results.filter(result => result.errors.length);
const directionalWarnings = findDirectionalWarnings(results);
const indexed = results.filter(result => result.colorType === 3);

for (const result of failures) {
  console.error(`\n${result.rel}`);
  for (const error of result.errors) console.error(`  ERROR: ${error}`);
}
for (const warning of directionalWarnings) console.warn(`\nWARNING: ${warning}`);

if (failures.length) {
  console.error(`\nPNG validation failed: ${failures.length} structurally invalid file(s), ${files.length} PNG(s) checked.`);
  process.exit(1);
}

console.log(`PNG validation passed: ${files.length} PNG(s) checked; ${indexed.length} indexed-colour PNG(s) decoded and CRC-validated; ${directionalWarnings.length} directional size/format warning(s).`);
