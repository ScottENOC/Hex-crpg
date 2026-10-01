from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))

# --- Initiative tracker: never hide the legacy portrait until the direct canvas
# actually rendered a body. This fixes blank portraits during image decode/load.
renderer = Path('humanoidRenderer.js')
js = renderer.read_text()
old = '''            let canvas = portrait.querySelector('canvas[data-direct-humanoid="true"]');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width=100; canvas.height=100;
                canvas.dataset.directHumanoid='true';
                canvas.classList.add('portrait-layer');
                canvas.style.cssText='width:100%;height:100%;left:0;top:0;';
                portrait.insertBefore(canvas, portrait.firstChild);
            }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,100,100);
            const height=92,width=height*HUMAN_RENDER_ASPECT;
            drawDirectionalHumanoidInBounds(ctx,entity,{left:(100-width)/2,top:4,width,height},'down');
'''
new = '''            let canvas = portrait.querySelector('canvas[data-direct-humanoid-canvas="true"]');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width=100; canvas.height=100;
                canvas.dataset.directHumanoidCanvas='true';
                canvas.classList.add('portrait-layer');
                canvas.style.cssText='width:100%;height:100%;left:0;top:0;';
                portrait.insertBefore(canvas, portrait.firstChild);
            }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,100,100);
            const height=92,width=height*HUMAN_RENDER_ASPECT;
            const rendered = drawDirectionalHumanoidInBounds(ctx,entity,{left:(100-width)/2,top:4,width,height},'down');
            // Do not suppress the established IMG portrait until this frame has
            // actually drawn. Image decoding is asynchronous on iOS; tagging an
            // empty canvas as authoritative made the tracker blank even though
            // the same entity rendered correctly on the map a moment later.
            portrait.classList.toggle('direct-humanoid-ready', !!rendered);
            canvas.style.display = rendered ? 'block' : 'none';
            if (rendered) canvas.dataset.directHumanoid='true';
            else delete canvas.dataset.directHumanoid;
'''
if old not in js:
    raise SystemExit('Could not find initiative direct-canvas block')
js = js.replace(old, new, 1)
renderer.write_text(js)

style = Path('style.css')
css = style.read_text()
old_css = '.turn-indicator-portrait:has(canvas[data-direct-humanoid="true"]) > img.portrait-layer {'
new_css = '.turn-indicator-portrait.direct-humanoid-ready > img.portrait-layer {'
if old_css not in css:
    raise SystemExit('Could not find direct humanoid portrait CSS selector')
style.write_text(css.replace(old_css, new_css, 1))

# --- Offline updater v11.
# Preserve/recover the exact prior active-cache pointer across worker-version
# changes, short-circuit a healthy same-commit check, and make reuse/download
# counts explicit in the UI.
worker = Path('offlineServiceWorker.js')
sw = worker.read_text()
sw = sw.replace("const SW_VERSION = '10';", "const SW_VERSION = '11';", 1)
sw = sw.replace(
    "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v9-', 'hex-game-v8-', 'hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];",
    "const LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v10-', 'hex-game-v9-', 'hex-game-v8-', 'hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];\nconst LEGACY_META_CACHES = ['hex-game-meta-v10', 'hex-game-meta-v9', 'hex-game-meta-v8', 'hex-game-meta-v7', 'hex-game-meta-v6', 'hex-game-meta-v5', 'hex-game-meta-v4', 'hex-game-meta-v3', 'hex-game-meta-v2', 'hex-game-meta-v1'];",
    1,
)
if "const SW_VERSION = '11';" not in sw or 'LEGACY_META_CACHES' not in sw:
    raise SystemExit('Could not bump offline worker declarations')

