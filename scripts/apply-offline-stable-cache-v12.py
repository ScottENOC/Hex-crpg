from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing anchor: {label}')
    return text.replace(old, new, 1)

# offlineCache.js
p = Path('offlineCache.js')
s = p.read_text()
s = replace_once(s, "const VERSION = '11';", "const VERSION = '12';", 'offline VERSION')
s = replace_once(s, "const SW_URL = 'offlineServiceWorker.js?v=11';", "const SW_URL = 'offlineServiceWorker.js?v=12';", 'worker URL')

old = """    function isRuntimeFile(entry) {\n        if (!entry || entry.type !== 'blob' || !entry.path) return false;\n        const path = entry.path;\n        if (path === 'index.html' || path === 'manifest.webmanifest' || path === 'appstore/icon-1024.png') return true;\n        if (/^(?:images|audio|vendor)\\//.test(path)) return true;\n        if (!path.includes('/') && /\\.(?:js|css)$/i.test(path)) {\n            return !new Set(['server.js', 'gameEngine.js_new', 'learnSkill_fixed.js']).has(path);\n        }\n        return false;\n    }\n\n    function runtimeFilesFromTree(tree) {\n        return (tree || [])\n            .filter(isRuntimeFile)\n            .map(entry => ({ path: entry.path, sha: entry.sha, size: Number(entry.size) || 0 }))\n            .sort((a, b) => a.path.localeCompare(b.path));\n    }\n"""
new = """    function isRuntimePath(path) {\n        if (!path) return false;\n        if (path === 'index.html' || path === 'manifest.webmanifest' || path === 'appstore/icon-1024.png') return true;\n        if (/^(?:images|audio|vendor)\\//.test(path)) return true;\n        if (!path.includes('/') && /\\.(?:js|css)$/i.test(path)) {\n            return !new Set(['server.js', 'gameEngine.js_new', 'learnSkill_fixed.js']).has(path);\n        }\n        return false;\n    }\n\n    function isRuntimeFile(entry) {\n        return !!entry && entry.type === 'blob' && isRuntimePath(entry.path);\n    }\n\n    function runtimeFilesFromTree(tree) {\n        return (tree || [])\n            .filter(isRuntimeFile)\n            .map(entry => ({ path: entry.path, sha: entry.sha, size: Number(entry.size) || 0 }))\n            .sort((a, b) => a.path.localeCompare(b.path));\n    }\n\n    async function getChangedRuntimePaths(baseCommit, targetCommit) {\n        if (!/^[0-9a-f]{40}$/i.test(baseCommit || '') || !/^[0-9a-f]{40}$/i.test(targetCommit || '') || baseCommit === targetCommit) return null;\n        try {\n            const compare = await fetchJsonWithRetries(\n                `${API_BASE}/compare/${encodeURIComponent(baseCommit)}...${encodeURIComponent(targetCommit)}`,\n                'GitHub changed-file check'\n            );\n            const changedFiles = Array.isArray(compare?.files) ? compare.files : null;\n            // GitHub's compare endpoint caps the file list. Never treat a capped\n            // list as exhaustive; fall back to manifest SHA comparison instead.\n            if (!changedFiles || changedFiles.length >= 300) return null;\n            const changed = new Set();\n            for (const file of changedFiles) {\n                if (isRuntimePath(file?.filename)) changed.add(file.filename);\n                if (isRuntimePath(file?.previous_filename)) changed.add(file.previous_filename);\n            }\n            return [...changed];\n        } catch (error) {\n            console.warn('Changed-file comparison unavailable; falling back to manifest SHAs.', error);\n            return null;\n        }\n    }\n"""
s = replace_once(s, old, new, 'runtime path helpers')

old = """    async function runWorkerCache(worker, commit, files) {\n        return workerRequest(worker, {\n            type: 'HEX_CACHE_GAME',\n            commit,\n            branch: BRANCH,\n            owner: OWNER,\n            repo: REPO,\n            files,\n        }, {\n"""
new = """    async function runWorkerCache(worker, commit, files, changedPaths = null) {\n        return workerRequest(worker, {\n            type: 'HEX_CACHE_GAME',\n            commit,\n            branch: BRANCH,\n            owner: OWNER,\n            repo: REPO,\n            files,\n            changedPaths: Array.isArray(changedPaths) ? changedPaths : null,\n        }, {\n"""
s = replace_once(s, old, new, 'runWorkerCache signature')

anchor = """        if (before.valid && before.activeCommit === commit) {\n            emit({ phase: 'checking', message: 'Build is current, but the saved copy needs repair…' });\n        }\n\n        // A valid existing copy does not need another storage-capacity probe.\n"""
replacement = """        if (before.valid && before.activeCommit === commit) {\n            emit({ phase: 'checking', message: 'Build is current, but the saved copy needs repair…' });\n        }\n\n        let changedPaths = null;\n        if (before.valid && before.activeCommit && before.activeCommit !== commit) {\n            emit({ phase: 'checking', message: 'Finding which game files actually changed…' });\n            changedPaths = await getChangedRuntimePaths(before.activeCommit, commit);\n            if (changedPaths) {\n                emit({\n                    phase: 'checking',\n                    message: `${changedPaths.length} runtime file${changedPaths.length === 1 ? '' : 's'} changed since the saved build. Unchanged files will stay on the phone.`,\n                });\n            }\n        }\n\n        // A valid existing copy does not need another storage-capacity probe.\n"""
s = replace_once(s, anchor, replacement, 'changed paths insertion')
s = s.replace('result = await runWorkerCache(worker, commit, files);', 'result = await runWorkerCache(worker, commit, files, changedPaths);')
if s.count('runWorkerCache(worker, commit, files, changedPaths)') != 2:
    raise SystemExit('Expected both initial and retry worker calls to use changedPaths')
