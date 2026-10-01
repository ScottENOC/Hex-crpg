// offlineServiceWorker.js
// Atomic, integrity-checked local game cache for the development branch.
'use strict';

const SW_VERSION = '4';
const META_CACHE = `hex-game-meta-v${SW_VERSION}`;
const GAME_CACHE_PREFIX = `hex-game-v${SW_VERSION}-`;
const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];
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

async function cleanupLegacyCaches() {
    const names = await caches.keys();
    await Promise.all(names
        .filter(name => name === 'hex-game-meta-v1' || name === 'hex-game-meta-v2' || name === 'hex-game-meta-v3' || name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-') || name.startsWith('hex-game-v3-'))
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

    const diagnosticTotalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
    const before = await statusResult();
    if (!before.valid) {
        port.postMessage({
            type: 'progress', phase: 'storage-check', current: 'Testing a local Cache Storage write…',
            processed: 0, stored: 0, total: files.length, downloaded: 0, reused: 0, retried: 0, failed: 0,
            totalBytes: diagnosticTotalBytes, message: 'Checking that iOS can save game files locally…',
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
    const activeMeta = await readActiveMeta(true);
    const targetCacheName = cacheNameForCommit(commit);
    await cleanupStaleGameCaches([before.valid ? before.cacheName : null, targetCacheName]);
    const targetCache = await caches.open(targetCacheName);
    const oldCache = before.valid && before.cacheName && before.cacheName !== targetCacheName
        ? await caches.open(before.cacheName)
        : null;
    const oldManifest = oldCache ? await readCacheManifest(before.cacheName) : null;
    const oldShaByPath = new Map((oldManifest?.files || []).map(file => [file.path, file.sha]));

    const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
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
            type: 'progress',
            phase,
            current,
            processed,
            stored,
            total: files.length,
            downloaded,
            reused,
            retried,
            failed: failures.length,
            totalBytes,
            message: messageText,
        });
    };

    async function cacheOne(file) {
        const request = new Request(localUrl(file.path));
        const already = await targetCache.match(request, { ignoreSearch: true });
        if (already && already.headers.get('X-Hex-Blob-Sha') === file.sha) {
            reused++;
            stored++;
            return;
        }

        if (oldCache && oldShaByPath.get(file.path) === file.sha) {
            const oldResponse = await oldCache.match(request, { ignoreSearch: true });
            if (oldResponse) {
                await targetCache.put(request, oldResponse.clone());
                reused++;
                stored++;
                return;
            }
        }

        sendProgress(file.path, 'storing', `Downloading ${file.path}…`);
        const result = await downloadVerifiedFile(file, { owner, repo, commit });
        retried += Math.max(0, (result.attempts || 1) - 1);
        try {
            await targetCache.put(request, result.response.clone());
        } catch (error) {
            if (error?.name === 'QuotaExceededError') {
                throw makeFailure('quota', 'The browser ran out of local web-app storage while saving this file.');
            }
            throw makeFailure('storage', `The browser could not save the file locally: ${error?.message || error}`);
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

    sendProgress('', 'storing', `Saving ${files.length} files locally…`);
    await Promise.all(Array.from({ length: MAX_CONCURRENT_DOWNLOADS }, () => workerLoop()));

    if (quotaFailure) {
        if (!before.valid || before.cacheName !== targetCacheName) await caches.delete(targetCacheName);
        port.postMessage({
            type: 'result',
            result: {
                complete: false,
                quotaFailure: true,
                failures,
                stored,
                total: files.length,
                downloaded,
                reused,
                retried,
                activeCommit: before.activeCommit || null,
            },
        });
        return;
    }

    if (failures.length) {
        port.postMessage({
            type: 'result',
            result: {
                complete: false,
                failures,
                stored,
                total: files.length,
                downloaded,
                reused,
                retried,
                activeCommit: before.activeCommit || null,
            },
        });
        return;
    }

    await writeCacheManifest(targetCache, commit, files);
    const nextMeta = {
        version: SW_VERSION,
        cacheName: targetCacheName,
        commit,
        fileCount: files.length,
        totalBytes,
        updatedAt: Date.now(),
    };
    // This pointer is the atomic switch: it is written only after every file
    // exists in the staged cache and passed its Git SHA integrity check.
    await writeActiveMeta(nextMeta);
    await cleanupStaleGameCaches([targetCacheName]);
    await cleanupLegacyCaches();
    sendProgress('', 'ready', 'Local copy complete.');
    port.postMessage({
        type: 'result',
        result: {
            complete: true,
            failures: [],
            stored: files.length,
            total: files.length,
            downloaded,
            reused,
            retried,
            activeCommit: commit,
            fileCount: files.length,
            totalBytes,
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

    event.respondWith((async () => {
        const cached = await serveFromActiveCache(request);
        if (cached) return cached;
        try {
            return await fetch(request);
        } catch (error) {
            if (request.mode === 'navigate') {
                const fallback = await serveFromActiveCache(new Request(localUrl('index.html')));
                if (fallback) return fallback;
            }
            throw error;
        }
    })());
});