status_old = '''async function statusResult() {
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
        name.startsWith(GAME_CACHE_PREFIX) || LEGACY_GAME_CACHE_PREFIXES.some(prefix => name.startsWith(prefix))
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
'''
status_new = '''async function statusResult() {
    const meta = await readActiveMeta(true);
    if (meta?.cacheName) {
        const direct = await inspectGameCache(meta.cacheName, meta.commit || null);
        if (direct?.valid) return { ...direct, recovered: false, recoveredFromMeta: META_CACHE };
    }

    // Every worker version uses a new metadata cache. Read the previous
    // version's active pointer before guessing from CacheStorage insertion
    // order. That pointer identifies the exact complete cache the player was
    // using, so SHA comparison can reuse unchanged files instead of comparing
    // against an arbitrary older cache and downloading them again.
    for (const metaCacheName of LEGACY_META_CACHES) {
        try {
            const legacyMetaCache = await caches.open(metaCacheName);
            const legacyMeta = await readJsonResponse(await legacyMetaCache.match(META_KEY));
            if (!legacyMeta?.cacheName) continue;
            const recovered = await inspectGameCache(legacyMeta.cacheName, legacyMeta.commit || null);
            if (!recovered?.valid) continue;
            await writeActiveMeta({
                version: SW_VERSION,
                cacheName: recovered.cacheName,
                commit: recovered.activeCommit,
                fileCount: recovered.fileCount,
                totalBytes: recovered.totalBytes,
                recoveredAt: Date.now(),
                recoveredFromMeta: metaCacheName,
            });
            return { ...recovered, recovered: true, recoveredFromMeta: metaCacheName };
        } catch (_) {}
    }

    // Last-resort recovery if metadata was lost. Prefer the newest cache
    // namespace deterministically rather than whatever order WebKit returns.
    const names = await caches.keys();
    const prefixRank = name => {
        if (name.startsWith(GAME_CACHE_PREFIX)) return 0;
        const legacyIndex = LEGACY_GAME_CACHE_PREFIXES.findIndex(prefix => name.startsWith(prefix));
        return legacyIndex < 0 ? Number.MAX_SAFE_INTEGER : legacyIndex + 1;
    };
    const candidates = names
        .filter(name => name.startsWith(GAME_CACHE_PREFIX) || LEGACY_GAME_CACHE_PREFIXES.some(prefix => name.startsWith(prefix)))
        .sort((a, b) => prefixRank(a) - prefixRank(b) || a.localeCompare(b));
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
        return { ...recovered, recovered: true, recoveredFromMeta: null };
    }

    return { valid: false, activeCommit: null, fileCount: 0, cacheName: null, recovered: false };
}
'''
if status_old not in sw:
    raise SystemExit('Could not find statusResult block')
sw = sw.replace(status_old, status_new, 1)

cleanup_start = sw.index('async function cleanupLegacyCaches(')
cleanup_end = sw.index('\nasync function cacheGame(', cleanup_start)
cleanup_new = '''async function cleanupLegacyCaches(keepNames = []) {
    const keep = new Set((keepNames || []).filter(Boolean));
    const names = await caches.keys();
    await Promise.all(names
        .filter(name => !keep.has(name) && (
            LEGACY_META_CACHES.includes(name) ||
            LEGACY_GAME_CACHE_PREFIXES.some(prefix => name.startsWith(prefix))
        ))
        .map(name => caches.delete(name)));
}
'''
sw = sw[:cleanup_start] + cleanup_new + sw[cleanup_end:]

# Count actual removals as part of the update summary.
sw = sw.replace('''    let retried = 0;
    const failures = [];
''', '''    let retried = 0;
    let removed = 0;
    const failures = [];
''', 1)
sw = sw.replace('''            if (!newPaths.has(oldFile.path)) {
                await activeCache.delete(new Request(localUrl(oldFile.path)), { ignoreSearch: true });
            }
''', '''            if (!newPaths.has(oldFile.path)) {
                if (await activeCache.delete(new Request(localUrl(oldFile.path)), { ignoreSearch: true })) removed++;
            }
''', 1)
sw = sw.replace('''            downloaded, reused, retried, activeCommit: commit, fileCount: files.length,
            totalBytes, changed: before.activeCommit !== commit,
''', '''            downloaded, reused, retried, removed, activeCommit: commit, fileCount: files.length,
            totalBytes, changed: before.activeCommit !== commit,
''', 1)
worker.write_text(sw)

cache = Path('offlineCache.js')
oc = cache.read_text()
oc = oc.replace("const VERSION = '10';", "const VERSION = '11';", 1)
oc = oc.replace("const SW_URL = 'offlineServiceWorker.js?v=10';", "const SW_URL = 'offlineServiceWorker.js?v=11';", 1)
if "const VERSION = '11';" not in oc:
    raise SystemExit('Could not bump offline cache version')

