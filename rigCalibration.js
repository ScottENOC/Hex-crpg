// rigCalibration.js
// Production bridge from canonical sprite landmarks to characterRig attachment points.
// Also records the actual directional human-female body draw rectangle and the
// canvas transform active when that body was drawn, so debug overlays can render
// source/target landmarks in the same screen space.
(() => {
    'use strict';

    function copyPoint(p){return p?{x:Number(p.x),y:Number(p.y)}:null;}

    function syncHumanFemaleAttachments(){
        const refs=window.HUMAN_FEMALE_REFERENCE_RIGS;
        const target=window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        if(!refs||!target)return false;

        for(const view of ['front','side','back']){
            const a=refs[view]?.anchors;
            if(!a||!target[view])return false;
            Object.assign(target[view],{
                headTop:copyPoint(a.helmetAnchor),
                headCentre:copyPoint(a.scalpCenter),
                shoulderLeft:copyPoint(a.torsoShoulderLeft),
                shoulderRight:copyPoint(a.torsoShoulderRight),
                back:copyPoint(a.backAnchor),
                mainHand:copyPoint(a.mainHandGrip),
                offHand:copyPoint(a.offHandGrip),
                forearm:copyPoint(a.offForearm),
            });
        }
        window.HUMAN_FEMALE_ANATOMY=Object.fromEntries(['front','side','back'].map(view=>[view,refs[view].anchors]));
        window.__humanFemaleReferenceRigCalibrated=true;
        window.__humanFemaleAttachmentRigSource='canonical-sprite-rig';
        return true;
    }

    function sourcePath(img){
        const source=img?.__recolorBaseSource||img;
        return String(source?.src||'').split('?')[0].toLowerCase();
    }
    function femaleBodyView(img){
        const match=sourcePath(img).match(/\/human_female\/body_(?:broad_)?(front|side|back)\.png$/);
        return match?.[1]||null;
    }
    function destinationRect(args){
        if(args.length===4)return {left:+args[0],top:+args[1],width:+args[2],height:+args[3]};
        if(args.length===8)return {left:+args[4],top:+args[5],width:+args[6],height:+args[7]};
        return null;
    }
    function copyTransform(ctx){
        if(typeof ctx?.getTransform!=='function')return {a:1,b:0,c:0,d:1,e:0,f:0};
        const m=ctx.getTransform();
        return {a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f};
    }

    function installBodyBoundsObserver(){
        const proto=window.CanvasRenderingContext2D?.prototype;
        if(!proto?.drawImage)return false;
        if(proto.drawImage.__humanFemaleBodyBoundsObserved)return true;
        const previous=proto.drawImage;
        const observed=function(img,...args){
            const view=femaleBodyView(img);
            if(view && (!window.mapCtx || this===window.mapCtx)){
                const rect=destinationRect(args);
                if(rect && rect.width>0 && rect.height>0){
                    window.__humanFemaleLastBodyDraw={
                        view,...rect,
                        transform:copyTransform(this),
                        timestamp:performance.now()
                    };
                }
            }
            return previous.call(this,img,...args);
        };
        observed.__humanFemaleBodyBoundsObserved=true;
        observed.__humanFemaleBodyBoundsPrevious=previous;
        proto.drawImage=observed;
        window.__humanFemaleBodyBoundsObserverInstalled=true;
        return true;
    }

    window.syncHumanFemaleAttachmentsFromCanonicalRig=syncHumanFemaleAttachments;
    window.installHumanFemaleBodyBoundsObserver=installBodyBoundsObserver;
    installBodyBoundsObserver();

    if(!syncHumanFemaleAttachments()){
        let attempts=0;
        const timer=setInterval(()=>{
            attempts++;
            if(syncHumanFemaleAttachments()||attempts>=200)clearInterval(timer);
        },25);
    }
})();
