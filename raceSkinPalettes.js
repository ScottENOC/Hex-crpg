// raceSkinPalettes.js
// Player-facing natural skin palettes by race. Humans/elves/dwarves retain
// the existing real-world light-to-dark ramp; greenskin races use a curated
// grey/green/blue family instead of inheriting human skin tones.
(() => {
    'use strict';

    const PALETTES = {
        human: [
            { hue:30, saturation:0.28, lightness:0.84 },
            { hue:27, saturation:0.36, lightness:0.75 },
            { hue:24, saturation:0.43, lightness:0.64 },
            { hue:21, saturation:0.49, lightness:0.53 },
            { hue:18, saturation:0.52, lightness:0.42 },
            { hue:16, saturation:0.47, lightness:0.31 },
        ],
        elf: null,
        dwarf: null,
        orc: [
            { hue:135, saturation:0.08, lightness:0.58 }, // ash grey with a green cast
            { hue:112, saturation:0.20, lightness:0.52 }, // grey-green
            { hue:104, saturation:0.38, lightness:0.45 }, // olive green
            { hue:132, saturation:0.42, lightness:0.38 }, // deep green
            { hue:174, saturation:0.30, lightness:0.40 }, // blue-green
            { hue:207, saturation:0.25, lightness:0.43 }, // slate blue-grey
        ],
        goblin: [
            { hue:92,  saturation:0.26, lightness:0.58 }, // pale yellow-green
            { hue:105, saturation:0.42, lightness:0.50 }, // moss
            { hue:122, saturation:0.46, lightness:0.42 }, // green
            { hue:145, saturation:0.38, lightness:0.38 }, // swamp green
            { hue:176, saturation:0.34, lightness:0.40 }, // blue-green
            { hue:202, saturation:0.22, lightness:0.45 }, // cool grey-blue
        ],
    };
    PALETTES.elf = PALETTES.human;
    PALETTES.dwarf = PALETTES.human;
    window.PLAYER_SKIN_PALETTES = PALETTES;

    const PLAYABLE_GREEN_SKIN_DIRECTIONAL_PATHS = {
        orc_female: {
            front: 'images/characters/orc_female/body_front.png',
            side: 'images/characters/orc_female/body_side.png',
            back: 'images/characters/orc_female/body_back.png',
        },
        goblin_male: {
            front: 'images/characters/goblin_male/body_front.png',
            side: 'images/characters/goblin_male/body_side.png',
            back: 'images/characters/goblin_male/body_back.png',
        },
    };
    window.PLAYABLE_GREEN_SKIN_DIRECTIONAL_PATHS = PLAYABLE_GREEN_SKIN_DIRECTIONAL_PATHS;

    // facingSystem's authored human assets use source crop windows. These
    // greenskin PNGs are intentionally simple one-character transparent
    // cutouts, so pack each alpha-bounded figure into the same source crop
    // geometry at runtime. This lets the mature directional/equipment renderer
    // use them without special-casing its draw path.
    const DIRECTIONAL_SOURCE_CROPS = {
        front: { x:0.350, y:0.088, w:0.297, h:0.823 },
        side:  { x:0.431, y:0.092, w:0.148, h:0.822 },
        back:  { x:0.350, y:0.085, w:0.299, h:0.826 },
    };

    function makePackedDirectionalBody(src, view) {
        const output = document.createElement('canvas');
        output.width = 0;
        output.height = 0;
        // Canvas does not normally expose src, but the race-aware skin wrapper
        // deliberately reads it to identify the source race. Keeping the
        // authored path here preserves that contract after packing.
        output.src = src;
        output.__directionalSourceView = view;

        const img = new Image();
        img.onload = () => {
            const probe = document.createElement('canvas');
            probe.width = img.naturalWidth;
            probe.height = img.naturalHeight;
            const pctx = probe.getContext('2d', { willReadFrequently:true });
            pctx.drawImage(img, 0, 0);
            const pixels = pctx.getImageData(0, 0, probe.width, probe.height).data;
            let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1;
            for (let y=0; y<probe.height; y++) {
                for (let x=0; x<probe.width; x++) {
                    if (pixels[(y*probe.width+x)*4+3] < 8) continue;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }

            output.width = 256;
            output.height = 256;
            output.src = src;
            output.__directionalSourceView = view;
            const ctx = output.getContext('2d');
            const crop = DIRECTIONAL_SOURCE_CROPS[view];
            const tx = crop.x * output.width;
            const ty = crop.y * output.height;
            const tw = crop.w * output.width;
            const th = crop.h * output.height;

            if (maxX >= minX && maxY >= minY) {
                const sw = maxX - minX + 1;
                const sh = maxY - minY + 1;
                const scale = Math.min(tw / sw, th / sh);
                const dw = sw * scale;
                const dh = sh * scale;
                const dx = tx + (tw - dw) / 2;
                const dy = ty + (th - dh) / 2;
                ctx.drawImage(img, minX, minY, sw, sh, dx, dy, dw, dh);
            }
            output.__directionalReady = true;
            window.drawMap?.();
            window.refreshDirectionalTurnPortraits?.();
        };
        img.src = src;
        return output;
    }

    function registerPlayableGreenskinDirectionalArt() {
        const pathRegistry = window.DIRECTIONAL_CHARACTER_PATHS;
        const assetRegistry = window.DIRECTIONAL_CHARACTER_ASSETS;
        if (!pathRegistry || !assetRegistry) return false;

        for (const [key, views] of Object.entries(PLAYABLE_GREEN_SKIN_DIRECTIONAL_PATHS)) {
            pathRegistry[key] = {
                body: { average: { ...views } },
                // These first-pass PC bodies carry their authored hair in the
                // body art. Leave hair empty so the human overlay is not drawn
                // a second time. Dedicated detachable hair can replace this in
                // a later asset pass without changing the renderer contract.
                hair: {},
            };
            if (!assetRegistry[key]) {
                assetRegistry[key] = {
                    body: { average: {
                        front: makePackedDirectionalBody(views.front, 'front'),
                        side: makePackedDirectionalBody(views.side, 'side'),
                        back: makePackedDirectionalBody(views.back, 'back'),
                    } },
                    hair: {},
                };
            }
        }
        window.__playableGreenskinDirectionalArtRegistered = true;
        return true;
    }
    window.registerPlayableGreenskinDirectionalArt = registerPlayableGreenskinDirectionalArt;

    function interpolateStops(stops, value) {
        const position = Math.max(0, Math.min(100, Number(value) || 0)) / 100 * (stops.length - 1);
        const lower = Math.floor(position);
        const upper = Math.min(stops.length - 1, lower + 1);
        const mix = position - lower;
        const a = stops[lower], b = stops[upper];
        const lerp = (x, y) => x + (y - x) * mix;
        // Hue values here never cross 0/360, so ordinary linear interpolation
        // gives the intended visible route through each curated palette.
        return {
            hue: lerp(a.hue, b.hue),
            saturation: lerp(a.saturation, b.saturation),
            lightness: lerp(a.lightness, b.lightness),
        };
    }

    function raceSkinToneFromSlider(race, value) {
        const stops = PALETTES[race] || PALETTES.human;
        return interpolateStops(stops, value);
    }
    window.raceSkinToneFromSlider = raceSkinToneFromSlider;

    function selectedRace() {
        return document.getElementById('race-select')?.value || 'human';
    }

    function getPlayerSkinToneFromControls() {
        const fantasy = !!document.getElementById('fantasy-skin-check')?.checked;
        if (fantasy) return { hue:Number(document.getElementById('skin-hue-slider')?.value || 200) };
        return raceSkinToneFromSlider(selectedRace(), document.getElementById('skin-tone-slider')?.value || 45);
    }
    window.getPlayerSkinToneFromControls = getPlayerSkinToneFromControls;

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                default: h = (r - g) / d + 4; break;
            }
            h *= 60;
        }
        return [h,s,l];
    }

    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        let r, g, b;
        if (s === 0) r = g = b = l;
        else {
            const hue2rgb = (p,q,t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q-p)*6*t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q-p)*(2/3-t)*6;
                return p;
            };
            const q = l < 0.5 ? l*(1+s) : l+s-l*s;
            const p = 2*l-q;
            r = hue2rgb(p,q,h+1/3); g = hue2rgb(p,q,h); b = hue2rgb(p,q,h-1/3);
        }
        return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
    }

    const greenskinCache = new Map();
    function recolorGreenskinSprite(img, tone, race) {
        if (!img || !tone || !Number.isFinite(tone.hue)) return img;
        const ready = (img.complete && img.naturalWidth) || (img.width && img.height);
        if (!ready) return img;
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const sourceKey = img.src || `${w}x${h}`;
        const key = `${sourceKey}:${race}:${tone.hue}:${tone.saturation ?? 's'}:${tone.lightness ?? 'l'}`;
        if (greenskinCache.has(key)) return greenskinCache.get(key);

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently:true });
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0,0,w,h);
        const data = imageData.data;
        for (let i=0; i<data.length; i+=4) {
            if (data[i+3] < 50) continue;
            const [h0,s0,l0] = rgbToHsl(data[i],data[i+1],data[i+2]);
            // Orc/goblin body art uses green/cyan skin and mostly brown/neutral
            // clothing. Restrict this pass to green/cyan source pixels so
            // equipment/clothing continues through its own renderer.
            const sourceSkin = h0 >= 55 && h0 <= 190 && s0 >= 0.12 && l0 >= 0.12 && l0 <= 0.88;
            if (!sourceSkin) continue;
            const sat = Number.isFinite(tone.saturation) ? Math.max(0, Math.min(1, tone.saturation * (0.70 + s0*0.45))) : s0;
            const light = Number.isFinite(tone.lightness) ? Math.max(0.08, Math.min(0.92, tone.lightness + (l0 - 0.48))) : l0;
            const [r,g,b] = hslToRgb(tone.hue, sat, light);
            data[i]=r; data[i+1]=g; data[i+2]=b;
        }
        ctx.putImageData(imageData,0,0);
        greenskinCache.set(key,canvas);
        return canvas;
    }
    window.recolorGreenskinSprite = recolorGreenskinSprite;

    function installSkinRecolorWrapper() {
        const original = window.getRecoloredSkinSprite;
        if (!original || original.__raceAwareSkinWrapper) return !!original;
        const wrapped = function(img, tone) {
            const src = String(img?.src || '').toLowerCase();
            if (src.includes('/orc.png') || src.endsWith('orc.png') || src.includes('/characters/orc_')) {
                return recolorGreenskinSprite(img,tone,'orc');
            }
            if (src.includes('/goblin.png') || src.endsWith('goblin.png') || src.includes('/characters/goblin_')) {
                return recolorGreenskinSprite(img,tone,'goblin');
            }
            return original(img,tone);
        };
        wrapped.__raceAwareSkinWrapper = true;
        wrapped.__original = original;
        window.getRecoloredSkinSprite = wrapped;
        return true;
    }

    function updateSkinUiForRace() {
        const race = selectedRace();
        const label = document.querySelector('label[for="skin-tone-slider"]');
        const helper = document.getElementById('skin-tone-slider')?.closest('.form-group')?.querySelector('small');
        if (label) {
            label.textContent = race === 'orc' ? 'Skin Tone — grey / green / blue'
                : race === 'goblin' ? 'Skin Tone — yellow-green / green / blue-grey'
                : 'Skin Tone';
        }
        if (helper) {
            helper.textContent = race === 'orc'
                ? 'Natural orc tones run through ash grey, green and blue-grey. Fantasy colour still allows any hue.'
                : race === 'goblin'
                    ? 'Natural goblin tones run through moss, green and cool blue-grey. Fantasy colour still allows any hue.'
                    : 'Natural tones run light to dark. Enable Fantasy colour for any hue; NPC skin remains natural.';
        }
    }
    window.updateSkinUiForRace = updateSkinUiForRace;

    function installCreatorPreviewWrapper() {
        const original = window.updateAppearancePreview;
        if (!original || original.__greenskinPreviewWrapper) return !!original;
        const imageCache = {};
        const load = src => {
            if (!imageCache[src]) {
                const img = new Image();
                img.onload = () => window.updateAppearancePreview?.();
                img.src = src;
                imageCache[src] = img;
            }
            return imageCache[src];
        };
        const wrapped = function() {
            const race = selectedRace();
            if (race !== 'orc' && race !== 'goblin') return original();
            const canvas = document.getElementById('appearance-preview-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height);
            const gender = document.getElementById('gender-select')?.value || 'female';
            const directionalKey = `${race}_${gender}`;
            const authoredFront = PLAYABLE_GREEN_SKIN_DIRECTIONAL_PATHS[directionalKey]?.front;
            const img = load(authoredFront || (race === 'orc' ? 'images/orc.png' : 'images/goblin.png'));
            if (!img.complete || !img.naturalWidth) return;
            const tone = getPlayerSkinToneFromControls();
            const body = recolorGreenskinSprite(img,tone,race);
            const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
            const w = img.naturalWidth*scale, h = img.naturalHeight*scale;
            ctx.drawImage(body,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
        };
        wrapped.__greenskinPreviewWrapper = true;
        window.updateAppearancePreview = wrapped;
        return true;
    }

    function install() {
        registerPlayableGreenskinDirectionalArt();
        installSkinRecolorWrapper();
        installCreatorPreviewWrapper();
        const raceSelect = document.getElementById('race-select');
        if (raceSelect && !raceSelect.dataset.skinPaletteBound) {
            raceSelect.dataset.skinPaletteBound = '1';
            raceSelect.addEventListener('change', () => {
                updateSkinUiForRace();
                window.updateAppearancePreview?.();
            });
        }
        updateSkinUiForRace();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
    // spriteRecolor.js/main.js/facingSystem.js are static or dynamically-loaded
    // scripts that may execute after this module. Retry briefly so the palette,
    // recolour and directional registrations converge regardless of load order.
    let tries = 0;
    const timer = setInterval(() => {
        install();
        tries++;
        const ready = window.getRecoloredSkinSprite?.__raceAwareSkinWrapper
            && window.updateAppearancePreview?.__greenskinPreviewWrapper
            && window.__playableGreenskinDirectionalArtRegistered;
        if (ready || tries > 100) clearInterval(timer);
    }, 50);
})();