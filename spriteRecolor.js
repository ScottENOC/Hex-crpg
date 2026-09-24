// spriteRecolor.js
// Cheap visual variety without new art: recolors a base body sprite's shirt,
// pants, and skin independently, plus a separate full-image recolor for the
// hair overlay sprite. Real per-pixel canvas work, so results are cached per
// (image, hues) combination rather than redone every render frame.
//
// Why lightness matters here: sampling the actual sprite
// (images/humanmale.png) showed skin and clothing share almost the same hue
// (~20-26°) — these are all "warm brown" pixel art assets. They separate
// much more reliably by lightness. Sampling a center-column strip down the
// body: shirt/tunic sits around L=0.43-0.45, pants around L=0.17-0.18, boots
// drop below L=0.12, and skin (face, forearms, hands) sits at L=0.55+.
//
// IMPORTANT: body-part classification is always done from the UNTOUCHED
// source art. Never classify a pixel after an earlier recolour pass: changing
// skin lightness/hue can otherwise move a skin pixel into a shirt/pants band
// (or vice versa), making the creator sliders interfere with one another.

const _recolorCache = {};
const _recolorSourceIds = new WeakMap();
let _nextRecolorSourceId = 1;
function recolorSourceKey(img) {
    if (img.src) return img.src;
    if (!_recolorSourceIds.has(img)) _recolorSourceIds.set(img, _nextRecolorSourceId++);
    return `canvas-${_recolorSourceIds.get(img)}`;
}

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

// The head/face region is excluded from shirt/pants classification. Skin can
// occur anywhere, but source skin is a warm, chromatic, bright band in these
// authored human/elf/dwarf body sprites. Keeping the three masks mutually
// exclusive is more important than recolouring the odd anti-aliased edge.
const HEAD_CUTOFF_FRAC = 0.32;
const SHIRT_BAND = [0.36, 0.50];
const PANTS_BAND = [0.12, 0.36];
const SKIN_BAND_MIN = 0.55;

function sourceReady(img) {
    return !!img && ((img.complete && img.naturalWidth) || (img.width && img.height));
}
function sourceWidth(img) { return img.naturalWidth || img.width; }
function sourceHeight(img) { return img.naturalHeight || img.height; }

function sourceSkinPixel(h, s, l) {
    return h >= 5 && h <= 55 && s >= 0.18 && l >= SKIN_BAND_MIN && l <= 0.92;
}

function normalizeSkinSpec(tone) {
    if (tone === undefined || tone === null) return null;
    const spec = typeof tone === 'number' ? { hue:tone } : tone;
    if (!Number.isFinite(spec?.hue)) return null;
    return {
        hue: Number(spec.hue),
        saturation: Number.isFinite(spec.saturation) ? Number(spec.saturation) : null,
        lightness: Number.isFinite(spec.lightness) ? Number(spec.lightness) : null,
    };
}

function tintSkinPixel(h, s, l, spec) {
    const targetSat = spec.saturation;
    const targetLight = spec.lightness;
    const s2 = targetSat === null ? s : Math.max(0, Math.min(1, targetSat * (0.65 + s * 0.5)));
    const l2 = targetLight === null ? l : Math.max(0.08, Math.min(0.95, targetLight + (l - 0.68)));
    return hslToRgb(spec.hue, s2, l2);
}

// Returns a canvas with shirt/pants/skin recolored independently. If `img` is
// the result of getRecoloredSkinSprite, its untouched source and requested
// skin tone are carried as metadata so this function can perform a fresh,
// single classification pass from the original pixels. This is what prevents
// a changed skin tone from being reclassified as clothing.
function getRecoloredSprite(img, hues) {
    if (!sourceReady(img)) return img;
    const { shirtHue, pantsHue, skinHue, satMult = 1 } = hues || {};
    const inheritedSkinSpec = normalizeSkinSpec(img.__skinToneSpec);
    const explicitSkinSpec = normalizeSkinSpec(skinHue);
    const skinSpec = explicitSkinSpec || inheritedSkinSpec;
    if (shirtHue === undefined && pantsHue === undefined && !skinSpec) return img;

    const baseSource = sourceReady(img.__recolorBaseSource) ? img.__recolorBaseSource : img;
    const cacheKey = `${recolorSourceKey(baseSource)}::s${shirtHue ?? 'x'}:p${pantsHue ?? 'x'}:k${skinSpec?.hue ?? 'x'}:ks${skinSpec?.saturation ?? 'source'}:kl${skinSpec?.lightness ?? 'source'}:m${satMult}`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth(baseSource);
    canvas.height = sourceHeight(baseSource);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(baseSource, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const headCutoffY = Math.floor(canvas.height * HEAD_CUTOFF_FRAC);
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 50) continue;
        const pixel = i / 4;
        const y = Math.floor(pixel / canvas.width);
        const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);

        // Skin wins before clothing, using only untouched source properties.
        // Even if this call is clothing-only, identified skin pixels are
        // deliberately skipped so a blue shirt can never paint an arm blue.
        if (sourceSkinPixel(h, s, l)) {
            if (skinSpec) {
                const [r2, g2, b2] = tintSkinPixel(h, s, l, skinSpec);
                data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
            }
            continue;
        }

        if (y < headCutoffY) continue;
        const s2 = Math.max(0, Math.min(1, s * satMult));
        if (shirtHue !== undefined && l >= SHIRT_BAND[0] && l <= SHIRT_BAND[1]) {
            const [r2, g2, b2] = hslToRgb(shirtHue, s2, l);
            data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
        } else if (pantsHue !== undefined && l >= PANTS_BAND[0] && l < PANTS_BAND[1]) {
            const [r2, g2, b2] = hslToRgb(pantsHue, s2, l);
            data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
        }
    }
    ctx.putImageData(imageData, 0, 0);

    canvas.__recolorBaseSource = baseSource;
    if (skinSpec) canvas.__skinToneSpec = skinSpec;
    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getRecoloredSprite = getRecoloredSprite;

