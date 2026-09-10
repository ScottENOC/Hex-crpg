// facingSystem.js
// Four-direction facing foundation for humanoid characters.
//
// Facing is real entity state (`up`, `down`, `left`, `right`) derived from
// movement in flat-top axial hex space. Human female now has real directional
// body + hair assets. Other humanoids retain the legacy transform fallback
// until their own directional art is added.

(() => {
    'use strict';

    const VALID_FACINGS = new Set(['up', 'down', 'left', 'right']);
    const previousHex = new WeakMap();
    const HUMAN_FEMALE_RENDER_ASPECT = 0.48;
    let installed = false;

    const HUMAN_FEMALE_ASSET_PATHS = {
        body: {
            front: 'images/characters/human_female/body_front.png',
            side: 'images/characters/human_female/body_side.png',
            back: 'images/characters/human_female/body_back.png',
        },
        hair: {
            brown_1: {
                front: 'images/characters/human_female/hair_brown_1_front.png',
                side: 'images/characters/human_female/hair_brown_1_side.png',
                back: 'images/characters/human_female/hair_brown_1_back.png',
            },
        },
    };

    const HUMAN_FEMALE_LAYOUT = {
        front: {
            bodyCrop: { x:0.350, y:0.088, w:0.297, h:0.823 },
            bodyDest: { x:0.000, y:0.000, w:1.000, h:1.000 },
            hairCrop: { x:0.312, y:0.221, w:0.382, h:0.387 },
            hairDest: { x:0.220, y:-0.015, w:0.560, h:0.370 },
        },
        side: {
            bodyCrop: { x:0.431, y:0.092, w:0.148, h:0.822 },
            bodyDest: { x:0.250, y:0.000, w:0.500, h:1.000 },
            hairCrop: { x:0.303, y:0.250, w:0.403, h:0.431 },
            hairDest: { x:0.305, y:-0.010, w:0.390, h:0.405 },
        },
        back: {
            bodyCrop: { x:0.350, y:0.085, w:0.299, h:0.826 },
            bodyDest: { x:0.000, y:0.000, w:1.000, h:1.000 },
            hairCrop: { x:0.338, y:0.203, w:0.323, h:0.344 },
            hairDest: { x:0.220, y:-0.005, w:0.560, h:0.375 },
        },
    };

    function loadImage(src) {
        if (typeof Image === 'undefined') return null;
        const img = new Image();
        img.src = src;
        return img;
    }

    const HUMAN_FEMALE_ASSETS = {
        body: Object.fromEntries(Object.entries(HUMAN_FEMALE_ASSET_PATHS.body).map(([k, src]) => [k, loadImage(src)])),
        hair: {
            brown_1: Object.fromEntries(Object.entries(HUMAN_FEMALE_ASSET_PATHS.hair.brown_1).map(([k, src]) => [k, loadImage(src)])),
        },
    };

    const RIG_SEED_CANVAS = (() => {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas;
    })();

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function imageReady(img) {
        return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    }

    function facingFromHexDelta(dq, dr) {
        if (!dq && !dr) return null;
        const dx = 1.5 * dq;
        const dy = Math.sqrt(3) * (dr + dq / 2);
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    function setEntityFacing(entity, facing) {
        if (!entity || !VALID_FACINGS.has(facing)) return false;
        if (entity.facing === facing) return false;
        entity.facing = facing;
        if (entity.riding && entity.riding.facing !== facing) entity.riding.facing = facing;
        if (entity.rider && entity.rider.facing !== facing) entity.rider.facing = facing;
        return true;
    }

    function updateFacingFromMovement() {
        const entities = window.entities || [];
        for (const e of entities) {
            if (!e || !e.hex) continue;
            const old = previousHex.get(e);
            if (!old) {
                previousHex.set(e, { q:e.hex.q, r:e.hex.r });
                if (!VALID_FACINGS.has(e.facing)) e.facing = 'down';
                continue;
            }
            const dq = e.hex.q - old.q;
            const dr = e.hex.r - old.r;
            if (dq || dr) {
                const facing = facingFromHexDelta(dq, dr);
                if (facing) setEntityFacing(e, facing);
                old.q = e.hex.q;
                old.r = e.hex.r;
            }
        }
    }

    function detectBodyKey(dw, dh) {
        const configs = window.CHAR_CONFIG || {};
        const hs = window.hexSize || 1;
        const z = window.cameraZoom || 1;
        let bestKey = null, bestError = Infinity;
        for (const [key, cfg] of Object.entries(configs)) {
            if (!cfg?.bodyW || !cfg?.bodyH) continue;
            const ew = cfg.bodyW * hs * z;
            const eh = cfg.bodyH * hs * z;
            const err = Math.abs(dw - ew) / ew + Math.abs(dh - eh) / eh;
            if (err < bestError) { bestError = err; bestKey = key; }
        }
        return bestError <= 0.03 ? bestKey : null;
    }

    function findEntityForBody(bodyKey, cx, cy, bodyHeight) {
        let best = null, bestD2 = Infinity;
        const maxD = Math.max(30, bodyHeight * 0.85);
        for (const e of window.entities || []) {
            if (!e || !e.alive || !e.race || !e.gender || e.customImage) continue;
            if (`${e.race}_${e.gender}` !== bodyKey) continue;
            const q = Number.isFinite(e.visualQ) ? e.visualQ : e.hex?.q;
            const r = Number.isFinite(e.visualR) ? e.visualR : e.hex?.r;
            if (!Number.isFinite(q) || !Number.isFinite(r) || !window.hexToPixel) continue;
            const p = window.hexToPixel(q, r);
            const dx = cx - p.x, dy = cy - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; best = e; }
        }
        return bestD2 <= maxD * maxD ? best : null;
    }

    function isLikelyCharacterLayer(args, body) {
        if (!body || args.length !== 4) return false;
        const [dx, dy, dw, dh] = args;
        if (![dx,dy,dw,dh].every(Number.isFinite)) return false;
        const cx = dx + dw / 2, cy = dy + dh / 2;
        const padX = body.width * 0.85;
        const padY = body.height * 0.70;
        return cx >= body.left - padX && cx <= body.left + body.width + padX
            && cy >= body.top - padY && cy <= body.top + body.height + padY;
    }

    function isLegacyFullHairDraw(args, active) {
        if (!active || active.key !== 'human_female' || active.femaleLayerStage !== 'await_hair' || args.length !== 4) return false;
        const [dx, dy, dw, dh] = args;
        const cfg = window.CHAR_CONFIG?.human_female;
        const hc = cfg?.hair;
        if (hc?.type !== 'full') return false;
        const z = window.cameraZoom || 1;
        const expectedY = active.top + (hc.yRaw || 0) * z;
        const tolerance = Math.max(0.75, z * 0.75);
        return Math.abs(dx - active.left) <= tolerance
            && Math.abs(dy - expectedY) <= tolerance
            && Math.abs(dw - active.width) <= tolerance
            && Math.abs(dh - active.height) <= tolerance;
    }

    function sideProfileScale(facing) {
        return facing === 'left' || facing === 'right' ? 0.78 : 1;
    }

    function withFacingContext(entity, facing, draw) {
        const prevFacing = window.__activeCharacterFacing;
        const prevEntity = window.__activeCharacterEntity;
        window.__activeCharacterFacing = facing;
        window.__activeCharacterEntity = entity;
        try { return draw(); }
        finally {
            window.__activeCharacterFacing = prevFacing;
            window.__activeCharacterEntity = prevEntity;
        }
    }

    function applyLegacyFacingTransform(ctx, body, facing, draw) {
        if (!body || !VALID_FACINGS.has(facing) || facing === 'down' || facing === 'up') {
            draw();
            return;
        }
        const cx = body.left + body.width / 2;
        const sx = sideProfileScale(facing) * (facing === 'left' ? -1 : 1);
        ctx.save();
        ctx.translate(cx, 0);
        ctx.scale(sx, 1);
        ctx.translate(-cx, 0);
        try { draw(); } finally { ctx.restore(); }
    }

    function drawCropped(nativeDraw, img, crop, dest, bounds) {
        const sx = crop.x * img.naturalWidth;
        const sy = crop.y * img.naturalHeight;
        const sw = crop.w * img.naturalWidth;
        const sh = crop.h * img.naturalHeight;
        const dx = bounds.left + dest.x * bounds.width;
        const dy = bounds.top + dest.y * bounds.height;
        const dw = dest.w * bounds.width;
        const dh = dest.h * bounds.height;
        nativeDraw(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    function weaponSpec(id) {
        const g = window.gameVisuals;
        if (!id || !g || window.items?.[id]?.type !== 'weapon') return null;
        if (id === 'sword' || id === 'sword_arrow_deflection') return { img:g.swordIcon, kind:'sword', scale:1 };
        if (id === 'axe') return { img:g.axe, kind:'axe', scale:1 };
        if (id === 'spear') return { img:g.spear, kind:'spear', scale:1 };
        if (id === 'club') return { img:g.club, kind:'club', scale:1 };
        if (id === 'bow') return { img:g.bow, kind:'bow', scale:1 };
        if (id === 'dagger') return { img:g.swordIcon, kind:'sword', scale:0.75 };
        return null;
    }

    function sideWeaponAnchor(active, facing, hand) {
        const cfgPoint = hand === 'mainHand' ? { x:0.62, y:0.62 } : { x:0.42, y:0.58 };
        const x = facing === 'left' ? 1 - cfgPoint.x : cfgPoint.x;
        return {
            x: active.left + x * active.width,
            y: active.top + cfgPoint.y * active.height,
        };
    }

    function drawSideWeapon(ctx, active, facing, hand) {
        const id = hand === 'mainHand' ? active.entity.equipped?.weapon : active.entity.equipped?.offhand;
        const spec = weaponSpec(id);
        if (!spec?.img?.complete) return false;
        const hs = window.hexSize || 1;
        const z = window.cameraZoom || 1;
        const basePixel = hs * z;
        const size = window.computeRigidGearSize
            ? window.computeRigidGearSize(active.key, basePixel, spec.scale)
            : basePixel * spec.scale;
        const grip = window.ITEM_GRIPS?.[spec.kind] || { x:0.5, y:0.5 };
        const anchor = sideWeaponAnchor(active, facing, hand);
        const x = anchor.x - grip.x * size;
        const y = anchor.y - grip.y * size;
        const rawDraw = CanvasRenderingContext2D.prototype.drawImage;
        ctx.save();
        try {
            if (facing === 'left') {
                ctx.translate(x + size, y);
                ctx.scale(-1, 1);
                rawDraw.call(ctx, spec.img, 0, 0, size, size);
            } else {
                rawDraw.call(ctx, spec.img, x, y, size, size);
            }
        } finally {
            ctx.restore();
        }
        return true;
    }

    function farHandForFacing(facing) {
        if (facing === 'right') return 'offHand';
        if (facing === 'left') return 'mainHand';
        return null;
    }

    function drawHumanFemaleBody(ctx, riggedDrawImage, active, facing, args) {
        const [dx, dy, dw, dh] = args;
        const view = facingToView(facing);
        const layout = HUMAN_FEMALE_LAYOUT[view];
        const bodyImg = HUMAN_FEMALE_ASSETS.body[view];
        if (!layout || !imageReady(bodyImg)) return false;

        const hairStyle = active.entity.hairStyle || 'brown_1';
        const hairImg = HUMAN_FEMALE_ASSETS.hair[hairStyle]?.[view] || HUMAN_FEMALE_ASSETS.hair.brown_1?.[view];
        const hasHelmet = !!active.entity.equipped?.helmet;
        const mirror = facing === 'left';

        const artWidth = dh * HUMAN_FEMALE_RENDER_ASPECT;
        const bounds = {
            left: dx + (dw - artWidth) / 2,
            top: dy,
            width: artWidth,
            height: dh,
        };
        const cx = bounds.left + bounds.width / 2;

        return withFacingContext(active.entity, facing, () => {
            if (RIG_SEED_CANVAS) riggedDrawImage(RIG_SEED_CANVAS, dx, dy, dw, dh);

            // On side views the far-side hand must genuinely sit behind the
            // character. gameEngine emits weapons after the body, so pre-draw
            // that one hand now and suppress its later legacy draw.
            const farHand = farHandForFacing(facing);
            if (farHand) drawSideWeapon(ctx, active, facing, farHand);

            ctx.save();
            if (mirror) {
                ctx.translate(cx, 0);
                ctx.scale(-1, 1);
                ctx.translate(-cx, 0);
            }
            try {
                drawCropped(riggedDrawImage, bodyImg, layout.bodyCrop, layout.bodyDest, bounds);
                if (!hasHelmet && imageReady(hairImg)) {
                    drawCropped(riggedDrawImage, hairImg, layout.hairCrop, layout.hairDest, bounds);
                }
            } finally {
                ctx.restore();
            }
            return true;
        });
    }

    function applyDirectionalLayer(ctx, active, facing, draw) {
        return withFacingContext(active.entity, facing, () => {
            if (active.key === 'human_female') return draw();
            return applyLegacyFacingTransform(ctx, active, facing, draw);
        });
    }

    function weaponImage(img) {
        const g = window.gameVisuals;
        return !!g && (img === g.swordIcon || img === g.axe || img === g.spear || img === g.club || img === g.bow);
    }

    function installRendererFacing() {
        if (installed || !window.mapCtx || !window.CHAR_CONFIG || !window.__characterRigInstalled) return false;
        const ctx = window.mapCtx;
        const riggedDrawImage = ctx.drawImage.bind(ctx);
        const riggedClearRect = ctx.clearRect.bind(ctx);
        let active = null;

        ctx.clearRect = function(...args) {
            active = null;
            return riggedClearRect(...args);
        };

        ctx.drawImage = function(img, ...args) {
            if (img && img === window.gameVisuals?.humanHair) return;

            // Human-female side-facing weapons are handled here instead of by
            // the legacy rig pass so their anchors, mirroring and depth order
            // are tied directly to facing.
            if (active?.key === 'human_female' && args.length === 4 && weaponImage(img)) {
                const facing = VALID_FACINGS.has(active.entity.facing) ? active.entity.facing : 'down';
                if (facing === 'left' || facing === 'right') {
                    const hand = active.weaponDrawCount++ === 0 ? 'mainHand' : 'offHand';
                    if (hand === farHandForFacing(facing)) return;
                    drawSideWeapon(ctx, active, facing, hand);
                    return;
                }
            }

            if (args.length === 4) {
                const [dx, dy, dw, dh] = args;
                const key = detectBodyKey(dw, dh);

                if (key === 'human_female') {
                    const entity = findEntityForBody(key, dx + dw/2, dy + dh/2, dh);
                    if (entity) {
                        if (active?.entity === entity && isLegacyFullHairDraw(args, active)) {
                            active.femaleLayerStage = 'after_hair';
                            return;
                        }

                        if (active?.entity !== entity) {
                            active = { entity, key, left:dx, top:dy, width:dw, height:dh, femaleLayerStage:'await_hair', weaponDrawCount:0 };
                            const facing = VALID_FACINGS.has(entity.facing) ? entity.facing : 'down';
                            if (drawHumanFemaleBody(ctx, riggedDrawImage, active, facing, args)) return;
                        }
                    }
                } else if (key) {
                    const entity = findEntityForBody(key, dx + dw/2, dy + dh/2, dh);
                    if (entity) active = { entity, key, left:dx, top:dy, width:dw, height:dh };
                }

                if (active && isLikelyCharacterLayer(args, active)) {
                    const facing = VALID_FACINGS.has(active.entity.facing) ? active.entity.facing : 'down';
                    return applyDirectionalLayer(ctx, active, facing, () => riggedDrawImage(img, ...args));
                }
            }
            return riggedDrawImage(img, ...args);
        };

        installed = true;
        window.__facingRendererInstalled = true;
        return true;
    }

    function scheduleInstall() {
        const timer = setInterval(() => {
            updateFacingFromMovement();
            if (installRendererFacing() || installed) clearInterval(timer);
        }, 50);
    }

    setInterval(updateFacingFromMovement, 50);

    window.FACING_DIRECTIONS = ['up','down','left','right'];
    window.HUMAN_FEMALE_RENDER_ASPECT = HUMAN_FEMALE_RENDER_ASPECT;
    window.HUMAN_FEMALE_ASSET_PATHS = HUMAN_FEMALE_ASSET_PATHS;
    window.HUMAN_FEMALE_DIRECTIONAL_ASSETS = HUMAN_FEMALE_ASSETS;
    window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT = HUMAN_FEMALE_LAYOUT;
    window.facingToSpriteView = facingToView;
    window.facingFromHexDelta = facingFromHexDelta;
    window.setEntityFacing = setEntityFacing;
    window.updateFacingFromMovement = updateFacingFromMovement;
    window.sideProfileScale = sideProfileScale;
    window.installFacingRenderer = installRendererFacing;

    if (document.readyState === 'complete') scheduleInstall();
    else window.addEventListener('load', scheduleInstall, { once:true });
})();