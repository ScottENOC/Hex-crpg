from pathlib import Path
import re

cache_path = Path('offlineCache.js')
worker_path = Path('offlineServiceWorker.js')
index_path = Path('index.html')

cache = cache_path.read_text()
worker = worker_path.read_text()
index = index_path.read_text()

# Version bump so an installed iOS web app cannot keep executing v3 startup logic.
cache = cache.replace("const VERSION = '3';", "const VERSION = '4';")
cache = cache.replace("const SW_URL = 'offlineServiceWorker.js?v=3';", "const SW_URL = 'offlineServiceWorker.js?v=4';")
cache = cache.replace("activeUrl.includes('v=3')", "activeUrl.includes('v=4')")
cache = cache.replace('The v3 offline worker is not active yet.', 'The v4 offline worker is not active yet.')
cache = cache.replace("'hex-offline-reloaded-commit-v3'", "'hex-offline-reloaded-commit-v4'")

# Explicit launch/update buttons in the splash gate.
old_gate = "<div class=\"hex-offline-actions\"><button class=\"hex-offline-retry\" hidden>Retry</button><button class=\"hex-offline-continue\" hidden>Continue</button></div>"
new_gate = "<div class=\"hex-offline-actions\"><button class=\"hex-offline-launch\" hidden>Launch now</button><button class=\"hex-offline-update\" hidden>Check for updates</button><button class=\"hex-offline-retry\" hidden>Retry</button><button class=\"hex-offline-continue\" hidden>Continue</button></div>"
if old_gate not in cache:
    raise SystemExit('Could not find offline action buttons')
cache = cache.replace(old_gate, new_gate, 1)

# Replace startup with an explicitly user-controlled launch flow. A valid local
# cache never causes a GitHub request or storage diagnostic unless Update is tapped.
startup_pattern = re.compile(r"    async function startup\(\) \{.*?\n    \}\n\n    if \(document\.readyState === 'loading'\)", re.S)
startup_replacement = r'''    async function readLocalCopyStatus() {
        emit({ phase: 'checking', stored: 0, processed: 0, total: 0, message: 'Checking local game copy…' });
        try {
            const registration = await ensureRegistration();
            const worker = registration.active || registration.waiting || registration.installing;
            return await getWorkerStatus(worker);
        } catch (error) {
            console.warn('Could not read local game copy', error);
            return { valid: false, error: errorInfo(error, 'local-status') };
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
        count.textContent = `${local.fileCount || 0} game files available locally`;
        detail.textContent = message;
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
        const reloadKey = 'hex-offline-reloaded-commit-v4';
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
        const gate = ensureGate();
        if (!gate) return;
        document.body.classList.add('hex-offline-preparing');
        gate.hidden = false;
        const unsubscribe = onProgress(progress => renderProgress(gate, progress));
        try {
            let local = await readLocalCopyStatus();

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

            let choiceMessage = local.recovered
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

    if (document.readyState === 'loading')'''
cache, count = startup_pattern.subn(startup_replacement, cache, count=1)
if count != 1:
    raise SystemExit('Could not replace startup flow')

# Service worker v4 can recover v3 caches and does not make an update wait on
# a redundant storage probe when an existing complete cache already proves
# Cache Storage is working.
worker = worker.replace("const SW_VERSION = '3';", "const SW_VERSION = '4';")
worker = worker.replace("const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v2-', 'hex-game-v1-'];", "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];")

probe_pattern = re.compile(r"async function assertCacheStorageWorks\(\) \{.*?\n\}\n\nasync function cleanupLegacyCaches", re.S)
probe_replacement = r'''async function assertCacheStorageWorks() {
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

async function cleanupLegacyCaches'''
worker, count = probe_pattern.subn(probe_replacement, worker, count=1)
if count != 1:
    raise SystemExit('Could not replace storage probe')

worker = worker.replace("name === 'hex-game-meta-v2' || name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-')", "name === 'hex-game-meta-v2' || name === 'hex-game-meta-v3' || name.startsWith('hex-game-v1-') || name.startsWith('hex-game-v2-') || name.startsWith('hex-game-v3-')")

# Move the existing-cache status lookup ahead of the probe and only probe on a
# genuine first install (an existing valid cache is itself proof storage works).
old_cachegame = '''    const diagnosticTotalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
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

    const before = await statusResult();'''
new_cachegame = '''    const diagnosticTotalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
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
    }'''
if old_cachegame not in worker:
    raise SystemExit('Could not patch cacheGame storage probe')
worker = worker.replace(old_cachegame, new_cachegame, 1)

index = index.replace('20261001-pwa-offline-cache-v3', '20261001-pwa-offline-cache-v4')
index = index.replace('offlineCache.js?v=3', 'offlineCache.js?v=4')

cache_path.write_text(cache)
worker_path.write_text(worker)
index_path.write_text(index)