// Skin is a distinct recolour pass. The returned canvas remembers the
// untouched source + requested tone so a subsequent shirt/pants pass can
// rebuild from source rather than classifying already-recoloured pixels.
function getRecoloredSkinSprite(img, tone) {
    if (!sourceReady(img)) return img;
    const spec = normalizeSkinSpec(tone);
    if (!spec) return img;
    const baseSource = sourceReady(img.__recolorBaseSource) ? img.__recolorBaseSource : img;
    const cacheKey = `${recolorSourceKey(baseSource)}::skin-only:${spec.hue}:${spec.saturation ?? 'source'}:${spec.lightness ?? 'source'}`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth(baseSource); canvas.height = sourceHeight(baseSource);
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(baseSource, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i=0; i<data.length; i+=4) {
        if (data[i+3] < 50) continue;
        const [h,s,l] = rgbToHsl(data[i], data[i+1], data[i+2]);
        if (!sourceSkinPixel(h, s, l)) continue;
        const [r2,g2,b2] = tintSkinPixel(h, s, l, spec);
        data[i]=r2; data[i+1]=g2; data[i+2]=b2;
    }
    ctx.putImageData(imageData, 0, 0);
    canvas.__recolorBaseSource = baseSource;
    canvas.__skinToneSpec = spec;
    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getRecoloredSkinSprite = getRecoloredSkinSprite;

// Hair overlay sprites (e.g. images/humanmalehair.png) are almost entirely
// transparent except the hair strands themselves, so — unlike the body —
// every opaque pixel can be recolored without any lightness banding or
// head-cutoff exclusion. `lightMult`/`satMult` (default 1 — a plain hue
// swap, used for a player's explicit slider choice) scale the source
// pixel's own lightness/saturation, which is what actually distinguishes
// black/blonde/brown/red from each other rather than just rotating hue
// around the same dark-brown lightness (see HAIR_PALETTE below).
function getRecoloredHairSprite(img, targetHue, lightMult = 1, satMult = 1) {
    if (!img || !img.complete || !img.naturalWidth || targetHue === undefined) return img;
    const cacheKey = `${img.src}::hair:${targetHue}:${lightMult}:${satMult}`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 50) continue;
        const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
        const l2 = Math.max(0, Math.min(1, l * lightMult));
        const s2 = Math.max(0, Math.min(1, s * satMult));
        const [r2, g2, b2] = hslToRgb(targetHue, s2, l2);
        data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
    }
    ctx.putImageData(imageData, 0, 0);

    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getRecoloredHairSprite = getRecoloredHairSprite;
// Character rendering uses a distinct public entry point so terrain foliage
// instrumentation can measure seasonal leaf tinting without counting actors.
window.getRecoloredCharacterHairSprite = getRecoloredHairSprite;

// A dedicated gold-metal tint for equipment (armor/helm) art. The source
// armor/helm images are near-grayscale steel, so getRecoloredHairSprite's
// hue-swap (which multiplies the EXISTING saturation) leaves them looking
// unchanged — 0 saturation times any multiplier is still 0. This instead
// pushes every opaque pixel to a fixed strong-gold saturation while keeping
// its original lightness, so shading/highlights on the metal still read.
const GOLD_HUE = 45;
const GOLD_SATURATION = 0.65;
function getGoldTintedSprite(img) {
    if (!img || !img.complete || !img.naturalWidth) return img;
    const cacheKey = `${img.src}::gold`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 50) continue;
        const [, , l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
        const l2 = Math.max(0.15, Math.min(0.85, l));
        const [r2, g2, b2] = hslToRgb(GOLD_HUE, GOLD_SATURATION, l2);
        data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
    }
    ctx.putImageData(imageData, 0, 0);

    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getGoldTintedSprite = getGoldTintedSprite;

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

// Named bosses that reuse a base monster's sprite (e.g. Viper on
// elite_goblin's art) get tinted toward their own flavor color instead of
// looking identical to a plain instance of that monster.
function hexColorToHue(hex) {
    if (!hex) return 0;
    const m = hex.replace('#', '');
    const r = parseInt(m.substring(0, 2), 16);
    const g = parseInt(m.substring(2, 4), 16);
    const b = parseInt(m.substring(4, 6), 16);
    const [h] = rgbToHsl(r, g, b);
    return h;
}
window.hexColorToHue = hexColorToHue;

