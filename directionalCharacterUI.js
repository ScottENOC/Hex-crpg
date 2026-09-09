// directionalCharacterUI.js
// Bridges the first real directional human-female asset set into UI surfaces
// that do not render through mapCtx (character creation, turn-order portraits,
// dialogue portraits), and suppresses the obsolete legacy female hair layer on
// the tactical map once the facing renderer is installed.

(() => {
    'use strict';

    let creatorLegacy = null;
    let externalDrawLegacy = null;
    let turnObserver = null;
    let turnRenderQueued = false;

    function isHumanFemale(entity) {
        return !!entity && entity.race === 'human' && entity.gender === 'female';
    }

    function imageReady(img) {
        return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    }

    function facingToView(facing) {
        if (typeof window.facingToSpriteView === 'function') return window.facingToSpriteView(facing);
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function directionalAssetsReady(view = 'front') {
        const assets = window.HUMAN_FEMALE_DIRECTIONAL_ASSETS;
        const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT;
        return !!assets && !!layout?.[view] && imageReady(assets.body?.[view]);
    }

    function drawCropped(ctx, img, crop, dest, bounds) {
        const sx = crop.x * img.naturalWidth;
        const sy = crop.y * img.naturalHeight;
        const sw = crop.w * img.naturalWidth;
        const sh = crop.h * img.naturalHeight;
        const dx = bounds.left + dest.x * bounds.width;
        const dy = bounds.top + dest.y * bounds.height;
        const dw = dest.w * bounds.width;
        const dh = dest.h * bounds.height;
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    function drawHumanFemaleDirectionalBase(ctx, entity, bounds, facing = 'down') {
        if (!ctx || !bounds) return false;
        const view = facingToView(facing);
        if (!directionalAssetsReady(view)) return false;

        const assets = window.HUMAN_FEMALE_DIRECTIONAL_ASSETS;
        const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT[view];
        const bodyImg = assets.body[view];
        const hairStyle = entity?.hairStyle || 'brown_1';
        const hairImg = assets.hair?.[hairStyle]?.[view] || assets.hair?.brown_1?.[view];
        const hasHelmet = !!entity?.equipped?.helmet;
        const mirror = facing === 'left';
        const cx = bounds.left + bounds.width / 2;

        ctx.save();
        if (mirror) {
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
        }
        try {
            drawCropped(ctx, bodyImg, layout.bodyCrop, layout.bodyDest, bounds);
            if (!hasHelmet && imageReady(hairImg)) {
                drawCropped(ctx, hairImg, layout.hairCrop, layout.hairDest, bounds);
            }
        } finally {
            ctx.restore();
        }
        return true;
    }

    // facingSystem.js replaces the base body but deliberately allows the rest
    // of the legacy draw stack through so armour/weapons/helmets still render.
    // The old human-female HAIR is not equipment, though, and was therefore
    // being drawn over the new body + new hair. Suppress that one obsolete map
    // layer after the facing renderer has wrapped mapCtx.
    function installMapLegacyHairSuppression() {
        const ctx = window.mapCtx;
        if (!ctx || !window.__facingRendererInstalled) return false;
        if (ctx.__directionalLegacyHumanFemaleHairSuppressed) return true;

        const previousDrawImage = ctx.drawImage.bind(ctx);
        ctx.drawImage = function(img, ...args) {
            if (img && img === window.gameVisuals?.humanHair) return;
            return previousDrawImage(img, ...args);
        };
        ctx.__directionalLegacyHumanFemaleHairSuppressed = true;
        return true;
    }

    function installCreatorPreviewOverride() {
        const current = window.updateAppearancePreview;
        if (typeof current !== 'function') return false;
        if (current.__directionalHumanFemalePreview) return true;

        // main.js may redefine updateAppearancePreview after this module first
        // loads, so always wrap the current implementation rather than assuming
        // a single startup ordering.
        creatorLegacy = current;
        const wrapped = function() {
            const race = document.getElementById('race-select')?.value;
            const gender = document.getElementById('gender-select')?.value;
            if (race !== 'human' || gender !== 'female' || !directionalAssetsReady('front')) {
                return creatorLegacy.apply(this, arguments);
            }

            const canvas = document.getElementById('appearance-preview-canvas');
            if (!canvas) return creatorLegacy.apply(this, arguments);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Keep roughly the same apparent stature as the old creator sprite.
            const height = canvas.height * 0.90;
            const width = height * 0.48;
            const bounds = {
                left: (canvas.width - width) / 2,
                top: (canvas.height - height) / 2,
                width,
                height,
            };
            drawHumanFemaleDirectionalBase(ctx, { race:'human', gender:'female', equipped:{} }, bounds, 'down');
        };
        wrapped.__directionalHumanFemalePreview = true;
        wrapped.__legacyPreview = creatorLegacy;
        window.updateAppearancePreview = wrapped;
        wrapped();
        return true;
    }

    function sortedTurnEntities() {
        const list = [...(window.entities || [])]
            .filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
        if (window.isInCombat) list.sort((a, b) => b.timePoints - a.timePoints);
        return list;
    }

    function isLegacyHumanFemalePortraitImage(img) {
        if (!(img instanceof HTMLImageElement)) return false;
        const src = img.getAttribute('src') || '';
        return src.endsWith('images/humanfemale.png') || src.endsWith('images/humanfemalehair.png')
            || src.endsWith('/images/humanfemale.png') || src.endsWith('/images/humanfemalehair.png');
    }

    function drawTurnPortraitCanvas(canvas, entity) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const height = 92;
        const width = height * 0.48;
        const bounds = { left:(100-width)/2, top:4, width, height };
        drawHumanFemaleDirectionalBase(ctx, entity, bounds, 'down');
    }

    function renderDirectionalTurnPortraits() {
        turnRenderQueued = false;
        if (!directionalAssetsReady('front')) return;
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar) return;
        const entities = sortedTurnEntities();
        const items = [...bar.querySelectorAll('.turn-indicator-item')];

        items.forEach((item, index) => {
            const entity = entities[index];
            if (!isHumanFemale(entity)) return;
            const portrait = item.querySelector('.turn-indicator-portrait');
            if (!portrait) return;

            portrait.querySelectorAll('img.portrait-layer').forEach(img => {
                if (isLegacyHumanFemalePortraitImage(img)) img.remove();
            });

            let canvas = portrait.querySelector('canvas[data-directional-human-female="true"]');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 100;
                canvas.dataset.directionalHumanFemale = 'true';
                canvas.classList.add('portrait-layer');
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                canvas.style.left = '0';
                canvas.style.top = '0';
                portrait.insertBefore(canvas, portrait.firstChild);
            }
            drawTurnPortraitCanvas(canvas, entity);
        });
    }

    function queueTurnPortraitRefresh() {
        if (turnRenderQueued) return;
        turnRenderQueued = true;
        queueMicrotask(renderDirectionalTurnPortraits);
    }

    function installTurnPortraitObserver() {
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar) return false;
        if (turnObserver) return true;
        turnObserver = new MutationObserver(queueTurnPortraitRefresh);
        turnObserver.observe(bar, { childList:true, subtree:true });
        queueTurnPortraitRefresh();
        return true;
    }

    // Dialogue portraits (and any future small canvases) call the exported
    // window.drawPlayerCharacter rather than the lexical map renderer. Wrap
    // that exported function so a human female uses the same directional base
    // while legacy armour/helmet/weapon layers are still allowed through.
    function installExternalDrawPlayerCharacterOverride() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function') return false;
        if (current.__directionalHumanFemaleExternal) return true;
        externalDrawLegacy = current;

        const wrapped = function(ctx, entity, x, y, z, flyOff) {
            if (!isHumanFemale(entity) || ctx === window.mapCtx || !directionalAssetsReady(facingToView(entity.facing || 'down'))) {
                return externalDrawLegacy.apply(this, arguments);
            }

            const cfg = window.CHAR_CONFIG?.human_female;
            if (!cfg || !ctx) return externalDrawLegacy.apply(this, arguments);
            const expectedW = cfg.bodyW * (window.hexSize || 1) * z;
            const expectedH = cfg.bodyH * (window.hexSize || 1) * z;
            const priorDraw = ctx.drawImage.bind(ctx);
            let replacedBody = false;

            ctx.drawImage = function(img, ...args) {
                if (img && img === window.gameVisuals?.humanHair) return;
                if (!replacedBody && args.length === 4) {
                    const [dx, dy, dw, dh] = args;
                    const closeW = Math.abs(dw - expectedW) <= Math.max(1, expectedW * 0.04);
                    const closeH = Math.abs(dh - expectedH) <= Math.max(1, expectedH * 0.04);
                    if (closeW && closeH) {
                        replacedBody = true;
                        const originalDrawMethod = ctx.drawImage;
                        ctx.drawImage = priorDraw;
                        try {
                            drawHumanFemaleDirectionalBase(ctx, entity, { left:dx, top:dy, width:dw, height:dh }, entity.facing || 'down');
                        } finally {
                            ctx.drawImage = originalDrawMethod;
                        }
                        return;
                    }
                }
                return priorDraw(img, ...args);
            };

            try {
                return externalDrawLegacy.apply(this, arguments);
            } finally {
                ctx.drawImage = priorDraw;
            }
        };
        wrapped.__directionalHumanFemaleExternal = true;
        wrapped.__legacyDrawPlayerCharacter = externalDrawLegacy;
        window.drawPlayerCharacter = wrapped;
        return true;
    }

    function installAll() {
        installMapLegacyHairSuppression();
        installCreatorPreviewOverride();
        installTurnPortraitObserver();
        installExternalDrawPlayerCharacterOverride();
    }

    window.drawHumanFemaleDirectionalBase = drawHumanFemaleDirectionalBase;
    window.refreshDirectionalTurnPortraits = renderDirectionalTurnPortraits;
    window.__directionalCharacterUIInstalled = true;

    // Different modules initialise at different times (name.js loads very
    // early; creator/ui/game engine attach globals later). Poll briefly and
    // idempotently so each bridge attaches as soon as its dependency exists.
    const timer = setInterval(installAll, 100);
    window.addEventListener('load', () => {
        installAll();
        setTimeout(() => clearInterval(timer), 10000);
    }, { once:true });
})();
