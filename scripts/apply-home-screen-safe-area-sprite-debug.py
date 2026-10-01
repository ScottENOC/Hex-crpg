from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))

# 1) Restore the direct humanoid compositor to the actual browser script graph.
index = Path('index.html')
html = index.read_text()
if 'humanoidRenderer.js' not in html:
    needle = '    <script src="spriteRecolor.js?v=6"></script>\n'
    if needle not in html:
        raise SystemExit('Could not find spriteRecolor script insertion point in index.html')
    html = html.replace(
        needle,
        needle + '    <script src="humanoidRenderer.js?v=1"></script>\n',
        1,
    )
# asset scheduler changed below; force iOS to request the new entry script.
html, n = re.subn(r'assetLoadScheduler\.js\?v=\d+', 'assetLoadScheduler.js?v=9', html, count=1)
if n != 1:
    raise SystemExit('Could not bump assetLoadScheduler cache token in index.html')
index.write_text(html)

# 2) Make image failures visible on a phone without a developer console.
scheduler = Path('assetLoadScheduler.js')
js = scheduler.read_text()
js = js.replace("const SCHEDULER_VERSION = '8';", "const SCHEDULER_VERSION = '9';", 1)
if "const SCHEDULER_VERSION = '9';" not in js:
    raise SystemExit('Could not bump scheduler version')

marker = '/* HOME_SCREEN_ART_DIAGNOSTICS_V1 */'
if marker not in js:
    anchor = '    const domBindingTokens = new WeakMap();\n'
    if anchor not in js:
        raise SystemExit('Could not find asset scheduler diagnostics insertion point')
    diagnostics = r'''    /* HOME_SCREEN_ART_DIAGNOSTICS_V1 */
    const reportedAssetFailures = new Set();
    const assetFailureLog = [];

    function reportAssetFailure(value, error, source = 'asset-manager') {
        const path = canonicalPath(value || '(unknown image)');
        const key = `${source}:${path}`;
        if (reportedAssetFailures.has(key)) return;
        reportedAssetFailures.add(key);
        const detail = {
            path,
            source,
            message: error?.message || String(error || 'Image load failed'),
            at: Date.now(),
        };
        assetFailureLog.push(detail);
        if (assetFailureLog.length > 50) assetFailureLog.shift();
        console.warn('Art asset failed:', detail);
        try { window.dispatchEvent(new CustomEvent('hex-art-asset-error', { detail })); } catch (_) {}

        // iPhone/Home Screen testing normally has no developer console. Put the
        // exact failing path into the in-game message log once that UI exists.
        let attempts = 0;
        const announce = () => {
            if (typeof window.showMessage === 'function') {
                window.showMessage(`Art failed to load: ${path}`);
                return;
            }
            if (attempts++ < 12) setTimeout(announce, 750);
        };
        announce();
    }

    // Catch image elements that bypass AssetManager as well. Managed images
    // report only after their own retries are exhausted, so transient retry
    // failures are not announced twice.
    window.addEventListener('error', event => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        const raw = image.currentSrc || nativeSrc.get.call(image) || image.getAttribute('src') || '';
        const path = normalise(raw);
        if (!path) return;
        const managed = managerRecords.get(recordKey(path));
        if (managed && managed.status !== 'error' && managed.status !== 'suppressed') return;
        setTimeout(() => {
            const latest = managerRecords.get(recordKey(path));
            if (latest && latest.status !== 'error' && latest.status !== 'suppressed') return;
            reportAssetFailure(path, latest?.error || new Error('Browser image element failed to load'), latest ? 'asset-manager' : 'unmanaged-image');
        }, 0);
    }, true);
'''
    js = js.replace(anchor, anchor + diagnostics, 1)

    final_error = "                record.reject(record.error);\n                done();"
    replacement = "                record.reject(record.error);\n                reportAssetFailure(record.path, record.error, 'asset-manager');\n                done();"
    if final_error not in js:
        raise SystemExit('Could not find final managed-image error path')
    js = js.replace(final_error, replacement, 1)

    ready_anchor = "            record.nextRetryAt=0;\n            record.resolve(record.image);"
    ready_replacement = "            record.nextRetryAt=0;\n            reportedAssetFailures.delete(`asset-manager:${record.path}`);\n            record.resolve(record.image);"
    if ready_anchor not in js:
        raise SystemExit('Could not find managed-image success path')
    js = js.replace(ready_anchor, ready_replacement, 1)

    api_anchor = "        get cacheSize(){return managerRecords.size;},\n"
    api_replacement = "        get cacheSize(){return managerRecords.size;},\n        getFailures(){return assetFailureLog.map(item=>({...item}));},\n"
    if api_anchor not in js:
        raise SystemExit('Could not expose art diagnostics')
    js = js.replace(api_anchor, api_replacement, 1)