// Weighted natural palettes for a character's *default* (name-hash-derived)
// appearance — a full random hue wheel looks wrong on ordinary medieval
// villagers, so defaults are pulled from a small realistic set instead.
// A player's own slider choice bypasses these entirely and calls
// getRecoloredSprite/getRecoloredHairSprite with a raw hue.
//
// Hair needs a lightness/saturation change too, not just hue — the source
// asset's hair pixels are all roughly the same dark-brown lightness, so a
// hue-only rotation can't tell black from blonde.
const HAIR_PALETTE = [
    { hue: 25, weight: 35, lightMult: 0.95, satMult: 1.00 }, // brown — most common
    { hue: 45, weight: 25, lightMult: 1.70, satMult: 0.65 }, // blonde
    { hue: 30, weight: 22, lightMult: 0.30, satMult: 0.90 }, // black
    { hue: 12, weight: 15, lightMult: 1.05, satMult: 1.35 }  // red — rarest
];
const CLOTHING_PALETTE = [
    { hue: 25,  weight: 22 }, // brown
    { hue: 40,  weight: 16 }, // tan
    { hue: 95,  weight: 15 }, // moss/olive green
    { hue: 150, weight: 10 }, // forest green
    { hue: 210, weight: 15 }, // slate blue
    { hue: 350, weight: 10 }, // muted rust red
    { hue: 45,  weight: 12 }  // mustard/gold
];
const NATURAL_SKIN_PALETTE = [
    { hue:28, saturation:0.34, lightness:0.78, weight:18 },
    { hue:25, saturation:0.42, lightness:0.68, weight:24 },
    { hue:22, saturation:0.48, lightness:0.57, weight:24 },
    { hue:19, saturation:0.52, lightness:0.46, weight:20 },
    { hue:17, saturation:0.48, lightness:0.35, weight:14 },
];

// A continuous light-to-dark ramp for the player-facing natural-tone slider.
// Hue shifts subtly warmer through the range while saturation and lightness
// do the work that a raw rainbow hue slider cannot.
const PLAYER_NATURAL_SKIN_STOPS = [
    { hue:30, saturation:0.28, lightness:0.84 },
    { hue:27, saturation:0.36, lightness:0.75 },
    { hue:24, saturation:0.43, lightness:0.64 },
    { hue:21, saturation:0.49, lightness:0.53 },
    { hue:18, saturation:0.52, lightness:0.42 },
    { hue:16, saturation:0.47, lightness:0.31 },
];

function naturalSkinToneFromSlider(value) {
    const position = Math.max(0, Math.min(100, Number(value) || 0)) / 100 * (PLAYER_NATURAL_SKIN_STOPS.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(PLAYER_NATURAL_SKIN_STOPS.length - 1, lower + 1);
    const mix = position - lower;
    const a = PLAYER_NATURAL_SKIN_STOPS[lower], b = PLAYER_NATURAL_SKIN_STOPS[upper];
    const lerp = (x, y) => x + (y - x) * mix;
    return { hue:lerp(a.hue, b.hue), saturation:lerp(a.saturation, b.saturation), lightness:lerp(a.lightness, b.lightness) };
}
window.naturalSkinToneFromSlider = naturalSkinToneFromSlider;

function getPlayerSkinToneFromControls() {
    const fantasy = !!document.getElementById('fantasy-skin-check')?.checked;
    if (fantasy) return { hue:Number(document.getElementById('skin-hue-slider')?.value || 200) };
    return naturalSkinToneFromSlider(document.getElementById('skin-tone-slider')?.value || 45);
}
window.getPlayerSkinToneFromControls = getPlayerSkinToneFromControls;

// Picks a weighted entry from `palette`, deterministic per seed string
// (reuses hashStringToHue's hash but rescrambles it so palette picks don't
// correlate 1:1 with the raw hue hash used elsewhere).
function pickFromPalette(seedStr, palette) {
    const totalWeight = palette.reduce((sum, p) => sum + p.weight, 0);
    const scrambled = (hashStringToHue(seedStr) * 977 + 53) % totalWeight;
    let acc = 0;
    for (const entry of palette) {
        acc += entry.weight;
        if (scrambled < acc) return entry;
    }
    return palette[palette.length - 1];
}

function pickHairPreset(seedStr) { return pickFromPalette(seedStr, HAIR_PALETTE); }
window.pickHairPreset = pickHairPreset;

function pickClothingHue(seedStr) { return pickFromPalette(seedStr, CLOTHING_PALETTE).hue; }
window.pickClothingHue = pickClothingHue;
function pickNaturalSkinTone(seedStr) { return { ...pickFromPalette(seedStr, NATURAL_SKIN_PALETTE) }; }
window.pickNaturalSkinTone = pickNaturalSkinTone;