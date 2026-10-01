// skirtClothing.js
// One three-view skirt asset supports many in-game skirts through per-character
// length/flare parameters. Side clothing art is authored facing right; the
// humanoid compositor mirrors the whole character for left-facing characters.
(() => {
  'use strict';
  const BUILD='20260929-skirt-clothing-v1';
  const SKIRT_ID='pants_skirt';
  const AUTO_LOWER=new Set(['pants_trousers','pants_shorts',SKIRT_ID]);
  const images=new Map();
  const trimCache=new WeakMap();
  const rowProfileCache=new WeakMap();
  const shapedCache=new WeakMap();
  const state=new WeakMap();
  let installed=false;

  function hash(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function seed(e){return e?.name||`${e?.race||'unknown'}_${e?.gender||'unknown'}`;}
  function day(){return Math.floor(Math.max(0,Number(window.worldSeconds)||0)/86400);}
  function hour(){return typeof window.getCurrentHour==='function'?window.getCurrentHour():((Math.max(0,Number(window.worldSeconds)||0)%86400)/3600);}
  function destinationKey(e){const d=e?.destination;return d?`${d.q},${d.r}`:null;}
  function eligibleFemaleNpc(e){return !!e?.equipped&&e.gender==='female'&&e.side!=='player'&&(e.isNPC||e.side==='neutral')&&['human','elf','dwarf','goblin','orc'].includes(e.race);}

  function registerSkirt(){
    if(!window.items||!window.clothingSystem) return false;
    if(!window.items[SKIRT_ID]){
      window.items[SKIRT_ID]={
        name:'Skirt',type:'clothes',clothingSlot:'pants',clothingGender:'female',
        clothingLayers:[{id:'base',label:'Skirt',defaultColor:{hue:28,saturation:55,value:62,opacity:1},views:{
          front:'images/equipment/clothing/skirt_front.png',
          side:'images/equipment/clothing/skirt_side.png',
          back:'images/equipment/clothing/skirt_back.png',
        }}],
      };
    }
    return true;
  }

  function defaultShape(e){
    const s=seed(e), a=(hash(`${s}|skirt-length`)%10001)/10000, b=(hash(`${s}|skirt-flare`)%10001)/10000;
    return {length:.42+a*.43,flare:b*.30};
  }
  function ensureShape(e){
    e.clothingShape=e.clothingShape&&typeof e.clothingShape==='object'?e.clothingShape:{};
    if(!e.clothingShape[SKIRT_ID]) e.clothingShape[SKIRT_ID]=e.side==='player'?{length:.62,flare:.15}:defaultShape(e);
    const shape=e.clothingShape[SKIRT_ID];
    shape.length=Math.max(.35,Math.min(.90,Number(shape.length??.62)));
    shape.flare=Math.max(0,Math.min(.30,Number(shape.flare??.15)));
    return shape;
  }
  function setShape(e,next){
    const shape=ensureShape(e);
    if(next.length!==undefined) shape.length=Math.max(.35,Math.min(.90,Number(next.length)));
    if(next.flare!==undefined) shape.flare=Math.max(0,Math.min(.30,Number(next.flare)));
    redraw(e);
    return shape;
  }
  function redraw(e){window.equipmentAppearanceSystem?.redraw?.(e);window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();}

  function load(src){
    if(images.has(src)) return images.get(src);
    const img=window.assetManager.request(src);
    images.set(src,img);
    window.assetManager.whenReady(src).then(()=>redraw(window.player)).catch(()=>{});
    return img;
  }
  function ready(img){return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0;}
  function trim(img){
    if(trimCache.has(img)) return trimCache.get(img);
    const w=img.naturalWidth,h=img.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;
    let result={x:0,y:0,w,h};
    try{
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const p=x.getImageData(0,0,w,h).data;
      let left=w,top=h,right=-1,bottom=-1;
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(p[(yy*w+xx)*4+3]>=8){if(xx<left)left=xx;if(xx>right)right=xx;if(yy<top)top=yy;if(yy>bottom)bottom=yy;}
      if(right>=left&&bottom>=top) result={x:left,y:top,w:right-left+1,h:bottom-top+1};
    }catch(_){}
    trimCache.set(img,result);return result;
  }

  function sourceFor(part,v){
    if(v==='back'||v==='up') return part.views?.back||part.views?.front;
    if(v==='side'||v==='left'||v==='right') return part.views?.side||part.views?.front;
    return part.views?.front;
  }

  function rowProfile(img,clip){
    if(rowProfileCache.has(img)) return rowProfileCache.get(img);
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
    const rows=[];let topWidth=1;
    try{
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const p=x.getImageData(0,0,c.width,c.height).data;
      for(let y=0;y<clip.h;y++){
        const yy=clip.y+y;let left=clip.x+clip.w,right=clip.x-1;
        for(let xx=clip.x;xx<clip.x+clip.w;xx++)if(p[(yy*c.width+xx)*4+3]>=8){if(xx<left)left=xx;if(xx>right)right=xx;}
        rows.push(right>=left?{left,right,width:right-left+1}:{left:clip.x,right:clip.x+clip.w-1,width:clip.w});
      }
      const topRows=rows.slice(0,Math.max(1,Math.round(rows.length*.15))).map(r=>r.width).sort((a,b)=>a-b);
      topWidth=topRows[Math.floor(topRows.length*.75)]||clip.w;
    }catch(_){for(let y=0;y<clip.h;y++)rows.push({left:clip.x,right:clip.x+clip.w-1,width:clip.w});topWidth=clip.w;}
    const result={rows,topWidth};rowProfileCache.set(img,result);return result;
  }

  function shapedCanvas(source,img,clip,flare){
    let byFlare=shapedCache.get(source);if(!byFlare){byFlare=new Map();shapedCache.set(source,byFlare);}
    const key=flare.toFixed(3);if(byFlare.has(key))return byFlare.get(key);
    const profile=rowProfile(img,clip),outW=Math.max(1,Math.ceil(profile.topWidth*(1+flare))),outH=clip.h;
    const c=document.createElement('canvas');c.width=outW;c.height=outH;const x=c.getContext('2d');
    const strips=Math.min(48,Math.max(12,outH));
    for(let i=0;i<strips;i++){
      const sy=Math.floor(i*clip.h/strips),sy2=Math.ceil((i+1)*clip.h/strips),sh=Math.max(1,sy2-sy),mid=Math.min(clip.h-1,Math.floor(sy+sh/2));
      const row=profile.rows[mid],t=(sy+sh/2)/clip.h,dw=profile.topWidth*(1+flare*t),dx=(outW-dw)/2;
      x.drawImage(source,row.left,clip.y+sy,row.width,sh,dx,sy,dw,sh+.35);
    }
    byFlare.set(key,c);return c;
  }

  function drawSkirt(ctx,e,v,bounds){
    const cs=window.clothingSystem,spec=cs?.getItemSpec?.(SKIRT_ID),part=spec?.layers?.[0];
    if(!part||e?.displayClothes===false||window.equipmentAppearanceSystem?.isSlotVisible?.(e,'pants')===false) return false;
    const src=sourceFor(part,v),img=load(src);if(!ready(img)) return false;
    const colour=cs.getLayerColour(e,SKIRT_ID,part);
    const rendered=part.tint===false?img:(cs.tintWholeLayer(img,colour,part)||img);
    const clip=trim(img),shape=ensureShape(e);
    const deformed=shapedCanvas(rendered,img,clip,shape.flare);
    const resolved=(v==='back'||v==='up')?'back':(v==='side'||v==='left'||v==='right')?'side':'front';
    const target=cs.clothingTargets?.[resolved]?.pants||cs.clothingTargets?.front?.pants;
    if(!target) return false;
    const topX=bounds.left+target.x*bounds.width;
    const topY=bounds.top+target.y*bounds.height;
    const topW=target.w*bounds.width;
    const h=target.h*bounds.height*shape.length;
    const maxW=topW*(1+shape.flare);
    const dx=topX-(maxW-topW)/2;
    ctx.drawImage(deformed,0,0,deformed.width,deformed.height,dx,topY,maxW,h);
    return true;
  }

  function patchDrawSlot(){
    const cs=window.clothingSystem;
    if(!cs||cs.__skirtDrawPatched||typeof cs.drawSlot!=='function') return false;
    const base=cs.drawSlot;
    cs.drawSlot=function(ctx,e,slot,v,bounds){
      if(slot==='pants'&&e?.equipped?.pants===SKIRT_ID) return drawSkirt(ctx,e,v,bounds);
      // This is the one audited exception to the project convention that side
      // clothing art faces right. Flip its source once here; humanoidRenderer
      // still mirrors the whole stack normally when the character faces left.
      if(slot==='underwear'&&e?.equipped?.underwear==='underwear_briefs_gstring'&&v==='side'){
        const cx=bounds.left+bounds.width/2;ctx.save();ctx.translate(cx,0);ctx.scale(-1,1);ctx.translate(-cx,0);
        try{return base(ctx,e,slot,v,bounds);}finally{ctx.restore();}
      }
      return base(ctx,e,slot,v,bounds);
    };
    cs.__skirtDrawPatched=true;
    return true;
  }

  function seasonalWarmth(){
    const doy=((day()%360)+360)%360;
    return Math.cos(((doy-165)/360)*Math.PI*2)+Math.cos(((hour()-14)/24)*Math.PI*2)*.12;
  }
  function skirtThreshold(e){const u=(hash(`${seed(e)}|skirt-preference`)%10001)/10000;return .55+u*1.30;}
  function preferredNonSkirt(e){return window.seasonalClothing?.choosePants?.(e)||'pants_trousers';}
  function chooseLower(e){
    const daily=(((hash(`${seed(e)}|skirt-weather|${day()}`)%10001)/10000)-.5)*.12;
    return seasonalWarmth()+daily>=skirtThreshold(e)?SKIRT_ID:preferredNonSkirt(e);
  }
  function reconsider(e){
    if(!eligibleFemaleNpc(e)) return false;
    const current=e.equipped.pants;if(current&&!AUTO_LOWER.has(current)) return false;
    const next=chooseLower(e);if(next===current)return false;
    // Skirts, shorts and trousers are separate physical garments. Switching
    // outfit must not copy colour/material controls between their instances.
    e.equipped.pants=next;
    if(next===SKIRT_ID)ensureShape(e);
    if(Array.isArray(e.inventory)&&!e.inventory.includes(next))e.inventory.push(next);
    return true;
  }

  function updateNpcClothes(){
    const d=day(),all=window.entities||[];
    for(const e of all){
      if(!eligibleFemaleNpc(e))continue;
      let s=state.get(e);if(!s){s={initialDone:false,lastDepartureDay:null,lastDestination:null};state.set(e,s);}
      if(!s.initialDone){reconsider(e);s.initialDone=true;}
      const dest=destinationKey(e),routine=e.isNPC&&(e.prefersRoads||dest),justSetOff=routine&&dest&&!s.lastDestination;
      if(justSetOff&&s.lastDepartureDay!==d){reconsider(e);s.lastDepartureDay=d;}
      s.lastDestination=dest;
    }
  }

  function sliderRow(label,min,max,value,onChange,suffix=''){const row=document.createElement('label');row.style.cssText='display:grid;grid-template-columns:130px 1fr 44px;gap:8px;align-items:center;margin:5px 0;font-size:.88em;';const t=document.createElement('span');t.textContent=label;const i=document.createElement('input');i.type='range';i.min=String(min);i.max=String(max);i.step='1';i.value=String(value);const out=document.createElement('span');out.style.cssText='font-size:.8em;text-align:right;color:#bbb;';out.textContent=`${value}${suffix}`;i.oninput=()=>{out.textContent=`${i.value}${suffix}`;onChange(Number(i.value));};row.append(t,i,out);return row;}
  function decorateEditor(){
    const p=window.player;if(!p)return;
    for(const editor of document.querySelectorAll('[data-item-appearance-editor]')){
      if(editor.querySelector('[data-skirt-shape-controls]'))continue;
      const title=editor.querySelector('strong')?.textContent||'';if(!title.includes(window.items?.[SKIRT_ID]?.name||'Skirt'))continue;
      const shape=ensureShape(p),box=document.createElement('div');box.dataset.skirtShapeControls='true';box.style.cssText='border:1px solid #444;border-radius:4px;padding:7px;margin:6px 0;';
      const h=document.createElement('div');h.textContent='Skirt shape';h.style.cssText='font-size:.85em;font-weight:bold;margin-bottom:4px;';box.appendChild(h);
      box.appendChild(sliderRow('Length',35,90,Math.round(shape.length*100),n=>setShape(p,{length:n/100}),'%'));
      box.appendChild(sliderRow('Hem flare',0,30,Math.round(shape.flare*100),n=>setShape(p,{flare:n/100}),'%'));
      editor.appendChild(box);
    }
  }

  function install(){
    if(installed)return;if(!registerSkirt())return;patchDrawSlot();installed=true;updateNpcClothes();
    setInterval(()=>{registerSkirt();patchDrawSlot();updateNpcClothes();decorateEditor();},1000);
    new MutationObserver(decorateEditor).observe(document.body,{childList:true,subtree:true});
  }
  const timer=setInterval(()=>{install();if(installed)clearInterval(timer);},50);
  if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
  window.skirtClothing={build:BUILD,itemId:SKIRT_ID,ensureShape,setShape,chooseLower,reconsider};
})();
