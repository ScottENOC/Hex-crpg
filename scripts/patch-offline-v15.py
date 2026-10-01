from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

sw_path = Path('offlineServiceWorker.js')
sw = sw_path.read_text()
sw = replace_once(sw, "const SW_VERSION = '14';", "const SW_VERSION = '15';", 'worker version')

start = sw.index('async function inspectGameCache(')
end = sw.index('\nasync function statusResult()', start)
new_inspect = r'''async function inspectGameCache(cacheName, expectedCommit = null) {
    if (!cacheName) return null;
    try {
        // The manifest is our completion record. It is written only after every
        // required file has been verified and the update has been promoted.
        // Do not enumerate hundreds of Cache Storage entries here: WebKit can
        // stall indefinitely on cache.keys() for a large cache on iOS.
        const manifest = await readCacheManifest(cacheName);
        if (!manifest?.commit || !Array.isArray(manifest.files) || !manifest.files.length) return null;
        if (expectedCommit && manifest.commit !== expectedCommit) return null;
        const expectedCount = manifest.files.length;
        return {
            valid: true,
            healthy: true,
            manifestTrusted: true,
            missingCount: 0,
            missingPaths: [],
            availableCount: expectedCount,
            activeCommit: manifest.commit,
            fileCount: expectedCount,
            totalBytes: manifest.files.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
            cacheName,
        };
    } catch (_) {
        return null;
    }
}
'''
sw = sw[:start] + new_inspect + sw[end:]

# Stable metadata should carry any runtime misses reported by the fetch path.
old_direct = "if (direct?.valid) return { ...direct, recovered: false, recoveredFromMeta: META_CACHE };"
new_direct = "if (direct?.valid) return { ...direct, reportedMissingPaths: Array.isArray(meta.missingPaths) ? meta.missingPaths : [], recovered: false, recoveredFromMeta: META_CACHE };"
sw = replace_once(sw, old_direct, new_direct, 'stable metadata status')

# Replace the diagnostic with manifest comparison + bounded direct probes.
start = sw.index('async function diagnoseGameCache(')
end = sw.index('\nfunction mimeTypeFor(', start)
new_diagnose = r'''async function diagnoseGameCache(files, port = null) {
    const expectedFiles = Array.isArray(files) ? files.filter(file => file?.path && file?.sha) : [];
    let meta = await readActiveMeta(true);
    let metaSource = meta ? META_CACHE : null;

    // Inspection must be read-only and must not enumerate a large game cache.
    // If stable metadata is absent, old metadata records are cheap to probe by
    // exact key; opening one may create an empty cache but never touches game data.
    if (!meta?.cacheName) {
        for (const legacyMetaName of LEGACY_META_CACHES) {
            try {
                const legacyMetaCache = await caches.open(legacyMetaName);
                const candidate = await readJsonResponse(await legacyMetaCache.match(META_KEY));
                if (candidate?.cacheName) {
                    meta = candidate;
                    metaSource = legacyMetaName;
                    break;
                }
            } catch (_) {}
        }
    }

    const cacheName = meta?.cacheName || null;
    if (!cacheName) {
        return {
            workerVersion: SW_VERSION,
            metaSource,
            cacheName: null,
            cacheExists: false,
            savedCommit: meta?.commit || null,
            manifestFiles: 0,
            expectedFiles: expectedFiles.length,
            shaSame: 0,
            shaDifferent: 0,
            noSavedSha: expectedFiles.length,
            probeCount: 0,
            probePresent: 0,
            probeMissing: 0,
            probeTimeouts: 0,
        };
    }

    const manifest = await readCacheManifest(cacheName);
    const savedShaByPath = new Map((manifest?.files || []).map(file => [file.path, file.sha]));
    let shaSame = 0;
    let shaDifferent = 0;
    let noSavedSha = 0;
    for (const file of expectedFiles) {
        const savedSha = savedShaByPath.get(file.path);
        if (!savedSha) noSavedSha++;
        else if (savedSha === file.sha) shaSame++;
        else shaDifferent++;
    }

    // We only need a bounded physical sample to distinguish “the cache is
    // empty/wrong” from “the manifest comparison is wrong”. A full cache.keys()
    // scan is exactly the WebKit operation that is hanging on the user's iPhone.
    const probeLimit = Math.min(24, expectedFiles.length);
    const probeFiles = [];
    if (probeLimit) {
        const seen = new Set();
        for (let i = 0; i < probeLimit; i++) {
            const index = probeLimit === 1 ? 0 : Math.round(i * (expectedFiles.length - 1) / (probeLimit - 1));
            const file = expectedFiles[index];
            if (file && !seen.has(file.path)) {
                seen.add(file.path);
                probeFiles.push(file);
            }
        }
    }

    let probePresent = 0;
    let probeMissing = 0;
    let probeTimeouts = 0;
    const cache = await caches.open(cacheName);
    const directMatch = (request, timeoutMs = 2500) => Promise.race([
        cache.match(request, { ignoreSearch: true }),
        new Promise(resolve => setTimeout(() => resolve('__HEX_CACHE_MATCH_TIMEOUT__'), timeoutMs)),
    ]);

    for (let i = 0; i < probeFiles.length; i++) {
        const file = probeFiles[i];
        if (port) {
            port.postMessage({
                type: 'progress', phase: 'diagnostic', processed: i, total: probeFiles.length,
                current: file.path, message: `Probing saved file ${i + 1} / ${probeFiles.length}…`,
            });
        }
        const response = await directMatch(new Request(localUrl(file.path)));
        if (response === '__HEX_CACHE_MATCH_TIMEOUT__') {
            probeTimeouts++;
            if (probeTimeouts >= 3) break;
        } else if (response) {
            probePresent++;
        } else {
            probeMissing++;
        }
    }

    if (port) {
        port.postMessage({
            type: 'progress', phase: 'diagnostic', processed: probePresent + probeMissing + probeTimeouts,
            total: probeFiles.length, message: 'Local-cache inspection complete.',
        });
    }

    return {
        workerVersion: SW_VERSION,
        metaSource,
        cacheName,
        cacheExists: Boolean(manifest),
        savedCommit: manifest?.commit || meta?.commit || null,
        manifestFiles: Array.isArray(manifest?.files) ? manifest.files.length : 0,
        expectedFiles: expectedFiles.length,
        shaSame,
        shaDifferent,
        noSavedSha,
        probeCount: probeFiles.length,
        probePresent,
        probeMissing,
        probeTimeouts,
    };
}
'''
sw = sw[:start] + new_diagnose + sw[end:]

