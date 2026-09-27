// characterRenderer.js
// Single-owner character compositor. No drawImage interception, no renderer chaining.
//
// Migration rule: if a race/gender is not defined here, it intentionally renders
// nothing. Do not fall back to the legacy paper-doll renderer.
(() => {
    'use strict';

    const BUILD = 'unified-character-renderer-v1';
    const VALID_FACINGS = new Set(['up', 'down', 'left', 'right']);
    const previousHex = new WeakMap();
    const alphaTrimCache = new WeakMap();

    const HUMAN_FEMALE_PATHS = {
        body: {
            average: {
                front: 'images/characters/human_female/body_front.png',
                side: 'images/characters/human_female/body_side.png',
                back: 'images/characters/human_female/body_back.png',
            },
            broad: {
                front: 'images/characters/human_female/body_broad_front.png',
                side: 'images/characters/human_female/body_broad_side.png',
                back: 'images/characters/human_female/body_broad_back.png',
            },
        },
        hair: {
            brown_1: {
                front: 'images/characters/human_female/hair_brown_1_front.png',
                side: 'images/characters/human_female/hair_brown_1_side.png',
                back: 'images/characters/human_female/hair_brown_1_back.png',
            },
            braid: {
                front: 'images/characters/human_female/hair_braid_front.png',
                side: 'images/characters/human_female/hair_braid_side.png',
                back: 'images/characters/human_female/hair_braid_back.png',
            },
            curly: {
                front: 'images/characters/human_female/hair_curly_front.png',
                side: 'images/characters/human_female/hair_curly_side.png',
                back: 'images/characters/human_female/hair_curly_back.png',
            },
        },
    };

    // Each view is its own reference rig. Side is not derived by turning the
    // front rig; left-facing merely mirrors the authored side view.
    const HUMAN_FEMALE_RIGS = {
        front: {
            bodyCrop: { x:0.350, y:0.088, w:0.297, h:0.823 },
            bodyDest: { x:0.000, y:0.000, w:1.000, h:1.000 },
            hairCrop: { x:0.312, y:0.221, w:0.382, h:0.387 },
            hairDest: { x:0.220, y:-0.015, w:0.560, h:0.370 },
            anchors: {
                headTop:{x:0.50,y:0.035}, mainHand:{x:0.07,y:0.545}, offHand:{x:0.928,y:0.545},
                armourTop:{x:0.50,y:0.225}, armourBottom:{x:0.50,y:0.995}, armourCentre:{x:0.50,y:0.60},
            },
            armourScale: 1.00,
        },
        side: {
            bodyCrop: { x:0.431, y:0.092, w:0.148, h:0.822 },
            bodyDest: { x:0.250, y:0.000, w:0.500, h:1.000 },
            hairCrop: { x:0.303, y:0.250, w:0.403, h:0.431 },
            hairDest: { x:0.305, y:-0.010, w:0.390, h:0.405 },
            anchors: {
                headTop:{x:0.53,y:0.035}, mainHand:{x:0.62,y:0.555}, offHand:{x:0.43,y:0.555},
                armourTop:{x:0.52,y:0.225}, armourBottom:{x:0.52,y:0.925}, armourCentre:{x:0.52,y:0.57},
            },
            armourScale: 0.82,
        },
        back: {
            bodyCrop: { x:0.350, y:0.085, w:0.299, h:0.826 },
            bodyDest: { x:0.000, y:0.000, w:1.000, h:1.000 },
            hairCrop: { x:0.338, y:0.203, w:0.323, h:0.344 },
            hairDest: { x:0.220, y:-0.005, w:0.560, h:0.375 },
            anchors: {
                headTop:{x:0.50,y:0.035}, mainHand:{x:0.93,y:0.545}, offHand:{x:0.072,y:0.545},
                armourTop:{x:0.50,y:0.225}, armourBottom:{x:0.50,y:0.995}, armourCentre:{x:0.50,y:0.60},
            },
            armourScale: 1.00,
        },
    };

    const RENDERERS = {
        human_female: {
            bodyW: 1.60,
            bodyH: 1.92,
            yOff: -0.16,
            artAspect: 0.48,
            rigs: HUMAN_FEMALE_RIGS,
        },
    };

    const assets = { human_female: { body:{}, hair:{} } };

    function requestRepaint() {
        if (typeof window.drawMap === 'function') window.drawMap();
        if (typeof window.renderEntities === 'function') window.renderEntities();
        if (typeof window.refreshCharacterRendererPreviews === 'function') window.refreshCharacterRendererPreviews();
    }

    function loadImage(src) {
        if (typeof Image === 'undefined') return null;
        const img = new Image();
        img.addEventListener('load', requestRepaint, { once:true });
        img.src = src;
        return img;
    }

    for (const [bodyType, views] of Object.entries(HUMAN_FEMALE_PATHS.body)) {
        assets.human_female.body[bodyType] = {};
        for (const [view, src] of Object.entries(views)) assets.human_female.body[bodyType][view] = loadImage(src);
    }
    for (const [style, views] of Object.entries(HUMAN_FEMALE_PATHS.hair)) {
        assets.human_female.hair[style] = {};
        for (const [view, src] of Object.entries(views)) assets.human_female.hair[style][view] = loadImage(src);
    }

    function sourceReady(img) {
        return !!img && ((img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) || (img.width > 0 && img.height > 0));
    }
    function sourceWidth(img) { return img?.naturalWidth || img?.width || 0; }
    function sourceHeight(img) { return img?.naturalHeight || img?.height || 0; }

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function facingFromHexDelta(dq, dr) {
        if (!dq && !dr) return null;
        const dx = 1.5 * dq;
        const dy = Math.sqrt(3) * (dr + dq / 2);
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    function resolveFacing(entity) {
        if (!entity) return 'down';
        const current = entity.hex && Number.isFinite(entity.hex.q) && Number.isFinite(entity.hex.r)
            ? { q:entity.hex.q, r:entity.hex.r } : null;
        const old = previousHex.get(entity);
        if (current) {
            if (old) {
                const next = facingFromHexDelta(current.q - old.q, current.r - old.r);
                if (next) entity.facing = next;
                old.q = current.q; old.r = current.r;
            } else {
                previousHex.set(entity, current);
            }
        }
        if (!VALID_FACINGS.has(entity.facing)) entity.facing = 'down';
        return entity.facing;
    }

    function getAlphaTrim(img) {
        if (!sourceReady(img)) return null;
        if (alphaTrimCache.has(img)) return alphaTrimCache.get(img);
        const w = sourceWidth(img), h = sourceHeight(img);
        let trim = { x:0, y:0, width:w, height:h };
        try {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const c = canvas.getContext('2d', { willReadFrequently:true });
            c.drawImage(img, 0, 0);
            const data = c.getImageData(0, 0, w, h).data;
            let minX=w, minY=h, maxX=-1, maxY=-1;
            for (let y=0; y<h; y++) {
                for (let x=0; x<w; x++) {
                    if (data[(y*w+x)*4+3] <= 12) continue;
                    if (x<minX) minX=x; if (x>maxX) maxX=x;
                    if (y<minY) minY=y; if (y>maxY) maxY=y;
                }
            }
            if (maxX >= minX && maxY >= minY) trim = { x:minX, y:minY, width:maxX-minX+1, height:maxY-minY+1 };
        } catch (err) {
            console.warn('CharacterRenderer: alpha trim unavailable; using full image bounds', err);
        }
        alphaTrimCache.set(img, trim);
        return trim;
    }

    function point(bounds, p) {
        return { x:bounds.left + p.x*bounds.width, y:bounds.top + p.y*bounds.height };
    }

    // Rigid placement: one translation + one UNIFORM scale. No rotation,
    // skew, triangle mesh, strip deformation, or width/height fudge chain.
    function computeRigidPlacement(img, targetTop, targetBottom, targetCentreX, scaleMult=1, trimOverride=null) {
        const trim = trimOverride || getAlphaTrim(img);
        const iw = sourceWidth(img), ih = sourceHeight(img);
        if (!trim || !iw || !ih || !trim.height) return null;
        const targetHeight = Math.max(1, targetBottom - targetTop);
        const scale = (targetHeight / trim.height) * scaleMult;
        const visibleWidth = trim.width * scale;
        const visibleLeft = targetCentreX - visibleWidth/2;
        return {
            x: visibleLeft - trim.x*scale,
            y: targetTop - trim.y*scale,
            width: iw*scale,
            height: ih*scale,
            scale,
            visible: { left:visibleLeft, top:targetTop, width:visibleWidth, height:trim.height*scale },
            trim,
            transform: 'translate+uniform-scale',
        };
    }

    function drawCropped(ctx, img, crop, dest, bounds) {
        if (!sourceReady(img)) return false;
        const iw=sourceWidth(img), ih=sourceHeight(img);
        ctx.drawImage(img,
            crop.x*iw, crop.y*ih, crop.w*iw, crop.h*ih,
            bounds.left+dest.x*bounds.width, bounds.top+dest.y*bounds.height,
            dest.w*bounds.width, dest.h*bounds.height);
        return true;
    }

    function initialiseAppearance(entity) {
        const seed = entity.name || 'character';
        if (entity.hairStyle === undefined) {
            const styles = ['brown_1','braid','curly'];
            const n = window.hashStringToHue ? window.hashStringToHue(seed+'_hair_style') : 0;
            entity.hairStyle = styles[Math.abs(n)%styles.length];
        }
        if (entity.bodyType === undefined) {
            const n = window.hashStringToHue ? window.hashStringToHue(seed+'_body') : 0;
            entity.bodyType = Math.abs(n)%4 === 0 ? 'broad' : 'average';
        }
        if (entity.shirtHue === undefined && window.pickClothingHue) { entity.shirtHue=window.pickClothingHue(seed+'_shirt'); entity.clothingSatMult=0.85; }
        if (entity.pantsHue === undefined && window.pickClothingHue) { entity.pantsHue=window.pickClothingHue(seed+'_pants'); entity.clothingSatMult=0.85; }
        if (entity.skinHue === undefined && window.pickNaturalSkinTone) {
            const tone=window.pickNaturalSkinTone(seed+'_skin');
            entity.skinHue=tone.hue; entity.skinSaturation=tone.saturation; entity.skinLightness=tone.lightness;
        }
        if (entity.hairHue === undefined && window.pickHairPreset) {
            const p=window.pickHairPreset(seed+'_hair');
            entity.hairHue=p.hue; entity.hairLightMult=p.lightMult; entity.hairSatMult=p.satMult;
        }
    }

    function bodyImage(entity, view) {
        initialiseAppearance(entity);
        const source = assets.human_female.body[entity.bodyType]?.[view] || assets.human_female.body.average[view];
        if (!sourceReady(source)) return source;
        const clothesId=entity.equipped?.clothes;
        const clothesPreset=clothesId && window.CLOTHING_PRESETS?.[clothesId];
        const showClothes=!!clothesPreset && (window.clothingDisplayMode==='clothes' || !entity.equipped?.armor);
        const shirtHue=showClothes ? clothesPreset.shirtHue : entity.shirtHue;
        const pantsHue=showClothes ? clothesPreset.pantsHue : entity.pantsHue;
        const satMult=showClothes ? (clothesPreset.satMult ?? 1) : entity.clothingSatMult;
        const skin=window.getRecoloredSkinSprite
            ? window.getRecoloredSkinSprite(source,{hue:entity.skinHue,saturation:entity.skinSaturation,lightness:entity.skinLightness}) : source;
        return window.getRecoloredSprite ? window.getRecoloredSprite(skin,{shirtHue,pantsHue,satMult}) : skin;
    }

    function hairImage(entity, view) {
        initialiseAppearance(entity);
        const source=assets.human_female.hair[entity.hairStyle]?.[view] || assets.human_female.hair.brown_1[view];
        return window.getRecoloredCharacterHairSprite
            ? window.getRecoloredCharacterHairSprite(source,entity.hairHue,entity.hairLightMult,entity.hairSatMult)
            : (window.getRecoloredHairSprite ? window.getRecoloredHairSprite(source,entity.hairHue,entity.hairLightMult,entity.hairSatMult) : source);
    }

    function armourImage(entity) {
        const g=window.gameVisuals;
        if (!g || !entity.equipped?.armor) return null;
        let img=null;
        if (entity.equipped.armor==='light_armor') img=g.humanLight;
        else if (entity.equipped.armor==='medium_armor') img=g.humanMedium;
        else if (entity.equipped.armor==='heavy_armor') img=g.humanHeavy;
        if (img && entity.goldGear && window.getGoldTintedSprite) img=window.getGoldTintedSprite(img);
        return img;
    }

    function weaponSpec(id) {
        const g=window.gameVisuals;
        if (!id || !g || window.items?.[id]?.type!=='weapon') return null;
        if (id==='sword' || id==='sword_arrow_deflection') return {img:g.swordIcon,grip:{x:.50,y:.92},scale:.50};
        if (id==='dagger') return {img:g.swordIcon,grip:{x:.50,y:.92},scale:.36};
        if (id==='axe') return {img:g.axe,grip:{x:.50,y:.82},scale:.50};
        if (id==='spear') return {img:g.spear,grip:{x:.50,y:.88},scale:.55};
        if (id==='club') return {img:g.club,grip:{x:.50,y:.84},scale:.48};
        if (id==='bow') return {img:g.bow,grip:{x:.50,y:.50},scale:.50};
        return null;
    }

    function drawRigidSquareAtAnchor(ctx,img,anchor,size,grip,mirror=false) {
        if (!sourceReady(img)) return false;
        ctx.save();
        if (mirror) { ctx.translate(anchor.x,0); ctx.scale(-1,1); ctx.translate(-anchor.x,0); }
        ctx.drawImage(img,anchor.x-grip.x*size,anchor.y-grip.y*size,size,size);
        ctx.restore();
        return true;
    }

    function drawHumanFemale(ctx, entity, x, y, z=1, flyOff=0) {
        const cfg=RENDERERS.human_female;
        const facing=resolveFacing(entity);
        const view=facingToView(facing);
        const rig=cfg.rigs[view];
        const hs=window.hexSize || 32;
        const legacyW=cfg.bodyW*hs*z;
        const bodyH=cfg.bodyH*hs*z;
        const top=y-legacyW/2+cfg.yOff*hs*z+flyOff;
        const bodyW=bodyH*cfg.artAspect;
        const bounds={left:x-bodyW/2,top,width:bodyW,height:bodyH};
        const mirror=facing==='left';

        const body=bodyImage(entity,view);
        if (!sourceReady(body)) return false;

        ctx.save();
        if (mirror) { ctx.translate(x,0); ctx.scale(-1,1); ctx.translate(-x,0); }

        // Explicit z-order, owned only here.
        drawCropped(ctx,body,rig.bodyCrop,rig.bodyDest,bounds);

        const clothesId=entity.equipped?.clothes;
        const showClothes=!!(clothesId && window.CLOTHING_PRESETS?.[clothesId])
            && (window.clothingDisplayMode==='clothes' || !entity.equipped?.armor);
        const armour=showClothes ? null : armourImage(entity);
        if (sourceReady(armour)) {
            const topAnchor=point(bounds,rig.anchors.armourTop);
            const bottomAnchor=point(bounds,rig.anchors.armourBottom);
            const centre=point(bounds,rig.anchors.armourCentre);
            const placement=computeRigidPlacement(armour,topAnchor.y,bottomAnchor.y,centre.x,rig.armourScale);
            if (placement) ctx.drawImage(armour,placement.x,placement.y,placement.width,placement.height);
        }

        if (!entity.equipped?.helmet) {
            const hair=hairImage(entity,view);
            if (sourceReady(hair)) drawCropped(ctx,hair,rig.hairCrop,rig.hairDest,bounds);
        }

        const offId=entity.equipped?.offhand;
        if (offId && window.items?.[offId]?.type==='shield' && sourceReady(window.gameVisuals?.shield)) {
            const a=point(bounds,rig.anchors.offHand);
            const size=bodyH*.34;
            drawRigidSquareAtAnchor(ctx,window.gameVisuals.shield,a,size,{x:.50,y:.50},false);
        }

        const main=weaponSpec(entity.equipped?.weapon);
        if (main && sourceReady(main.img)) {
            const a=point(bounds,rig.anchors.mainHand);
            drawRigidSquareAtAnchor(ctx,main.img,a,bodyH*main.scale,main.grip,false);
        }
        const off=weaponSpec(offId);
        if (off && sourceReady(off.img)) {
            const a=point(bounds,rig.anchors.offHand);
            drawRigidSquareAtAnchor(ctx,off.img,a,bodyH*off.scale,off.grip,true);
        }

        if (entity.equipped?.helmet==='nasal_helm' && sourceReady(window.gameVisuals?.nasal_helm)) {
            let helm=window.gameVisuals.nasal_helm;
            if (entity.goldGear && window.getGoldTintedSprite) helm=window.getGoldTintedSprite(helm);
            const a=point(bounds,rig.anchors.headTop);
            const size=bodyH*.43;
            drawRigidSquareAtAnchor(ctx,helm,a,size,{x:.50,y:.08},false);
        }

        ctx.restore();

        entity.__characterRender = { build:BUILD, renderer:'unified', view, facing, bounds, mirrored:mirror, legacyFallback:false };
        return true;
    }

    function supports(entity) {
        return !!entity && `${entity.race}_${entity.gender}`==='human_female';
    }

    function draw(ctx, entity, x, y, z=1, flyOff=0) {
        if (!supports(entity)) {
            if (entity) entity.__characterRender={build:BUILD,renderer:'unified',migrated:false,legacyFallback:false};
            return false; // blank by design until migrated
        }
        return drawHumanFemale(ctx,entity,x,y,z,flyOff);
    }

    function install() {
        if (typeof window.drawPlayerCharacter !== 'function') return false;
        window.drawPlayerCharacter=draw;
        // Public config intentionally contains ONLY migrated renderers.
        window.CHAR_CONFIG={human_female:{bodyW:1.60,bodyH:1.92,yOff:-0.16}};
        window.__characterRendererInstalled=BUILD;
        return true;
    }

    window.CharacterRenderer={
        build:BUILD,
        draw,
        supports,
        install,
        facingFromHexDelta,
        facingToView,
        resolveFacing,
        getAlphaTrim,
        computeRigidPlacement,
        rigs:HUMAN_FEMALE_RIGS,
        assets,
        paths:HUMAN_FEMALE_PATHS,
        migrated:['human_female'],
    };

    if (!install()) {
        const timer=setInterval(() => { if (install()) clearInterval(timer); },25);
        setTimeout(() => clearInterval(timer),5000);
    }
})();
