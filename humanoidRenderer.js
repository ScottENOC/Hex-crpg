// humanoidRenderer.js
// Direct humanoid compositor: one entity in, one deterministic stack out.
//
// This renderer deliberately does not intercept or replace CanvasRenderingContext2D
// methods. Body, hair/helmet, armour, shield and weapons are placed from the
// entity and its rig in one call, so equipment can never inherit stale context
// from a previously drawn character.
(() => {
    'use strict';

    const VALID_FACINGS = new Set(['up', 'down', 'left', 'right']);
    const HUMAN_RENDER_ASPECT = 0.48;
    const previousHex = new WeakMap();
    const trimCache = new WeakMap();
    let legacyDrawPlayerCharacter = null;
    let installed = false;
    let creatorLegacy = null;
    let portraitObserver = null;
    let portraitQueued = false;

    const CHARACTER_RIGS = {
        human_female: { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16 },
        human_male:   { bodyW:1.70, bodyH:2.06, yOff:-0.17, heightScale:2.06/2.16 },
    };

    const CHARACTER_PATHS = {
        human_female: {
            body: {
                average: {
                    front:'images/characters/human_female/body_front.png',
                    side:'images/characters/human_female/body_side.png',
                    back:'images/characters/human_female/body_back.png',
                },
                broad: {
                    front:'images/characters/human_female/body_broad_front.png',
                    side:'images/characters/human_female/body_broad_side.png',
                    back:'images/characters/human_female/body_broad_back.png',
                },
            },
            hair: {
                brown_1: {
                    front:'images/characters/human_female/hair_brown_1_front.png',
                    side:'images/characters/human_female/hair_brown_1_side.png',
                    back:'images/characters/human_female/hair_brown_1_back.png',
                },
                braid: {
                    front:'images/characters/human_female/hair_braid_front.png',
                    side:'images/characters/human_female/hair_braid_side.png',
                    back:'images/characters/human_female/hair_braid_back.png',
                },
                curly: {
                    front:'images/characters/human_female/hair_curly_front.png',
                    side:'images/characters/human_female/hair_curly_side.png',
                    back:'images/characters/human_female/hair_curly_back.png',
                },
            },
        },
        human_male: {
            body: {
                average: {
                    front:'images/characters/human_male/body_front.png',
                    side:'images/characters/human_male/body_side.png',
                    back:'images/characters/human_male/body_back.png',
                },
            },
            // Hair choices are shared between genders; the body rig supplies placement.
            hair:null,
        },
    };
    CHARACTER_PATHS.human_male.hair = CHARACTER_PATHS.human_female.hair;

    const DIRECTIONAL_LAYOUT = {
        front: {
            bodyCrop:{x:0.350,y:0.088,w:0.297,h:0.823}, bodyDest:{x:0,y:0,w:1,h:1},
            hairCrop:{x:0.312,y:0.221,w:0.382,h:0.387}, hairDest:{x:0.220,y:-0.015,w:0.560,h:0.370},
        },
        side: {
            bodyCrop:{x:0.431,y:0.092,w:0.148,h:0.822}, bodyDest:{x:0.250,y:0,w:0.500,h:1},
            hairCrop:{x:0.303,y:0.250,w:0.403,h:0.431}, hairDest:{x:0.305,y:-0.010,w:0.390,h:0.405},
        },
        back: {
            bodyCrop:{x:0.350,y:0.085,w:0.299,h:0.826}, bodyDest:{x:0,y:0,w:1,h:1},
            hairCrop:{x:0.338,y:0.203,w:0.323,h:0.344}, hairDest:{x:0.220,y:-0.005,w:0.560,h:0.375},
        },
    };

    // Fallback anchors for rigs that do not yet have measured reference metadata.
    // Direct humans reuse the approved human-female reference geometry when available.
    const FALLBACK_ANCHORS = {
        front:{helmetAnchor:{x:.50,y:.03},mainHandGrip:{x:.10,y:.55},offHandGrip:{x:.90,y:.55},offForearm:{x:.84,y:.44},backAnchor:{x:.50,y:.33}},
        side: {helmetAnchor:{x:.53,y:.03},mainHandGrip:{x:.56,y:.55},offHandGrip:{x:.47,y:.52},offForearm:{x:.50,y:.44},backAnchor:{x:.43,y:.33}},
        back: {helmetAnchor:{x:.50,y:.03},mainHandGrip:{x:.90,y:.55},offHandGrip:{x:.10,y:.55},offForearm:{x:.16,y:.44},backAnchor:{x:.50,y:.30}},
    };

    // Small compositor-only tuning offsets. The canonical reference rig stays a
    // measured description of the body art; these offsets describe how equipment
    // should sit on that body. Female-average is the approved baseline, and the
    // same normalised geometry is reused by female-broad and male body art.
    const HUMAN_FEMALE_EQUIPMENT_TUNING = {
        front:{
            mainHandGrip:{x:0,y:.075},
            offHandGrip:{x:0,y:.075},
            helmetAnchor:{x:0,y:-.025},
            armourY:-.010,
            heldItems:{
                // sword.png alpha>=8 trim: r=407/1024=.3974609375.
                // Deltas were calculated in pixel space, then normalised per axis.
                axe:{inward:.075,y:.061336564429012},
                sword:{inward:.098243545511295,y:.096336564429012},
                dagger:{inward:.076946127306777,y:.050334141107253},
                bow:{inward:.162968123740783,y:-.045},
            },
        },
        side:{helmetAnchor:{x:0,y:-.025},armourY:-.010},
        back:{helmetAnchor:{x:0,y:-.025},armourY:-.010},
    };

    const ARMOUR_TARGETS = {
        front:{x:.03,y:.225,w:.94,h:.770},
        side: {x:.18,y:.225,w:.64,h:.770},
        // Rear-specific art should occupy the same visible envelope as front art.
        back: {x:.03,y:.225,w:.94,h:.770},
    };

    // Human-female nasal helm sits halfway between the pre-reduction and current
    // reduced fit. Male rendering deliberately keeps the existing target.
    const HELMET_TARGETS = {
        human_female:{x:-.1873125,y:-.015,w:.374625,h:.2183},
        default:{x:-.172125,y:-.015,w:.34425,h:.2006},
    };
    const SHIELD_OPAQUE_HEIGHT_DROP = .10;

    const REAR_EQUIPMENT_PATHS = {
        shield:'images/shield_back.svg',
        helmet:'images/nasalHelm_back.svg',
        armour:{
            light:'images/humanlightarmour_back.svg',
            medium:'images/humanmediumarmour_back.svg',
            heavy:'images/humanheavyarmour_back.svg',
        },
    };

    const ITEM_GRIPS = {
        sword:{x:.50,y:.92}, axe:{x:.50,y:.82}, spear:{x:.50,y:.88},
        club:{x:.50,y:.84}, bow:{x:.50,y:.50}, shield:{x:.50,y:.50},
        helmet:{x:.50,y:.00},
    };

    function keyFor(entity) {
        return entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
    }

    function usesApprovedHumanEquipmentBaseline(entity) {
        const key = keyFor(entity);
        return key === 'human_female' || key === 'human_male';
    }

    function canDirectRender(entity) {
        return !!CHARACTER_RIGS[keyFor(entity)] && !entity?.customImage;
    }

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function imageReady(image) {
        return !!image && ((image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
            || (image.width > 0 && image.height > 0));
    }

    function loadImage(src) {
        if (typeof Image === 'undefined') return null;
        const image = new Image();
        image.addEventListener('load', () => {
            window.drawMap?.();
            window.renderEntities?.();
            queuePortraitRefresh();
        });
        image.src = src;
        return image;
    }

    function loadSet(paths) {
        return {
            body:Object.fromEntries(Object.entries(paths.body).map(([bodyType, views]) => [
                bodyType,
                Object.fromEntries(Object.entries(views).map(([view, src]) => [view, loadImage(src)])),
            ])),
            hair:Object.fromEntries(Object.entries(paths.hair).map(([style, views]) => [
                style,
                Object.fromEntries(Object.entries(views).map(([view, src]) => [view, loadImage(src)])),
            ])),
        };
    }

    const CHARACTER_ASSETS = Object.fromEntries(Object.entries(CHARACTER_PATHS)
        .map(([key, paths]) => [key, loadSet(paths)]));
    const REAR_EQUIPMENT_ASSETS = {
        shield:loadImage(REAR_EQUIPMENT_PATHS.shield),
        helmet:loadImage(REAR_EQUIPMENT_PATHS.helmet),
        armour:Object.fromEntries(Object.entries(REAR_EQUIPMENT_PATHS.armour)
            .map(([tier, src]) => [tier, loadImage(src)])),
    };

    function facingFromHexDelta(dq, dr) {
        if (!dq && !dr) return null;
        const dx = 1.5 * dq;
        const dy = Math.sqrt(3) * (dr + dq / 2);
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    function setEntityFacing(entity, facing) {
        if (!entity || !VALID_FACINGS.has(facing)) return false;
        if (entity.facing === facing) return false;
        entity.facing = facing;
        if (entity.riding && entity.riding.facing !== facing) entity.riding.facing = facing;
        if (entity.rider && entity.rider.facing !== facing) entity.rider.facing = facing;
        return true;
    }

    function updateFacingFromMovement() {
        for (const entity of window.entities || []) {
            if (!entity?.hex) continue;
            const old = previousHex.get(entity);
            if (!old) {
                previousHex.set(entity, {q:entity.hex.q,r:entity.hex.r});
                if (!VALID_FACINGS.has(entity.facing)) entity.facing = 'down';
                continue;
            }
            const dq = entity.hex.q - old.q;
            const dr = entity.hex.r - old.r;
            if (dq || dr) {
                const facing = facingFromHexDelta(dq, dr);
                if (facing) setEntityFacing(entity, facing);
                old.q = entity.hex.q;
                old.r = entity.hex.r;
            }
        }
    }

    function drawCropped(ctx, image, crop, dest, bounds) {
        if (!imageReady(image)) return false;
        const iw = image.naturalWidth || image.width;
        const ih = image.naturalHeight || image.height;
        const sx = crop.x * iw, sy = crop.y * ih, sw = crop.w * iw, sh = crop.h * ih;
        const dx = bounds.left + dest.x * bounds.width;
        const dy = bounds.top + dest.y * bounds.height;
        const dw = dest.w * bounds.width;
        const dh = dest.h * bounds.height;
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        return true;
    }

    function ensureAppearance(entity) {
        if (entity.shirtHue === undefined) entity.shirtHue = window.pickClothingHue?.(`${entity.name || 'x'}_shirt`) ?? 30;
        if (entity.pantsHue === undefined) entity.pantsHue = window.pickClothingHue?.(`${entity.name || 'x'}_pants`) ?? 220;
        if (entity.clothingSatMult === undefined) entity.clothingSatMult = .85;
        if (entity.skinHue === undefined) {
            const tone = window.pickNaturalSkinTone?.(`${entity.name || 'x'}_skin`);
            entity.skinHue = tone?.hue ?? 20;
            entity.skinSaturation = tone?.saturation;
            entity.skinLightness = tone?.lightness;
        }
        if (entity.hairHue === undefined) entity.hairHue = 25;
    }

    function resolvedBodyImage(entity, source) {
        ensureAppearance(entity);
        const clothesId = entity.equipped?.clothes;
        const clothesPreset = clothesId && window.CLOTHING_PRESETS?.[clothesId];
        const showClothes = !!clothesPreset && (window.clothingDisplayMode === 'clothes' || !entity.equipped?.armor);
        const shirtHue = showClothes ? clothesPreset.shirtHue : entity.shirtHue;
        const pantsHue = showClothes ? clothesPreset.pantsHue : entity.pantsHue;
        const satMult = showClothes ? (clothesPreset.satMult ?? 1) : (entity.clothingSatMult || 1);
        const skinned = window.getRecoloredSkinSprite
            ? window.getRecoloredSkinSprite(source, {hue:entity.skinHue,saturation:entity.skinSaturation,lightness:entity.skinLightness})
            : source;
        return window.getRecoloredSprite ? window.getRecoloredSprite(skinned, {shirtHue,pantsHue,satMult}) : skinned;
    }

    function resolvedHairImage(entity, source) {
        if (!source) return null;
        return entity.hairHue !== undefined && window.getRecoloredCharacterHairSprite
            ? window.getRecoloredCharacterHairSprite(source, entity.hairHue, entity.hairLightMult || 1, entity.hairSatMult || 1)
            : source;
    }

    function alphaTrim(image) {
        if (!image) return null;
        if (trimCache.has(image)) return trimCache.get(image);
        let trim = null;
        try { trim = window.suggestSpriteAlphaTrim?.(image, 8) || null; } catch (_) {}
        if (!trim) {
            const w = image.naturalWidth || image.width || 1;
            const h = image.naturalHeight || image.height || 1;
            trim = {originalWidth:w,originalHeight:h,trimLeft:0,trimTop:0,trimWidth:w,trimHeight:h};
        }
        trimCache.set(image, trim);
        return trim;
    }

    function drawVisibleFit(ctx, image, bounds, target) {
        if (!imageReady(image)) return false;
        const trim = alphaTrim(image);
        if (!trim?.trimWidth || !trim?.trimHeight) return false;
        const targetLeft = bounds.left + target.x * bounds.width;
        const targetTop = bounds.top + target.y * bounds.height;
        const targetWidth = target.w * bounds.width;
        const targetHeight = target.h * bounds.height;
        const sx = targetWidth / trim.trimWidth;
        const sy = targetHeight / trim.trimHeight;
        const outerW = trim.originalWidth * sx;
        const outerH = trim.originalHeight * sy;
        const dx = targetLeft - trim.trimLeft * sx;
        const dy = targetTop - trim.trimTop * sy;
        ctx.drawImage(image, dx, dy, outerW, outerH);
        return {dx,dy,width:outerW,height:outerH,target:{left:targetLeft,top:targetTop,width:targetWidth,height:targetHeight}};
    }

    function rearPreferred(view, rearImage, fallback) {
        return view === 'back' && imageReady(rearImage) ? rearImage : fallback;
    }

    function armourImage(entity, view) {
        const id = entity.equipped?.armor;
        if (!id) return null;
        const item = window.items?.[id];
        const reduction = Number(item?.reduction || 0);
        const visuals = window.gameVisuals || {};
        const tier = reduction >= 3 ? 'heavy' : reduction >= 2 ? 'medium' : 'light';
        const generic = tier === 'heavy' ? visuals.humanHeavy : tier === 'medium' ? visuals.humanMedium : visuals.humanLight;
        let image = rearPreferred(view, REAR_EQUIPMENT_ASSETS.armour[tier], generic);
        if (!image) return null;
        if (entity.goldGear && window.getGoldTintedSprite) image = window.getGoldTintedSprite(image) || image;
        return image;
    }

    function helmetImage(entity, view) {
        if (!entity.equipped?.helmet) return null;
        let image = rearPreferred(view, REAR_EQUIPMENT_ASSETS.helmet, window.gameVisuals?.nasal_helm || null);
        if (image && entity.goldGear && window.getGoldTintedSprite) image = window.getGoldTintedSprite(image) || image;
        return image;
    }

    function weaponSpec(id) {
        if (!id || window.items?.[id]?.type !== 'weapon') return null;
        const visuals = window.gameVisuals || {};
        const lower = String(id).toLowerCase();
        if (lower.includes('bow')) return {image:visuals.bow,kind:'bow',scale:1.05};
        if (lower.includes('spear')) return {image:visuals.spear,kind:'spear',scale:1.08};
        if (lower.includes('axe') || lower.includes('pickaxe')) return {image:visuals.axe,kind:'axe',scale:1};
        if (lower.includes('club') || lower.includes('chair')) return {image:visuals.club,kind:'club',scale:1};
        if (lower.includes('dagger')) return {image:visuals.swordIcon,kind:'dagger',scale:.75};
        if (lower.includes('sword')) return {image:visuals.swordIcon,kind:'sword',scale:1};
        return null;
    }

    function slotSpec(entity, slot, view) {
        const id = slot === 'main' ? entity.equipped?.weapon : entity.equipped?.offhand;
        if (!id) return null;
        const item = window.items?.[id];
        if (item?.type === 'shield') {
            return {image:rearPreferred(view, REAR_EQUIPMENT_ASSETS.shield, window.gameVisuals?.shield),kind:'shield',scale:.73};
        }
        return weaponSpec(id);
    }

    function anchorsFor(entity, view) {
        if (usesApprovedHumanEquipmentBaseline(entity)) {
            const measured = window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
            if (measured) return measured;
        }
        return FALLBACK_ANCHORS[view];
    }

    function tunedAnchor(entity, view, anchorName) {
        const anchors = anchorsFor(entity, view);
        const base = anchors?.[anchorName] || FALLBACK_ANCHORS[view][anchorName];
        if (!base) return null;
        if (!usesApprovedHumanEquipmentBaseline(entity)) return base;
        const delta = HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.[anchorName];
        if (!delta) return base;
        return {x:base.x + (delta.x || 0), y:base.y + (delta.y || 0)};
    }

    function tunedHeldItemAnchor(entity, view, anchorName, slot, kind) {
        const base = tunedAnchor(entity, view, anchorName);
        if (!base || !usesApprovedHumanEquipmentBaseline(entity)) return base;
        const tuning = HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.heldItems?.[kind];
        if (!tuning) return base;
        const side = slot === 'off' ? -1 : 1;
        return {
            x:base.x + side * (tuning.inward || 0),
            y:base.y + (tuning.y || 0),
        };
    }

    function point(bounds, p) {
        return {x:bounds.left+p.x*bounds.width,y:bounds.top+p.y*bounds.height};
    }

    function drawHeldItem(ctx, entity, view, bounds, slot, expectedLayer='any') {
        const spec = slotSpec(entity, slot, view);
        if (!spec || !imageReady(spec.image)) return false;
        if (expectedLayer === 'shield' && spec.kind !== 'shield') return false;
        if (expectedLayer === 'weapon' && spec.kind === 'shield') return false;
        const anchorName = spec.kind === 'shield' ? 'offForearm' : (slot === 'main' ? 'mainHandGrip' : 'offHandGrip');
        const anchorPoint = spec.kind === 'shield'
            ? tunedAnchor(entity, view, anchorName)
            : tunedHeldItemAnchor(entity, view, anchorName, slot, spec.kind);
        if (!anchorPoint) return false;
        const anchor = point(bounds, anchorPoint);
        const grip = ITEM_GRIPS[spec.kind] || ITEM_GRIPS.sword;
        let size;
        if (spec.kind === 'shield') size = bounds.width * spec.scale;
        else {
            // Derive held-item size from the compositor bounds rather than the
            // world camera. World rendering is unchanged because those bounds
            // are themselves built from hexSize*z, while 100px initiative
            // portraits now scale weapons down with the character.
            const rig = CHARACTER_RIGS[keyFor(entity)];
            const bodyHeightUnits = rig?.bodyH || 1;
            const basePixel = bounds.height / bodyHeightUnits;
            size = basePixel * (rig?.heightScale || 1) * spec.scale;
        }

        let itemY = anchor.y - grip.y*size;
        if (spec.kind === 'shield') {
            const trim = alphaTrim(spec.image);
            const opaqueHeight = trim?.trimHeight && trim?.originalHeight
                ? size * trim.trimHeight / trim.originalHeight
                : size;
            itemY += opaqueHeight * SHIELD_OPAQUE_HEIGHT_DROP;
        }

        const mirrorOffhandWeapon = slot === 'off' && spec.kind !== 'shield';
        if (mirrorOffhandWeapon) {
            // Mirror around the grip itself: the hilt stays on the off-hand anchor
            // while the weapon points the opposite way to the main-hand copy.
            ctx.save();
            ctx.translate(anchor.x, anchor.y);
            ctx.scale(-1, 1);
            ctx.drawImage(spec.image, -grip.x*size, -grip.y*size, size, size);
            ctx.restore();
        } else {
            ctx.drawImage(spec.image, anchor.x - grip.x*size, itemY, size, size);
        }
        return true;
    }

    function drawHelmet(ctx, entity, view, bounds) {
        const image = helmetImage(entity, view);
        if (!imageReady(image)) return false;
        const anchorPoint = tunedAnchor(entity, view, 'helmetAnchor');
        if (!anchorPoint) return false;
        const anchor = point(bounds, anchorPoint);
        const helmetTarget = HELMET_TARGETS[keyFor(entity)] || HELMET_TARGETS.default;
        const target = {
            x:(anchor.x-bounds.left)/bounds.width + helmetTarget.x,
            y:(anchor.y-bounds.top)/bounds.height + helmetTarget.y,
            w:helmetTarget.w,
            h:helmetTarget.h,
        };
        return !!drawVisibleFit(ctx, image, bounds, target);
    }

    function drawArmour(ctx, entity, view, bounds) {
        const image = armourImage(entity, view);
        if (!imageReady(image)) return false;
        const baseTarget = ARMOUR_TARGETS[view] || ARMOUR_TARGETS.front;
        const armourY = usesApprovedHumanEquipmentBaseline(entity)
            ? (HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.armourY || 0)
            : 0;
        const target = armourY ? {...baseTarget,y:baseTarget.y+armourY} : baseTarget;
        const placement = drawVisibleFit(ctx, image, bounds, target);
        if (placement) {
            window.__humanoidRendererLastArmour = {
                entity, view, ...placement,
                compositionSource:'direct-axis-aligned-scale-translate',
                rotation:0, shear:false,
            };
        }
        return !!placement;
    }

    function drawDirectionalHumanoidInBounds(ctx, entity, bounds, facing='down') {
        if (!ctx || !entity || !bounds || !canDirectRender(entity)) return false;
        const key = keyFor(entity);
        const view = facingToView(facing);
        const set = CHARACTER_ASSETS[key];
        const bodyType = entity.bodyType || 'average';
        const sourceBody = (set?.body?.[bodyType] || set?.body?.average)?.[view];
        if (!imageReady(sourceBody)) return true; // own the frame; never flash legacy art while loading

        const layout = DIRECTIONAL_LAYOUT[view];
        const sourceHair = set?.hair?.[entity.hairStyle || 'brown_1']?.[view] || set?.hair?.brown_1?.[view];
        const bodyImage = resolvedBodyImage(entity, sourceBody);
        const hairImage = resolvedHairImage(entity, sourceHair);
        const hasHelmet = !!entity.equipped?.helmet;
        const showClothes = !!entity.equipped?.clothes
            && (window.clothingDisplayMode === 'clothes' || !entity.equipped?.armor);
        const mirror = facing === 'left';
        const cx = bounds.left + bounds.width/2;
        const layerOrder = [];

        const drawHeldLayers = () => {
            let shieldDrawn = false;
            shieldDrawn = drawHeldItem(ctx, entity, view, bounds, 'off', 'shield') || shieldDrawn;
            shieldDrawn = drawHeldItem(ctx, entity, view, bounds, 'main', 'shield') || shieldDrawn;
            if (shieldDrawn) layerOrder.push('shield');

            let weaponDrawn = false;
            weaponDrawn = drawHeldItem(ctx, entity, view, bounds, 'main', 'weapon') || weaponDrawn;
            weaponDrawn = drawHeldItem(ctx, entity, view, bounds, 'off', 'weapon') || weaponDrawn;
            if (weaponDrawn) layerOrder.push('weapons');
        };

        ctx.save();
        if (mirror) {
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
        }
        try {
            // Back-view equipment belongs behind the character. Front and side
            // retain the established body/head/armour then shield/weapons order.
            if (view === 'back') drawHeldLayers();

            if (drawCropped(ctx, imageReady(bodyImage) ? bodyImage : sourceBody, layout.bodyCrop, layout.bodyDest, bounds)) {
                layerOrder.push('body');
            }
            if (!hasHelmet && imageReady(hairImage)) {
                if (drawCropped(ctx, hairImage, layout.hairCrop, layout.hairDest, bounds)) layerOrder.push('hair');
            } else if (hasHelmet && drawHelmet(ctx, entity, view, bounds)) {
                layerOrder.push('helmet');
            }
            if (entity.equipped?.armor && !showClothes && drawArmour(ctx, entity, view, bounds)) {
                layerOrder.push('armour');
            }

            if (view !== 'back') drawHeldLayers();
        } finally {
            ctx.restore();
        }

        window.__humanoidRendererLastLayerOrder = layerOrder;
        window.__humanoidRendererLastDraw = {entity,key,view,facing,bounds:{...bounds},timestamp:Date.now()};
        window.__humanoidRendererDrawCount = (window.__humanoidRendererDrawCount || 0) + 1;
        return true;
    }

    function drawHumanoidCharacter(ctx, entity, x, y, z=1, flyOff=0) {
        if (!canDirectRender(entity)) return false;
        const rig = CHARACTER_RIGS[keyFor(entity)];
        const hs = window.hexSize || 1;
        const legacyW = rig.bodyW * hs * z;
        const legacyH = rig.bodyH * hs * z;
        const legacyTop = y - legacyW/2 + rig.yOff*hs*z + (flyOff || 0);
        const visualW = legacyH * HUMAN_RENDER_ASPECT;
        const bounds = {left:x-visualW/2,top:legacyTop,width:visualW,height:legacyH};
        return drawDirectionalHumanoidInBounds(ctx, entity, bounds, VALID_FACINGS.has(entity.facing) ? entity.facing : 'down');
    }

    function installDrawOverride() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function') return false;
        if (current.__directHumanoidCompositor) { installed = true; return true; }
        legacyDrawPlayerCharacter = current;
        const direct = function(ctx, entity, x, y, z, flyOff) {
            if (drawHumanoidCharacter(ctx, entity, x, y, z, flyOff)) return;
            return legacyDrawPlayerCharacter.apply(this, arguments);
        };
        direct.__directHumanoidCompositor = true;
        direct.__legacyDrawPlayerCharacter = legacyDrawPlayerCharacter;
        window.drawPlayerCharacter = direct;
        installed = true;
        window.__humanoidRendererInstalled = true;
        // Compatibility readiness flags for UI/tests that previously waited on
        // the interceptor stack. They now mean the equivalent direct features are ready.
        window.__facingRendererInstalled = true;
        window.__characterRigInstalled = true;
        return true;
    }

    function installCreatorPreview() {
        const current = window.updateAppearancePreview;
        if (typeof current !== 'function') return false;
        if (current.__directHumanoidPreview) return true;
        creatorLegacy = current;
        const wrapped = function() {
            const race = document.getElementById('race-select')?.value;
            const gender = document.getElementById('gender-select')?.value;
            const preview = {
                race, gender, equipped:{}, facing:'down',
                hairStyle:document.getElementById('hair-style-select')?.value || 'brown_1',
                bodyType:document.getElementById('body-type-select')?.value || 'average',
                hairHue:Number(document.getElementById('hair-hue-slider')?.value || 25),
                shirtHue:Number(document.getElementById('shirt-hue-slider')?.value || 30),
                pantsHue:Number(document.getElementById('pants-hue-slider')?.value || 220),
            };
            const skin = window.getPlayerSkinToneFromControls?.();
            if (skin) Object.assign(preview, {skinHue:skin.hue,skinSaturation:skin.saturation,skinLightness:skin.lightness});
            if (!canDirectRender(preview)) return creatorLegacy.apply(this, arguments);
            const canvas = document.getElementById('appearance-preview-canvas');
            if (!canvas) return creatorLegacy.apply(this, arguments);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height);
            const height = canvas.height*.90;
            const width = height*HUMAN_RENDER_ASPECT;
            drawDirectionalHumanoidInBounds(ctx, preview, {left:(canvas.width-width)/2,top:(canvas.height-height)/2,width,height}, 'down');
        };
        wrapped.__directHumanoidPreview = true;
        wrapped.__legacyPreview = creatorLegacy;
        window.updateAppearancePreview = wrapped;
        wrapped();
        return true;
    }

    function sortedTurnEntities() {
        const list = [...(window.entities || [])].filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
        if (window.isInCombat) list.sort((a,b) => b.timePoints-a.timePoints);
        return list;
    }

    function renderTurnPortraits() {
        portraitQueued = false;
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar) return;
        const entities = sortedTurnEntities();
        [...bar.querySelectorAll('.turn-indicator-item')].forEach((item,index) => {
            const entity = entities[index];
            if (!canDirectRender(entity)) return;
            const portrait = item.querySelector('.turn-indicator-portrait');
            if (!portrait) return;
            portrait.querySelectorAll('img.portrait-layer').forEach(img => {
                const src = img.getAttribute('src') || '';
                if (/images\/human(?:female|male)(?:hair)?\.png/.test(src)) img.remove();
            });
            let canvas = portrait.querySelector('canvas[data-direct-humanoid="true"]');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width=100; canvas.height=100;
                canvas.dataset.directHumanoid='true';
                canvas.classList.add('portrait-layer');
                canvas.style.cssText='width:100%;height:100%;left:0;top:0;';
                portrait.insertBefore(canvas, portrait.firstChild);
            }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,100,100);
            const height=92,width=height*HUMAN_RENDER_ASPECT;
            drawDirectionalHumanoidInBounds(ctx,entity,{left:(100-width)/2,top:4,width,height},'down');
        });
    }

    function queuePortraitRefresh() {
        if (portraitQueued) return;
        portraitQueued = true;
        queueMicrotask(renderTurnPortraits);
    }

    function installPortraitObserver() {
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar || portraitObserver) return !!portraitObserver;
        portraitObserver = new MutationObserver(queuePortraitRefresh);
        portraitObserver.observe(bar,{childList:true,subtree:true});
        queuePortraitRefresh();
        return true;
    }

    function installAll() {
        installDrawOverride();
        installCreatorPreview();
        installPortraitObserver();
    }

    window.FACING_DIRECTIONS = ['up','down','left','right'];
    window.HUMAN_FEMALE_RENDER_ASPECT = HUMAN_RENDER_ASPECT;
    window.DIRECTIONAL_CHARACTER_PATHS = CHARACTER_PATHS;
    window.DIRECTIONAL_CHARACTER_ASSETS = CHARACTER_ASSETS;
    window.DIRECTIONAL_CHARACTER_LAYOUT = DIRECTIONAL_LAYOUT;
    window.HUMAN_FEMALE_DIRECTIONAL_ASSETS = {
        body:CHARACTER_ASSETS.human_female.body.average,
        bodyTypes:CHARACTER_ASSETS.human_female.body,
        hair:CHARACTER_ASSETS.human_female.hair,
    };
    window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT = DIRECTIONAL_LAYOUT;
    window.REAR_HUMAN_EQUIPMENT_ASSETS = REAR_EQUIPMENT_ASSETS;
    window.ITEM_GRIPS = ITEM_GRIPS;
    window.facingToSpriteView = facingToView;
    window.facingFromHexDelta = facingFromHexDelta;
    window.setEntityFacing = setEntityFacing;
    window.updateFacingFromMovement = updateFacingFromMovement;
    window.drawDirectionalCharacterBase = (ctx,entity,bounds,facing='down') => drawDirectionalHumanoidInBounds(ctx,entity,bounds,facing);
    window.drawHumanFemaleDirectionalBase = window.drawDirectionalCharacterBase;
    window.drawHumanoidCharacter = drawHumanoidCharacter;
    window.drawDirectionalHumanoidInBounds = drawDirectionalHumanoidInBounds;
    window.refreshDirectionalTurnPortraits = renderTurnPortraits;
    window.__humanoidRendererReady = true;
    window.__directionalCharacterUIInstalled = true;

    setInterval(updateFacingFromMovement, 50);
    const installTimer = setInterval(() => {
        installAll();
        if (installed && typeof window.updateAppearancePreview === 'function') clearInterval(installTimer);
    }, 50);
    if (document.readyState === 'complete') installAll();
    else window.addEventListener('load', installAll, {once:true});
})();