# The updater must reuse based on the promoted manifest, not a global key scan.
old_block = r'''    const activeShaByPath = new Map((activeManifest?.files || []).map(file => [file.path, file.sha]));
    const missingActivePaths = new Set(before.missingPaths || []);
    const newPaths = new Set(files.map(file => file.path));'''
new_block = r'''    const activeShaByPath = new Map((activeManifest?.files || []).map(file => [file.path, file.sha]));
    const reportedMissingPaths = new Set(before.reportedMissingPaths || []);
    const newPaths = new Set(files.map(file => file.path));'''
sw = replace_once(sw, old_block, new_block, 'active manifest setup')

old_reuse = r'''        // inspectGameCache() already performed the expensive exact-path scan.
        // If the manifest SHA matches and that exact URL was physically present,
        // the file is reusable. Do NOT call cache.match() again for every one of
        // ~421 unchanged files: concurrent CacheStorage reads can stall WebKit.
        const physicallyPresent = activeCache && !missingActivePaths.has(file.path);
        const compareSaysUnchanged = changedPathSet && !changedPathSet.has(file.path);
        const manifestShaMatches = activeShaByPath.get(file.path) === file.sha;
        if (physicallyPresent && (compareSaysUnchanged || manifestShaMatches)) {
            reused++;
            stored++;
            return;
        }'''
new_reuse = r'''        // The promoted manifest is authoritative for unchanged files: it is
        // written only after a complete verified update. Reuse by Git blob SHA
        // without reopening/enumerating every cached response. A runtime miss
        // recorded by the fetch handler overrides this and forces repair.
        const manifestShaMatches = activeCache && activeShaByPath.get(file.path) === file.sha;
        if (manifestShaMatches && !reportedMissingPaths.has(file.path)) {
            reused++;
            stored++;
            return;
        }'''
sw = replace_once(sw, old_reuse, new_reuse, 'reuse decision')

# Preserve runtime-miss state field in metadata; successful repair clears it.
old_meta = r'''        totalBytes,
        updatedAt: Date.now(),
    };'''
new_meta = r'''        totalBytes,
        missingPaths: [],
        updatedAt: Date.now(),
    };'''
sw = replace_once(sw, old_meta, new_meta, 'metadata missing path reset')

# Global cache-name housekeeping is not worth blocking a successful iOS update.
old_cleanup = r'''    await writeActiveMeta(nextMeta);
    await cleanupStaleGameCaches([finalCacheName]);
    await cleanupLegacyCaches([finalCacheName]);

    sendProgress'''
new_cleanup = r'''    await writeActiveMeta(nextMeta);
    // Do not enumerate all Cache Storage names on the update critical path.
    // WebKit has already shown that cache enumeration can stall on this device.
    // Known staging data was deleted above; legacy housekeeping can be done by
    // a future explicit maintenance operation without blocking play/update.

    sendProgress'''
sw = replace_once(sw, old_cleanup, new_cleanup, 'critical cleanup removal')

# Pass the message port so diagnostics can report progress while probing.
old_diag_call = "port.postMessage({ type: 'result', result: await diagnoseGameCache(event.data?.files || []) });"
new_diag_call = "port.postMessage({ type: 'result', result: await diagnoseGameCache(event.data?.files || [], port) });"
sw = replace_once(sw, old_diag_call, new_diag_call, 'diagnostic progress port')

