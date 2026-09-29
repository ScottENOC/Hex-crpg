// Direction-specific support for the shoulder braid hairstyle.
(() => {
    'use strict';

    const BUILD = '20260929-directional-braid-v1';
    const STYLE = 'braid';
    const SIDE_LEFT_PATH = 'images/characters/human_female/hair_braid_side_left.png';
    let sideLeftImage = null;
    let sideLeftRenderSource = null;

    function imageReady(image) {
        return !!image && ((image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
            || (image.width > 0 && image.height > 0));
    }

    function ensureSideLeftImage() {
        if (sideLeftImage || typeof Image === 'undefined') return sideLeftImage;
        const image = new Image();
        image.addEventListener('load', () => {
            sideLeftRenderSource = null;
            window.drawMap?.();
            window.renderEntities?.();
            window.refreshDirectionalTurnPortraits?.();
        });
        const build = encodeURIComponent(window.PRESENTATION_BUILD || BUILD);
        image.src = `${SIDE_LEFT_PATH}?build=${build}`;
        sideLeftImage = image;
        return image;
    }

    function leftRenderSource() {
        const image = ensureSideLeftImage();
        if (!imageReady(image)) return null;
        if (sideLeftRenderSource) return sideLeftRenderSource;
        const w = image.naturalWidth || image.width;
        const h = image.naturalHeight || image.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0);
        sideLeftRenderSource = canvas;
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
        return {x:.5-w/2,y:view==='back'?-.005:-.010,w,h};
    }

    function braidSetFor(entity) {
        const key = entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
        return window.DIRECTIONAL_CHARACTER_ASSETS?.[key]?.hair?.[STYLE] || null;
    }

    function withDirectionalBraid(entity, facing, draw) {
        if (entity?.hairStyle !== STYLE) return draw();
        const view = window.facingToSpriteView?.(facing) || (facing === 'up' ? 'back' : (facing === 'left' || facing === 'right' ? 'side' : 'front'));
        if (view === 'front') return draw();
        const braid = braidSetFor(entity);
        const layout = window.DIRECTIONAL_CHARACTER_LAYOUT?.[view];
        if (!braid || !layout) return draw();
        const originalCrop = layout.hairCrop;
        const originalDest = layout.hairDest;
        const originalSide = braid.side;
        const frontImage = braid.front;
        let source = view === 'back' ? braid.back : originalSide;
        if (view === 'side' && facing === 'left') { const left = leftRenderSource(); if (left) source = left; }
        if (!imageReady(source)) return draw();
        if (view === 'side') braid.side = source;
        braid.sideLeft = ensureSideLeftImage();
        layout.hairCrop = {x:0,y:0,w:1,h:1};
        layout.hairDest = fittedDestination(source, view, frontImage) || originalDest;
        try { return draw(); }
        finally { braid.side = originalSide; layout.hairCrop = originalCrop; layout.hairDest = originalDest; }
    }

    function installDirectionalDrawWrapper() {
        const current = window.drawDirectionalHumanoidInBounds;
        if (typeof current !== 'function' || current.__directionalBraidSupport) return !!current?.__directionalBraidSupport;
        const wrapped = function(ctx, entity, bounds, facing='down') { return withDirectionalBraid(entity, facing, () => current.apply(this, arguments)); };
        wrapped.__directionalBraidSupport = true;
        window.drawDirectionalHumanoidInBounds = wrapped;
        window.drawDirectionalCharacterBase = wrapped;
        window.drawHumanFemaleDirectionalBase = wrapped;
        return true;
    }

    function installWorldDrawWrapper() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function' || !current.__directHumanoidCompositor) return false;
        if (current.__directionalBraidSupport) return true;
        const wrapped = function(ctx, entity) { const facing=entity?.facing||'down'; return withDirectionalBraid(entity,facing,()=>current.apply(this,arguments)); };
        wrapped.__directionalBraidSupport = true;
        wrapped.__directHumanoidCompositor = true;
        wrapped.__legacyDrawPlayerCharacter = current.__legacyDrawPlayerCharacter || current;
        window.drawPlayerCharacter = wrapped;
        return true;
    }

    function install() {
        ensureSideLeftImage();
        const directional = installDirectionalDrawWrapper();
        const world = installWorldDrawWrapper();
        if (directional && world) { window.__directionalBraidHairReady = true; return true; }
        return false;
    }

    const timer = setInterval(() => { if (install()) clearInterval(timer); }, 50);
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
