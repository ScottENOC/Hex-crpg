import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, text) {
  fs.writeFileSync(file, text);
  console.log(`patched ${file}`);
}

function replaceExact(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Could not find patch target: ${label}`);
  return text.replace(search, replacement);
}

function replaceRegex(text, regex, replacement, label) {
  if (!regex.test(text)) throw new Error(`Could not find regex patch target: ${label}`);
  return text.replace(regex, replacement);
}

// ---- offlineCache.js -------------------------------------------------------
{
  const file = 'offlineCache.js';
  let text = read(file);

  text = replaceExact(text, "    const VERSION = '1';", "    const VERSION = '2';", 'offline cache version');
  text = replaceExact(text, "    const SW_URL = 'offlineServiceWorker.js?v=1';", "    const SW_URL = 'offlineServiceWorker.js?v=2';", 'service worker URL');
  text = replaceExact(text, "    const WORKER_TIMEOUT_MS = 15 * 60 * 1000;", "    const WORKER_STALL_TIMEOUT_MS = 45000;", 'worker timeout');

  text = replaceExact(
    text,
    "    let registrationPromise = null;\n    let syncPromise = null;",
    `    let registrationPromise = null;\n    let syncPromise = null;\n    let resolveReadyBarrier;\n    let readyBarrierResolved = false;\n    const readyBarrier = new Promise(resolve => { resolveReadyBarrier = resolve; });\n    window.__hexOfflineReady = readyBarrier;\n\n    function releaseReadyBarrier(result) {\n        if (readyBarrierResolved) return;\n        readyBarrierResolved = true;\n        window.__hexOfflineReadyResult = result || { complete: false, hasActiveCache: false };\n        resolveReadyBarrier(window.__hexOfflineReadyResult);\n    }`,
    'offline startup barrier',
  );

  text = replaceRegex(
    text,
    /    async function ensureRegistration\(\) \{[\s\S]*?\n    \}\n\n    function workerRequest/,
    `    async function waitForWorkerActivation(worker, timeout = 20000) {\n        if (!worker || worker.state === 'activated') return;\n        await new Promise((resolve, reject) => {\n            const timer = setTimeout(() => {\n                cleanup();\n                reject(Object.assign(new Error('The updated offline worker did not activate in time.'), { kind: 'worker-activation-timeout' }));\n            }, timeout);\n            const onState = () => {\n                if (worker.state === 'activated') { cleanup(); resolve(); }\n                else if (worker.state === 'redundant') {\n                    cleanup();\n                    reject(Object.assign(new Error('The updated offline worker became redundant before activation.'), { kind: 'worker-redundant' }));\n                }\n            };\n            const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', onState); };\n            worker.addEventListener('statechange', onState);\n            onState();\n        });\n    }\n\n    async function ensureRegistration() {\n        if (!supported) {\n            const error = new Error('Offline app storage is not available in this browser/context.');\n            error.kind = 'unsupported';\n            throw error;\n        }\n        if (!registrationPromise) {\n            registrationPromise = (async () => {\n                const registration = await navigator.serviceWorker.register(SW_URL, {\n                    scope: './',\n                    updateViaCache: 'none',\n                });\n                try { await registration.update(); } catch (error) {\n                    console.warn('Service worker update check failed; existing worker can still be used.', error);\n                }\n\n                const candidate = registration.installing || registration.waiting;\n                if (candidate) await waitForWorkerActivation(candidate);\n                if (!registration.active) await navigator.serviceWorker.ready;\n\n                const activeUrl = registration.active?.scriptURL || '';\n                if (!registration.active || !activeUrl.includes('offlineServiceWorker.js') || !activeUrl.includes('v=2')) {\n                    const error = new Error('The v2 offline worker is not active yet.');\n                    error.kind = 'worker-version';\n                    throw error;\n                }\n                return registration;\n            })().catch(error => {\n                registrationPromise = null;\n                throw error;\n            });\n        }\n        return registrationPromise;\n    }\n\n    function workerRequest`,
    'service-worker registration',
  );

  text = replaceRegex(
    text,
    /    function workerRequest\(worker, message, \{ timeout = 30000, onProgress = null \} = \{\}\) \{[\s\S]*?\n    \}\n\n    async function getWorkerStatus/,
    `    function workerRequest(worker, message, { timeout = WORKER_STALL_TIMEOUT_MS, onProgress = null } = {}) {\n        return new Promise((resolve, reject) => {\n            if (!worker) {\n                reject(Object.assign(new Error('No active offline worker is available.'), { kind: 'worker-missing' }));\n                return;\n            }\n            const channel = new MessageChannel();\n            let settled = false;\n            let timer = null;\n\n            const close = () => {\n                if (timer) clearTimeout(timer);\n                channel.port1.close();\n            };\n            const armStallTimer = () => {\n                if (timer) clearTimeout(timer);\n                timer = setTimeout(() => {\n                    if (settled) return;\n                    settled = true;\n                    close();\n                    reject(Object.assign(new Error('The local-cache worker made no progress for 45 seconds.'), { kind: 'worker-stalled' }));\n                }, timeout);\n            };\n\n            channel.port1.onmessage = event => {\n                const data = event.data || {};\n                if (data.type === 'progress') {\n                    armStallTimer();\n                    if (typeof onProgress === 'function') onProgress(data);\n                    return;\n                }\n                if (data.type !== 'result' && data.type !== 'error') return;\n                if (settled) return;\n                settled = true;\n                close();\n                if (data.type === 'error') {\n                    const error = new Error(data.message || 'Offline worker failed.');\n                    error.kind = data.kind || 'worker';\n                    reject(error);\n                } else {\n                    resolve(data.result || {});\n                }\n            };\n\n            armStallTimer();\n            worker.postMessage(message, [channel.port2]);\n        });\n    }\n\n    async function getWorkerStatus`,
    'worker request watchdog',
  );

  text = replaceExact(text, '            timeout: WORKER_TIMEOUT_MS,', '            timeout: WORKER_STALL_TIMEOUT_MS,', 'worker cache timeout usage');

  text = replaceExact(
    text,
    '    async function syncInternal() {',
    `    function isStandaloneWebApp() {\n        return window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;\n    }\n\n    async function storageDiagnostic() {\n        const mode = isStandaloneWebApp() ? 'Home Screen app' : 'Safari tab';\n        if (!navigator.storage?.estimate) return { message: \`${'${mode}'} · iOS storage estimate unavailable\` };\n        try {\n            const estimate = await navigator.storage.estimate();\n            let persisted = false;\n            try { persisted = Boolean(await navigator.storage.persisted?.()); } catch (_) {}\n            if (isStandaloneWebApp() && !persisted && navigator.storage.persist) {\n                try { persisted = Boolean(await navigator.storage.persist()); } catch (_) {}\n            }\n            const quota = Number(estimate?.quota) || 0;\n            const usage = Number(estimate?.usage) || 0;\n            const available = Math.max(0, quota - usage);\n            return {\n                quota, usage, available, persisted,\n                message: \`${'${mode}'} · ${'${formatBytes(available)}'} available locally${'${persisted ? \' · persistent storage\' : \'\'}'}\`,\n            };\n        } catch (error) {\n            return { message: \`${'${mode}'} · storage check failed: ${'${error?.message || error}'}\` };\n        }\n    }\n\n    async function syncInternal() {`,
    'storage diagnostics helpers',
  );

  text = replaceExact(
    text,
    "        emit({ phase: 'registering', message: 'Starting local storage…' });\n        let registration;",
    `        emit({ phase: 'registering', stored: 0, processed: 0, total: 0, message: 'Starting local storage…' });\n        const storage = await storageDiagnostic();\n        emit({ phase: 'storage-check', stored: 0, processed: 0, total: 0, message: storage.message });\n        let registration;`,
    'storage check during sync',
  );

  text = replaceExact(
    text,
    "        version: VERSION,\n        supported,\n        sync,",
    "        version: VERSION,\n        supported,\n        ready: readyBarrier,\n        sync,",
    'public ready promise',
  );

  text = replaceExact(
    text,
    "        if (progress.phase === 'checking') title.textContent = 'Checking local game copy…';",
    "        if (progress.phase === 'storage-check') title.textContent = 'Checking iPhone storage…';\n        else if (progress.phase === 'checking') title.textContent = 'Checking local game copy…';",
    'storage-check title',
  );

  text = replaceExact(
    text,
    "            const parts = [];\n            if (progress.downloaded)",
    "            const parts = [];\n            if (progress.message) parts.push(progress.message);\n            if (progress.downloaded)",
    'progress detail message',
  );

  text = replaceExact(
    text,
    "        detail.textContent = result.quotaFailure\n            ? 'The browser reported that local storage is full or its web-app storage quota was reached.'\n            : 'Automatic retries have already been attempted.';",
    "        detail.textContent = result.quotaFailure\n            ? 'The browser reported that local storage is full or its web-app storage quota was reached.'\n            : result.storageFailure\n                ? 'iOS allowed the web app to open, but a test write to local Cache Storage failed.'\n                : 'Automatic retries have already been attempted.';",
    'storage failure explanation',
  );

  text = replaceExact(
    text,
    "                if (action === 'continue') {\n                    gate.hidden = true;\n                    document.body.classList.remove('hex-offline-preparing');\n                    return;\n                }",
    "                if (action === 'continue') {\n                    releaseReadyBarrier({ ...result, continuedOnline: true });\n                    gate.hidden = true;\n                    document.body.classList.remove('hex-offline-preparing');\n                    return;\n                }",
    'continue barrier release',
  );

  text = replaceExact(text, "                const reloadKey = 'hex-offline-reloaded-commit-v1';", "                const reloadKey = 'hex-offline-reloaded-commit-v2';", 'reload key');

  text = replaceExact(
    text,
    "            gate.hidden = true;\n            document.body.classList.remove('hex-offline-preparing');\n        } catch (error) {",
    "            releaseReadyBarrier(result);\n            gate.hidden = true;\n            document.body.classList.remove('hex-offline-preparing');\n        } catch (error) {",
    'success barrier release',
  );

  text = replaceExact(
    text,
    "                else {\n                    gate.hidden = true;\n                    document.body.classList.remove('hex-offline-preparing');\n                }",
    "                else {\n                    releaseReadyBarrier({ ...result, continuedOnline: true });\n                    gate.hidden = true;\n                    document.body.classList.remove('hex-offline-preparing');\n                }",
    'catch continue barrier release',
  );

  write(file, text);
}

// ---- offlineServiceWorker.js ----------------------------------------------
{
  const file = 'offlineServiceWorker.js';
  let text = read(file);

  text = replaceExact(text, "const SW_VERSION = '1';", "const SW_VERSION = '2';", 'service worker version');
  text = replaceExact(
    text,
    "const RETRY_DELAYS_MS = [250, 900, 2200];",
    "const RETRY_DELAYS_MS = [250, 900, 2200];\nconst FILE_FETCH_TIMEOUT_MS = 15000;",
    'file fetch timeout constant',
  );

  text = replaceRegex(
    text,
    /async function fetchAndVerify\(url, file, source\) \{[\s\S]*?\n\}\n\nasync function downloadVerifiedFile/,
    `async function fetchAndVerify(url, file, source) {\n    let response;\n    const controller = new AbortController();\n    const timer = setTimeout(() => controller.abort(), FILE_FETCH_TIMEOUT_MS);\n    try {\n        const sameOrigin = new URL(url).origin === new URL(SCOPE_URL).origin;\n        response = await fetch(url, {\n            cache: 'no-store',\n            credentials: sameOrigin ? 'same-origin' : 'omit',\n            signal: controller.signal,\n        });\n    } catch (error) {\n        if (error?.name === 'AbortError') {\n            throw makeFailure('network-timeout', \`${'${source}'} timed out after ${'${Math.round(FILE_FETCH_TIMEOUT_MS / 1000)}'} seconds.\`, { source });\n        }\n        throw makeFailure(self.navigator?.onLine === false ? 'offline' : 'network', \`${'${source}'} could not be reached.\`, { source });\n    } finally {\n        clearTimeout(timer);\n    }\n    if (!response.ok) {\n        throw makeFailure(response.status === 404 ? 'missing' : 'http', \`${'${source}'} returned HTTP ${'${response.status}'}.\`, {\n            source,\n            status: response.status,\n        });\n    }\n    const bytes = await response.arrayBuffer();\n    const actualSha = await gitBlobSha(bytes);\n    if (file.sha && actualSha !== file.sha) {\n        throw makeFailure(source === 'GitHub Pages' ? 'stale' : 'integrity',\n            \`${'${source}'} returned a different/older copy (expected ${'${file.sha.slice(0, 8)}'}, got ${'${actualSha.slice(0, 8)}'}).\`,\n            { source });\n    }\n    return responseFromBytes(bytes, file);\n}\n\nasync function downloadVerifiedFile`,
    'timed file fetch',
  );

  text = replaceExact(
    text,
    "    const sources = [\n        { name: 'GitHub raw', url: rawUrl(context.owner, context.repo, context.commit, file.path), attempts: RAW_ATTEMPTS },\n        { name: 'GitHub Pages', url: localUrl(file.path), attempts: PAGE_ATTEMPTS },\n    ];",
    "    const sources = [\n        // Prefer same-origin Pages on iOS; SHA verification catches stale deployments\n        // and then falls back to the exact commit on raw.githubusercontent.com.\n        { name: 'GitHub Pages', url: localUrl(file.path), attempts: PAGE_ATTEMPTS },\n        { name: 'GitHub raw', url: rawUrl(context.owner, context.repo, context.commit, file.path), attempts: RAW_ATTEMPTS },\n    ];",
    'download source order',
  );

  text = replaceExact(
    text,
    'async function cacheGame(message, port) {',
    `async function assertCacheStorageWorks() {\n    const probeName = \`hex-game-storage-probe-v${'${SW_VERSION}'}\`;\n    const probeUrl = new URL('__hex_offline_meta__/storage-probe', SCOPE_URL).href;\n    try {\n        const cache = await caches.open(probeName);\n        await cache.put(probeUrl, new Response('ok', { headers: { 'Content-Type': 'text/plain' } }));\n        const response = await cache.match(probeUrl);\n        if (!response || await response.text() !== 'ok') {\n            throw makeFailure('storage', 'A test file was written but could not be read back from iOS Cache Storage.');\n        }\n    } catch (error) {\n        if (error?.kind) throw error;\n        if (error?.name === 'QuotaExceededError') throw makeFailure('quota', 'iOS reported that local web-app storage is full.');\n        throw makeFailure('storage', \`iOS could not write to local Cache Storage: ${'${error?.message || error}'}\`);\n    } finally {\n        try { await caches.delete(probeName); } catch (_) {}\n    }\n}\n\nasync function cleanupLegacyCaches() {\n    const names = await caches.keys();\n    await Promise.all(names\n        .filter(name => name === 'hex-game-meta-v1' || name.startsWith('hex-game-v1-'))\n        .map(name => caches.delete(name)));\n}\n\nasync function cacheGame(message, port) {`,
    'cache storage probe',
  );

  text = replaceExact(
    text,
    "    if (!/^[0-9a-f]{40}$/i.test(commit) || !owner || !repo || !files.length) {\n        port.postMessage({ type: 'error', kind: 'bad-request', message: 'Offline cache received an invalid commit or file list.' });\n        return;\n    }\n\n    const before = await statusResult();",
    `    if (!/^[0-9a-f]{40}$/i.test(commit) || !owner || !repo || !files.length) {\n        port.postMessage({ type: 'error', kind: 'bad-request', message: 'Offline cache received an invalid commit or file list.' });\n        return;\n    }\n\n    const diagnosticTotalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);\n    port.postMessage({\n        type: 'progress', phase: 'storage-check', current: 'Testing a local Cache Storage write…',\n        processed: 0, stored: 0, total: files.length, downloaded: 0, reused: 0, retried: 0, failed: 0,\n        totalBytes: diagnosticTotalBytes, message: 'Checking that iOS can save game files locally…',\n    });\n    try {\n        await assertCacheStorageWorks();\n    } catch (error) {\n        port.postMessage({\n            type: 'result',\n            result: {\n                complete: false, storageFailure: true, quotaFailure: error?.kind === 'quota',\n                failures: [serialiseFailure(error, '(local storage test)')], stored: 0, total: files.length,\n                downloaded: 0, reused: 0, retried: 0, activeCommit: null,\n            },\n        });\n        return;\n    }\n\n    const before = await statusResult();`,
    'storage probe invocation',
  );

  text = replaceExact(
    text,
    "        const result = await downloadVerifiedFile(file, { owner, repo, commit });",
    "        sendProgress(file.path, 'storing', `Downloading ${file.path}…`);\n        const result = await downloadVerifiedFile(file, { owner, repo, commit });",
    'per-file progress before download',
  );

  text = replaceExact(
    text,
    "    await writeActiveMeta(nextMeta);\n    await cleanupStaleGameCaches([targetCacheName]);",
    "    await writeActiveMeta(nextMeta);\n    await cleanupStaleGameCaches([targetCacheName]);\n    await cleanupLegacyCaches();",
    'legacy cache cleanup',
  );

  write(file, text);
}

// ---- assetLoadScheduler.js -------------------------------------------------
{
  const file = 'assetLoadScheduler.js';
  let text = read(file);

  text = replaceExact(text, "    const SCHEDULER_VERSION = '6';", "    const SCHEDULER_VERSION = '7';", 'scheduler version');
  text = replaceExact(text, " || 'asset-manager-v6';", " || 'asset-manager-v7';", 'scheduler build fallback');

  text = replaceExact(
    text,
    "    const managerRecords = new Map();\n    const domBindingTokens = new WeakMap();",
    `    const managerRecords = new Map();\n    const domBindingTokens = new WeakMap();\n    let offlineStartupPending = Boolean(window.__hexOfflineReady && typeof window.__hexOfflineReady.then === 'function');\n    if (offlineStartupPending) {\n        window.__hexOfflineReady.finally(() => {\n            offlineStartupPending = false;\n            schedulePump();\n        });\n    }`,
    'scheduler offline barrier state',
  );

  text = replaceExact(
    text,
    "    function mayStartNow(path) {\n        if (phase === 'game') return true;",
    "    function mayStartNow(path) {\n        if (offlineStartupPending) return false;\n        if (phase === 'game') return true;",
    'prevent early image starts',
  );

  text = replaceExact(
    text,
    "        if (immediate || mayStartNow(record.path)) start();\n        else record.status='deferred';",
    "        if ((immediate && !offlineStartupPending) || mayStartNow(record.path)) start();\n        else record.status='deferred';",
    'respect offline barrier for immediate loads',
  );

  text = replaceExact(
    text,
    "        const deferredArt = [...managerRecords.values()].filter(record=>record.status==='deferred').map(record=>record.path).filter(path=>path?.startsWith('images/'));",
    "        const localCopyReady=Boolean(window.__hexOfflineReadyResult?.complete && window.__hexOfflineReadyResult?.hasActiveCache);\n        const deferredArt = localCopyReady ? [] : [...managerRecords.values()].filter(record=>record.status==='deferred').map(record=>record.path).filter(path=>path?.startsWith('images/'));",
    'avoid re-preloading whole local art library',
  );

  text = replaceExact(
    text,
    "        overlay.querySelector('.hex-loading-count').textContent=`Loaded ${loaded} / ${total} art assets`;",
    "        const verb=window.__hexOfflineReadyResult?.hasActiveCache?'Prepared':'Loaded';\n        overlay.querySelector('.hex-loading-count').textContent=`${verb} ${loaded} / ${total} art assets`;",
    'local art wording',
  );

  text = replaceExact(
    text,
    "    async function loadCreator() {\n        try {\n            await runGate('Loading character creator…',creatorManifest());",
    "    async function loadCreator() {\n        try {\n            if (window.__hexOfflineReady) await window.__hexOfflineReady;\n            await runGate('Loading character creator…',creatorManifest());",
    'creator waits for offline cache',
  );

  text = replaceExact(
    text,
    "    async function loadGameAndStart() {\n        if (startGateRunning || phase==='game') return;",
    "    async function loadGameAndStart() {\n        if (window.__hexOfflineReady) await window.__hexOfflineReady;\n        if (startGateRunning || phase==='game') return;",
    'game waits for offline cache',
  );

  write(file, text);
}

console.log('Offline/PWA v2 patch complete.');
