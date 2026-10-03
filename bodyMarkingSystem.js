// bodyMarkingSystem.js
// Scars and tattoos stored in body-surface coordinates, with wrap-aware
// projection into front/side/back directional humanoid views.
(() => {
  'use strict';

  const BUILD = window.PRESENTATION_BUILD || '20261001-body-markings-v1';
  const VIEW_HALF_SPAN = 0.17; // fraction of a full turn visible either side of a view centre
  const creatorMarkings = [];
  let selectedIndex = -1;
  let sideEditorFacing = 'right';
  let installedInitialiser = null;
  let installedClothingWrapper = null;
  let editorRoot = null;

  const DESIGNS = {
    scar_slash: { kind:'scar', label:'Scar — slash', aspect:.35 },
    scar_cross: { kind:'scar', label:'Scar — crossed', aspect:.72 },
    scar_jagged:{ kind:'scar', label:'Scar — jagged', aspect:.50 },
    scar_burn:  { kind:'scar', label:'Scar — burn', aspect:.90 },
    tattoo_rune:{ kind:'tattoo',label:'Tattoo — rune', aspect:.72 },
    tattoo_spiral:{kind:'tattoo',label:'Tattoo — spiral',aspect:1.00},
    tattoo_sun: { kind:'tattoo',label:'Tattoo — sun', aspect:1.00 },
    tattoo_band:{ kind:'tattoo',label:'Tattoo — band', aspect:2.20 },
  };

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const wrapTurn=n=>((Number(n)||0)%1+1)%1;
  const turnDelta=(a,b)=>{
    let d=wrapTurn(a)-wrapTurn(b);
    if(d>.5)d-=1;
    if(d<-.5)d+=1;
    return d;
  };
  const cloneMarkings=list=>(Array.isArray(list)?list:[]).map(m=>({
    design:DESIGNS[m?.design]?m.design:'scar_slash',
    u:wrapTurn(m?.u),
    v:clamp(Number(m?.v??.45),0,1),
    size:clamp(Number(m?.size??.11),.035,.36),
    rotation:clamp(Number(m?.rotation??0),-180,180),
  }));

  function viewProjection(view, facing='down'){
    if(view==='back') return { centre:.5, sign:1 };
    if(view==='side') return facing==='left' ? {centre:.75,sign:1} : {centre:.25,sign:-1};
    return { centre:0, sign:-1 };
  }

  function project(marking, view, facing, bounds){
    const spec=DESIGNS[marking.design]||DESIGNS.scar_slash;
    const p=viewProjection(view,facing);
    const d=turnDelta(marking.u,p.centre);
    const h=Math.max(1,bounds?.height||1), w=Math.max(1,bounds?.width||1);
    const pixelWidth=marking.size*h*spec.aspect;
    const angularHalf=(pixelWidth/w)*VIEW_HALF_SPAN;
    if(Math.abs(d)>VIEW_HALF_SPAN+angularHalf) return null;
    return {
      x:.5+d/(p.sign*2*VIEW_HALF_SPAN),
      y:marking.v,
      pixelWidth,
      pixelHeight:marking.size*h,
      angularHalf,
    };
  }

  function surfaceFromPoint(view,facing,x,y){
    const p=viewProjection(view,facing);
    return {
      u:wrapTurn(p.centre+p.sign*(clamp(x,0,1)-.5)*2*VIEW_HALF_SPAN),
      v:clamp(y,0,1),
    };
  }

  function traceScar(ctx,design,w,h){
    ctx.lineCap='round';ctx.lineJoin='round';
    const stroke=(alpha=1,width=.10)=>{ctx.strokeStyle=`rgba(118,55,48,${alpha})`;ctx.lineWidth=Math.max(1,h*width);ctx.stroke();};
    const highlight=()=>{ctx.strokeStyle='rgba(224,157,139,.45)';ctx.lineWidth=Math.max(.6,h*.035);ctx.stroke();};
    const path=(points)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));};
    if(design==='scar_cross'){
      path([[.18,.12],[.82,.88]]);stroke(.88,.09);highlight();
      path([[.78,.18],[.25,.82]]);stroke(.82,.075);highlight();
    }else if(design==='scar_jagged'){
      path([[.52,.04],[.32,.23],[.59,.39],[.36,.58],[.66,.73],[.43,.96]]);stroke(.9,.11);highlight();
    }else if(design==='scar_burn'){
      ctx.fillStyle='rgba(126,66,57,.45)';
      ctx.beginPath();ctx.ellipse(w*.50,h*.50,w*.43,h*.40,-.2,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(205,132,116,.48)';ctx.lineWidth=Math.max(1,h*.055);ctx.stroke();
      ctx.beginPath();ctx.arc(w*.43,h*.43,Math.min(w,h)*.18,0,Math.PI*1.5);ctx.stroke();
    }else{
      path([[.62,.04],[.48,.26],[.55,.48],[.38,.72],[.42,.96]]);stroke(.9,.11);highlight();
    }
  }

  function traceTattoo(ctx,design,w,h){
    ctx.strokeStyle='rgba(25,35,48,.92)';ctx.fillStyle='rgba(25,35,48,.88)';
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(1,h*.075);
    if(design==='tattoo_spiral'){
      ctx.beginPath();
      for(let i=0;i<=42;i++){
        const t=i/42*Math.PI*4.7, r=(i/42)*Math.min(w,h)*.43;
        const x=w*.5+Math.cos(t)*r, y=h*.5+Math.sin(t)*r;
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      ctx.stroke();
    }else if(design==='tattoo_sun'){
      const r=Math.min(w,h)*.23;
      ctx.beginPath();ctx.arc(w*.5,h*.5,r,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4, r1=r*1.45, r2=r*2.0;
        ctx.beginPath();ctx.moveTo(w*.5+Math.cos(a)*r1,h*.5+Math.sin(a)*r1);ctx.lineTo(w*.5+Math.cos(a)*r2,h*.5+Math.sin(a)*r2);ctx.stroke();
      }
      ctx.beginPath();ctx.arc(w*.5,h*.5,r*.32,0,Math.PI*2);ctx.fill();
    }else if(design==='tattoo_band'){
      ctx.lineWidth=Math.max(1,h*.13);
      for(const yy of [.34,.5,.66]){ctx.beginPath();ctx.moveTo(w*.05,h*yy);ctx.lineTo(w*.95,h*yy);ctx.stroke();}
      ctx.lineWidth=Math.max(1,h*.055);
      for(let x=.12;x<.92;x+=.15){ctx.beginPath();ctx.moveTo(w*x,h*.25);ctx.lineTo(w*(x+.08),h*.75);ctx.stroke();}
    }else{
      ctx.beginPath();
      ctx.moveTo(w*.5,h*.06);ctx.lineTo(w*.5,h*.88);
      ctx.moveTo(w*.5,h*.18);ctx.lineTo(w*.18,h*.40);ctx.lineTo(w*.5,h*.52);ctx.lineTo(w*.82,h*.32);
      ctx.moveTo(w*.50,h*.62);ctx.lineTo(w*.24,h*.78);
      ctx.moveTo(w*.50,h*.62);ctx.lineTo(w*.77,h*.82);
      ctx.stroke();
      ctx.beginPath();ctx.arc(w*.5,h*.18,Math.min(w,h)*.10,0,Math.PI*2);ctx.fill();
    }
  }

  function drawOne(ctx,marking,projection,bounds,selected=false){
    const spec=DESIGNS[marking.design]||DESIGNS.scar_slash;
    const x=bounds.left+projection.x*bounds.width;
    const y=bounds.top+projection.y*bounds.height;
    const w=Math.max(2,projection.pixelWidth), h=Math.max(2,projection.pixelHeight);
    ctx.save();
    ctx.translate(x,y);ctx.rotate((marking.rotation||0)*Math.PI/180);ctx.translate(-w/2,-h/2);
    if(spec.kind==='scar') traceScar(ctx,marking.design,w,h); else traceTattoo(ctx,marking.design,w,h);
    if(selected){
      ctx.strokeStyle='rgba(255,220,90,.95)';ctx.lineWidth=1;ctx.setLineDash([3,2]);ctx.strokeRect(-3,-3,w+6,h+6);
    }
    ctx.restore();
  }

  function creatorVisible(){
    const el=document.getElementById('characterCreator');
    return !!el && getComputedStyle(el).display!=='none';
  }

  function markingsFor(entity){
    if(Array.isArray(entity?.bodyMarkings)) return entity.bodyMarkings;
    return creatorVisible() && entity?.side==='player' ? creatorMarkings : [];
  }

  function drawLayer(ctx,entity,view,bounds,facing=entity?.facing||'down',options={}){
    const markings=options.markings||markingsFor(entity);
    if(!ctx||!bounds||!Array.isArray(markings)||!markings.length) return false;
    let drew=false;
    ctx.save();
    ctx.beginPath();ctx.rect(bounds.left,bounds.top,bounds.width,bounds.height);ctx.clip();
    markings.forEach((m,i)=>{
      const p=project(m,view,facing,bounds);if(!p)return;
      drawOne(ctx,m,p,bounds,options.selectedIndex===i);drew=true;
    });
    ctx.restore();
    return drew;
  }

  function installInitialiserHook(){
    const current=window.initializePlayer;
    if(typeof current!=='function')return false;
    if(current.__bodyMarkingsHook){installedInitialiser=current;return true;}
    const wrapped=function(){
      const result=current.apply(this,arguments);
      const player=window.party?.[0]||window.player;
      if(player) player.bodyMarkings=cloneMarkings(creatorMarkings);
      return result;
    };
    wrapped.__bodyMarkingsHook=true;wrapped.__bodyMarkingsBase=current;
    window.initializePlayer=wrapped;installedInitialiser=wrapped;return true;
  }

  function installClothingHook(){
    const cs=window.clothingSystem,current=cs?.drawSlot;
    if(!cs||typeof current!=='function')return false;
    if(current.__bodyMarkingsHook){installedClothingWrapper=current;return true;}
    const wrapped=function(ctx,entity,slot,view,bounds){
      // The direct humanoid compositor asks for underwear first, immediately
      // after drawing skin. Inject markings here so every garment/armour/hair
      // layer naturally covers them.
      if(slot==='underwear') drawLayer(ctx,entity,view,bounds,entity?.facing||'down');
      return current.apply(this,arguments);
    };
    wrapped.__bodyMarkingsHook=true;wrapped.__bodyMarkingsBase=current;
    cs.drawSlot=wrapped;installedClothingWrapper=wrapped;return true;
  }

  function bodyAssetFor(view,facing){
    const race=document.getElementById('race-select')?.value||'human';
    const gender=document.getElementById('gender-select')?.value||'female';
    const bodyType=document.getElementById('body-type-select')?.value||'average';
    const set=window.DIRECTIONAL_CHARACTER_ASSETS?.[`${race}_${gender}`];
    const spriteView=view==='side'?'side':view;
    return (set?.body?.[bodyType]||set?.body?.average)?.[spriteView]||null;
  }

  function bodyOnlyPreview(ctx,canvas,view,facing,bounds){
    const image=bodyAssetFor(view,facing);
    if(!image?.complete||!image.naturalWidth){
      ctx.fillStyle='#777';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('Body art loading…',canvas.width/2,canvas.height/2);return false;
    }
    const skin=window.getPlayerSkinToneFromControls?.();
    const source=skin&&window.getRecoloredSkinSprite?window.getRecoloredSkinSprite(image,skin):image;
    const layout=window.DIRECTIONAL_CHARACTER_LAYOUT?.[view];
    if(!layout?.bodyCrop)return false;
    const iw=source.naturalWidth||source.width,ih=source.naturalHeight||source.height,c=layout.bodyCrop,d=layout.bodyDest;
    const draw=()=>ctx.drawImage(source,c.x*iw,c.y*ih,c.w*iw,c.h*ih,bounds.left+d.x*bounds.width,bounds.top+d.y*bounds.height,d.w*bounds.width,d.h*bounds.height);
    if(facing==='left'){
      const cx=bounds.left+bounds.width/2;ctx.save();ctx.translate(cx,0);ctx.scale(-1,1);ctx.translate(-cx,0);draw();ctx.restore();
    }else draw();
    return true;
  }

  function editorViews(){return [
    {id:'front',view:'front',facing:'down',label:'Front'},
    {id:'side',view:'side',facing:sideEditorFacing,label:sideEditorFacing==='left'?'Left side':'Right side'},
    {id:'back',view:'back',facing:'up',label:'Back'},
  ];}

  function redrawEditor(){
    if(!editorRoot)return;
    for(const def of editorViews()){
      const canvas=editorRoot.querySelector(`canvas[data-marking-view="${def.id}"]`);if(!canvas)continue;
      const label=editorRoot.querySelector(`[data-marking-label="${def.id}"]`);if(label)label.textContent=def.label;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#202020';ctx.fillRect(0,0,canvas.width,canvas.height);
      const h=canvas.height*.92,w=h*.48,bounds={left:(canvas.width-w)/2,top:(canvas.height-h)/2,width:w,height:h};
      bodyOnlyPreview(ctx,canvas,def.view,def.facing,bounds);
      if(def.facing==='left'){
        const cx=bounds.left+bounds.width/2;ctx.save();ctx.translate(cx,0);ctx.scale(-1,1);ctx.translate(-cx,0);
        drawLayer(ctx,{side:'player'},def.view,bounds,def.facing,{markings:creatorMarkings,selectedIndex});ctx.restore();
      }else drawLayer(ctx,{side:'player'},def.view,bounds,def.facing,{markings:creatorMarkings,selectedIndex});
    }
    const select=editorRoot.querySelector('#body-marking-selected');
    if(select){
      select.innerHTML=creatorMarkings.map((m,i)=>`<option value="${i}">${i+1}. ${DESIGNS[m.design]?.label||m.design}</option>`).join('');
      select.disabled=!creatorMarkings.length;
      if(selectedIndex>=0&&creatorMarkings[selectedIndex])select.value=String(selectedIndex);
    }
    const selected=creatorMarkings[selectedIndex];
    const size=editorRoot.querySelector('#body-marking-size'),rotation=editorRoot.querySelector('#body-marking-rotation'),del=editorRoot.querySelector('#body-marking-delete');
    if(size){size.disabled=!selected;size.value=String(Math.round((selected?.size??.11)*100));}
    if(rotation){rotation.disabled=!selected;rotation.value=String(Math.round(selected?.rotation??0));}
    if(del)del.disabled=!selected;
  }

  function refreshAll(){
    redrawEditor();window.updateAppearancePreview?.();window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();
  }

  function addMarking(design,u=0,v=.43){
    creatorMarkings.push({design:DESIGNS[design]?design:'scar_slash',u:wrapTurn(u),v:clamp(v,0,1),size:.11,rotation:0});
    selectedIndex=creatorMarkings.length-1;refreshAll();return creatorMarkings[selectedIndex];
  }

  function editorPointerPosition(canvas,event,view,facing){
    const rect=canvas.getBoundingClientRect();
    const px=(event.clientX-rect.left)*(canvas.width/Math.max(1,rect.width));
    const py=(event.clientY-rect.top)*(canvas.height/Math.max(1,rect.height));
    const h=canvas.height*.92,w=h*.48,left=(canvas.width-w)/2,top=(canvas.height-h)/2;
    let nx=clamp((px-left)/w,0,1),ny=clamp((py-top)/h,0,1);
    if(facing==='left')nx=1-nx; // editor canvas is visually mirrored
    return {...surfaceFromPoint(view,facing,nx,ny),nx,ny,bounds:{left,top,width:w,height:h}};
  }

  function nearestMarking(view,facing,nx,ny,bounds){
    let best=-1,bestD=Infinity;
    creatorMarkings.forEach((m,i)=>{
      const p=project(m,view,facing,bounds);if(!p)return;
      const dx=(p.x-nx)*bounds.width,dy=(p.y-ny)*bounds.height,d=Math.hypot(dx,dy);
      if(d<bestD&&d<18){best=i;bestD=d;}
    });
    return best;
  }

  function wireCanvas(canvas,def){
    let dragging=false;
    const move=(event,allowSelect)=>{
      const pos=editorPointerPosition(canvas,event,def.view,def.facing());
      if(allowSelect){
        const nearest=nearestMarking(def.view,def.facing(),pos.nx,pos.ny,pos.bounds);
        if(nearest>=0)selectedIndex=nearest;
        else if(selectedIndex<0)addMarking(editorRoot.querySelector('#body-marking-design')?.value,pos.u,pos.v);
      }
      const selected=creatorMarkings[selectedIndex];if(!selected)return;
      selected.u=pos.u;selected.v=pos.v;refreshAll();
    };
    canvas.addEventListener('pointerdown',event=>{dragging=true;canvas.setPointerCapture?.(event.pointerId);move(event,true);event.preventDefault();});
    canvas.addEventListener('pointermove',event=>{if(dragging){move(event,false);event.preventDefault();}});
    const stop=()=>{dragging=false;};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  }

  function installEditor(){
    if(editorRoot?.isConnected)return true;
    const appearanceCanvas=document.getElementById('appearance-preview-canvas');
    const appearanceGroup=appearanceCanvas?.closest('.form-group');if(!appearanceGroup)return false;
    const root=document.createElement('div');root.className='form-group';root.id='body-marking-editor';
    root.innerHTML=`
      <label>Scars & tattoos:</label>
      <div style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;">
        <select id="body-marking-design">${Object.entries(DESIGNS).map(([id,d])=>`<option value="${id}">${d.label}</option>`).join('')}</select>
        <button type="button" id="body-marking-add" style="width:auto;padding:6px 9px;">Add</button>
        <select id="body-marking-selected" style="grid-column:1 / -1;"></select>
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 8px;align-items:center;margin-top:7px;">
        <label for="body-marking-size" style="font-weight:normal;font-size:.82em;">Size</label><input id="body-marking-size" type="range" min="4" max="36" value="11">
        <label for="body-marking-rotation" style="font-weight:normal;font-size:.82em;">Rotation</label><input id="body-marking-rotation" type="range" min="-180" max="180" value="0">
        <label for="body-marking-side" style="font-weight:normal;font-size:.82em;">Side view</label><select id="body-marking-side"><option value="right">Right side</option><option value="left">Left side</option></select>
      </div>
      <div style="display:flex;gap:5px;justify-content:center;margin-top:8px;touch-action:none;">
        ${['front','side','back'].map(id=>`<div style="text-align:center;min-width:0;"><div data-marking-label="${id}" style="font-size:.72em;color:#bbb;margin-bottom:2px;"></div><canvas data-marking-view="${id}" width="92" height="142" style="width:min(27vw,92px);height:auto;border:1px solid #555;border-radius:4px;background:#202020;touch-action:none;"></canvas></div>`).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
        <button type="button" id="body-marking-delete" style="width:auto;padding:5px 8px;background:#7b3333;">Remove</button>
        <small style="color:#aaa;line-height:1.25;">Drag a marking on any view. Placement is stored around the body, so marks near an edge can wrap into the adjacent view.</small>
      </div>`;
    appearanceGroup.insertAdjacentElement('afterend',root);editorRoot=root;

    root.querySelector('#body-marking-add').addEventListener('click',()=>addMarking(root.querySelector('#body-marking-design').value));
    root.querySelector('#body-marking-selected').addEventListener('change',e=>{selectedIndex=Number(e.target.value);redrawEditor();});
    root.querySelector('#body-marking-size').addEventListener('input',e=>{if(creatorMarkings[selectedIndex]){creatorMarkings[selectedIndex].size=Number(e.target.value)/100;refreshAll();}});
    root.querySelector('#body-marking-rotation').addEventListener('input',e=>{if(creatorMarkings[selectedIndex]){creatorMarkings[selectedIndex].rotation=Number(e.target.value);refreshAll();}});
    root.querySelector('#body-marking-side').addEventListener('change',e=>{sideEditorFacing=e.target.value==='left'?'left':'right';redrawEditor();});
    root.querySelector('#body-marking-delete').addEventListener('click',()=>{if(selectedIndex>=0){creatorMarkings.splice(selectedIndex,1);selectedIndex=Math.min(selectedIndex,creatorMarkings.length-1);refreshAll();}});
    wireCanvas(root.querySelector('canvas[data-marking-view="front"]'),{view:'front',facing:()=> 'down'});
    wireCanvas(root.querySelector('canvas[data-marking-view="side"]'),{view:'side',facing:()=> sideEditorFacing});
    wireCanvas(root.querySelector('canvas[data-marking-view="back"]'),{view:'back',facing:()=> 'up'});
    for(const id of ['race-select','gender-select','body-type-select','skin-tone-slider','skin-hue-slider','fantasy-skin-check']) document.getElementById(id)?.addEventListener('input',redrawEditor);
    redrawEditor();return true;
  }

  function installAll(){installInitialiserHook();installClothingHook();installEditor();}
  setInterval(()=>{
    installAll();
    // Keep watching: compatibility modules can replace clothingSystem.drawSlot
    // after our first install. Re-wrap only when that actually happens.
    if(window.clothingSystem?.drawSlot!==installedClothingWrapper)installClothingHook();
    if(window.initializePlayer!==installedInitialiser)installInitialiserHook();
  },100);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAll,{once:true});else installAll();

  window.bodyMarkingSystem={
    build:BUILD,designs:DESIGNS,creatorMarkings,getCreatorMarkings:()=>cloneMarkings(creatorMarkings),
    setCreatorMarkings:list=>{creatorMarkings.splice(0,creatorMarkings.length,...cloneMarkings(list));selectedIndex=creatorMarkings.length?0:-1;refreshAll();},
    addCreatorMarking:addMarking,drawLayer,project,surfaceFromPoint,cloneMarkings,redrawEditor,
  };
})();
