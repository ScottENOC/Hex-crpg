from pathlib import Path

p = Path('offlineCache.js')
text = p.read_text()
inspect_start = text.index('    async function inspectLocalCopy() {')
inspect_end = text.index('    function shortCommit(value) {', inspect_start)
section = text[inspect_start:inspect_end]

old_worker = """        let workerVersion = null;
        try {
            const scriptUrl = navigator.serviceWorker.controller?.scriptURL || '';
            workerVersion = new URL(scriptUrl || location.href).searchParams.get('v');
        } catch (_) {}
"""
new_worker = """        let workerVersion = null;
        try {
            const registration = await diagnosticAwait(
                '0/6 · Checking offline worker registration',
                () => navigator.serviceWorker.getRegistration('./'),
                { timeoutMs: 3000 }
            );
            const worker = navigator.serviceWorker.controller || registration?.active || registration?.waiting || registration?.installing;
            if (worker?.scriptURL) workerVersion = new URL(worker.scriptURL).searchParams.get('v');
        } catch (_) {}
"""
if old_worker not in section:
    raise SystemExit('worker-version block not found')
section = section.replace(old_worker, new_worker, 1)

region_start = section.index('        const metaResponse = await diagnosticAwait(')
region_end = section.index('        const cacheExists = await diagnosticAwait(', region_start)
new_region = """        let metaResponse = await diagnosticAwait(
            '2/6 · Reading active local-cache pointer',
            () => metaCache.match(metaKey),
            { timeoutMs: 5000 }
        );
        let meta = null;
        let metaSource = metaCacheName;
        let discoveredCacheNames = [];

        if (metaResponse) {
            meta = await diagnosticAwait(
                '2/6 · Decoding active local-cache pointer',
                () => metaResponse.clone().json(),
                { timeoutMs: 2000 }
            );
        }

        if (!meta?.cacheName) {
            const cacheNames = await diagnosticAwait(
                '2/6 · Active pointer missing; listing local cache names',
                () => caches.keys(),
                { timeoutMs: 8000 }
            );
            const legacyMetaNames = [
                'hex-game-meta-v11', 'hex-game-meta-v10', 'hex-game-meta-v9', 'hex-game-meta-v8',
                'hex-game-meta-v7', 'hex-game-meta-v6', 'hex-game-meta-v5', 'hex-game-meta-v4',
                'hex-game-meta-v3', 'hex-game-meta-v2', 'hex-game-meta-v1',
            ];
            for (const legacyMetaName of legacyMetaNames.filter(name => cacheNames.includes(name))) {
                const legacyMetaCache = await diagnosticAwait(
                    `2/6 · Checking older metadata: ${legacyMetaName}`,
                    () => caches.open(legacyMetaName),
                    { timeoutMs: 4000, current: legacyMetaName }
                );
                const response = await diagnosticAwait(
                    `2/6 · Reading older pointer: ${legacyMetaName}`,
                    () => legacyMetaCache.match(metaKey),
                    { timeoutMs: 4000, current: legacyMetaName }
                );
                if (!response) continue;
                const candidateMeta = await diagnosticAwait(
                    `2/6 · Decoding older pointer: ${legacyMetaName}`,
                    () => response.clone().json(),
                    { timeoutMs: 2000, current: legacyMetaName }
                );
                if (candidateMeta?.cacheName) {
                    meta = candidateMeta;
                    metaSource = legacyMetaName;
                    break;
                }
            }

            if (!meta?.cacheName) {
                const prefixes = [
                    'hex-game-cache-', 'hex-game-v11-', 'hex-game-v10-', 'hex-game-v9-', 'hex-game-v8-',
                    'hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-',
                    'hex-game-v2-', 'hex-game-v1-',
                ];
                const rank = name => {
                    const index = prefixes.findIndex(prefix => name.startsWith(prefix));
                    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
                };
                const candidates = cacheNames
                    .filter(name => prefixes.some(prefix => name.startsWith(prefix)))
                    .filter(name => !/(?:^|-)patch(?:-|$)/i.test(name))
                    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
                discoveredCacheNames = candidates.slice(0, 8);
                emit({
                    phase: 'diagnostic', processed: 0, total: candidates.length, current: '',
                    message: `2/6 · Pointer missing; found ${candidates.length} game-cache candidate${candidates.length === 1 ? '' : 's'}. Checking manifests…`,
                });

                const limit = Math.min(16, candidates.length);
                for (let i = 0; i < limit; i++) {
                    const name = candidates[i];
                    const candidateCache = await diagnosticAwait(
                        `2/6 · Candidate ${i + 1}/${limit}: opening ${name}`,
                        () => caches.open(name),
                        { timeoutMs: 5000, processed: i, total: limit, current: name }
                    );
                    const manifestResponse = await diagnosticAwait(
                        `2/6 · Candidate ${i + 1}/${limit}: reading completion manifest`,
                        () => candidateCache.match(manifestKey),
                        { timeoutMs: 5000, processed: i, total: limit, current: name }
                    );
                    if (!manifestResponse) continue;
                    let candidateManifest = null;
                    try {
                        candidateManifest = await diagnosticAwait(
                            `2/6 · Candidate ${i + 1}/${limit}: decoding completion manifest`,
                            () => manifestResponse.clone().json(),
                            { timeoutMs: 2500, processed: i, total: limit, current: name }
                        );
                    } catch (_) {
                        continue;
                    }
                    if (!candidateManifest?.commit || !Array.isArray(candidateManifest.files) || !candidateManifest.files.length) continue;
                    meta = { cacheName: name, commit: candidateManifest.commit };
                    metaSource = 'discovered cache manifest (active pointer missing)';
                    emit({
                        phase: 'diagnostic', processed: i + 1, total: limit, current: name,
                        message: `2/6 · Orphaned local game cache found: ${name} · ${candidateManifest.files.length} manifest files`,
                    });
                    break;
                }
            }
        }

        const cacheName = meta?.cacheName || null;
        if (!cacheName) {
            const namesText = discoveredCacheNames.length ? discoveredCacheNames.join(', ') : 'none';
            return {
                workerVersion,
                metaSource,
                cacheName: null,
                cacheExists: false,
                savedCommit: null,
                manifestFiles: 0,
                expectedFiles: 0,
                shaCompared: false,
                shaSame: 0,
                shaDifferent: 0,
                noSavedSha: 0,
                probeCount: 0,
                probePresent: 0,
                probeMissing: 0,
                probeTimeouts: 0,
                lastStep: `No active pointer and no readable game-cache manifest was found. Candidate cache names: ${namesText}`,
            };
        }

"""
section = section[:region_start] + new_region + section[region_end:]
section = section.replace('metaSource: metaCacheName', 'metaSource')
text = text[:inspect_start] + section + text[inspect_end:]
p.write_text(text)

idx = Path('index.html')
html = idx.read_text()
if '20261001-pwa-offline-cache-v15-inspector2' not in html:
    raise SystemExit('expected inspector2 app-build marker not found')
if 'offlineCache.js?v=15-inspector2' not in html:
    raise SystemExit('expected inspector2 script URL not found')
html = html.replace('20261001-pwa-offline-cache-v15-inspector2', '20261001-pwa-offline-cache-v15-inspector3', 1)
html = html.replace('offlineCache.js?v=15-inspector2', 'offlineCache.js?v=15-inspector3', 1)
idx.write_text(html)
