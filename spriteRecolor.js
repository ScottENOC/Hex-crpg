// spriteRecolor.js
// Cheap visual variety without new art: recolors body/clothing sprites and
// provides the shared hair-style/colour model used by both legacy and
// directional character rendering.

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
window.hslToRgb = hslToRgb;
window.rgbToHsl = rgbToHsl;

const HEAD_CUTOFF_FRAC = 0.32;
const SHIRT_BAND = [0.36, 0.50];
const PANTS_BAND = [0.12, 0.36];
const SKIN_BAND_MIN = 0.55;

function getRecoloredSprite(img, hues) {
    if (!img || !img.complete || !img.naturalWidth) return img;
    const { shirtHue, pantsHue, skinHue, satMult = 1 } = hues || {};
    if (shirtHue === undefined && pantsHue === undefined && skinHue === undefined) return img;

    const cacheKey = `${img.src}::s${shirtHue ?? 'x'}:p${pantsHue ?? 'x'}:k${skinHue ?? 'x'}:m${satMult}`;
    if (_recolorCache[cacheKey]) return _recolorCache[cacheKey];

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    if (shirtHue !== undefined || pantsHue !== undefined) {
        const headCutoffY = Math.floor(canvas.height * HEAD_CUTOFF_FRAC);
        const bodyHeight = canvas.height - headCutoffY;
        if (bodyHeight > 0) {
            const imageData = ctx.getImageData(0, headCutoffY, canvas.width, bodyHeight);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 50) continue;
                const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                const s2 = Math.max(0, Math.min(1, s * satMult));
                if (shirtHue !== undefined && l >= SHIRT_BAND[0] && l <= SHIRT_BAND[1]) {
                    const [r2, g2, b2] = hslToRgb(shirtHue, s2, l);
                    data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
                } else if (pantsHue !== undefined && l >= PANTS_BAND[0] && l < PANTS_BAND[1]) {
                    const [r2, g2, b2] = hslToRgb(pantsHue, s2, l);
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

function getRecoloredHairSprite(img, targetHue, lightMult = 1, satMult = 1) {
    if (!img || !img.complete || !img.naturalWidth || targetHue === undefined) return img;

    // The old creator only passed hue. While it is visible, transparently add
    // the new saturation/brightness dimensions so every old body preview gets
    // the full colour picker without rewriting main.js's preview renderer.
    const creator = document.getElementById('characterCreator');
    const hueSlider = document.getElementById('hair-hue-slider');
    if (lightMult === 1 && satMult === 1 && creator && creator.style.display !== 'none' && hueSlider
        && Number(hueSlider.value) === Number(targetHue) && document.getElementById('hair-saturation-slider')) {
        const params = hairColorToRenderParams(creatorHairColor());
        lightMult = params.lightMult;
        satMult = params.satMult;
    }

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
        const [r2, g2, b2] = hslToRgb(GOLD_HUE, GOLD_SATURATION, Math.max(0.15, Math.min(0.85, l)));
        data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
    }
    ctx.putImageData(imageData, 0, 0);
    _recolorCache[cacheKey] = canvas;
    return canvas;
}
window.getGoldTintedSprite = getGoldTintedSprite;

function hashStringToHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
}
window.hashStringToHue = hashStringToHue;

function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}
function unitFromSeed(seed, salt) {
    let x = hash32(`${seed}|${salt}`) || 0x6d2b79f5;
    x += 0x6d2b79f5;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
function rangeFromSeed(seed, salt, min, max) { return min + (max - min) * unitFromSeed(seed, salt); }
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function normalizeHue(v) { return ((Number(v) || 0) % 360 + 360) % 360; }

function hexColorToHue(hex) {
    if (!hex) return 0;
    const m = hex.replace('#', '');
    return rgbToHsl(parseInt(m.substring(0, 2), 16), parseInt(m.substring(2, 4), 16), parseInt(m.substring(4, 6), 16))[0];
}
window.hexColorToHue = hexColorToHue;

// Style identity is now independent appearance data. Existing body-specific
// asset names are only compatibility details; phase B can add more style IDs
// without changing race/gender or colour state.
const HAIR_STYLES = {
    classic_1: { id:'classic_1', label:'Classic', directionalAssetKey:'brown_1' },
};
const DEFAULT_HAIR_STYLE = 'classic_1';
window.HAIR_STYLES = HAIR_STYLES;
window.DEFAULT_HAIR_STYLE = DEFAULT_HAIR_STYLE;

const SOURCE_HAIR_SATURATION = 0.62;
const SOURCE_HAIR_LIGHTNESS = 0.28;
function normalizeHairColor(color, fallback = { hue:25, saturation:0.62, lightness:0.28 }) {
    if (typeof color === 'number') return { hue:normalizeHue(color), saturation:fallback.saturation, lightness:fallback.lightness };
    const src = color || fallback;
    return {
        hue: normalizeHue(src.hue ?? src.h ?? fallback.hue),
        saturation: clamp01(src.saturation ?? src.s ?? fallback.saturation),
        lightness: clamp01(src.lightness ?? src.l ?? fallback.lightness),
        family: src.family || undefined,
    };
}
window.normalizeHairColor = normalizeHairColor;

function hairColorToRenderParams(color) {
    const c = normalizeHairColor(color);
    return {
        hue: c.hue,
        satMult: Math.max(0, Math.min(2.5, c.saturation / SOURCE_HAIR_SATURATION)),
        lightMult: Math.max(0.12, Math.min(3.2, c.lightness / SOURCE_HAIR_LIGHTNESS)),
    };
}
window.hairColorToRenderParams = hairColorToRenderParams;

const NATURAL_HAIR_FAMILIES = [
    { id:'brown', weight:46, hue:[18,35], saturation:[0.34,0.78], lightness:[0.10,0.38] },
    { id:'blond', weight:25, hue:[38,58], saturation:[0.22,0.68], lightness:[0.43,0.76] },
    { id:'red',   weight:12, hue:[5,18],  saturation:[0.48,0.90], lightness:[0.22,0.52] },
    { id:'grey',  weight:17, hue:[20,55], saturation:[0.00,0.13], lightness:[0.26,0.82] },
];
window.NATURAL_HAIR_FAMILIES = NATURAL_HAIR_FAMILIES;

function generateNaturalHairColor(seedStr) {
    const seed = String(seedStr || 'x');
    const total = NATURAL_HAIR_FAMILIES.reduce((sum, f) => sum + f.weight, 0);
    let pick = unitFromSeed(seed, 'family') * total;
    let family = NATURAL_HAIR_FAMILIES[NATURAL_HAIR_FAMILIES.length - 1];
    for (const candidate of NATURAL_HAIR_FAMILIES) {
        if (pick < candidate.weight) { family = candidate; break; }
        pick -= candidate.weight;
    }
    return {
        family: family.id,
        hue: rangeFromSeed(seed, 'hue', family.hue[0], family.hue[1]),
        saturation: rangeFromSeed(seed, 'sat', family.saturation[0], family.saturation[1]),
        lightness: rangeFromSeed(seed, 'light', family.lightness[0], family.lightness[1]),
    };
}
window.generateNaturalHairColor = generateNaturalHairColor;

function legacyHairColor(entity) {
    if (!entity || entity.hairHue === undefined) return null;
    return {
        hue: entity.hairHue,
        saturation: clamp01(SOURCE_HAIR_SATURATION * (entity.hairSatMult ?? 1)),
        lightness: clamp01(SOURCE_HAIR_LIGHTNESS * (entity.hairLightMult ?? 1)),
    };
}

function ensureCharacterAppearance(entity, options = {}) {
    if (!entity) return null;
    entity.appearance = entity.appearance || {};
    const appearance = entity.appearance;
    if (!appearance.hairStyle) appearance.hairStyle = entity.hairStyle && entity.hairStyle !== 'brown_1' ? entity.hairStyle : DEFAULT_HAIR_STYLE;
    if (!HAIR_STYLES[appearance.hairStyle]) appearance.hairStyle = DEFAULT_HAIR_STYLE;
    if (!appearance.hairColor) {
        const legacy = legacyHairColor(entity);
        appearance.hairColor = normalizeHairColor(legacy || options.hairColor || generateNaturalHairColor(`${entity.name || 'x'}|${entity.race || ''}|${entity.gender || ''}`));
    } else appearance.hairColor = normalizeHairColor(appearance.hairColor);

    const params = hairColorToRenderParams(appearance.hairColor);
    entity.hairHue = params.hue;
    entity.hairLightMult = params.lightMult;
    entity.hairSatMult = params.satMult;
    entity.hairStyle = HAIR_STYLES[appearance.hairStyle].directionalAssetKey;
    return appearance;
}
window.ensureCharacterAppearance = ensureCharacterAppearance;
function setCharacterHairColor(entity, color) {
    if (!entity) return null;
    entity.appearance = entity.appearance || {};
    entity.appearance.hairColor = normalizeHairColor(color);
    return ensureCharacterAppearance(entity);
}
window.setCharacterHairColor = setCharacterHairColor;
function setCharacterHairStyle(entity, styleId) {
    if (!entity) return null;
    entity.appearance = entity.appearance || {};
    entity.appearance.hairStyle = HAIR_STYLES[styleId] ? styleId : DEFAULT_HAIR_STYLE;
    return ensureCharacterAppearance(entity);
}
window.setCharacterHairStyle = setCharacterHairStyle;
function getCharacterHairColor(entity) { return ensureCharacterAppearance(entity)?.hairColor || normalizeHairColor(null); }
window.getCharacterHairColor = getCharacterHairColor;

// Existing gameEngine.js callers keep working, but now receive deterministic
// continuous colour within a natural family rather than one of four presets.
function pickHairPreset(seedStr) {
    const color = generateNaturalHairColor(seedStr);
    const params = hairColorToRenderParams(color);
    return { hue:params.hue, lightMult:params.lightMult, satMult:params.satMult, color, family:color.family };
}
window.pickHairPreset = pickHairPreset;

const CLOTHING_PALETTE = [
    { hue:25, weight:22 }, { hue:40, weight:16 }, { hue:95, weight:15 },
    { hue:150, weight:10 }, { hue:210, weight:15 }, { hue:350, weight:10 }, { hue:45, weight:12 }
];
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
function pickClothingHue(seedStr) { return pickFromPalette(seedStr, CLOTHING_PALETTE).hue; }
window.pickClothingHue = pickClothingHue;

function creatorHairColor() {
    return normalizeHairColor({
        hue: Number(document.getElementById('hair-hue-slider')?.value ?? 25),
        saturation: Number(document.getElementById('hair-saturation-slider')?.value ?? 62) / 100,
        lightness: Number(document.getElementById('hair-lightness-slider')?.value ?? 28) / 100,
    });
}
window.getCreatorHairColor = creatorHairColor;
function updateCreatorHairSwatch() {
    const swatch = document.getElementById('hair-color-swatch');
    if (!swatch) return;
    const c = creatorHairColor();
    swatch.style.background = `hsl(${c.hue} ${Math.round(c.saturation * 100)}% ${Math.round(c.lightness * 100)}%)`;
}

function injectHairControls() {
    const hueSlider = document.getElementById('hair-hue-slider');
    if (!hueSlider || document.getElementById('hair-saturation-slider')) return false;
    const hueLabel = document.querySelector('label[for="hair-hue-slider"]');
    if (hueLabel) hueLabel.textContent = 'Hair Hue';
    const makeLabel = (forId, text) => {
        const label = document.createElement('label'); label.htmlFor = forId; label.textContent = text;
        label.style.fontWeight = 'normal'; label.style.fontSize = '0.85em'; return label;
    };
    const makeSlider = (id, value) => {
        const input = document.createElement('input');
        input.type = 'range'; input.id = id; input.min = '0'; input.max = '100'; input.value = String(value); input.step = '1';
        input.addEventListener('input', () => {
            updateCreatorHairSwatch();
            if (window.updateAppearancePreview) window.updateAppearancePreview();
            if (window.syncCharacterToServer) window.syncCharacterToServer();
        });
        return input;
    };
    const satLabel = makeLabel('hair-saturation-slider', 'Hair Saturation');
    const sat = makeSlider('hair-saturation-slider', 62);
    const lightLabel = makeLabel('hair-lightness-slider', 'Hair Brightness');
    const light = makeSlider('hair-lightness-slider', 28);
    const swatch = document.createElement('div');
    swatch.id = 'hair-color-swatch'; swatch.title = 'Current hair colour';
    swatch.style.cssText = 'height:18px;border:1px solid #777;border-radius:4px;margin-top:-2px;';
    hueSlider.insertAdjacentElement('afterend', swatch);
    swatch.insertAdjacentElement('beforebegin', light);
    light.insertAdjacentElement('beforebegin', lightLabel);
    lightLabel.insertAdjacentElement('beforebegin', sat);
    sat.insertAdjacentElement('beforebegin', satLabel);
    hueSlider.addEventListener('input', updateCreatorHairSwatch);
    updateCreatorHairSwatch();
    return true;
}

function installPlayerAppearanceCapture() {
    const current = window.initializePlayer;
    if (typeof current !== 'function' || current.__sharedHairAppearance) return false;
    const wrapped = function() {
        const result = current.apply(this, arguments);
        const player = window.party?.[0];
        if (player) {
            player.appearance = player.appearance || {};
            player.appearance.hairStyle = player.appearance.hairStyle || DEFAULT_HAIR_STYLE;
            setCharacterHairColor(player, creatorHairColor());
        }
        return result;
    };
    wrapped.__sharedHairAppearance = true;
    wrapped.__legacyInitializePlayer = current;
    window.initializePlayer = wrapped;
    return true;
}

function turnIndicatorEntityForCanvas(canvas) {
    const item = canvas?.closest?.('.turn-indicator-item');
    const bar = item?.parentElement;
    if (!item || !bar) return null;
    const index = [...bar.querySelectorAll('.turn-indicator-item')].indexOf(item);
    const entities = [...(window.entities || [])].filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
    if (window.isInCombat) entities.sort((a, b) => b.timePoints - a.timePoints);
    return entities[index] || null;
}
function entityForDirectionalHairCanvas(canvas) {
    if (window.__activeCharacterEntity) return window.__activeCharacterEntity;
    if (canvas?.id === 'appearance-preview-canvas') return { name:'Creator', race:'human', gender:'female', side:'player', appearance:{ hairStyle:DEFAULT_HAIR_STYLE, hairColor:creatorHairColor() } };
    return turnIndicatorEntityForCanvas(canvas) || window.player || null;
}

// Install before graphicsSettings/characterRig capture drawImage. Directional
// female art currently draws the raw hair PNG directly; intercept only those
// PNGs and substitute the same cached tint used by the legacy renderer.
(function installDirectionalHairTintBridge() {
    if (typeof CanvasRenderingContext2D === 'undefined') return;
    const proto = CanvasRenderingContext2D.prototype;
    if (proto.drawImage.__sharedHairAppearance) return;
    const nativeDraw = proto.drawImage;
    const wrapped = function(img, ...args) {
        const src = (img && typeof img.src === 'string') ? img.src : '';
        if (/\/images\/characters\/human_female\/hair_[^/]+_(?:front|side|back)\.png(?:\?|$)/.test(src)) {
            const entity = entityForDirectionalHairCanvas(this.canvas);
            if (entity) {
                const appearance = ensureCharacterAppearance(entity, { hairColor:creatorHairColor() });
                const params = hairColorToRenderParams(appearance.hairColor);
                img = getRecoloredHairSprite(img, params.hue, params.lightMult, params.satMult);
            }
        }
        return nativeDraw.call(this, img, ...args);
    };
    wrapped.__sharedHairAppearance = true;
    wrapped.__nativeDrawImage = nativeDraw;
    proto.drawImage = wrapped;
})();

function installAppearanceUi() {
    injectHairControls();
    installPlayerAppearanceCapture();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAppearanceUi, { once:true });
else installAppearanceUi();
const appearanceInstallTimer = setInterval(installAppearanceUi, 100);
setTimeout(() => clearInterval(appearanceInstallTimer), 10000);
