// armourAnchorDebug.js
// Display-only diagnostics for source armour anchors and their declared body targets.
// This module must not mutate production rig or placement data.
(() => {
    'use strict';

    const KEY='rpg_show_armour_anchors';
    window.showArmourAnchors=localStorage.getItem(KEY)==='true';

    const ARMOUR_ANCHOR_MAP=Object.freeze({
        topExtent:{
            body:['armourShoulderTopLeft','armourShoulderTopRight'],
            target:'midpoint',
            label:'armour.topExtent → body.armourShoulderTop midpoint',
            role:'placement'
        },
        bottomExtent:{
            body:['leftFootSole','rightFootSole'],
            target:'midpoint',
            label:'armour.bottomExtent → body.footSole midpoint',
            role:'placement'
        },
        leftExtent:{body:[],target:null,label:'armour.leftExtent — diagnostic only',role:'diagnostic'},
        rightExtent:{body:[],target:null,label:'armour.rightExtent — diagnostic only',role:'diagnostic'},
    });
    window.HUMAN_FEMALE_ARMOUR_ANCHOR_MAP=ARMOUR_ANCHOR_MAP;

    function setShowArmourAnchors(enabled){
        window.showArmourAnchors=!!enabled;
        localStorage.setItem(KEY,enabled?'true':'false');
        syncUI();
        updateLegend();
    }
    window.setShowArmourAnchors=setShowArmourAnchors;

    function syncUI(){
        const el=document.getElementById('graphics-show-armour-anchors');
        if(el)el.checked=!!window.showArmourAnchors;
    }

    function installSettingsControl(){
        if(document.getElementById('graphics-show-armour-anchors')){syncUI();return true;}
        const widthToggle=document.getElementById('graphics-show-armour-width-debug');
        const insertion=widthToggle?.closest('.form-group');
        if(!insertion?.parentElement)return false;
        const group=document.createElement('div');
        group.className='form-group';
        group.innerHTML='<label><input type="checkbox" id="graphics-show-armour-anchors"> Show armour anchor points</label><small style="display:block;color:#aaa;margin-top:3px;">Shows named anchors on the armour sprite, their body targets, and the source→target mapping.</small>';
        group.querySelector('input').addEventListener('change',e=>setShowArmourAnchors(e.target.checked));
        insertion.after(group);
        syncUI();
        return true;
    }

    function ensureLegend(){
        let panel=document.getElementById('armour-anchor-map-panel');
        if(panel)return panel;
        panel=document.createElement('div');
        panel.id='armour-anchor-map-panel';
        Object.assign(panel.style,{
            position:'fixed',left:'6px',top:'calc(env(safe-area-inset-top, 0px) + 6px)',zIndex:'100001',
            maxWidth:'330px',padding:'7px 9px',border:'1px solid #ff80ab',borderRadius:'5px',
            background:'rgba(0,0,0,.84)',color:'#ffe6ef',font:'10px/1.3 monospace',whiteSpace:'pre-wrap',
            pointerEvents:'none',display:'none'
        });
        document.body.appendChild(panel);
        return panel;
    }

    function updateLegend(state=window.__lastArmourAnchorDebug){
        if(typeof document==='undefined')return;
        const panel=ensureLegend();
        if(!window.showArmourAnchors){panel.style.display='none';return;}
        panel.style.display='block';
        const lines=['Armour anchor map'];
        for(const def of Object.values(ARMOUR_ANCHOR_MAP))lines.push(def.label);
        if(state?.deltas){
            lines.push('');
            for(const [name,d] of Object.entries(state.deltas)){
                lines.push(`${name}: Δ ${d.dx.toFixed(1)}, ${d.dy.toFixed(1)} px (${d.distance.toFixed(1)} px)`);
            }
        } else lines.push('','Waiting for measured armour placement…');
        panel.textContent=lines.join('\n');
    }

    function facingToView(facing){
        if(facing==='up')return'back';
        if(facing==='left'||facing==='right')return'side';
        return'front';
    }
    function lerp(a,b,t){return a+(b-a)*t;}
    function armourSpanAt(rig,t){
        if(!rig)return{left:0,right:1};
        if(t<=rig.waistY){
            const u=rig.waistY>0?t/rig.waistY:0;
            return{left:lerp(rig.shoulderL,rig.waistL,u),right:lerp(rig.shoulderR,rig.waistR,u)};
        }
        const denom=1-rig.waistY;
        const u=denom>0?(t-rig.waistY)/denom:1;
        return{left:lerp(rig.waistL,rig.hemL,u),right:lerp(rig.waistR,rig.hemR,u)};
    }

    function sourceAnchorToScreen(anchor,placement,rig){
        if(!anchor||!placement)return null;
        const t=Math.max(0,Math.min(1,anchor.y));
        const span=armourSpanAt(rig,t);
        const xFrac=span.left+anchor.x*(span.right-span.left);
        return{
            x:placement.dx+xFrac*placement.outerWidthPx,
            y:placement.dy+t*placement.outerHeightPx
        };
    }

    function bodyTargetFor(mapping,body,anchors){
        if(!mapping?.body?.length||!body||!anchors)return null;
        const pts=mapping.body.map(name=>anchors[name]).filter(Boolean);
        if(!pts.length)return null;
        const x=pts.reduce((s,p)=>s+p.x,0)/pts.length;
        const y=pts.reduce((s,p)=>s+p.y,0)/pts.length;
        return{x:body.left+x*body.width,y:body.top+y*body.height};
    }

    function drawPoint(ctx,p,colour,label,side=1){
        ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle=colour;ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=2;ctx.stroke();
        ctx.font='9px monospace';ctx.textBaseline='middle';ctx.textAlign=side<0?'right':'left';
        const tx=p.x+side*6,ty=p.y-5;ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.fillStyle='#fff';ctx.strokeText(label,tx,ty);ctx.fillText(label,tx,ty);
    }

    function drawOverlay(ctx,fit){
        if(!window.showArmourAnchors||ctx!==window.mapCtx||!fit?.sourceAnchors)return;
        const view=fit.view||facingToView(window.__activeCharacterFacing);
        const body=fit.bodyBounds||window.__humanFemaleLastBodyDraw;
        const bodyAnchors=window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
        const rig=window.getArmourRigForFacing?.('human_female',window.__activeCharacterFacing);
        if(!body||!bodyAnchors||!rig||!Number.isFinite(fit.dx)||!Number.isFinite(fit.dy)||!fit.outerWidthPx||!fit.outerHeightPx)return;

        const matrix=typeof ctx.getTransform==='function'?ctx.getTransform():null;
        ctx.save();
        if(typeof ctx.setTransform==='function')ctx.setTransform(1,0,0,1,0,0);
        const deltas={};
        for(const [name,anchor] of Object.entries(fit.sourceAnchors)){
            if(name==='source')continue;
            let source=sourceAnchorToScreen(anchor,fit,rig);
            if(!source)continue;
            if(matrix)source={x:matrix.a*source.x+matrix.c*source.y+matrix.e,y:matrix.b*source.x+matrix.d*source.y+matrix.f};
            const map=ARMOUR_ANCHOR_MAP[name];
            let target=bodyTargetFor(map,body,bodyAnchors);
            if(target&&matrix)target={x:matrix.a*target.x+matrix.c*target.y+matrix.e,y:matrix.b*target.x+matrix.d*target.y+matrix.f};
            if(target){
                ctx.beginPath();ctx.moveTo(source.x,source.y);ctx.lineTo(target.x,target.y);ctx.strokeStyle='#ff80ab';ctx.lineWidth=1.5;ctx.stroke();
                drawPoint(ctx,target,'#40c4ff',`body:${map.body.join('+')}`,1);
                const dx=source.x-target.x,dy=source.y-target.y;
                deltas[name]={dx,dy,distance:Math.hypot(dx,dy)};
            }
            drawPoint(ctx,source,'#ff80ab',`armour:${name}`,-1);
        }
        ctx.restore();
        window.__lastArmourAnchorDebug={view,deltas,mapping:ARMOUR_ANCHOR_MAP,timestamp:Date.now()};
        updateLegend(window.__lastArmourAnchorDebug);
    }

    function installDrawWrapper(){
        const ctx=window.mapCtx;
        if(!ctx||ctx.drawImage?.__armourAnchorDebug)return!!ctx;
        if(!window.__directionalEquipmentFitTuningApplied)return false;
        const previous=ctx.drawImage.bind(ctx);
        const wrapped=function(img,...args){
            const before=window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour;
            const result=previous(img,...args);
            if(window.showArmourAnchors){
                const fit=window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour;
                if(fit&&fit!==before)drawOverlay(ctx,fit);
            }
            return result;
        };
        wrapped.__armourAnchorDebug=true;
        wrapped.__armourAnchorDebugPrevious=previous;
        ctx.drawImage=wrapped;
        return true;
    }

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSettingsControl,{once:true});else installSettingsControl();
    let settingsAttempts=0;const settingsTimer=setInterval(()=>{if(installSettingsControl()||++settingsAttempts>40)clearInterval(settingsTimer);},250);
    let drawAttempts=0;const drawTimer=setInterval(()=>{if(installDrawWrapper()||++drawAttempts>100)clearInterval(drawTimer);},100);
    updateLegend();
    window.drawHumanFemaleArmourAnchorDebug=fit=>drawOverlay(window.mapCtx,fit);
    window.__armourAnchorDebugLoaded=true;
})();
