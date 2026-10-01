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
    // Several humanoid rigs intentionally share the same authored hair paths.
    // Keep one HTMLImageElement per source so a failed request/retry cannot leave
    // one race's private copy broken while another copy of the same file succeeds.
    const rendererImageCache = new Map();
    let legacyDrawPlayerCharacter = null;
    let installed = false;
    let creatorLegacy = null;
    let portraitObserver = null;
    let portraitQueued = false;

    // All five playable races and both body presentations are compositor-owned.
    // bodyAssetMode is diagnostic metadata: it makes temporary art fallbacks explicit
    // without sending those characters back through the legacy all-in-one renderer.
    const CHARACTER_RIGS = {
        human_female: { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16, bodyAssetMode:'directional' },
        human_male:   { bodyW:1.70, bodyH:2.06, yOff:-0.17, heightScale:2.06/2.16, bodyAssetMode:'directional' },
        elf_female:   { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16, bodyAssetMode:'directional' },
        elf_male:     { bodyW:2.00, bodyH:2.40, yOff:-0.20, heightScale:2.40/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        dwarf_female: { bodyW:1.60, bodyH:1.92, yOff:-0.07, heightScale:1.92/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        dwarf_male:   { bodyW:1.60, bodyH:1.92, yOff:-0.07, heightScale:1.92/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        goblin_female:{ bodyW:1.45, bodyH:1.70, yOff:-0.12, heightScale:1.70/2.16, bodyAssetMode:'shared-directional-fallback', bodyRender:'visible-fit' },
        goblin_male:  { bodyW:1.50, bodyH:1.75, yOff:-0.12, heightScale:1.75/2.16, bodyAssetMode:'directional', bodyRender:'visible-fit' },
        orc_female:   { bodyW:1.85, bodyH:2.05, yOff:-0.15, heightScale:2.05/2.16, bodyAssetMode:'directional', bodyRender:'visible-fit' },
        orc_male:     { bodyW:1.90, bodyH:2.10, yOff:-0.15, heightScale:2.10/2.16, bodyAssetMode:'shared-directional-fallback', bodyRender:'visible-fit' },
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
        elf_female: {
            body: {
                average: {
                    front:'images/characters/elf_female/body_front.png',
                    side:'images/characters/elf_female/body_side.png',
                    back:'images/characters/elf_female/body_back.png',
                },
            },
            // Elf body art is deliberately bald; hair remains a separate layer.
            hair:null,
        },
        human_male: {
            body: {
                average: {
                    front:'images/characters/human_male/body_front.png',
                    side:'images/characters/human_male/body_side.png',
                    back:'images/characters/human_male/body_back.png',
                },
                broad: {
                    front:'images/characters/human_male/body_broad_front.png',
                    side:'images/characters/human_male/body_broad_side.png',
                    back:'images/characters/human_male/body_broad_back.png',
                },
            },
            // Hair choices are shared between genders; the body rig supplies placement.
            hair:null,
        },
        elf_male: {
            body: { average: {
                // No directional elf-male body has been authored yet. All three
                // facings deliberately use the surviving flat body until that art lands.
                front:'images/characters/elf_male/body.png',
                side:'images/characters/elf_male/body.png',
                back:'images/characters/elf_male/body.png',
            } },
            hair:null,
        },
        dwarf_female: {
            body: { average: {
                front:'images/characters/dwarf_female/body.png',
                side:'images/characters/dwarf_female/body.png',
                back:'images/characters/dwarf_female/body.png',
            } },
            hair:null,
        },
        dwarf_male: {
            body: { average: {
                front:'images/characters/dwarf_male/body.png',
                side:'images/characters/dwarf_male/body.png',
                back:'images/characters/dwarf_male/body.png',
            } },
            hair:null,
        },
        goblin_female: {
            body: { average: {
                front:'images/characters/goblin_female/body_front.png',
                side:'images/characters/goblin_female/body_side.png',
                back:'images/characters/goblin_female/body_back.png',
            } },
            hair:null,
        },
        goblin_male: {
            body: { average: {
                front:'images/characters/goblin_male/body_front.png',
                side:'images/characters/goblin_male/body_side.png',
                back:'images/characters/goblin_male/body_back.png',
            } },
            hair:null,
        },
        orc_female: {
            body: { average: {
                front:'images/characters/orc_female/body_front.png',
                side:'images/characters/orc_female/body_side.png',
                back:'images/characters/orc_female/body_back.png',
            } },
            hair:null,
        },
        orc_male: {
            body: { average: {
                front:'images/characters/orc_male/body_front.png',
                side:'images/characters/orc_male/body_side.png',
                back:'images/characters/orc_male/body_back.png',
            } },
            hair:null,
        },
    };

    // Hair is an appearance layer, never a race/gender permission. Every direct
    // playable humanoid can select every registered hairstyle; NPC generation
    // remains free to weight those styles differently.
    for (const paths of Object.values(CHARACTER_PATHS)) {
        if (!paths.hair) paths.hair = CHARACTER_PATHS.human_female.hair;
    }

    // Elf-female source art has different transparent framing from the human body sheets.
    const BODY_VISIBLE_TARGETS = {
        elf_female: {
            front:{x:.14,y:.01,w:.72,h:.98},
            side: {x:.30,y:.01,w:.40,h:.98},
            back: {x:.125,y:.005,w:.75,h:.99},
        },
    };

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
        back:{
            helmetAnchor:{x:0,y:-.025},
            armourY:-.010,
            // Front sword is lowered by .075 at the grip plus .096336564429012
            // at the held-item layer. Match that total in back view without
            // moving the measured attachment anchor or changing other weapons.
            heldItems:{sword:{inward:0,y:.171336564429012}},
        },
    };

    const ARMOUR_TARGETS = {
        // Slightly taller than the old .225-.995 envelope: cover collarbones
        // and toes without changing the approved widths or body-shape profile.
        front:{x:.03,y:.205,w:.94,h:.810},
        side: {x:.18,y:.205,w:.64,h:.810},
        // Rear-specific art should occupy the same visible envelope as front art.
        back: {x:.03,y:.205,w:.94,h:.810},
    };

    // Optional local width shaping. Values are multipliers relative to the
    // existing rigid armour fit; vertical placement, anchors and total height
    // remain unchanged. Side view stays rigid to avoid inventing depth.
    const ARMOUR_BODY_SHAPE_PROFILES = {
        human_female:{average:{shoulders:1.00,waist:1.02,hips:1.10},broad:{shoulders:1.04,waist:1.06,hips:1.14}},
        elf_female:  {average:{shoulders:.98,waist:1.00,hips:1.05}},
        human_male:  {average:{shoulders:1.08,waist:1.00,hips:.98},broad:{shoulders:1.12,waist:1.05,hips:1.00}},
    };
    window.ARMOUR_BODY_SHAPE_PROFILES = ARMOUR_BODY_SHAPE_PROFILES;

    // Human-female nasal helm sits halfway between the pre-reduction and current
    // reduced fit. Male rendering deliberately keeps the existing target.
    const HELMET_TARGETS = {
        human_female:{x:-.1873125,y:-.015,w:.374625,h:.2183},
        elf_female:{x:-.1873125,y:-.015,w:.374625,h:.2183},
        default:{x:-.172125,y:-.015,w:.34425,h:.2006},
    };
    const SHIELD_OPAQUE_HEIGHT_DROP = .10;

    const SHIELD_PATHS = {
        round:{front:'images/equipment/shields/round.png',back:'images/equipment/shields/round_back.svg'},
        kite:{front:'images/equipment/shields/kite.png',back:'images/equipment/shields/kite_back.png'},
    };

    // Armour is renderer-owned directional art, just like shields. Front and
    // side share the canonical high-quality front PNG; back uses the matching
    // rear WebP from the same organised equipment folder.
    const ARMOUR_PATHS = {
        light:{front:'images/equipment/armour/human/light.png',back:'images/equipment/armour/human/light_back.webp'},
        medium:{front:'images/equipment/armour/human/medium.png',back:'images/equipment/armour/human/medium_back.webp'},
        heavy:{front:'images/equipment/armour/human/heavy.png',back:'images/equipment/armour/human/heavy_back.webp'},
    };

    const REAR_EQUIPMENT_PATHS = {
        helmet:'images/equipment/helmets/nasal_helm_back.svg',
    };

    const ITEM_GRIPS = {
        sword:{x:.50,y:.92}, axe:{x:.50,y:.82}, spear:{x:.50,y:.88},
        club:{x:.50,y:.84}, bow:{x:.50,y:.50}, shield:{x:.50,y:.50},
        helmet:{x:.50,y:.00},
    };

    function keyFor(entity) {
        return entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
    }

    function equipmentSlotVisible(entity, slot) {
        return window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) !== false;
    }

    function usesApprovedHumanEquipmentBaseline(entity) {
        const key = keyFor(entity);
        return key === 'human_female' || key === 'human_male' || key === 'elf_female';
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
        if (!src) return null;
        if (rendererImageCache.has(src)) return rendererImageCache.get(src);
        const image = window.assetManager.request(src);
        rendererImageCache.set(src, image);
        window.assetManager.whenReady(src).then(() => {
            window.drawMap?.();
            window.renderEntities?.();
            queuePortraitRefresh();
            // The creator preview may have tried to draw while this image was
            // still deferred. Redraw it now rather than leaving a blank canvas
            // until the player happens to touch another appearance control.
            if (document.getElementById('appearance-preview-canvas')) {
                requestAnimationFrame(() => window.updateAppearancePreview?.());
            }
        }).catch((error) => {
            console.warn('Humanoid renderer art failed to load:', src, error);
            if (!rendererImageCache.get(`reported:${src}`)) {
                rendererImageCache.set(`reported:${src}`, true);
                window.showMessage?.(`Art asset failed to load: ${src.split('/').pop()} — ${error?.message || 'load failed'}`);
            }
        });
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
    const SHIELD_ASSETS = Object.fromEntries(Object.entries(SHIELD_PATHS)
        .map(([visual, paths]) => [visual, {front:loadImage(paths.front), back:loadImage(paths.back)}]));
    const ARMOUR_ASSETS = Object.fromEntries(Object.entries(ARMOUR_PATHS)
        .map(([tier, paths]) => [tier, {front:loadImage(paths.front), back:loadImage(paths.back)}]));
    const REAR_EQUIPMENT_ASSETS = {
        // Compatibility aliases for existing readiness checks and legacy consumers.
        shield:SHIELD_ASSETS.round.back,
        helmet:loadImage(REAR_EQUIPMENT_PATHS.helmet),
        armour:Object.fromEntries(Object.entries(ARMOUR_ASSETS)
            .map(([tier, views]) => [tier, views.back])),
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
        return window.getRecoloredSkinSprite
            ? window.getRecoloredSkinSprite(source, {hue:entity.skinHue,saturation:entity.skinSaturation,lightness:entity.skinLightness})
            : source;
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

    function frontHairOpaqueWidthFraction(frontImage) {
        const layout = DIRECTIONAL_LAYOUT.front;
        if (!layout || !imageReady(frontImage)) return layout?.hairDest?.w || .56;
        const trim = alphaTrim(frontImage);
        const iw = frontImage.naturalWidth || frontImage.width || 1;
        const cropLeft = layout.hairCrop.x * iw;
        const cropRight = (layout.hairCrop.x + layout.hairCrop.w) * iw;
        const trimLeft = trim.trimLeft;
        const trimRight = trim.trimLeft + trim.trimWidth;
        const visibleOpaque = Math.max(0, Math.min(trimRight, cropRight) - Math.max(trimLeft, cropLeft));
        const cropWidth = Math.max(1, layout.hairCrop.w * iw);
        return visibleOpaque ? layout.hairDest.w * (visibleOpaque / cropWidth) : layout.hairDest.w;
    }

    function tightDirectionalHairDestination(image, view, frontImage) {
        if (!imageReady(image)) return null;
        const trim = alphaTrim(image);
        const iw = image.naturalWidth || image.width || 1;
        const ih = image.naturalHeight || image.height || 1;
        const opaqueFraction = Math.max(.01, trim.trimWidth / iw);
        const wantedOpaqueWidth = frontHairOpaqueWidthFraction(frontImage);
        const w = wantedOpaqueWidth / opaqueFraction;
        const sourceAspect = iw / ih;
        const h = w * HUMAN_RENDER_ASPECT / Math.max(.01, sourceAspect);
        return {x:.5-w/2,y:view === 'back' ? -.005 : -.010,w,h};
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
        const authored = view === 'back' ? ARMOUR_ASSETS[tier]?.back : ARMOUR_ASSETS[tier]?.front;
        // The canonical organised pair is the normal rendering source. Keep the
        // compatibility preload as a temporary load-failure fallback only.
        const legacy = tier === 'heavy' ? visuals.humanHeavy : tier === 'medium' ? visuals.humanMedium : visuals.humanLight;
        let image = imageReady(authored) ? authored : legacy;
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
            const shieldSet = SHIELD_ASSETS[item.shieldVisual] || SHIELD_ASSETS.round;
            const front = imageReady(shieldSet?.front) ? shieldSet.front : window.gameVisuals?.shield;
            return {image:rearPreferred(view, shieldSet?.back, front),kind:'shield',scale:.73,itemId:id};
        }
        const spec = weaponSpec(id);
        return spec ? {...spec,itemId:id} : null;
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
        const equipmentSlot = slot === 'main' ? 'weapon' : 'offhand';
        if (!equipmentSlotVisible(entity, equipmentSlot)) return false;
        const spec = slotSpec(entity, slot, view);
        if (!spec) return false;
        const image = spec.kind === 'shield' ? spec.image : (window.equipmentAppearanceSystem?.resolveWeaponImage?.(entity, spec.itemId, spec.image, spec.kind) || spec.image);
        if (!imageReady(image)) return false;
        if (expectedLayer === 'shield' && spec.kind !== 'shield') return false;
        if (expectedLayer === 'weapon' && spec.kind === 'shield') return false;
        const anchorName = spec.kind === 'shield' ? 'offForearm' : (slot === 'main' ? 'mainHandGrip' : 'offHandGrip');
        const anchorPoint = spec.kind === 'shield'
            ? tunedAnchor(entity, view, anchorName)
            : tunedHeldItemAnchor(entity, view, anchorName, slot, spec.kind);
        if (!anchorPoint) return false;
        const anchor = point(bounds, anchorPoint);
        const grip = ITEM_GRIPS[spec.kind] || ITEM_GRIPS.sword;
        let drawWidth, drawHeight;
        if (spec.kind === 'shield') {
            // Shield art is not required to live on a square canvas. Treat the
            // configured scale as its displayed height and preserve the authored
            // aspect ratio so tightly cropped kite/tower shields stay narrow.
            drawHeight = bounds.width * spec.scale;
            const imageWidth = image.naturalWidth || image.width || 1;
            const imageHeight = image.naturalHeight || image.height || 1;
            drawWidth = drawHeight * imageWidth / imageHeight;
        } else {
            // Derive held-item size from the compositor bounds rather than the
            // world camera. World rendering is unchanged because those bounds
            // are themselves built from hexSize*z, while 100px initiative
            // portraits now scale weapons down with the character.
            const rig = CHARACTER_RIGS[keyFor(entity)];
            const bodyHeightUnits = rig?.bodyH || 1;
            const basePixel = bounds.height / bodyHeightUnits;
            drawHeight = basePixel * (rig?.heightScale || 1) * spec.scale;
            drawWidth = drawHeight;
        }

        let itemY = anchor.y - grip.y*drawHeight;
        if (spec.kind === 'shield') {
            const trim = alphaTrim(image);
            const opaqueHeight = trim?.trimHeight && trim?.originalHeight
                ? drawHeight * trim.trimHeight / trim.originalHeight
                : drawHeight;
            itemY += opaqueHeight * SHIELD_OPAQUE_HEIGHT_DROP;
        }

        const mirrorOffhandWeapon = slot === 'off' && spec.kind !== 'shield';
        if (mirrorOffhandWeapon) {
            // Mirror around the grip itself: the hilt stays on the off-hand anchor
            // while the weapon points the opposite way to the main-hand copy.
            ctx.save();
            ctx.translate(anchor.x, anchor.y);
            ctx.scale(-1, 1);
            ctx.drawImage(image, -grip.x*drawWidth, -grip.y*drawHeight, drawWidth, drawHeight);
            ctx.restore();
        } else {
            ctx.drawImage(image, anchor.x - grip.x*drawWidth, itemY, drawWidth, drawHeight);
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

    function armourWidthAt(profile, t) {
        const shoulderY=.18, waistY=.53, hipY=.84;
        const lerp=(a,b,u)=>a+(b-a)*Math.max(0,Math.min(1,u));
        if(t<=waistY) return lerp(profile.shoulders,profile.waist,(t-shoulderY)/(waistY-shoulderY));
        return lerp(profile.waist,profile.hips,(t-waistY)/(hipY-waistY));
    }

    function armourShapeProfile(entity, view) {
        if(view==='side') return null;
        const byBody=ARMOUR_BODY_SHAPE_PROFILES[keyFor(entity)];
        if(!byBody) return null;
        return entity.armourBodyShape || byBody[entity.bodyType || 'average'] || byBody.average || null;
    }

    function drawShapedArmourFit(ctx, image, bounds, target, profile) {
        if(!profile) return drawVisibleFit(ctx,image,bounds,target);
        const trim=alphaTrim(image);
        if(!trim?.trimWidth || !trim?.trimHeight) return false;
        const iw=image.naturalWidth||image.width, ih=image.naturalHeight||image.height;
        const targetLeft=bounds.left+target.x*bounds.width;
        const targetTop=bounds.top+target.y*bounds.height;
        const targetWidth=target.w*bounds.width;
        const targetHeight=target.h*bounds.height;
        const scaleX=targetWidth/trim.trimWidth, scaleY=targetHeight/trim.trimHeight;
        const outerW=iw*scaleX, outerH=ih*scaleY;
        const dx=targetLeft-trim.trimLeft*scaleX, dy=targetTop-trim.trimTop*scaleY;
        const cx=dx+outerW/2;
        const strips=32;
        for(let i=0;i<strips;i++){
            const sy=Math.floor(i*ih/strips), sy2=Math.ceil((i+1)*ih/strips), sh=Math.max(1,sy2-sy);
            const sourceMid=sy+sh/2;
            const t=Math.max(0,Math.min(1,(sourceMid-trim.trimTop)/trim.trimHeight));
            const widthScale=armourWidthAt(profile,t);
            const dw=outerW*widthScale;
            const destY=dy+(sy/ih)*outerH;
            const destH=(sh/ih)*outerH+.35;
            ctx.drawImage(image,0,sy,iw,sh,cx-dw/2,destY,dw,destH);
        }
        return {dx,dy,width:outerW,height:outerH,target:{left:targetLeft,top:targetTop,width:targetWidth,height:targetHeight},shapeProfile:{...profile}};
    }

    function drawArmour(ctx, entity, view, bounds) {
        const image = armourImage(entity, view);
        if (!imageReady(image)) return false;
        const baseTarget = ARMOUR_TARGETS[view] || ARMOUR_TARGETS.front;
        const armourY = usesApprovedHumanEquipmentBaseline(entity)
            ? (HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.armourY || 0)
            : 0;
        const target = armourY ? {...baseTarget,y:baseTarget.y+armourY} : baseTarget;
        const profile=armourShapeProfile(entity,view);
        const placement = drawShapedArmourFit(ctx, image, bounds, target, profile);
        if (placement) {
            window.__humanoidRendererLastArmour = {
                entity, view, ...placement,
                compositionSource:profile?'direct-horizontal-strip-width-profile':'direct-axis-aligned-scale-translate',
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
        // Clothing is optional decoration. Start its loads, but never let a
        // missing/slow garment suppress the body layer for the entire character.
        window.clothingSystem?.ensureDefaultOutfit?.(entity,{player:entity.side==='player'});
        window.clothingSystem?.preloadOutfit?.(entity,view);
        const sourceBody = (set?.body?.[bodyType] || set?.body?.average)?.[view];
        // A direct body image can be temporarily unavailable or permanently broken.
        // Do not claim an empty frame: decline it so the established renderer can
        // draw the character while the direct asset loads or recovers.
        if (!imageReady(sourceBody)) return false;

        const layout = DIRECTIONAL_LAYOUT[view];
        const hairStyle = entity.hairStyle || 'brown_1';
        const hairSet = set?.hair?.[hairStyle] || set?.hair?.brown_1;
        const sourceHair = hairSet?.[view] || set?.hair?.brown_1?.[view];
        const bodyImage = resolvedBodyImage(entity, sourceBody);
        const hairImage = resolvedHairImage(entity, sourceHair);
        const hasHelmet = !!entity.equipped?.helmet && equipmentSlotVisible(entity,'helmet');
        window.clothingSystem?.migrateLegacyEquipment?.(entity);
        const mirror = facing === 'left';
        const cx = bounds.left + bounds.width/2;
        const layerOrder = [];

        const drawShieldLayer = () => {
            let shieldDrawn = false;
            shieldDrawn = drawHeldItem(ctx, entity, view, bounds, 'off', 'shield') || shieldDrawn;
            shieldDrawn = drawHeldItem(ctx, entity, view, bounds, 'main', 'shield') || shieldDrawn;
            if (shieldDrawn) layerOrder.push('shield');
        };

        const drawWeaponLayer = () => {
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
            // Shield depth depends on the actual facing, not just the authored
            // front/side/back sprite view. Front + left expose the shield arm;
            // back + right put the shield behind the body/armour. Weapons retain
            // the existing rear-behind / front-and-side-foreground behaviour.
            const shieldBehindBody = view === 'back' || facing === 'right';
            if (shieldBehindBody) drawShieldLayer();
            if (view === 'back') drawWeaponLayer();

            const bodySource = imageReady(bodyImage) ? bodyImage : sourceBody;
            const bodyTarget = BODY_VISIBLE_TARGETS[key]?.[view];
            // Human directional sheets retain their measured crop. Rigs whose
            // source framing differs (and temporary one-view fallbacks) alpha-trim
            // then fit the visible body to the compositor bounds instead of forcing
            // them through human-specific crop coordinates.
            const useVisibleBodyFit = !!bodyTarget || CHARACTER_RIGS[key]?.bodyRender === 'visible-fit';
            const bodyDrawn = useVisibleBodyFit
                ? !!drawVisibleFit(ctx, bodySource, bounds, bodyTarget || {x:0,y:0,w:1,h:1})
                : drawCropped(ctx, bodySource, layout.bodyCrop, layout.bodyDest, bounds);
            if (bodyDrawn) layerOrder.push('body');
            for (const slot of ['underwear','bra','pants','shirt']) {
                if (window.clothingSystem?.drawSlot?.(ctx, entity, slot, view, bounds)) layerOrder.push(slot);
            }
            if (entity.displayArmour !== false && equipmentSlotVisible(entity,'armor') && entity.equipped?.armor && drawArmour(ctx, entity, view, bounds)) layerOrder.push('armour');
            if (typeof window.drawFacialHairLayer === 'function' && window.drawFacialHairLayer(ctx,entity,view,bounds)) layerOrder.push('facialHair');
            if (!hasHelmet && imageReady(hairImage)) {
                const tightDirectional = hairStyle === 'braid' && view !== 'front';
                const tightDest = tightDirectional
                    ? tightDirectionalHairDestination(sourceHair, view, hairSet?.front)
                    : null;
                const hairCrop = tightDest ? {x:0,y:0,w:1,h:1} : layout.hairCrop;
                const hairDest = tightDest || layout.hairDest;
                const hairDrawn = drawCropped(ctx, hairImage, hairCrop, hairDest, bounds);
                if (hairDrawn) layerOrder.push('hair');
                window.__humanoidRendererLastHair = {
                    style:hairStyle,
                    view,
                    tightDirectional:!!tightDest,
                    crop:{...hairCrop},
                    dest:{...hairDest},
                    sourceWidth:sourceHair?.naturalWidth || sourceHair?.width || 0,
                    sourceHeight:sourceHair?.naturalHeight || sourceHair?.height || 0,
                    drew:!!hairDrawn,
                };
            } else if (hasHelmet && drawHelmet(ctx, entity, view, bounds)) layerOrder.push('helmet');

            if (!shieldBehindBody) drawShieldLayer();
            if (view !== 'back') drawWeaponLayer();
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
            };
            const skin = window.getPlayerSkinToneFromControls?.();
            if (skin) Object.assign(preview, {skinHue:skin.hue,skinSaturation:skin.saturation,skinLightness:skin.lightness});
            preview.side='player';
            preview.displayArmour=true;
            preview.displayClothes=true;
            window.clothingSystem?.ensureDefaultOutfit?.(preview,{player:true});
            window.clothingSystem?.preloadOutfit?.(preview,'front');
            if (!canDirectRender(preview)) return creatorLegacy.apply(this, arguments);
            const canvas = document.getElementById('appearance-preview-canvas');
            if (!canvas) return creatorLegacy.apply(this, arguments);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height);
            const height = canvas.height*.90;
            const width = height*HUMAN_RENDER_ASPECT;
            const rendered = drawDirectionalHumanoidInBounds(ctx, preview, {left:(canvas.width-width)/2,top:(canvas.height-height)/2,width,height}, 'down');
            // Never turn a temporarily-unready direct sprite into an empty
            // preview. The legacy preview is a safe visual fallback while the
            // directional body finishes decoding; the ready callback above will
            // replace it as soon as the direct asset is available.
            if (!rendered) return creatorLegacy.apply(this, arguments);
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
            let canvas = portrait.querySelector('canvas[data-direct-humanoid-canvas="true"]');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width=100; canvas.height=100;
                canvas.dataset.directHumanoidCanvas='true';
                canvas.classList.add('portrait-layer');
                canvas.style.cssText='width:100%;height:100%;left:0;top:0;';
                portrait.insertBefore(canvas, portrait.firstChild);
            }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,100,100);
            const height=92,width=height*HUMAN_RENDER_ASPECT;
            const rendered = drawDirectionalHumanoidInBounds(ctx,entity,{left:(100-width)/2,top:4,width,height},'down');
            // Do not suppress the established IMG portrait until this frame has
            // actually drawn. Image decoding is asynchronous on iOS; tagging an
            // empty canvas as authoritative made the tracker blank even though
            // the same entity rendered correctly on the map a moment later.
            portrait.classList.toggle('direct-humanoid-ready', !!rendered);
            canvas.style.display = rendered ? 'block' : 'none';
            if (rendered) canvas.dataset.directHumanoid='true';
            else delete canvas.dataset.directHumanoid;
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
    window.DIRECT_HUMANOID_RIGS = CHARACTER_RIGS;
    window.DIRECT_HUMANOID_RIG_KEYS = Object.freeze(Object.keys(CHARACTER_RIGS));
    window.DIRECT_HUMANOID_BODY_STATUS = Object.freeze(Object.fromEntries(
        Object.entries(CHARACTER_RIGS).map(([key, rig]) => [key, rig.bodyAssetMode || 'directional'])
    ));
    window.DIRECTIONAL_CHARACTER_LAYOUT = DIRECTIONAL_LAYOUT;
    window.HUMAN_FEMALE_DIRECTIONAL_ASSETS = {
        body:CHARACTER_ASSETS.human_female.body.average,
        bodyTypes:CHARACTER_ASSETS.human_female.body,
        hair:CHARACTER_ASSETS.human_female.hair,
    };
    window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT = DIRECTIONAL_LAYOUT;
    window.ELF_FEMALE_DIRECTIONAL_ASSETS = {
        body:CHARACTER_ASSETS.elf_female.body.average,
        bodyTypes:CHARACTER_ASSETS.elf_female.body,
        hair:CHARACTER_ASSETS.elf_female.hair,
    };
    window.REAR_HUMAN_EQUIPMENT_ASSETS = REAR_EQUIPMENT_ASSETS;
    window.SHIELD_VISUAL_ASSETS = SHIELD_ASSETS;
    window.ARMOUR_VISUAL_ASSETS = ARMOUR_ASSETS;
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