p.write_text(s)

# offlineServiceWorker.js
p = Path('offlineServiceWorker.js')
s = p.read_text()
s = replace_once(s, "const SW_VERSION = '11';", "const SW_VERSION = '12';", 'SW version')
old = """const META_CACHE = `hex-game-meta-v${SW_VERSION}`;\nconst GAME_CACHE_PREFIX = `hex-game-v${SW_VERSION}-`;\nconst LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v10-', 'hex-game-v9-', 'hex-game-v8-', 'hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];\nconst LEGACY_META_CACHES = ['hex-game-meta-v10', 'hex-game-meta-v9', 'hex-game-meta-v8', 'hex-game-meta-v7', 'hex-game-meta-v6', 'hex-game-meta-v5', 'hex-game-meta-v4', 'hex-game-meta-v3', 'hex-game-meta-v2', 'hex-game-meta-v1'];\n"""
new = """// These names are intentionally NOT versioned. Worker implementation versions\n// may change without making the stored game copy foreign to the next worker.\nconst META_CACHE = 'hex-game-meta';\nconst GAME_CACHE_PREFIX = 'hex-game-cache-';\nconst LEGACY_GAME_CACHE_PREFIXES = ['hex-game-v11-', 'hex-game-v10-', 'hex-game-v9-', 'hex-game-v8-', 'hex-game-v7-', 'hex-game-v6-', 'hex-game-v5-', 'hex-game-v4-', 'hex-game-v3-', 'hex-game-v2-', 'hex-game-v1-'];\nconst LEGACY_META_CACHES = ['hex-game-meta-v11', 'hex-game-meta-v10', 'hex-game-meta-v9', 'hex-game-meta-v8', 'hex-game-meta-v7', 'hex-game-meta-v6', 'hex-game-meta-v5', 'hex-game-meta-v4', 'hex-game-meta-v3', 'hex-game-meta-v2', 'hex-game-meta-v1'];\n"""
s = replace_once(s, old, new, 'stable cache constants')

anchor = """    const files = Array.isArray(message.files) ? message.files.filter(file => file?.path && file?.sha) : [];\n    if (!/^[0-9a-f]{40}$/i.test(commit) || !owner || !repo || !files.length) {\n"""
replacement = """    const files = Array.isArray(message.files) ? message.files.filter(file => file?.path && file?.sha) : [];\n    const changedPathSet = Array.isArray(message.changedPaths) ? new Set(message.changedPaths.filter(Boolean)) : null;\n    if (!/^[0-9a-f]{40}$/i.test(commit) || !owner || !repo || !files.length) {\n"""
s = replace_once(s, anchor, replacement, 'changedPathSet parse')

old = """        if (activeCache && activeShaByPath.get(file.path) === file.sha && !missingActivePaths.has(file.path)) {\n            reused++;\n            stored++;\n            return;\n        }\n"""
new = """        const physicallyPresent = activeCache && !missingActivePaths.has(file.path);\n        const compareSaysUnchanged = changedPathSet && !changedPathSet.has(file.path);\n        const manifestShaMatches = activeShaByPath.get(file.path) === file.sha;\n        if (physicallyPresent && (compareSaysUnchanged || manifestShaMatches)) {\n            reused++;\n            stored++;\n            return;\n        }\n"""
s = replace_once(s, old, new, 'reuse decision')

old = """    sendProgress('', 'storing', before.valid\n        ? `Checking ${files.length} files; unchanged files stay in place…`\n        : `Saving ${files.length} files locally…`);\n"""
new = """    sendProgress('', 'storing', before.valid\n        ? changedPathSet\n            ? `Checking ${files.length} files; GitHub reports ${changedPathSet.size} changed runtime file${changedPathSet.size === 1 ? '' : 's'}…`\n            : `Checking ${files.length} files; unchanged files stay in place…`\n        : `Saving ${files.length} files locally…`);\n"""
s = replace_once(s, old, new, 'progress changed count')

old = """            downloaded, reused, retried, removed, activeCommit: commit, fileCount: files.length,\n            totalBytes, changed: before.activeCommit !== commit,\n"""
new = """            downloaded, reused, retried, removed, activeCommit: commit, fileCount: files.length,\n            totalBytes, changed: before.activeCommit !== commit,\n            recoveredCache: before.cacheName || null, recoveredFromMeta: before.recoveredFromMeta || null,\n            changedHintCount: changedPathSet ? changedPathSet.size : null,\n"""
s = replace_once(s, old, new, 'result diagnostics')
p.write_text(s)

# index.html cache bust
p = Path('index.html')
s = p.read_text()
s = replace_once(s, 'offlineCache.js?v=11', 'offlineCache.js?v=12', 'index offlineCache version')
s = replace_once(s, 'humanoidRenderer.js?v=2', 'humanoidRenderer.js?v=2', 'renderer no-op') if 'humanoidRenderer.js?v=2' in s else s
p.write_text(s)
