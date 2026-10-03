// offlineCache.js
// Keeps a verified, complete copy of the development build in the browser's
// Cache Storage. Updates are staged in a separate cache and only become active
// once every runtime file has been fetched and verified against its Git blob SHA.
(() => {
    'use strict';

    const VERSION = '15';
    const OWNER = 'ScottENOC';
    const REPO = 'Hex-crpg';
    const BRANCH = 'development';
    const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
    const SW_URL = 'offlineServiceWorker.js?v=15';
    const BRANCH_CACHE_MS = 15000;
    const REQUEST_TIMEOUT_MS = 25000;
    const WORKER_STALL_TIMEOUT_MS = 45000;
    const STARTUP_WORKER_TIMEOUT_MS = 6000;
    const AUTO_RETRY_DELAY_MS = 1200;

    const supported = location.protocol === 'https:' && 'serviceWorker' in navigator && 'caches' in window;
    const reportedOfflineMisses = new Set();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data?.type !== 'HEX_OFFLINE_MISS') return;
            const path = String(event.data.path || '(unknown resource)');
            if (reportedOfflineMisses.has(path)) return;
            reportedOfflineMisses.add(path);
            console.warn('Offline local-copy miss:', path);
            try { window.dispatchEvent(new CustomEvent('hex-offline-resource-miss', { detail: { path } })); } catch (_) {}
            if (/^(?:images|audio)\//.test(path)) {
                const report = () => window.showMessage?.(`Offline local copy is missing: ${path}. Use Check for updates to repair it.`);
                if (typeof window.showMessage === 'function') report();
                else setTimeout(report, 1200);
            }
        });
    }
    const listeners = new Set();
    let registrationPromise = null;
    let syncPromise = null;
    let resolveReadyBarrier;
    let readyBarrierResolved = false;
    const readyBarrier = new Promise(resolve => { resolveReadyBarrier = resolve; });
    window.__hexOfflineReady = readyBarrier;

    function releaseReadyBarrier(result) {
        if (readyBarrierResolved) return;
        readyBarrierResolved = true;
        window.__hexOfflineReadyResult = result || { complete: false, hasActiveCache: false };
        resolveReadyBarrier(window.__hexOfflineReadyResult);
    }
    let status = {
        phase: 'idle',
        stored: 0,
        processed: 0,
        total: 0,
        downloaded: 0,
        reused: 0,
        retried: 0,
        failed: 0,
        totalBytes: 0,
        current: '',
        message: '',
        existingFileCount: 0,
        patchNew: 0,
        patchChanged: 0,
        patchRemoved: 0,
        patchUnchanged: 0,
        patchFinalCount: 0,
        patchTotal: 0,
    };

    function emit(patch) {
        status = { ...status, ...patch };
        for (const listener of listeners) {
            try { listener({ ...status }); } catch (error) { console.warn('Offline cache progress listener failed', error); }
        }
        try { window.dispatchEvent(new CustomEvent('hex-offline-cache-progress', { detail: { ...status } })); } catch (_) {}
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function withTimeout(promise, label, timeoutMs = STARTUP_WORKER_TIMEOUT_MS) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => {
                const error = new Error(`${label} timed out.`);
                error.kind = 'worker-timeout';
                reject(error);
            }, timeoutMs)),
        ]);
    }

    function formatBytes(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    function errorInfo(error, fallbackKind = 'unknown') {
        if (!error) return { kind: fallbackKind, message: 'Unknown error' };
        return {
            kind: error.kind || error.code || fallbackKind,
            message: error.message || String(error),
            status: error.status || null,
            resetAt: error.resetAt || null,
        };
    }

    async function fetchJsonWithRetries(url, label, attempts = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                const response = await fetch(url, {
                    cache: 'no-store',
                    headers: { Accept: 'application/vnd.github+json' },
                    signal: controller.signal,
                });
                if (response.ok) return await response.json();

                const remaining = response.headers.get('x-ratelimit-remaining');
                const resetSeconds = Number(response.headers.get('x-ratelimit-reset')) || 0;
                const resetAt = resetSeconds ? new Date(resetSeconds * 1000).toLocaleTimeString() : null;
                const error = new Error(
                    response.status === 403 && remaining === '0'
                        ? `GitHub update checks are temporarily rate-limited${resetAt ? ` until about ${resetAt}` : ''}.`
                        : `${label} returned HTTP ${response.status}.`
                );
                error.kind = response.status === 403 && remaining === '0' ? 'github-rate-limit' : 'github-http';
                error.status = response.status;
                error.resetAt = resetAt;
                throw error;
            } catch (error) {
                lastError = error;
                if (error?.name === 'AbortError') {
                    lastError = new Error(`${label} timed out.`);
                    lastError.kind = 'network-timeout';
                } else if (!error?.kind) {
                    error.kind = navigator.onLine === false ? 'offline' : 'network';
                }
                if (attempt < attempts) {
                    emit({
                        phase: 'recovering',
                        message: `${label} failed. Trying again (${attempt + 1}/${attempts})…`,
                    });
                    await sleep(attempt * 650);
                }
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastError || new Error(`${label} failed.`);
    }

    function readCachedBranchInfo() {
        try {
            const raw = sessionStorage.getItem('hex-offline-branch-info-v1');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.checkedAt || Date.now() - parsed.checkedAt > BRANCH_CACHE_MS) return null;
            return parsed.value || null;
        } catch (_) {
            return null;
        }
    }

    function writeCachedBranchInfo(value) {
        try {
            sessionStorage.setItem('hex-offline-branch-info-v1', JSON.stringify({ checkedAt: Date.now(), value }));
        } catch (_) {}
    }

    async function getBranchInfo() {
        const cached = readCachedBranchInfo();
        if (cached) return cached;
        const value = await fetchJsonWithRetries(`${API_BASE}/branches/${encodeURIComponent(BRANCH)}`, 'GitHub development-branch check');
        writeCachedBranchInfo(value);
        return value;
    }

    async function waitForWorkerActivation(worker, timeout = 20000) {
        if (!worker || worker.state === 'activated') return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(Object.assign(new Error('The updated offline worker did not activate in time.'), { kind: 'worker-activation-timeout' }));
            }, timeout);
            const onState = () => {
                if (worker.state === 'activated') { cleanup(); resolve(); }
                else if (worker.state === 'redundant') {
                    cleanup();
                    reject(Object.assign(new Error('The updated offline worker became redundant before activation.'), { kind: 'worker-redundant' }));
                }
            };
            const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', onState); };
            worker.addEventListener('statechange', onState);
            onState();
        });
    }

    async function ensureRegistration({ allowUpdate = false } = {}) {
        if (!supported) {
            const error = new Error('Offline app storage is not available in this browser/context.');
            error.kind = 'unsupported';
            throw error;
        }

        const buildRegistration = async () => {
            let registration = null;
            try {
                registration = await withTimeout(
                    navigator.serviceWorker.getRegistration('./'),
                    'Looking up the local game worker',
                    4000
                );
            } catch (error) {
                console.warn('Local worker lookup did not answer promptly.', error);
            }

            if (!registration) {
                registration = await withTimeout(
                    navigator.serviceWorker.register(SW_URL, { scope: './', updateViaCache: 'none' }),
                    'Starting the local game worker',
                    8000
                );
            }

            // Startup must never force a game-file update. However, when the user
            // explicitly presses Check for updates we must move the registration
            // to THIS build's service-worker URL. registration.update() is not
            // enough: it only re-fetches whatever script URL originally created
            // the registration (for example ?v=8), so old iOS installs could be
            // trapped on that worker forever even while offlineCache.js was newer.
            if (allowUpdate) {
                emit({ phase: 'checking', message: `Installing offline engine v${VERSION}…` });
                try {
                    registration = await withTimeout(
                        navigator.serviceWorker.register(SW_URL, { scope: './', updateViaCache: 'none' }),
                        `Installing offline engine v${VERSION}`,
                        10000
                    );
                } catch (error) {
                    console.warn(`Offline engine v${VERSION} registration timed out/failed; the existing worker can still be used.`, error);
                }
                const desired = [registration.installing, registration.waiting, registration.active]
                    .find(worker => worker?.scriptURL?.includes(`v=${VERSION}`));
                if (desired && desired.state !== 'activated') {
                    try { await waitForWorkerActivation(desired, 10000); }
                    catch (error) { console.warn(`Offline engine v${VERSION} did not activate promptly; keeping the current worker.`, error); }
                }
                // Refresh the registration object after activation so callers do
                // not accidentally message the old active worker from a stale
                // ServiceWorkerRegistration snapshot.
                try {
                    registration = await withTimeout(
                        navigator.serviceWorker.getRegistration('./'),
                        'Confirming the updated local game worker',
                        3000
                    ) || registration;
                } catch (_) {}
            }

            if (!registration.active && !navigator.serviceWorker.controller) {
                try {
                    registration = await withTimeout(
                        navigator.serviceWorker.ready,
                        'Waiting for the local game worker',
                        8000
                    );
                } catch (error) {
                    throw Object.assign(error, { kind: error.kind || 'worker-ready-timeout' });
                }
            }

            if (!registration?.active && !navigator.serviceWorker.controller) {
                const error = new Error('No active local game worker is available.');
                error.kind = 'worker-missing';
                throw error;
            }
            return registration;
        };

        if (allowUpdate) return buildRegistration();
        if (!registrationPromise) {
            registrationPromise = buildRegistration().catch(error => {
                registrationPromise = null;
                throw error;
            });
        }
        return registrationPromise;
    }

    function workerRequest(worker, message, { timeout = WORKER_STALL_TIMEOUT_MS, onProgress = null } = {}) {
        return new Promise((resolve, reject) => {
            if (!worker) {
                reject(Object.assign(new Error('No active offline worker is available.'), { kind: 'worker-missing' }));
                return;
            }
            const channel = new MessageChannel();
            let settled = false;
            let timer = null;

            const close = () => {
                if (timer) clearTimeout(timer);
                channel.port1.close();
            };
            const armStallTimer = () => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    close();
                    reject(Object.assign(new Error('The local-cache worker made no progress for 45 seconds.'), { kind: 'worker-stalled' }));
                }, timeout);
            };

            channel.port1.onmessage = event => {
                const data = event.data || {};
                if (data.type === 'progress') {
                    armStallTimer();
                    if (typeof onProgress === 'function') onProgress(data);
                    return;
                }
                if (data.type !== 'result' && data.type !== 'error') return;
                if (settled) return;
                settled = true;
                close();
                if (data.type === 'error') {
                    const error = new Error(data.message || 'Offline worker failed.');
                    error.kind = data.kind || 'worker';
                    reject(error);
                } else {
                    resolve(data.result || {});
                }
            };

            armStallTimer();
            worker.postMessage(message, [channel.port2]);
        });
    }

    async function getWorkerStatus(worker) {
        return workerRequest(worker, { type: 'HEX_CACHE_STATUS' }, { timeout: STARTUP_WORKER_TIMEOUT_MS });
    }

    function isRuntimeFile(entry) {
        if (!entry || entry.type !== 'blob' || !entry.path) return false;
        const path = entry.path;
        if (path === 'index.html' || path === 'manifest.webmanifest' || path === 'appstore/icon-1024.png') return true;
        if (/^(?:images|audio|vendor)\//.test(path)) return true;
        if (!path.includes('/') && /\.(?:js|css)$/i.test(path)) {
            return !new Set(['server.js', 'gameEngine.js_new', 'learnSkill_fixed.js']).has(path);
        }
        return false;
    }

    function runtimeFilesFromTree(tree) {
        return (tree || [])
            .filter(isRuntimeFile)
            .map(entry => ({ path: entry.path, sha: entry.sha, size: Number(entry.size) || 0 }))
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    function emitWorkerProgress(progress) {
        emit({
            phase: progress.phase || 'storing',
            stored: progress.stored || 0,
            processed: progress.processed || 0,
            total: progress.total || 0,
            downloaded: progress.downloaded || 0,
            reused: progress.reused || 0,
            retried: progress.retried || 0,
            failed: progress.failed || 0,
            totalBytes: progress.totalBytes || 0,
            current: progress.current || '',
            message: progress.message || '',
            firstInstall: Boolean(progress.firstInstall),
            existingFileCount: progress.existingFileCount || 0,
            patchNew: progress.patchNew || 0,
            patchChanged: progress.patchChanged || 0,
            patchRemoved: progress.patchRemoved || 0,
            patchUnchanged: progress.patchUnchanged || 0,
            patchFinalCount: progress.patchFinalCount || 0,
            patchTotal: progress.patchTotal || progress.total || 0,
        });
    }

    async function runWorkerCache(worker, commit, files) {
        return workerRequest(worker, {
            type: 'HEX_CACHE_GAME',
            commit,
            branch: BRANCH,
            owner: OWNER,
            repo: REPO,
            files,
        }, {
            timeout: WORKER_STALL_TIMEOUT_MS,
            onProgress: emitWorkerProgress,
        });
    }

    function isStandaloneWebApp() {
        return window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
    }

    async function cleanupSafariOfflineControl() {
        // Normal Safari should remain a plain website. Its storage context is
        // separate from an installed Home Screen web app, so clearing Hex
        // service-worker state here does not delete the installed app copy.
        try {
            const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
            await Promise.all(registrations.map(registration => registration.unregister()));
        } catch (error) {
            console.warn('Could not unregister old Safari service worker', error);
        }
        try {
            const names = await caches.keys();
            await Promise.all(names
                .filter(name => name.startsWith('hex-game-'))
                .map(name => caches.delete(name)));
        } catch (error) {
            console.warn('Could not clear old Safari Hex caches', error);
        }
    }

    async function storageDiagnostic() {
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

    async function syncInternal() {
        // Check an existing complete cache before any disk-space diagnostic.
        emit({ phase: 'checking', stored: 0, processed: 0, total: 0, message: 'Checking local game copy…' });
        let registration;
        try {
            registration = await ensureRegistration({ allowUpdate: true });
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

        emit({ phase: 'checking', message: 'Checking the development branch for changes…' });
        let branchInfo;
        try {
            branchInfo = await getBranchInfo();
        } catch (error) {
            if (before.valid && before.activeCommit) {
                emit({ phase: 'ready', message: `Using the saved local copy. Update check failed: ${error.message}` });
                return {
                    complete: true,
                    usingExisting: true,
                    warning: errorInfo(error, 'update-check'),
                    commit: before.activeCommit,
                    fileCount: before.fileCount || 0,
                    hasActiveCache: true,
                };
            }
            return { complete: false, failures: [errorInfo(error, 'update-check')], hasActiveCache: false };
        }

        const commit = branchInfo?.commit?.sha;
        const treeSha = branchInfo?.commit?.commit?.tree?.sha;
        if (!commit || !treeSha) {
            const error = Object.assign(new Error('GitHub returned branch information without a commit/tree SHA.'), { kind: 'github-data' });
            return { complete: false, failures: [errorInfo(error)], hasActiveCache: Boolean(before.valid) };
        }

        // Do not short-circuit merely because the commit SHA matches. Explicit
        // Check for updates also verifies every cached response against the
        // manifest and repairs holes/stale entries. Existing healthy files are
        // reused in place, so this is cheap and does not duplicate the game.
        if (before.valid && before.activeCommit === commit) {
            emit({ phase: 'checking', message: 'Build is current. Verifying the local game files…' });
        }

        // A valid existing copy does not need another storage-capacity probe.
        // The incremental repair only stages genuinely missing/changed files.
        if (!before.valid) {
            const storage = await storageDiagnostic();
            emit({ phase: 'storage-check', message: storage.message });
        }
        emit({ phase: 'listing', message: 'Getting the list of game files…' });
        let treeResult;
        try {
            treeResult = await fetchJsonWithRetries(`${API_BASE}/git/trees/${treeSha}?recursive=1`, 'GitHub game-file list');
        } catch (error) {
            return { complete: false, failures: [errorInfo(error, 'file-list')], hasActiveCache: Boolean(before.valid), activeCommit: before.activeCommit || null };
        }

        if (treeResult?.truncated) {
            const error = Object.assign(new Error('GitHub returned an incomplete file list, so the game refused to build a partial local copy.'), { kind: 'file-list-truncated' });
            return { complete: false, failures: [errorInfo(error)], hasActiveCache: Boolean(before.valid), activeCommit: before.activeCommit || null };
        }

        const files = runtimeFilesFromTree(treeResult?.tree);
        const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
        if (!files.length) {
            const error = Object.assign(new Error('No runtime game files were found in the development branch.'), { kind: 'file-list-empty' });
            return { complete: false, failures: [errorInfo(error)], hasActiveCache: Boolean(before.valid), activeCommit: before.activeCommit || null };
        }

        emit({
            phase: 'storing',
            stored: 0,
            processed: 0,
            total: files.length,
            downloaded: 0,
            reused: 0,
            retried: 0,
            failed: 0,
            totalBytes,
            message: `Saving ${files.length} game files (${formatBytes(totalBytes)}) to this device…`,
        });

        let result;
        try {
            result = await runWorkerCache(worker, commit, files);
        } catch (error) {
            return { complete: false, failures: [errorInfo(error, 'worker')], hasActiveCache: Boolean(before.valid), activeCommit: before.activeCommit || null };
        }

        if (!result.complete && result.failures?.length && !result.quotaFailure && navigator.onLine !== false) {
            emit({
                phase: 'recovering',
                message: `${result.failures.length} file${result.failures.length === 1 ? '' : 's'} failed. Automatically trying the failed download(s) again…`,
            });
            await sleep(AUTO_RETRY_DELAY_MS);
            try {
                result = await runWorkerCache(worker, commit, files);
            } catch (error) {
                return { complete: false, failures: [errorInfo(error, 'worker')], hasActiveCache: Boolean(before.valid), activeCommit: before.activeCommit || null };
            }
        }

        const repairedOrChanged = !before.valid || before.activeCommit !== commit || (result.downloaded || 0) > 0 || before.healthy === false;
        return {
            ...result,
            changed: Boolean(result.complete && repairedOrChanged),
            upToDate: Boolean(result.complete && before.activeCommit === commit && (result.downloaded || 0) === 0),
            commit,
            hasActiveCache: Boolean(result.complete || before.valid),
            previousCommit: before.activeCommit || null,
        };
    }

    async function sync({ force = false } = {}) {
        if (syncPromise && !force) return syncPromise;
        if (syncPromise && force) {
            try { await syncPromise; } catch (_) {}
        }
        syncPromise = syncInternal();
        try {
            return await syncPromise;
        } finally {
            syncPromise = null;
        }
    }

    function onProgress(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        try { listener({ ...status }); } catch (_) {}
        return () => listeners.delete(listener);
    }

    window.hexOfflineCache = {
        version: VERSION,
        supported,
        ready: readyBarrier,
        sync,
        retry: () => sync({ force: true }),
        onProgress,
        formatBytes,
        get status() { return { ...status }; },
    };

    function ensureGate() {
        if (!document.body) return null;
        if (!document.getElementById('hex-offline-cache-style')) {
            const style = document.createElement('style');
            style.id = 'hex-offline-cache-style';
            style.textContent = `
                body.hex-offline-preparing #hex-loading-gate{z-index:2147483600!important}
                #hex-offline-gate{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(180deg,#151515,#090909);display:flex;align-items:center;justify-content:center;color:#f4ead2;font-family:Georgia,serif;padding:24px;box-sizing:border-box}
                #hex-offline-gate[hidden]{display:none!important}.hex-offline-card{width:min(560px,92vw);padding:28px;border:1px solid #8f7445;border-radius:10px;background:#201d19;box-shadow:0 18px 60px #000a;text-align:center}
                .hex-offline-title{font-size:1.55rem;margin:0 0 12px}.hex-offline-count{font-size:1rem;margin:0 0 12px;color:#d7c9a7}.hex-offline-track{height:12px;border-radius:999px;overflow:hidden;background:#0d0c0a;border:1px solid #5f5037}.hex-offline-bar{height:100%;width:0;background:#b89a5c;transition:width .12s linear}
                .hex-offline-detail{margin:12px 0 0;color:#bfb39b;font-size:.86rem;line-height:1.35;word-break:break-word}.hex-offline-error{margin-top:14px;color:#efb0a8;font-size:.88rem;line-height:1.4;text-align:left;white-space:pre-wrap;word-break:break-word}.hex-offline-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:12px}.hex-offline-actions button{padding:9px 16px;cursor:pointer}
            `;
            document.head.appendChild(style);
        }
        let gate = document.getElementById('hex-offline-gate');
        if (!gate) {
            gate = document.createElement('div');
            gate.id = 'hex-offline-gate';
            gate.innerHTML = '<div class="hex-offline-card"><h2 class="hex-offline-title">Preparing local game copy…</h2><p class="hex-offline-count">Starting…</p><div class="hex-offline-track"><div class="hex-offline-bar"></div></div><p class="hex-offline-detail"></p><div class="hex-offline-error" hidden></div><div class="hex-offline-actions"><button class="hex-offline-launch" hidden>Launch now</button><button class="hex-offline-update" hidden>Check for updates</button><button class="hex-offline-retry" hidden>Retry</button><button class="hex-offline-continue" hidden>Continue</button></div></div>';
            document.body.appendChild(gate);
        }
        return gate;
    }

    function renderProgress(gate, progress) {
        if (!gate) return;
        const title = gate.querySelector('.hex-offline-title');
        const count = gate.querySelector('.hex-offline-count');
        const bar = gate.querySelector('.hex-offline-bar');
        const detail = gate.querySelector('.hex-offline-detail');
        if (progress.phase === 'storage-check') title.textContent = 'Checking iPhone storage…';
        else if (progress.phase === 'checking') title.textContent = 'Checking local game copy…';
        else if (progress.phase === 'recovering') title.textContent = 'Recovering failed downloads…';
        else if (progress.phase === 'ready') title.textContent = 'Local game copy ready';
        else title.textContent = 'Preparing local game copy…';

        if (progress.total > 0) {
            const patchMode = progress.patchFinalCount > 0;
            if (patchMode && progress.existingFileCount) {
                count.textContent = `Patch: ${Math.min(progress.processed || 0, progress.total)} / ${progress.total} files · Final: ${progress.patchFinalCount} files`;
                bar.style.width = `${Math.max(0, Math.min(100, Math.round((progress.processed || 0) * 100 / progress.total)))}%`;
            } else if (progress.firstInstall) {
                count.textContent = 'purple monkey dishwasher';
                bar.style.width = `${Math.max(0, Math.min(100, Math.round((progress.stored || 0) * 100 / progress.total)))}%`;
            } else {
                count.textContent = `Stored ${progress.stored || 0} / ${progress.total} files locally`;
                bar.style.width = `${Math.max(0, Math.min(100, Math.round((progress.stored || 0) * 100 / progress.total)))}%`;
            }
            const parts = [];
            if (progress.message) parts.push(progress.message);
            if (patchMode && progress.existingFileCount) {
                parts.push(`Existing: ${progress.existingFileCount}`);
                parts.push(`+${progress.patchNew} new`);
                parts.push(`${progress.patchChanged} changed`);
                parts.push(`-${progress.patchRemoved} removed`);
                parts.push(`${progress.patchUnchanged} unchanged`);
            }
            if (progress.downloaded) parts.push(`${progress.downloaded} downloaded`);
            if (progress.reused) parts.push(`${progress.reused} reused`);
            if (progress.retried) parts.push(`${progress.retried} retries`);
            if (progress.failed) parts.push(`${progress.failed} still failed`);
            if (progress.current) parts.push(progress.current);
            detail.textContent = parts.join(' · ') || progress.message || '';
        } else {
            count.textContent = progress.message || 'Starting…';
            bar.style.width = progress.phase === 'ready' ? '100%' : '0%';
            detail.textContent = '';
        }
    }

    function failureText(failures) {
        const list = Array.isArray(failures) ? failures : [];
        const lines = list.slice(0, 6).map(failure => {
            const path = failure.path ? `${failure.path}: ` : '';
            return `• ${path}${failure.message || failure.kind || 'Unknown failure'}`;
        });
        if (list.length > 6) lines.push(`• …and ${list.length - 6} more`);
        return lines.join('\n');
    }

    async function waitForFailureAction(gate, result) {
        const errorBox = gate.querySelector('.hex-offline-error');
        const retry = gate.querySelector('.hex-offline-retry');
        const continueButton = gate.querySelector('.hex-offline-continue');
        const title = gate.querySelector('.hex-offline-title');
        const count = gate.querySelector('.hex-offline-count');
        const detail = gate.querySelector('.hex-offline-detail');

        title.textContent = result.hasActiveCache ? 'Update incomplete — old local copy is safe' : 'Could not finish the local copy';
        count.textContent = result.hasActiveCache
            ? 'The game has NOT switched to the incomplete update.'
            : 'Some files are not safely stored on this phone yet.';
        detail.textContent = result.quotaFailure
            ? 'The browser reported that local storage is full or its web-app storage quota was reached.'
            : result.storageFailure
                ? 'iOS allowed the web app to open, but a test write to local Cache Storage failed.'
                : 'Automatic retries have already been attempted.';
        errorBox.textContent = failureText(result.failures) || 'The local-copy update failed for an unknown reason.';
        errorBox.hidden = false;
        retry.hidden = false;
        continueButton.hidden = false;
        continueButton.textContent = result.hasActiveCache ? 'Use last complete local copy' : 'Continue online';

        return new Promise(resolve => {
            retry.onclick = () => resolve('retry');
            continueButton.onclick = () => resolve('continue');
        }).finally(() => {
            retry.onclick = null;
            continueButton.onclick = null;
            retry.hidden = true;
            continueButton.hidden = true;
            errorBox.hidden = true;
        });
    }

    async function readLocalCopyStatus() {
        emit({ phase: 'checking', stored: 0, processed: 0, total: 0, message: 'Checking local game copy…' });
        try {
            const registration = await ensureRegistration();
            const worker = registration.active || registration.waiting || registration.installing;
            const result = await getWorkerStatus(worker);
            let workerVersion = null;
            try { workerVersion = new URL(worker?.scriptURL || location.href).searchParams.get('v'); } catch (_) {}
            return { ...result, workerVersion, workerScriptURL: worker?.scriptURL || '' };
        } catch (error) {
            console.warn('Could not read local game copy', error);
            let hasWorker = Boolean(navigator.serviceWorker.controller);
            if (!hasWorker) {
                try {
                    const registration = await withTimeout(navigator.serviceWorker.getRegistration('./'), 'Double-checking the local worker', 1500);
                    hasWorker = Boolean(registration?.active);
                } catch (_) {}
            }
            return {
                valid: false,
                statusUnavailable: true,
                hasWorker,
                error: errorInfo(error, 'local-status'),
            };
        }
    }

    function launchLocalCopy(gate, result) {
        releaseReadyBarrier({
            complete: true,
            usingExisting: true,
            hasActiveCache: true,
            commit: result.activeCommit || result.commit || null,
            fileCount: result.fileCount || 0,
        });
        gate.hidden = true;
        document.body.classList.remove('hex-offline-preparing');
    }

    async function waitForLocalChoice(gate, local, message = 'Ready to play from the copy stored on this phone.') {
        const title = gate.querySelector('.hex-offline-title');
        const count = gate.querySelector('.hex-offline-count');
        const detail = gate.querySelector('.hex-offline-detail');
        const bar = gate.querySelector('.hex-offline-bar');
        const launchButton = gate.querySelector('.hex-offline-launch');
        const updateButton = gate.querySelector('.hex-offline-update');
        const errorBox = gate.querySelector('.hex-offline-error');

        title.textContent = 'Silverhart Saga';
        count.textContent = local.statusUnavailable || local.unverified
            ? 'Local game copy detected'
            : local.healthy === false
                ? `${local.availableCount || 0} / ${local.fileCount || 0} game files available locally`
                : `${local.fileCount || 0} game files available locally`;
        const choiceMessage = local.healthy === false
            ? `${local.missingCount || 0} local file${local.missingCount === 1 ? ' is' : 's are'} missing. Launch is available, but Check for updates will repair the saved copy.`
            : message;
        const engineText = local.workerVersion ? `Offline engine v${local.workerVersion}` : 'Offline engine version unknown';
        detail.textContent = `${choiceMessage} · ${engineText}`;
        bar.style.width = '100%';
        errorBox.hidden = true;
        launchButton.hidden = false;
        updateButton.hidden = false;
        updateButton.disabled = navigator.onLine === false;
        updateButton.textContent = navigator.onLine === false ? 'Check for updates (offline)' : 'Check for updates';

        return new Promise(resolve => {
            launchButton.onclick = () => resolve('launch');
            updateButton.onclick = () => resolve('update');
        }).finally(() => {
            launchButton.onclick = null;
            updateButton.onclick = null;
            launchButton.hidden = true;
            updateButton.hidden = true;
            updateButton.disabled = false;
        });
    }

    async function handleIncompleteResult(gate, result) {
        while (!result.complete) {
            renderProgress(gate, status);
            const action = await waitForFailureAction(gate, result);
            if (action === 'continue') return { continued: true, result };
            gate.querySelector('.hex-offline-error').hidden = true;
            emit({ phase: 'recovering', message: 'Retrying the local game copy…' });
            result = await sync({ force: true });
        }
        return { continued: false, result };
    }

    async function restartForUpdatedBuild(gate, result) {
        if (!result.changed || !result.commit) return false;
        const reloadKey = `hex-offline-reloaded-commit-v${VERSION}`;
        let alreadyReloaded = null;
        try { alreadyReloaded = sessionStorage.getItem(reloadKey); } catch (_) {}
        if (alreadyReloaded === result.commit) return false;
        try { sessionStorage.setItem(reloadKey, result.commit); } catch (_) {}
        gate.querySelector('.hex-offline-title').textContent = 'Update complete';
        gate.querySelector('.hex-offline-count').textContent = 'Restarting once so the updated game runs from the phone…';
        gate.querySelector('.hex-offline-bar').style.width = '100%';
        await sleep(300);
        location.reload();
        return true;
    }

    async function startup() {
        // Never let the offline/PWA layer block the ordinary Safari website.
        // Only the installed Home Screen app owns and uses the local game copy.
        if (!isStandaloneWebApp()) {
            releaseReadyBarrier({ complete: true, browserMode: true, hasActiveCache: false });
            Promise.resolve().then(cleanupSafariOfflineControl).catch(() => {});
            return;
        }

        const gate = ensureGate();
        if (!gate) return;
        document.body.classList.add('hex-offline-preparing');
        gate.hidden = false;
        const unsubscribe = onProgress(progress => renderProgress(gate, progress));
        try {
            let local = await readLocalCopyStatus();
            if (!local.valid && local.statusUnavailable && local.hasWorker) {
                local = { ...local, valid: true, unverified: true, fileCount: null };
            }

            // First install/repair: there is nothing safe to launch yet, so build
            // the local copy automatically once. Subsequent launches never do this.
            if (!local.valid) {
                let installResult = await sync({ force: true });
                const handled = await handleIncompleteResult(gate, installResult);
                installResult = handled.result;
                if (handled.continued) {
                    releaseReadyBarrier({ ...installResult, continuedOnline: true });
                    gate.hidden = true;
                    document.body.classList.remove('hex-offline-preparing');
                    return;
                }
                if (await restartForUpdatedBuild(gate, installResult)) return;
                local = await readLocalCopyStatus();
                if (!local.valid) throw Object.assign(new Error('The local copy completed but could not be reopened.'), { kind: 'local-status' });
            }

            let choiceMessage = local.unverified
                ? 'iOS did not answer the file-count check. You can still launch the installed copy, or use Check for updates to verify/repair it.'
                : local.healthy === false
                    ? `${local.missingCount || 0} cached game file${local.missingCount === 1 ? ' is' : 's are'} missing. Check for updates will repair only the missing/changed files.`
                    : local.recovered
                        ? 'Recovered the existing local game copy. Ready to launch.'
                        : 'Ready to play from the copy stored on this phone.';

            while (local.valid) {
                const choice = await waitForLocalChoice(gate, local, choiceMessage);
                if (choice === 'launch') {
                    launchLocalCopy(gate, local);
                    return;
                }

                // Explicit user action only: GitHub and storage checks happen here.
                emit({ phase: 'checking', message: 'Checking GitHub for a newer development build…' });
                let updateResult = await sync({ force: true });
                const handled = await handleIncompleteResult(gate, updateResult);
                updateResult = handled.result;
                if (handled.continued) {
                    launchLocalCopy(gate, local);
                    return;
                }
                if (await restartForUpdatedBuild(gate, updateResult)) return;

                local = await readLocalCopyStatus();
                if (!local.valid && local.statusUnavailable && local.hasWorker) {
                    local = { ...local, valid: true, unverified: true, fileCount: null };
                    choiceMessage = 'The update finished, but iOS did not answer the file-count check. Launch is still available.';
                    continue;
                }
                if (!local.valid) throw Object.assign(new Error('The saved local copy could not be reopened after the update check.'), { kind: 'local-status' });
                choiceMessage = updateResult.upToDate || updateResult.changed === false
                    ? 'No newer build found. Your local copy is ready.'
                    : 'Update check complete. Your local copy is ready.';
            }
        } catch (error) {
            console.error('Offline cache startup failed', error);
            const result = { complete: false, hasActiveCache: false, failures: [errorInfo(error, 'startup')] };
            await waitForFailureAction(gate, result).then(action => {
                if (action === 'retry') location.reload();
                else {
                    releaseReadyBarrier({ ...result, continuedOnline: true });
                    gate.hidden = true;
                    document.body.classList.remove('hex-offline-preparing');
                }
            });
        } finally {
            unsubscribe();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startup, { once: true });
    else startup();
})();
