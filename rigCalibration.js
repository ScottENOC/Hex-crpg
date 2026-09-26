// rigCalibration.js
// Production bridge from canonical sprite landmarks to characterRig attachment points.
// This module contains no debug UI and does not own any coordinates itself.
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

    window.syncHumanFemaleAttachmentsFromCanonicalRig=syncHumanFemaleAttachments;
    if(syncHumanFemaleAttachments())return;
    let attempts=0;
    const timer=setInterval(()=>{
        attempts++;
        if(syncHumanFemaleAttachments()||attempts>=200)clearInterval(timer);
    },25);
})();
