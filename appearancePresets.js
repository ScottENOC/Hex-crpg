// appearancePresets.js
// Optional authored appearance presets for companions/NPCs. Characters without
// a preset continue through the existing deterministic/random appearance path.
(() => {
    'use strict';

    const BUILD = '20260929-appearance-presets-v1';
    const presets = Object.create(null);
    const matchers = [];

    function clamp01(value) {
        return Math.max(0, Math.min(1, Number(value) || 0));
    }

    function normaliseColour(colour) {
        if (!colour) return null;
        return {
            hue: ((Number(colour.hue) % 360) + 360) % 360,
            saturation: Math.max(0, Math.min(100, Number(colour.saturation) || 0)),
            value: Math.max(0, Math.min(100, Number(colour.value) || 0)),
            opacity: clamp01(colour.opacity ?? 1),
        };
    }

    function registerCharacterAppearancePreset(id, preset, match = null) {
        if (!id || !preset) return null;
        const stored = { ...preset, id:String(id) };
        presets[id] = stored;
        if (match) matchers.push({ id:String(id), ...match });
        return stored;
    }

    function resolvePreset(entity, presetOrId = null, context = {}) {
        if (presetOrId && typeof presetOrId === 'object') return presetOrId;
        const explicitId = presetOrId || entity?.appearancePreset;
        if (explicitId && presets[explicitId]) return presets[explicitId];

        const campaign = String(context.campaign ?? window.currentCampaign ?? '');
        const match = matchers.find(m =>
            (!m.name || m.name === entity?.name) &&
            (!m.campaign || String(m.campaign) === campaign) &&
            (!m.race || m.race === entity?.race) &&
            (!m.gender || m.gender === entity?.gender)
        );
        return match ? presets[match.id] : null;
    }

    // Trousers already use the same authored green source art as the colourable
    // garments. Preserve the legacy `base` layer ID as Main (so old saves keep
    // their stored trouser colour) and expose the lighter source region as Trim.
    function ensureTwoToneTrousers() {
        const garments = window.clothingSystem?.builtinGarments;
        const current = garments?.pants_trousers;
        if (!garments || !current) return false;
        if (current.layers?.some(layer => layer.id === 'light')) return true;
        const path = 'images/equipment/clothing/pants_trousers.png';
        garments.pants_trousers = {
            slot:'pants',
            layers:[
                {
                    id:'base', label:'Main', sourceTone:'darkGreen',
                    defaultColor:{hue:110,saturation:55,value:62,opacity:1},
                    views:{front:path,side:path,back:path},
                },
                {
                    id:'light', label:'Trim', sourceTone:'lightGreen',
                    defaultColor:{hue:110,saturation:45,value:72,opacity:1},
                    views:{front:path,side:path,back:path},
                },
            ],
        };
        return true;
    }

    function applyClothing(entity, clothing) {
        if (!clothing || !entity) return;
        entity.equipped = entity.equipped || {};
        entity.clothingColors = entity.clothingColors || {};
        entity.inventory = Array.isArray(entity.inventory) ? entity.inventory : [];
        entity.displayClothes = true;

        for (const [slot, slotPreset] of Object.entries(clothing)) {
            if (!slotPreset?.itemId) continue;
            const itemId = slotPreset.itemId;
            entity.equipped[slot] = itemId;
            if (!entity.inventory.includes(itemId)) entity.inventory.push(itemId);
            const itemColours = entity.clothingColors[itemId] || (entity.clothingColors[itemId] = {});
            for (const [layerId, colour] of Object.entries(slotPreset.layers || {})) {
                const resolved = normaliseColour(colour);
                if (!resolved) continue;
                itemColours[layerId] = resolved;
                // Use the clothing system setter as well when it is ready so any
                // future validation/clamping stays centralised there.
                window.clothingSystem?.setLayerColour?.(entity, itemId, layerId, resolved);
            }
        }

        // The preset is a complete authored outfit, not a seed for default
        // randomisation. Mark defaults as satisfied so ensureDefaultOutfit never
        // replaces an intentionally empty/authored slot later.
        entity.clothingDefaultsApplied = true;
        window.clothingSystem?.migrateLegacyEquipment?.(entity);
        window.clothingSystem?.preloadOutfit?.(entity, 'front');
    }

    function applyCharacterAppearancePreset(entity, presetOrId = null, context = {}) {
        if (!entity) return entity;
        ensureTwoToneTrousers();
        const preset = resolvePreset(entity, presetOrId, context);
        if (!preset) return entity;
        if (entity.appearancePresetApplied === preset.id && !context.force) return entity;

        if (preset.bodyType) entity.bodyType = preset.bodyType;
        if (preset.hair) {
            if (preset.hair.style) entity.hairStyle = preset.hair.style;
            if (Number.isFinite(Number(preset.hair.hue))) entity.hairHue = Number(preset.hair.hue);
            if (Number.isFinite(Number(preset.hair.saturation))) {
                entity.hairSaturation = Number(preset.hair.saturation);
                entity.hairSatMult = Math.max(0, Number(preset.hair.saturation) / 100);
            }
            if (Number.isFinite(Number(preset.hair.value))) {
                entity.hairValue = Number(preset.hair.value);
                entity.hairLightMult = Math.max(0, Number(preset.hair.value) / 100);
            }
            if (Number.isFinite(Number(preset.hair.hue)) && Number.isFinite(Number(preset.hair.saturation)) && Number.isFinite(Number(preset.hair.value))) {
                entity.hairColorHSV = {
                    hue:Number(preset.hair.hue),
                    saturation:Number(preset.hair.saturation),
                    value:Number(preset.hair.value),
                };
            }
        }

        if (preset.skin?.naturalSlider !== undefined) {
            const slider = Number(preset.skin.naturalSlider);
            const tone = window.naturalSkinToneFromSlider?.(slider) || {
                // Exact midpoint of the current player natural-tone ramp.
                hue:22.5, saturation:0.46, lightness:0.585,
            };
            entity.skinHue = tone.hue;
            entity.skinSaturation = tone.saturation;
            entity.skinLightness = tone.lightness;
            entity.skinToneSlider = slider;
        }

        applyClothing(entity, preset.clothing);
        entity.appearancePreset = preset.id || entity.appearancePreset || null;
        entity.appearancePresetApplied = preset.id || 'inline';
        return entity;
    }

    function installWrappers() {
        const create = window.createCharacterData;
        if (typeof create === 'function' && !create.__appearancePresetAware) {
            const wrappedCreate = function() {
                const character = create.apply(this, arguments);
                return applyCharacterAppearancePreset(character, null, { campaign:window.currentCampaign });
            };
            wrappedCreate.__appearancePresetAware = true;
            wrappedCreate.__baseCreateCharacterData = create;
            window.createCharacterData = wrappedCreate;
        }

        const build = window.buildNPC;
        if (typeof build === 'function' && !build.__appearancePresetAware) {
            const wrappedBuild = function(spec) {
                const npc = build.apply(this, arguments);
                if (!npc) return npc;
                return applyCharacterAppearancePreset(npc, spec?.appearancePreset || null, { campaign:window.currentCampaign });
            };
            wrappedBuild.__appearancePresetAware = true;
            wrappedBuild.__baseBuildNPC = build;
            window.buildNPC = wrappedBuild;
        }
    }

    registerCharacterAppearancePreset('scenario2_wren', {
        bodyType:'average',
        hair:{ style:'braid', hue:218, saturation:71, value:56 },
        skin:{ naturalSlider:50 },
        clothing:{
            bra:{
                itemId:'underwear_bra_strapless',
                layers:{
                    dark:{hue:55,saturation:58,value:20,opacity:.75},
                    light:{hue:47,saturation:100,value:100,opacity:1},
                },
            },
            underwear:{
                itemId:'underwear_briefs',
                layers:{
                    dark:{hue:55,saturation:58,value:20,opacity:.75},
                    light:{hue:47,saturation:100,value:100,opacity:1},
                },
            },
            shirt:{
                itemId:'top_shirt_f',
                layers:{
                    dark:{hue:110,saturation:60,value:42,opacity:.75},
                    light:{hue:347,saturation:100,value:100,opacity:1},
                },
            },
            pants:{
                itemId:'pants_trousers',
                layers:{
                    base:{hue:110,saturation:60,value:42,opacity:1},
                    light:{hue:347,saturation:100,value:100,opacity:1},
                },
            },
        },
    }, { name:'Wren Talbot', campaign:'2', race:'human', gender:'female' });

    function install() {
        ensureTwoToneTrousers();
        installWrappers();
        window.characterAppearancePresets = presets;
        window.registerCharacterAppearancePreset = registerCharacterAppearancePreset;
        window.resolveCharacterAppearancePreset = resolvePreset;
        window.applyCharacterAppearancePreset = applyCharacterAppearancePreset;
        window.refreshCharacterAppearancePresetHooks = installWrappers;
        window.__appearancePresetsReady = true;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
    else install();

    // clothingSystem.js is injected dynamically by characterCreation.js. Usually
    // it is ready before DOMContentLoaded, but retry the harmless trouser-spec
    // upgrade briefly so slow mobile asset/script loading cannot miss it.
    let tries = 0;
    const clothingTimer = setInterval(() => {
        tries++;
        if (ensureTwoToneTrousers() || tries >= 100) clearInterval(clothingTimer);
    }, 50);

    window.CHARACTER_APPEARANCE_PRESETS_BUILD = BUILD;
})();