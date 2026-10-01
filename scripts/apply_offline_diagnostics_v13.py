from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8-sig')
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:100]!r}')
    text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')

# Bump bootstrap/worker versions.
replace_once('offlineCache.js', "const VERSION = '12';", "const VERSION = '13';")
replace_once('offlineCache.js', "const SW_URL = 'offlineServiceWorker.js?v=12';", "const SW_URL = 'offlineServiceWorker.js?v=13';")
replace_once('offlineCache.js', "const reloadKey = 'hex-offline-reloaded-commit-v12';", "const reloadKey = 'hex-offline-reloaded-commit-v13';")
replace_once('offlineServiceWorker.js', "const SW_VERSION = '12';", "const SW_VERSION = '13';")
replace_once('index.html', 'content="20261001-pwa-offline-cache-v11"', 'content="20261001-pwa-offline-cache-v13"')
replace_once('index.html', 'src="offlineCache.js?v=12"', 'src="offlineCache.js?v=13"')

# Worker-side read-only diagnostic. It deliberately does not repair or download.
anchor = "function mimeTypeFor(path) {"
diagnostic_fn = r'''async function diagnoseGameCache(files) {
    const expectedFiles = Array.isArray(files) ? files.filter(file => file?.path && file?.sha) : [];
    const cacheNames = await caches.keys();
    let meta = await readActiveMeta(true);
    let metaSource = meta ? META_CACHE : null;

    // If the stable metadata record is missing, inspect old records without
    // mutating anything. This lets the phone tell us whether migration failed.
    if (!meta?.cacheName) {
        for (const legacyMetaName of LEGACY_META_CACHES) {
            if (!cacheNames.includes(legacyMetaName)) continue;
            try {
                const legacyMetaCache = await caches.open(legacyMetaName);
                const candidate = await readJsonResponse(await legacyMetaCache.match(META_KEY));
                if (candidate?.cacheName) {
                    meta = candidate;
                    metaSource = legacyMetaName;
                    break;
                }
            } catch (_) {}
        }
    }

    let cacheName = meta?.cacheName || null;
    if (!cacheName || !cacheNames.includes(cacheName)) {
        const candidates = cacheNames.filter(name =>
            name.startsWith(GAME_CACHE_PREFIX) || LEGACY_GAME_CACHE_PREFIXES.some(prefix => name.startsWith(prefix))
        );
        if (candidates.length) cacheName = candidates[candidates.length - 1];
    }

    if (!cacheName || !cacheNames.includes(cacheName)) {
        return {
            workerVersion: SW_VERSION,
            metaSource,
            cacheName: cacheName || null,
            cacheExists: false,
            savedCommit: meta?.commit || null,
            manifestFiles: 0,
            cacheEntries: 0,
            expectedFiles: expectedFiles.length,
            physicalPresent: 0,
            physicalMissing: expectedFiles.length,
            shaSame: 0,
            shaDifferent: 0,
            noSavedSha: expectedFiles.length,
        };
    }

    const cache = await caches.open(cacheName);
    const manifest = await readCacheManifest(cacheName);
    const keys = await cache.keys();
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
    const savedShaByPath = new Map((manifest?.files || []).map(file => [file.path, file.sha]));

    let physicalPresent = 0;
    let shaSame = 0;
    let shaDifferent = 0;
    let noSavedSha = 0;
    for (const file of expectedFiles) {
        if (cachedUrls.has(localUrl(file.path))) physicalPresent++;
        const savedSha = savedShaByPath.get(file.path);
        if (!savedSha) noSavedSha++;
        else if (savedSha === file.sha) shaSame++;
        else shaDifferent++;
    }

    return {
        workerVersion: SW_VERSION,
        metaSource,
        cacheName,
        cacheExists: true,
        savedCommit: manifest?.commit || meta?.commit || null,
        manifestFiles: Array.isArray(manifest?.files) ? manifest.files.length : 0,
        cacheEntries: keys.length,
        expectedFiles: expectedFiles.length,
        physicalPresent,
        physicalMissing: Math.max(0, expectedFiles.length - physicalPresent),
        shaSame,
        shaDifferent,
        noSavedSha,
    };
}

'''
replace_once('offlineServiceWorker.js', anchor, diagnostic_fn + anchor)

# Add diagnostic message type before normal cache update handling.
old_handler = """    if (event.data?.type === 'HEX_CACHE_GAME') {
        event.waitUntil(cacheGame(event.data, port).catch(error => {
"""
new_handler = """    if (event.data?.type === 'HEX_CACHE_DIAGNOSTICS') {
        event.waitUntil((async () => {
            try {
                port.postMessage({ type: 'result', result: await diagnoseGameCache(event.data?.files || []) });
            } catch (error) {
                port.postMessage({ type: 'error', kind: 'diagnostics', message: error?.message || String(error) });
            }
        })());
        return;
    }
    if (event.data?.type === 'HEX_CACHE_GAME') {
        event.waitUntil(cacheGame(event.data, port).catch(error => {
"""
replace_once('offlineServiceWorker.js', old_handler, new_handler)

