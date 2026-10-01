import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

// 1. Solo games must never be blocked by the multiplayer disconnect overlay.
{
  const path = 'network.js';
  let s = read(path);
  s = replaceOnce(s,
`socket.on('disconnect', () => {
    document.getElementById('multiplayer-status').innerText = 'Status: Offline';
    document.getElementById('multiplayer-status').style.color = '#e74c3c';

    // Only show the overlay if we were actively in a game
    if (document.getElementById('gameContainer').style.display === 'flex') {
        showDisconnectOverlay('Connection lost — attempting to reconnect…', false);
    }
});

socket.on('connect_error', () => {
    // After multiple failed reconnect attempts, offer manual rejoin button
    if (document.getElementById('disconnect-overlay').style.display === 'flex') {
        showDisconnectOverlay('Unable to reach server. Check your connection.', !!window.multiplayer.roomCode);
    }
});`,
`socket.on('disconnect', () => {
    document.getElementById('multiplayer-status').innerText = 'Status: Offline';
    document.getElementById('multiplayer-status').style.color = '#e74c3c';

    // A solo game has no server dependency. Losing internet must not freeze it
    // behind the multiplayer reconnect overlay. Only an actual joined/hosted
    // room needs to wait for the multiplayer server.
    const inMultiplayerSession = Boolean(window.multiplayer?.roomCode);
    if (inMultiplayerSession && document.getElementById('gameContainer')?.style.display === 'flex') {
        showDisconnectOverlay('Connection lost — attempting to reconnect…', false);
    } else {
        hideDisconnectOverlay();
    }
});

socket.on('connect_error', () => {
    // Socket.IO may be trying to reconnect in the background even in solo play.
    // That is harmless and must never surface as a blocking game overlay.
    if (!window.multiplayer?.roomCode) {
        hideDisconnectOverlay();
        return;
    }
    if (document.getElementById('disconnect-overlay')?.style.display === 'flex') {
        showDisconnectOverlay('Unable to reach server. Check your connection.', true);
    }
});`, 'network disconnect handlers');
  write(path, s);
}

// 2. The service worker must validate the expected cache paths, not just count entries,
//    and the incremental verifier must re-download a response whose SHA marker is wrong.
{
  const path = 'offlineServiceWorker.js';
  let s = read(path);
  s = replaceOnce(s, "const SW_VERSION = '7';", "const SW_VERSION = '8';", 'SW version');
  s = replaceOnce(s,
"const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];",
"const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];", 'legacy prefixes');

  s = replaceOnce(s,
`        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        const expectedCount = manifest.files.length;
        if (keys.length < expectedCount + 1) return null;
        return {
            valid: true,
            activeCommit: manifest.commit,
            fileCount: expectedCount,
            totalBytes: manifest.files.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
            cacheName,
        };`,
`        const cache = await caches.open(cacheName);
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
        };`, 'cache path integrity check');

  s = replaceOnce(s,
`        const direct = await inspectGameCache(meta.cacheName, meta.commit || null);
        if (direct) return { ...direct, recovered: false };`,
`        const direct = await inspectGameCache(meta.cacheName, meta.commit || null);
        if (direct?.valid) return { ...direct, recovered: false };`, 'direct status validity');
  s = replaceOnce(s,
`        const recovered = await inspectGameCache(name);
        if (!recovered) continue;`,
`        const recovered = await inspectGameCache(name);
        if (!recovered?.valid) continue;`, 'recovered status validity');

  s = replaceOnce(s,
`        if (activeCache && activeShaByPath.get(file.path) === file.sha) {
            const existing = await activeCache.match(request, { ignoreSearch: true });
            if (existing) {
                reused++;
                stored++;
                return;
            }
        }`,
`        if (activeCache && activeShaByPath.get(file.path) === file.sha) {
            const existing = await activeCache.match(request, { ignoreSearch: true });
            // The manifest SHA and the response's own SHA marker must agree.
            // This turns Check for updates into a repair pass for missing/stale
            // cache entries instead of blindly trusting metadata.
            if (existing && existing.headers.get('X-Hex-Blob-Sha') === file.sha) {
                reused++;
                stored++;
                return;
            }
        }`, 'active response SHA verification');

  s = replaceOnce(s,
`            name === 'hex-game-meta-v4' || name === 'hex-game-meta-v5' || name === 'hex-game-meta-v6' ||
            name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-') || name.startsWith('hex-game-v3-') ||
            name.startsWith('hex-game-v4-') || name.startsWith('hex-game-v5-') || name.startsWith('hex-game-v6-')`,
`            name === 'hex-game-meta-v4' || name === 'hex-game-meta-v5' || name === 'hex-game-meta-v6' || name === 'hex-game-meta-v7' ||
            name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-') || name.startsWith('hex-game-v3-') ||
            name.startsWith('hex-game-v4-') || name.startsWith('hex-game-v5-') || name.startsWith('hex-game-v6-') || name.startsWith('hex-game-v7-')`, 'legacy cleanup v7');
  write(path, s);
}

