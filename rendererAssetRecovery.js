// rendererAssetRecovery.js
// Renderer-owned image loads can fail transiently on mobile/Safari or GitHub Pages.
// A failed HTMLImageElement stays broken for the rest of the session unless its
// src is reassigned, so retry a small number of times with a fresh cache key.
(() => {
    'use strict';

    const MAX_RETRIES = 3;
    const RETRY_DELAYS_MS = [100, 350, 900];
    const watched = new WeakSet();
    const retryCounts = new WeakMap();

    function redraw() {
        window.drawMap?.();
        window.renderEntities?.();
        window.refreshDirectionalTurnPortraits?.();
        window.updateAppearancePreview?.();
    }

    function retryUrl(image, attempt) {
        const source = image.currentSrc || image.src;
        if (!source) return null;
        const url = new URL(source, document.baseURI);
        url.searchParams.set(
            'assetRetry',
            `${window.PRESENTATION_BUILD || 'renderer-assets'}-${attempt}-${Date.now()}`,
        );
        return url.href;
    }

    function scheduleRetry(image) {
        if (!(image instanceof HTMLImageElement)) return;
        const attempt = (retryCounts.get(image) || 0) + 1;
        if (attempt > MAX_RETRIES) return;
        retryCounts.set(image, attempt);
        const delay = RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS.at(-1);
        setTimeout(() => {
            if (image.naturalWidth > 0 && image.naturalHeight > 0) return;
            const next = retryUrl(image, attempt);
            if (!next) return;
            console.warn(`Retrying renderer image load (${attempt}/${MAX_RETRIES})`, image.src);
            image.src = next;
        }, delay);
    }

    function watchImage(image) {
        if (!(image instanceof HTMLImageElement) || watched.has(image)) return;
        watched.add(image);
        image.addEventListener('error', () => scheduleRetry(image));
        image.addEventListener('load', () => {
            retryCounts.delete(image);
            redraw();
        });
        // If the failure happened before this recovery module loaded, recover it now.
        if (image.complete && (!image.naturalWidth || !image.naturalHeight)) scheduleRetry(image);
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
    }

    // humanoidRenderer runs immediately before this module, but keep a short scan
    // window because the presentation stack itself is dynamically appended.
    scan();
    const scanTimer = setInterval(scan, 500);
    setTimeout(() => clearInterval(scanTimer), 5000);
    window.addEventListener('load', scan, { once:true });

    window.retryBrokenRendererAssets = scan;
    window.__rendererAssetRecoveryReady = true;
})();
