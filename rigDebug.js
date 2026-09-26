// rigDebug.js
// Optional visual diagnostics for directional character rigging.
// IMPORTANT: this module is display-only. It must never mutate production rig data.
(() => {
    'use strict';

    const KEY_ANCHORS='rpg_show_rig_anchors';
    const KEY_ARMOUR='rpg_show_armour_width_debug';
    window.showRigAnchors=localStorage.getItem(KEY_ANCHORS)==='true';
    window.showArmourWidthDebug=localStorage.getItem(KEY_ARMOUR)==='true';
    window.charDebugMode=false;

    function setShowRigAnchors(enabled){
        window.showRigAnchors=!!enabled;
        localStorage.setItem(KEY_ANCHORS,enabled?'true':'false');
        syncUI();
    }
    function setShowArmourWidthDebug(enabled){
        window.showArmourWidthDebug=!!enabled;
        localStorage.setItem(KEY_ARMOUR,enabled?'true':'false');
        syncUI(); updateDiagnosticPanel();
    }
    window.setShowRigAnchors=setShowRigAnchors;
    window.setShowArmourWidthDebug=setShowArmourWidthDebug;

    function syncUI(){
        const a=document.getElementById('graphics-show-rig-anchors'); if(a)a.checked=!!window.showRigAnchors;
        const w=document.getElementById('graphics-show-armour-width-debug'); if(w)w.checked=!!window.showArmourWidthDebug;
    }

    function installSettingsControls(){
        if(document.getElementById('graphics-show-rig-anchors')){syncUI();return true;}
        const foliage=document.getElementById('graphics-foliage-detail');
        const group=foliage?.closest('.form-group'); if(!group?.parentElement)return false;
        const heading=document.createElement('h3'); heading.textContent='Rig Debug'; heading.dataset.rigDebugSettings='true';
        const anchors=document.createElement('div'); anchors.className='form-group';
        anchors.innerHTML='<label><input type="checkbox" id="graphics-show-rig-anchors"> Show character anchor points</label><small style="display:block;color:#aaa;margin-top:3px;">Shows canonical attachment centres and silhouette extents. Debug display does not alter the rig.</small>';
        anchors.querySelector('input').addEventListener('change',e=>setShowRigAnchors(e.target.checked));
        const armour=document.createElement('div'); armour.className='form-group';
        armour.innerHTML='<label><input type="checkbox" id="graphics-show-armour-width-debug"> Show armour width diagnostic</label><small style="display:block;color:#aaa;margin-top:3px;">Displays measured source width, fitted width and final strip compression.</small>';
        armour.querySelector('input').addEventListener('change',e=>setShowArmourWidthDebug(e.target.checked));
        group.after(heading,anchors,armour); syncUI(); return true;
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSettingsControls,{once:true}); else installSettingsControls();
    let settingsAttempts=0; const settingsTimer=setInterval(()=>{if(installSettingsControls()||++settingsAttempts>40)clearInterval(settingsTimer);},250);

    function sourcePath(img){return String((img?.__recolorBaseSource||img)?.src||'').split('?')[0].toLowerCase();}
    function isHumanArmour(img){
        const path=sourcePath(img); if(/human(?:light|medium|heavy)armour\.png$/.test(path))return true;
        const v=window.gameVisuals||{}; return img===v.humanLight||img===v.humanMedium||img===v.humanHeavy;
    }
    function femaleBodyView(img){
        const match=sourcePath(img).match(/\/human_female\/body_(?:broad_)?(front|side|back)\.png$/);
        return match?.[1]||null;
    }
    function destinationRect(args){
        if(args.length===4)return{x:+args[0],y:+args[1],width:+args[2],height:+args[3]};
        if(args.length===8)return{x:+args[4],y:+args[5],width:+args[6],height:+args[7]};
        return null;
    }
    function transformPoint(m,x,y){return{x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};}

    const anchorRecords=[]; let anchorFlushQueued=false;
    const LABEL_NAMES=new Set([
        'helmetAnchor','scalpCenter','armourShoulderTopLeft','armourShoulderTopRight',
        'torsoShoulderLeft','torsoShoulderRight','torsoWaistLeft','torsoWaistRight',
        'torsoHipLeft','torsoHipRight','mainHandGrip','offHandGrip','offForearm',
        'leftFoot','rightFoot','leftFootSole','rightFootSole'
    ]);
    const SHORT={
        helmetAnchor:'helmet',scalpCenter:'scalp',armourShoulderTopLeft:'armourTopL',armourShoulderTopRight:'armourTopR',
        torsoShoulderLeft:'shoulderL',torsoShoulderRight:'shoulderR',torsoWaistLeft:'waistL',torsoWaistRight:'waistR',
        torsoHipLeft:'hipL',torsoHipRight:'hipR',mainHandGrip:'mainGrip',offHandGrip:'offGrip',offForearm:'forearm',
        leftFoot:'footL',rightFoot:'footR',leftFootSole:'soleL',rightFootSole:'soleR'
    };
    function queueCanonicalAnchorOverlay(ctx,img,args){
        if(!window.showRigAnchors||ctx!==window.mapCtx)return;
        const view=femaleBodyView(img),rect=view&&destinationRect(args),rig=view&&window.HUMAN_FEMALE_REFERENCE_RIGS?.[view];
        if(!rect||!rig?.anchors)return;
        const matrix=typeof ctx.getTransform==='function'?ctx.getTransform():{a:1,b:0,c:0,d:1,e:0,f:0};
        const anchors=Object.entries(rig.anchors).filter(([name])=>LABEL_NAMES.has(name)).map(([name,p])=>{
            const raw=transformPoint(matrix,rect.x+p.x*rect.width,rect.y+p.y*rect.height);return{name,x:raw.x,y:raw.y};
        });
        anchorRecords.push({ctx,anchors});
        if(anchorFlushQueued)return; anchorFlushQueued=true;
        queueMicrotask(()=>{anchorFlushQueued=false;for(const r of anchorRecords.splice(0))drawCanonicalAnchors(r.ctx,r.anchors);});
    }
    function anchorColour(name){
        if(/sole|armourShoulderTop/i.test(name))return'#ff5252';
        if(name.startsWith('torso'))return'#00e5ff';
        if(/hand|grip|forearm/i.test(name))return'#ffab40';
        if(/foot/i.test(name))return'#76ff03';
        if(/scalp|hair|helmet/i.test(name))return'#e040fb';
        return'#ffeb3b';
    }
    function drawCanonicalAnchors(ctx,anchors){
        if(!window.showRigAnchors||!ctx||!anchors?.length)return;
        ctx.save(); if(typeof ctx.setTransform==='function')ctx.setTransform(1,0,0,1,0,0);
        ctx.font='9px monospace';ctx.textBaseline='middle';ctx.lineWidth=2;
        for(const p of anchors){
            ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle=anchorColour(p.name);ctx.fill();ctx.strokeStyle='#000';ctx.stroke();
            const side=/Left|left|mainHand/.test(p.name)?-1:1; const label=SHORT[p.name]||p.name;
            const tx=p.x+side*6,ty=p.y-5;
            ctx.textAlign=side<0?'right':'left';ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=3;ctx.strokeText(label,tx,ty);ctx.fillText(label,tx,ty);
        }
        ctx.restore();
    }

    let activeArmourDiagnostic=null;
    const originalPrototypeDrawImage=CanvasRenderingContext2D.prototype.drawImage;
    if(!originalPrototypeDrawImage.__rigDebugObserved){
        const observed=function(img,...args){
            queueCanonicalAnchorOverlay(this,img,args);
            if(window.showArmourWidthDebug&&activeArmourDiagnostic&&this===window.mapCtx&&img===activeArmourDiagnostic.image&&args.length===8){
                const rect=destinationRect(args);if(rect&&rect.width>0&&rect.height>0)activeArmourDiagnostic.strips.push(rect);
            }
            return originalPrototypeDrawImage.call(this,img,...args);
        };
        observed.__rigDebugObserved=true;observed.__rigDebugOriginal=originalPrototypeDrawImage;CanvasRenderingContext2D.prototype.drawImage=observed;
    }

    function summariseDiagnostic(diag,fit){
        const strips=diag.strips||[],widths=strips.map(s=>s.width).filter(Number.isFinite);
        const maxWidth=widths.length?Math.max(...widths):0,minWidth=widths.length?Math.min(...widths):0;
        const unionLeft=strips.length?Math.min(...strips.map(s=>s.x)):0,unionRight=strips.length?Math.max(...strips.map(s=>s.x+s.width)):0;
        const hsZ=(window.hexSize||1)*(window.cameraZoom||1),fittedOuterWidthPx=fit?.outerWidth?fit.outerWidth*hsZ:0,trim=fit?.trim||null;
        const sourceVisibleWidthPx=trim?.trimWidth||0,sourceCanvasWidthPx=trim?.originalWidth||diag.image?.naturalWidth||diag.image?.width||0;
        const undeformedVisibleWidthPx=fittedOuterWidthPx&&sourceCanvasWidthPx?fittedOuterWidthPx*sourceVisibleWidthPx/sourceCanvasWidthPx:0;
        const result={view:fit?.view||diag.view||'unknown',sourceVisibleWidthPx,sourceCanvasWidthPx,sourceVisibleHeightPx:trim?.trimHeight||0,
            fittedOuterWidthPx,fittedOuterWidthHex:fit?.outerWidth||0,fittedOuterHeightHex:fit?.outerHeight||0,undeformedVisibleWidthPx,
            stripCount:strips.length,stripMinWidthPx:minWidth,stripMaxWidthPx:maxWidth,stripUnionWidthPx:Math.max(0,unionRight-unionLeft),
            stripCompressionRatio:fittedOuterWidthPx?maxWidth/fittedOuterWidthPx:0,stripWidthsPx:widths,timestamp:Date.now()};
        window.__lastArmourWidthDebug=result;updateDiagnosticPanel();return result;
    }
    function ensureDiagnosticPanel(){
        let panel=document.getElementById('armour-width-debug-panel');if(panel)return panel;
        panel=document.createElement('div');panel.id='armour-width-debug-panel';
        Object.assign(panel.style,{position:'fixed',right:'6px',top:'calc(env(safe-area-inset-top, 0px) + 6px)',zIndex:'100000',maxWidth:'300px',padding:'7px 9px',border:'1px solid #00e5ff',borderRadius:'5px',background:'rgba(0,0,0,.82)',color:'#d7ffff',font:'11px/1.25 monospace',whiteSpace:'pre-wrap',pointerEvents:'none',display:'none'});
        document.body.appendChild(panel);return panel;
    }
    function updateDiagnosticPanel(){
        if(typeof document==='undefined')return;const panel=ensureDiagnosticPanel();
        if(!window.showArmourWidthDebug){panel.style.display='none';return;}panel.style.display='block';
        const d=window.__lastArmourWidthDebug;if(!d){panel.textContent='Armour width diagnostic\nWaiting for armour draw…';return;}
        panel.textContent=[`Armour width — ${d.view}`,`source visible: ${d.sourceVisibleWidthPx}/${d.sourceCanvasWidthPx}px`,`fitted box: ${d.fittedOuterWidthPx.toFixed(1)}px (${d.fittedOuterWidthHex.toFixed(3)} hex)`,`visible before strips: ${d.undeformedVisibleWidthPx.toFixed(1)}px`,`strips: ${d.stripCount} min/max ${d.stripMinWidthPx.toFixed(1)}/${d.stripMaxWidthPx.toFixed(1)}px`,`strip union: ${d.stripUnionWidthPx.toFixed(1)}px`,`box retained: ${(d.stripCompressionRatio*100).toFixed(1)}%`].join('\n');
    }
    function installOuterDiagnosticWrapper(){
        const ctx=window.mapCtx;if(!ctx||ctx.drawImage?.__rigDebugOuter)return!!ctx;
        if(!window.__characterRigInstalled||!window.__directionalEquipmentFitTuningApplied)return false;
        const previous=ctx.drawImage.bind(ctx);
        const wrapper=function(img,...args){
            if(!window.showArmourWidthDebug||!isHumanArmour(img)||args.length!==4)return previous(img,...args);
            const before=window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour,diag={image:img,strips:[],view:null},saved=activeArmourDiagnostic;activeArmourDiagnostic=diag;
            try{return previous(img,...args);}finally{activeArmourDiagnostic=saved;const fit=window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour;if(fit&&fit!==before)summariseDiagnostic(diag,fit);}
        };
        wrapper.__rigDebugOuter=true;wrapper.__rigDebugPrevious=previous;ctx.drawImage=wrapper;return true;
    }
    let attempts=0;const timer=setInterval(()=>{attempts++;if(installOuterDiagnosticWrapper()||attempts>100)clearInterval(timer);},100);
    if(document.readyState==='complete')installOuterDiagnosticWrapper();else window.addEventListener('load',()=>setTimeout(installOuterDiagnosticWrapper,0),{once:true});

    window.updateArmourWidthDiagnosticPanel=updateDiagnosticPanel;
    window.__rigDebugMutatesRig=false;
    window.__rigDebugLoaded=true;
})();
