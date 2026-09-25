// directionalEquipmentTuning.js
// Presentation-only fit tuning for human-female directional equipment.
// The underlying armour/helmet PNGs contain generous transparent padding, so
// their legacy destination rectangles make the visible gear look too small.

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
        if (!cfg) return false;

        // Armour should read as a fitted body layer: approximately the visible
        // character width, starting below the head and extending to the lower
        // body. Extra draw width compensates for transparent PNG margins.
        cfg.armour = {
            ...(cfg.armour || {}),
            wMult: 1.34,
            topShift: 0.36,
        };

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
