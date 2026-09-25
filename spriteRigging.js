// spriteRigging.js
// Sprite trim metadata + composition helpers. Metadata describes the logical
// pre-trim canvas so physically cropped PNGs can keep their authored placement.
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

    // Physical trim metadata is asset-specific. The reference rig owns the
    // canonical average body entries; other currently-untrimmed human-female
    // layers are registered here so the production renderer can already use
    // the same code path without changing their pixels or placement.
    const SPRITE_TRIM_METADATA_BY_PATH = {};
    function registerTrimMetadata(metadata) {
        if (!metadata?.path) return metadata;
        SPRITE_TRIM_METADATA_BY_PATH[metadata.path] = metadata;
        return metadata;
    }
    Object.values(HUMAN_FEMALE_REFERENCE_RIGS).forEach(rig => registerTrimMetadata(rig.sprite));
    [
        'images/characters/human_female/body_broad_front.png',
        'images/characters/human_female/body_broad_side.png',
        'images/characters/human_female/body_broad_back.png',
        'images/characters/human_female/hair_brown_1_front.png',
        'images/characters/human_female/hair_brown_1_side.png',
        'images/characters/human_female/hair_brown_1_back.png',
        'images/characters/human_female/hair_braid_front.png',
        'images/characters/human_female/hair_braid_side.png',
        'images/characters/human_female/hair_braid_back.png',
        'images/characters/human_female/hair_curly_front.png',
        'images/characters/human_female/hair_curly_side.png',
        'images/characters/human_female/hair_curly_back.png',
    ].forEach(path => registerTrimMetadata(untrimmedMetadata(path)));

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

    function normaliseAssetPath(value) {
        if (!value) return '';
        const raw = String(value);
        try {
            const url = new URL(raw, typeof document !== 'undefined' ? document.baseURI : 'http://local/');
            return url.pathname.replace(/^\//, '');
        } catch (_) {
            return raw.replace(/^\//, '').split('?')[0].split('#')[0];
        }
    }

    function sourcePathForImage(image) {
        const source = image?.__recolorBaseSource || image;
        return normaliseAssetPath(source?.src);
    }

    function getTrimMetadataForImage(image) {
        return SPRITE_TRIM_METADATA_BY_PATH[sourcePathForImage(image)] || null;
    }

    // Trim-aware equivalent of the production renderer's authored crop draw.
    // `crop` is normalised to the ORIGINAL full canvas, while `dest` is
    // normalised to the character bounds. If the physical file has been
    // trimmed, draw only the crop/trim intersection and move that fragment to
    // the same place it occupied before trimming. Returns false for an
    // unregistered asset so callers can safely fall back to their legacy draw.
    function drawTrimAwareCroppedSprite(nativeDraw, image, crop, dest, bounds, metadata = null) {
        if (typeof nativeDraw !== 'function' || !image || !crop || !dest || !bounds) return false;
        const trimMetadata = metadata || getTrimMetadataForImage(image);
        if (!trimMetadata) return false;

        const trim = resolveTrimMetadata(trimMetadata, image);
        const iw = image.naturalWidth || image.width;
        const ih = image.naturalHeight || image.height;
        if (!iw || !ih) return false;

        const cropPx = {
            x: crop.x * trim.originalWidth,
            y: crop.y * trim.originalHeight,
            width: crop.w * trim.originalWidth,
            height: crop.h * trim.originalHeight,
        };
        if (cropPx.width <= 0 || cropPx.height <= 0) return true;

        const left = Math.max(cropPx.x, trim.trimLeft);
        const top = Math.max(cropPx.y, trim.trimTop);
        const right = Math.min(cropPx.x + cropPx.width, trim.trimLeft + trim.trimWidth);
        const bottom = Math.min(cropPx.y + cropPx.height, trim.trimTop + trim.trimHeight);
        if (right <= left || bottom <= top) return true;

        // Physical image pixels normally equal trimWidth/trimHeight. Scale the
        // source coordinates too so generated/recoloured canvases remain safe
        // if a browser representation differs from the metadata pixel count.
        const physicalScaleX = iw / trim.trimWidth;
        const physicalScaleY = ih / trim.trimHeight;
        const sx = (left - trim.trimLeft) * physicalScaleX;
        const sy = (top - trim.trimTop) * physicalScaleY;
        const sw = (right - left) * physicalScaleX;
        const sh = (bottom - top) * physicalScaleY;

        const destX = bounds.left + dest.x * bounds.width;
        const destY = bounds.top + dest.y * bounds.height;
        const destW = dest.w * bounds.width;
        const destH = dest.h * bounds.height;
        const dx = destX + ((left - cropPx.x) / cropPx.width) * destW;
        const dy = destY + ((top - cropPx.y) / cropPx.height) * destH;
        const dw = ((right - left) / cropPx.width) * destW;
        const dh = ((bottom - top) / cropPx.height) * destH;

        nativeDraw(image, sx, sy, sw, sh, dx, dy, dw, dh);
        return true;
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
    window.SPRITE_TRIM_METADATA_BY_PATH = SPRITE_TRIM_METADATA_BY_PATH;
    window.HUMAN_FEMALE_REFERENCE_RIGS = HUMAN_FEMALE_REFERENCE_RIGS;
    window.HUMAN_FEMALE_PREVIEW_LAYERS = HUMAN_FEMALE_PREVIEW_LAYERS;
    window.resolveSpriteTrimMetadata = resolveTrimMetadata;
    window.computeTrimAwareDestination = computeTrimAwareDestination;
    window.drawTrimAwareSprite = drawTrimAwareSprite;
    window.drawTrimAwareCroppedSprite = drawTrimAwareCroppedSprite;
    window.getSpriteTrimMetadataForImage = getTrimMetadataForImage;
    window.getSpriteReferenceRig = getReferenceRig;
    window.getSpriteRigAnchor = getRigAnchor;
    window.suggestSpriteAlphaTrim = suggestAlphaTrim;
})();