scheduler.write_text(js)

# The direct renderer should use canonical organised art paths instead of
# depending on an AssetManager legacy redirect. This back-view helmet moved
# into images/equipment/helmets/ with the rest of the equipment art.
renderer = Path('humanoidRenderer.js')
renderer_js = renderer.read_text()
renderer_js = renderer_js.replace(
    "helmet:'images/nasalHelm_back.svg'",
    "helmet:'images/equipment/helmets/nasal_helm_back.svg'",
    1,
)
if "helmet:'images/equipment/helmets/nasal_helm_back.svg'" not in renderer_js:
    raise SystemExit('Could not canonicalise humanoid rear helmet path')
renderer.write_text(renderer_js)

# 3) Respect the iPhone camera/status bar/home indicator across modal screens.
style = Path('style.css')
css = style.read_text()
safe_marker = '/* HOME_SCREEN_SAFE_AREA_V1 */'
if safe_marker not in css:
    css += r'''

/* HOME_SCREEN_SAFE_AREA_V1
   Home Screen PWAs with viewport-fit=cover deliberately use the full display,
   but interactive chrome must stay outside the Dynamic Island/status bar and
   home-indicator areas. env() resolves to zero on devices without cut-outs. */
.modal {
    box-sizing: border-box;
    padding-top: max(8px, env(safe-area-inset-top, 0px));
    padding-right: max(8px, env(safe-area-inset-right, 0px));
    padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
    padding-left: max(8px, env(safe-area-inset-left, 0px));
}

.modal-content {
    margin: 0 auto;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px);
    box-sizing: border-box;
}

.close-btn {
    top: 0;
    right: 0;
    min-width: 44px;
    min-height: 44px;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

#characterCreator {
    box-sizing: border-box;
    padding-top: max(8px, env(safe-area-inset-top, 0px));
    padding-right: max(8px, env(safe-area-inset-right, 0px));
    padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
    padding-left: max(8px, env(safe-area-inset-left, 0px));
}

@media (max-width: 850px) {
    /* The earlier phone rule used top:60px and accidentally discarded the
       safe-area component already present in the desktop rule. */
    #top-menu {
        top: calc(60px + env(safe-area-inset-top, 0px)) !important;
        padding-left: max(1px, env(safe-area-inset-left, 0px)) !important;
        padding-right: max(1px, env(safe-area-inset-right, 0px)) !important;
    }

    #gameContainer {
        bottom: env(safe-area-inset-bottom, 0px) !important;
        padding-left: env(safe-area-inset-left, 0px);
        padding-right: env(safe-area-inset-right, 0px);
    }

    #ui-container {
        padding-left: max(5px, env(safe-area-inset-left, 0px));
        padding-right: max(5px, env(safe-area-inset-right, 0px));
        padding-bottom: max(5px, env(safe-area-inset-bottom, 0px));
    }
}
'''
style.write_text(css)

print('Applied Home Screen safe-area, humanoid renderer, canonical helmet path, and art diagnostics changes')
