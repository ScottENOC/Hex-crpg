from pathlib import Path
import re

p = Path('offlineCache.js')
s = p.read_text()

new_inspect = r'''    async function inspectLocalCopy() {
        const scopeUrl = new URL('./', location.href).href;
        const metaKey = new URL('__hex_offline_meta__/active.json', scopeUrl).href;
        const manifestKey = new URL('__hex_offline_meta__/manifest.json', scopeUrl).href;
        const metaCacheName = 'hex-game-meta';

        let lastStep = 'Starting local-cache inspection';
        const diagnosticAwait = async (label, operation, {
            timeoutMs = 5000,
            processed = 0,
            total = 0,
            current = '',
        } = {}) => {
            lastStep = label;
            const startedAt = Date.now();
            const push = () => {
                const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
                emit({
                    phase: 'diagnostic',
                    processed,
                    total,
                    current,
                    message: seconds > 0 ? `${label} · waiting ${seconds}s…` : label,
                });
            };
            push();
            const heartbeat = setInterval(push, 1000);
            let timeoutId = null;
            try {
                return await Promise.race([
                    Promise.resolve().then(operation),
                    new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            const error = new Error(`${label} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
                            error.kind = 'diagnostic-timeout';
                            error.stage = label;
                            reject(error);
                        }, timeoutMs);
                    }),
                ]);
            } finally {
                clearInterval(heartbeat);
                if (timeoutId) clearTimeout(timeoutId);
            }
        };

        let workerVersion = null;
        try {
            const scriptUrl = navigator.serviceWorker.controller?.scriptURL || '';
            workerVersion = new URL(scriptUrl || location.href).searchParams.get('v');
        } catch (_) {}

        emit({ phase: 'diagnostic', processed: 0, total: 0, current: '', message: '1/6 · Opening local metadata index…' });
        const metaCache = await diagnosticAwait(
            '1/6 · Opening local metadata index',
            () => caches.open(metaCacheName),
            { timeoutMs: 5000 }
        );
        const metaResponse = await diagnosticAwait(
            '2/6 · Reading active local-cache pointer',
            () => metaCache.match(metaKey),
            { timeoutMs: 5000 }
        );
        if (!metaResponse) {
            return {
                workerVersion,
                metaSource: metaCacheName,
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
                lastStep: 'No active local-cache pointer was found',
            };
        }
        const meta = await diagnosticAwait(
            '2/6 · Decoding active local-cache pointer',
            () => metaResponse.clone().json(),
            { timeoutMs: 2000 }
        );
        const cacheName = meta?.cacheName || null;
        if (!cacheName) {
            return {
                workerVersion,
                metaSource: metaCacheName,
                cacheName: null,
                cacheExists: false,
                savedCommit: meta?.commit || null,
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
                lastStep: 'Metadata exists but has no cache name',
            };
        }

        const cacheExists = await diagnosticAwait(
            `3/6 · Checking saved cache ${cacheName}`,
            () => caches.has(cacheName),
            { timeoutMs: 5000, current: cacheName }
        );
        if (!cacheExists) {
            return {
                workerVersion,
                metaSource: metaCacheName,
                cacheName,
                cacheExists: false,
                savedCommit: meta?.commit || null,
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
                lastStep: 'Metadata points to a cache that does not exist',
            };
        }
        const cache = await diagnosticAwait(
            `3/6 · Opening saved cache ${cacheName}`,
            () => caches.open(cacheName),
            { timeoutMs: 5000, current: cacheName }
        );
        const manifestResponse = await diagnosticAwait(
            '4/6 · Reading saved game manifest',
            () => cache.match(manifestKey),
            { timeoutMs: 5000, current: cacheName }
        );
        const manifest = manifestResponse
            ? await diagnosticAwait('4/6 · Decoding saved game manifest', () => manifestResponse.clone().json(), { timeoutMs: 2500 })
            : null;
        const manifestFiles = Array.isArray(manifest?.files) ? manifest.files.filter(file => file?.path && file?.sha) : [];

        let latest = null;
        let comparisonError = null;
        if (navigator.onLine !== false) {
            try {
                latest = await diagnosticAwait(
                    '5/6 · Getting current GitHub file list for SHA comparison',
                    () => getLatestRuntimeFiles(),
                    { timeoutMs: 20000 }
                );
            } catch (error) {
                comparisonError = error?.message || String(error);
                emit({ phase: 'diagnostic', processed: 0, total: 0, current: '', message: `5/6 · SHA comparison skipped: ${comparisonError}` });
            }
        } else {
            comparisonError = 'Phone is offline';
            emit({ phase: 'diagnostic', processed: 0, total: 0, current: '', message: '5/6 · Offline: skipping GitHub SHA comparison' });
        }

        const expectedFiles = Array.isArray(latest?.files) ? latest.files : manifestFiles;
        const savedShaByPath = new Map(manifestFiles.map(file => [file.path, file.sha]));
        let shaSame = 0;
        let shaDifferent = 0;
        let noSavedSha = 0;
        if (latest?.files) {
            emit({ phase: 'diagnostic', processed: 0, total: latest.files.length, current: '', message: `5/6 · Comparing ${latest.files.length} Git blob SHAs…` });
            for (const file of latest.files) {
                const savedSha = savedShaByPath.get(file.path);
                if (!savedSha) noSavedSha++;
                else if (savedSha === file.sha) shaSame++;
                else shaDifferent++;
            }
        }

        const probeSource = manifestFiles.length ? manifestFiles : expectedFiles;
        const probeLimit = Math.min(24, probeSource.length);
        const probeFiles = [];
        if (probeLimit) {
            const seen = new Set();
            for (let i = 0; i < probeLimit; i++) {
                const index = probeLimit === 1 ? 0 : Math.round(i * (probeSource.length - 1) / (probeLimit - 1));
                const file = probeSource[index];
                if (file && !seen.has(file.path)) {
                    seen.add(file.path);
                    probeFiles.push(file);
                }
            }
        }

        let probePresent = 0;
        let probeMissing = 0;
        let probeTimeouts = 0;
        let consecutiveTimeouts = 0;
        for (let i = 0; i < probeFiles.length; i++) {
            const file = probeFiles[i];
            const label = `6/6 · Probe ${i + 1}/${probeFiles.length}: ${file.path}`;
            try {
                const response = await diagnosticAwait(
                    label,
                    () => cache.match(new Request(new URL(file.path.split('/').map(part => encodeURIComponent(part)).join('/'), scopeUrl).href), { ignoreSearch: true }),
                    { timeoutMs: 3500, processed: i, total: probeFiles.length, current: file.path }
                );
                consecutiveTimeouts = 0;
                if (response) probePresent++;
                else probeMissing++;
                emit({
                    phase: 'diagnostic',
                    processed: i + 1,
                    total: probeFiles.length,
                    current: file.path,
                    message: response ? `${label} · present` : `${label} · MISSING`,
                });
            } catch (error) {
                if (error?.kind !== 'diagnostic-timeout') throw error;
                probeTimeouts++;
                consecutiveTimeouts++;
                emit({
                    phase: 'diagnostic',
                    processed: i + 1,
                    total: probeFiles.length,
                    current: file.path,
                    message: `${label} · TIMED OUT`,
                });
                if (consecutiveTimeouts >= 2) {
                    lastStep = `${label} · stopped after two consecutive Cache Storage timeouts`;
                    break;
                }
            }
        }

        return {
            workerVersion,
            metaSource: metaCacheName,
            cacheName,
            cacheExists: true,
            savedCommit: manifest?.commit || meta?.commit || null,
            latestCommit: latest?.commit || null,
            manifestFiles: manifestFiles.length,
            expectedFiles: expectedFiles.length,
            shaCompared: Boolean(latest?.files),
            shaSame,
            shaDifferent,
            noSavedSha,
            comparisonError,
            probeCount: probeFiles.length,
            probePresent,
            probeMissing,
            probeTimeouts,
            lastStep,
        };
    }
'''
pattern = re.compile(r"    async function inspectLocalCopy\(\) \{.*?\n    \}\n\n    function shortCommit", re.S)
if not pattern.search(s):
    raise SystemExit('inspectLocalCopy function not found')
