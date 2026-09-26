// directionalRigHandoff.js
// Bridge the legacy entity draw box to the actual directional human-female art box.
//
// The game engine still emits a legacy 1.60 x 1.92 human-female body draw. The
// directional renderer centres a much narrower visual body inside that box
// (width = body height * 0.48). Equipment fitting must use the visual box, not
// the invisible legacy box. This module records that authoritative rectangle
// before the facing/equipment wrappers consume the same draw.
(() => {
    'use strict';

    const HUMAN_FEMALE_BODY_W = 1.60;
    const HUMAN_FEMALE_BODY_H = 1.92;
    const HUMAN_FEMALE_RENDER_ASPECT = 0.48;
    const BODY_MATCH_TOLERANCE = 0.035;
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

    function isKnownEquipmentOrHair(img) {
        const g = window.gameVisuals || {};
        return img === g.humanHair || img === g.humanMaleHair
            || img === g.humanLight || img === g.humanMedium || img === g.humanHeavy
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
        // Equipment is drawn immediately after its body's legacy draw, so this
        // remains the authoritative record for the currently composed entity.
        window.__humanFemaleLastBodyDraw = record;
        window.__directionalRigHandoffLastBody = record;
        return record;
    }

    function install() {
        const ctx = window.mapCtx;
        if (!ctx || ctx.drawImage?.__directionalRigHandoff) return !!ctx;
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
        wrapper.__directionalRigHandoff = true;
        wrapper.__directionalRigHandoffPrevious = previous;
        ctx.drawImage = wrapper;
        window.__directionalRigHandoffInstalled = true;
        return true;
    }

    window.computeHumanFemaleDirectionalBodyBounds = computeDirectionalBounds;
    window.publishHumanFemaleDirectionalBodyBounds = publishBodyBounds;
    window.getHumanFemaleLiveBodyBounds = entity => entity ? liveBoundsByEntity.get(entity) || null : window.__humanFemaleLastBodyDraw || null;
    window.installDirectionalRigHandoff = install;

    if (install()) return;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (install() || attempts >= 200) clearInterval(timer);
    }, 25);
})();
