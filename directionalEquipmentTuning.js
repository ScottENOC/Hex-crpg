// directionalEquipmentTuning.js
// Presentation-only fit tuning for human-female directional equipment.
//
// Body geometry is canonical in spriteRigging.js. Armour horizontal fit is
// derived from torso anchors. Vertical/overall scale is measured from the
// armour image's real visible silhouette so transparent padding (and isolated
// edge-noise pixels) cannot make the fitted armour look too small.

(() => {
    'use strict';

    const HUMAN_FEMALE_ARMOUR_CLEARANCE_X = 0.32;
    const ALPHA_THRESHOLD = 24;
    const MIN_ROW_OCCUPANCY_FRAC = 0.005;
    const MIN_COLUMN_OCCUPANCY_FRAC = 0.005;

    // Safe fallback used only until an armour image can be measured (or if an
    // alpha scan is unavailable). Normal rendering replaces this rectangle
    // with the measured shoulder-to-feet fit below.
    const FALLBACK_ARMOUR = { wMult:1.58, topShift:0.10, bottomDrop:0.08 };

    const goldArmourImages = new WeakSet();
    const measuredFits = new WeakMap();

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

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

    function verticalBodyTarget(view) {
        const anchors = window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
        if (!anchors) return null;
        const shoulderY = (anchors.torsoShoulderLeft.y + anchors.torsoShoulderRight.y) / 2;
        const footY = Math.max(anchors.leftFoot.y, anchors.rightFoot.y);
        if (!(footY > shoulderY)) return null;
        return {
            shoulderY,
            footY,
            heightFrac: footY - shoulderY,
        };
    }

    // A simple first/last-alpha-pixel box is too fragile for generated PNGs:
    // one isolated semi-opaque pixel near an edge can make the source appear
    // almost full-height and therefore shrink the fitted armour dramatically.
    // Count opaque pixels per row/column and require a small but real amount of
    // silhouette occupancy before accepting that row/column as armour content.
    function measureRobustAlphaBounds(image, alphaThreshold = ALPHA_THRESHOLD) {
        if (!image || typeof document === 'undefined') return null;
        const w = image.naturalWidth || image.width || 0;
        const h = image.naturalHeight || image.height || 0;
        if (!w || !h) return null;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently:true });
        if (!ctx) return null;
        try {
            ctx.drawImage(image, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;
            const rowCounts = new Uint32Array(h);
            const colCounts = new Uint32Array(w);
            for (let y=0; y<h; y++) {
                const rowBase = y * w * 4;
                for (let x=0; x<w; x++) {
                    if (data[rowBase + x*4 + 3] < alphaThreshold) continue;
                    rowCounts[y]++;
                    colCounts[x]++;
                }
            }

            const minRowPixels = Math.max(3, Math.ceil(w * MIN_ROW_OCCUPANCY_FRAC));
            const minColPixels = Math.max(3, Math.ceil(h * MIN_COLUMN_OCCUPANCY_FRAC));
            let minY = 0, maxY = h - 1, minX = 0, maxX = w - 1;
            while (minY < h && rowCounts[minY] < minRowPixels) minY++;
            while (maxY >= minY && rowCounts[maxY] < minRowPixels) maxY--;
            while (minX < w && colCounts[minX] < minColPixels) minX++;
            while (maxX >= minX && colCounts[maxX] < minColPixels) maxX--;
            if (maxY < minY || maxX < minX) return null;

            return {
                originalWidth:w,
                originalHeight:h,
                trimLeft:minX,
                trimTop:minY,
                trimWidth:maxX-minX+1,
                trimHeight:maxY-minY+1,
                alphaThreshold,
                minRowPixels,
                minColPixels,
                method:'row-column-occupancy',
            };
        } catch (_) {
            return null;
        }
    }

    // Solve a uniform image scale from the REAL armour silhouette height.
    // The source image is enlarged until the robust visible span equals the
    // body shoulder-to-feet span. Width uses the same pixel scale so artwork
    // aspect ratio is preserved.
    function computeMeasuredArmourFit(image, view = 'front', trimOverride = null) {
        const cfg = getHumanFemaleConfig();
        const target = verticalBodyTarget(view);
        const iw = image?.naturalWidth || image?.width || 0;
        const ih = image?.naturalHeight || image?.height || 0;
        if (!cfg || !target || !iw || !ih) return null;

        const rawTrim = typeof window.suggestSpriteAlphaTrim === 'function'
            ? window.suggestSpriteAlphaTrim(image, 8)
            : null;
        const trim = trimOverride || measureRobustAlphaBounds(image) || rawTrim;
        if (!trim?.trimHeight || !trim?.originalHeight || !trim?.originalWidth) return null;

        const targetVisibleHeight = cfg.bodyH * target.heightFrac;
        const scaleHexPerSourcePixel = targetVisibleHeight / trim.trimHeight;
        const outerHeight = trim.originalHeight * scaleHexPerSourcePixel;
        const outerWidth = trim.originalWidth * scaleHexPerSourcePixel;
        const topShift = cfg.bodyH * target.shoulderY - trim.trimTop * scaleHexPerSourcePixel;
        const visibleTop = topShift + trim.trimTop * scaleHexPerSourcePixel;
        const visibleBottom = topShift + (trim.trimTop + trim.trimHeight) * scaleHexPerSourcePixel;

        return {
            view,
            trim: { ...trim },
            rawTrim: rawTrim ? { ...rawTrim } : null,
            target: { ...target },
            targetVisibleHeight,
            outerHeight,
            outerWidth,
            wMult: outerWidth / cfg.bodyW,
            topShift,
            bottomDrop: outerHeight - cfg.bodyH + topShift,
            visibleTop,
            visibleBottom,
            source: 'robust-alpha-bounds-to-body-shoulders-feet',
        };
    }

    function getHumanFemaleConfig() {
        try {
            return typeof CHAR_CONFIG !== 'undefined' ? CHAR_CONFIG?.human_female : null;
        } catch (_) {
            return null;
        }
    }

    function isBaseArmourImage(img) {
        const g = window.gameVisuals;
        return !!img && !!g && (img === g.humanLight || img === g.humanMedium || img === g.humanHeavy);
    }

    function installGoldArmourTracking() {
        const current = window.getGoldTintedSprite;
        if (typeof current !== 'function' || current.__humanFemaleMeasuredArmourTracking) return;
        const wrapped = function(img, ...rest) {
            const out = current.call(this, img, ...rest);
            if (isBaseArmourImage(img) && out && typeof out === 'object') {
                try { goldArmourImages.add(out); } catch (_) {}
            }
            return out;
        };
        wrapped.__humanFemaleMeasuredArmourTracking = true;
        window.getGoldTintedSprite = wrapped;
    }

    function isTrackedArmourImage(img) {
        return isBaseArmourImage(img) || (!!img && goldArmourImages.has(img));
    }

    function isActiveHumanFemale() {
        const e = window.__activeCharacterEntity;
        return !!e && e.race === 'human' && e.gender === 'female';
    }

    function measuredFitFor(image, view) {
        let byView = measuredFits.get(image);
        if (!byView) {
            byView = {};
            measuredFits.set(image, byView);
        }
        if (!byView[view]) byView[view] = computeMeasuredArmourFit(image, view);
        return byView[view] || null;
    }

    // gameEngine submits the old configurable armour rectangle. Intercept only
    // human-female armour, replace it with the mathematically measured box,
    // then temporarily tell characterRig's size matcher about that exact box.
    // characterRig still performs the axis-aligned strip deformation afterwards.
    function installMeasuredSizeWrapper(cfg) {
        const ctx = window.mapCtx;
        if (!ctx || !window.__characterRigInstalled) return false;
        if (ctx.__humanFemaleMeasuredArmourSizeInstalled) return true;

        installGoldArmourTracking();
        const previousDrawImage = ctx.drawImage.bind(ctx);
        ctx.drawImage = function(img, ...args) {
            if (args.length === 4 && isTrackedArmourImage(img) && isActiveHumanFemale()) {
                const view = facingToView(window.__activeCharacterFacing);
                const fit = measuredFitFor(img, view);
                if (fit) {
                    const [legacyDx, legacyDy, legacyDw] = args;
                    const hsZ = (window.hexSize || 1) * (window.cameraZoom || 1);
                    const bodyWidthPx = cfg.bodyW * hsZ;
                    const centreX = legacyDx + legacyDw / 2;
                    const bodyTop = legacyDy - (Number(cfg.armour?.topShift) || 0) * hsZ;
                    const dw = fit.outerWidth * hsZ;
                    const dh = fit.outerHeight * hsZ;
                    const dx = centreX - dw / 2;
                    const dy = bodyTop + fit.topShift * hsZ;

                    const savedWMult = cfg.armour.wMult;
                    const savedTopShift = cfg.armour.topShift;
                    const savedBottomDrop = cfg.armour.bottomDrop;
                    cfg.armour.wMult = dw / bodyWidthPx;
                    cfg.armour.topShift = cfg.bodyH - dh / hsZ; // matcher only
                    cfg.armour.bottomDrop = 0;
                    try {
                        const out = previousDrawImage(img, dx, dy, dw, dh);
                        window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour = { ...fit };
                        return out;
                    } finally {
                        cfg.armour.wMult = savedWMult;
                        cfg.armour.topShift = savedTopShift;
                        cfg.armour.bottomDrop = savedBottomDrop;
                    }
                }
            }
            return previousDrawImage(img, ...args);
        };
        ctx.__humanFemaleMeasuredArmourSizeInstalled = true;
        return true;
    }

    function apply() {
        const cfg = getHumanFemaleConfig();
        const armourRig = window.ARMOUR_RIGS?.human_female;
        const directionalArmour = window.DIRECTIONAL_ARMOUR_RIGS?.human_female;
        const bodyRigs = window.HUMAN_FEMALE_REFERENCE_RIGS;
        if (!cfg || !armourRig || !directionalArmour || !bodyRigs || !window.__characterRigInstalled) return false;

        const derived = {};
        for (const view of ['front', 'side', 'back']) {
            const fit = deriveArmourRigFromBody(view);
            if (!fit) return false;
            derived[view] = fit;
            Object.assign(directionalArmour[view], fit);
        }
        Object.assign(armourRig, derived.front);

        cfg.armour = {
            ...(cfg.armour || {}),
            ...FALLBACK_ARMOUR,
            mesh: { ...derived.front },
        };

        window.HUMAN_FEMALE_EQUIPMENT_FIT = {
            armour: { ...cfg.armour },
            armourViews: {
                front: { ...derived.front },
                side: { ...derived.side },
                back: { ...derived.back },
            },
            armourSource: 'body-torso-anchors',
            armourScaleSource: 'robust-alpha-bounds-to-body-shoulders-feet',
            armourClearanceX: HUMAN_FEMALE_ARMOUR_CLEARANCE_X,
            targetVerticalByView: Object.fromEntries(['front','side','back'].map(view => [view, verticalBodyTarget(view)])),
            helm: null,
        };

        if (!installMeasuredSizeWrapper(cfg)) return false;

        cfg.helm = {
            ...(cfg.helm || {}),
            xOff: 0,
            yOff: -0.32,
            sizeMult: 1.48,
        };
        window.HUMAN_FEMALE_EQUIPMENT_FIT.helm = { ...cfg.helm };

        const rigs = window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        if (rigs) {
            for (const view of ['front', 'side', 'back']) {
                if (rigs[view]?.headTop) rigs[view].headTop.x = 0.5;
            }
        }

        window.deriveHumanFemaleArmourRig = deriveArmourRigFromBody;
        window.measureHumanFemaleArmourAlphaBounds = measureRobustAlphaBounds;
        window.computeHumanFemaleMeasuredArmourFit = computeMeasuredArmourFit;
        window.__directionalEquipmentFitTuningApplied = true;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 10000);
})();
