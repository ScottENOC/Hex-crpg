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

        const base = Object.fromEntries(['front','side','back'].map(view => [view, {
            hairCrop: { ...layout[view].hairCrop },
            hairDest: { ...layout[view].hairDest },
            bodyCrop: { ...layout[view].bodyCrop },
            bodyDest: { ...layout[view].bodyDest },
        }]));

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

        // The broad body artwork extends materially farther left/right than the
        // average silhouette. The old average crop was literally cutting the
        // shoulders/hips off. Use a wider source window and a slightly wider
        // destination so broad stays visibly broad rather than being shrunk.
        const bodyTypeLayouts = {
            broad: {
                front: {
                    bodyCrop: { x:0.300, y:0.082, w:0.400, h:0.835 },
                    bodyDest: { x:-0.070, y:0.000, w:1.140, h:1.000 },
                },
                side: {
                    bodyCrop: { x:0.395, y:0.088, w:0.210, h:0.835 },
                    bodyDest: { x:0.185, y:0.000, w:0.630, h:1.000 },
                },
                back: {
                    bodyCrop: { x:0.300, y:0.080, w:0.400, h:0.840 },
                    bodyDest: { x:-0.070, y:0.000, w:1.140, h:1.000 },
                },
            },
        };

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
            Object.defineProperty(layout[view], 'bodyCrop', {
                configurable: true,
                enumerable: true,
                get() {
                    const bodyType = window.__activeCharacterEntity?.bodyType;
                    return bodyTypeLayouts[bodyType]?.[view]?.bodyCrop || base[view].bodyCrop;
                },
            });
            Object.defineProperty(layout[view], 'bodyDest', {
                configurable: true,
                enumerable: true,
                get() {
                    const bodyType = window.__activeCharacterEntity?.bodyType;
                    return bodyTypeLayouts[bodyType]?.[view]?.bodyDest || base[view].bodyDest;
                },
            });
        }

        window.HUMAN_FEMALE_HAIR_STYLE_LAYOUTS = styleLayouts;
        window.HUMAN_FEMALE_BODY_TYPE_LAYOUTS = bodyTypeLayouts;
        window.__directionalHairStyleTuningInstalled = true;
        window.__directionalBodyTypeTuningInstalled = true;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 5000);
})();
