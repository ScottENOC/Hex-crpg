from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Missing expected text in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# offlineCache.js: bump version and, crucially, register the new script URL
# instead of calling update() on the old registration URL.
replace_once('offlineCache.js', "const VERSION = '9';", "const VERSION = '10';")
replace_once('offlineCache.js', "const SW_URL = 'offlineServiceWorker.js?v=9';", "const SW_URL = 'offlineServiceWorker.js?v=10';")

old_update = '''            // Startup must never force an update. Updating the worker is part of
            // the explicit Check for updates action only.
            if (allowUpdate) {
                try {
                    await withTimeout(registration.update(), 'Checking for a local worker update', 8000);
                } catch (error) {
                    console.warn('Service worker update check timed out/failed; the existing worker can still be used.', error);
                }
                const candidate = registration.installing || registration.waiting;
                if (candidate) {
                    try { await waitForWorkerActivation(candidate, 8000); }
                    catch (error) { console.warn('Updated worker did not activate promptly; keeping the current worker.', error); }
                }
            }
'''
new_update = '''            // Startup must never force a game-file update. However, when the user
            // explicitly presses Check for updates we must move the registration
            // to THIS build's service-worker URL. registration.update() is not
            // enough: it only re-fetches whatever script URL originally created
            // the registration (for example ?v=8), so old iOS installs could be
            // trapped on that worker forever even while offlineCache.js was v9+.
            if (allowUpdate) {
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
'''
replace_once('offlineCache.js', old_update, new_update)

old_status = '''            const registration = await ensureRegistration();
            const worker = registration.active || registration.waiting || registration.installing;
            return await getWorkerStatus(worker);
'''
new_status = '''            const registration = await ensureRegistration();
            const worker = registration.active || registration.waiting || registration.installing;
            const result = await getWorkerStatus(worker);
            let workerVersion = null;
            try { workerVersion = new URL(worker?.scriptURL || location.href).searchParams.get('v'); } catch (_) {}
            return { ...result, workerVersion, workerScriptURL: worker?.scriptURL || '' };
'''
replace_once('offlineCache.js', old_status, new_status)

old_detail = '''        detail.textContent = message;
        bar.style.width = '100%';
'''
new_detail = '''        const engineText = local.workerVersion ? `Offline engine v${local.workerVersion}` : 'Offline engine version unknown';
        detail.textContent = `${message} · ${engineText}`;
        bar.style.width = '100%';
'''
replace_once('offlineCache.js', old_detail, new_detail)

# Make update failures say which engine actually handled the request when known.
old_failure = "errorBox.textContent = failureText(result.failures) || 'The local-copy update failed for an unknown reason.';"
new_failure = "errorBox.textContent = `${failureText(result.failures) || 'The local-copy update failed for an unknown reason.'}${result.workerVersion ? `\\nOffline engine v${result.workerVersion}` : ''}`;"
replace_once('offlineCache.js', old_failure, new_failure)

# Service worker v10 recognises v9 caches as legacy/reusable.
replace_once('offlineServiceWorker.js', "const SW_VERSION = '9';", "const SW_VERSION = '10';")
replace_once(
    'offlineServiceWorker.js',
    "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v8-', 'hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];",
    "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v9-', 'hex-game-v8-', 'hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];"
)
replace_once(
    'offlineServiceWorker.js',
    "name === 'hex-game-meta-v4' || name === 'hex-game-meta-v5' || name === 'hex-game-meta-v6' || name === 'hex-game-meta-v7' ||",
    "name === 'hex-game-meta-v4' || name === 'hex-game-meta-v5' || name === 'hex-game-meta-v6' || name === 'hex-game-meta-v7' || name === 'hex-game-meta-v8' || name === 'hex-game-meta-v9' ||"
)
replace_once(
    'offlineServiceWorker.js',
    "name.startsWith('hex-game-v4-') || name.startsWith('hex-game-v5-') || name.startsWith('hex-game-v6-') || name.startsWith('hex-game-v7-')",
    "name.startsWith('hex-game-v4-') || name.startsWith('hex-game-v5-') || name.startsWith('hex-game-v6-') || name.startsWith('hex-game-v7-') || name.startsWith('hex-game-v8-') || name.startsWith('hex-game-v9-')"
)

# index bootstrap/version marker.
replace_once('index.html', '20261001-pwa-offline-cache-v9', '20261001-pwa-offline-cache-v10')
replace_once('index.html', 'offlineCache.js?v=9', 'offlineCache.js?v=10')

print('Applied offline engine v10 handover fix')
