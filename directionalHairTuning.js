// directionalHairTuning.js
// Small presentation-only geometry overrides for directional character art.
// Kept separate from the renderer so crop/fit tuning can iterate without
// touching tactical render sequencing or equipment layering.

(() => {
    'use strict';

    function apply() {
        const side = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT?.side;
        if (!side) return false;

        // The authored side hair occupies a narrower portion of its 1254x1254
        // source canvas than the head in body_side.png. The old fit left the
        // rear scalp exposed. Broaden both the source crop and destination,
        // centred on the existing placement, while leaving front/back alone.
        side.hairCrop = { x:0.275, y:0.235, w:0.455, h:0.455 };
        side.hairDest = { x:0.270, y:-0.015, w:0.460, h:0.420 };
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 5000);
})();