# Page-side helpers: get the latest runtime list, query worker, format for phone.
anchor = "    function emitWorkerProgress(progress) {"
page_helpers = r'''    async function getLatestRuntimeFiles() {
        const branchInfo = await getBranchInfo();
        const commit = branchInfo?.commit?.sha;
        const treeSha = branchInfo?.commit?.commit?.tree?.sha;
        if (!commit || !treeSha) throw Object.assign(new Error('GitHub returned branch information without a commit/tree SHA.'), { kind: 'github-data' });
        const treeResult = await fetchJsonWithRetries(`${API_BASE}/git/trees/${treeSha}?recursive=1`, 'GitHub game-file list');
        if (treeResult?.truncated) throw Object.assign(new Error('GitHub returned an incomplete file list.'), { kind: 'file-list-truncated' });
        const files = runtimeFilesFromTree(treeResult?.tree);
        if (!files.length) throw Object.assign(new Error('No runtime game files were found.'), { kind: 'file-list-empty' });
        return { commit, files };
    }

    async function inspectLocalCopy() {
        emit({ phase: 'checking', message: 'Inspecting local cache without downloading anything…' });
        const registration = await ensureRegistration({ allowUpdate: true });
        const worker = registration.active || registration.waiting || registration.installing;
        const latest = await getLatestRuntimeFiles();
        return workerRequest(worker, { type: 'HEX_CACHE_DIAGNOSTICS', files: latest.files }, { timeout: 20000 });
    }

    function shortCommit(value) {
        return value ? String(value).slice(0, 8) : 'none';
    }

    function formatCacheDiagnostic(d) {
        if (!d) return 'Cache diagnostic returned no data.';
        const cacheText = d.cacheName || 'none';
        return `Diagnostic: engine v${d.workerVersion || '?'} · cache ${cacheText} · saved commit ${shortCommit(d.savedCommit)} · ` +
            `${d.physicalPresent || 0}/${d.expectedFiles || 0} expected files physically present (${d.physicalMissing || 0} missing) · ` +
            `SHA: ${d.shaSame || 0} same, ${d.shaDifferent || 0} different, ${d.noSavedSha || 0} without saved SHA · ` +
            `manifest ${d.manifestFiles || 0} files · raw cache ${d.cacheEntries || 0} entries · metadata ${d.metaSource || 'none'}.`;
    }

'''
replace_once('offlineCache.js', anchor, page_helpers + anchor)

# Add an Inspect button to the gate.
old_gate = '<button class="hex-offline-launch" hidden>Launch now</button><button class="hex-offline-update" hidden>Check for updates</button><button class="hex-offline-retry" hidden>Retry</button>'
new_gate = '<button class="hex-offline-launch" hidden>Launch now</button><button class="hex-offline-update" hidden>Check for updates</button><button class="hex-offline-inspect" hidden>Inspect local copy</button><button class="hex-offline-retry" hidden>Retry</button>'
replace_once('offlineCache.js', old_gate, new_gate)

# Wire the button into the local-choice promise.
old_vars = """        const launchButton = gate.querySelector('.hex-offline-launch');
        const updateButton = gate.querySelector('.hex-offline-update');
        const errorBox = gate.querySelector('.hex-offline-error');
"""
new_vars = """        const launchButton = gate.querySelector('.hex-offline-launch');
        const updateButton = gate.querySelector('.hex-offline-update');
        const inspectButton = gate.querySelector('.hex-offline-inspect');
        const errorBox = gate.querySelector('.hex-offline-error');
"""
replace_once('offlineCache.js', old_vars, new_vars)

old_show = """        launchButton.hidden = false;
        updateButton.hidden = false;
        updateButton.disabled = navigator.onLine === false;
"""
new_show = """        launchButton.hidden = false;
        updateButton.hidden = false;
        inspectButton.hidden = false;
        updateButton.disabled = navigator.onLine === false;
        inspectButton.disabled = navigator.onLine === false;
"""
replace_once('offlineCache.js', old_show, new_show)

old_promise = """        return new Promise(resolve => {
            launchButton.onclick = () => resolve('launch');
            updateButton.onclick = () => resolve('update');
        }).finally(() => {
            launchButton.onclick = null;
            updateButton.onclick = null;
            launchButton.hidden = true;
            updateButton.hidden = true;
            updateButton.disabled = false;
        });
"""
new_promise = """        return new Promise(resolve => {
            launchButton.onclick = () => resolve('launch');
            updateButton.onclick = () => resolve('update');
            inspectButton.onclick = () => resolve('inspect');
        }).finally(() => {
            launchButton.onclick = null;
            updateButton.onclick = null;
            inspectButton.onclick = null;
            launchButton.hidden = true;
            updateButton.hidden = true;
            inspectButton.hidden = true;
            updateButton.disabled = false;
            inspectButton.disabled = false;
        });
"""
replace_once('offlineCache.js', old_promise, new_promise)

# Handle inspect without doing an update/download.
old_choice = """                if (choice === 'launch') {
                    launchLocalCopy(gate, local);
                    return;
                }

                // Explicit user action only: GitHub and storage checks happen here.
"""
new_choice = """                if (choice === 'launch') {
                    launchLocalCopy(gate, local);
                    return;
                }
                if (choice === 'inspect') {
                    try {
                        const diagnostic = await inspectLocalCopy();
                        choiceMessage = formatCacheDiagnostic(diagnostic);
                    } catch (error) {
                        choiceMessage = `Cache diagnostic failed: ${error?.message || error}`;
                    }
                    local = await readLocalCopyStatus();
                    if (!local.valid && local.statusUnavailable && local.hasWorker) {
                        local = { ...local, valid: true, unverified: true, fileCount: null };
                    }
                    continue;
                }

                // Explicit user action only: GitHub and storage checks happen here.
"""
replace_once('offlineCache.js', old_choice, new_choice)

print('offline diagnostics v13 patch applied')
