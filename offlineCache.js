// offlineCache.js
// Keeps a verified, complete copy of the development build in the browser's
// Cache Storage. Updates are staged in a separate cache and only become active
// once every runtime file has been fetched and verified against its Git blob SHA.
(() => {
    'use strict';

    const VERSION = '1';
    const OWNER = 'ScottENOC';
    const REPO = 'Hex-crpg';
    const BRANCH = 'development';
    const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
    const SW_URL = 'offlineServiceWorker.js?v=1';
    const BRANCH_CACHE_MS = 15000;
    const REQUEST_TIMEOUT_MS = 25000;
    const WORKER_TIMEOUT_MS = 15 * 60 * 1000;
    const AUTO_RETRY_DELAY_MS = 1200;

    const supported = location.protocol === 'https:' && 'serviceWorker' in navigator && 'caches' in window;
    const listeners = new Set();
    let registrationPromise = null;
    let syncPromise = null;
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

    async function ensureRegistration() {
        if (!supported) {
            const error = new Error('Offline app storage is not available in this browser/context.');
            error.kind = 'unsupported';
            throw error;
        }
        if (!registrationPromise) {
            registrationPromise = (async () => {
                const registration = await navigator.serviceWorker.register(SW_URL, {
                    scope: './',
                    updateViaCache: 'none',
                });
                try { await registration.update(); } catch (error) {
                    console.warn('Service worker update check failed; existing worker can still be used.', error);
                }
                return navigator.serviceWorker.ready;
            })();
        }
        return registrationPromise;
    }

    function workerRequest(worker, message, { timeout = 30000, onProgress = null } = {}) {
        return new Promise((resolve, reject) => {
            if (!worker) {
                reject(Object.assign(new Error('No active offline worker is available.'), { kind: 'worker-missing' }));
                return;
            }
            const channel = new MessageChannel();
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                channel.port1.close();
                reject(Object.assign(new Error('The local-cache worker stopped responding.'), { kind: 'worker-timeout' }));
            }, timeout);

            channel.port1.onmessage = event => {
                const data = event.data || {};
                if (data.type === 'progress') {
                    if (typeof onProgress === 'function') onProgress(data);
                    return;
                }
                if (data.type !== 'result' && data.type !== 'error') return;
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                channel.port1.close();
                if (data.type === 'error') {
                    const error = new Error(data.message || 'Offline worker failed.');
                    error.kind = data.kind || 'worker';
                    reject(error);
                } else {
                    resolve(data.result || {});
                }
            };

            worker.postMessage(message, [channel.port2]);
        });
    }

    async function getWorkerStatus(worker) {
        return workerRequest(worker, { type: 'HEX_CACHE_STATUS' }, { timeout: 30000 });
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
            timeout: WORKER_TIMEOUT_MS,
            onProgress: emitWorkerProgress,
        });
    }

    async function syncInternal() {
        emit({ phase: 'registering', message: 'Starting local storage…' });
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

        if (before.valid && before.activeCommit === commit) {
            emit({
                phase: 'ready',
                stored: before.fileCount || 0,
                processed: before.fileCount || 0,
                total: before.fileCount || 0,
                message: 'Local copy is already up to date.',
            });
            return {
                complete: true,
                upToDate: true,
                changed: false,
                commit,
                fileCount: before.fileCount || 0,
                hasActiveCache: true,
            };
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

        const repairedOrChanged = !before.valid || before.activeCommit !== commit;
        return {
            ...result,
            changed: Boolean(result.complete && repairedOrChanged),
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
            gate.innerHTML = '<div class="hex-offline-card"><h2 class="hex-offline-title">Preparing local game copy…</h2><p class="hex-offline-count">Starting…</p><div class="hex-offline-track"><div class="hex-offline-bar"></div></div><p class="hex-offline-detail"></p><div class="hex-offline-error" hidden></div><div class="hex-offline-actions"><button class="hex-offline-retry" hidden>Retry</button><button class="hex-offline-continue" hidden>Continue</button></div></div>';
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
        if (progress.phase === 'checking') title.textContent = 'Checking local game copy…';
        else if (progress.phase === 'recovering') title.textContent = 'Recovering failed downloads…';
        else if (progress.phase === 'ready') title.textContent = 'Local game copy ready';
        else title.textContent = 'Preparing local game copy…';

        if (progress.total > 0) {
            count.textContent = `Stored ${progress.stored || 0} / ${progress.total} files locally`;
            bar.style.width = `${Math.max(0, Math.min(100, Math.round((progress.stored || 0) * 100 / progress.total)))}%`;
            const parts = [];
            if (progress.downloaded) parts.push(`${progress.downloaded} downloaded`);
            if (progress.reused) parts.push(`${progress.reused} reused`);
            if (progress.retried) parts.push(`${progress.retried} retries`);
            if (progress.failed) parts.push(`${progress.failed} still failed`);
            if (progress.totalBytes) parts.push(formatBytes(progress.totalBytes));
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

    async function startup() {
        const gate = ensureGate();
        if (!gate) return;
        document.body.classList.add('hex-offline-preparing');
        gate.hidden = false;
        const unsubscribe = onProgress(progress => renderProgress(gate, progress));
        try {
            let result = await sync();
            while (!result.complete) {
                renderProgress(gate, status);
                const action = await waitForFailureAction(gate, result);
                if (action === 'continue') {
                    gate.hidden = true;
                    document.body.classList.remove('hex-offline-preparing');
                    return;
                }
                gate.querySelector('.hex-offline-error').hidden = true;
                emit({ phase: 'recovering', message: 'Retrying the local game copy…' });
                result = await sync({ force: true });
            }

            if (result.warning) {
                gate.querySelector('.hex-offline-title').textContent = 'Using local game copy';
                gate.querySelector('.hex-offline-count').textContent = 'The saved copy is ready.';
                gate.querySelector('.hex-offline-detail').textContent = result.warning.message;
                await sleep(1800);
            }

            if (result.changed && result.commit) {
                const reloadKey = 'hex-offline-reloaded-commit-v1';
                let alreadyReloaded = null;
                try { alreadyReloaded = sessionStorage.getItem(reloadKey); } catch (_) {}
                if (alreadyReloaded !== result.commit) {
                    try { sessionStorage.setItem(reloadKey, result.commit); } catch (_) {}
                    gate.querySelector('.hex-offline-title').textContent = 'Local copy ready';
                    gate.querySelector('.hex-offline-count').textContent = 'Restarting once so every game file comes from the phone…';
                    gate.querySelector('.hex-offline-bar').style.width = '100%';
                    await sleep(300);
                    location.reload();
                    return;
                }
            }

            gate.hidden = true;
            document.body.classList.remove('hex-offline-preparing');
        } catch (error) {
            console.error('Offline cache startup failed', error);
            const result = { complete: false, hasActiveCache: false, failures: [errorInfo(error, 'startup')] };
            await waitForFailureAction(gate, result).then(action => {
                if (action === 'retry') location.reload();
                else {
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
