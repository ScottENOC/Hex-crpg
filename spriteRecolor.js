// spriteRecolor.js
// Cheap visual variety without new art: recolors a base body sprite's shirt,
// pants, and skin (each identified by its own lightness band) independently,
// plus a separate full-image recolor for the hair overlay sprite. Real
// per-pixel canvas work, so results are cached per (image, hues) combination
// rather than redone every render frame.
//
// Why lightness, not a color-distance/hue match: sampling the actual sprite
// (images/humanmale.png) showed skin and clothing share almost the same hue
// (~20-26°) — these are all "warm brown" pixel art assets. They separate
// cleanly by lightness instead. Sampling a center-column strip down the body:
// shirt/tunic sits around L=0.43-0.45, pants around L=0.17-0.18, boots drop
// below L=0.12 (left unrecolored — a small trade-off to stay clear of pure-
// black outline strokes), and skin (face, forearms, hands) sits at L=0.55+.

const _recolorCache = {};

function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h *= 60;
    }
    return [h, s, l];
}

// The head/face region is excluded from the shirt/pants bands (so a dark
// eyebrow/mouth pixel never gets recolored as clothing) but skin recoloring
// deliberately covers the whole image, since skin includes the face.
const HEAD_CUTOFF_FRAC = 0.32;
const SHIRT_BAND = [0.36, 0.50];
const PANTS_BAND = [0.12, 0.36];
const SKIN_BAND_MIN = 0.55;

// Returns a canvas with shirt/pants/skin recolored per the given hues.
// `hues` is `{ shirtHue, pantsHue, skinHue }` — any subset may be omitted
// to leave that band untouched. Falls back to the original image if it
// isn't loaded yet.
function getRecoloredSprite(img, hues) {
    if (!img || !img.complete || !img.naturalWidth) return img;
    const { shirtHue, pantsHue, skinHue } = hues || {};
    if (shirtHue === undefined && pantsHue === undefined && skinHue === undefined) return img;

    const cacheKey = `${img.src}::s${shirtHue ?? 'x'}:p${pantsHue ?? 'x'}:k${skinHue ?? 'x'}`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    if (shirtHue !== undefined || pantsHue !== undefined) {
        const headCutoffY = Math.floor(canvas.height * HEAD_CUTOFF_FRAC);
        const bodyHeight = canvas.height - headCutoffY;
        if (bodyHeight > 0) {
            const imageData = ctx.getImageData(0, headCutoffY, canvas.width, bodyHeight);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 50) continue; // skip transparent pixels
                const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                if (shirtHue !== undefined && l >= SHIRT_BAND[0] && l <= SHIRT_BAND[1]) {
                    const [r2, g2, b2] = hslToRgb(shirtHue, s, l);
                    data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
                } else if (pantsHue !== undefined && l >= PANTS_BAND[0] && l < PANTS_BAND[1]) {
                    const [r2, g2, b2] = hslToRgb(pantsHue, s, l);
                    data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
                }
            }
            ctx.putImageData(imageData, 0, headCutoffY);
        }
    }

    if (skinHue !== undefined) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 50) continue;
            const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
            if (l >= SKIN_BAND_MIN) {
                const [r2, g2, b2] = hslToRgb(skinHue, s, l);
                data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getRecoloredSprite = getRecoloredSprite;

// Hair overlay sprites (e.g. images/humanmalehair.png) are almost entirely
// transparent except the hair strands themselves, so — unlike the body —
// every opaque pixel can be recolored without any lightness banding or
// head-cutoff exclusion.
function getRecoloredHairSprite(img, targetHue) {
    if (!img || !img.complete || !img.naturalWidth || targetHue === undefined) return img;
    const cacheKey = `${img.src}::hair:${targetHue}`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 50) continue;
        const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
        const [r2, g2, b2] = hslToRgb(targetHue, s, l);
        data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
    }
    ctx.putImageData(imageData, 0, 0);

    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getRecoloredHairSprite = getRecoloredHairSprite;

// Deterministic hue per string, so a given character always looks the same
// (across renders and save/load) without needing an explicit stored field.
// Callers salt the string per band (e.g. name+'_shirt' vs name+'_pants') so
// a character's bands don't all collapse to the same hue.
function hashStringToHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
}
window.hashStringToHue = hashStringToHue;
