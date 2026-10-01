from pathlib import Path

p = Path('offlineCache.js')
text = p.read_text()
old = """        if (!isStandaloneWebApp()) {
            releaseReadyBarrier({ complete: true, browserMode: true, hasActiveCache: false });
            Promise.resolve().then(cleanupSafariOfflineControl).catch(() => {});
            return;
        }
"""
new = """        if (!isStandaloneWebApp()) {
            // Ordinary Safari should not run the Home Screen app's offline launcher,
            // but it must also never unregister workers or delete hex-game-* caches.
            // On current iOS versions Safari and the installed Home Screen app can
            // expose shared service-worker/Cache Storage state, so destructive
            // cleanup here can erase the installed app's complete local copy.
            releaseReadyBarrier({ complete: true, browserMode: true, hasActiveCache: false });
            return;
        }
"""
if old not in text:
    raise SystemExit('startup Safari cleanup block not found')
text = text.replace(old, new, 1)
p.write_text(text)

idx = Path('index.html')
html = idx.read_text()
old_marker = '20261001-pwa-offline-cache-v15-inspector3'
old_script = 'offlineCache.js?v=15-inspector3'
if old_marker not in html:
    raise SystemExit('expected app-build marker not found')
if old_script not in html:
    raise SystemExit('expected offlineCache script marker not found')
html = html.replace(old_marker, '20261001-pwa-offline-cache-v15-safari-storage-fix', 1)
html = html.replace(old_script, 'offlineCache.js?v=15-safari-storage-fix', 1)
idx.write_text(html)
