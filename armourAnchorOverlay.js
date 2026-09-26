// armourAnchorOverlay.js
// Dedicated transparent canvas above the map for armour-anchor diagnostics.
// Independent of map draw order, so later character/UI rendering cannot erase it.
(() => {
  'use strict';

  function facingToView(f){return f==='up'?'back':(f==='left'||f==='right'?'side':'front');}
  function lerp(a,b,t){return a+(b-a)*t;}
  function spanAt(rig,t){
    if(!rig)return {left:0,right:1};
    if(t<=rig.waistY){const u=rig.waistY>0?t/rig.waistY:0;return {left:lerp(rig.shoulderL,rig.waistL,u),right:lerp(rig.shoulderR,rig.waistR,u)};}
    const d=1-rig.waistY,u=d>0?(t-rig.waistY)/d:1;return {left:lerp(rig.waistL,rig.hemL,u),right:lerp(rig.waistR,rig.hemR,u)};
  }
  function tx(m,p){return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};}
  function midpoint(names,anchors){const pts=names.map(n=>anchors?.[n]).filter(Boolean);if(!pts.length)return null;return {x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};}
  function sourcePoint(anchor,fit,rig){const t=Math.max(0,Math.min(1,anchor.y)),span=spanAt(rig,t);return {x:fit.dx+(span.left+anchor.x*(span.right-span.left))*fit.outerWidthPx,y:fit.dy+t*fit.outerHeightPx};}

  function ensureCanvas(){
    const base=window.mapCtx?.canvas;if(!base)return null;
    let c=document.getElementById('armour-anchor-overlay-canvas');
    if(!c){c=document.createElement('canvas');c.id='armour-anchor-overlay-canvas';Object.assign(c.style,{position:'fixed',zIndex:'99999',pointerEvents:'none'});document.body.appendChild(c);}
    const r=base.getBoundingClientRect();
    if(c.width!==base.width)c.width=base.width;if(c.height!==base.height)c.height=base.height;
    c.style.left=`${r.left}px`;c.style.top=`${r.top}px`;c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;
    return c;
  }
  function dot(ctx,p,color,label,side){ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#000';ctx.stroke();ctx.font='12px monospace';ctx.textBaseline='middle';ctx.textAlign=side<0?'right':'left';const x=p.x+side*9,y=p.y-8;ctx.lineWidth=4;ctx.strokeText(label,x,y);ctx.fillStyle='#fff';ctx.fillText(label,x,y);}
  function updatePanel(status,deltas){
    const p=document.getElementById('armour-anchor-map-panel');if(!p||!window.showArmourAnchors)return;
    const lines=['Armour anchor map','armour.topExtent → body.armourShoulderTop midpoint','armour.bottomExtent → body.footSole midpoint','armour.leftExtent — diagnostic only','armour.rightExtent — diagnostic only','',status];
    if(deltas){for(const [name,d] of Object.entries(deltas))lines.push(`${name}: Δ ${d.dx.toFixed(1)}, ${d.dy.toFixed(1)} px (${d.distance.toFixed(1)} px)`);}
    p.textContent=lines.join('\n');
  }

  function frame(){
    const c=ensureCanvas();
    if(c){
      const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
      c.style.display=window.showArmourAnchors?'block':'none';
      if(window.showArmourAnchors){
        const fit=window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour;
        const body=fit?.bodyBounds||window.__humanFemaleLastBodyDraw;
        const view=fit?.view||facingToView(window.__activeCharacterFacing);
        const anchors=window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
        const rig=window.getArmourRigForFacing?.('human_female',window.__activeCharacterFacing);
        const m=body?.transform||window.__humanFemaleLastBodyDraw?.transform||{a:1,b:0,c:0,d:1,e:0,f:0};
        if(fit?.sourceAnchors&&body&&anchors&&rig){
          const map={topExtent:['armourShoulderTopLeft','armourShoulderTopRight'],bottomExtent:['leftFootSole','rightFootSole']};
          const deltas={};
          for(const [name,a] of Object.entries(fit.sourceAnchors)){
            if(name==='source')continue;
            const sp=tx(m,sourcePoint(a,fit,rig));
            dot(ctx,sp,'#ff4fa3',`armour:${name}`,-1);
            const targetNames=map[name];
            if(targetNames){const q=midpoint(targetNames,anchors);if(q){const tp=tx(m,{x:body.left+q.x*body.width,y:body.top+q.y*body.height});ctx.beginPath();ctx.moveTo(sp.x,sp.y);ctx.lineTo(tp.x,tp.y);ctx.strokeStyle='#ff80ab';ctx.lineWidth=2;ctx.stroke();dot(ctx,tp,'#40c4ff',`body:${targetNames.join('+')}`,1);const dx=sp.x-tp.x,dy=sp.y-tp.y;deltas[name]={dx,dy,distance:Math.hypot(dx,dy)};}}
          }
          window.__lastArmourAnchorDebug={view,deltas,timestamp:Date.now(),overlay:'separate-canvas'};
          updatePanel('Overlay active',deltas);
        } else {
          updatePanel(`Overlay loaded; waiting for placement (${fit?'fit':'no fit'}, ${body?'body':'no body'}, ${rig?'rig':'no rig'})`);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__armourAnchorOverlayLoaded=true;
})();
