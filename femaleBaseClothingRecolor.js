// femaleBaseClothingRecolor.js
// The directional human-female body art uses pale, near-neutral base clothes.
// The legacy sprite recolourer was tuned to the old warm-brown male sprite and
// classified shirt/pants almost entirely by lightness. On the new female art
// that makes the white garments invisible to the lower-clothing mask while
// shadowed skin (knees/fingers/toes) can fall into the old shirt band.
//
// Keep the legacy recolourer for every other sprite. For the current
// human-female directional body only, classify from the untouched source art:
//   * skin = warm/chromatic pixels (including darker skin shadows)
//   * base clothes = pale/neutral pixels in tight central torso/pelvis zones
// Upper and lower clothes are deliberately spatially disjoint. This is much
// safer than asking one global lightness threshold to infer anatomy.
(() => {
  'use strict';

  const INSTALL_FLAG = '__femaleBaseClothingRecolorInstalled';
  const CLOTHING_SATURATION = 0.58;
  const CLOTHING_LIGHTNESS_CAP = 0.84;
  const ALPHA_MIN = 40;
  const clothingCache = new WeakMap();
  const skinCache = new WeakMap();

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [
      Math.round(hue2rgb(h + 1 / 3) * 255),
      Math.round(hue2rgb(h) * 255),
      Math.round(hue2rgb(h - 1 / 3) * 255),
    ];
  }

  function sourceReady(img) {
    return !!img && ((img.complete && img.naturalWidth) || (img.width && img.height));
  }
  function widthOf(img) { return img.naturalWidth || img.width; }
  function heightOf(img) { return img.naturalHeight || img.height; }
  function baseSourceOf(img) {
    return sourceReady(img?.__recolorBaseSource) ? img.__recolorBaseSource : img;
  }
  function isHumanFemaleDirectionalBody(img) {
    const base = baseSourceOf(img);
    const src = String(base?.src || '').toLowerCase().replaceAll('\\', '/');
    return src.includes('images/characters/human_female/body_');
  }

  function normalizeSkinSpec(tone) {
    if (tone === undefined || tone === null) return null;
    const spec = typeof tone === 'number' ? { hue: tone } : tone;
    if (!Number.isFinite(spec?.hue)) return null;
    return {
      hue: Number(spec.hue),
      saturation: Number.isFinite(spec.saturation) ? Number(spec.saturation) : null,
      lightness: Number.isFinite(spec.lightness) ? Number(spec.lightness) : null,
    };
  }

  function femaleSkinPixel(h, s, l) {
    // The pale garments are almost neutral, so on this art we can safely let
    // skin extend down into its shadows instead of imposing the old L>=0.55
    // rule that caused knees, fingers and toes to leak into clothing masks.
    return h >= 5 && h <= 55 && s >= 0.14 && l >= 0.16 && l <= 0.94;
  }

  function tintSkin(h, s, l, spec) {
    const s2 = spec.saturation === null
      ? s
      : Math.max(0, Math.min(1, spec.saturation * (0.65 + s * 0.5)));
    const l2 = spec.lightness === null
      ? l
      : Math.max(0.08, Math.min(0.95, spec.lightness + (l - 0.68)));
    return hslToRgb(spec.hue, s2, l2);
  }

  function opaqueBounds(data, width, height) {
    let left = width, right = -1, top = height, bottom = -1;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < ALPHA_MIN) continue;
      const px = i / 4;
      const x = px % width;
      const y = Math.floor(px / width);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    if (right < left || bottom < top) return null;
    return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
  }

  function clothingBand(x, y, h, s, l, bounds) {
    if (!bounds || femaleSkinPixel(h, s, l)) return null;
    const rx = (x - bounds.left) / Math.max(1, bounds.width - 1);
    const ry = (y - bounds.top) / Math.max(1, bounds.height - 1);

    // Base garments are intentionally white/grey in the authored sprite. The
    // x gate rejects hands/fingers; the y gates reject face, knees and toes.
    // A small gap between bands means exposed midriff can never be claimed by
    // both sliders.
    const neutralFabric = s <= 0.24 && l >= 0.30;
    if (!neutralFabric || rx < 0.23 || rx > 0.77) return null;
    if (ry >= 0.17 && ry <= 0.385) return 'upper';
    if (ry >= 0.405 && ry <= 0.585) return 'lower';
    return null;
  }

  function cacheGet(cache, img, key) {
    const entries = cache.get(img);
    return entries?.get(key) || null;
  }
  function cacheSet(cache, img, key, value) {
    let entries = cache.get(img);
    if (!entries) { entries = new Map(); cache.set(img, entries); }
    entries.set(key, value);
    return value;
  }

  function recolorFemaleSkin(img, tone) {
    if (!sourceReady(img) || !isHumanFemaleDirectionalBody(img)) return null;
    const spec = normalizeSkinSpec(tone);
    if (!spec) return img;
    const base = baseSourceOf(img);
    const key = `${spec.hue}:${spec.saturation ?? 'source'}:${spec.lightness ?? 'source'}`;
    const cached = cacheGet(skinCache, base, key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = widthOf(base); canvas.height = heightOf(base);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const p = imageData.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < ALPHA_MIN) continue;
      const [h, s, l] = rgbToHsl(p[i], p[i + 1], p[i + 2]);
      if (!femaleSkinPixel(h, s, l)) continue;
      const [r2, g2, b2] = tintSkin(h, s, l, spec);
      p[i] = r2; p[i + 1] = g2; p[i + 2] = b2;
    }
    ctx.putImageData(imageData, 0, 0);
    canvas.__recolorBaseSource = base;
    canvas.__skinToneSpec = spec;
    return cacheSet(skinCache, base, key, canvas);
  }

  function recolorFemaleClothing(img, hues, legacyGetRecoloredSprite) {
    if (!sourceReady(img) || !isHumanFemaleDirectionalBody(img)) return null;
    const { shirtHue, pantsHue, skinHue, satMult = 1 } = hues || {};
    const inheritedSkin = normalizeSkinSpec(img.__skinToneSpec);
    const explicitSkin = normalizeSkinSpec(skinHue);
    const skinSpec = explicitSkin || inheritedSkin;

    let working = img;
    if (explicitSkin) working = recolorFemaleSkin(baseSourceOf(img), explicitSkin) || img;
    if (shirtHue === undefined && pantsHue === undefined) return working;

    const base = baseSourceOf(img);
    const key = `${shirtHue ?? 'x'}:${pantsHue ?? 'x'}:${satMult}:${skinSpec?.hue ?? 'x'}:${skinSpec?.saturation ?? 'x'}:${skinSpec?.lightness ?? 'x'}`;
    const cached = cacheGet(clothingCache, working, key);
    if (cached) return cached;

    const width = widthOf(base), height = heightOf(base);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width; maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    maskCtx.drawImage(base, 0, 0);
    const sourceData = maskCtx.getImageData(0, 0, width, height);
    const bounds = opaqueBounds(sourceData.data, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(working, 0, 0);
    const outputData = ctx.getImageData(0, 0, width, height);
    const src = sourceData.data, out = outputData.data;

    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] < ALPHA_MIN) continue;
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const [h, s, l] = rgbToHsl(src[i], src[i + 1], src[i + 2]);
      const band = clothingBand(x, y, h, s, l, bounds);
      const targetHue = band === 'upper' ? shirtHue : band === 'lower' ? pantsHue : undefined;
      if (targetHue === undefined) continue;

      // White has zero saturation and L=1, so a plain hue rotation literally
      // cannot colour it. Give the fabric real chroma and cap highlight
      // lightness while retaining source lightness variation as shading.
      const targetSat = Math.max(0.12, Math.min(0.82, CLOTHING_SATURATION * satMult));
      const targetLight = Math.max(0.20, Math.min(CLOTHING_LIGHTNESS_CAP, l * 0.92));
      const [r2, g2, b2] = hslToRgb(targetHue, targetSat, targetLight);
      out[i] = r2; out[i + 1] = g2; out[i + 2] = b2;
    }

    ctx.putImageData(outputData, 0, 0);
    canvas.__recolorBaseSource = base;
    if (skinSpec) canvas.__skinToneSpec = skinSpec;
    return cacheSet(clothingCache, working, key, canvas);
  }

  function install() {
    if (window[INSTALL_FLAG]) return true;
    if (typeof window.getRecoloredSprite !== 'function' || typeof window.getRecoloredSkinSprite !== 'function') return false;

    const legacySprite = window.getRecoloredSprite;
    const legacySkin = window.getRecoloredSkinSprite;

    window.getRecoloredSkinSprite = function getRecoloredSkinSpriteWithFemaleMask(img, tone) {
      const female = recolorFemaleSkin(img, tone);
      return female || legacySkin.apply(this, arguments);
    };

    window.getRecoloredSprite = function getRecoloredSpriteWithFemaleMask(img, hues) {
      const female = recolorFemaleClothing(img, hues, legacySprite);
      return female || legacySprite.apply(this, arguments);
    };

    window[INSTALL_FLAG] = true;
    return true;
  }

  if (!install()) {
    const timer = setInterval(() => { if (install()) clearInterval(timer); }, 25);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();
