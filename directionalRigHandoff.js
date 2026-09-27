// directionalRigHandoff.js
// Bridge the legacy entity draw box to the actual directional human-female art box.
//
// The game engine still emits a legacy 1.60 x 1.92 human-female body draw. The
// directional renderer centres a much narrower visual body inside that box
// (width = body height * 0.48). Equipment fitting must use the visual box, not
// the invisible legacy box. This module records that authoritative rectangle
// and owns the final human-female armour composition so legacy sizing/deformation
// wrappers cannot alter the final pixels.
(() => {
    'use strict';

    const HUMAN_FEMALE_BODY_W = 1.60;
    const HUMAN_FEMALE_BODY_H = 1.92;
    const HUMAN_FEMALE_RENDER_ASPECT = 0.48;
    const BODY_MATCH_TOLERANCE = 0.035;
    const BODY_RECORD_MAX_AGE_MS = 1000;
    const liveBoundsByEntity = new WeakMap();

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function computeDirectionalBounds(dx, dy, dw, dh) {
        if (![dx, dy, dw, dh].every(Number.isFinite) || dh <= 0) return null;
        const width = dh * HUMAN_FEMALE_RENDER_ASPECT;
        return {
            left: dx + (dw - width) / 2,
            top: dy,
            width,
            height: dh,
        };
    }

    function isLegacyHumanFemaleSize(dw, dh) {
        const hs = window.hexSize || 1;
        const z = window.cameraZoom || 1;
        const cfg = window.CHAR_CONFIG?.human_female || { bodyW:HUMAN_FEMALE_BODY_W, bodyH:HUMAN_FEMALE_BODY_H };
        const ew = cfg.bodyW * hs * z;
        const eh = cfg.bodyH * hs * z;
        if (!(ew > 0 && eh > 0)) return false;
        const error = Math.abs(dw - ew) / ew + Math.abs(dh - eh) / eh;
        return error <= BODY_MATCH_TOLERANCE;
    }

    function isBaseArmourImage(img) {
        const g = window.gameVisuals || {};
        return !!img && (img === g.humanLight || img === g.humanMedium || img === g.humanHeavy);
    }

    function isHumanFemaleArmourImage(img) {
        return isBaseArmourImage(img) || !!img?.__humanFemaleArmourBase;
    }

    function isKnownEquipmentOrHair(img) {
        const g = window.gameVisuals || {};
        return img === g.humanHair || img === g.humanMaleHair
            || isHumanFemaleArmourImage(img)
            || img === g.nasal_helm || img === g.shield
            || img === g.swordIcon || img === g.axe || img === g.spear
            || img === g.club || img === g.bow;
    }

    function findHumanFemaleEntity(cx, cy, bodyHeight) {
        let best = null;
        let bestD2 = Infinity;
        const maxDistance = Math.max(30, bodyHeight * 0.85);
        for (const entity of window.entities || []) {
            if (!entity || !entity.alive || entity.customImage) continue;
            if (entity.race !== 'human' || entity.gender !== 'female') continue;
            const q = Number.isFinite(entity.visualQ) ? entity.visualQ : entity.hex?.q;
            const r = Number.isFinite(entity.visualR) ? entity.visualR : entity.hex?.r;
            if (!Number.isFinite(q) || !Number.isFinite(r) || typeof window.hexToPixel !== 'function') continue;
            const p = window.hexToPixel(q, r);
            const dx = cx - p.x;
            const dy = cy - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = entity;
            }
        }
        return bestD2 <= maxDistance * maxDistance ? best : null;
    }

    function publishBodyBounds(entity, facing, bounds, transform = null) {
        if (!entity || !bounds) return null;
        const record = {
            ...bounds,
            entity,
            facing,
            view:facingToView(facing),
            transform:transform || { a:1, b:0, c:0, d:1, e:0, f:0 },
            source:'directional-rig-handoff',
            timestamp:Date.now(),
        };
        liveBoundsByEntity.set(entity, record);
        // Equipment is emitted immediately after its body's legacy draw, so the
        // most recent record is also the current composition target.
        window.__humanFemaleLastBodyDraw = record;
        window.__directionalRigHandoffLastBody = record;
        return record;
    }

    function armourDrawMatchesBody(args, body) {
        if (!body || args.length !== 4) return false;
        if (Date.now() - (body.timestamp || 0) > BODY_RECORD_MAX_AGE_MS) return false;
        const [dx, dy, dw, dh] = args.map(Number);
        if (![dx,dy,dw,dh].every(Number.isFinite) || dw <= 0 || dh <= 0) return false;
        const armourCx = dx + dw / 2;
        const armourCy = dy + dh / 2;
        const bodyCx = body.left + body.width / 2;
        const bodyCy = body.top + body.height / 2;
        return Math.abs(armourCx - bodyCx) <= Math.max(2, body.width * 0.30)
            && Math.abs(armourCy - bodyCy) <= body.height * 0.75;
    }

    // Fit the armour's *visible alpha rectangle* directly to the body rig's
    // armour envelope. This is deliberately a single axis-aligned translate +
    // scale. It does not rotate, skew, strip-warp, or depend on legacy armour
    // destination dimensions. Transparent padding therefore cannot make the
    // visible armour appear too small.
    function computeRigidArmourPlacement(image, view='front', bodyBounds=null, trimOverride=null) {
        if (!bodyBounds?.height || !bodyBounds?.width) return null;
        const measure = window.measureHumanFemaleArmourAlphaBounds;
        const deriveRig = window.deriveHumanFemaleArmourRig;
        const vertical = window.HUMAN_FEMALE_EQUIPMENT_FIT?.targetVerticalByView?.[view];
        if (typeof deriveRig !== 'function' || !vertical) return null;

        const trim = trimOverride || (typeof measure === 'function' ? measure(image) : null);
        if (!trim?.originalWidth || !trim?.originalHeight || !trim?.trimWidth || !trim?.trimHeight) return null;

        const rig = deriveRig(view);
        if (!rig) return null;
        const leftFrac = Math.min(rig.shoulderL, rig.waistL, rig.hemL);
        const rightFrac = Math.max(rig.shoulderR, rig.waistR, rig.hemR);
        if (![leftFrac,rightFrac,vertical.topY,vertical.bottomY].every(Number.isFinite)
            || !(rightFrac > leftFrac) || !(vertical.bottomY > vertical.topY)) return null;

        const targetLeftPx = bodyBounds.left + leftFrac * bodyBounds.width;
        const targetRightPx = bodyBounds.left + rightFrac * bodyBounds.width;
        const targetTopPx = bodyBounds.top + vertical.topY * bodyBounds.height;
        const targetBottomPx = bodyBounds.top + vertical.bottomY * bodyBounds.height;
        const targetVisibleWidthPx = targetRightPx - targetLeftPx;
        const targetVisibleHeightPx = targetBottomPx - targetTopPx;
        if (!(targetVisibleWidthPx > 0) || !(targetVisibleHeightPx > 0)) return null;

        const scaleXPxPerSourcePixel = targetVisibleWidthPx / trim.trimWidth;
        const scaleYPxPerSourcePixel = targetVisibleHeightPx / trim.trimHeight;
        const outerWidthPx = trim.originalWidth * scaleXPxPerSourcePixel;
        const outerHeightPx = trim.originalHeight * scaleYPxPerSourcePixel;
        const dx = targetLeftPx - trim.trimLeft * scaleXPxPerSourcePixel;
        const dy = targetTopPx - trim.trimTop * scaleYPxPerSourcePixel;

        return {
            view,
            trim:{...trim},
            bodyBounds:{...bodyBounds},
            rig:{...rig},
            dx, dy, outerWidthPx, outerHeightPx,
            targetLeftPx, targetRightPx, targetTopPx, targetBottomPx,
            targetVisibleWidthPx, targetVisibleHeightPx,
            visibleLeftPx:dx + trim.trimLeft * scaleXPxPerSourcePixel,
            visibleRightPx:dx + (trim.trimLeft + trim.trimWidth) * scaleXPxPerSourcePixel,
            visibleTopPx:dy + trim.trimTop * scaleYPxPerSourcePixel,
            visibleBottomPx:dy + (trim.trimTop + trim.trimHeight) * scaleYPxPerSourcePixel,
            scaleXPxPerSourcePixel,
            scaleYPxPerSourcePixel,
            placementSource:'actual-body-draw-bounds',
            compositionSource:'rigid-alpha-envelope',
        };
    }

    function installGoldArmourTagging() {
        const current = window.getGoldTintedSprite;
        if (typeof current !== 'function' || current.__directionalRigHandoffTagged) return typeof current === 'function';
        const wrapped = function(img, ...rest) {
            const out = current.call(this, img, ...rest);
            if (isBaseArmourImage(img) && out && typeof out === 'object') {
                try { out.__humanFemaleArmourBase = img; } catch (_) {}
            }
            return out;
        };
        wrapped.__directionalRigHandoffTagged = true;
        wrapped.__directionalRigHandoffPrevious = current;
        window.getGoldTintedSprite = wrapped;
        return true;
    }

    function installBodyObserver() {
        const ctx = window.mapCtx;
        if (!ctx) return false;
        if (ctx.drawImage?.__directionalRigBodyObserver) return true;
        if (!window.__facingRendererInstalled || !window.__characterRigInstalled) return false;

        const previous = ctx.drawImage.bind(ctx);
        const wrapper = function(img, ...args) {
            if (args.length === 4 && !isKnownEquipmentOrHair(img)) {
                const [dx, dy, dw, dh] = args.map(Number);
                if (isLegacyHumanFemaleSize(dw, dh)) {
                    const entity = findHumanFemaleEntity(dx + dw / 2, dy + dh / 2, dh);
                    if (entity) {
                        const facing = ['up','down','left','right'].includes(entity.facing) ? entity.facing : 'down';
                        const bounds = computeDirectionalBounds(dx, dy, dw, dh);
                        const transform = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
                        publishBodyBounds(entity, facing, bounds, transform);
                    }
                }
            }
            return previous(img, ...args);
        };
        wrapper.__directionalRigBodyObserver = true;
        wrapper.__directionalRigHandoffPrevious = previous;
        ctx.drawImage = wrapper;
        window.__directionalRigBodyObserverInstalled = true;
        return true;
    }

    function installArmourCompositor() {
        const ctx = window.mapCtx;
        if (!ctx) return false;
        if (ctx.drawImage?.__directionalRigArmourCompositor) return true;
        if (!window.__directionalEquipmentFitTuningApplied
            || typeof window.measureHumanFemaleArmourAlphaBounds !== 'function'
            || typeof window.deriveHumanFemaleArmourRig !== 'function') return false;

        installGoldArmourTagging();
        const previous = ctx.drawImage.bind(ctx);
        const rawDraw = (img, ...args) => CanvasRenderingContext2D.prototype.drawImage.call(ctx, img, ...args);

        const wrapper = function(img, ...args) {
            if (args.length === 4 && isHumanFemaleArmourImage(img)) {
                const body = window.__humanFemaleLastBodyDraw;
                if (body?.entity?.race === 'human' && body?.entity?.gender === 'female' && armourDrawMatchesBody(args, body)) {
                    const placement = computeRigidArmourPlacement(img, body.view, body);
                    if (placement) {
                        // Final human-female armour pixels have one owner. Bypass
                        // every mapCtx wrapper (including characterRig's old
                        // strip-deformation path) and draw the rigid placement.
                        rawDraw(img, placement.dx, placement.dy, placement.outerWidthPx, placement.outerHeightPx);
                        const measured = {
                            ...placement,
                            placementSource:'actual-body-draw-bounds',
                            compositionSource:'directional-rig-handoff-rigid',
                            stripDeformation:false,
                        };
                        if (window.HUMAN_FEMALE_EQUIPMENT_FIT) {
                            window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour = measured;
                        }
                        window.__directionalRigHandoffLastArmour = measured;
                        return;
                    }
                }
            }
            return previous(img, ...args);
        };
        wrapper.__directionalRigArmourCompositor = true;
        wrapper.__directionalRigHandoffPrevious = previous;
        ctx.drawImage = wrapper;
        window.__directionalRigArmourCompositorInstalled = true;
        return true;
    }

    function installAll() {
        const bodyReady = installBodyObserver();
        installGoldArmourTagging();
        const armourReady = installArmourCompositor();
        window.__directionalRigHandoffInstalled = bodyReady && armourReady;
        return bodyReady && armourReady;
    }

    window.computeHumanFemaleDirectionalBodyBounds = computeDirectionalBounds;
    window.computeHumanFemaleRigidArmourPlacement = computeRigidArmourPlacement;
    window.publishHumanFemaleDirectionalBodyBounds = publishBodyBounds;
    window.getHumanFemaleLiveBodyBounds = entity => entity ? liveBoundsByEntity.get(entity) || null : window.__humanFemaleLastBodyDraw || null;
    window.installDirectionalRigHandoff = installAll;

    if (installAll()) return;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (installAll() || attempts >= 400) clearInterval(timer);
    }, 25);
})();
