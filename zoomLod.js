// zoomLod.js
// Conservative zoom-based level of detail for the 2D map renderer.
// Gameplay, LOS, terrain, collision and entity state are untouched: this only
// avoids drawing detail that is sub-pixel or effectively invisible when the
// camera is far out.
(() => {
    'use strict';

    if (window.__zoomLodInstalled) return;

    const MEDIUM_ZOOM = 0.45;
    const FAR_ZOOM = 0.25;
    const VERY_FAR_ZOOM = 0.18;
    const TERRAIN_BUFFER_SLACK_PX = 900; // actual buffer is viewport + 1000px
    const categoryCache = new WeakMap();

    const stats = window.zoomLodStats = {
        drawImageCalls: 0,
        skippedMicro: 0,
        skippedDetail: 0,
        skippedDecor: 0,
        skippedText: 0,
        foliageTintBypasses: 0,
        mediumFrames: 0,
        farFrames: 0,
        fullFrames: 0,
        lastTier: 'full'
    };

    function tierForZoom(zoom = window.cameraZoom || 1) {
        if (zoom < FAR_ZOOM) return 'far';
        if (zoom < MEDIUM_ZOOM) return 'medium';
        return 'full';
    }
    window.getZoomLodTier = tierForZoom;

    function sourceUrl(source) {
        let current = source;
        const seen = new Set();
        while (current && !seen.has(current)) {
            seen.add(current);
            const src = current.currentSrc || current.src;
            if (typeof src === 'string' && src) return src.toLowerCase();
            current = current.__recolorBaseSource || current.__skinBaseSource || null;
        }
        return '';
    }

    function categoryFor(source) {
        if (!source || (typeof source !== 'object' && typeof source !== 'function')) return 'base';
        const cached = categoryCache.get(source);
        if (cached) return cached;
        const src = sourceUrl(source);
        let category = 'base';
        if (/\/(?:hair|characters\/[^/]+\/hair_)/.test(src) || /hair[_-]/.test(src)) {
            category = 'detail';
        } else if (/(?:sword|axe|dagger|bow|crossbow|spear|mace|club|staff|wand|shield|helmet|helm|armou?r|barding)/.test(src)) {
            category = 'detail';
        } else if (/(?:bush_small|bush_large|tree_small|overlay_blood|overlay_skull)/.test(src)) {
            category = 'decor';
        }
        categoryCache.set(source, category);
        return category;
    }

    function isMapLikeContext(ctx) {
        if (!ctx?.canvas) return false;
        if (ctx === window.mapCtx) return true;
        const map = window.mapCanvas;
        if (!map || ctx.canvas === map) return false;
        return ctx.canvas.width >= map.width + TERRAIN_BUFFER_SLACK_PX &&
               ctx.canvas.height >= map.height + TERRAIN_BUFFER_SLACK_PX;
    }

    function destinationSize(args, source) {
        // Canvas drawImage signatures: (img, dx, dy), (img, dx, dy, dw, dh),
        // or (img, sx, sy, sw, sh, dx, dy, dw, dh).
        if (args.length >= 9) return { w: Math.abs(Number(args[7])) || 0, h: Math.abs(Number(args[8])) || 0 };
        if (args.length >= 5) return { w: Math.abs(Number(args[3])) || 0, h: Math.abs(Number(args[4])) || 0 };
        const w = source?.naturalWidth || source?.width || Infinity;
        const h = source?.naturalHeight || source?.height || Infinity;
        return { w, h };
    }

    const proto = window.CanvasRenderingContext2D?.prototype;
    if (!proto || typeof proto.drawImage !== 'function') return;

    const originalDrawImage = proto.drawImage;
    if (!originalDrawImage.__zoomLodWrapped) {
        const wrappedDrawImage = function(source, ...args) {
            const zoom = Number(window.cameraZoom) || 1;
            if (zoom >= MEDIUM_ZOOM || !isMapLikeContext(this)) {
                return originalDrawImage.call(this, source, ...args);
            }

            stats.drawImageCalls++;
            const tier = tierForZoom(zoom);
            stats.lastTier = tier;
            const { w, h } = destinationSize(args, source);
            const maxDim = Math.max(w, h);
            const category = categoryFor(source);

            // At medium zoom only discard truly sub-pixel work. This should be
            // visually indistinguishable and is intentionally conservative.
            if (tier === 'medium') {
                if (maxDim < 1.25) {
                    stats.skippedMicro++;
                    return;
                }
                return originalDrawImage.call(this, source, ...args);
            }

            // At far zoom the player cannot resolve equipment/hair layers or
            // individual shrubs/trees, while base body and terrain sprites are
            // still large enough to preserve silhouettes and map readability.
            if (category === 'detail') {
                stats.skippedDetail++;
                return;
            }
            if (category === 'decor') {
                stats.skippedDecor++;
                return;
            }

            // Generic micro-draw guard for uncategorised tiny props. Terrain
            // hexes are ~9px across even at the 0.15x minimum, so this cannot
            // remove the base map.
            const microThreshold = zoom < VERY_FAR_ZOOM ? 3.0 : 2.0;
            if (maxDim < microThreshold) {
                stats.skippedMicro++;
                return;
            }
            return originalDrawImage.call(this, source, ...args);
        };
        wrappedDrawImage.__zoomLodWrapped = true;
        wrappedDrawImage.__original = originalDrawImage;
        proto.drawImage = wrappedDrawImage;
    }

    function wrapTextMethod(name) {
        const current = proto[name];
        if (typeof current !== 'function' || current.__zoomLodWrapped) return;
        const wrapped = function(...args) {
            if ((window.cameraZoom || 1) < FAR_ZOOM && isMapLikeContext(this)) {
                stats.skippedText++;
                return;
            }
            return current.apply(this, args);
        };
        wrapped.__zoomLodWrapped = true;
        wrapped.__original = current;
        proto[name] = wrapped;
    }
    wrapTextMethod('fillText');
    wrapTextMethod('strokeText');

    // Seasonal foliage recolouring creates/touches a tinted canvas per source.
    // At low zoom the colour nuance is not resolvable, so return the authored
    // foliage image unchanged. Character/monster recolours are left alone.
    function installFoliageTintBypass() {
        const current = window.getRecoloredHairSprite;
        if (typeof current !== 'function') return false;
        if (current.__zoomLodFoliageBypass) return true;
        const wrapped = function(img, ...args) {
            const src = sourceUrl(img);
            if ((window.cameraZoom || 1) < MEDIUM_ZOOM && /(?:bush_small|bush_large|tree_small)/.test(src)) {
                stats.foliageTintBypasses++;
                return img;
            }
            return current.call(this, img, ...args);
        };
        wrapped.__zoomLodFoliageBypass = true;
        wrapped.__original = current;
        window.getRecoloredHairSprite = wrapped;
        return true;
    }
    if (!installFoliageTintBypass()) {
        const tintTimer = setInterval(() => {
            if (installFoliageTintBypass()) clearInterval(tintTimer);
        }, 50);
        setTimeout(() => clearInterval(tintTimer), 15000);
    }

    // Sample the active tier once per rendered animation frame for diagnostics.
    let lastRaf = -1;
    function sampleTier(ts) {
        if (ts !== lastRaf) {
            lastRaf = ts;
            const tier = tierForZoom();
            stats.lastTier = tier;
            if (tier === 'far') stats.farFrames++;
            else if (tier === 'medium') stats.mediumFrames++;
            else stats.fullFrames++;
        }
        requestAnimationFrame(sampleTier);
    }
    requestAnimationFrame(sampleTier);

    function diagnosticsText() {
        return [
            'ZOOM LOD',
            '========',
            `Tier: ${stats.lastTier} | zoom=${Number(window.cameraZoom || 1).toFixed(2)} | thresholds far<${FAR_ZOOM}, medium<${MEDIUM_ZOOM}`,
            `LOD frames: full=${stats.fullFrames}, medium=${stats.mediumFrames}, far=${stats.farFrames}`,
            `Image draws considered=${stats.drawImageCalls} | skipped detail=${stats.skippedDetail}, decor=${stats.skippedDecor}, micro=${stats.skippedMicro}`,
            `Map text skipped=${stats.skippedText} | foliage tint bypasses=${stats.foliageTintBypasses}`,
            'NOTE: LOD is visual only; terrain, fog, LOS, collision and entity simulation are unchanged.'
        ].join('\n');
    }
    window.getZoomLodDiagnostics = diagnosticsText;

    function installClipboardAppender() {
        const clipboard = navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') return false;
        if (clipboard.writeText.__zoomLodAppender) return true;
        const current = clipboard.writeText.bind(clipboard);
        const wrapped = function(text) {
            if (typeof text === 'string' && text.startsWith('HEX-CRPG PERFORMANCE REPORT') && !text.includes('\nZOOM LOD\n')) {
                text += `\n\n${diagnosticsText()}`;
            }
            return current(text);
        };
        wrapped.__zoomLodAppender = true;
        wrapped.__original = current;
        try { clipboard.writeText = wrapped; } catch (_) { return false; }
        return true;
    }
    if (!installClipboardAppender()) {
        const clipboardTimer = setInterval(() => {
            if (installClipboardAppender()) clearInterval(clipboardTimer);
        }, 250);
        setTimeout(() => clearInterval(clipboardTimer), 15000);
    }

    window.__zoomLodInstalled = true;
})();
