// rendererAssetRecovery.js
// Renderer-owned image loads can fail transiently on mobile/Safari or GitHub Pages.
// A failed HTMLImageElement stays broken for the rest of the session unless its
// src is reassigned, so retry a small number of times with a fresh cache key.
//
// This module also normalises human armour onto the canonical equipment folder.
// humanoidRenderer.js historically bootstrapped older root-level armour art; the
// canonical high-quality fronts and matching rear WebPs now live together under
// images/equipment/armour/human/ and must be the images the compositor actually uses.
(() => {
    'use strict';

    const MAX_RETRIES = 3;
    const RETRY_DELAYS_MS = [100, 350, 900];
    const watched = new WeakSet();
    const retryCounts = new WeakMap();
    const canonicalArmourAssets = {};
    const CANONICAL_ARMOUR_PATHS = {
        light: {
            front:'images/equipment/armour/human/light.png',
            back:'images/equipment/armour/human/light_back.webp',
            legacyKey:'humanLight',
        },
        medium: {
            front:'images/equipment/armour/human/medium.png',
            back:'images/equipment/armour/human/medium_back.webp',
            legacyKey:'humanMedium',
        },
        heavy: {
            front:'images/equipment/armour/human/heavy.png',
            back:'images/equipment/armour/human/heavy_back.webp',
            legacyKey:'humanHeavy',
        },
    };

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
            updateCanonicalArmourReadyFlag();
        });
        // If the failure happened before this recovery module loaded, recover it now.
        if (image.complete && (!image.naturalWidth || !image.naturalHeight)) scheduleRetry(image);
    }

    function rendererUrl(path) {
        const build = encodeURIComponent(window.PRESENTATION_BUILD || 'canonical-armour-v1');
        return `${path}?build=${build}`;
    }

    function canonicalImage(path) {
        const image = new Image();
        watchImage(image);
        image.src = rendererUrl(path);
        return image;
    }

    function ensureCanonicalArmourImages() {
        for (const [tier, paths] of Object.entries(CANONICAL_ARMOUR_PATHS)) {
            if (canonicalArmourAssets[tier]) continue;
            canonicalArmourAssets[tier] = {
                front:canonicalImage(paths.front),
                back:canonicalImage(paths.back),
            };
        }
        window.CANONICAL_ARMOUR_ASSETS = canonicalArmourAssets;
        window.CANONICAL_ARMOUR_PATHS = CANONICAL_ARMOUR_PATHS;
    }

    function installCanonicalArmourSources() {
        ensureCanonicalArmourImages();
        const direct = window.ARMOUR_VISUAL_ASSETS;
        if (!direct) return false;

        const rear = window.REAR_HUMAN_EQUIPMENT_ASSETS?.armour;
        const visuals = window.gameVisuals;
        for (const [tier, paths] of Object.entries(CANONICAL_ARMOUR_PATHS)) {
            const canonical = canonicalArmourAssets[tier];
            const pair = direct[tier];
            if (!pair || !canonical) continue;

            // ARMOUR_VISUAL_ASSETS is the same object referenced by the direct
            // compositor internally, so replacing these properties changes the
            // actual front/side/back renderer source rather than merely a UI alias.
            pair.front = canonical.front;
            pair.back = canonical.back;

            // Keep compatibility/fallback consumers on the same physical art.
            // If equipmentAppearance has installed accessors, these assignments
            // intentionally flow through its setters and preserve colour support.
            if (rear) rear[tier] = canonical.back;
            if (visuals) visuals[paths.legacyKey] = canonical.front;
        }
        updateCanonicalArmourReadyFlag();
        return true;
    }

    function updateCanonicalArmourReadyFlag() {
        const ready = Object.keys(CANONICAL_ARMOUR_PATHS).every(tier => {
            const pair = canonicalArmourAssets[tier];
            return pair?.front?.naturalWidth > 0 && pair?.front?.naturalHeight > 0
                && pair?.back?.naturalWidth > 0 && pair?.back?.naturalHeight > 0;
        });
        window.__canonicalArmourAssetsReady = ready;
        return ready;
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
        installCanonicalArmourSources();
        walk(window.DIRECTIONAL_CHARACTER_ASSETS);
        walk(window.ARMOUR_VISUAL_ASSETS);
        walk(window.SHIELD_VISUAL_ASSETS);
        walk(window.REAR_HUMAN_EQUIPMENT_ASSETS);
    }

    // humanoidRenderer runs immediately before this module. Keep the sync window
    // open long enough for main.js's creator-time background preload to finish;
    // otherwise that legacy preload could overwrite gameVisuals with the old art.
    scan();
    const scanTimer = setInterval(scan, 500);
    setTimeout(() => clearInterval(scanTimer), 15000);
    window.addEventListener('load', scan, { once:true });

    window.retryBrokenRendererAssets = scan;
    window.installCanonicalArmourSources = installCanonicalArmourSources;
    window.__rendererAssetRecoveryReady = true;
})();