short_anchor = '''        // Do not short-circuit merely because the commit SHA matches. Explicit
        // Check for updates also verifies every cached response against the
        // manifest and repairs holes/stale entries. Existing healthy files are
        // reused in place, so this is cheap and does not duplicate the game.
        if (before.valid && before.activeCommit === commit) {
            emit({ phase: 'checking', message: 'Build is current. Verifying the local game files…' });
        }
'''
short_new = '''        // A complete cache was integrity-checked when each file was originally
        // stored, and statusResult has just confirmed every manifest path is
        // still physically present. If GitHub reports the same commit there is
        // nothing to download or re-walk: return immediately. Missing entries
        // still fall through to the repair path below.
        if (before.valid && before.healthy !== false && before.activeCommit === commit) {
            const fileCount = before.fileCount || 0;
            emit({
                phase: 'ready', stored: fileCount, processed: fileCount, total: fileCount,
                downloaded: 0, reused: fileCount, retried: 0, failed: 0,
                totalBytes: before.totalBytes || 0,
                message: `Already up to date — ${fileCount} local files reused, 0 downloaded.`,
            });
            return {
                complete: true, changed: false, upToDate: true, usingExisting: true,
                downloaded: 0, reused: fileCount, retried: 0, removed: 0,
                stored: fileCount, total: fileCount, fileCount,
                totalBytes: before.totalBytes || 0,
                commit, activeCommit: commit, previousCommit: commit,
                hasActiveCache: true,
            };
        }
        if (before.valid && before.activeCommit === commit) {
            emit({ phase: 'checking', message: 'Build is current, but the saved copy needs repair…' });
        }
'''
if short_anchor not in oc:
    raise SystemExit('Could not find same-commit verification block')
oc = oc.replace(short_anchor, short_new, 1)

oc = oc.replace(
    'message: `Saving ${files.length} game files (${formatBytes(totalBytes)}) to this device…`,',
    "message: before.valid\n                ? `Comparing ${files.length} game files with the saved copy…`\n                : `Saving ${files.length} game files (${formatBytes(totalBytes)}) to this device…`,",
    1,
)

progress_old = '''        if (progress.total > 0) {
            count.textContent = `Stored ${progress.stored || 0} / ${progress.total} files locally`;
            bar.style.width = `${Math.max(0, Math.min(100, Math.round((progress.stored || 0) * 100 / progress.total)))}%`;
            const parts = [];
            if (progress.message) parts.push(progress.message);
            if (progress.downloaded) parts.push(`${progress.downloaded} downloaded`);
            if (progress.reused) parts.push(`${progress.reused} reused`);
            if (progress.retried) parts.push(`${progress.retried} retries`);
            if (progress.failed) parts.push(`${progress.failed} still failed`);
            if (progress.totalBytes) parts.push(formatBytes(progress.totalBytes));
            if (progress.current) parts.push(progress.current);
            detail.textContent = parts.join(' · ') || progress.message || '';
'''
progress_new = '''        if (progress.total > 0) {
            const checked = Math.max(progress.processed || 0, progress.stored || 0);
            count.textContent = `Checked ${checked} / ${progress.total} files · ${progress.downloaded || 0} downloaded · ${progress.reused || 0} reused`;
            bar.style.width = `${Math.max(0, Math.min(100, Math.round(checked * 100 / progress.total)))}%`;
            const parts = [];
            if (progress.message) parts.push(progress.message);
            if (progress.retried) parts.push(`${progress.retried} retries`);
            if (progress.failed) parts.push(`${progress.failed} still failed`);
            if (progress.totalBytes) parts.push(formatBytes(progress.totalBytes));
            if (progress.current) parts.push(progress.current);
            detail.textContent = parts.join(' · ') || progress.message || '';
'''
if progress_old not in oc:
    raise SystemExit('Could not find update progress display block')
oc = oc.replace(progress_old, progress_new, 1)

oc = oc.replace("const reloadKey = 'hex-offline-reloaded-commit-v10';", "const reloadKey = 'hex-offline-reloaded-commit-v11';", 1)
oc = oc.replace(
    "gate.querySelector('.hex-offline-count').textContent = 'Restarting once so the updated game runs from the phone…';",
    "gate.querySelector('.hex-offline-count').textContent = `${result.downloaded || 0} changed file${result.downloaded === 1 ? '' : 's'} downloaded · ${result.reused || 0} reused${result.removed ? ` · ${result.removed} removed` : ''}. Restarting once…`;",
    1,
)
oc = oc.replace(
    "? 'No newer build found. Your local copy is ready.'",
    "? `No newer build found. ${updateResult.reused || local.fileCount || 0} local files reused; 0 downloaded.`",
    1,
)
cache.write_text(oc)

index = Path('index.html')
html = index.read_text()
html = html.replace('20261001-pwa-offline-cache-v10', '20261001-pwa-offline-cache-v11', 1)
html = html.replace('offlineCache.js?v=10', 'offlineCache.js?v=11', 1)
html = html.replace('humanoidRenderer.js?v=1', 'humanoidRenderer.js?v=2', 1)
if 'offlineCache.js?v=11' not in html or 'humanoidRenderer.js?v=2' not in html:
    raise SystemExit('Could not bump entry-script cache tokens')
index.write_text(html)

print('Applied initiative portrait fallback and offline incremental update v11')
