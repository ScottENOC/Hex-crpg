from pathlib import Path
import re

cache_path = Path('offlineCache.js')
worker_path = Path('offlineServiceWorker.js')
index_path = Path('index.html')

cache = cache_path.read_text()
worker = worker_path.read_text()
index = index_path.read_text()

# Browser bootstrap v3.
cache = cache.replace("const VERSION = '2';", "const VERSION = '3';")
cache = cache.replace("const SW_URL = 'offlineServiceWorker.js?v=2';", "const SW_URL = 'offlineServiceWorker.js?v=3';")
cache = cache.replace("activeUrl.includes('v=2')", "activeUrl.includes('v=3')")
cache = cache.replace('The v2 offline worker is not active yet.', 'The v3 offline worker is not active yet.')
cache = cache.replace("'hex-offline-reloaded-commit-v2'", "'hex-offline-reloaded-commit-v3'")

storage_pattern = re.compile(r"    async function storageDiagnostic\(\) \{.*?\n    \}\n\n    async function syncInternal\(\) \{", re.S)
storage_replacement = '''    async function storageDiagnostic() {
        const mode = isStandaloneWebApp() ? 'Home Screen app' : 'Safari tab';
        if (!navigator.storage?.estimate) return { message: `${mode} · iOS storage estimate unavailable` };
        try {
            // Diagnostic only: no StorageManager call may block app startup forever.
            const estimate = await Promise.race([
                navigator.storage.estimate(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('storage estimate timed out')), 1500)),
            ]);
            let persisted = false;
            if (navigator.storage.persisted) {
                try {
                    persisted = Boolean(await Promise.race([
                        navigator.storage.persisted(),
                        new Promise(resolve => setTimeout(() => resolve(false), 600)),
                    ]));
                } catch (_) {}
            }
            // Persistence is useful but optional. Ask in the background only.
            if (isStandaloneWebApp() && !persisted && navigator.storage.persist) {
                Promise.resolve().then(() => navigator.storage.persist()).catch(() => {});
            }
            const quota = Number(estimate?.quota) || 0;
            const usage = Number(estimate?.usage) || 0;
            const available = Math.max(0, quota - usage);
            return {
                quota, usage, available, persisted,
                message: `${mode} · ${formatBytes(available)} available locally${persisted ? ' · persistent storage' : ''}`,
            };
        } catch (error) {
            return { message: `${mode} · storage estimate skipped: ${error?.message || error}` };
        }
    }

    async function syncInternal() {'''
cache, count = storage_pattern.subn(storage_replacement, cache, count=1)
if count != 1:
    raise SystemExit('Could not patch storageDiagnostic')

old_start = '''    async function syncInternal() {
        emit({ phase: 'registering', stored: 0, processed: 0, total: 0, message: 'Starting local storage…' });
        const storage = await storageDiagnostic();
        emit({ phase: 'storage-check', stored: 0, processed: 0, total: 0, message: storage.message });
        let registration;
        try {
            registration = await ensureRegistration();
        } catch (error) {
            return { complete: false, failures: [errorInfo(error, 'worker')], hasActiveCache: false, unsupported: error?.kind === 'unsupported' };
        }

        const worker = registration.active || registration.waiting || registration.installing;
        let before = {};
        try {
            before = await getWorkerStatus(worker);
        } catch (error) {
            console.warn('Could not read offline worker status', error);
        }

        emit({ phase: 'checking', message: 'Checking the development branch for changes…' });'''
new_start = '''    async function syncInternal() {
        // Check an existing complete cache before any disk-space diagnostic.
        emit({ phase: 'checking', stored: 0, processed: 0, total: 0, message: 'Checking local game copy…' });
        let registration;
        try {
            registration = await ensureRegistration();
        } catch (error) {
            return { complete: false, failures: [errorInfo(error, 'worker')], hasActiveCache: false, unsupported: error?.kind === 'unsupported' };
        }

        const worker = registration.active || registration.waiting || registration.installing;
        let before = {};
        try {
            before = await getWorkerStatus(worker);
        } catch (error) {
            console.warn('Could not read offline worker status', error);
        }

        emit({ phase: 'checking', message: 'Checking the development branch for changes…' });'''
