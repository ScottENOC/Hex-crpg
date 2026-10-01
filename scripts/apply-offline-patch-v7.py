from pathlib import Path
import re

root = Path('.')

# --- offlineCache.js: bump bootstrap/worker generation ---
p = root / 'offlineCache.js'
s = p.read_text()
s = s.replace("const VERSION = '6';", "const VERSION = '7';")
s = s.replace("const SW_URL = 'offlineServiceWorker.js?v=6';", "const SW_URL = 'offlineServiceWorker.js?v=7';")
s = s.replace("hex-offline-reloaded-commit-v6", "hex-offline-reloaded-commit-v7")
p.write_text(s)

# --- index.html: force the new bootstrap and use an already-cached favicon ---
p = root / 'index.html'
s = p.read_text()
s = s.replace('20261001-pwa-offline-cache-v6', '20261001-pwa-offline-cache-v7')
s = s.replace('<link rel="apple-touch-icon" href="appstore/icon-1024.png">', '<link rel="apple-touch-icon" href="appstore/icon-1024.png">\n    <link rel="icon" type="image/png" href="appstore/icon-1024.png">')
s = s.replace('offlineCache.js?v=6', 'offlineCache.js?v=7')
p.write_text(s)

# --- service worker: v7 + small staged patch updates instead of cloning whole cache ---
p = root / 'offlineServiceWorker.js'
s = p.read_text()
s = s.replace("const SW_VERSION = '6';", "const SW_VERSION = '7';")
s = s.replace("const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];",
              "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];")

# Make legacy cleanup preserve the cache that is still the active local copy.
s = re.sub(
    r"async function cleanupLegacyCaches\(\) \{.*?\n\}",
    '''async function cleanupLegacyCaches(keepNames = []) {
    const keep = new Set((keepNames || []).filter(Boolean));
    const names = await caches.keys();
    await Promise.all(names
        .filter(name => !keep.has(name) && (
            name === 'hex-game-meta-v1' || name === 'hex-game-meta-v2' || name === 'hex-game-meta-v3' ||
            name === 'hex-game-meta-v4' || name === 'hex-game-meta-v5' || name === 'hex-game-meta-v6' ||
            name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-') || name.startsWith('hex-game-v3-') ||
            name.startsWith('hex-game-v4-') || name.startsWith('hex-game-v5-') || name.startsWith('hex-game-v6-')
        ))
        .map(name => caches.delete(name)));
}''',
    s,
    count=1,
    flags=re.S,
)