s = pattern.sub(new_inspect + "\n    function shortCommit", s, count=1)

new_format = r'''    function formatCacheDiagnostic(d) {
        if (!d) return 'Cache diagnostic returned no data.';
        const cacheText = d.cacheName || 'none';
        const probeCompleted = (d.probePresent || 0) + (d.probeMissing || 0) + (d.probeTimeouts || 0);
        const probeText = d.probeCount
            ? `physical probes ${d.probePresent || 0}/${probeCompleted || d.probeCount} present${d.probeMissing ? ` · ${d.probeMissing} missing` : ''}${d.probeTimeouts ? ` · ${d.probeTimeouts} timed out` : ''}`
            : 'physical probes unavailable';
        const shaText = d.shaCompared === false
            ? `SHA comparison skipped${d.comparisonError ? ` (${d.comparisonError})` : ''}`
            : `SHA: ${d.shaSame || 0} same, ${d.shaDifferent || 0} different, ${d.noSavedSha || 0} without saved SHA`;
        const lastText = d.lastStep ? ` · last step: ${d.lastStep}` : '';
        return `Diagnostic: engine v${d.workerVersion || '?'} · cache ${cacheText} · saved commit ${shortCommit(d.savedCommit)} · ` +
            `${probeText} · ${shaText} · manifest ${d.manifestFiles || 0}/${d.expectedFiles || 0} files · metadata ${d.metaSource || 'none'}${lastText}.`;
    }
'''
pattern = re.compile(r"    function formatCacheDiagnostic\(d\) \{.*?\n    \}\n\n    function emitWorkerProgress", re.S)
if not pattern.search(s):
    raise SystemExit('formatCacheDiagnostic function not found')