// 3. Explicit Check for updates is also an integrity/repair pass, even when the
//    branch commit has not changed. Startup remains local-only and non-blocking.
{
  const path = 'offlineCache.js';
  let s = read(path);
  s = replaceOnce(s, "const VERSION = '7';", "const VERSION = '8';", 'offline cache version');
  s = replaceOnce(s, "const SW_URL = 'offlineServiceWorker.js?v=7';", "const SW_URL = 'offlineServiceWorker.js?v=8';", 'SW URL');

  const oldFastPath = `        if (before.valid && before.activeCommit === commit) {
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

        // Only an actual update/new install needs a quota estimate.
        const storage = await storageDiagnostic();
        emit({ phase: 'storage-check', message: storage.message });`;
  const newFastPath = `        // Do not short-circuit merely because the commit SHA matches. Explicit
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
        }`;
  s = replaceOnce(s, oldFastPath, newFastPath, 'same-commit repair path');

  s = replaceOnce(s,
`        const repairedOrChanged = !before.valid || before.activeCommit !== commit;
        return {
            ...result,
            changed: Boolean(result.complete && repairedOrChanged),`,
`        const repairedOrChanged = !before.valid || before.activeCommit !== commit || (result.downloaded || 0) > 0 || before.healthy === false;
        return {
            ...result,
            changed: Boolean(result.complete && repairedOrChanged),
            upToDate: Boolean(result.complete && before.activeCommit === commit && (result.downloaded || 0) === 0),`, 'repair change result');

  s = replaceOnce(s,
`        count.textContent = local.statusUnavailable || local.unverified
            ? 'Local game copy detected'
            : \`${'${local.fileCount || 0}'} game files available locally\`;
        detail.textContent = message;`,
`        count.textContent = local.statusUnavailable || local.unverified
            ? 'Local game copy detected'
            : local.healthy === false
                ? \`${'${local.availableCount || 0}'} / ${'${local.fileCount || 0}'} game files available locally\`
                : \`${'${local.fileCount || 0}'} game files available locally\`;
        detail.textContent = local.healthy === false
            ? \`${'${local.missingCount || 0}'} local file${'${local.missingCount === 1 ? \' is\' : \'s are\'}'} missing. Launch is available, but Check for updates will repair the saved copy.\`
            : message;`, 'local choice health display');

  s = replaceOnce(s,
`            let choiceMessage = local.unverified
                ? 'iOS did not answer the file-count check. You can still launch the installed copy, or use Check for updates to verify/repair it.'
                : local.recovered
                    ? 'Recovered the existing local game copy. Ready to launch.'
                    : 'Ready to play from the copy stored on this phone.';`,
`            let choiceMessage = local.unverified
                ? 'iOS did not answer the file-count check. You can still launch the installed copy, or use Check for updates to verify/repair it.'
                : local.healthy === false
                    ? \`${'${local.missingCount || 0}'} cached game file${'${local.missingCount === 1 ? \' is\' : \'s are\'}'} missing. Check for updates will repair only the missing/changed files.\`
                    : local.recovered
                        ? 'Recovered the existing local game copy. Ready to launch.'
                        : 'Ready to play from the copy stored on this phone.';`, 'startup health message');

  // Surface genuine offline runtime misses on the phone. De-duplicate them so a
  // repeatedly redrawn missing sprite does not flood the in-game log.
  const marker = `    const supported = location.protocol === 'https:' && 'serviceWorker' in navigator && 'caches' in window;`;
  const diagnostic = `${marker}\n    const reportedOfflineMisses = new Set();\n    if ('serviceWorker' in navigator) {\n        navigator.serviceWorker.addEventListener('message', event => {\n            if (event.data?.type !== 'HEX_OFFLINE_MISS') return;\n            const path = String(event.data.path || '(unknown resource)');\n            if (reportedOfflineMisses.has(path)) return;\n            reportedOfflineMisses.add(path);\n            console.warn('Offline local-copy miss:', path);\n            try { window.dispatchEvent(new CustomEvent('hex-offline-resource-miss', { detail: { path } })); } catch (_) {}\n            if (/^(?:images|audio)\\//.test(path)) {\n                const report = () => window.showMessage?.(\`Offline local copy is missing: \${path}. Use Check for updates to repair it.\`);\n                if (typeof window.showMessage === 'function') report();\n                else setTimeout(report, 1200);\n            }\n        });\n    }`;
  s = replaceOnce(s, marker, diagnostic, 'offline miss diagnostics');
  write(path, s);
}

// 4. Make iOS fetch the v8 bootstrap and changed network script rather than a
//    previously cached parser-time reference.
{
  const path = 'index.html';
  let s = read(path);
  s = s.replace(/<meta name="app-build" content="[^"]+">/, '<meta name="app-build" content="20261001-pwa-offline-cache-v8">');
  s = s.replace(/offlineCache\.js\?v=\d+/, 'offlineCache.js?v=8');
  s = s.replace(/network\.js\?v=\d+/, 'network.js?v=8');
  if (!s.includes('offlineCache.js?v=8') || !s.includes('network.js?v=8')) throw new Error('index v8 wiring failed');
  write(path, s);
}

console.log('offline runtime v8 patch applied');
