// characterRig.js
// Unified humanoid presentation rig.
//
// Three deliberately separate concepts live here:
//   1. ARMOUR_RIGS: deformable shoulder/waist/hem mesh for fitted armour.
//   2. ATTACHMENT_RIGS: named points on each body (head, hands, forearm,
//      shoulders, back) used by rigid equipment and future animation/facing.
//   3. ITEM_GRIPS: the point inside a rigid item's artwork that is actually
//      held/attached. The item's grip is aligned to the body's named anchor.
//
// Rigid gear scales from BODY HEIGHT, never body width/area. Armour deforms.
// At tactical zoom (<0.55) armour falls back to the original single drawImage
// to retain the existing mobile LOD behaviour.

(() => {
    'use strict';

    const HUMAN_REFERENCE_BODY_H = 2.16;

    const ARMOUR_RIGS = {
        human_male:   { shoulderL:0.05, shoulderR:0.95, waistL:0.14, waistR:0.86, hemL:0.10, hemR:0.90, waistY:0.56 },
        human_female: { shoulderL:0.08, shoulderR:0.92, waistL:0.20, waistR:0.80, hemL:0.12, hemR:0.88, waistY:0.55 },
        elf_male:     { shoulderL:0.08, shoulderR:0.92, waistL:0.18, waistR:0.82, hemL:0.13, hemR:0.87, waistY:0.58 },
        elf_female:   { shoulderL:0.10, shoulderR:0.90, waistL:0.22, waistR:0.78, hemL:0.14, hemR:0.86, waistY:0.57 },
        dwarf_male:   { shoulderL:0.02, shoulderR:0.98, waistL:0.08, waistR:0.92, hemL:0.04, hemR:0.96, waistY:0.53 },
        dwarf_female: { shoulderL:0.03, shoulderR:0.97, waistL:0.10, waistR:0.90, hemL:0.05, hemR:0.95, waistY:0.53 },
        orc_male:     { shoulderL:0.02, shoulderR:0.98, waistL:0.11, waistR:0.89, hemL:0.06, hemR:0.94, waistY:0.55 },
        orc_female:   { shoulderL:0.04, shoulderR:0.96, waistL:0.14, waistR:0.86, hemL:0.08, hemR:0.92, waistY:0.55 },
        goblin_male:  { shoulderL:0.09, shoulderR:0.91, waistL:0.18, waistR:0.82, hemL:0.12, hemR:0.88, waistY:0.55 },
        goblin_female:{ shoulderL:0.10, shoulderR:0.90, waistL:0.21, waistR:0.79, hemL:0.14, hemR:0.86, waistY:0.55 },
        revenant_male:{ shoulderL:0.06, shoulderR:0.94, waistL:0.15, waistR:0.85, hemL:0.10, hemR:0.90, waistY:0.56 },
        revenant_female:{ shoulderL:0.08, shoulderR:0.92, waistL:0.19, waistR:0.81, hemL:0.12, hemR:0.88, waistY:0.55 },
        skeleton_male:{ shoulderL:0.08, shoulderR:0.92, waistL:0.18, waistR:0.82, hemL:0.12, hemR:0.88, waistY:0.56 },
        skeleton_female:{ shoulderL:0.10, shoulderR:0.90, waistL:0.21, waistR:0.79, hemL:0.14, hemR:0.86, waistY:0.55 },
    };

    const ATTACHMENT_DEFAULTS = {
        headTop:       { x:0.50, y:0.04 },
        headCentre:    { x:0.50, y:0.16 },
        shoulderLeft:  { x:0.22, y:0.28 },
        shoulderRight: { x:0.78, y:0.28 },
        back:          { x:0.50, y:0.34 },
        mainHand:      { x:0.36, y:0.64 },
        offHand:       { x:0.60, y:0.52 },
        forearm:       { x:0.65, y:0.43 },
    };

    // Initial anchor tuning for the first real directional body set. These are
    // normalized to the legacy body rectangle, not the source PNG canvas.
    // Left uses the side set mirrored in X, so only three views are authored.
    const DIRECTIONAL_ATTACHMENT_RIGS = {
        human_female: {
            front: {
                headTop:{x:0.50,y:0.03}, headCentre:{x:0.50,y:0.15},
                shoulderLeft:{x:0.36,y:0.25}, shoulderRight:{x:0.64,y:0.25},
                back:{x:0.50,y:0.34}, mainHand:{x:0.27,y:0.61},
                offHand:{x:0.73,y:0.61}, forearm:{x:0.68,y:0.49},
            },
            side: {
                headTop:{x:0.50,y:0.03}, headCentre:{x:0.53,y:0.15},
                shoulderLeft:{x:0.46,y:0.25}, shoulderRight:{x:0.56,y:0.25},
                back:{x:0.43,y:0.34}, mainHand:{x:0.62,y:0.62},
                offHand:{x:0.52,y:0.58}, forearm:{x:0.56,y:0.47},
            },
            right: {
                headTop:{x:0.50,y:0.03}, headCentre:{x:0.53,y:0.15},
                shoulderLeft:{x:0.46,y:0.25}, shoulderRight:{x:0.56,y:0.25},
                back:{x:0.43,y:0.34}, mainHand:{x:0.62,y:0.62},
                offHand:{x:0.52,y:0.58}, forearm:{x:0.56,y:0.47},
            },
            left: {
                headTop:{x:0.50,y:0.03}, headCentre:{x:0.47,y:0.15},
                shoulderLeft:{x:0.44,y:0.25}, shoulderRight:{x:0.54,y:0.25},
                back:{x:0.57,y:0.34}, mainHand:{x:0.38,y:0.62},
                offHand:{x:0.48,y:0.58}, forearm:{x:0.44,y:0.47},
            },
            back: {
                headTop:{x:0.50,y:0.03}, headCentre:{x:0.50,y:0.15},
                shoulderLeft:{x:0.64,y:0.25}, shoulderRight:{x:0.36,y:0.25},
                back:{x:0.50,y:0.30}, mainHand:{x:0.73,y:0.61},
                offHand:{x:0.27,y:0.61}, forearm:{x:0.32,y:0.49},
            },
        },
    };

    const ITEM_GRIPS = {
        sword:  { x:0.50, y:0.92 },
        axe:    { x:0.50, y:0.82 },
        spear:  { x:0.50, y:0.88 },
        club:   { x:0.50, y:0.84 },
        bow:    { x:0.50, y:0.50 },
        shield: { x:0.50, y:0.50 },
        helmet: { x:0.50, y:0.00 },
    };

    const goldArmourImages = new WeakSet();
    const goldHelmetImages = new WeakSet();
    let activeBody = null;

    function isBaseArmourImage(img) {
        const g = window.gameVisuals;
        return !!img && !!g && (img === g.humanLight || img === g.humanMedium || img === g.humanHeavy);
    }
    function isArmourImage(img) {
        return isBaseArmourImage(img) || (!!img && goldArmourImages.has(img));
    }
    function isHelmetImage(img) {
        const g = window.gameVisuals;
        return !!img && !!g && (img === g.nasal_helm || goldHelmetImages.has(img));
    }
    function weaponKindForImage(img) {
        const g = window.gameVisuals;
        if (!img || !g) return null;
        if (img === g.swordIcon) return 'sword';
        if (img === g.axe) return 'axe';
        if (img === g.spear) return 'spear';
        if (img === g.club) return 'club';
        if (img === g.bow) return 'bow';
        return null;
    }
    function isShieldImage(img) {
        return !!img && !!window.gameVisuals && img === window.gameVisuals.shield;
    }

    function getHeightScaleForKey(key) {
        const cfg = window.CHAR_CONFIG?.[key];
        if (!cfg?.bodyH) return 1;
        return cfg.bodyH / HUMAN_REFERENCE_BODY_H;
    }
    function computeRigidGearSize(key, baseSize, itemScale = 1) {
        return baseSize * getHeightScaleForKey(key) * itemScale;
    }

    function buildAttachmentRig(key) {
        const cfg = window.CHAR_CONFIG?.[key] || {};
        const armor = ARMOUR_RIGS[key];
        const rig = {};
        for (const [name, point] of Object.entries(ATTACHMENT_DEFAULTS)) rig[name] = { ...point };
        if (cfg.mainHand) rig.mainHand = { x:cfg.mainHand.x, y:cfg.mainHand.y };
        if (cfg.offHand) rig.offHand = { x:cfg.offHand.x, y:cfg.offHand.y };
        if (armor) {
            rig.shoulderLeft.x = armor.shoulderL + (0.5 - armor.shoulderL) * 0.32;
            rig.shoulderRight.x = armor.shoulderR - (armor.shoulderR - 0.5) * 0.32;
        }
        if (cfg.helm && cfg.bodyW && cfg.bodyH) {
            rig.headTop = {
                x: 0.5 + (cfg.helm.xOff || 0) / cfg.bodyW,
                y: (cfg.helm.yOff || 0) / cfg.bodyH,
            };
        }
        rig.headCentre = { x:rig.headTop.x, y:Math.max(rig.headTop.y + 0.12, 0.12) };
        rig.back = {
            x:(rig.shoulderLeft.x + rig.shoulderRight.x) / 2,
            y:Math.max(rig.shoulderLeft.y, rig.shoulderRight.y) + 0.08,
        };
        rig.forearm = {
            x:rig.offHand.x + (rig.shoulderRight.x - rig.offHand.x) * 0.35,
            y:rig.offHand.y + (rig.shoulderRight.y - rig.offHand.y) * 0.35,
        };
        return rig;
    }

    function getAttachmentRig(key) {
        const cfg = window.CHAR_CONFIG?.[key];
        if (!cfg) return null;
        if (!cfg.attachments) cfg.attachments = buildAttachmentRig(key);
        return cfg.attachments;
    }

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function getDirectionalAttachmentPoint(key, name) {
        const facing = window.__activeCharacterFacing;
        const views = DIRECTIONAL_ATTACHMENT_RIGS[key];
        if (!views || !facing) return null;
        const view = facingToView(facing);
        const raw = views[facing]?.[name] || views[view]?.[name];
        if (!raw) return null;
        if (views[facing]) return raw;
        return facing === 'left' ? { x:1-raw.x, y:raw.y } : raw;
    }

    function getAttachmentPoint(key, name, bounds) {
        const rig = getAttachmentRig(key);
        const point = getDirectionalAttachmentPoint(key, name) || rig?.[name];
        if (!point || !bounds) return null;
        return {
            x: bounds.left + point.x * bounds.width,
            y: bounds.top + point.y * bounds.height,
        };
    }

    function positionSquareByGrip(anchor, size, grip) {
        return {
            x: anchor.x - grip.x * size,
            y: anchor.y - grip.y * size,
            size,
        };
    }

    function attachmentIsBehindBody(key, anchorName) {
        if (!DIRECTIONAL_ATTACHMENT_RIGS[key]) return false;
        const facing = window.__activeCharacterFacing;
        if (facing === 'right') return anchorName === 'mainHand';
        if (facing === 'left') return anchorName === 'offHand' || anchorName === 'forearm';
        return false;
    }

    function drawRigidAttachment(ctx, nativeDrawImage, img, pos, key, anchorName) {
        const facing = window.__activeCharacterFacing;
        const mirror = facing === 'left' && !!DIRECTIONAL_ATTACHMENT_RIGS[key];
        const behind = attachmentIsBehindBody(key, anchorName) && activeBody;
        ctx.save();
        try {
            if (behind) {
                const x0 = activeBody.left + activeBody.width * 0.34;
                const y0 = activeBody.top + activeBody.height * 0.18;
                const w = activeBody.width * 0.32;
                const h = activeBody.height * 0.72;
                ctx.beginPath();
                ctx.rect(-100000, -100000, 200000, 200000);
                ctx.rect(x0, y0, w, h);
                ctx.clip('evenodd');
            }
            if (mirror) {
                const cx = pos.x + pos.size / 2;
                ctx.translate(cx, 0);
                ctx.scale(-1, 1);
                ctx.translate(-cx, 0);
            }
            nativeDrawImage(img, pos.x, pos.y, pos.size, pos.size);
        } finally {
            ctx.restore();
        }
    }

    function detectBodyKey(dw, dh) {
        const configs = window.CHAR_CONFIG || {};
        const hs = window.hexSize || 1, z = window.cameraZoom || 1;
        let bestKey = null, bestError = Infinity;
        for (const [key, cfg] of Object.entries(configs)) {
            if (!cfg?.bodyW || !cfg?.bodyH) continue;
            const ew = cfg.bodyW * hs * z, eh = cfg.bodyH * hs * z;
            const err = Math.abs(dw - ew) / ew + Math.abs(dh - eh) / eh;
            if (err < bestError) { bestError = err; bestKey = key; }
        }
        return bestError <= 0.03 ? bestKey : null;
    }

    function computeMeshPoints(rig, dx, dy, dw, dh) {
        return {
            shoulderL:{x:dx+rig.shoulderL*dw,y:dy}, shoulderR:{x:dx+rig.shoulderR*dw,y:dy},
            waistL:{x:dx+rig.waistL*dw,y:dy+rig.waistY*dh}, waistR:{x:dx+rig.waistR*dw,y:dy+rig.waistY*dh},
            hemL:{x:dx+rig.hemL*dw,y:dy+dh}, hemR:{x:dx+rig.hemR*dw,y:dy+dh},
        };
    }

    function affineFromTriangles(s0,s1,s2,d0,d1,d2) {
        const den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
        if (Math.abs(den)<1e-8) return null;
        const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
        const c=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
        const e=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
        const b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
        const d=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
        const f=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
        return {a,b,c,d,e,f};
    }
    function drawTriangle(ctx,nativeDrawImage,img,s0,s1,s2,d0,d1,d2) {
        const m=affineFromTriangles(s0,s1,s2,d0,d1,d2); if(!m)return;
        ctx.save(); ctx.beginPath(); ctx.moveTo(d0.x,d0.y);ctx.lineTo(d1.x,d1.y);ctx.lineTo(d2.x,d2.y);ctx.closePath();ctx.clip();
        ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f); nativeDrawImage(img,0,0); ctx.restore();
    }
    function drawWarpedArmour(ctx,nativeDrawImage,img,rig,dx,dy,dw,dh) {
        if(!img||!img.width||!img.height||!rig){nativeDrawImage(img,dx,dy,dw,dh);return;}
        const p=computeMeshPoints(rig,dx,dy,dw,dh),iw=img.width,ih=img.height,sy=rig.waistY*ih;
        const tl={x:0,y:0},tr={x:iw,y:0},wl={x:0,y:sy},wr={x:iw,y:sy},bl={x:0,y:ih},br={x:iw,y:ih};
        drawTriangle(ctx,nativeDrawImage,img,tl,tr,wr,p.shoulderL,p.shoulderR,p.waistR);
        drawTriangle(ctx,nativeDrawImage,img,tl,wr,wl,p.shoulderL,p.waistR,p.waistL);
        drawTriangle(ctx,nativeDrawImage,img,wl,wr,br,p.waistL,p.waistR,p.hemR);
        drawTriangle(ctx,nativeDrawImage,img,wl,br,bl,p.waistL,p.hemR,p.hemL);
    }

    function matchRaceRig(dw,dh) {
        const configs=window.CHAR_CONFIG||{},hs=window.hexSize||1,z=window.cameraZoom||1;
        let bestKey=null,bestError=Infinity;
        for(const [key,cfg] of Object.entries(configs)){
            if(!cfg?.armour||!ARMOUR_RIGS[key])continue;
            const ew=cfg.bodyW*hs*z*cfg.armour.wMult,eh=cfg.bodyH*hs*z-cfg.armour.topShift*hs*z;
            if(ew<=0||eh<=0)continue;
            const err=Math.abs(dw-ew)/ew+Math.abs(dh-eh)/eh;
            if(err<bestError){bestError=err;bestKey=key;}
        }
        return bestError<=0.06?bestKey:null;
    }

    function drawAttachmentDebug(ctx) {
        if (!window.charDebugMode || !activeBody) return;
        const names=['headTop','headCentre','shoulderLeft','shoulderRight','back','mainHand','offHand','forearm'];
        ctx.save(); ctx.font='8px monospace';
        names.forEach((name,i)=>{
            const p=getAttachmentPoint(activeBody.key,name,activeBody);
            if(!p)return;
            ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fillStyle=`hsl(${(i*47)%360} 90% 65%)`;ctx.fill();
            ctx.fillStyle='#fff';ctx.fillText(name,p.x+3,p.y-2);
        });
        ctx.restore();
    }

    function install() {
        if(window.__characterRigInstalled)return true;
        if(!window.mapCtx||!window.CHAR_CONFIG)return false;
        const ctx=window.mapCtx,nativeDrawImage=ctx.drawImage.bind(ctx);

        if(window.getGoldTintedSprite&&!window.getGoldTintedSprite.__characterRigWrapped){
            const originalGold=window.getGoldTintedSprite;
            const wrapped=function(img,...rest){
                const out=originalGold.call(this,img,...rest);
                if(isBaseArmourImage(img)&&out&&typeof out==='object')try{goldArmourImages.add(out);}catch(_){}
                if(img===window.gameVisuals?.nasal_helm&&out&&typeof out==='object')try{goldHelmetImages.add(out);}catch(_){}
                return out;
            };
            wrapped.__characterRigWrapped=true; window.getGoldTintedSprite=wrapped;
        }

        for(const key of Object.keys(window.CHAR_CONFIG)){
            const cfg=window.CHAR_CONFIG[key];
            if(ARMOUR_RIGS[key]&&cfg.armour)cfg.armour.mesh={...ARMOUR_RIGS[key]};
            cfg.rigHeightScale=getHeightScaleForKey(key);
            cfg.attachments=buildAttachmentRig(key);
        }

        ctx.drawImage=function(img,...args){
            if(args.length===4){
                let [dx,dy,dw,dh]=args;
                const weaponKind=weaponKindForImage(img);
                const bodyKey=detectBodyKey(dw,dh);

                if(bodyKey&&!isArmourImage(img)&&!isHelmetImage(img)&&!weaponKind&&!isShieldImage(img)){
                    activeBody={key:bodyKey,left:dx,top:dy,width:dw,height:dh,weaponCount:0};
                }

                if(isArmourImage(img)&&(window.cameraZoom||1)>=0.55){
                    const key=matchRaceRig(dw,dh),rig=key&&ARMOUR_RIGS[key];
                    if(rig){drawWarpedArmour(ctx,nativeDrawImage,img,rig,dx,dy,dw,dh);return;}
                }

                if(activeBody&&isHelmetImage(img)){
                    const anchor=getAttachmentPoint(activeBody.key,'headTop',activeBody);
                    if(anchor){
                        dx=anchor.x-dw*ITEM_GRIPS.helmet.x;
                        dy=anchor.y-dh*ITEM_GRIPS.helmet.y;
                        nativeDrawImage(img,dx,dy,dw,dh); drawAttachmentDebug(ctx); return;
                    }
                }

                if(activeBody&&(weaponKind||isShieldImage(img))){
                    const key=activeBody.key,cfg=window.CHAR_CONFIG[key],hs=window.hexSize||1,z=window.cameraZoom||1,basePixel=hs*z;
                    let itemScale=1,anchorName='mainHand',grip=ITEM_GRIPS[weaponKind||'shield'];

                    if(weaponKind){
                        const legacy=(cfg?.weaponSizeMult||1);
                        itemScale=legacy>0?(dw/basePixel)/legacy:1;
                        anchorName=activeBody.weaponCount++===0?'mainHand':'offHand';
                    }else{
                        const legacy=((cfg?.bodyW||1)*(cfg?.shieldSizeMult||1));
                        itemScale=legacy>0?(dw/basePixel)/legacy:1;
                        anchorName='forearm';
                    }

                    const size=computeRigidGearSize(key,basePixel,itemScale);
                    const anchor=getAttachmentPoint(key,anchorName,activeBody);
                    if(anchor){
                        const pos=positionSquareByGrip(anchor,size,grip);
                        drawRigidAttachment(ctx,nativeDrawImage,img,pos,key,anchorName); drawAttachmentDebug(ctx); return;
                    }
                }
            }
            nativeDrawImage(img,...args);
        };

        window.__characterRigInstalled=true; return true;
    }

    function scheduleInstall(){
        if(install())return; let attempts=0;
        const timer=setInterval(()=>{attempts++;if(install()||attempts>=50)clearInterval(timer);},100);
    }

    window.ARMOUR_RIGS=ARMOUR_RIGS;
    window.ATTACHMENT_DEFAULTS=ATTACHMENT_DEFAULTS;
    window.DIRECTIONAL_ATTACHMENT_RIGS=DIRECTIONAL_ATTACHMENT_RIGS;
    window.ITEM_GRIPS=ITEM_GRIPS;
    window.computeArmourMeshPoints=computeMeshPoints;
    window.drawWarpedArmour=drawWarpedArmour;
    window.getRigHeightScale=getHeightScaleForKey;
    window.computeRigidGearSize=computeRigidGearSize;
    window.getCharacterAttachmentRig=getAttachmentRig;
    window.getCharacterAttachmentPoint=getAttachmentPoint;
    window.positionSquareByGrip=positionSquareByGrip;
    window.installCharacterRig=install;

    if(document.readyState==='complete')scheduleInstall();
    else window.addEventListener('load',scheduleInstall,{once:true});
})();