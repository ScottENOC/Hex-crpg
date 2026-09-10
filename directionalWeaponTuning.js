// directionalWeaponTuning.js
// Fine-tunes human-female directional weapon placement without changing the
// underlying authored body art. Front/back use attachment anchors; side views
// use the same item-grip adjustment to correct the hard-coded side placement.

(() => {
    'use strict';

    function apply() {
        const rigs = window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        const grips = window.ITEM_GRIPS;
        if (!rigs || !grips) return false;

        // User-tested correction: front/back weapons were too high and left.
        // Move both hand anchors right ~5% of body width and down ~6% of body height.
        if (rigs.front) {
            rigs.front.mainHand = { x:0.32, y:0.67 };
            rigs.front.offHand = { x:0.78, y:0.67 };
        }
        if (rigs.back) {
            rigs.back.mainHand = { x:0.78, y:0.67 };
            rigs.back.offHand = { x:0.32, y:0.67 };
        }

        // Side-facing weapons are positioned by facingSystem's side anchors.
        // Increasing grip.x shifts the rendered weapon left; reducing grip.y
        // shifts it down. This corrects the right-facing view while preserving
        // the left-facing horizontal mirror.
        const gripAdjustments = {
            sword:  { x:0.56, y:0.86 },
            axe:    { x:0.56, y:0.76 },
            spear:  { x:0.56, y:0.82 },
            club:   { x:0.56, y:0.78 },
            bow:    { x:0.56, y:0.44 },
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
