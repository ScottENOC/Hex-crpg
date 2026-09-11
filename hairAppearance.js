// hairAppearance.js
// Shared hair appearance state, independent of race/gender. The low-level
// pixel recolouring remains in spriteRecolor.js; this module owns style IDs,
// continuous colour choices, NPC natural-colour generation, creator controls,
// and the bridge into the directional human-female artwork.
(() => {
    'use strict';

    const SOURCE_HAIR_SATURATION = 0.62;
    const SOURCE_HAIR_LIGHTNESS = 0.28;
    const DEFAULT_HAIR_STYLE = 'classic_1';

    // Style first, body asset second. The current art library only has one
    // logical style; Phase B can add styles without changing race/gender or
    // the colour data model.
    const HAIR_STYLES = {
        classic_1: {
            id: 'classic_1',
            label: 'Classic',
            directionalAssetKey: 'brown_1', // old filename; colour is no longer encoded in state
        },
    };

    // Weighted families with continuous ranges rather than fixed swatches.
    // Dark brown reaches nearly black; grey extends through silver/white.
    const NATURAL_HAIR_FAMILIES = [
        { id:'brown', weight:46, hue:[18,35], saturation:[0.34,0.78], lightness:[0.10,0.38] },
        { id:'blond', weight:25, hue:[38,58], saturation:[0.22,0.68], lightness:[0.43,0.76] },
        { id:'red',   weight:12, hue:[5,18],  saturation:[0.48,0.90], lightness:[0.22,0.52] },
        { id:'grey',  weight:17, hue:[20,55], saturation:[0.00,0.13], lightness:[0.26,0.82] },
    ];

    function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
    function normalizeHue(v) { return ((Number(v) || 0) % 360 + 360) % 360; }

    function normalizeHairColor(color, fallback = { hue:25, saturation:0.62, lightness:0.28 }) {
        if (typeof color === 'number') {
            return { hue:normalizeHue(color), saturation:fallback.saturation, lightness:fallback.lightness };
        }
        const src = color || fallback;
        return {
            hue: normalizeHue(src.hue ?? src.h ?? fallback.hue),
            saturation: clamp01(src.saturation ?? src.s ?? fallback.saturation),
            lightness: clamp01(src.lightness ?? src.l ?? fallback.lightness),
            family: src.family || undefined,
        };
    }

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
    function rangeFromSeed(seed, salt, min, max) {
        return min + (max - min) * unitFromSeed(seed, salt);
    }

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

    function hairColorToRenderParams(color) {
        const c = normalizeHairColor(color);
        return {
            hue: c.hue,
            satMult: Math.max(0, Math.min(2.5, c.saturation / SOURCE_HAIR_SATURATION)),
            lightMult: Math.max(0.12, Math.min(3.2, c.lightness / SOURCE_HAIR_LIGHTNESS)),
        };
    }

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

        if (!appearance.hairStyle) {
            // Old directional saves may contain the asset key brown_1. Treat it
            // as the logical classic style rather than preserving a colour name.
            appearance.hairStyle = entity.hairStyle && entity.hairStyle !== 'brown_1'
                ? entity.hairStyle : DEFAULT_HAIR_STYLE;
        }
        if (!HAIR_STYLES[appearance.hairStyle]) appearance.hairStyle = DEFAULT_HAIR_STYLE;

        if (!appearance.hairColor) {
            const legacy = legacyHairColor(entity);
            appearance.hairColor = normalizeHairColor(
                legacy || options.hairColor || generateNaturalHairColor(`${entity.name || 'x'}|${entity.race || ''}|${entity.gender || ''}`)
            );
        } else {
            appearance.hairColor = normalizeHairColor(appearance.hairColor);
        }

        // Compatibility fields let the untouched legacy renderer consume the
        // new appearance model while new code reads appearance.* directly.
        const params = hairColorToRenderParams(appearance.hairColor);
        entity.hairHue = params.hue;
        entity.hairLightMult = params.lightMult;
        entity.hairSatMult = params.satMult;
        entity.hairStyle = HAIR_STYLES[appearance.hairStyle].directionalAssetKey;
        return appearance;
    }

    function setCharacterHairColor(entity, color) {
        if (!entity) return null;
        entity.appearance = entity.appearance || {};
        entity.appearance.hairColor = normalizeHairColor(color);
        return ensureCharacterAppearance(entity);
    }

    function setCharacterHairStyle(entity, styleId) {
        if (!entity) return null;
        entity.appearance = entity.appearance || {};
        entity.appearance.hairStyle = HAIR_STYLES[styleId] ? styleId : DEFAULT_HAIR_STYLE;
        return ensureCharacterAppearance(entity);
    }

    function creatorHairColor() {
        return normalizeHairColor({
            hue: Number(document.getElementById('hair-hue-slider')?.value ?? 25),
            saturation: Number(document.getElementById('hair-saturation-slider')?.value ?? 62) / 100,
            lightness: Number(document.getElementById('hair-lightness-slider')?.value ?? 28) / 100,
        });
    }

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
            const label = document.createElement('label');
            label.htmlFor = forId;
            label.textContent = text;
            label.style.fontWeight = 'normal';
            label.style.fontSize = '0.85em';
            return label;
        };
        const makeSlider = (id, value) => {
            const input = document.createElement('input');
            input.type = 'range';
            input.id = id;
            input.min = '0';
            input.max = '100';
            input.step = '1';
            input.value = String(value);
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
        swatch.id = 'hair-color-swatch';
        swatch.title = 'Current hair colour';
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

    function installLegacyHairBridge() {
        const tint = window.getRecoloredHairSprite;
        if (typeof tint !== 'function' || tint.__sharedHairAppearance) return false;
        const wrappedTint = function(img, targetHue, lightMult, satMult) {
            // Old creator preview supplies hue only. Add saturation/lightness
            // there; gameplay callers already supply explicit multipliers.
            if (arguments.length <= 2 && document.getElementById('characterCreator')?.style.display !== 'none'
                && document.getElementById('hair-saturation-slider')) {
                const params = hairColorToRenderParams(creatorHairColor());
                return tint(img, targetHue, params.lightMult, params.satMult);
            }
            return tint(img, targetHue, lightMult ?? 1, satMult ?? 1);
        };
        wrappedTint.__sharedHairAppearance = true;
        wrappedTint.__legacyTint = tint;
        window.getRecoloredHairSprite = wrappedTint;

        // Replace the old four-swatch NPC API with continuous natural values.
        window.pickHairPreset = function(seedStr) {
            const color = generateNaturalHairColor(seedStr);
            const params = hairColorToRenderParams(color);
            return { hue:params.hue, lightMult:params.lightMult, satMult:params.satMult, color, family:color.family };
        };
        window.pickHairPreset.__sharedHairAppearance = true;
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

    function installCharacterDataAppearance() {
        const current = window.createCharacterData;
        if (typeof current !== 'function' || current.__sharedHairAppearance) return false;
        const wrapped = function() {
            const entity = current.apply(this, arguments);
            ensureCharacterAppearance(entity);
            return entity;
        };
        wrapped.__sharedHairAppearance = true;
        wrapped.__legacyCreateCharacterData = current;
        window.createCharacterData = wrapped;
        return true;
    }

    function installNpcAppearance() {
        const current = window.buildNPC;
        if (typeof current !== 'function' || current.__sharedHairAppearance) return false;
        const wrapped = function() {
            const entity = current.apply(this, arguments);
            ensureCharacterAppearance(entity);
            return entity;
        };
        wrapped.__sharedHairAppearance = true;
        wrapped.__legacyBuildNPC = current;
        window.buildNPC = wrapped;
        return true;
    }

    function turnIndicatorEntityForCanvas(canvas) {
        const item = canvas?.closest?.('.turn-indicator-item');
        const bar = item?.parentElement;
        if (!item || !bar) return null;
        const index = [...bar.querySelectorAll('.turn-indicator-item')].indexOf(item);
        const entities = [...(window.entities || [])]
            .filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
        if (window.isInCombat) entities.sort((a, b) => b.timePoints - a.timePoints);
        return entities[index] || null;
    }

    function entityForDirectionalHairCanvas(canvas) {
        if (window.__activeCharacterEntity) return window.__activeCharacterEntity;
        if (canvas?.id === 'appearance-preview-canvas') {
            return {
                name:'Creator', race:'human', gender:'female', side:'player',
                appearance:{ hairStyle:DEFAULT_HAIR_STYLE, hairColor:creatorHairColor() },
            };
        }
        return turnIndicatorEntityForCanvas(canvas) || window.player || null;
    }

    // This module is inserted before facingSystem/characterRig. Capturing the
    // canvas primitive here lets directional female hair use the same tinting
    // without modifying the renderer's body/equipment interception stack.
    function installDirectionalHairTintBridge() {
        if (typeof CanvasRenderingContext2D === 'undefined') return false;
        const proto = CanvasRenderingContext2D.prototype;
        if (proto.drawImage.__sharedHairAppearance) return true;
        const nativeDraw = proto.drawImage;
        const wrapped = function(img, ...args) {
            const src = (img && typeof img.src === 'string') ? img.src : '';
            if (/\/images\/characters\/human_female\/hair_[^/]+_(?:front|side|back)\.png(?:\?|$)/.test(src)
                && typeof window.getRecoloredHairSprite === 'function') {
                const entity = entityForDirectionalHairCanvas(this.canvas);
                if (entity) {
                    const appearance = ensureCharacterAppearance(entity, { hairColor:creatorHairColor() });
                    const params = hairColorToRenderParams(appearance.hairColor);
                    img = window.getRecoloredHairSprite(img, params.hue, params.lightMult, params.satMult);
                }
            }
            return nativeDraw.call(this, img, ...args);
        };
        wrapped.__sharedHairAppearance = true;
        wrapped.__nativeDrawImage = nativeDraw;
        proto.drawImage = wrapped;
        return true;
    }

    function installAll() {
        installDirectionalHairTintBridge();
        injectHairControls();
        installLegacyHairBridge();
        installCharacterDataAppearance();
        installPlayerAppearanceCapture();
        installNpcAppearance();
    }

    window.HAIR_STYLES = HAIR_STYLES;
    window.DEFAULT_HAIR_STYLE = DEFAULT_HAIR_STYLE;
    window.NATURAL_HAIR_FAMILIES = NATURAL_HAIR_FAMILIES;
    window.normalizeHairColor = normalizeHairColor;
    window.generateNaturalHairColor = generateNaturalHairColor;
    window.hairColorToRenderParams = hairColorToRenderParams;
    window.ensureCharacterAppearance = ensureCharacterAppearance;
    window.getCharacterHairColor = (entity) => ensureCharacterAppearance(entity)?.hairColor || normalizeHairColor(null);
    window.setCharacterHairColor = setCharacterHairColor;
    window.setCharacterHairStyle = setCharacterHairStyle;
    window.getCreatorHairColor = creatorHairColor;
    window.__sharedHairAppearanceLoaded = true;

    installAll();
    const timer = setInterval(installAll, 100);
    window.addEventListener('load', () => {
        installAll();
        setTimeout(() => clearInterval(timer), 10000);
    }, { once:true });
})();
