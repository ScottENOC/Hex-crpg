// directionalWeaponTuning.js
// Fine-tunes human-female directional weapon placement without changing the
// underlying authored body art. Front/back use attachment anchors; side views
// use item-grip adjustment to correct the hard-coded side placement.

(() => {
    'use strict';

    function apply() {
        const rigs = window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        const grips = window.ITEM_GRIPS;
        if (!rigs || !grips) return false;

        // Live-map correction: weapons were still sitting too close to the
        // character/camera centre and slightly too high. Push the hands farther
        // out toward the silhouette edges and down by roughly another 6% of
        // body height. Keep front/back mirrored around the body centre.
        if (rigs.front) {
            rigs.front.mainHand = { x:0.24, y:0.73 };
            rigs.front.offHand = { x:0.86, y:0.73 };
        }
        if (rigs.back) {
            rigs.back.mainHand = { x:0.86, y:0.73 };
            rigs.back.offHand = { x:0.24, y:0.73 };
        }

        // Side-facing weapon placement is partly determined by the item's grip
        // point. Lower the visual weapon slightly without changing its size.
        // Horizontal side mirroring remains in facingSystem.
        const gripAdjustments = {
            sword:  { x:0.56, y:0.79 },
            axe:    { x:0.56, y:0.69 },
            spear:  { x:0.56, y:0.75 },
            club:   { x:0.56, y:0.71 },
            bow:    { x:0.56, y:0.37 },
        };
        for (const [kind, point] of Object.entries(gripAdjustments)) {
            if (grips[kind]) Object.assign(grips[kind], point);
        }

        window.__directionalWeaponTuningApplied = true;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 10000);
})();