s = pattern.sub(new_format + "\n    function emitWorkerProgress", s, count=1)

needle = """        if (progress.total > 0) {\n            const checked = Math.max(progress.processed || 0, progress.stored || 0);"""
replacement = """        if (progress.phase === 'diagnostic') {\n            const checked = Math.max(0, progress.processed || 0);\n            count.textContent = progress.total > 0\n                ? `Local cache probe ${checked} / ${progress.total}`\n                : (progress.message || 'Inspecting local cache…');\n            bar.style.width = progress.total > 0\n                ? `${Math.max(0, Math.min(100, Math.round(checked * 100 / progress.total)))}%`\n                : '0%';\n            detail.textContent = [progress.message, progress.current].filter(Boolean).join(' · ');\n            return;\n        }\n\n        if (progress.total > 0) {\n            const checked = Math.max(progress.processed || 0, progress.stored || 0);"""
if needle not in s:
    raise SystemExit('renderProgress insertion point not found')
s = s.replace(needle, replacement, 1)

if "inspectButton.disabled = navigator.onLine === false;" not in s:
    raise SystemExit('inspect button offline guard not found')
s = s.replace("inspectButton.disabled = navigator.onLine === false;", "inspectButton.disabled = false;", 1)

p.write_text(s)

idx = Path('index.html')
t = idx.read_text()
t2, n = re.subn(r'offlineCache\.js\?v=15(?:[^\"\']*)?', 'offlineCache.js?v=15-inspector2', t)
if n < 1:
    raise SystemExit('offlineCache script query not found')
t2 = t2.replace('20261001-pwa-offline-cache-v15', '20261001-pwa-offline-cache-v15-inspector2', 1)
idx.write_text(t2)