# Record a genuine runtime miss in stable metadata so the next update repairs it.
insert_before = "self.addEventListener('fetch', event => {"
record_helper = r'''async function recordRuntimeMiss(path) {
    if (!path || path.startsWith('__hex_offline_meta__/')) return;
    try {
        const meta = await readActiveMeta();
        if (!meta?.cacheName) return;
        const missing = new Set(Array.isArray(meta.missingPaths) ? meta.missingPaths : []);
        if (missing.has(path)) return;
        missing.add(path);
        await writeActiveMeta({ ...meta, missingPaths: [...missing].slice(-100) });
    } catch (_) {}
}

'''
if insert_before not in sw:
    raise SystemExit('fetch listener marker missing')
sw = sw.replace(insert_before, record_helper + insert_before, 1)

old_cached = r'''        const cached = await serveFromActiveCache(request);
        if (cached) return cached;
        try {
            return await fetch(request);'''
new_cached = r'''        const cached = await serveFromActiveCache(request);
        if (cached) return cached;
        // Remember cache holes even when the network can temporarily hide them.
        // The next explicit update will repair these paths instead of trusting
        // the completion manifest for them.
        event.waitUntil(recordRuntimeMiss(relativePath));
        try {
            return await fetch(request);'''
sw = replace_once(sw, old_cached, new_cached, 'runtime miss tracking')

sw_path.write_text(sw)

oc_path = Path('offlineCache.js')
oc = oc_path.read_text()
oc = replace_once(oc, "const VERSION = '14';", "const VERSION = '15';", 'launcher version')
oc = replace_once(oc, "const SW_URL = 'offlineServiceWorker.js?v=14';", "const SW_URL = 'offlineServiceWorker.js?v=15';", 'worker url')
oc = replace_once(oc, "const reloadKey = 'hex-offline-reloaded-commit-v14';", "const reloadKey = 'hex-offline-reloaded-commit-v15';", 'reload key')

old_request = "return workerRequest(worker, { type: 'HEX_CACHE_DIAGNOSTICS', files: latest.files }, { timeout: 20000 });"
new_request = r'''return workerRequest(worker, { type: 'HEX_CACHE_DIAGNOSTICS', files: latest.files }, {
            timeout: 30000,
            onProgress: progress => emit({
                phase: 'diagnostic',
                processed: progress.processed || 0,
                total: progress.total || 0,
                current: progress.current || '',
                message: progress.message || 'Inspecting local cache…',
            }),
        });'''
oc = replace_once(oc, old_request, new_request, 'diagnostic progress UI')

old_format = r'''        return `Diagnostic: engine v${d.workerVersion || '?'} · cache ${cacheText} · saved commit ${shortCommit(d.savedCommit)} · ` +
            `${d.physicalPresent || 0}/${d.expectedFiles || 0} expected files physically present (${d.physicalMissing || 0} missing) · ` +
            `SHA: ${d.shaSame || 0} same, ${d.shaDifferent || 0} different, ${d.noSavedSha || 0} without saved SHA · ` +
            `manifest ${d.manifestFiles || 0} files · raw cache ${d.cacheEntries || 0} entries · metadata ${d.metaSource || 'none'}.`;'''
new_format = r'''        const probeCompleted = (d.probePresent || 0) + (d.probeMissing || 0);
        const probeText = d.probeCount
            ? `physical probes ${d.probePresent || 0}/${probeCompleted || d.probeCount} present${d.probeTimeouts ? ` · ${d.probeTimeouts} timed out` : ''}`
            : 'physical probes unavailable';
        return `Diagnostic: engine v${d.workerVersion || '?'} · cache ${cacheText} · saved commit ${shortCommit(d.savedCommit)} · ` +
            `${probeText} · SHA: ${d.shaSame || 0} same, ${d.shaDifferent || 0} different, ${d.noSavedSha || 0} without saved SHA · ` +
            `manifest ${d.manifestFiles || 0}/${d.expectedFiles || 0} files · metadata ${d.metaSource || 'none'}.`;'''
oc = replace_once(oc, old_format, new_format, 'diagnostic formatter')

# Make the generic watchdog error tell the truth for non-45-second requests.
old_timeout = "reject(Object.assign(new Error('The local-cache worker made no progress for 45 seconds.'), { kind: 'worker-stalled' }));"
new_timeout = "reject(Object.assign(new Error(`The local-cache worker made no progress for ${Math.round(timeout / 1000)} seconds.`), { kind: 'worker-stalled' }));"
oc = replace_once(oc, old_timeout, new_timeout, 'watchdog message')
oc_path.write_text(oc)

index_path = Path('index.html')
index = index_path.read_text()
index = replace_once(index, '20261001-pwa-offline-cache-v14', '20261001-pwa-offline-cache-v15', 'app build')
if 'offlineCache.js?v=14' in index:
    index = replace_once(index, 'offlineCache.js?v=14', 'offlineCache.js?v=15', 'launcher script version')
elif 'offlineCache.js?v=13' in index:
    index = replace_once(index, 'offlineCache.js?v=13', 'offlineCache.js?v=15', 'launcher script version from v13')
else:
    raise SystemExit('offlineCache script version marker not found')
index_path.write_text(index)
