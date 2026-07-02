// spriteRecolor.js
// Cheap visual variety without new art: recolors a base body sprite's
// clothing (identified by a lightness band, and only below a head-region
// cutoff so faces/skin are never touched) to a different hue. This is real
// per-pixel canvas work, so results are cached per (image, hue) pair rather
// than redone every render frame.
//
// Why lightness, not a color-distance/hue match: sampling the actual sprite
// (images/humanmale.png) showed skin and clothing share almost the same hue
// (~20-26°) — these are all "warm brown" pixel art assets. They separate
// cleanly by lightness instead: skin sits around L=0.6-0.73, the tunic
// around L=0.38-0.42, and the pants/shading around L=0.12-0.33. Recoloring
// by lightness band (not hue distance) is what actually isolates clothing.

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

// Returns a canvas with clothing recolored to targetHue (0-360). Falls back
// to the original image if it isn't loaded yet (matches the imgOk-style
// guards used elsewhere for not-yet-loaded assets).
function getRecoloredSprite(img, targetHue) {
    if (!img || !img.complete || !img.naturalWidth) return img;
    const cacheKey = `${img.src}::${targetHue}`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const headCutoffY = Math.floor(canvas.height * 0.32); // never touch the face/head region
    const bodyHeight = canvas.height - headCutoffY;
    if (bodyHeight > 0) {
        const imageData = ctx.getImageData(0, headCutoffY, canvas.width, bodyHeight);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 50) continue; // skip transparent pixels
            const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
            // Clothing band: tunic + pants + shading. Skin (forearms, hands,
            // feet — L > ~0.55) stays untouched even below the head cutoff.
            if (l >= 0.12 && l <= 0.5) {
                const [r2, g2, b2] = hslToRgb(targetHue, s, l);
                data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
            }
        }
        ctx.putImageData(imageData, 0, headCutoffY);
    }

    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getRecoloredSprite = getRecoloredSprite;

// Deterministic hue per name, so a given character always looks the same
// (across renders and save/load) without needing an explicit stored field.
function hashStringToHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
}
window.hashStringToHue = hashStringToHue;
