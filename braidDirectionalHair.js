// Direction-specific support for the shoulder braid hairstyle.
(() => {
    'use strict';

    const BUILD = window.PRESENTATION_BUILD || '20261001-braid-direction-v2';
    const STYLE = 'braid';
    const SIDE_LEFT_PATH = 'images/characters/human_female/hair_braid_side_left.png';
    // Use a new URL for the corrected rear pose so iOS/GitHub Pages cannot keep
    // serving the older straight-down braid from the image HTTP cache.
    const BACK_RIGHT_PATH = 'images/characters/human_female/hair_braid_back_right.png';
    let sideLeftImage = null;
    let backRightImage = null;
    const sideLeftRenderSources = new Map();
    const WRAPPER_LINK_KEYS = ['__braidWrappedFunction','__alignmentWrappedFunction','__preciseBase','__previous','__legacyDrawPlayerCharacter'];
    const WRAPPER_MARKERS = ['__directionalBraidSupport','__spriteAlignmentFixes','__preciseColourContext','__childSystem','__directHumanoidCompositor'];

    function wrapperChainHas(fn, marker) {
        if (typeof fn !== 'function') return false;
        const seen = new Set();
        const pending = [fn];
        while (pending.length) {
            const current = pending.pop();
            if (typeof current !== 'function' || seen.has(current)) continue;
            seen.add(current);
            if (current[marker]) return true;
            for (const key of WRAPPER_LINK_KEYS) {
                if (typeof current[key] === 'function' && !seen.has(current[key])) pending.push(current[key]);
            }
        }
        return false;
    }

    function preserveWrapperMarkers(source, target) {
        for (const marker of WRAPPER_MARKERS) {
            if (wrapperChainHas(source, marker)) target[marker] = true;
        }
    }

    function imageReady(image) {
        return !!image && ((image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
            || (image.width > 0 && image.height > 0));
    }

    function ensureSideLeftImage() {
        if (sideLeftImage) return sideLeftImage;
        const image = window.assetManager.request(SIDE_LEFT_PATH);
        sideLeftImage = image;
        window.assetManager.whenReady(SIDE_LEFT_PATH).then(() => {
            sideLeftRenderSources.clear();
            window.drawMap?.();
            window.renderEntities?.();
            window.refreshDirectionalTurnPortraits?.();
        }).catch(error => console.warn('Left braid asset failed:', SIDE_LEFT_PATH, error));
        return image;
    }

    function ensureBackRightImage() {
        if (backRightImage) return backRightImage;
        const image = window.assetManager.request(BACK_RIGHT_PATH);
        backRightImage = image;
        window.assetManager.whenReady(BACK_RIGHT_PATH).then(() => {
            installBackRightSources();
            window.drawMap?.();
            window.renderEntities?.();
            window.refreshDirectionalTurnPortraits?.();
            window.updateAppearancePreview?.();
        }).catch(error => console.warn('Rear braid asset failed:', BACK_RIGHT_PATH, error));
        return image;
    }

    function installBackRightSources() {
        const image = ensureBackRightImage();
        const sets = window.DIRECTIONAL_CHARACTER_ASSETS || {};
        let installed = false;
        for (const set of Object.values(sets)) {
            const braid = set?.hair?.[STYLE];
            if (!braid) continue;
            // Keep the shared directional asset table path-based. Passing the
            // HTMLImageElement itself here makes assetManager treat it as the
            // literal path "[object HTMLImageElement]".
            braid.back = BACK_RIGHT_PATH;
            installed = true;
        }
        return installed;
    }

    function leftRenderSource(entity) {
        const image = ensureSideLeftImage();
        if (!imageReady(image)) return null;

        // The left-facing braid is genuinely asymmetric, so it has its own art.
        // Recolour that authored image BEFORE turning it into the mirrored canvas
        // consumed by the directional compositor. The generic hair recolour cache
        // is image-oriented and could otherwise leave this canvas at source colour.
        const hue = entity?.hairHue ?? 25;
        const light = entity?.hairLightMult || 1;
        const sat = entity?.hairSatMult || 1;
        const cacheKey = `${hue}|${light}|${sat}`;
        if (sideLeftRenderSources.has(cacheKey)) return sideLeftRenderSources.get(cacheKey);

        const recoloured = window.getRecoloredCharacterHairSprite
            ? (window.getRecoloredCharacterHairSprite(image, hue, light, sat) || image)
            : image;
        if (!imageReady(recoloured)) return null;

        const w = recoloured.naturalWidth || recoloured.width;
        const h = recoloured.naturalHeight || recoloured.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(recoloured, 0, 0);
        sideLeftRenderSources.set(cacheKey, canvas);
        return canvas;
    }

    function alphaTrim(image) {
        if (!imageReady(image)) return null;
        try {
            const trim = window.suggestSpriteAlphaTrim?.(image, 8);
            if (trim?.trimWidth && trim?.trimHeight) return trim;
        } catch (_) {}
        const w = image.naturalWidth || image.width || 1;
        const h = image.naturalHeight || image.height || 1;
        return {originalWidth:w, originalHeight:h, trimLeft:0, trimTop:0, trimWidth:w, trimHeight:h};
    }

    function frontOpaqueWidthFraction(frontImage) {
        const layout = window.DIRECTIONAL_CHARACTER_LAYOUT?.front;
        if (!layout || !imageReady(frontImage)) return layout?.hairDest?.w || .56;
        const trim = alphaTrim(frontImage);
        const iw = frontImage.naturalWidth || frontImage.width || 1;
        const cropLeft = layout.hairCrop.x * iw;
        const cropRight = (layout.hairCrop.x + layout.hairCrop.w) * iw;
        const trimLeft = trim.trimLeft;
        const trimRight = trim.trimLeft + trim.trimWidth;
        const visibleOpaque = Math.max(0, Math.min(trimRight, cropRight) - Math.max(trimLeft, cropLeft));
        const cropWidth = Math.max(1, layout.hairCrop.w * iw);
        if (!visibleOpaque) return layout.hairDest.w;
        return layout.hairDest.w * (visibleOpaque / cropWidth);
    }

    function fittedDestination(image, view, frontImage) {
        const layout = window.DIRECTIONAL_CHARACTER_LAYOUT?.[view];
        if (!layout || !imageReady(image)) return null;
        const trim = alphaTrim(image);
        const iw = image.naturalWidth || image.width || 1;
        const ih = image.naturalHeight || image.height || 1;
        const opaqueFraction = Math.max(.01, trim.trimWidth / iw);
        const wantedOpaqueWidth = frontOpaqueWidthFraction(frontImage);
        const w = wantedOpaqueWidth / opaqueFraction;
        const sourceAspect = iw / ih;
        const renderAspect = Number(window.HUMAN_FEMALE_RENDER_ASPECT || .48);
        const h = w * renderAspect / Math.max(.01, sourceAspect);
        return {x:.5-w/2,y:-.010,w,h};
    }

    function braidSetFor(entity) {
        const key = entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
        return window.DIRECTIONAL_CHARACTER_ASSETS?.[key]?.hair?.[STYLE] || null;
    }

    function withDirectionalBraid(entity, facing, draw) {
        if (entity?.hairStyle !== STYLE) return draw();
        const braid = braidSetFor(entity);
        if (!braid) return draw();
        // Keep the corrected rear source installed even if another presentation
        // module refreshes the shared directional asset tables.
        // Keep CHARACTER_ASSETS path-based; load the actual image only through
        // the renderer's normal asset pipeline.
        braid.back = BACK_RIGHT_PATH;
        if (facing !== 'left') return draw();
        const originalSide = braid.side;
        const left = leftRenderSource(entity);
        braid.sideLeft = ensureSideLeftImage();
        if (!imageReady(left)) return draw();
        braid.side = left;
        try { return draw(); }
        finally { braid.side = originalSide; }
    }

    function installDirectionalDrawWrapper() {
        const current = window.drawDirectionalHumanoidInBounds;
        if (typeof current !== 'function') return false;
        if (wrapperChainHas(current, '__directionalBraidSupport')) return true;
        const wrapped = function(ctx, entity, bounds, facing='down') { return withDirectionalBraid(entity, facing, () => current.apply(this, arguments)); };
        wrapped.__directionalBraidSupport = true;
        wrapped.__braidWrappedFunction = current;
        preserveWrapperMarkers(current, wrapped);
        window.drawDirectionalHumanoidInBounds = wrapped;
        window.drawDirectionalCharacterBase = wrapped;
        window.drawHumanFemaleDirectionalBase = wrapped;
        return true;
    }

    function installWorldDrawWrapper() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function' || !wrapperChainHas(current, '__directHumanoidCompositor')) return false;
        if (wrapperChainHas(current, '__directionalBraidSupport')) return true;
        const wrapped = function(ctx, entity) { const facing=entity?.facing||'down'; return withDirectionalBraid(entity,facing,()=>current.apply(this,arguments)); };
        wrapped.__directionalBraidSupport = true;
        wrapped.__braidWrappedFunction = current;
        preserveWrapperMarkers(current, wrapped);
        wrapped.__directHumanoidCompositor = true;
        wrapped.__legacyDrawPlayerCharacter = current.__legacyDrawPlayerCharacter || current;
        window.drawPlayerCharacter = wrapped;
        return true;
    }

    function install() {
        ensureSideLeftImage();
        installBackRightSources();
        const directional = installDirectionalDrawWrapper();
        const world = installWorldDrawWrapper();
        if (directional && world) { window.__directionalBraidHairReady = true; return true; }
        return false;
    }

    const timer = setInterval(() => { if (install()) clearInterval(timer); }, 50);
    // Presentation modules can replace shared asset tables during startup; a
    // cheap safety pass ensures the corrected rear braid remains authoritative.
    const sourceTimer = setInterval(installBackRightSources, 1000);
    setTimeout(() => clearInterval(sourceTimer), 15000);
    if (document.readyState === 'complete') install();
    else window.addEventListener('load', install, {once:true});
})();

// Shield appearance is kept in its own module, but this file is already part of
// the deliberately small presentation stack. Load the shield module from here
// rather than expanding the legacy script list in index.html.
(() => {
    if (document.querySelector('script[data-shield-appearance]')) return;
    const script=document.createElement('script');
    script.src=`shieldAppearance.js?build=${encodeURIComponent(window.PRESENTATION_BUILD||'20260929-shields-v1')}`;
    script.dataset.shieldAppearance='true';
    script.async=false;
    document.head.appendChild(script);
})();
