from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8-sig')
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Bootstrap/version bump so the installed Home Screen app can acquire this fix.
replace_once('offlineCache.js', "const VERSION = '13';", "const VERSION = '14';")
replace_once('offlineCache.js', "const SW_URL = 'offlineServiceWorker.js?v=13';", "const SW_URL = 'offlineServiceWorker.js?v=14';")
replace_once('offlineServiceWorker.js', "const SW_VERSION = '13';", "const SW_VERSION = '14';")
replace_once('index.html', 'content="20261001-pwa-offline-cache-v13"', 'content="20261001-pwa-offline-cache-v14"')
replace_once('index.html', 'src="offlineCache.js?v=13"', 'src="offlineCache.js?v=14"')
replace_once('offlineCache.js', "const reloadKey = 'hex-offline-reloaded-commit-v13';", "const reloadKey = 'hex-offline-reloaded-commit-v14';")

# Inspect must not install/update the service worker. It only interrogates the
# worker/cache already on the phone and compares it with GitHub's current tree.
replace_once(
    'offlineCache.js',
    """    async function inspectLocalCopy() {\n        emit({ phase: 'checking', message: 'Inspecting local cache without downloading anything…' });\n        const registration = await ensureRegistration({ allowUpdate: true });\n        const worker = registration.active || registration.waiting || registration.installing;\n        const latest = await getLatestRuntimeFiles();\n        return workerRequest(worker, { type: 'HEX_CACHE_DIAGNOSTICS', files: latest.files }, { timeout: 20000 });\n    }\n""",
    """    async function inspectLocalCopy() {\n        emit({ phase: 'diagnostic', message: 'Inspecting the cache already stored on this phone…' });\n        const registration = await ensureRegistration();\n        const worker = registration.active || navigator.serviceWorker.controller || registration.waiting || registration.installing;\n        const latest = await getLatestRuntimeFiles();\n        return workerRequest(worker, { type: 'HEX_CACHE_DIAGNOSTICS', files: latest.files }, { timeout: 20000 });\n    }\n"""
)

# Give diagnostics their own title so a hang is attributable to the exact step.
replace_once(
    'offlineCache.js',
    """        if (progress.phase === 'storage-check') title.textContent = 'Checking iPhone storage…';\n        else if (progress.phase === 'checking') title.textContent = 'Checking local game copy…';\n""",
    """        if (progress.phase === 'storage-check') title.textContent = 'Checking iPhone storage…';\n        else if (progress.phase === 'diagnostic') title.textContent = 'Inspecting local cache…';\n        else if (progress.phase === 'checking') title.textContent = 'Checking local game copy…';\n"""
)

# Honour the caller's diagnostic text even if the saved copy was previously
# marked unhealthy; otherwise the diagnostic result can be hidden by a generic
# missing-files message.
replace_once(
    'offlineCache.js',
    """        const choiceMessage = local.healthy === false\n            ? `${local.missingCount || 0} local file${local.missingCount === 1 ? ' is' : 's are'} missing. Launch is available, but Check for updates will repair the saved copy.`\n            : message;\n""",
    """        const choiceMessage = message || (local.healthy === false\n            ? `${local.missingCount || 0} local file${local.missingCount === 1 ? ' is' : 's are'} missing. Launch is available, but Check for updates will repair the saved copy.`\n            : 'Ready to play from the copy stored on this phone.');\n"""
)

# Most importantly: after Inspect, do NOT run the normal status check again.
# Keep the already-known local state and simply repaint the launcher with the
# diagnostic result. This prevents the observed "Checking local game copy" trap.
replace_once(
    'offlineCache.js',
    """                if (choice === 'inspect') {\n                    try {\n                        const diagnostic = await inspectLocalCopy();\n                        choiceMessage = formatCacheDiagnostic(diagnostic);\n                    } catch (error) {\n                        choiceMessage = `Cache diagnostic failed: ${error?.message || error}`;\n                    }\n                    local = await readLocalCopyStatus();\n                    if (!local.valid && local.statusUnavailable && local.hasWorker) {\n                        local = { ...local, valid: true, unverified: true, fileCount: null };\n                    }\n                    continue;\n                }\n""",
    """                if (choice === 'inspect') {\n                    try {\n                        const diagnostic = await inspectLocalCopy();\n                        choiceMessage = formatCacheDiagnostic(diagnostic);\n                        if (diagnostic?.workerVersion) local = { ...local, workerVersion: diagnostic.workerVersion };\n                    } catch (error) {\n                        choiceMessage = `Cache diagnostic failed: ${error?.message || error}`;\n                    }\n                    continue;\n                }\n"""
)

print('offline inspect v14 patch applied')
