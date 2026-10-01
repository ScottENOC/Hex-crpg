from pathlib import Path
import re

cache_path = Path('offlineCache.js')
worker_path = Path('offlineServiceWorker.js')
index_path = Path('index.html')

cache = cache_path.read_text()
worker = worker_path.read_text()
index = index_path.read_text()

cache = cache.replace("const VERSION = '4';", "const VERSION = '5';")
cache = cache.replace("const SW_URL = 'offlineServiceWorker.js?v=4';", "const SW_URL = 'offlineServiceWorker.js?v=5';")
cache = cache.replace("activeUrl.includes('v=4')", "activeUrl.includes('v=5')")
cache = cache.replace('The v4 offline worker is not active yet.', 'The v5 offline worker is not active yet.')
cache = cache.replace("'hex-offline-reloaded-commit-v4'", "'hex-offline-reloaded-commit-v5'")

standalone_marker = "    function isStandaloneWebApp() {\n        return window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;\n    }\n"
if standalone_marker not in cache:
    raise SystemExit('Could not find standalone helper')
cleanup_fn = standalone_marker + "\n    async function cleanupSafariOfflineControl() {\n        // Normal Safari should remain a plain website. Its storage context is\n        // separate from an installed Home Screen web app, so clearing Hex\n        // service-worker state here does not delete the installed app copy.\n        try {\n            const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];\n            await Promise.all(registrations.map(registration => registration.unregister()));\n        } catch (error) {\n            console.warn('Could not unregister old Safari service worker', error);\n        }\n        try {\n            const names = await caches.keys();\n            await Promise.all(names\n                .filter(name => name.startsWith('hex-game-'))\n                .map(name => caches.delete(name)));\n        } catch (error) {\n            console.warn('Could not clear old Safari Hex caches', error);\n        }\n    }\n"
cache = cache.replace(standalone_marker, cleanup_fn, 1)

startup_marker = "    async function startup() {\n        const gate = ensureGate();"
if startup_marker not in cache:
    raise SystemExit('Could not find startup')
startup_replacement = "    async function startup() {\n        // Never let the offline/PWA layer block the ordinary Safari website.\n        // Only the installed Home Screen app owns and uses the local game copy.\n        if (!isStandaloneWebApp()) {\n            releaseReadyBarrier({ complete: true, browserMode: true, hasActiveCache: false });\n            Promise.resolve().then(cleanupSafariOfflineControl).catch(() => {});\n            return;\n        }\n\n        const gate = ensureGate();"
cache = cache.replace(startup_marker, startup_replacement, 1)

worker = worker.replace("const SW_VERSION = '4';", "const SW_VERSION = '5';")
worker = worker.replace("const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];", "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];")
worker = worker.replace("name === 'hex-game-meta-v3' || name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-') || name.startsWith('hex-game-v3-')", "name === 'hex-game-meta-v3' || name === 'hex-game-meta-v4' || name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-') || name.startsWith('hex-game-v3-') || name.startsWith('hex-game-v4-')")

fetch_pattern = re.compile(r"self\.addEventListener\('fetch', event => \{.*?\n\}\);\s*$", re.S)
fetch_replacement = r'''self.addEventListener('fetch', event => {
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
        return fetch(request);
    })());
});
'''
worker, count = fetch_pattern.subn(fetch_replacement, worker, count=1)
if count != 1:
    raise SystemExit('Could not replace fetch handler')

index = index.replace('20261001-pwa-offline-cache-v4', '20261001-pwa-offline-cache-v5')
index = index.replace('offlineCache.js?v=4', 'offlineCache.js?v=5')

cache_path.write_text(cache)
worker_path.write_text(worker)
index_path.write_text(index)
