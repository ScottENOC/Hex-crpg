// directionalEquipmentTuning.js
// Presentation-only fit tuning for human-female directional equipment.
// The underlying armour/helmet PNGs contain generous transparent padding, so
// their legacy destination rectangles make the visible gear look too small.
//
// Body geometry is canonical in spriteRigging.js. Armour fit is derived from
// the body's torso anchors plus asset-clearance values for transparent padding;
// it does not maintain a second body silhouette.

(() => {
    'use strict';

    // The armour files have a large transparent border around the visible
    // plate. This is asset padding, not anatomy. Keeping it as one scalar means
    // shoulder/waist/hip shape always comes from the body reference rig.
    const HUMAN_FEMALE_ARMOUR_CLEARANCE_X = 0.32;

    // Vertical coverage is intentionally independent at the two ends. The
    // legacy renderer already understands topShift (distance down from body
    // top), but historically had no way to extend the lower edge separately.
    // These are in hexSize units, matching CHAR_CONFIG armour tuning.
    const HUMAN_FEMALE_ARMOUR_TOP_SHIFT = 0.10;
    const HUMAN_FEMALE_ARMOUR_BOTTOM_DROP = 0.08;

    const goldArmourImages = new WeakSet();

    function spanFromAnchors(anchors, leftName, rightName, clearance = HUMAN_FEMALE_ARMOUR_CLEARANCE_X) {
        const a = anchors?.[leftName];
        const b = anchors?.[rightName];
        if (!a || !b) return null;
        const left = Math.max(0, Math.min(a.x, b.x) - clearance);
        const right = Math.min(1, Math.max(a.x, b.x) + clearance);
        return { left, right };
    }

    function deriveArmourRigFromBody(view) {
        const body = window.HUMAN_FEMALE_REFERENCE_RIGS?.[view];
        const anchors = body?.anchors;
        if (!anchors) return null;

        const shoulders = spanFromAnchors(anchors, 'torsoShoulderLeft', 'torsoShoulderRight');
        const waist = spanFromAnchors(anchors, 'torsoWaistLeft', 'torsoWaistRight');
        const hips = spanFromAnchors(anchors, 'torsoHipLeft', 'torsoHipRight');
        if (!shoulders || !waist || !hips) return null;

        const waistY = (anchors.torsoWaistLeft.y + anchors.torsoWaistRight.y) / 2;
        return {
            shoulderL: shoulders.left,
            shoulderR: shoulders.right,
            waistL: waist.left,
            waistR: waist.right,
            hemL: hips.left,
            hemR: hips.right,
            waistY,
            source: 'body-torso-anchors',
        };
    }

    function isBaseArmourImage(img) {
        const g = window.gameVisuals;
        return !!img && !!g && (img === g.humanLight || img === g.humanMedium || img === g.humanHeavy);
    }

    function installGoldArmourTracking() {
        const current = window.getGoldTintedSprite;
        if (typeof current !== 'function') return;
        if (current.__humanFemaleVerticalExtentTracking) return;
        const wrapped = function(img, ...rest) {
            const out = current.call(this, img, ...rest);
            if (isBaseArmourImage(img) && out && typeof out === 'object') {
                try { goldArmourImages.add(out); } catch (_) {}
            }
            return out;
        };
        wrapped.__humanFemaleVerticalExtentTracking = true;
        window.getGoldTintedSprite = wrapped;
    }

    function isTrackedArmourImage(img) {
        return isBaseArmourImage(img) || (!!img && goldArmourImages.has(img));
    }

    function isActiveHumanFemale() {
        const e = window.__activeCharacterEntity;
        return !!e && e.race === 'human' && e.gender === 'female';
    }

    // The core armour draw rectangle ends at the body bottom. Add the missing
    // independent lower extent here, after characterRig has installed its draw
    // wrapper. Temporarily offset topShift only for characterRig's rectangle
    // matcher so the deliberately taller rectangle is still recognised; the
    // actual top coordinate is unchanged, so this can only extend downward.
    function installVerticalExtentWrapper(cfg) {
        const ctx = window.mapCtx;
        if (!ctx || !window.__characterRigInstalled) return false;
        if (ctx.__humanFemaleArmourVerticalExtentInstalled) return true;

        installGoldArmourTracking();
        const previousDrawImage = ctx.drawImage.bind(ctx);
        ctx.drawImage = function(img, ...args) {
            if (args.length === 4 && isTrackedArmourImage(img) && isActiveHumanFemale()) {
                const [dx, dy, dw, dh] = args;
                const bottomDrop = Number(cfg.armour?.bottomDrop) || 0;
                if (bottomDrop > 0) {
                    const pixelDrop = bottomDrop * (window.hexSize || 1) * (window.cameraZoom || 1);
                    const savedTopShift = cfg.armour.topShift;
                    // characterRig matches incoming armour height against
                    // bodyH - topShift. Reducing the matcher shift by exactly
                    // bottomDrop makes the extended rectangle an exact match.
                    cfg.armour.topShift = savedTopShift - bottomDrop;
                    try {
                        return previousDrawImage(img, dx, dy, dw, dh + pixelDrop);
                    } finally {
                        cfg.armour.topShift = savedTopShift;
                    }
                }
            }
            return previousDrawImage(img, ...args);
        };
        ctx.__humanFemaleArmourVerticalExtentInstalled = true;
        return true;
    }

    function apply() {
        let cfg;
        try {
            // CHAR_CONFIG is a top-level lexical binding in gameEngine.js. It
            // deliberately is not window.CHAR_CONFIG, but later classic scripts
            // can still access it by identifier once gameEngine has initialised.
            cfg = typeof CHAR_CONFIG !== 'undefined' ? CHAR_CONFIG?.human_female : null;
        } catch (_) {
            return false;
        }

        // Wait for both the renderer's mutable fit objects and the canonical
        // reference body rig. facingSystem loads spriteRigging.js on demand.
        const armourRig = window.ARMOUR_RIGS?.human_female;
        const directionalArmour = window.DIRECTIONAL_ARMOUR_RIGS?.human_female;
        const bodyRigs = window.HUMAN_FEMALE_REFERENCE_RIGS;
        if (!cfg || !armourRig || !directionalArmour || !bodyRigs || !window.__characterRigInstalled) return false;

        const derived = {};
        for (const view of ['front', 'side', 'back']) {
            const fit = deriveArmourRigFromBody(view);
            if (!fit) return false;
            derived[view] = fit;
            // Mutate the existing shared objects because characterRig's draw
            // wrapper already holds references to this directional map.
            Object.assign(directionalArmour[view], fit);
        }
        Object.assign(armourRig, derived.front);

        // Width and horizontal shaping remain exactly as previously validated.
        // Only the vertical envelope changes here: start substantially higher,
        // while bottomDrop independently extends the hem slightly downward.
        cfg.armour = {
            ...(cfg.armour || {}),
            wMult: 1.58,
            topShift: HUMAN_FEMALE_ARMOUR_TOP_SHIFT,
            bottomDrop: HUMAN_FEMALE_ARMOUR_BOTTOM_DROP,
            mesh: { ...derived.front },
        };

        if (!installVerticalExtentWrapper(cfg)) return false;

        // Centre the helmet on the character and enlarge its draw box enough
        // to compensate for transparent padding in the helmet artwork.
        cfg.helm = {
            ...(cfg.helm || {}),
            xOff: 0,
            yOff: -0.32,
            sizeMult: 1.48,
        };

        // Directional attachment metadata should agree with the centred helmet
        // even when the character is facing sideways.
        const rigs = window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        if (rigs) {
            for (const view of ['front', 'side', 'back']) {
                if (rigs[view]?.headTop) rigs[view].headTop.x = 0.5;
            }
        }

        window.HUMAN_FEMALE_EQUIPMENT_FIT = {
            armour: { ...cfg.armour },
            armourViews: {
                front: { ...derived.front },
                side: { ...derived.side },
                back: { ...derived.back },
            },
            armourSource: 'body-torso-anchors',
            armourClearanceX: HUMAN_FEMALE_ARMOUR_CLEARANCE_X,
            armourVertical: {
                topShift: HUMAN_FEMALE_ARMOUR_TOP_SHIFT,
                bottomDrop: HUMAN_FEMALE_ARMOUR_BOTTOM_DROP,
            },
            helm: { ...cfg.helm },
        };
        window.deriveHumanFemaleArmourRig = deriveArmourRigFromBody;
        window.__directionalEquipmentFitTuningApplied = true;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 10000);
})();
