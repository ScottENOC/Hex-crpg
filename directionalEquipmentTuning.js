// directionalEquipmentTuning.js
// Presentation-only fit tuning for human-female directional equipment.
//
// Armour placement follows an explicit landmark contract:
//   SOURCE top/bottom silhouette extents -> BODY armour-shoulder-top / foot-sole extents.
// Attachment centres (shoulder centre, foot centre, hand centre) are not used as
// silhouette edges. Horizontal shaping remains derived from body torso landmarks.

(() => {
    'use strict';

    const HUMAN_FEMALE_ARMOUR_CLEARANCE_X = 0.32;
    const ALPHA_THRESHOLD = 24;
    const MIN_ROW_OCCUPANCY_FRAC = 0.005;
    const MIN_COLUMN_OCCUPANCY_FRAC = 0.005;
    const FALLBACK_ARMOUR = { wMult:1.58, topShift:0.10, bottomDrop:0.08 };

    const goldArmourImages = new WeakSet();
    const measuredFits = new WeakMap();

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function spanFromAnchors(anchors, leftName, rightName, clearance = HUMAN_FEMALE_ARMOUR_CLEARANCE_X) {
        const a = anchors?.[leftName];
        const b = anchors?.[rightName];
        if (!a || !b) return null;
        const left = Math.max(0, Math.min(a.x, b.x) - clearance);
        const right = Math.min(1, Math.max(a.x, b.x) + clearance);
        return { left, right };
    }

    function deriveArmourRigFromBody(view) {
        const anchors = window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
        if (!anchors) return null;
        const shoulders = spanFromAnchors(anchors, 'torsoShoulderLeft', 'torsoShoulderRight');
        const waist = spanFromAnchors(anchors, 'torsoWaistLeft', 'torsoWaistRight');
        const hips = spanFromAnchors(anchors, 'torsoHipLeft', 'torsoHipRight');
        if (!shoulders || !waist || !hips) return null;
        return {
            shoulderL:shoulders.left, shoulderR:shoulders.right,
            waistL:waist.left, waistR:waist.right,
            hemL:hips.left, hemR:hips.right,
            waistY:(anchors.torsoWaistLeft.y + anchors.torsoWaistRight.y) / 2,
            source:'body-torso-anchors',
        };
    }

    function verticalBodyTarget(view) {
        const anchors = window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
        if (!anchors) return null;
        const topLeft = anchors.armourShoulderTopLeft || anchors.torsoShoulderLeft;
        const topRight = anchors.armourShoulderTopRight || anchors.torsoShoulderRight;
        const soleLeft = anchors.leftFootSole || anchors.leftFoot;
        const soleRight = anchors.rightFootSole || anchors.rightFoot;
        if (!topLeft || !topRight || !soleLeft || !soleRight) return null;

        const topY = (topLeft.y + topRight.y) / 2;
        const bottomY = Math.max(soleLeft.y, soleRight.y);
        if (!(bottomY > topY)) return null;
        return {
            topY,
            bottomY,
            shoulderY:topY,
            footY:bottomY,
            heightFrac:bottomY-topY,
            topAnchor:anchors.armourShoulderTopLeft ? 'armourShoulderTop' : 'torsoShoulder',
            bottomAnchor:anchors.leftFootSole ? 'footSole' : 'footCentre',
        };
    }

    function measureRobustAlphaBounds(image, alphaThreshold = ALPHA_THRESHOLD) {
        if (!image || typeof document === 'undefined') return null;
        const w=image.naturalWidth||image.width||0, h=image.naturalHeight||image.height||0;
        if (!w || !h) return null;
        const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d',{willReadFrequently:true}); if(!ctx)return null;
        try {
            ctx.drawImage(image,0,0);
            const data=ctx.getImageData(0,0,w,h).data;
            const rowCounts=new Uint32Array(h), colCounts=new Uint32Array(w);
            for(let y=0;y<h;y++){
                const rowBase=y*w*4;
                for(let x=0;x<w;x++){
                    if(data[rowBase+x*4+3] < alphaThreshold) continue;
                    rowCounts[y]++; colCounts[x]++;
                }
            }
            const minRowPixels=Math.max(3,Math.ceil(w*MIN_ROW_OCCUPANCY_FRAC));
            const minColPixels=Math.max(3,Math.ceil(h*MIN_COLUMN_OCCUPANCY_FRAC));
            let minY=0,maxY=h-1,minX=0,maxX=w-1;
            while(minY<h&&rowCounts[minY]<minRowPixels)minY++;
            while(maxY>=minY&&rowCounts[maxY]<minRowPixels)maxY--;
            while(minX<w&&colCounts[minX]<minColPixels)minX++;
            while(maxX>=minX&&colCounts[maxX]<minColPixels)maxX--;
            if(maxY<minY||maxX<minX)return null;
            return {
                originalWidth:w, originalHeight:h,
                trimLeft:minX, trimTop:minY,
                trimWidth:maxX-minX+1, trimHeight:maxY-minY+1,
                alphaThreshold,minRowPixels,minColPixels,method:'row-column-occupancy'
            };
        } catch (_) { return null; }
    }

    function sourceExtentRigFromTrim(trim) {
        if (!trim?.originalWidth || !trim?.originalHeight || !trim?.trimWidth || !trim?.trimHeight) return null;
        const centreX=(trim.trimLeft + trim.trimWidth/2) / trim.originalWidth;
        return {
            topExtent:{ x:centreX, y:trim.trimTop/trim.originalHeight },
            bottomExtent:{ x:centreX, y:(trim.trimTop+trim.trimHeight)/trim.originalHeight },
            leftExtent:{ x:trim.trimLeft/trim.originalWidth, y:(trim.trimTop+trim.trimHeight/2)/trim.originalHeight },
            rightExtent:{ x:(trim.trimLeft+trim.trimWidth)/trim.originalWidth, y:(trim.trimTop+trim.trimHeight/2)/trim.originalHeight },
            source:'measured-opaque-silhouette',
        };
    }

    function computeMeasuredArmourFit(image, view='front', trimOverride=null) {
        const cfg=getHumanFemaleConfig();
        const target=verticalBodyTarget(view);
        const iw=image?.naturalWidth||image?.width||0, ih=image?.naturalHeight||image?.height||0;
        if(!cfg||!target||!iw||!ih)return null;
        const rawTrim=typeof window.suggestSpriteAlphaTrim==='function' ? window.suggestSpriteAlphaTrim(image,8) : null;
        const trim=trimOverride||measureRobustAlphaBounds(image)||rawTrim;
        if(!trim?.trimHeight||!trim?.originalHeight||!trim?.originalWidth)return null;

        const sourceAnchors=sourceExtentRigFromTrim(trim);
        if(!sourceAnchors)return null;
        const sourceTopPx=sourceAnchors.topExtent.y * trim.originalHeight;
        const sourceBottomPx=sourceAnchors.bottomExtent.y * trim.originalHeight;
        const sourceVisibleHeightPx=sourceBottomPx-sourceTopPx;
        if(!(sourceVisibleHeightPx>0))return null;

        const targetVisibleHeight=cfg.bodyH*target.heightFrac;
        const scaleHexPerSourcePixel=targetVisibleHeight/sourceVisibleHeightPx;
        const outerHeight=trim.originalHeight*scaleHexPerSourcePixel;
        const outerWidth=trim.originalWidth*scaleHexPerSourcePixel;

        // Align SOURCE topExtent exactly to BODY armourShoulderTop, then the
        // uniform scale guarantees SOURCE bottomExtent lands on BODY footSole.
        const topShift=cfg.bodyH*target.topY-sourceTopPx*scaleHexPerSourcePixel;
        const visibleTop=topShift+sourceTopPx*scaleHexPerSourcePixel;
        const visibleBottom=topShift+sourceBottomPx*scaleHexPerSourcePixel;

        return {
            view,
            trim:{...trim}, rawTrim:rawTrim?{...rawTrim}:null,
            sourceAnchors,
            targetAnchors:{
                top:{ name:target.topAnchor, y:target.topY },
                bottom:{ name:target.bottomAnchor, y:target.bottomY },
            },
            target:{...target},
            targetVisibleHeight, outerHeight, outerWidth,
            wMult:outerWidth/cfg.bodyW,
            topShift,
            bottomDrop:outerHeight-cfg.bodyH+topShift,
            visibleTop, visibleBottom,
            source:'source-armour-extents-to-body-armour-extents',
        };
    }

    function getHumanFemaleConfig(){try{return typeof CHAR_CONFIG!=='undefined'?CHAR_CONFIG?.human_female:null;}catch(_){return null;}}
    function isBaseArmourImage(img){const g=window.gameVisuals;return !!img&&!!g&&(img===g.humanLight||img===g.humanMedium||img===g.humanHeavy);}
    function installGoldArmourTracking(){
        const current=window.getGoldTintedSprite;
        if(typeof current!=='function'||current.__humanFemaleMeasuredArmourTracking)return;
        const wrapped=function(img,...rest){const out=current.call(this,img,...rest);if(isBaseArmourImage(img)&&out&&typeof out==='object'){try{goldArmourImages.add(out);}catch(_){}}return out;};
        wrapped.__humanFemaleMeasuredArmourTracking=true; window.getGoldTintedSprite=wrapped;
    }
    function isTrackedArmourImage(img){return isBaseArmourImage(img)||(!!img&&goldArmourImages.has(img));}
    function isActiveHumanFemale(){const e=window.__activeCharacterEntity;return !!e&&e.race==='human'&&e.gender==='female';}
    function measuredFitFor(image,view){let byView=measuredFits.get(image);if(!byView){byView={};measuredFits.set(image,byView);}if(!byView[view])byView[view]=computeMeasuredArmourFit(image,view);return byView[view]||null;}

    function installMeasuredSizeWrapper(cfg){
        const ctx=window.mapCtx;
        if(!ctx||!window.__characterRigInstalled)return false;
        if(ctx.__humanFemaleMeasuredArmourSizeInstalled)return true;
        installGoldArmourTracking();
        const previousDrawImage=ctx.drawImage.bind(ctx);
        ctx.drawImage=function(img,...args){
            if(args.length===4&&isTrackedArmourImage(img)&&isActiveHumanFemale()){
                const view=facingToView(window.__activeCharacterFacing);
                const fit=measuredFitFor(img,view);
                if(fit){
                    const [legacyDx,legacyDy,legacyDw]=args;
                    const hsZ=(window.hexSize||1)*(window.cameraZoom||1);
                    const bodyWidthPx=cfg.bodyW*hsZ;
                    const centreX=legacyDx+legacyDw/2;
                    const bodyTop=legacyDy-(Number(cfg.armour?.topShift)||0)*hsZ;
                    const dw=fit.outerWidth*hsZ, dh=fit.outerHeight*hsZ;
                    const dx=centreX-dw/2, dy=bodyTop+fit.topShift*hsZ;
                    const savedWMult=cfg.armour.wMult,savedTopShift=cfg.armour.topShift,savedBottomDrop=cfg.armour.bottomDrop;
                    cfg.armour.wMult=dw/bodyWidthPx; cfg.armour.topShift=cfg.bodyH-dh/hsZ; cfg.armour.bottomDrop=0;
                    try{
                        const out=previousDrawImage(img,dx,dy,dw,dh);
                        window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour={...fit};
                        return out;
                    }finally{
                        cfg.armour.wMult=savedWMult; cfg.armour.topShift=savedTopShift; cfg.armour.bottomDrop=savedBottomDrop;
                    }
                }
            }
            return previousDrawImage(img,...args);
        };
        ctx.__humanFemaleMeasuredArmourSizeInstalled=true;
        return true;
    }

    function apply(){
        const cfg=getHumanFemaleConfig();
        const armourRig=window.ARMOUR_RIGS?.human_female;
        const directionalArmour=window.DIRECTIONAL_ARMOUR_RIGS?.human_female;
        const bodyRigs=window.HUMAN_FEMALE_REFERENCE_RIGS;
        if(!cfg||!armourRig||!directionalArmour||!bodyRigs||!window.__characterRigInstalled)return false;
        const derived={};
        for(const view of ['front','side','back']){
            const fit=deriveArmourRigFromBody(view); if(!fit)return false;
            derived[view]=fit; Object.assign(directionalArmour[view],fit);
        }
        Object.assign(armourRig,derived.front);
        cfg.armour={...(cfg.armour||{}),...FALLBACK_ARMOUR,mesh:{...derived.front}};
        window.HUMAN_FEMALE_EQUIPMENT_FIT={
            armour:{...cfg.armour},
            armourViews:{front:{...derived.front},side:{...derived.side},back:{...derived.back}},
            armourSource:'body-torso-anchors',
            armourScaleSource:'source-armour-extents-to-body-armour-extents',
            armourClearanceX:HUMAN_FEMALE_ARMOUR_CLEARANCE_X,
            targetVerticalByView:Object.fromEntries(['front','side','back'].map(view=>[view,verticalBodyTarget(view)])),
            helm:null,
        };
        if(!installMeasuredSizeWrapper(cfg))return false;
        cfg.helm={...(cfg.helm||{}),xOff:0,yOff:-0.32,sizeMult:1.48};
        window.HUMAN_FEMALE_EQUIPMENT_FIT.helm={...cfg.helm};
        const rigs=window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        if(rigs){for(const view of ['front','side','back'])if(rigs[view]?.headTop)rigs[view].headTop.x=0.5;}
        window.deriveHumanFemaleArmourRig=deriveArmourRigFromBody;
        window.measureHumanFemaleArmourAlphaBounds=measureRobustAlphaBounds;
        window.computeHumanFemaleArmourSourceExtentRig=sourceExtentRigFromTrim;
        window.computeHumanFemaleMeasuredArmourFit=computeMeasuredArmourFit;
        window.__directionalEquipmentFitTuningApplied=true;
        return true;
    }

    if(apply())return;
    const timer=setInterval(()=>{if(apply())clearInterval(timer);},25);
    setTimeout(()=>clearInterval(timer),10000);
})();
