const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('runtime audio is owned by the shared audio manager', () => {
  const audio = read('audio.js');
  const director = read('musicDirector.js');

  assert.match(audio, /window\.audioManager\s*=\s*\{/);
  assert.match(audio, /function\s+getContext\s*\(/);
  assert.match(audio, /function\s+loadBuffer\s*\(/);
  assert.match(audio, /function\s+getMedia\s*\(/);
  assert.match(audio, /window\.unlockMusicDirectorAudio/);

  // Adaptive music must share the already-unlocked context rather than
  // constructing a second context on its periodic game tick.
  assert.match(director, /window\.audioManager\?\.getContext/);
  assert.match(director, /window\.audioManager\?\.loadBuffer/);
  assert.doesNotMatch(director, /\bnew\s+(?:window\.)?(?:AudioContext|webkitAudioContext)\b/);
  assert.doesNotMatch(director, /\bfetch\s*\(\s*[`'\"]audio\//);
});

test('live non-Campaign-2 audio references exist', () => {
  const audio = read('audio.js');
  const paths = new Set();

  for (const match of audio.matchAll(/path:\s*['\"](audio\/[^'\"]+)['\"]/g)) paths.add(match[1]);
  paths.add('audio/effects/parry.wav');
  paths.add('audio/effects/parry2.wav');

  const missing = [...paths].filter(rel => !fs.existsSync(path.join(ROOT, rel)));
  assert.deepEqual(missing, [], `Missing live audio assets:\n${missing.join('\n')}`);
});

test('audio remains lazy until the player enables it', () => {
  const audio = read('audio.js');
  const beforeDefs = audio.slice(0, audio.indexOf('const TRACK_DEFS'));

  // One constructor exists inside getMedia(), but there must be no eager
  // path-bearing Audio construction at module evaluation time.
  assert.doesNotMatch(audio, /new\s+Audio\s*\(\s*['\"]audio\//);
  assert.match(beforeDefs, /function\s+getMedia\s*\(/);
  assert.match(audio, /function\s+unlockAudioTracks\s*\(/);
  assert.match(audio, /preloadBuffers\(\[/);
});
