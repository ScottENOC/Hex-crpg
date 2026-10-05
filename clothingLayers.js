// Explicit garment layers: one authored image per colourable part.
(() => {
  'use strict';
  const BUILD='20261005-unified-clothing-v2';
  window.__clothingRendererBuild=BUILD;
  const slots=['underwear','bra','pants','shirt','shoes'];
  const preloadSlots=['shirt','pants','shoes','bra','underwear'];
  const labels={underwear:'Underwear',bra:'Bra',pants:'Pants',shirt:'Shirt / Dress',shoes:'Shoes'};
  const images=new Map(), tinted=new Map();
  const opaqueBoundsCache=new WeakMap(), toneBoundsCache=new WeakMap(), dressBandBoundsCache=new WeakMap();
  let lastDrawDiagnostics=[];
  const OUTERWEAR={top:.195,waist:.535,bottom:1.005};
  function outerwearTargets(x,w){return {shirt:{x,y:OUTERWEAR.top,w,h:OUTERWEAR.waist-OUTERWEAR.top},pants:{x,y:OUTERWEAR.waist,w,h:OUTERWEAR.bottom-OUTERWEAR.waist},dress:{x,y:OUTERWEAR.top,w,h:OUTERWEAR.bottom-OUTERWEAR.top}};}
  const CLOTHING_TARGETS={front:{...outerwearTargets(.077,.846),bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18}},side:{...outerwearTargets(.212,.576),bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18}},back:{...outerwearTargets(.077,.846),bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18}}};
  const singleLayerViews=(slot,views,label)=>({slot,layers:[{id:'base',label,defaultColor:{hue:110,saturation:55,value:62,opacity:1},views}]});
  const twoToneGarment=(slot,views,labelDark,labelLight)=>({slot,layers:[{id:'dark',label:labelDark,defaultColor:{hue:110,saturation:60,value:42,opacity:1},views,sourceTone:'darkGreen'},{id:'light',label:labelLight,defaultColor:{hue:110,saturation:45,value:72,opacity:1},views,sourceTone:'lightGreen'}]});
  const twoToneTopViews=views=>twoToneGarment('shirt',views,'Main','Trim');
  const DEFAULT_SHOE_COLOR={hue:110,saturation:55,value:62,opacity:1},PLAYER_SHOE_COLOR={hue:28,saturation:68,value:32,opacity:1};
  const footwearViews=views=>({slot:'shoes',layers:[{id:'base',label:'Shoes',defaultColor:{...DEFAULT_SHOE_COLOR},views,geometry:{type:'splitFeet',bottom:1.006,height:.22,frontSpread:.24,backSpread:.24,maxWidth:.25,sideMaxWidth:.34,scale:1.30,outwardShift:.40}}]});
  const GARMENTS={
    top_blouse:twoToneTopViews({front:'images/equipment/clothing/top_blouse_front.png',side:'images/equipment/clothing/top_blouse_side.png',back:'images/equipment/clothing/top_blouse_back.png'}),
    top_dress:twoToneTopViews({front:'images/equipment/clothing/top_dress_front.png',side:'images/equipment/clothing/top_dress_side.png',back:'images/equipment/clothing/top_dress_back.png'}),
    top_shirt_f:twoToneTopViews({front:'images/equipment/clothing/top_shirt_f_front.png',side:'images/equipment/clothing/top_shirt_f_side.png',back:'images/equipment/clothing/top_shirt_f_back.png'}),
    top_masc_laced:twoToneTopViews({front:'images/equipment/clothing/top_masc_laced_front.png',side:'images/equipment/clothing/top_masc_laced_side.png',back:'images/equipment/clothing/top_masc_laced_back.png'}),
    pants_baggy_wraps:singleLayerViews('pants',{front:'images/equipment/clothing/pants_baggy_wraps_front.png',side:'images/equipment/clothing/pants_baggy_wraps_side.png',back:'images/equipment/clothing/pants_baggy_wraps_back.png'},'Baggy wraps'),
    pants_breeches:singleLayerViews('pants',{front:'images/equipment/clothing/pants_breeches_front.png',side:'images/equipment/clothing/pants_breeches_side.png',back:'images/equipment/clothing/pants_breeches_back.png'},'Breeches'),
    pants_lattice:singleLayerViews('pants',{front:'images/equipment/clothing/pants_lattice_front.png',side:'images/equipment/clothing/pants_lattice_side.png',back:'images/equipment/clothing/pants_lattice_back.png'},'Lattice trousers'),
    pants_hose:singleLayerViews('pants',{front:'images/equipment/clothing/pants_hose_front.png',side:'images/equipment/clothing/pants_hose_side.png',back:'images/equipment/clothing/pants_hose_back.png'},'Hose'),
    pants_trousers:singleLayerViews('pants',{front:'images/equipment/clothing/pants_trousers_front.png',side:'images/equipment/clothing/pants_trousers_side.png',back:'images/equipment/clothing/pants_trousers_back.png'},'Trousers'),
    underwear_briefs:twoToneGarment('underwear',{front:'images/equipment/clothing/briefs_female_front.png',side:'images/equipment/clothing/briefs_female_side.png',back:'images/equipment/clothing/briefs_female_back.png'},'Main','Trim'),
    underwear_briefs_gstring:twoToneGarment('underwear',{front:'images/equipment/clothing/briefs_gstring_front.png',side:'images/equipment/clothing/briefs_gstring_side.png',back:'images/equipment/clothing/briefs_gstring_back.png'},'Main','Trim'),
    underwear_bra:twoToneGarment('bra',{front:'images/equipment/clothing/bra_front.png',side:'images/equipment/clothing/bra_side.png',back:'images/equipment/clothing/bra_back.png'},'Main','Trim'),
    underwear_bra_halter:twoToneGarment('bra',{front:'images/equipment/clothing/bra_halter_front.png',side:'images/equipment/clothing/bra_halter_side.png',back:'images/equipment/clothing/bra_halter_back.png'},'Main','Trim'),
    underwear_bra_plunge:twoToneGarment('bra',{front:'images/equipment/clothing/bra_plunge_front.png',side:'images/equipment/clothing/bra_plunge_side.png',back:'images/equipment/clothing/bra_plunge_back.png'},'Main','Trim'),
    underwear_bra_strapless:twoToneGarment('bra',{front:'images/equipment/clothing/bra_strapless_front.png',side:'images/equipment/clothing/bra_strapless_side.png',back:'images/equipment/clothing/bra_strapless_back.png'},'Main','Trim'),
    boots:footwearViews({front:'images/equipment/clothing/boots_front.png',side:'images/equipment/clothing/boots_side.png',back:'images/equipment/clothing/boots_back.png'})
  };
  const FEMININE_START_TOPS=['top_blouse','top_dress','top_shirt_f'],MASCULINE_START_TOPS=['top_masc_laced'];
  const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','top_masc_lacework','traveler_garb']);
  const STARTER_PANTS='pants_breeches',PLAYER_DEFAULT={shirt:'top_masc_laced',pants:STARTER_PANTS,underwear:'underwear_briefs',bra:'underwear_bra',shoes:'boots'},HUMANOID_RACES=new Set(['human','elf','dwarf','goblin','orc']);
  function layer(raw,i){const c=raw.defaultColor||raw.color||{};return{id:String(raw.id||raw.key||`part${i+1}`),label:String(raw.label||raw.name||`Part ${i+1}`),tint:raw.tint!==false,views:raw.views||{},sourceTone:raw.sourceTone||null,geometry:raw.geometry||null,defaultColor:{hue:Number(c.hue??30),saturation:Number(c.saturation??70),value:Number(c.value??70),opacity:Math.max(0,Math.min(1,Number(c.opacity??1)))}};}
  function spec(itemId){const item=window.items?.[itemId],builtin=GARMENTS[itemId];if(!item&&!builtin)return null;const source=builtin,slot=item?.clothingSlot||source?.slot||(item?.type==='clothes'?'shirt':null);if(!slots.includes(slot))return null;/* Built-in presentation garments are authoritative. Older item records can still carry stale clothingLayers from the retired renderer; allowing those records to override GARMENTS makes a front render silently select a side-only/legacy layer. Runtime-added garments continue to use their own clothingLayers. */const raw=source?.layers||(Array.isArray(item?.clothingLayers)&&item.clothingLayers.length?item.clothingLayers:[{id:'base',label:'Base',views:item?.clothingViews||{},defaultColor:{hue:30,saturation:70,value:70,opacity:1}}]);return{slot,fitMode:item?.clothingFitMode??source?.fitMode??null,waistFraction:Number(item?.clothingWaistFraction??source?.waistFraction??.39),maxSkirtWidth:Number(item?.clothingMaxSkirtWidth??source?.maxSkirtWidth??.98),layers:raw.map(layer)};}
  function registerBuiltinItems(){if(!window.items)return false;const names={boots:'Boots',pants_lattice:'Lattice Trousers',top_blouse:'Blouse',top_dress:'Dress',top_shirt_f:'Fitted Shirt',top_masc_laced:'Laced Tunic',pants_baggy_wraps:'Baggy Wraps',pants_breeches:'Breeches',pants_hose:'Hose',pants_trousers:'Unisex Trousers',underwear_briefs:'Briefs',underwear_briefs_gstring:'G-string',underwear_bra:'Bra',underwear_bra_plunge:'Plunge Bra',underwear_bra_strapless:'Strapless Bra'};for(const[id,g]of Object.entries(GARMENTS))if(!window.items[id])window.items[id]={name:names[id]||id,type:'clothes',clothingSlot:g.slot};for(const id of FEMININE_START_TOPS)if(window.items[id])window.items[id].clothingGender='female';for(const id of MASCULINE_START_TOPS)if(window.items[id])window.items[id].clothingGender='male';for(const id of RETIRED_TOPS)delete window.items[id];return true;}
  function migrate(e){if(!e?.equipped)return;slots.forEach(s=>{if(!(s in e.equipped))e.equipped[s]=null;});if(e.equipped.clothes&&!e.equipped.shirt)e.equipped.shirt=e.equipped.clothes;if('clothes'in e.equipped)e.equipped.clothes=null;if(!e.clothingColors||typeof e.clothingColors!=='object')e.clothingColors={};if(e.displayArmour===undefined)e.displayArmour=true;if(e.displayClothes===undefined)e.displayClothes=true;}
  function hash(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function eligible(e){return!!e&&HUMANOID_RACES.has(e.race)&&!!e.gender;}function hasFeminineBody(e){return e?.gender==='female';}function starterTop(e,seed){const pool=hasFeminineBody(e)?FEMININE_START_TOPS:MASCULINE_START_TOPS;return pool[hash(`${seed}|top`)%pool.length];}function deterministicColour(seed,offset=0){const h=hash(`${seed}|${offset}`);return{hue:h%360,saturation:48+((h>>>9)%38),value:48+((h>>>16)%32),opacity:1};}
  function ensureDefaultOutfit(e,{player=false}={}){if(!e?.equipped||!eligible(e))return false;migrate(e);registerBuiltinItems();const seed=e.name||`${e.race}_${e.gender}`;if(RETIRED_TOPS.has(e.equipped.shirt))e.equipped.shirt=starterTop(e,seed);if(e.clothingDefaultsApplied!==true){if(!e.equipped.shirt)e.equipped.shirt=starterTop(e,seed);if(!e.equipped.pants)e.equipped.pants=STARTER_PANTS;if(player&&!e.equipped.underwear)e.equipped.underwear=PLAYER_DEFAULT.underwear;if(player&&hasFeminineBody(e)&&!e.equipped.bra)e.equipped.bra=PLAYER_DEFAULT.bra;e.clothingDefaultsApplied=true;}if(Array.isArray(e.inventory)){for(const retired of RETIRED_TOPS){let i;while((i=e.inventory.indexOf(retired))!==-1)e.inventory.splice(i,1);}if(player)for(const slot of slots){const id=e.equipped[slot];if(id&&!e.inventory.includes(id))e.inventory.push(id);}}for(const[slot,offset]of[['shirt',1],['pants',2],['shoes',5],['underwear',3],['bra',4]]){const itemId=e.equipped[slot],s=itemId&&spec(itemId);if(!s)continue;for(const l of s.layers){const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});if(!all[l.id])all[l.id]=player?{...l.defaultColor}:deterministicColour(seed,offset+(l.id==='light'?17:0));else if(all[l.id].opacity===undefined)all[l.id].opacity=1;}}if(player&&e.equipped.shoes==='boots'){const all=e.clothingColors.boots||(e.clothingColors.boots={});if(!all.base)all.base={...PLAYER_SHOE_COLOR};}return true;}
  function colour(e,itemId,l){migrate(e);const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});const c=all[l.id]||(all[l.id]={...l.defaultColor});if(c.opacity===undefined)c.opacity=1;return c;}
  function setColour(e,itemId,layerId,next){migrate(e);const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={}),prev=all[layerId]||{hue:30,saturation:70,value:70,opacity:1};all[layerId]={hue:Number(next.hue??prev.hue),saturation:Number(next.saturation??prev.saturation),value:Number(next.value??prev.value),opacity:Math.max(0,Math.min(1,Number(next.opacity??prev.opacity??1)))};}
  function load(src){
    if(!src)return null;
    // Some directional presentation helpers may supply a prepared Image/Canvas
    // rather than an asset path. It is already drawable and must not be passed
    // through assetManager, which would stringify it as "[object HTMLImageElement]".
    if(typeof src!=='string') return src;
    if(images.has(src))return images.get(src);
    const img=window.assetManager.request(src);
    images.set(src,img);
    window.assetManager.whenReady(src).then(()=>{window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();window.updateAppearancePreview?.();}).catch(()=>{});
    return img;
  }
  function view(v){return(v==='up'||v==='back')?'back':(v==='left'||v==='right'||v==='side')?'side':'front';}
  function sourceForLayer(l,v){const resolved=view(v);if(l.views?.[resolved])return l.views[resolved];if(resolved==='side')return l.views?.front||l.views?.back||null;return l.views?.front||null;}
  function resolveOutfitAssetPaths(e,views=['front','side','back']){migrate(e);ensureDefaultOutfit(e,{player:e?.side==='player'});if(e?.displayClothes===false)return[];const out=new Set();const slotsToLoad=[...new Set([...preloadSlots,...Object.keys(e?.equipped||{})])];for(const v of views)for(const slot of slotsToLoad){if(window.equipmentAppearanceSystem?.isSlotVisible?.(e,slot)===false)continue;const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);if(!s)continue;for(const l of s.layers){const src=sourceForLayer(l,v);if(typeof src==='string'&&src)out.add(src);}}return[...out];}
  function preloadOutfit(e,v='front'){for(const src of resolveOutfitAssetPaths(e,[v]))load(src);}
  function visibleSlotsReady(e,v='front'){if(e?.displayClothes!==false)preloadOutfit(e,v);return true;}
  function hsvHsl(c){if(window.preciseHSVToHSL)return window.preciseHSVToHSL(c);const s=Math.max(0,Math.min(100,c.saturation))/100,v=Math.max(0,Math.min(100,c.value))/100,l=v*(1-s/2),ss=(l===0||l===1)?0:(v-l)/Math.min(l,1-l);return{hue:c.hue,saturation:ss,lightness:l};}
  function hslRgb(h,s,l){h=((h%360)+360)%360/360;if(!s){const v=Math.round(l*255);return[v,v,v];}const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q,f=t=>{if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};return[Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];}
  function pixelMatchesTone(r,g,b,a,tone){if(!a||!tone)return false;const max=Math.max(r,g,b),avg=(r+g+b)/3,greenDominant=g>=r+7&&g>=b+7&&g>=45;if(!greenDominant)return false;const light=max>=150||avg>=118;if(tone==='darkGreen')return!light;if(tone==='lightGreen')return light;return true;}
  function tint(img,c,l=null){if(!img?.complete||!img.naturalWidth)return img;const tone=l?.sourceTone||'all',opacity=Math.max(0,Math.min(1,Number(c.opacity??1))),key=`${img.src}|${c.hue}|${c.saturation}|${c.value}|${opacity}|${tone}`;if(tinted.has(key))return tinted.get(key);const target=hsvHsl(c),out=document.createElement('canvas');out.width=img.naturalWidth;out.height=img.naturalHeight;const x=out.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const d=x.getImageData(0,0,out.width,out.height),p=d.data;for(let i=0;i<p.length;i+=4){if(!p[i+3])continue;if(l?.sourceTone&&!pixelMatchesTone(p[i],p[i+1],p[i+2],p[i+3],l.sourceTone)){p[i+3]=0;continue;}const lum=(Math.max(p[i],p[i+1],p[i+2])+Math.min(p[i],p[i+1],p[i+2]))/510,lightness=Math.max(.02,Math.min(.98,target.lightness+(lum-.5)*.78)),rgb=hslRgb(target.hue,target.saturation,lightness);p[i]=rgb[0];p[i+1]=rgb[1];p[i+2]=rgb[2];p[i+3]=Math.round(p[i+3]*opacity);}x.putImageData(d,0,0);tinted.set(key,out);return out;}
  function opaqueBounds(img){if(opaqueBoundsCache.has(img))return opaqueBoundsCache.get(img);const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;let result={x:0,y:0,w,h};try{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const p=x.getImageData(0,0,w,h).data;let left=w,top=h,right=-1,bottom=-1;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(p[(yy*w+xx)*4+3]>=8){if(xx<left)left=xx;if(xx>right)right=xx;if(yy<top)top=yy;if(yy>bottom)bottom=yy;}if(right>=left&&bottom>=top)result={x:left,y:top,w:right-left+1,h:bottom-top+1};}catch(_){}opaqueBoundsCache.set(img,result);return result;}
  function toneBounds(img){if(toneBoundsCache.has(img))return toneBoundsCache.get(img);const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;let result=opaqueBounds(img);try{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const p=x.getImageData(0,0,w,h).data;let left=w,top=h,right=-1,bottom=-1;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const i=(yy*w+xx)*4,r=p[i],g=p[i+1],b=p[i+2],a=p[i+3];if(pixelMatchesTone(r,g,b,a,'darkGreen')||pixelMatchesTone(r,g,b,a,'lightGreen')){if(xx<left)left=xx;if(xx>right)right=xx;if(yy<top)top=yy;if(yy>bottom)bottom=yy;}}if(right>=left&&bottom>=top)result={x:left,y:top,w:right-left+1,h:bottom-top+1};}catch(_){}toneBoundsCache.set(img,result);return result;}
  function clothingTarget(slot,itemId,v){const resolved=view(v),set=CLOTHING_TARGETS[resolved]||CLOTHING_TARGETS.front;if(slot==='shirt'){if(itemId==='top_dress')return set.dress;if(itemId==='top_shirt_f'){const w=set.shirt.w*1.32;return{...set.shirt,x:set.shirt.x-(w-set.shirt.w)/2,w};}return set.shirt;}if(slot==='pants'){const rise=set.pants.h*.02;return{...set.pants,y:set.pants.y-rise};}if(slot==='bra')return set.bra;if(slot==='underwear')return set.underwear;return null;}
  function drawFittedGarment(ctx,source,trim,target,bounds,slot,entity,itemId,v,garmentSpec,geometrySource,geometry=null){
    if(!trim?.w||!trim?.h)return false;
    if(geometry?.type==='splitFeet'){
      const w=source.naturalWidth||source.width,h=source.naturalHeight||source.height,full=opaqueBounds(source),mid=full.x+full.w/2; let halves=null;
      try{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(source,0,0);const p=x.getImageData(0,0,w,h).data;const scan=(x0,x1)=>{let l=x1,t=h,r=-1,b=-1;for(let yy=full.y;yy<full.y+full.h;yy++)for(let xx=x0;xx<x1;xx++){if(p[(yy*w+xx)*4+3]<8)continue;if(xx<l)l=xx;if(xx>r)r=xx;if(yy<t)t=yy;if(yy>b)b=yy;}return r>=l&&b>=t?{x:l,y:t,w:r-l+1,h:b-t+1}:null;};halves={left:scan(full.x,Math.floor(mid)),right:scan(Math.ceil(mid),full.x+full.w)};}catch(_){}
      const bottom=bounds.top+Number(geometry.bottom??1)*bounds.height,maxH=Number(geometry.height??.22)*bounds.height,scale=Math.max(0,Number(geometry.scale??1))||1;
      const contained=(src,maxW)=>{const s=Math.min(maxW/src.w,maxH/src.h)*scale;return{w:src.w*s,h:src.h*s};};
      const draw=(src,cx,maxW)=>{if(!src)return;const size=contained(src,maxW);ctx.drawImage(source,src.x,src.y,src.w,src.h,cx-size.w/2,bottom-size.h,size.w,size.h);};
      if(view(v)==='side'){draw(full,bounds.left+bounds.width/2,Number(geometry.sideMaxWidth??.34)*bounds.width);return true;}
      if(!halves?.left||!halves?.right){draw(full,bounds.left+bounds.width/2,bounds.width*.55);return true;}
      const resolved=view(v),spread=Number(resolved==='back'?geometry.backSpread:geometry.frontSpread)||.24,centre=bounds.left+bounds.width/2,halfSpread=spread*bounds.width/2,outward=Math.max(0,Number(geometry.outwardShift??.4)),maxW=Number(geometry.maxWidth??.25)*bounds.width,ls=contained(halves.left,maxW),rs=contained(halves.right,maxW);
      draw(halves.left,centre-halfSpread-outward*ls.w,maxW);draw(halves.right,centre+halfSpread+outward*rs.w,maxW);return true;
    }
    const targetX=bounds.left+target.x*bounds.width,targetY=bounds.top+target.y*bounds.height,targetW=target.w*bounds.width,targetH=target.h*bounds.height;
    if(slot==='shirt'||slot==='pants'){
      ctx.drawImage(source,trim.x,trim.y,trim.w,trim.h,targetX,targetY,targetW,targetH);
      return true;
    }
    const scale=Math.min(targetW/trim.w,targetH/trim.h);
    let dw=trim.w*scale,dh=trim.h*scale,dx=targetX+(targetW-dw)/2,dy=targetY+(targetH-dh)/2;
    if(slot==='underwear'){const briefsRise=dh/3,oldWidth=dw;dw*=1.10;dx-=(dw-oldWidth)/2;dy-=briefsRise;}
    else if(slot==='bra'){dy-=targetH*.60;if(itemId==='underwear_bra'){const oldWidth=dw;dw*=.90;dx+=(oldWidth-dw)/2;}}
    ctx.drawImage(source,trim.x,trim.y,trim.w,trim.h,dx,dy,dw,dh);
    return true;
  }
  function drawSlot(ctx,e,slot,v,bounds){
    migrate(e);
    const diagnostics=[];
    const record=(detail)=>diagnostics.push({slot,view:view(v),...detail});
    if(e.displayClothes===false){record({reason:'displayClothes=false',drawn:false});lastDrawDiagnostics=diagnostics;window.__clothingRendererLastDrawDiagnostics=diagnostics;return false;}
    if(window.equipmentAppearanceSystem?.isSlotVisible?.(e,slot)===false){record({reason:'slot-hidden',drawn:false});lastDrawDiagnostics=diagnostics;window.__clothingRendererLastDrawDiagnostics=diagnostics;return false;}
    ensureDefaultOutfit(e,{player:e?.side==='player'});
    const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);
    if(!s||s.slot!==slot){record({itemId:itemId||null,reason:'no-valid-spec',drawn:false});lastDrawDiagnostics=diagnostics;window.__clothingRendererLastDrawDiagnostics=diagnostics;return false;}
    let allLayersDrawn=true;
    for(const l of s.layers){
      const src=sourceForLayer(l,v),img=load(src);
      const ready=!!img?.complete&&!!img.naturalWidth&&!!img.naturalHeight;
      const detail={itemId,layerId:l.id,source:src||null,status:src?(window.assetManager?.status?.(src)||'unrequested'):'missing-source',imageComplete:!!img?.complete,naturalWidth:img?.naturalWidth||0,naturalHeight:img?.naturalHeight||0,tinted:l.tint,drawn:false,reason:ready?'not-drawn-yet':'image-not-ready'};
      if(!ready){allLayersDrawn=false;diagnostics.push(detail);continue;}
      const rendered=l.tint?tint(img,colour(e,itemId,l),l):img,target=clothingTarget(slot,itemId,v),trim=l.sourceTone?toneBounds(img):opaqueBounds(img);
      if(target||l.geometry) detail.drawn=!!drawFittedGarment(ctx,rendered,trim,target||{x:0,y:0,w:1,h:1},bounds,slot,e,itemId,v,s,img,l.geometry);
      else{ctx.drawImage(rendered,bounds.left,bounds.top,bounds.width,bounds.height);detail.drawn=true;}
      detail.reason=detail.drawn?'drawn':'drawFittedGarment-failed';
      if(!detail.drawn) allLayersDrawn=false;
      diagnostics.push(detail);
    }
    // A multi-layer garment is atomic. Drawing one half of a two-tone garment
    // must never make the clothing slot look "ready", otherwise the humanoid
    // compositor can cache a visibly partial composite as complete.
    lastDrawDiagnostics=diagnostics;window.__clothingRendererLastDrawDiagnostics=diagnostics;return allLayersDrawn;
  }
  function install(){registerBuiltinItems();const p=window.player;if(p)ensureDefaultOutfit(p,{player:true});for(const e of window.entities||[])ensureDefaultOutfit(e,{player:e?.side==='player'});}
  const timer=setInterval(()=>{if(registerBuiltinItems()){install();clearInterval(timer);}},50);setInterval(()=>{for(const e of window.entities||[])ensureDefaultOutfit(e,{player:e?.side==='player'});if(window.player)ensureDefaultOutfit(window.player,{player:true});},1000);if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
  function releaseRenderSources(){
    // Final humanoid composites are the long-lived cache. Source images and
    // generated tint canvases are disposable working data.
    images.clear();
    tinted.clear();
  }
  window.clothingSystem={build:BUILD,slots,preloadSlots,slotLabels:labels,builtinGarments:GARMENTS,clothingTargets:CLOTHING_TARGETS,outerwearGeometry:{...OUTERWEAR},playerDefault:PLAYER_DEFAULT,starterTops:{feminine:[...FEMININE_START_TOPS],masculine:[...MASCULINE_START_TOPS]},starterPants:STARTER_PANTS,getItemSpec:spec,migrateLegacyEquipment:migrate,ensureDefaultOutfit,resolveOutfitAssetPaths,preloadOutfit,visibleSlotsReady,getLayerColour:colour,setLayerColour:setColour,drawSlot,tintWholeLayer:tint,registerBuiltinItems,releaseRenderSources};
  window.CLOTHING_SLOTS=slots;
})();