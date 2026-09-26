// armourAnchorOverlay.js
// Dedicated transparent canvas above the map for armour-anchor diagnostics.
// Source anchors are transformed through the actual characterRig strip draws.
(() => {
  'use strict';

  const anchorCache=new WeakMap();

  function tx(m,p){return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};}
  function midpoint(names,anchors){const pts=names.map(n=>anchors?.[n]).filter(Boolean);if(!pts.length)return null;return {x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};}

  function ensureCanvas(){
    const base=window.mapCtx?.canvas;if(!base)return null;
    let c=document.getElementById('armour-anchor-overlay-canvas');
    if(!c){c=document.createElement('canvas');c.id='armour-anchor-overlay-canvas';Object.assign(c.style,{position:'fixed',zIndex:'99999',pointerEvents:'none'});document.body.appendChild(c);}
    const r=base.getBoundingClientRect();
    if(c.width!==base.width)c.width=base.width;if(c.height!==base.height)c.height=base.height;
    c.style.left=`${r.left}px`;c.style.top=`${r.top}px`;c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;
    return c;
  }

  function dot(ctx,p,color,label,side){
    ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#000';ctx.stroke();
    ctx.font='12px monospace';ctx.textBaseline='middle';ctx.textAlign=side<0?'right':'left';const x=p.x+side*9,y=p.y-8;ctx.lineWidth=4;ctx.strokeStyle='#000';ctx.strokeText(label,x,y);ctx.fillStyle='#fff';ctx.fillText(label,x,y);
  }

  function updatePanel(status,deltas){
    const p=document.getElementById('armour-anchor-map-panel');if(!p||!window.showArmourAnchors)return;
    const lines=['Armour anchor map','armour.topExtent → body.armourShoulderTop midpoint','armour.bottomExtent → body.footSole midpoint','armour.leftExtent — diagnostic only','armour.rightExtent — diagnostic only','',status];
    if(deltas){for(const [name,d] of Object.entries(deltas))lines.push(`${name}: Δ ${d.dx.toFixed(1)}, ${d.dy.toFixed(1)} px (${d.distance.toFixed(1)} px)`);}
    p.textContent=lines.join('\n');
  }

  function sourceAnchorsFor(image){
    if(!image)return null;
    const cached=anchorCache.get(image);if(cached)return cached;
    const measure=window.measureHumanFemaleArmourAlphaBounds;
    const makeRig=window.computeHumanFemaleArmourSourceExtentRig;
    if(typeof measure!=='function'||typeof makeRig!=='function')return null;
    const trim=measure(image);const anchors=trim?makeRig(trim):null;
    if(anchors)anchorCache.set(image,anchors);
    return anchors;
  }

  function sourcePointFromProbe(anchor,probe){
    if(!anchor||!probe?.strips?.length)return null;
    const sourceX=anchor.x*probe.sourceWidth;
    const sourceY=anchor.y*probe.sourceHeight;
    let strip=probe.strips.find(s=>sourceY>=s.sy-0.01&&sourceY<=s.sy+s.sh+0.01);
    if(!strip){
      strip=probe.strips.reduce((best,s)=>{
        const dist=Math.abs(sourceY-(s.sy+s.sh/2));
        return !best||dist<best.dist?{s,dist}:best;
      },null)?.s;
    }
    if(!strip||!(strip.sw>0&&strip.sh>0))return null;
    return {x:strip.dx+((sourceX-strip.sx)/strip.sw)*strip.dw,y:strip.dy+((sourceY-strip.sy)/strip.sh)*strip.dh};
  }

  function frame(){
    const c=ensureCanvas();
    if(c){
      const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
      c.style.display=window.showArmourAnchors?'block':'none';
      if(window.showArmourAnchors){
        const probe=window.__lastHumanFemaleArmourStripProbe;
        if(!probe){
          updatePanel('Overlay active; no actual armour strip probe yet');
        }else{
          const body=probe.body;
          const view=probe.view;
          const bodyAnchors=window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
          const sourceAnchors=sourceAnchorsFor(probe.image);
          const m=body?.transform||{a:1,b:0,c:0,d:1,e:0,f:0};
          if(!body||!bodyAnchors||!sourceAnchors){
            updatePanel(`Overlay active; waiting (${body?'body':'no body'}, ${bodyAnchors?'body anchors':'no body anchors'}, ${sourceAnchors?'source anchors':'no source anchors'})`);
          }else{
            const map={topExtent:['armourShoulderTopLeft','armourShoulderTopRight'],bottomExtent:['leftFootSole','rightFootSole']};
            const deltas={};
            for(const [name,a] of Object.entries(sourceAnchors)){
              if(name==='source')continue;
              const raw=sourcePointFromProbe(a,probe);if(!raw)continue;
              const sp=tx(m,raw);
              dot(ctx,sp,'#ff4fa3',`armour:${name}`,-1);
              const targetNames=map[name];
              if(targetNames){
                const q=midpoint(targetNames,bodyAnchors);
                if(q){
                  const tp=tx(m,{x:body.left+q.x*body.width,y:body.top+q.y*body.height});
                  ctx.beginPath();ctx.moveTo(sp.x,sp.y);ctx.lineTo(tp.x,tp.y);ctx.strokeStyle='#ff80ab';ctx.lineWidth=2;ctx.stroke();
                  dot(ctx,tp,'#40c4ff',`body:${targetNames.join('+')}`,1);
                  const dx=sp.x-tp.x,dy=sp.y-tp.y;deltas[name]={dx,dy,distance:Math.hypot(dx,dy)};
                }
              }
            }
            window.__lastArmourAnchorDebug={view,deltas,timestamp:Date.now(),overlay:'actual-strip-probe',stripCount:probe.strips.length};
            updatePanel(`Overlay active; actual strip probe (${probe.strips.length} strips)`,deltas);
          }
        }
      }
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.__armourAnchorOverlayLoaded=true;
})();
