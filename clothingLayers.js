// Explicit garment layers: one authored image per colourable part.
(() => {
  'use strict';
  const BUILD='20260929-clothing-layers-v14';
  const slots=['underwear','bra','pants','shirt'];
  const preloadSlots=['shirt','pants','bra','underwear'];
  const labels={underwear:'Underwear',bra:'Bra',pants:'Pants',shirt:'Shirt / Dress'};
  const images=new Map(), tinted=new Map();
  const opaqueBoundsCache=new WeakMap(), toneBoundsCache=new WeakMap();
  const undergarmentFitMetrics=new WeakMap();

  // Outer clothing stays inside the heavy-armour envelope. Underwear uses its
  // own compact torso/pelvis envelopes instead of being stretched across the
  // full character bounds. All fitted layers preserve their authored aspect.
  const CLOTHING_TARGETS={
    front:{
      shirt:{x:.077,y:.205,w:.846,h:.3665},pants:{x:.077,y:.5715,w:.846,h:.4435},dress:{x:.077,y:.205,w:.846,h:.810},
      bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18},
    },
    side:{
      shirt:{x:.212,y:.205,w:.576,h:.3665},pants:{x:.212,y:.5715,w:.576,h:.4435},dress:{x:.212,y:.205,w:.576,h:.810},
      bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18},
    },
    back:{
      shirt:{x:.077,y:.205,w:.846,h:.3665},pants:{x:.077,y:.5715,w:.846,h:.4435},dress:{x:.077,y:.205,w:.846,h:.810},
      bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18},
    },
  };


  // The old aspect-preserving fit was height-limited, leaving shirts only
  // ~30-55% as wide as the body at the shoulders/chest. Keep authored height,
  // but give outerwear a minimum horizontal envelope. The upper-body values put
  // close clothing near the measured average-body width while leaving a small
  // gap to heavy armour; looser garments and lower-body items get progressively
  // more room. Underwear/bra deliberately keep their compact aspect-preserving fit.
  const OUTERWEAR_WIDTH_USAGE={
    top_blouse:.82,top_dress:.82,top_shirt:.82,top_tunic:.84,
    pants_baggy_wraps:.74,pants_breeches:.70,pants_hose:.62,pants_trousers:.66,
  };
  function outerwearWidthUsage(slot,itemId){
    if(slot!=='shirt'&&slot!=='pants') return null;
    return OUTERWEAR_WIDTH_USAGE[itemId] ?? (slot==='shirt'?.82:.66);
  }

  const singleLayer=(slot,path,label)=>({slot,layers:[{id:'base',label,defaultColor:{hue:110,saturation:55,value:62,opacity:1},views:{front:path,side:path,back:path}}]});
  const twoToneGarment=(slot,views,labelDark,labelLight)=>({slot,layers:[
    {id:'dark',label:labelDark,defaultColor:{hue:110,saturation:60,value:42,opacity:1},views,sourceTone:'darkGreen'},
    {id:'light',label:labelLight,defaultColor:{hue:110,saturation:45,value:72,opacity:1},views,sourceTone:'lightGreen'},
  ]});

  const GARMENTS={
    top_blouse:singleLayer('shirt','images/equipment/clothing/top_blouse.png','Blouse'),
    top_dress:singleLayer('shirt','images/equipment/clothing/top_dress.png','Dress'),
    top_shirt:singleLayer('shirt','images/equipment/clothing/top_shirt.png','Shirt'),
    top_tunic:singleLayer('shirt','images/equipment/clothing/top_tunic.png','Tunic'),
    pants_baggy_wraps:singleLayer('pants','images/equipment/clothing/pants_baggy_wraps.png','Baggy wraps'),
    pants_breeches:singleLayer('pants','images/equipment/clothing/pants_breeches.png','Breeches'),
    pants_hose:singleLayer('pants','images/equipment/clothing/pants_hose.png','Hose'),
    pants_trousers:singleLayer('pants','images/equipment/clothing/pants_trousers.png','Trousers'),
    underwear_briefs:twoToneGarment('underwear',{
      front:'images/equipment/clothing/briefs_female_front.png',
      back:'images/equipment/clothing/briefs_female_back.png',
    },'Main','Trim'),
    underwear_briefs_gstring:twoToneGarment('underwear',{
      front:'images/equipment/clothing/briefs_gstring_front.png',
      side:'images/equipment/clothing/briefs_gstring_side.png',
      back:'images/equipment/clothing/briefs_gstring_back.png',
    },'Main','Trim'),
    underwear_bra:twoToneGarment('bra',{
      front:'images/equipment/clothing/bra_front.png',
      back:'images/equipment/clothing/bra_back.png',
    },'Main','Trim'),
    underwear_bra_strapless:twoToneGarment('bra',{
      front:'images/equipment/clothing/bra_strapless_front.png',
      side:'images/equipment/clothing/bra_strapless_side.png',
      back:'images/equipment/clothing/bra_strapless_back.png',
    },'Main','Trim'),
  };
  const TOPS=['top_blouse','top_dress','top_shirt','top_tunic'];
  const PANTS=['pants_baggy_wraps','pants_breeches','pants_hose','pants_trousers'];
  const PLAYER_DEFAULT={shirt:'top_shirt',pants:'pants_trousers',underwear:'underwear_briefs',bra:'underwear_bra'};
  const HUMANOID_RACES=new Set(['human','elf','dwarf','goblin','orc']);

  function legacy(itemId){
    if(itemId!=='traveler_garb') return null;
    return {slot:'shirt',layers:[{id:'base',label:'Base',defaultColor:{hue:28,saturation:76,value:70,opacity:1},views:{
      front:'images/equipment/clothing/traveler_garb_front.svg',
      side:'images/equipment/clothing/traveler_garb_side.svg',
      back:'images/equipment/clothing/traveler_garb_back.svg',
    }}]};
  }

  function layer(raw,i){
    const c=raw.defaultColor||raw.color||{};
    return {id:String(raw.id||raw.key||`part${i+1}`),label:String(raw.label||raw.name||`Part ${i+1}`),tint:raw.tint!==false,
      views:raw.views||{},sourceTone:raw.sourceTone||null,
      defaultColor:{hue:Number(c.hue??30),saturation:Number(c.saturation??70),value:Number(c.value??70),opacity:Math.max(0,Math.min(1,Number(c.opacity??1)))}};
  }

  function spec(itemId){
    const item=window.items?.[itemId], builtin=GARMENTS[itemId], old=legacy(itemId);
    if(!item&&!builtin&&!old) return null;
    const source=builtin||old;
    const slot=item?.clothingSlot||source?.slot||(item?.type==='clothes'?'shirt':null);
    if(!slots.includes(slot)) return null;
    const raw=(Array.isArray(item?.clothingLayers)&&item.clothingLayers.length)?item.clothingLayers:
      (source?.layers||[{id:'base',label:'Base',views:item?.clothingViews||{},defaultColor:{hue:30,saturation:70,value:70,opacity:1}}]);
    return {slot,layers:raw.map(layer)};
  }

  function registerBuiltinItems(){
    if(!window.items) return false;
    const names={top_blouse:'Blouse',top_dress:'Dress',top_shirt:'Shirt',top_tunic:'Tunic',pants_baggy_wraps:'Baggy Wraps',
      pants_breeches:'Breeches',pants_hose:'Hose',pants_trousers:'Trousers',underwear_briefs:'Briefs',
      underwear_briefs_gstring:'G-string',underwear_bra:'Bra',underwear_bra_strapless:'Strapless Bra'};
    for(const [id,g] of Object.entries(GARMENTS)) if(!window.items[id]) window.items[id]={name:names[id]||id,type:'clothes',clothingSlot:g.slot};
    return true;
  }

  function migrate(e){
    if(!e?.equipped) return;
    slots.forEach(s=>{if(!(s in e.equipped)) e.equipped[s]=null;});
    if(e.equipped.clothes&&!e.equipped.shirt) e.equipped.shirt=e.equipped.clothes;
    if('clothes' in e.equipped) e.equipped.clothes=null;
    if(!e.clothingColors||typeof e.clothingColors!=='object') e.clothingColors={};
    if(e.displayArmour===undefined) e.displayArmour=true;
    if(e.displayClothes===undefined) e.displayClothes=true;
  }

  function hash(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function eligible(e){return !!e&&HUMANOID_RACES.has(e.race)&&!!e.gender;}
  function hasFeminineBody(e){return e?.gender==='female';}
  function deterministicColour(seed,offset=0){const h=hash(`${seed}|${offset}`);return {hue:h%360,saturation:48+((h>>>9)%38),value:48+((h>>>16)%32),opacity:1};}

  function ensureDefaultOutfit(e,{player=false}={}){
    if(!e?.equipped||!eligible(e)) return false;
    migrate(e); registerBuiltinItems();
    const seed=e.name||`${e.race}_${e.gender}`;

    if(e.clothingDefaultsApplied!==true){
      if(!e.equipped.shirt) e.equipped.shirt=player?PLAYER_DEFAULT.shirt:TOPS[hash(`${seed}|top`)%TOPS.length];
      if(!e.equipped.pants) e.equipped.pants=player?PLAYER_DEFAULT.pants:PANTS[hash(`${seed}|pants`)%PANTS.length];
      if(player&&!e.equipped.underwear) e.equipped.underwear=PLAYER_DEFAULT.underwear;
      if(player&&hasFeminineBody(e)&&!e.equipped.bra) e.equipped.bra=PLAYER_DEFAULT.bra;
      e.clothingDefaultsApplied=true;
    }

    if(player&&Array.isArray(e.inventory)){
      for(const slot of slots){const id=e.equipped[slot];if(id&&!e.inventory.includes(id)) e.inventory.push(id);}
    }
    for(const [slot,offset] of [['shirt',1],['pants',2],['underwear',3],['bra',4]]){
      const itemId=e.equipped[slot],s=itemId&&spec(itemId); if(!s) continue;
      for(const l of s.layers){
        const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});
        if(!all[l.id]) all[l.id]=player?{...l.defaultColor}:deterministicColour(seed,offset+(l.id==='light'?17:0));
        else if(all[l.id].opacity===undefined) all[l.id].opacity=1;
      }
    }
    return true;
  }

  function colour(e,itemId,l){
    migrate(e);
    const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});
    const c=all[l.id]||(all[l.id]={...l.defaultColor});
    if(c.opacity===undefined) c.opacity=1;
    return c;
  }
  function setColour(e,itemId,layerId,next){
    migrate(e);
    const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={}),prev=all[layerId]||{hue:30,saturation:70,value:70,opacity:1};
    all[layerId]={
      hue:Number(next.hue??prev.hue),
      saturation:Number(next.saturation??prev.saturation),
      value:Number(next.value??prev.value),
      opacity:Math.max(0,Math.min(1,Number(next.opacity??prev.opacity??1))),
    };
  }

  function load(src){if(!src)return null;if(images.has(src))return images.get(src);const img=new Image();img.src=`${src}${src.includes('?')?'&':'?'}build=${BUILD}`;img.onload=()=>{window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();};images.set(src,img);return img;}
  function view(v){return(v==='up'||v==='back')?'back':(v==='left'||v==='right'||v==='side')?'side':'front';}
  function sourceForLayer(l,v){const resolved=view(v);if(l.views?.[resolved])return l.views[resolved];if(resolved==='side')return l.views?.front||l.views?.back||null;return l.views?.front||null;}

  function preloadOutfit(e,v='front'){
    migrate(e); ensureDefaultOutfit(e,{player:e?.side==='player'});
    for(const slot of preloadSlots){const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);if(!s)continue;for(const l of s.layers){const src=sourceForLayer(l,v);if(src)load(src);}}
  }
  function visibleSlotsReady(e,v='front'){
    // Clothing is optional decoration. Preload it, but never hold the entire humanoid
    // renderer hostage while an individual garment is still loading or has failed.
    if(e?.displayClothes!==false) preloadOutfit(e,v);
    return true;
  }

  function hsvHsl(c){if(window.preciseHSVToHSL)return window.preciseHSVToHSL(c);const s=Math.max(0,Math.min(100,c.saturation))/100,v=Math.max(0,Math.min(100,c.value))/100,l=v*(1-s/2),ss=(l===0||l===1)?0:(v-l)/Math.min(l,1-l);return {hue:c.hue,saturation:ss,lightness:l};}
  function hslRgb(h,s,l){h=((h%360)+360)%360/360;if(!s){const v=Math.round(l*255);return[v,v,v];}const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q,f=t=>{if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];}
  function pixelMatchesTone(r,g,b,a,tone){if(!a||!tone)return false;const max=Math.max(r,g,b),avg=(r+g+b)/3,greenDominant=g>=r+7&&g>=b+7&&g>=45;if(!greenDominant)return false;const light=max>=150||avg>=118;if(tone==='darkGreen')return !light;if(tone==='lightGreen')return light;return true;}

  function tint(img,c,l=null){
    if(!img?.complete||!img.naturalWidth)return img;
    const tone=l?.sourceTone||'all',opacity=Math.max(0,Math.min(1,Number(c.opacity??1))),key=`${img.src}|${c.hue}|${c.saturation}|${c.value}|${opacity}|${tone}`;
    if(tinted.has(key))return tinted.get(key);
    const target=hsvHsl(c),out=document.createElement('canvas');out.width=img.naturalWidth;out.height=img.naturalHeight;const x=out.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const d=x.getImageData(0,0,out.width,out.height),p=d.data;
    for(let i=0;i<p.length;i+=4){
      if(!p[i+3])continue;
      if(l?.sourceTone&&!pixelMatchesTone(p[i],p[i+1],p[i+2],p[i+3],l.sourceTone)){p[i+3]=0;continue;}
      const lum=(Math.max(p[i],p[i+1],p[i+2])+Math.min(p[i],p[i+1],p[i+2]))/510,lightness=Math.max(.02,Math.min(.98,target.lightness+(lum-.5)*.78)),rgb=hslRgb(target.hue,target.saturation,lightness);
      p[i]=rgb[0];p[i+1]=rgb[1];p[i+2]=rgb[2];p[i+3]=Math.round(p[i+3]*opacity);
    }
    x.putImageData(d,0,0);tinted.set(key,out);return out;
  }

  function opaqueBounds(img){
    if(opaqueBoundsCache.has(img)) return opaqueBoundsCache.get(img);
    const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
    let result={x:0,y:0,w,h};
    try{
      const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
      const p=x.getImageData(0,0,w,h).data;let left=w,top=h,right=-1,bottom=-1;
      for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++) if(p[(yy*w+xx)*4+3]>=8){if(xx<left)left=xx;if(xx>right)right=xx;if(yy<top)top=yy;if(yy>bottom)bottom=yy;}
      if(right>=left&&bottom>=top) result={x:left,y:top,w:right-left+1,h:bottom-top+1};
    }catch(_){/* Fall back to the complete source rectangle. */}
    opaqueBoundsCache.set(img,result);return result;
  }

  function toneBounds(img){
    if(toneBoundsCache.has(img)) return toneBoundsCache.get(img);
    const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
    let result=opaqueBounds(img);
    try{
      const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
      const p=x.getImageData(0,0,w,h).data;let left=w,top=h,right=-1,bottom=-1;
      for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++){
        const i=(yy*w+xx)*4,r=p[i],g=p[i+1],b=p[i+2],a=p[i+3];
        if(pixelMatchesTone(r,g,b,a,'darkGreen')||pixelMatchesTone(r,g,b,a,'lightGreen')){
          if(xx<left)left=xx;if(xx>right)right=xx;if(yy<top)top=yy;if(yy>bottom)bottom=yy;
        }
      }
      if(right>=left&&bottom>=top) result={x:left,y:top,w:right-left+1,h:bottom-top+1};
    }catch(_){/* Keep alpha bounds when source pixels cannot be inspected. */}
    toneBoundsCache.set(img,result);return result;
  }

  function clothingTarget(slot,itemId,v){
    const resolved=view(v),set=CLOTHING_TARGETS[resolved]||CLOTHING_TARGETS.front;
    if(slot==='shirt') return itemId==='top_dress'?set.dress:set.shirt;
    if(slot==='pants') return set.pants;
    if(slot==='bra') return set.bra;
    if(slot==='underwear') return set.underwear;
    return null;
  }

  function drawFittedGarment(ctx,source,trim,target,bounds,slot,entity,itemId){
    if(!trim?.w||!trim?.h)return false;
    const targetX=bounds.left+target.x*bounds.width,targetY=bounds.top+target.y*bounds.height;
    const targetW=target.w*bounds.width,targetH=target.h*bounds.height;
    const scale=Math.min(targetW/trim.w,targetH/trim.h);
    let dw=trim.w*scale,dh=trim.h*scale;
    const widthUsage=outerwearWidthUsage(slot,itemId);
    if(widthUsage!==null) dw=Math.max(dw,Math.min(targetW,targetW*widthUsage));
    let dx=targetX+(targetW-dw)/2;
    // Ordinary tops remain bottom-aligned to the waist seam. A dress occupies a
    // taller envelope, so bottom-aligning it makes the neckline hang too low;
    // top-align the dress to the same authored top edge as shirts/armour instead.
    const topAlignedDress=slot==='shirt'&&itemId==='top_dress';
    let dy=topAlignedDress?targetY:(slot==='shirt'?targetY+(targetH-dh):(slot==='pants'?targetY:targetY+(targetH-dh)/2));
    if(slot==='underwear'){
      const briefsRise=dh/3,oldWidth=dw;
      dw*=1.10;
      dx-=(dw-oldWidth)/2;
      dy-=briefsRise;
      if(entity) undergarmentFitMetrics.set(entity,{briefsRise});
    }else if(slot==='bra'){
      // Tie the bra adjustment to the briefs' actual fitted opaque height.
      // drawDirectionalHumanoidInBounds always paints underwear immediately before bra.
      const briefsRise=undergarmentFitMetrics.get(entity)?.briefsRise ?? dh/3;
      dy-=briefsRise*1.8;
    }
    ctx.drawImage(source,trim.x,trim.y,trim.w,trim.h,dx,dy,dw,dh);
    return true;
  }

  function drawSlot(ctx,e,slot,v,bounds){
    migrate(e);if(e.displayClothes===false)return false;if(window.equipmentAppearanceSystem?.isSlotVisible?.(e,slot)===false)return false;ensureDefaultOutfit(e,{player:e?.side==='player'});
    const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);if(!s||s.slot!==slot)return false;let drew=false;
    for(const l of s.layers){
      const src=sourceForLayer(l,v),img=load(src);if(!img?.complete||!img.naturalWidth)continue;
      const rendered=l.tint?tint(img,colour(e,itemId,l),l):img,target=clothingTarget(slot,itemId,v);
      const trim=l.sourceTone?toneBounds(img):opaqueBounds(img);
      if(target) drew=drawFittedGarment(ctx,rendered,trim,target,bounds,slot,e,itemId)||drew;
      else {ctx.drawImage(rendered,bounds.left,bounds.top,bounds.width,bounds.height);drew=true;}
    }
    return drew;
  }

  function install(){registerBuiltinItems();const p=window.player;if(p)ensureDefaultOutfit(p,{player:true});for(const e of window.entities||[])ensureDefaultOutfit(e,{player:e?.side==='player'});}
  const timer=setInterval(()=>{if(registerBuiltinItems()){install();clearInterval(timer);}},50);
  setInterval(()=>{for(const e of window.entities||[])ensureDefaultOutfit(e,{player:e?.side==='player'});if(window.player)ensureDefaultOutfit(window.player,{player:true});},1000);
  if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});

  window.clothingSystem={build:BUILD,slots,preloadSlots,slotLabels:labels,builtinGarments:GARMENTS,clothingTargets:CLOTHING_TARGETS,playerDefault:PLAYER_DEFAULT,getItemSpec:spec,migrateLegacyEquipment:migrate,ensureDefaultOutfit,preloadOutfit,visibleSlotsReady,getLayerColour:colour,setLayerColour:setColour,drawSlot,tintWholeLayer:tint,registerBuiltinItems};
  window.CLOTHING_SLOTS=slots;
})();