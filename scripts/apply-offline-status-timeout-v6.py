from pathlib import Path
import re

root = Path('.')
cache_path = root / 'offlineCache.js'
sw_path = root / 'offlineServiceWorker.js'
index_path = root / 'index.html'

cache = cache_path.read_text()
sw = sw_path.read_text()
index = index_path.read_text()

# Version bump / cache bust.
cache = cache.replace("const VERSION = '5';", "const VERSION = '6';")
cache = cache.replace("const SW_URL = 'offlineServiceWorker.js?v=5';", "const SW_URL = 'offlineServiceWorker.js?v=6';")
cache = cache.replace("const WORKER_STALL_TIMEOUT_MS = 45000;", "const WORKER_STALL_TIMEOUT_MS = 45000;\n    const STARTUP_WORKER_TIMEOUT_MS = 6000;")

sleep_old = """    function sleep(ms) {\n        return new Promise(resolve => setTimeout(resolve, ms));\n    }\n"""
sleep_new = sleep_old + """\n    function withTimeout(promise, label, timeoutMs = STARTUP_WORKER_TIMEOUT_MS) {\n        return Promise.race([\n            promise,\n            new Promise((_, reject) => setTimeout(() => {\n                const error = new Error(`${label} timed out.`);\n                error.kind = 'worker-timeout';\n                reject(error);\n            }, timeoutMs)),\n        ]);\n    }\n"""
if sleep_old not in cache:
    raise SystemExit('sleep() anchor not found')
cache = cache.replace(sleep_old, sleep_new, 1)

new_registration = r'''    async function ensureRegistration({ allowUpdate = false } = {}) {
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

            // Startup must never force an update. Updating the worker is part of
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

    function workerRequest'''
cache, n = re.subn(r"    async function ensureRegistration\(\) \{.*?\n    \}\n\n    function workerRequest", new_registration, cache, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'ensureRegistration replacement count {n}')

cache = cache.replace("return workerRequest(worker, { type: 'HEX_CACHE_STATUS' }, { timeout: 30000 });", "return workerRequest(worker, { type: 'HEX_CACHE_STATUS' }, { timeout: STARTUP_WORKER_TIMEOUT_MS });")

# syncInternal is the explicit install/update path; it may update the worker.
marker = "async function syncInternal()"
pos = cache.find(marker)
if pos < 0:
    raise SystemExit('syncInternal anchor missing')
pre, post = cache[:pos], cache[pos:]
old = "registration = await ensureRegistration();"
if old not in post:
    raise SystemExit('syncInternal registration call missing')
post = post.replace(old, "registration = await ensureRegistration({ allowUpdate: true });", 1)
cache = pre + post

# Status failures should become a choice, not an endless startup blocker.
old_read = """        } catch (error) {\n            console.warn('Could not read local game copy', error);\n            return { valid: false, error: errorInfo(error, 'local-status') };\n        }\n"""
new_read = """        } catch (error) {\n            console.warn('Could not read local game copy', error);\n            let hasWorker = Boolean(navigator.serviceWorker.controller);\n            if (!hasWorker) {\n                try {\n                    const registration = await withTimeout(navigator.serviceWorker.getRegistration('./'), 'Double-checking the local worker', 1500);\n                    hasWorker = Boolean(registration?.active);\n                } catch (_) {}\n            }\n            return {\n                valid: false,\n                statusUnavailable: true,\n                hasWorker,\n                error: errorInfo(error, 'local-status'),\n            };\n        }\n"""
if old_read not in cache:
    raise SystemExit('readLocalCopyStatus catch anchor missing')
cache = cache.replace(old_read, new_read, 1)

cache = cache.replace("count.textContent = `${local.fileCount || 0} game files available locally`;", "count.textContent = local.statusUnavailable || local.unverified\n            ? 'Local game copy detected'\n            : `${local.fileCount || 0} game files available locally`;", 1)

# Before first-install logic, convert a timed-out status check with an active worker
# into a launchable-but-unverified local copy.
old_start = """            let local = await readLocalCopyStatus();\n\n            // First install/repair: there is nothing safe to launch yet, so build\n"""
new_start = """            let local = await readLocalCopyStatus();\n            if (!local.valid && local.statusUnavailable && local.hasWorker) {\n                local = { ...local, valid: true, unverified: true, fileCount: null };\n            }\n\n            // First install/repair: there is nothing safe to launch yet, so build\n"""
if old_start not in cache:
    raise SystemExit('startup local anchor missing')
cache = cache.replace(old_start, new_start, 1)

old_choice = """            let choiceMessage = local.recovered\n                ? 'Recovered the existing local game copy. Ready to launch.'\n                : 'Ready to play from the copy stored on this phone.';\n"""
new_choice = """            let choiceMessage = local.unverified\n                ? 'iOS did not answer the file-count check. You can still launch the installed copy, or use Check for updates to verify/repair it.'\n                : local.recovered\n                    ? 'Recovered the existing local game copy. Ready to launch.'\n                    : 'Ready to play from the copy stored on this phone.';\n"""
if old_choice not in cache:
    raise SystemExit('choice message anchor missing')
cache = cache.replace(old_choice, new_choice, 1)

old_after_update = """                local = await readLocalCopyStatus();\n                if (!local.valid) throw Object.assign(new Error('The saved local copy could not be reopened after the update check.'), { kind: 'local-status' });\n                choiceMessage = updateResult.upToDate || updateResult.changed === false\n"""
new_after_update = """                local = await readLocalCopyStatus();\n                if (!local.valid && local.statusUnavailable && local.hasWorker) {\n                    local = { ...local, valid: true, unverified: true, fileCount: null };\n                    choiceMessage = 'The update finished, but iOS did not answer the file-count check. Launch is still available.';\n                    continue;\n                }\n                if (!local.valid) throw Object.assign(new Error('The saved local copy could not be reopened after the update check.'), { kind: 'local-status' });\n                choiceMessage = updateResult.upToDate || updateResult.changed === false\n"""
if old_after_update not in cache:
    raise SystemExit('post-update local anchor missing')
cache = cache.replace(old_after_update, new_after_update, 1)

# Service worker v6 can recover v5 caches instead of redownloading them.
sw = sw.replace("const SW_VERSION = '5';", "const SW_VERSION = '6';")
sw = sw.replace("const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];", "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];")
sw = sw.replace("name === 'hex-game-meta-v4' || name.startsWith('hex-game-v1-')", "name === 'hex-game-meta-v4' || name === 'hex-game-meta-v5' || name.startsWith('hex-game-v1-')")
sw = sw.replace("name.startsWith('hex-game-v4-'))", "name.startsWith('hex-game-v4-') || name.startsWith('hex-game-v5-'))")

index = index.replace('20261001-pwa-offline-cache-v5', '20261001-pwa-offline-cache-v6')
index = index.replace('offlineCache.js?v=5', 'offlineCache.js?v=6')

cache_path.write_text(cache)
sw_path.write_text(sw)
index_path.write_text(index)

print('Applied offline status timeout v6')
