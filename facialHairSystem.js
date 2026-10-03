// facialHairSystem.js
// Shared cosmetic facial-hair layer. Front + side art is authored once and the
// side view is mirrored by the humanoid renderer when the character faces left.
(() => {
    'use strict';

    const BUILD = '20261001-facial-hair-v2';
    const NPC_FACIAL_HAIR_CHANCE = 0.30;
    const FACIAL_HAIR_STYLES = Object.freeze({
        moustache: Object.freeze({
            label: 'Moustache',
            front: 'images/characters/facial_hair/moustache_front.svg',
            side: 'images/characters/facial_hair/moustache_side.svg',
        }),
        beard_full: Object.freeze({
            label: 'Full beard',
            front: 'images/characters/facial_hair/beard_full_front.png',
            side: 'images/characters/facial_hair/beard_full_side.png',
            // Beards cover substantially more of the face than a moustache, so
            // they need their own placement box instead of being squeezed into
            // the moustache target. Values are normalised to humanoid body bounds.
            targets: Object.freeze({
                front: Object.freeze({ x: 0.310, y: 0.108, w: 0.380, h: 0.255 }),
                side: Object.freeze({ x: 0.350, y: 0.103, w: 0.330, h: 0.270 }),
            }),
        }),
    });
    const AVAILABLE_STYLE_IDS = Object.freeze(Object.keys(FACIAL_HAIR_STYLES));
    const imageCache = new Map();

    function isChild(entity) {
        if (!entity) return false;
        if (window.ChildSystem?.isChild) return !!window.ChildSystem.isChild(entity);
        return entity.isChild === true || entity.ageBand === 'child' || entity.appearance?.ageBand === 'child';
    }

    function isAdultMaleNpc(entity) {
        if (!entity || entity.gender !== 'male' || isChild(entity)) return false;
        return entity.isNPC === true || entity.isGeneratedCivilian === true;
    }

    function unitFromText(text) {
        let hash = 2166136261;
        const input = String(text ?? '');
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    function entitySeed(entity) {
        return entity?.seed ?? entity?.populationId ?? entity?.civilianId ?? entity?.id ?? entity?.entityId ?? null;
    }

    function randomUnit(entity, channel) {
        const seed = entitySeed(entity);
        if (seed !== null && seed !== undefined) return unitFromText(`${seed}|${channel}`);
        return Math.random();
    }

    function assignNpcFacialHair(entity) {
        if (!entity || entity.__facialHairAssigned) return entity?.facialHairStyle || 'none';
        if (entity.facialHairStyle !== undefined && entity.facialHairStyle !== null) {
            entity.__facialHairAssigned = true;
            return entity.facialHairStyle;
        }
        if (!isAdultMaleNpc(entity) || AVAILABLE_STYLE_IDS.length === 0) return 'none';

        const hasFacialHair = randomUnit(entity, 'facial-hair-chance') < NPC_FACIAL_HAIR_CHANCE;
        if (hasFacialHair) {
            const roll = randomUnit(entity, 'facial-hair-style');
            const index = Math.min(AVAILABLE_STYLE_IDS.length - 1, Math.floor(roll * AVAILABLE_STYLE_IDS.length));
            entity.facialHairStyle = AVAILABLE_STYLE_IDS[index];
            // NPC facial hair naturally follows their hair colour unless content
            // authors explicitly provide a separate value.
            if (entity.facialHairHue === undefined) entity.facialHairHue = entity.hairHue ?? 25;
        } else {
            entity.facialHairStyle = 'none';
        }
        entity.__facialHairAssigned = true;
        return entity.facialHairStyle;
    }

    function creatorStyle(entity) {
        if (entity?.facialHairStyle !== undefined && entity?.facialHairStyle !== null) return entity.facialHairStyle;
        // humanoidRenderer constructs a lightweight creator-preview object rather
        // than the final player record, so read the controls for that object only.
        if (entity?.side === 'player' && !entity?.name) {
            return document.getElementById('facial-hair-style-select')?.value || 'none';
        }
        return 'none';
    }

    function creatorHue(entity) {
        if (Number.isFinite(Number(entity?.facialHairHue))) return Number(entity.facialHairHue);
        if (entity?.side === 'player' && !entity?.name) {
            const value = Number(document.getElementById('facial-hair-hue-slider')?.value);
            if (Number.isFinite(value)) return value;
        }
        return Number.isFinite(Number(entity?.hairHue)) ? Number(entity.hairHue) : 25;
    }

    function imageReady(image) {
        return !!image && ((image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
            || (image.width > 0 && image.height > 0));
    }

    function imageFor(src) {
        if (!src) return null;
        if (imageCache.has(src)) return imageCache.get(src);
        let image = null;
        if (window.assetManager?.request) {
            image = window.assetManager.request(src);
            window.assetManager.whenReady?.(src).then(() => {
                window.drawMap?.();
                window.renderEntities?.();
                window.updateAppearancePreview?.();
            }).catch((error) => console.warn('Facial hair art failed to load:', src, error));
        } else if (typeof Image !== 'undefined') {
            image = new Image();
            image.src = src;
        }
        if (image) imageCache.set(src, image);
        return image;
    }

    function drawImageContained(ctx, image, target) {
        if (!imageReady(image)) return false;
        const iw = image.naturalWidth || image.width || 1;
        const ih = image.naturalHeight || image.height || 1;
        const scale = Math.min(target.width / iw, target.height / ih);
        const width = iw * scale;
        const height = ih * scale;
        ctx.drawImage(image,
            target.left + (target.width - width) / 2,
            target.top + (target.height - height) / 2,
            width, height);
        return true;
    }

    function facialHairTarget(view, bounds, style) {
        // Normalised to the direct humanoid body bounds. The side art is authored
        // facing right; humanoidRenderer mirrors the whole stack for left-facing.
        // Individual styles can provide a larger/smaller target while moustaches
        // and future simple styles retain the original compact default.
        const key = view === 'side' ? 'side' : 'front';
        const fallback = key === 'side'
            ? { x: 0.445, y: 0.125, w: 0.150, h: 0.090 }
            : { x: 0.385, y: 0.130, w: 0.230, h: 0.085 };
        const t = style?.targets?.[key] || fallback;
        return {
            left: bounds.left + bounds.width * t.x,
            top: bounds.top + bounds.height * t.y,
            width: bounds.width * t.w,
            height: bounds.height * t.h,
        };
    }

    function drawFacialHairLayer(ctx, entity, view, bounds) {
        if (!ctx || !entity || !bounds || view === 'back') return false;
        if (entity.isNPC === true || entity.isGeneratedCivilian === true) assignNpcFacialHair(entity);
        const styleId = creatorStyle(entity);
        if (!styleId || styleId === 'none') return false;
        const style = FACIAL_HAIR_STYLES[styleId];
        if (!style) return false;
        const src = style[view === 'side' ? 'side' : 'front'];
        const source = imageFor(src);
        if (!imageReady(source)) return false;
        const hue = creatorHue(entity);
        const image = window.getRecoloredCharacterHairSprite
            ? window.getRecoloredCharacterHairSprite(source, hue, entity.facialHairLightMult || entity.hairLightMult || 1, entity.facialHairSatMult || entity.hairSatMult || 1)
            : source;
        return drawImageContained(ctx, image, facialHairTarget(view, bounds, style));
    }

    function ensureCreatorControls() {
        if (document.getElementById('facial-hair-style-select')) return true;
        const hairStyle = document.getElementById('hair-style-select');
        if (!hairStyle?.parentElement) return false;

        const styleLabel = document.createElement('label');
        styleLabel.htmlFor = 'facial-hair-style-select';
        styleLabel.style.cssText = 'font-weight: normal; font-size: 0.85em;';
        styleLabel.textContent = 'Facial Hair';
        const styleSelect = document.createElement('select');
        styleSelect.id = 'facial-hair-style-select';
        styleSelect.innerHTML = '<option value="none" selected>None</option>'
            + AVAILABLE_STYLE_IDS.map(id => `<option value="${id}">${FACIAL_HAIR_STYLES[id].label}</option>`).join('');

        const hueLabel = document.createElement('label');
        hueLabel.htmlFor = 'facial-hair-hue-slider';
        hueLabel.style.cssText = 'font-weight: normal; font-size: 0.85em;';
        hueLabel.textContent = 'Facial Hair Color';
        const hueSlider = document.createElement('input');
        hueSlider.type = 'range';
        hueSlider.id = 'facial-hair-hue-slider';
        hueSlider.min = '0';
        hueSlider.max = '359';
        hueSlider.value = document.getElementById('hair-hue-slider')?.value || '25';

        const refresh = () => {
            window.updateAppearancePreview?.();
            window.syncCharacterToServer?.();
        };
        styleSelect.addEventListener('change', refresh);
        hueSlider.addEventListener('input', refresh);

        hairStyle.insertAdjacentElement('afterend', hueSlider);
        hueSlider.insertAdjacentElement('beforebegin', hueLabel);
        hueLabel.insertAdjacentElement('beforebegin', styleSelect);
        styleSelect.insertAdjacentElement('beforebegin', styleLabel);
        return true;
    }

    function applyCreatorSelection(character) {
        if (!character) return character;
        character.facialHairStyle = document.getElementById('facial-hair-style-select')?.value || 'none';
        const hue = Number(document.getElementById('facial-hair-hue-slider')?.value);
        character.facialHairHue = Number.isFinite(hue) ? hue : (Number(character.hairHue) || 25);
        return character;
    }

    function installCharacterCreationHooks() {
        if (typeof window.createCharacterData === 'function' && !window.createCharacterData.__facialHairDefaults) {
            const previousCreate = window.createCharacterData;
            const wrappedCreate = function(...args) {
                const character = previousCreate.apply(this, args);
                if (character && character.facialHairStyle === undefined) character.facialHairStyle = 'none';
                if (character && character.facialHairHue === undefined) character.facialHairHue = Number(character.hairHue) || 25;
                return character;
            };
            wrappedCreate.__facialHairDefaults = true;
            wrappedCreate.__previous = previousCreate;
            window.createCharacterData = wrappedCreate;
        }
        if (typeof window.initializePlayer === 'function' && !window.initializePlayer.__facialHairCreator) {
            const previousInitialize = window.initializePlayer;
            const wrappedInitialize = function(...args) {
                const result = previousInitialize.apply(this, args);
                applyCreatorSelection(window.party?.[0]);
                if (window.player) applyCreatorSelection(window.player);
                return result;
            };
            wrappedInitialize.__facialHairCreator = true;
            wrappedInitialize.__previous = previousInitialize;
            window.initializePlayer = wrappedInitialize;
        }
    }

    function styleNpcPass() {
        for (const entity of window.entities || []) assignNpcFacialHair(entity);
    }

    window.FACIAL_HAIR_STYLES = FACIAL_HAIR_STYLES;
    window.getAvailableFacialHairStyles = () => AVAILABLE_STYLE_IDS.slice();
    window.assignNpcFacialHair = assignNpcFacialHair;
    window.drawFacialHairLayer = drawFacialHairLayer;
    window.applyCreatorFacialHair = applyCreatorSelection;
    window.FacialHairSystem = { BUILD, NPC_FACIAL_HAIR_CHANCE, FACIAL_HAIR_STYLES, assignNpcFacialHair, drawFacialHairLayer, applyCreatorSelection };

    installCharacterCreationHooks();
    ensureCreatorControls();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCreatorControls, { once:true });
    Object.values(FACIAL_HAIR_STYLES).forEach(style => { imageFor(style.front); imageFor(style.side); });
    styleNpcPass();
    window.__facialHairNpcTimer = window.__facialHairNpcTimer || setInterval(styleNpcPass, 1000);
})();
