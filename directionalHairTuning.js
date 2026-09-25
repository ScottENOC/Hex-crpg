// directionalHairTuning.js
// Small presentation-only geometry overrides for directional character art.
// Kept separate from the renderer so crop/fit tuning can iterate without
// touching tactical render sequencing or equipment layering.

(() => {
    'use strict';

    function apply() {
        const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT;
        if (!layout?.front || !layout?.side || !layout?.back) return false;
        if (window.__directionalHairStyleTuningInstalled) return true;

        // Baseline side-view correction: the authored side hair occupies a
        // narrower portion of its 1254x1254 source canvas than the head in
        // body_side.png. Broaden both source crop and destination so ordinary
        // shoulder-length hair covers the rear scalp correctly.
        layout.side.hairCrop = { x:0.275, y:0.235, w:0.455, h:0.455 };
        layout.side.hairDest = { x:0.270, y:-0.015, w:0.460, h:0.420 };

        // Capture the generic layout after the side correction. These remain
        // the fallback for shoulder-length hair and for callers that inspect
        // the layout without an active character context.
        const base = Object.fromEntries(['front','side','back'].map(view => [view, {
            hairCrop: { ...layout[view].hairCrop },
            hairDest: { ...layout[view].hairDest },
        }]));

        // Different authored hairstyles do not occupy the same part of their
        // source canvases. A single shared crop was clipping the top of the
        // long braid, while the compact curls sat about half a head too low.
        // Keep these as geometry-only overrides so the PNGs stay untouched.
        const styleLayouts = {
            braid: {
                front: {
                    hairCrop: { x:0.285, y:0.125, w:0.430, h:0.530 },
                    hairDest: { x:0.195, y:-0.035, w:0.610, h:0.455 },
                },
                side: {
                    hairCrop: { x:0.245, y:0.130, w:0.510, h:0.555 },
                    hairDest: { x:0.245, y:-0.035, w:0.510, h:0.460 },
                },
                back: {
                    hairCrop: { x:0.300, y:0.120, w:0.400, h:0.535 },
                    hairDest: { x:0.195, y:-0.030, w:0.610, h:0.465 },
                },
            },
            curly: {
                front: {
                    hairCrop: { ...base.front.hairCrop },
                    hairDest: { ...base.front.hairDest, y:base.front.hairDest.y - 0.075 },
                },
                side: {
                    hairCrop: { ...base.side.hairCrop },
                    hairDest: { ...base.side.hairDest, y:base.side.hairDest.y - 0.075 },
                },
                back: {
                    hairCrop: { ...base.back.hairCrop },
                    hairDest: { ...base.back.hairDest, y:base.back.hairDest.y - 0.070 },
                },
            },
        };

        // facingSystem reads layout[view].hairCrop / hairDest while inside its
        // active-entity render context. Accessors let those existing reads pick
        // the current hairstyle's authored geometry without changing tactical
        // render sequencing or the public layout API.
        for (const view of ['front','side','back']) {
            Object.defineProperty(layout[view], 'hairCrop', {
                configurable: true,
                enumerable: true,
                get() {
                    const style = window.__activeCharacterEntity?.hairStyle;
                    return styleLayouts[style]?.[view]?.hairCrop || base[view].hairCrop;
                },
            });
            Object.defineProperty(layout[view], 'hairDest', {
                configurable: true,
                enumerable: true,
                get() {
                    const style = window.__activeCharacterEntity?.hairStyle;
                    return styleLayouts[style]?.[view]?.hairDest || base[view].hairDest;
                },
            });
        }

        window.HUMAN_FEMALE_HAIR_STYLE_LAYOUTS = styleLayouts;
        window.__directionalHairStyleTuningInstalled = true;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 5000);
})();
