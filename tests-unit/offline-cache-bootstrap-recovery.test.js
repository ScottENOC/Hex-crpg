const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const launcher = fs.readFileSync(path.join(root, 'offlineCache.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'offlineServiceWorker.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function capture(source, regex, label) {
    const match = source.match(regex);
    assert.ok(match, `Missing ${label}`);
    return match[1];
}

test('offline launcher, worker and index cache-buster use the same major version', () => {
    const launcherVersion = capture(launcher, /const VERSION = '([^']+)'/, 'launcher version');
    const workerVersion = capture(worker, /const SW_VERSION = '([^']+)'/, 'worker version');
    const workerUrlVersion = capture(launcher, /offlineServiceWorker\.js\?v=([^']+)'/, 'worker URL version');
    const launcherUrlVersion = capture(index, /offlineCache\.js\?v=([0-9]+)/, 'index launcher URL version');

    assert.equal(workerVersion, launcherVersion);
    assert.equal(workerUrlVersion, launcherVersion);
    assert.equal(launcherUrlVersion, launcherVersion);
});

test('first install receives a permanent canonical cache name', () => {
    assert.match(worker,
        /const patchCacheName = before\.valid[\s\S]*?\? `\$\{GAME_CACHE_PREFIX\}patch-\$\{commit\}`[\s\S]*?: cacheNameForCommit\(commit\);/);
});

test('diagnostic recovery considers old completed patch-named caches', () => {
    assert.ok(!launcher.includes('.filter(name => !/(?:^|-)patch(?:-|$)/i.test(name))'),
        'Do not hide patch-named caches before checking their completion manifest');
    assert.match(launcher, /candidateManifest\?\.commit/);
    assert.match(launcher, /Array\.isArray\(candidateManifest\.files\)/);
    assert.match(launcher, /candidateManifest\.files\.length/);
});

test('bootstrap files are network-first so updater code cannot be trapped in its own stale cache', () => {
    const bootstrapPos = worker.indexOf('if (bootstrapRequest)');
    const networkPos = worker.indexOf("fetch(request, { cache: 'no-store' })", bootstrapPos);
    const fallbackPos = worker.indexOf('serveFromActiveCache(request)', bootstrapPos);
    assert.ok(bootstrapPos >= 0);
    assert.ok(networkPos > bootstrapPos);
    assert.ok(fallbackPos > networkPos, 'Network refresh must be attempted before local fallback');
});


test('partial patch caches are never recovered as the active complete game cache', () => {
    const recoveryBlock = worker.match(/const candidates = names\.filter\(name =>([\\s\\S]*?)\\n    \);/);
    assert.ok(recoveryBlock, 'Expected cache recovery candidate filter');
    assert.match(recoveryBlock[1], /!name\.includes\('-patch-'\)/);
});
