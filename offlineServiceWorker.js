// offlineServiceWorker.js
// Atomic, integrity-checked local game cache for the development branch.
'use strict';

const SW_VERSION = '11';
const META_CACHE = `hex-game-meta-v${SW_VERSION}`;
const GAME_CACHE_PREFIX = `hex-game-v${SW_VERSION}-`;
const LEGACY_GAME_CACHE_PREFIXES = [];
const SCOPE_URL = self.registration.scope;
const META_KEY = new URL('__hex_offline_meta__/active.json', SCOPE_URL).href;
const MANIFEST_KEY = new URL('__hex_offline_meta__/manifest.json', SCOPE_URL).href;
const MAX_CONCURRENT_DOWNLOADS = 4;
const RAW_ATTEMPTS = 3;
const PAGE_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [250, 900, 2200];
const FILE_FETCH_TIMEOUT_MS = 15000;

let activeMetaMemo = null;

self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        activeMetaMemo = await readActiveMeta(true);
        await self.clients.claim();
    })());
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function encodedPath(path) {
    return String(path || '').split('/').map(part => encodeURIComponent(part)).join('/');
}

function localUrl(path) {
    return new URL(encodedPath(path), SCOPE_URL).href;
}

function rawUrl(owner, repo, commit, path) {
    return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(commit)}/${encodedPath(path)}`;
}

function cacheNameForCommit(commit) {
    return `${GAME_CACHE_PREFIX}${commit}`;
}

async function readJsonResponse(response) {
    if (!response) return null;
    try { return await response.json(); } catch (_) { return null; }
}

async function readActiveMeta(force = false) {
    if (activeMetaMemo && !force) return activeMetaMemo;
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(META_KEY);
    activeMetaMemo = await readJsonResponse(response);
    return activeMetaMemo;
}

async function writeActiveMeta(meta) {
    const cache = await caches.open(META_CACHE);
    await cache.put(META_KEY, new Response(JSON.stringify(meta), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    activeMetaMemo = meta;
}

async function readCacheManifest(cacheName) {
    if (!cacheName) return null;
    const cache = await caches.open(cacheName);
    return readJsonResponse(await cache.match(MANIFEST_KEY));
}

async function writeCacheManifest(cache, commit, files) {
    await cache.put(MANIFEST_KEY, new Response(JSON.stringify({
        version: SW_VERSION,
        commit,
        files: files.map(file => ({ path: file.path, sha: file.sha, size: file.size || 0 })),
    }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
}

async function inspectGameCache(cacheName, expectedCommit = null) {
    if (!cacheName) return null;
    try {
        const manifest = await readCacheManifest(cacheName);
        if (!manifest?.commit || !Array.isArray(manifest.files) || !manifest.files.length) return null;
        if (expectedCommit && manifest.commit !== expectedCommit) return null;
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        const expectedCount = manifest.files.length;

        // A raw entry count is not enough. An old cache can contain stale files
        // and still have 421 entries while a required sprite is absent. Compare
        // the actual cached request URLs with every path in the manifest.
        const cachedUrls = new Set(keys.map(request => {
            try {
                const url = new URL(request.url);
                url.search = '';
                url.hash = '';
                return url.href;
            } catch (_) {
                return request.url;
            }
        }));
        const missingPaths = manifest.files
            .filter(file => !cachedUrls.has(localUrl(file.path)))
            .map(file => file.path);
        const availableCount = Math.max(0, expectedCount - missingPaths.length);
        return {
            valid: availableCount > 0,
            healthy: missingPaths.length === 0,
            missingCount: missingPaths.length,
            missingPaths,
            availableCount,
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
        if (direct?.valid) return { ...direct, recovered: false };
    }

    // The large game cache may survive even if iOS loses/restores the tiny
    // metadata pointer separately. Recover from the real cache instead of
    // re-downloading every file.
    const names = await caches.keys();
    const candidates = names.filter(name =>
        (name.startsWith(GAME_CACHE_PREFIX) || /^hex-game-v\\d+-/.test(name) || LEGACY_GAME_CACHE_PREFIXES.some(prefix => name.startsWith(prefix))) &&
        !name.includes('-patch-')
    );
    for (const name of candidates) {
        const recovered = await inspectGameCache(name);
        if (!recovered?.valid) continue;
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

function mimeTypeFor(path) {
    const lower = String(path || '').toLowerCase();
    if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
    if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
    if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
    if (lower.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.woff2')) return 'font/woff2';
    if (lower.endsWith('.woff')) return 'font/woff';
    if (lower.endsWith('.ttf')) return 'font/ttf';
    return 'application/octet-stream';
}

function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function gitBlobSha(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
    const combined = new Uint8Array(prefix.byteLength + bytes.byteLength);
    combined.set(prefix, 0);
    combined.set(bytes, prefix.byteLength);
    return bytesToHex(await crypto.subtle.digest('SHA-1', combined));
}

function makeFailure(kind, message, extra = {}) {
    const error = new Error(message);
    error.kind = kind;
    Object.assign(error, extra);
    return error;
}

function serialiseFailure(error, path) {
    return {
        path,
        kind: error?.kind || error?.name || 'unknown',
        message: error?.message || String(error),
        status: error?.status || null,
        source: error?.source || null,
        attempts: error?.attempts || 0,
    };
}

function responseFromBytes(arrayBuffer, file) {
    const headers = new Headers();
    headers.set('Content-Type', mimeTypeFor(file.path));
    headers.set('Content-Length', String(arrayBuffer.byteLength));
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('X-Hex-Blob-Sha', file.sha || '');
    return new Response(arrayBuffer, { status: 200, headers });
}

async function fetchAndVerify(url, file, source) {
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FILE_FETCH_TIMEOUT_MS);
    try {
        const sameOrigin = new URL(url).origin === new URL(SCOPE_URL).origin;
        response = await fetch(url, {
            cache: 'no-store',
            credentials: sameOrigin ? 'same-origin' : 'omit',
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw makeFailure('network-timeout', `${source} timed out after ${Math.round(FILE_FETCH_TIMEOUT_MS / 1000)} seconds.`, { source });
        }
        throw makeFailure(self.navigator?.onLine === false ? 'offline' : 'network', `${source} could not be reached.`, { source });
    } finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        throw makeFailure(response.status === 404 ? 'missing' : 'http', `${source} returned HTTP ${response.status}.`, {
            source,
            status: response.status,
        });
    }
    const bytes = await response.arrayBuffer();
    const actualSha = await gitBlobSha(bytes);
    if (file.sha && actualSha !== file.sha) {
        throw makeFailure(source === 'GitHub Pages' ? 'stale' : 'integrity',
            `${source} returned a different/older copy (expected ${file.sha.slice(0, 8)}, got ${actualSha.slice(0, 8)}).`,
            { source });
    }
    return responseFromBytes(bytes, file);
}

async function downloadVerifiedFile(file, context) {
    const sources = [
        // Prefer same-origin Pages on iOS; SHA verification catches stale deployments
        // and then falls back to the exact commit on raw.githubusercontent.com.
        { name: 'GitHub Pages', url: localUrl(file.path), attempts: PAGE_ATTEMPTS },
        { name: 'GitHub raw', url: rawUrl(context.owner, context.repo, context.commit, file.path), attempts: RAW_ATTEMPTS },
    ];
    let attempts = 0;
    let lastError = null;

    for (const source of sources) {
        for (let attempt = 1; attempt <= source.attempts; attempt++) {
            attempts++;
            try {
                const response = await fetchAndVerify(source.url, file, source.name);
                return { response, attempts, source: source.name };
            } catch (error) {
                lastError = error;
                if (attempt < source.attempts) {
                    const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
                    await sleep(delay);
                }
            }
        }
    }

    if (lastError) {
        lastError.attempts = attempts;
        throw lastError;
    }
    throw makeFailure('network', 'All download sources failed.', { attempts });
}

async function cleanupStaleGameCaches(keepNames) {
    const keep = new Set(keepNames.filter(Boolean));
    const names = await caches.keys();
    await Promise.all(names
        .filter(name => name.startsWith(GAME_CACHE_PREFIX) && !keep.has(name))
        .map(name => caches.delete(name)));
}

async function assertCacheStorageWorks() {
    const probeName = `hex-game-storage-probe-v${SW_VERSION}`;
    const probeUrl = new URL('__hex_offline_meta__/storage-probe', SCOPE_URL).href;
    const storageStep = (promise, label, timeoutMs = 5000) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(makeFailure('storage-timeout', `${label} timed out.`)), timeoutMs)),
    ]);
    try {
        const cache = await storageStep(caches.open(probeName), 'Opening local Cache Storage');
        await storageStep(cache.put(probeUrl, new Response('ok', { headers: { 'Content-Type': 'text/plain' } })), 'Writing the local storage test');
        const response = await storageStep(cache.match(probeUrl), 'Reading the local storage test');
        if (!response || await storageStep(response.text(), 'Checking the local storage test') !== 'ok') {
            throw makeFailure('storage', 'A test file was written but could not be read back from iOS Cache Storage.');
        }
    } catch (error) {
        if (error?.kind) throw error;
        if (error?.name === 'QuotaExceededError') throw makeFailure('quota', 'iOS reported that local web-app storage is full.');
        throw makeFailure('storage', `iOS could not write to local Cache Storage: ${error?.message || error}`);
    } finally {
        try { await caches.delete(probeName); } catch (_) {}
    }
}

async function cleanupLegacyCaches(keepNames = []) {
    const keep = new Set((keepNames || []).filter(Boolean));
    const names = await caches.keys();
    await Promise.all(names
        .filter(name => !keep.has(name) && (
            /^hex-game-meta-v\\d+$/.test(name) || /^hex-game-v\\d+-/.test(name)
        ))
        .map(name => caches.delete(name)));
}

async function cacheGame(message, port) {
    const commit = String(message.commit || '');
    const owner = String(message.owner || '');
    const repo = String(message.repo || '');
    const files = Array.isArray(message.files) ? message.files.filter(file => file?.path && file?.sha) : [];
    if (!/^[0-9a-f]{40}$/i.test(commit) || !owner || !repo || !files.length) {
        port.postMessage({ type: 'error', kind: 'bad-request', message: 'Offline cache received an invalid commit or file list.' });
        return;
    }

    const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);

    // CacheStorage.keys() can be unusually slow on iOS. Keep the page-side
    // watchdog informed while that single scan is in progress so a slow local
    // database is not mistaken for a dead service worker.
    let before;
    const statusHeartbeat = () => port.postMessage({
        type: 'progress', phase: 'checking', current: 'Inspecting saved local files…',
        processed: 0, stored: 0, total: files.length, downloaded: 0, reused: 0, retried: 0, failed: 0,
        totalBytes, message: 'Inspecting the saved local game file list…',
    });
    statusHeartbeat();
    const statusHeartbeatTimer = setInterval(statusHeartbeat, 5000);
    try {
        before = await statusResult();
    } finally {
        clearInterval(statusHeartbeatTimer);
    }
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
    const missingActivePaths = new Set(before.missingPaths || []);
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

        // inspectGameCache() already performed the expensive exact-path scan.
        // If the manifest SHA matches and that exact URL was physically present,
        // the file is reusable. Do NOT call cache.match() again for every one of
        // ~421 unchanged files: concurrent CacheStorage reads can stall WebKit.
        if (activeCache && activeShaByPath.get(file.path) === file.sha && !missingActivePaths.has(file.path)) {
            reused++;
            stored++;
            return;
        }

        // Only changed/missing files reach the staging cache. Report this read
        // before asking iOS for it so the watchdog and the user can see progress.
        sendProgress(file.path, 'storing', `Checking repair staging for ${file.path}…`);
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
        sendProgress('', 'storing', 'Applying verified repaired files to the local copy…');
        const patchRequests = await patchCache.keys();
        for (const request of patchRequests) {
            sendProgress(decodeURIComponent(new URL(request.url).pathname.split('/').pop() || ''), 'storing', 'Applying verified repaired files…');
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
}

self.addEventListener('message', event => {
    const port = event.ports?.[0];
    if (!port) return;
    if (event.data?.type === 'HEX_CACHE_STATUS') {
        event.waitUntil((async () => {
            try {
                port.postMessage({ type: 'result', result: await statusResult() });
            } catch (error) {
                port.postMessage({ type: 'error', kind: 'status', message: error?.message || String(error) });
            }
        })());
        return;
    }
    if (event.data?.type === 'HEX_CACHE_GAME') {
        event.waitUntil(cacheGame(event.data, port).catch(error => {
            port.postMessage({ type: 'error', kind: error?.kind || 'worker', message: error?.message || String(error) });
        }));
    }
});

async function rangedResponse(request, response) {
    const range = request.headers.get('range');
    if (!range) return response;
    const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
    if (!match) return response;
    const blob = await response.blob();
    const size = blob.size;
    let start;
    let end;
    if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
    } else {
        const suffixLength = Number(match[2]);
        start = Math.max(0, size - suffixLength);
        end = size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    const headers = new Headers(response.headers);
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    headers.set('Accept-Ranges', 'bytes');
    return new Response(blob.slice(start, end + 1, response.headers.get('Content-Type') || undefined), {
        status: 206,
        statusText: 'Partial Content',
        headers,
    });
}

async function serveFromActiveCache(request) {
    const meta = await readActiveMeta();
    if (!meta?.cacheName) return null;
    const cache = await caches.open(meta.cacheName);
    let response = await cache.match(request, { ignoreSearch: true });
    if (!response && request.mode === 'navigate') {
        response = await cache.match(localUrl('index.html'), { ignoreSearch: true });
    }
    return response ? rangedResponse(request, response) : null;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    const scope = new URL(SCOPE_URL);
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

    const relativePath = decodeURIComponent(url.pathname.slice(scope.pathname.length));
    const bootstrapRequest = request.mode === 'navigate' ||
        relativePath === '' ||
        relativePath === 'index.html' ||
        relativePath === 'offlineCache.js' ||
        relativePath === 'manifest.webmanifest';

    event.respondWith((async () => {
        // Critical bootstrap files are network-first whenever a network exists.
        // Older workers used cache-first + ignoreSearch, which could return v3
        // JavaScript for a v4/v5 request and permanently trap Safari on old code.
        if (bootstrapRequest) {
            try {
                const network = await fetch(request, { cache: 'no-store' });
                if (network && network.ok) return network;
            } catch (_) {}
            const fallback = await serveFromActiveCache(request);
            if (fallback) return fallback;
            throw new Error(`Bootstrap request failed: ${request.url}`);
        }

        const cached = await serveFromActiveCache(request);
        if (cached) return cached;
        try {
            return await fetch(request);
        } catch (error) {
            // Never reject event.respondWith() merely because the phone is
            // offline. WebKit surfaces that as “FetchEvent.respondWith …
            // TypeError: Load failed”. A controlled 503 lets optional misses
            // (notably favicon/browser probes) fail harmlessly while making a
            // genuinely missing runtime file diagnosable as HTTP 503.
            try {
                const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                for (const client of clients) client.postMessage({ type: 'HEX_OFFLINE_MISS', path: relativePath || '(root)' });
            } catch (_) {}
            return new Response('Offline and this resource is not in the local game copy.', {
                status: 503,
                statusText: 'Offline',
                headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Hex-Offline-Miss': relativePath || '(root)' },
            });
        }
    })());
});
