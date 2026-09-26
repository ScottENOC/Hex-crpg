// spriteRigging.js
// Sprite trim metadata + canonical composition anchors.
(() => {
    'use strict';

    const REQUIRED_TRIM_FIELDS = [
        'originalWidth', 'originalHeight', 'trimLeft', 'trimTop', 'trimWidth', 'trimHeight'
    ];

    function untrimmedMetadata(path) {
        return {
            path,
            originalWidth:null, originalHeight:null,
            trimLeft:0, trimTop:0,
            trimWidth:null, trimHeight:null,
        };
    }

    // Canonical human-female landmarks, normalised to the logical body rectangle
    // used by the directional renderer. Front-view silhouette x positions were
    // measured from body_front.png through the authored front crop at alpha >= 24.
    // Centre anchors and silhouette extents are deliberately separate concepts.
    const HUMAN_FEMALE_REFERENCE_RIGS = {
        front: {
            sprite:untrimmedMetadata('images/characters/human_female/body_front.png'),
            anchors:{
                scalpCenter:{x:0.500,y:0.105},
                hairAnchor:{x:0.500,y:0.125},
                helmetAnchor:{x:0.500,y:0.030},

                // Visible shoulder/body silhouette at y=.25.
                torsoShoulderLeft:{x:0.156,y:0.250},
                torsoShoulderRight:{x:0.843,y:0.250},
                // Top shoulder silhouette at y=.225; full-body armour top aligns here.
                armourShoulderTopLeft:{x:0.183,y:0.225},
                armourShoulderTopRight:{x:0.817,y:0.225},

                // Central torso run at the belt/waist row.
                torsoWaistLeft:{x:0.293,y:0.405},
                torsoWaistRight:{x:0.706,y:0.405},
                waistCenter:{x:0.500,y:0.405},

                // Central body/garment run at the pelvis row (excluding arms/hands).
                torsoHipLeft:{x:0.177,y:0.530},
                torsoHipRight:{x:0.819,y:0.530},

                // Palm/grip centres measured from the outer hand runs at y=.545.
                leftHand:{x:0.070,y:0.545},
                rightHand:{x:0.928,y:0.545},
                mainHandGrip:{x:0.070,y:0.545},
                offHandGrip:{x:0.928,y:0.545},
                offForearm:{x:0.873,y:0.442},
                backAnchor:{x:0.500,y:0.330},

                // Foot centre is an attachment landmark; sole is a silhouette extent.
                leftFoot:{x:0.310,y:0.965},
                rightFoot:{x:0.686,y:0.965},
                leftFootSole:{x:0.309,y:0.995},
                rightFootSole:{x:0.690,y:0.995},
            },
        },
        side: {
            sprite:untrimmedMetadata('images/characters/human_female/body_side.png'),
            anchors:{
                scalpCenter:{x:0.525,y:0.105}, hairAnchor:{x:0.525,y:0.130}, helmetAnchor:{x:0.525,y:0.030},
                torsoShoulderLeft:{x:0.460,y:0.250}, torsoShoulderRight:{x:0.560,y:0.250},
                armourShoulderTopLeft:{x:0.460,y:0.225}, armourShoulderTopRight:{x:0.560,y:0.225},
                torsoWaistLeft:{x:0.475,y:0.405}, torsoWaistRight:{x:0.545,y:0.405}, waistCenter:{x:0.505,y:0.405},
                torsoHipLeft:{x:0.465,y:0.530}, torsoHipRight:{x:0.555,y:0.530},
                leftHand:{x:0.490,y:0.520}, rightHand:{x:0.530,y:0.545},
                mainHandGrip:{x:0.530,y:0.545}, offHandGrip:{x:0.490,y:0.520}, offForearm:{x:0.500,y:0.440},
                backAnchor:{x:0.430,y:0.330},
                leftFoot:{x:0.485,y:0.965}, rightFoot:{x:0.535,y:0.965},
                leftFootSole:{x:0.485,y:0.995}, rightFootSole:{x:0.535,y:0.995},
            },
        },
        back: {
            sprite:untrimmedMetadata('images/characters/human_female/body_back.png'),
            anchors:{
                scalpCenter:{x:0.500,y:0.105}, hairAnchor:{x:0.500,y:0.125}, helmetAnchor:{x:0.500,y:0.030},
                torsoShoulderLeft:{x:0.215,y:0.250}, torsoShoulderRight:{x:0.785,y:0.250},
                armourShoulderTopLeft:{x:0.215,y:0.225}, armourShoulderTopRight:{x:0.785,y:0.225},
                torsoWaistLeft:{x:0.320,y:0.405}, torsoWaistRight:{x:0.680,y:0.405}, waistCenter:{x:0.500,y:0.405},
                torsoHipLeft:{x:0.285,y:0.530}, torsoHipRight:{x:0.715,y:0.530},
                leftHand:{x:0.920,y:0.545}, rightHand:{x:0.080,y:0.545},
                mainHandGrip:{x:0.920,y:0.545}, offHandGrip:{x:0.080,y:0.545}, offForearm:{x:0.127,y:0.442},
                backAnchor:{x:0.500,y:0.300},
                leftFoot:{x:0.695,y:0.965}, rightFoot:{x:0.305,y:0.965},
                leftFootSole:{x:0.695,y:0.995}, rightFootSole:{x:0.305,y:0.995},
            },
        },
    };

    const SPRITE_REFERENCE_RIGS = { human_female:HUMAN_FEMALE_REFERENCE_RIGS };

    const HUMAN_FEMALE_PREVIEW_LAYERS = {
        hair:{
            front:'images/characters/human_female/hair_brown_1_front.png',
            side:'images/characters/human_female/hair_brown_1_side.png',
            back:'images/characters/human_female/hair_brown_1_back.png',
        },
        helmet:'images/nasalHelm.png', weapon:'images/sword.png', shield:'images/shield.png',
    };

    const SPRITE_TRIM_METADATA_BY_PATH = {};
    function registerTrimMetadata(metadata) {
        if (metadata?.path) SPRITE_TRIM_METADATA_BY_PATH[metadata.path]=metadata;
        return metadata;
    }
    Object.values(HUMAN_FEMALE_REFERENCE_RIGS).forEach(rig=>registerTrimMetadata(rig.sprite));
    [
        'images/characters/human_female/body_broad_front.png',
        'images/characters/human_female/body_broad_side.png',
        'images/characters/human_female/body_broad_back.png',
        'images/characters/human_female/hair_brown_1_front.png',
        'images/characters/human_female/hair_brown_1_side.png',
        'images/characters/human_female/hair_brown_1_back.png',
        'images/characters/human_female/hair_braid_front.png',
        'images/characters/human_female/hair_braid_side.png',
        'images/characters/human_female/hair_braid_back.png',
        'images/characters/human_female/hair_curly_front.png',
        'images/characters/human_female/hair_curly_side.png',
        'images/characters/human_female/hair_curly_back.png',
    ].forEach(path=>registerTrimMetadata(untrimmedMetadata(path)));

    function resolveTrimMetadata(metadata,image) {
        const iw=image?.naturalWidth||image?.width||0, ih=image?.naturalHeight||image?.height||0;
        const originalWidth=metadata?.originalWidth??iw, originalHeight=metadata?.originalHeight??ih;
        const trimLeft=metadata?.trimLeft??0, trimTop=metadata?.trimTop??0;
        const trimWidth=metadata?.trimWidth??iw, trimHeight=metadata?.trimHeight??ih;
        const resolved={originalWidth,originalHeight,trimLeft,trimTop,trimWidth,trimHeight};
        if(![originalWidth,originalHeight,trimWidth,trimHeight].every(v=>Number.isFinite(v)&&v>0)) throw new Error('Sprite trim metadata requires positive resolved dimensions');
        if(![trimLeft,trimTop].every(v=>Number.isFinite(v)&&v>=0)) throw new Error('Sprite trim offsets must be non-negative numbers');
        if(trimLeft+trimWidth>originalWidth||trimTop+trimHeight>originalHeight) throw new Error('Sprite trim rectangle must fit inside the original canvas');
        return resolved;
    }

    function computeTrimAwareDestination(metadata,logicalBounds,image) {
        const trim=resolveTrimMetadata(metadata,image);
        const sx=logicalBounds.width/trim.originalWidth, sy=logicalBounds.height/trim.originalHeight;
        return {x:logicalBounds.x+trim.trimLeft*sx,y:logicalBounds.y+trim.trimTop*sy,width:trim.trimWidth*sx,height:trim.trimHeight*sy};
    }

    function drawTrimAwareSprite(ctx,image,metadata,x,y,width,height) {
        if(!ctx||!image)return null;
        const dest=computeTrimAwareDestination(metadata,{x,y,width,height},image);
        const rawDraw=(typeof CanvasRenderingContext2D!=='undefined')?CanvasRenderingContext2D.prototype.drawImage:ctx.drawImage;
        rawDraw.call(ctx,image,dest.x,dest.y,dest.width,dest.height);
        return dest;
    }

    function normaliseAssetPath(value) {
        if(!value)return '';
        const raw=String(value);
        try{return new URL(raw,typeof document!=='undefined'?document.baseURI:'http://local/').pathname.replace(/^\//,'');}
        catch(_){return raw.replace(/^\//,'').split('?')[0].split('#')[0];}
    }
    function sourcePathForImage(image){return normaliseAssetPath((image?.__recolorBaseSource||image)?.src);}
    function getTrimMetadataForImage(image){return SPRITE_TRIM_METADATA_BY_PATH[sourcePathForImage(image)]||null;}

    function drawTrimAwareCroppedSprite(nativeDraw,image,crop,dest,bounds,metadata=null) {
        if(typeof nativeDraw!=='function'||!image||!crop||!dest||!bounds)return false;
        const trimMetadata=metadata||getTrimMetadataForImage(image); if(!trimMetadata)return false;
        const trim=resolveTrimMetadata(trimMetadata,image);
        const iw=image.naturalWidth||image.width, ih=image.naturalHeight||image.height; if(!iw||!ih)return false;
        const cropPx={x:crop.x*trim.originalWidth,y:crop.y*trim.originalHeight,width:crop.w*trim.originalWidth,height:crop.h*trim.originalHeight};
        if(cropPx.width<=0||cropPx.height<=0)return true;
        const left=Math.max(cropPx.x,trim.trimLeft), top=Math.max(cropPx.y,trim.trimTop);
        const right=Math.min(cropPx.x+cropPx.width,trim.trimLeft+trim.trimWidth), bottom=Math.min(cropPx.y+cropPx.height,trim.trimTop+trim.trimHeight);
        if(right<=left||bottom<=top)return true;
        const physicalScaleX=iw/trim.trimWidth, physicalScaleY=ih/trim.trimHeight;
        const sx=(left-trim.trimLeft)*physicalScaleX, sy=(top-trim.trimTop)*physicalScaleY;
        const sw=(right-left)*physicalScaleX, sh=(bottom-top)*physicalScaleY;
        const destX=bounds.left+dest.x*bounds.width, destY=bounds.top+dest.y*bounds.height;
        const destW=dest.w*bounds.width, destH=dest.h*bounds.height;
        const dx=destX+((left-cropPx.x)/cropPx.width)*destW, dy=destY+((top-cropPx.y)/cropPx.height)*destH;
        const dw=((right-left)/cropPx.width)*destW, dh=((bottom-top)/cropPx.height)*destH;
        nativeDraw(image,sx,sy,sw,sh,dx,dy,dw,dh); return true;
    }

    function getReferenceRig(characterKey,direction){return SPRITE_REFERENCE_RIGS[characterKey]?.[direction]||null;}
    function getRigAnchor(characterKey,direction,anchorName,bounds){
        const point=getReferenceRig(characterKey,direction)?.anchors?.[anchorName]; if(!point)return null;
        if(!bounds)return {...point};
        return {x:bounds.x+point.x*bounds.width,y:bounds.y+point.y*bounds.height};
    }

    function suggestAlphaTrim(image,alphaThreshold=1) {
        if(!image||typeof document==='undefined')return null;
        const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!w||!h)return null;
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
        const data=ctx.getImageData(0,0,w,h).data;let minX=w,minY=h,maxX=-1,maxY=-1;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=alphaThreshold){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
        if(maxX<minX||maxY<minY)return null;
        return {originalWidth:w,originalHeight:h,trimLeft:minX,trimTop:minY,trimWidth:maxX-minX+1,trimHeight:maxY-minY+1};
    }

    window.SPRITE_TRIM_FIELDS=REQUIRED_TRIM_FIELDS;
    window.SPRITE_REFERENCE_RIGS=SPRITE_REFERENCE_RIGS;
    window.SPRITE_TRIM_METADATA_BY_PATH=SPRITE_TRIM_METADATA_BY_PATH;
    window.HUMAN_FEMALE_REFERENCE_RIGS=HUMAN_FEMALE_REFERENCE_RIGS;
    window.HUMAN_FEMALE_PREVIEW_LAYERS=HUMAN_FEMALE_PREVIEW_LAYERS;
    window.resolveSpriteTrimMetadata=resolveTrimMetadata;
    window.computeTrimAwareDestination=computeTrimAwareDestination;
    window.drawTrimAwareSprite=drawTrimAwareSprite;
    window.drawTrimAwareCroppedSprite=drawTrimAwareCroppedSprite;
    window.getSpriteTrimMetadataForImage=getTrimMetadataForImage;
    window.getSpriteReferenceRig=getReferenceRig;
    window.getSpriteRigAnchor=getRigAnchor;
    window.suggestSpriteAlphaTrim=suggestAlphaTrim;
    window.__humanFemaleReferenceRigVersion='measured-front-20260926';
})();
