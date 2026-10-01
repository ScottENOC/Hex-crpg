from pathlib import Path

cache_path = Path('offlineCache.js')
text = cache_path.read_text(encoding='utf-8')
start_marker = '    async function cleanupSafariOfflineControl() {'
end_marker = '    async function storageDiagnostic() {'
if start_marker not in text:
    raise SystemExit('cleanupSafariOfflineControl block not found')
start = text.index(start_marker)
end = text.index(end_marker, start)
text = text[:start] + text[end:]
cache_path.write_text(text, encoding='utf-8')

test_path = Path('tests-unit/offline-cache-regression.test.js')
test_path.write_text(r'''const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const launcherSource = fs.readFileSync(path.join(root, 'offlineCache.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'offlineServiceWorker.js'), 'utf8');

function extractFunction(source, signature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `Missing function: ${signature}`);
    const braceStart = source.indexOf('{', start);
    assert.notEqual(braceStart, -1, `Missing opening brace: ${signature}`);
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let i = braceStart; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    assert.fail(`Unclosed function: ${signature}`);
}

test('ordinary Safari never deletes or unregisters the installed offline copy', () => {
    assert.doesNotMatch(launcherSource, /cleanupSafariOfflineControl/,
        'Destructive Safari cleanup must not be reintroduced');

    const startup = extractFunction(launcherSource, 'async function startup()');
    const guardStart = startup.indexOf('if (!isStandaloneWebApp())');
    const gateStart = startup.indexOf('const gate = ensureGate()');
    assert.ok(guardStart >= 0 && gateStart > guardStart, 'Expected ordinary-Safari startup guard');
    const safariGuard = startup.slice(guardStart, gateStart);

    assert.match(safariGuard, /releaseReadyBarrier/);
    assert.doesNotMatch(safariGuard, /caches\.(?:delete|keys|open)\s*\(/,
        'Ordinary Safari must not mutate Cache Storage');
    assert.doesNotMatch(safariGuard, /\.unregister\s*\(/,
        'Ordinary Safari must not unregister the Home Screen service worker');
});

test('same-commit update short-circuits to zero downloads and all files reused', () => {
    const syncInternal = extractFunction(launcherSource, 'async function syncInternal()');
    const sameCommit = syncInternal.match(
        /if \(before\.valid && before\.healthy !== false && before\.activeCommit === commit\) \{([\s\S]*?)\n        \}/
    );
    assert.ok(sameCommit, 'Expected healthy same-commit fast path');
    const body = sameCommit[1];

    assert.match(body, /const fileCount = before\.fileCount \|\| 0/);
    assert.match(body, /downloaded:\s*0/);
    assert.match(body, /reused:\s*fileCount/);
    assert.match(body, /upToDate:\s*true/);
    assert.match(body, /changed:\s*false/);
    assert.doesNotMatch(body, /runWorkerCache|cacheGame/,
        'An unchanged healthy build should not enter the download/cache path');
});

test('worker reuses manifest-SHA matches before any changed-file download', () => {
    const cacheOne = extractFunction(workerSource, 'async function cacheOne(file)');
    const matchPos = cacheOne.indexOf('activeShaByPath.get(file.path) === file.sha');
    const reusePos = cacheOne.indexOf('reused++', matchPos);
    const returnPos = cacheOne.indexOf('return;', reusePos);
    const downloadPos = cacheOne.indexOf('downloadVerifiedFile');

    assert.ok(matchPos >= 0, 'Expected manifest SHA equality check');
    assert.ok(reusePos > matchPos, 'Expected matching files to increment reuse count');
    assert.ok(returnPos > reusePos, 'Expected matching files to return before download');
    assert.ok(downloadPos > returnPos, 'Download must happen only after the reuse fast path');
    assert.match(cacheOne, /!reportedMissingPaths\.has\(file\.path\)/,
        'A recorded runtime miss must still force repair');
});
''', encoding='utf-8')
