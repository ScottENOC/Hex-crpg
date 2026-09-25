// spriteRigging.js
// Additive sprite metadata + composition helpers. This first tranche is
// deliberately opt-in: existing production draws are unchanged until an
// image is explicitly rendered through drawTrimAwareSprite.
(() => {
    'use strict';

    const REQUIRED_TRIM_FIELDS = [
        'originalWidth', 'originalHeight', 'trimLeft', 'trimTop', 'trimWidth', 'trimHeight'
    ];

    function untrimmedMetadata(path) {
        return {
            path,
            originalWidth: null,
            originalHeight: null,
            trimLeft: 0,
            trimTop: 0,
            trimWidth: null,
            trimHeight: null,
        };
    }

    // Shared semantic anchor names; coordinates are intentionally authored
    // independently for front, side and back. Do not derive side/back from
    // the front view. Values are normalised to the logical body rectangle.
    const HUMAN_FEMALE_REFERENCE_RIGS = {
        front: {
            sprite: untrimmedMetadata('images/characters/human_female/body_front.png'),
            anchors: {
                scalpCenter:  { x:0.500, y:0.105 },
                hairAnchor:   { x:0.500, y:0.125 },
                helmetAnchor: { x:0.500, y:0.030 },
                leftHand:     { x:0.270, y:0.610 },
                rightHand:    { x:0.730, y:0.610 },
                mainHandGrip: { x:0.270, y:0.610 },
                offHandGrip:  { x:0.730, y:0.610 },
                waistCenter:  { x:0.500, y:0.550 },
                leftFoot:     { x:0.420, y:0.965 },
                rightFoot:    { x:0.580, y:0.965 },
            },
        },
        side: {
            sprite: untrimmedMetadata('images/characters/human_female/body_side.png'),
            anchors: {
                scalpCenter:  { x:0.525, y:0.105 },
                hairAnchor:   { x:0.525, y:0.130 },
                helmetAnchor: { x:0.525, y:0.030 },
                leftHand:     { x:0.490, y:0.580 },
                rightHand:    { x:0.530, y:0.620 },
                mainHandGrip: { x:0.530, y:0.620 },
                offHandGrip:  { x:0.490, y:0.580 },
                waistCenter:  { x:0.505, y:0.550 },
                leftFoot:     { x:0.485, y:0.965 },
                rightFoot:    { x:0.535, y:0.965 },
            },
        },
        back: {
            sprite: untrimmedMetadata('images/characters/human_female/body_back.png'),
            anchors: {
                scalpCenter:  { x:0.500, y:0.105 },
                hairAnchor:   { x:0.500, y:0.125 },
                helmetAnchor: { x:0.500, y:0.030 },
                leftHand:     { x:0.730, y:0.610 },
                rightHand:    { x:0.270, y:0.610 },
                mainHandGrip: { x:0.730, y:0.610 },
                offHandGrip:  { x:0.270, y:0.610 },
                waistCenter:  { x:0.500, y:0.550 },
                leftFoot:     { x:0.580, y:0.965 },
                rightFoot:    { x:0.420, y:0.965 },
            },
        },
    };

    const SPRITE_REFERENCE_RIGS = {
        human_female: HUMAN_FEMALE_REFERENCE_RIGS,
    };

    const HUMAN_FEMALE_PREVIEW_LAYERS = {
        hair: {
            front: 'images/characters/human_female/hair_brown_1_front.png',
            side: 'images/characters/human_female/hair_brown_1_side.png',
            back: 'images/characters/human_female/hair_brown_1_back.png',
        },
        helmet: 'images/nasalHelm.png',
        weapon: 'images/sword.png',
        shield: 'images/shield.png',
    };

    function resolveTrimMetadata(metadata, image) {
        const iw = image?.naturalWidth || image?.width || 0;
        const ih = image?.naturalHeight || image?.height || 0;
        const originalWidth = metadata?.originalWidth ?? iw;
        const originalHeight = metadata?.originalHeight ?? ih;
        const trimLeft = metadata?.trimLeft ?? 0;
        const trimTop = metadata?.trimTop ?? 0;
        const trimWidth = metadata?.trimWidth ?? iw;
        const trimHeight = metadata?.trimHeight ?? ih;
        const resolved = { originalWidth, originalHeight, trimLeft, trimTop, trimWidth, trimHeight };
        if (![originalWidth, originalHeight, trimWidth, trimHeight].every(v => Number.isFinite(v) && v > 0)) {
            throw new Error('Sprite trim metadata requires positive resolved dimensions');
        }
        if (![trimLeft, trimTop].every(v => Number.isFinite(v) && v >= 0)) {
            throw new Error('Sprite trim offsets must be non-negative numbers');
        }
        if (trimLeft + trimWidth > originalWidth || trimTop + trimHeight > originalHeight) {
            throw new Error('Sprite trim rectangle must fit inside the original canvas');
        }
        return resolved;
    }

    function computeTrimAwareDestination(metadata, logicalBounds, image) {
        const trim = resolveTrimMetadata(metadata, image);
        const sx = logicalBounds.width / trim.originalWidth;
        const sy = logicalBounds.height / trim.originalHeight;
        return {
            x: logicalBounds.x + trim.trimLeft * sx,
            y: logicalBounds.y + trim.trimTop * sy,
            width: trim.trimWidth * sx,
            height: trim.trimHeight * sy,
        };
    }

    // Draws a physically trimmed image into the same logical rectangle the
    // original full-canvas sprite occupied. For today's untrimmed assets the
    // resolved destination is exactly the caller's logical bounds.
    function drawTrimAwareSprite(ctx, image, metadata, x, y, width, height) {
        if (!ctx || !image) return null;
        const dest = computeTrimAwareDestination(metadata, { x, y, width, height }, image);
        const rawDraw = (typeof CanvasRenderingContext2D !== 'undefined')
            ? CanvasRenderingContext2D.prototype.drawImage
            : ctx.drawImage;
        rawDraw.call(ctx, image, dest.x, dest.y, dest.width, dest.height);
        return dest;
    }

    function getReferenceRig(characterKey, direction) {
        return SPRITE_REFERENCE_RIGS[characterKey]?.[direction] || null;
    }

    function getRigAnchor(characterKey, direction, anchorName, bounds) {
        const point = getReferenceRig(characterKey, direction)?.anchors?.[anchorName];
        if (!point) return null;
        if (!bounds) return { ...point };
        return {
            x: bounds.x + point.x * bounds.width,
            y: bounds.y + point.y * bounds.height,
        };
    }

    // Optional authoring helper: scans alpha and returns a suggested crop.
    // It is intentionally advisory only; anchor tuning remains authored.
    function suggestAlphaTrim(image, alphaThreshold = 1) {
        if (!image || typeof document === 'undefined') return null;
        const w = image.naturalWidth || image.width;
        const h = image.naturalHeight || image.height;
        if (!w || !h) return null;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently:true });
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;
        let minX=w, minY=h, maxX=-1, maxY=-1;
        for (let y=0; y<h; y++) {
            for (let x=0; x<w; x++) {
                if (data[(y*w+x)*4+3] < alphaThreshold) continue;
                if (x<minX) minX=x; if (x>maxX) maxX=x;
                if (y<minY) minY=y; if (y>maxY) maxY=y;
            }
        }
        if (maxX < minX || maxY < minY) return null;
        return {
            originalWidth:w, originalHeight:h,
            trimLeft:minX, trimTop:minY,
            trimWidth:maxX-minX+1, trimHeight:maxY-minY+1,
        };
    }

    window.SPRITE_TRIM_FIELDS = REQUIRED_TRIM_FIELDS;
    window.SPRITE_REFERENCE_RIGS = SPRITE_REFERENCE_RIGS;
    window.HUMAN_FEMALE_REFERENCE_RIGS = HUMAN_FEMALE_REFERENCE_RIGS;
    window.HUMAN_FEMALE_PREVIEW_LAYERS = HUMAN_FEMALE_PREVIEW_LAYERS;
    window.resolveSpriteTrimMetadata = resolveTrimMetadata;
    window.computeTrimAwareDestination = computeTrimAwareDestination;
    window.drawTrimAwareSprite = drawTrimAwareSprite;
    window.getSpriteReferenceRig = getReferenceRig;
    window.getSpriteRigAnchor = getRigAnchor;
    window.suggestSpriteAlphaTrim = suggestAlphaTrim;
})();
