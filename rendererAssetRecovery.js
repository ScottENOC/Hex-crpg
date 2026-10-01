// rendererAssetRecovery.js
// Health/diagnostic observer for renderer-owned images.
//
// Network retries now belong to assetLoadScheduler.js / window.assetManager.
// This module intentionally does not reassign Image.src: stacking a second retry
// state machine here was one of the causes of duplicate requests and cache-bust
// churn on iOS/GitHub Pages.
(() => {
    'use strict';

    const watched = new WeakSet();
    const reportedFailures = new WeakSet();

    function redraw() {
        window.drawMap?.();
        window.renderEntities?.();
        window.refreshDirectionalTurnPortraits?.();
        window.updateAppearancePreview?.();
    }

    function armourReady() {
        const armour = window.ARMOUR_VISUAL_ASSETS;
        const ready = ['light','medium','heavy'].every(tier => {
            const pair = armour?.[tier];
            return pair?.front?.naturalWidth > 0 && pair?.front?.naturalHeight > 0
                && pair?.back?.naturalWidth > 0 && pair?.back?.naturalHeight > 0;
        });
        window.__canonicalArmourAssetsReady = ready;
        return ready;
    }

    function reportFailure(image,event) {
        if (reportedFailures.has(image)) return;
        reportedFailures.add(image);
        const source=image.currentSrc || image.src || event?.assetPath || '(unknown image)';
        const reason=event?.assetLoadSchedulerReason || 'image-error';
        console.warn('Renderer asset unavailable after shared loader retries:', source, reason);
        window.dispatchEvent(new CustomEvent('rendererasseterror', {
            detail:{src:source,reason},
        }));
    }

    function watchImage(image) {
        if (!(image instanceof HTMLImageElement) || watched.has(image)) return;
        watched.add(image);
        image.addEventListener('error', event => reportFailure(image,event));
        image.addEventListener('load', () => {
            reportedFailures.delete(image);
            armourReady();
            redraw();
        });
        // An image can have failed before this observer was appended. Report it,
        // but do not start another retry loop; AssetManager is the retry owner.
        if (image.complete && (!image.naturalWidth || !image.naturalHeight) && image.src) {
            reportFailure(image,{assetLoadSchedulerReason:'already-failed'});
        }
    }

    function walk(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object') return;
        if (value instanceof HTMLImageElement) {
            watchImage(value);
            return;
        }
        if (seen.has(value)) return;
        seen.add(value);
        for (const child of Object.values(value)) walk(child, seen);
    }

    function scan() {
        walk(window.DIRECTIONAL_CHARACTER_ASSETS);
        walk(window.ARMOUR_VISUAL_ASSETS);
        walk(window.SHIELD_VISUAL_ASSETS);
        walk(window.REAR_HUMAN_EQUIPMENT_ASSETS);
        armourReady();
    }

    scan();
    const scanTimer = setInterval(scan, 500);
    setTimeout(() => clearInterval(scanTimer), 5000);
    window.addEventListener('load', scan, { once:true });

    // Keep the old public hook for callers/tests. It now re-scans and reports;
    // actual retry decisions remain centralised in AssetManager.
    window.retryBrokenRendererAssets = scan;
    window.__rendererAssetRecoveryReady = true;
})();