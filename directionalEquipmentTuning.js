// directionalEquipmentTuning.js
// Presentation-only fit tuning for human-female directional equipment.
// The underlying armour/helmet PNGs contain generous transparent padding, so
// their legacy destination rectangles make the visible gear look too small.
//
// Important: directional armour is a flat authored sprite layer. It may be
// translated and scaled to fit the body, but must not be tapered, rotated,
// sheared or otherwise mesh-warped. The reference art already contains its
// intended silhouette.

(() => {
    'use strict';

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

        // characterRig.js exports the same mutable rig object used by its
        // drawImage wrapper. Wait for that object rather than applying the
        // destination-rectangle tuning early and accidentally leaving the old
        // tapered mesh active.
        const armourRig = window.ARMOUR_RIGS?.human_female;
        if (!cfg || !armourRig) return false;

        // Armour should read as a fitted body layer: approximately the visible
        // character width, starting below the head and extending to the lower
        // body. Extra draw width compensates for transparent PNG margins.
        // These two values are the only shape fit we want: translation + scale.
        cfg.armour = {
            ...(cfg.armour || {}),
            wMult: 1.34,
            topShift: 0.36,
        };

        // Keep the mesh mathematically rectangular. drawWarpedArmour still
        // provides backwards-compatible rendering for the existing armour path,
        // but with these points every triangle resolves to axis-aligned scale +
        // translation (no rotation/shear/taper), so the authored sprite cannot
        // be twisted.
        Object.assign(armourRig, {
            shoulderL: 0,
            shoulderR: 1,
            waistL: 0,
            waistR: 1,
            hemL: 0,
            hemR: 1,
            waistY: 0.55,
        });
        cfg.armour.mesh = { ...armourRig };

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
            helm: { ...cfg.helm },
        };
        window.__directionalEquipmentFitTuningApplied = true;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 10000);
})();
