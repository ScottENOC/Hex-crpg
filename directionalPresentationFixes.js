// directionalPresentationFixes.js
// Narrow presentation corrections layered on the direct humanoid compositor.
// This does not intercept Canvas APIs or replace the renderer. It normalises
// source sprites in the compositor's public asset registry before they are used.
(() => {
    'use strict';

    const BUILD = '20260928-character-presentation-v3';
    const processed = new WeakSet();
    let registryReady = false;
    let clothingAssetsRefreshed = false;

    const HAIR_STYLE_WIDTH = {
        braid: {front:1.22, side:1.12, back:1.20},
        curly: {front:1.06, side:1.04, back:1.06},
        brown_1: {front:1, side:1, back:1},
    };

    function imageReady(img) {
        return !!img && ((img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
            || (img.width > 0 && img.height > 0));
    }

    function sourceSize(img) {
        return {w: img?.naturalWidth || img?.width || 0, h: img?.naturalHeight || img?.height || 0};
    }

    function trimFor(img) {
        try {
            const trim = window.suggestSpriteAlphaTrim?.(img, 8);
            if (trim?.trimWidth && trim?.trimHeight) return trim;
        } catch (_) {}
        const {w,h} = sourceSize(img);
        return w && h ? {originalWidth:w,originalHeight:h,trimLeft:0,trimTop:0,trimWidth:w,trimHeight:h} : null;
    }

    function opaqueShareInsideCrop(img, crop) {
        if (!imageReady(img) || !crop) return 1;
        const {w,h} = sourceSize(img);
        if (!w || !h) return 1;
        try {
            const probe = document.createElement('canvas');
            probe.width = w;
            probe.height = h;
            const ctx = probe.getContext('2d', {willReadFrequently:true});
            ctx.drawImage(img,0,0);
            const pixels = ctx.getImageData(0,0,w,h).data;
            const x0 = Math.floor(crop.x*w), y0 = Math.floor(crop.y*h);
            const x1 = Math.ceil((crop.x+crop.w)*w), y1 = Math.ceil((crop.y+crop.h)*h);
            let total=0, inside=0;
            for (let y=0; y<h; y+=2) {
                for (let x=0; x<w; x+=2) {
                    if (pixels[(y*w+x)*4+3] < 8) continue;
                    total++;
                    if (x>=x0 && x<x1 && y>=y0 && y<y1) inside++;
                }
            }
            return total ? inside/total : 0;
        } catch (_) {
            return 1;
        }
    }

    function packIntoCrop(source, crop, {mirror=false, pad=0.02, tag='packed', widthScale=1}={}) {
        if (!imageReady(source) || !crop) return source;
        const trim = trimFor(source);
        if (!trim) return source;
        const {w,h} = sourceSize(source);
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        out.src = `${source.src || 'canvas'}#${BUILD}-${tag}`;
        out.__presentationPacked = true;

        const targetX = (crop.x + crop.w*pad) * w;
        const targetY = (crop.y + crop.h*pad) * h;
        const targetW = crop.w * (1-pad*2) * w;
        const targetH = crop.h * (1-pad*2) * h;
        const scale = Math.min(targetW/trim.trimWidth, targetH/trim.trimHeight);
        const baseDw = trim.trimWidth*scale;
        const dw = baseDw * widthScale;
        const dh = trim.trimHeight*scale;
        const dx = targetX + (targetW-dw)/2;
        const dy = targetY + (targetH-dh)/2;
        const ctx = out.getContext('2d');
        ctx.save();
        if (mirror) {
            ctx.translate(dx+dw,0);
            ctx.scale(-1,1);
            ctx.drawImage(source,trim.trimLeft,trim.trimTop,trim.trimWidth,trim.trimHeight,0,dy,dw,dh);
        } else {
            ctx.drawImage(source,trim.trimLeft,trim.trimTop,trim.trimWidth,trim.trimHeight,dx,dy,dw,dh);
        }
        ctx.restore();
        processed.add(out);
        return out;
    }

    function normaliseBodySlot(bodySlot, view, crop) {
        const source = bodySlot?.[view];
        if (!source || processed.has(source)) return;
        if (!imageReady(source)) {
            source.addEventListener?.('load', () => normaliseBodySlot(bodySlot,view,crop), {once:true});
            return;
        }
        processed.add(source);
        const share = opaqueShareInsideCrop(source,crop);
        if (share < 0.72) {
            bodySlot[view] = packIntoCrop(source,crop,{pad:0.015,tag:`body-${view}`});
        }
    }

    function normaliseHairSlot(hairSlot, style, view, crop) {
        const source = hairSlot?.[view];
        if (!source || processed.has(source)) return;
        if (!imageReady(source)) {
            source.addEventListener?.('load', () => normaliseHairSlot(hairSlot,style,view,crop), {once:true});
            return;
        }
        processed.add(source);
        // Screenshot validation showed the authored side asset already matches the
        // canonical body-side direction. The previous v2 pass mirrored it here,
        // which made the character read as if the back of the head faced us.
        // Leave canonical side hair untouched; the compositor itself mirrors the
        // whole character for the opposite facing.
        const widthScale = HAIR_STYLE_WIDTH[style]?.[view] || 1;
        hairSlot[view] = packIntoCrop(source,crop,{mirror:false,pad:0.01,widthScale,tag:`hair-${style}-${view}`});
    }

    function normaliseDirectionalAssets() {
        const assets = window.DIRECTIONAL_CHARACTER_ASSETS;
        const layout = window.DIRECTIONAL_CHARACTER_LAYOUT;
        if (!assets || !layout) return false;

        const supported = ['human_female','human_male','elf_female'];
        for (const key of supported) {
            const set = assets[key];
            if (!set) continue;
            for (const bodySlot of Object.values(set.body || {})) {
                for (const view of ['front','side','back']) normaliseBodySlot(bodySlot,view,layout[view]?.bodyCrop);
            }
            for (const [style,hairSlot] of Object.entries(set.hair || {})) {
                for (const view of ['front','side','back']) normaliseHairSlot(hairSlot,style,view,layout[view]?.hairCrop);
            }
        }

        if (!registryReady) {
            if (layout.front?.hairDest) Object.assign(layout.front.hairDest,{y:-0.055,h:0.425});
            if (layout.side?.hairDest) Object.assign(layout.side.hairDest,{y:-0.050,h:0.445});
            if (layout.back?.hairDest) Object.assign(layout.back.hairDest,{y:-0.045,h:0.420});
            registryReady = true;
        }
        return true;
    }

    function hash(seed) {
        let h=2166136261;
        for (const ch of String(seed)) { h^=ch.charCodeAt(0); h=Math.imul(h,16777619); }
        return h>>>0;
    }

    function npcRegionKey(entity) {
        if (entity.regionId) return entity.regionId;
        if (entity.homeRegion) return entity.homeRegion;
        if (entity.settlementId) return entity.settlementId;
        if (entity.factionId) return entity.factionId;
        const q = Number(entity.hex?.q || 0), r = Number(entity.hex?.r || 0);
        return `sector:${Math.floor(q/12)},${Math.floor(r/12)}`;
    }

    function applyNpcAppearance(entity) {
        if (!entity || entity.__regionalAppearanceV2) return;
        if (!(entity.isNPC || entity.aiControlled) || entity.side === 'enemy' && !entity.isNPC) return;
        if (!['human','elf','dwarf'].includes(entity.race)) return;
        if (entity.lockAppearance || entity.authoredAppearance) return;

        const region = npcRegionKey(entity);
        const identity = `${region}:${entity.name || entity.title || 'npc'}`;
        const regionalShirt = window.pickClothingHue?.(`region:${region}:shirt`);
        const personalShirt = window.pickClothingHue?.(`${identity}:shirt`);
        const regionalPants = window.pickClothingHue?.(`region:${region}:pants`);
        const personalPants = window.pickClothingHue?.(`${identity}:pants`);
        const localBias = (hash(identity)%100) < 42;
        if (Number.isFinite(regionalShirt) || Number.isFinite(personalShirt)) entity.shirtHue = localBias ? regionalShirt : personalShirt;
        if (Number.isFinite(regionalPants) || Number.isFinite(personalPants)) entity.pantsHue = localBias ? personalPants : regionalPants;
        if (entity.pantsHue === entity.shirtHue && window.pickClothingHue) entity.pantsHue = window.pickClothingHue(`${identity}:pants-alt`);
        entity.clothingSatMult = 0.72 + (hash(`${identity}:sat`)%24)/100;

        const hair = window.pickHairPreset?.(`${identity}:hair`);
        if (hair) {
            entity.hairHue = hair.hue;
            entity.hairLightMult = hair.light ?? 1;
            entity.hairSatMult = hair.sat ?? 1;
        }
        const styles = entity.gender === 'female' ? ['brown_1','braid','curly'] : ['brown_1','curly','brown_1'];
        entity.hairStyle = styles[hash(`${identity}:style`)%styles.length];
        entity.__regionalAppearanceV2 = true;
    }

    function applyNpcAppearances() {
        for (const entity of window.entities || []) applyNpcAppearance(entity);
    }

    function ensureFemaleBaseRecolor() {
        if (window.__femaleBaseClothingRecolorV2Installed || document.querySelector('script[data-female-base-clothing-recolor-v2]')) return;
        const script=document.createElement('script');
        script.src=`femaleBaseClothingRecolor.js?build=${BUILD}`;
        script.async=false;
        script.dataset.femaleBaseClothingRecolorV2='true';
        document.head.appendChild(script);
    }

    function ensureClothingSystem() {
        if (window.CLOTHING_VISUALS || document.querySelector('script[data-clothing-system-loader]')) return;
        const script=document.createElement('script');
        script.src=`clothingSystem.js?build=${BUILD}`;
        script.async=false;
        script.dataset.clothingSystemLoader='true';
        document.head.appendChild(script);
    }

    function refreshClothingAssets() {
        const target = window.CLOTHING_ASSETS?.traveler_garb;
        if (!target || clothingAssetsRefreshed) return false;
        const paths = {
            front:'images/equipment/clothing/traveler_garb_front.svg',
            side:'images/equipment/clothing/traveler_garb_side.svg',
            back:'images/equipment/clothing/traveler_garb_back.svg',
        };
        for (const [view,path] of Object.entries(paths)) {
            const img = new Image();
            img.addEventListener('load', () => { window.drawMap?.(); window.renderEntities?.(); });
            img.src = `${path}?build=${BUILD}`;
            target[view] = img;
        }
        clothingAssetsRefreshed = true;
        return true;
    }

    function install() {
        ensureFemaleBaseRecolor();
        ensureClothingSystem();
        normaliseDirectionalAssets();
        applyNpcAppearances();
        refreshClothingAssets();
        window.drawMap?.();
        window.refreshDirectionalTurnPortraits?.();
    }

    window.normaliseDirectionalPresentationAssets = normaliseDirectionalAssets;
    window.applyNpcRegionalAppearance = applyNpcAppearance;
    window.__directionalPresentationFixesBuild = BUILD;

    install();
    const timer=setInterval(() => {
        install();
        if (registryReady && window.CLOTHING_VISUALS && clothingAssetsRefreshed && window.__femaleBaseClothingRecolorV2Installed) {
            clearInterval(timer);
            setInterval(applyNpcAppearances,1000);
        }
    },100);
})();