new_cache_game = r'''async function cacheGame(message, port) {
    const commit = String(message.commit || '');
    const owner = String(message.owner || '');
    const repo = String(message.repo || '');
    const files = Array.isArray(message.files) ? message.files.filter(file => file?.path && file?.sha) : [];
    if (!/^[0-9a-f]{40}$/i.test(commit) || !owner || !repo || !files.length) {
        port.postMessage({ type: 'error', kind: 'bad-request', message: 'Offline cache received an invalid commit or file list.' });
        return;
    }

    const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
    const before = await statusResult();
    if (!before.valid) {
        port.postMessage({
            type: 'progress', phase: 'storage-check', current: 'Testing a local Cache Storage write…',
            processed: 0, stored: 0, total: files.length, downloaded: 0, reused: 0, retried: 0, failed: 0,
            totalBytes, message: 'Checking that iOS can save game files locally…',
        });
        try {
            await assertCacheStorageWorks();
        } catch (error) {
            port.postMessage({
                type: 'result',
                result: {
                    complete: false, storageFailure: true, quotaFailure: error?.kind === 'quota',
                    failures: [serialiseFailure(error, '(local storage test)')], stored: 0, total: files.length,
                    downloaded: 0, reused: 0, retried: 0, activeCommit: null,
                },
            });
            return;
        }
    }

    // v7 deliberately does NOT create and populate another full 420-file cache
    // for every update. On iOS that duplication can stall Cache Storage before
    // even the first unchanged file is reported as reused. Instead, download
    // only changed/new files into a tiny staging cache. Once every changed file
    // is verified, apply those few responses to the existing complete cache.
    const activeCacheName = before.valid ? before.cacheName : null;
    const activeCache = activeCacheName ? await caches.open(activeCacheName) : null;
    const activeManifest = activeCacheName ? await readCacheManifest(activeCacheName) : null;
    const activeShaByPath = new Map((activeManifest?.files || []).map(file => [file.path, file.sha]));
    const newPaths = new Set(files.map(file => file.path));

    const patchCacheName = `${GAME_CACHE_PREFIX}patch-${commit}`;
    const patchCache = await caches.open(patchCacheName);

    let processed = 0;
    let stored = 0;
    let downloaded = 0;
    let reused = 0;
    let retried = 0;
    const failures = [];
    let cursor = 0;
    let quotaFailure = false;

    const sendProgress = (current = '', phase = 'storing', messageText = '') => {
        port.postMessage({
            type: 'progress', phase, current, processed, stored, total: files.length,
            downloaded, reused, retried, failed: failures.length, totalBytes, message: messageText,
        });
    };

    async function cacheOne(file) {
        const request = new Request(localUrl(file.path));

        // Unchanged files stay exactly where they already are. No second copy.
        if (activeCache && activeShaByPath.get(file.path) === file.sha) {
            const existing = await activeCache.match(request, { ignoreSearch: true });
            if (existing) {
                reused++;
                stored++;
                return;
            }
        }

        // Resume a partially downloaded patch without re-fetching good files.
        const staged = await patchCache.match(request, { ignoreSearch: true });
        if (staged && staged.headers.get('X-Hex-Blob-Sha') === file.sha) {
            reused++;
            stored++;
            return;
        }

        sendProgress(file.path, 'storing', `Downloading changed file ${file.path}…`);
        const result = await downloadVerifiedFile(file, { owner, repo, commit });
        retried += Math.max(0, (result.attempts || 1) - 1);
        try {
            await patchCache.put(request, result.response.clone());
        } catch (error) {
            if (error?.name === 'QuotaExceededError') {
                throw makeFailure('quota', 'The browser ran out of local web-app storage while saving this update.');
            }
            throw makeFailure('storage', `The browser could not save the changed file locally: ${error?.message || error}`);
        }
        downloaded++;
        stored++;
    }

    async function workerLoop() {
        while (true) {
            if (quotaFailure) return;
            const index = cursor++;
            if (index >= files.length) return;
            const file = files[index];
            try {
                await cacheOne(file);
            } catch (error) {
                failures.push(serialiseFailure(error, file.path));
                if (error?.kind === 'quota') quotaFailure = true;
            } finally {
                processed++;
                sendProgress(file.path, quotaFailure ? 'storage-error' : (failures.length ? 'recovering' : 'storing'));
            }
        }
    }

    sendProgress('', 'storing', before.valid
        ? `Checking ${files.length} files; unchanged files stay in place…`
        : `Saving ${files.length} files locally…`);
    await Promise.all(Array.from({ length: MAX_CONCURRENT_DOWNLOADS }, () => workerLoop()));

    if (quotaFailure || failures.length) {
        port.postMessage({
            type: 'result',
            result: {
                complete: false, quotaFailure, failures, stored, total: files.length,
                downloaded, reused, retried, activeCommit: before.activeCommit || null,
                hasActiveCache: Boolean(before.valid),
            },
        });
        return;
    }

    let finalCacheName;
    let finalCache;

    if (before.valid && activeCache) {
        // All changed files are already verified. Applying the patch now only
        // touches changed/new files plus removals, rather than duplicating the
        // entire game. If a prior patch had no changes this loop is effectively free.
        const patchRequests = await patchCache.keys();
        for (const request of patchRequests) {
            const response = await patchCache.match(request);
            if (response) await activeCache.put(request, response.clone());
        }

        // Remove runtime files that no longer exist in the new build.
        for (const oldFile of (activeManifest?.files || [])) {
            if (!newPaths.has(oldFile.path)) {
                await activeCache.delete(new Request(localUrl(oldFile.path)), { ignoreSearch: true });
            }
        }

        await writeCacheManifest(activeCache, commit, files);
        finalCacheName = activeCacheName;
        finalCache = activeCache;
        await caches.delete(patchCacheName);
    } else {
        // First install: the staging cache already contains the whole verified
        // build, so simply promote it instead of copying it again.
        await writeCacheManifest(patchCache, commit, files);
        finalCacheName = patchCacheName;
        finalCache = patchCache;
    }

    const nextMeta = {
        version: SW_VERSION,
        cacheName: finalCacheName,
        commit,
        fileCount: files.length,
        totalBytes,
        updatedAt: Date.now(),
    };
    await writeActiveMeta(nextMeta);
    await cleanupStaleGameCaches([finalCacheName]);
    await cleanupLegacyCaches([finalCacheName]);

    sendProgress('', 'ready', before.valid
        ? `Update complete: ${downloaded} changed file${downloaded === 1 ? '' : 's'} downloaded, ${reused} reused in place.`
        : 'Local copy complete.');
    port.postMessage({
        type: 'result',
        result: {
            complete: true, failures: [], stored: files.length, total: files.length,
            downloaded, reused, retried, activeCommit: commit, fileCount: files.length,
            totalBytes, changed: before.activeCommit !== commit,
        },
    });
}'''

s, count = re.subn(
    r"async function cacheGame\(message, port\) \{.*?\n\}\n\nself\.addEventListener\('message'",
    new_cache_game + "\n\nself.addEventListener('message'",
    s,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('Could not replace cacheGame() exactly once')

# Make offline cache misses controlled responses rather than rejected respondWith promises.
old_tail = '''        const cached = await serveFromActiveCache(request);\n        if (cached) return cached;\n        return fetch(request);'''
new_tail = '''        const cached = await serveFromActiveCache(request);\n        if (cached) return cached;\n        try {\n            return await fetch(request);\n        } catch (error) {\n            // Never reject event.respondWith() merely because the phone is\n            // offline. WebKit surfaces that as “FetchEvent.respondWith …\n            // TypeError: Load failed”. A controlled 503 lets optional misses\n            // (notably favicon/browser probes) fail harmlessly while making a\n            // genuinely missing runtime file diagnosable as HTTP 503.\n            try {\n                const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });\n                for (const client of clients) client.postMessage({ type: 'HEX_OFFLINE_MISS', path: relativePath || '(root)' });\n            } catch (_) {}\n            return new Response('Offline and this resource is not in the local game copy.', {\n                status: 503,\n                statusText: 'Offline',\n                headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Hex-Offline-Miss': relativePath || '(root)' },\n            });\n        }'''
if old_tail not in s:
    raise SystemExit('Could not find fetch fallback tail')
s = s.replace(old_tail, new_tail, 1)
p.write_text(s)

print('Applied offline v7 patch-cache and offline-miss fixes')