if old_start not in cache:
    raise SystemExit('Could not find syncInternal startup block')
cache = cache.replace(old_start, new_start, 1)

listing_line = "        emit({ phase: 'listing', message: 'Getting the list of game files…' });"
if listing_line not in cache:
    raise SystemExit('Could not find file-list phase')
cache = cache.replace(listing_line, '''        // Only an actual update/new install needs a quota estimate.
        const storage = await storageDiagnostic();
        emit({ phase: 'storage-check', message: storage.message });
        emit({ phase: 'listing', message: 'Getting the list of game files…' });''', 1)

# Service worker v3: recover existing game caches if metadata is missing and
# reuse v2 caches during migration.
worker = worker.replace("const SW_VERSION = '2';", "const SW_VERSION = '3';")
marker = "const GAME_CACHE_PREFIX = `hex-game-v${SW_VERSION}-`;"
if marker not in worker:
    raise SystemExit('Could not find worker cache prefix')
worker = worker.replace(marker, marker + "\nconst LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v2-', 'hex-game-v1-'];", 1)

status_pattern = re.compile(r"async function statusResult\(\) \{.*?\n\}\n\nfunction mimeTypeFor", re.S)
status_replacement = '''async function inspectGameCache(cacheName, expectedCommit = null) {
    if (!cacheName) return null;
    try {
        const manifest = await readCacheManifest(cacheName);
        if (!manifest?.commit || !Array.isArray(manifest.files) || !manifest.files.length) return null;
        if (expectedCommit && manifest.commit !== expectedCommit) return null;
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        const expectedCount = manifest.files.length;
        if (keys.length < expectedCount + 1) return null;
        return {
            valid: true,
            activeCommit: manifest.commit,
            fileCount: expectedCount,
            totalBytes: manifest.files.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
            cacheName,
        };
    } catch (_) {
        return null;
    }
}

async function statusResult() {
    const meta = await readActiveMeta(true);
    if (meta?.cacheName) {
        const direct = await inspectGameCache(meta.cacheName, meta.commit || null);
        if (direct) return { ...direct, recovered: false };
    }

    // The large game cache may survive even if iOS loses/restores the tiny
    // metadata pointer separately. Recover from the real cache instead of
    // re-downloading every file.
    const names = await caches.keys();
    const candidates = names.filter(name =>
        name.startsWith(GAME_CACHE_PREFIX) || LEGACY_GAME_CACHE_PREFIXES.some(prefix => name.startsWith(prefix))
    );
    for (const name of candidates) {
        const recovered = await inspectGameCache(name);
        if (!recovered) continue;
        await writeActiveMeta({
            version: SW_VERSION,
            cacheName: recovered.cacheName,
            commit: recovered.activeCommit,
            fileCount: recovered.fileCount,
            totalBytes: recovered.totalBytes,
            recoveredAt: Date.now(),
        });
        return { ...recovered, recovered: true };
    }

    return { valid: false, activeCommit: null, fileCount: 0, cacheName: null, recovered: false };
}

function mimeTypeFor'''
worker, count = status_pattern.subn(status_replacement, worker, count=1)
if count != 1:
    raise SystemExit('Could not patch worker statusResult')

old_legacy = ".filter(name => name === 'hex-game-meta-v1' || name.startsWith('hex-game-v1-'))"
new_legacy = ".filter(name => name === 'hex-game-meta-v1' || name === 'hex-game-meta-v2' || name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-'))"
if old_legacy not in worker:
    raise SystemExit('Could not patch legacy cache cleanup')
worker = worker.replace(old_legacy, new_legacy, 1)

index = index.replace('20261001-pwa-offline-cache-v2', '20261001-pwa-offline-cache-v3')
index = index.replace('offlineCache.js?v=2', 'offlineCache.js?v=3')

cache_path.write_text(cache)
worker_path.write_text(worker)
index_path.write_text(index)
