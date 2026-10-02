// Explicit garment layers: one authored image per colourable part.
(() => {
  'use strict';
  const BUILD=window.PRESENTATION_BUILD||'20260930-fitted-shirt-fit-v4';
  const slots=['underwear','bra','pants','shirt'];
  const preloadSlots=['shirt','pants','bra','underwear'];
  const labels={underwear:'Underwear',bra:'Bra',pants:'Pants',shirt:'Shirt / Dress'};
  const images=new Map(), tinted=new Map();
  const opaqueBoundsCache=new WeakMap(), toneBoundsCache=new WeakMap(), dressBandBoundsCache=new WeakMap();

  // Human equipment currently shifts the .205-.1.015 heavy-armour target up by
  // .010, so its visible vertical envelope is .195-.1.005. Outer clothing uses
  // exactly that same envelope. The waist split is deliberately higher than the
  // old .5715 seam so trousers meet the torso at the character's actual waist.
  // Front/back and side widths are 90% of the corresponding heavy-armour width.
  const OUTERWEAR={top:.195,waist:.535,bottom:1.005};
  function outerwearTargets(x,w){
    return {
      shirt:{x,y:OUTERWEAR.top,w,h:OUTERWEAR.waist-OUTERWEAR.top},
      pants:{x,y:OUTERWEAR.waist,w,h:OUTERWEAR.bottom-OUTERWEAR.waist},
      dress:{x,y:OUTERWEAR.top,w,h:OUTERWEAR.bottom-OUTERWEAR.top},
    };
  }

  // Outerwear is geometry-locked to the character/armour silhouette rather
  // than depending on the authored PNG aspect ratio. Underwear keeps its own
  // compact torso/pelvis envelopes and preserves authored aspect.
  const CLOTHING_TARGETS={
    front:{
      ...outerwearTargets(.077,.846),
      bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18},
    },
    side:{
      ...outerwearTargets(.212,.576),
      bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18},
    },
    back:{
      ...outerwearTargets(.077,.846),
      bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18},
    },
  };

  // Female body sprites are narrower through the shoulders than the old authored
  // top art, but substantially fuller through the chest/waist than the visible
  // centre of several garment PNGs. Keep sleeve extremities anchored to the
  // normal outerwear box and expand only the central cloth progressively down
  // the torso. This deliberately does not touch bra/underwear sizing, which is
  // already correct and follows a separate aspect-preserving path.
  const FEMININE_TOP_FIT={
    top_blouse:{chest:1.08,waist:1.14},
    // The dress as a whole is 1.75x wider below; 1.7143 here makes the visible
    // front/back waist body section about 2.5x its previous width.
    top_dress:{chest:1.11,waist:1.7143},
    top_shirt_f:{chest:1.73,waist:1.84},
    default:{chest:1.06,waist:1.10},
  };

  const singleLayerViews=(slot,views,label)=>({slot,layers:[{id:'base',label,defaultColor:{hue:110,saturation:55,value:62,opacity:1},views}]});
  const singleLayer=(slot,path,label)=>singleLayerViews(slot,{front:path,side:path,back:path},label);
  const twoToneGarment=(slot,views,labelDark,labelLight)=>({slot,layers:[
    {id:'dark',label:labelDark,defaultColor:{hue:110,saturation:60,value:42,opacity:1},views,sourceTone:'darkGreen'},
    {id:'light',label:labelLight,defaultColor:{hue:110,saturation:45,value:72,opacity:1},views,sourceTone:'lightGreen'},
  ]});
  const twoToneTop=(path)=>twoToneGarment('shirt',{front:path,side:path,back:path},'Main','Trim');

  const GARMENTS={
    top_blouse:twoToneTop('images/equipment/clothing/top_blouse.png'),
    top_dress:{...twoToneTop('images/equipment/clothing/top_dress.png'),fitMode:'dressSplit',waistFraction:.39,maxSkirtWidth:.98},
    top_shirt_f:twoToneTop('images/equipment/clothing/top_shirt_f.png'),
    top_masc_lacework:twoToneTop('images/equipment/clothing/top_masc_lacework.png'),
    top_masc_laced:twoToneTop('images/equipment/clothing/top_masc_laced.png'),
    pants_baggy_wraps:singleLayerViews('pants',{front:'images/equipment/clothing/pants_baggy_wraps_front.png',side:'images/equipment/clothing/pants_baggy_wraps_side.png',back:'images/equipment/clothing/pants_baggy_wraps_back.png'},'Baggy wraps'),
    pants_breeches:singleLayerViews('pants',{front:'images/equipment/clothing/pants_breeches_front.png',side:'images/equipment/clothing/pants_breeches_side.png',back:'images/equipment/clothing/pants_breeches_back.png'},'Breeches'),
    pants_hose:singleLayerViews('pants',{front:'images/equipment/clothing/pants_hose_front.png',side:'images/equipment/clothing/pants_hose_side.png',back:'images/equipment/clothing/pants_hose_back.png'},'Hose'),
    pants_trousers:singleLayerViews('pants',{
      front:'images/equipment/clothing/pants_trousers_front.png',
      // No separately authored side file exists; make the intentional front-art
      // fallback explicit so every directional consumer resolves the same source.
      side:'images/equipment/clothing/pants_trousers_front.png',
      back:'images/equipment/clothing/pants_trousers_back.png',
    },'Trousers'),
    underwear_briefs:twoToneGarment('underwear',{
      front:'images/equipment/clothing/briefs_female_front.png',
      side:'images/equipment/clothing/briefs_female_side.png',
      back:'images/equipment/clothing/briefs_female_back.png',
    },'Main','Trim'),
    underwear_briefs_gstring:twoToneGarment('underwear',{
      front:'images/equipment/clothing/briefs_gstring_front.png',
      side:'images/equipment/clothing/briefs_gstring_side.png',
      back:'images/equipment/clothing/briefs_gstring_back.png',
    },'Main','Trim'),
    underwear_bra:twoToneGarment('bra',{
      front:'images/equipment/clothing/bra_front.png',
      side:'images/equipment/clothing/bra_side.png',
      back:'images/equipment/clothing/bra_back.png',
    },'Main','Trim'),
    underwear_bra_strapless:twoToneGarment('bra',{
      front:'images/equipment/clothing/bra_strapless_front.png',
      side:'images/equipment/clothing/bra_strapless_side.png',
      back:'images/equipment/clothing/bra_strapless_back.png',
    },'Main','Trim'),
  };
  const FEMININE_START_TOPS=['top_blouse','top_dress','top_shirt_f'];
  const MASCULINE_START_TOPS=['top_masc_lacework','top_masc_laced'];
  const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','traveler_garb']);
  const STARTER_PANTS='pants_trousers';
  const PLAYER_DEFAULT={shirt:'top_masc_laced',pants:STARTER_PANTS,underwear:'underwear_briefs',bra:'underwear_bra'};
  const HUMANOID_RACES=new Set(['human','elf','dwarf','goblin','orc']);

  function layer(raw,i){
    const c=raw.defaultColor||raw.color||{};
    return {id:String(raw.id||raw.key||`part${i+1}`),label:String(raw.label||raw.name||`Part ${i+1}`),tint:raw.tint!==false,
      views:raw.views||{},sourceTone:raw.sourceTone||null,
      defaultColor:{hue:Number(c.hue??30),saturation:Number(c.saturation??70),value:Number(c.value??70),opacity:Math.max(0,Math.min(1,Number(c.opacity??1)))}};
  }

  function spec(itemId){
    const item=window.items?.[itemId], builtin=GARMENTS[itemId];
    if(!item&&!builtin) return null;
    const source=builtin;
    const slot=item?.clothingSlot||source?.slot||(item?.type==='clothes'?'shirt':null);
    if(!slots.includes(slot)) return null;
    const raw=(Array.isArray(item?.clothingLayers)&&item.clothingLayers.length)?item.clothingLayers:
      (source?.layers||[{id:'base',label:'Base',views:item?.clothingViews||{},defaultColor:{hue:30,saturation:70,value:70,opacity:1}}]);
    return {
      slot,
      fitMode:item?.clothingFitMode||source?.fitMode||null,
      waistFraction:Number(item?.clothingWaistFraction??source?.waistFraction??.39),
      maxSkirtWidth:Number(item?.clothingMaxSkirtWidth??source?.maxSkirtWidth??.98),
      layers:raw.map(layer),
    };
  }

  function registerBuiltinItems(){
    if(!window.items) return false;
    const names={
      top_blouse:'Blouse',top_dress:'Dress',top_shirt_f:'Fitted Shirt',
      top_masc_lacework:'Lacework Shirt',top_masc_laced:'Laced Tunic',
      pants_baggy_wraps:'Baggy Wraps',pants_breeches:'Breeches',pants_hose:'Hose',pants_trousers:'Unisex Trousers',underwear_briefs:'Briefs',
      underwear_briefs_gstring:'G-string',underwear_bra:'Bra',underwear_bra_strapless:'Strapless Bra'
    };
    for(const [id,g] of Object.entries(GARMENTS)) if(!window.items[id]) window.items[id]={name:names[id]||id,type:'clothes',clothingSlot:g.slot};
    // Classification is for starter-outfit selection/UI only. It is deliberately
    // not consulted by equip logic, so every garment remains wearable by anyone.
    for(const id of FEMININE_START_TOPS) if(window.items[id]) window.items[id].clothingGender='female';
    for(const id of MASCULINE_START_TOPS) if(window.items[id]) window.items[id].clothingGender='male';
    // These were the last pre-overlay top sprites. Their arm geometry no longer
    // matches the direct character compositor, so do not expose them as items.
    for(const id of RETIRED_TOPS) delete window.items[id];
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
  function starterTop(e,seed){const pool=hasFeminineBody(e)?FEMININE_START_TOPS:MASCULINE_START_TOPS;return pool[hash(`${seed}|top`)%pool.length];}
  function deterministicColour(seed,offset=0){const h=hash(`${seed}|${offset}`);return {hue:h%360,saturation:48+((h>>>9)%38),value:48+((h>>>16)%32),opacity:1};}

  function ensureDefaultOutfit(e,{player=false}={}){
    if(!e?.equipped||!eligible(e)) return false;
    migrate(e); registerBuiltinItems();
    const seed=e.name||`${e.race}_${e.gender}`;

    // Existing saves/NPCs can still point at the two retired top sprites. Move
    // them deterministically into the appropriate starting pool without making
    // any garment body-restricted after character creation.
    if(RETIRED_TOPS.has(e.equipped.shirt)) e.equipped.shirt=starterTop(e,seed);

    if(e.clothingDefaultsApplied!==true){
      if(!e.equipped.shirt) e.equipped.shirt=starterTop(e,seed);
      if(!e.equipped.pants) e.equipped.pants=STARTER_PANTS;
      if(player&&!e.equipped.underwear) e.equipped.underwear=PLAYER_DEFAULT.underwear;
      if(player&&hasFeminineBody(e)&&!e.equipped.bra) e.equipped.bra=PLAYER_DEFAULT.bra;
      e.clothingDefaultsApplied=true;
    }

    if(Array.isArray(e.inventory)){
      for(const retired of RETIRED_TOPS){
        let i;
        while((i=e.inventory.indexOf(retired))!==-1) e.inventory.splice(i,1);
      }
      if(player) for(const slot of slots){const id=e.equipped[slot];if(id&&!e.inventory.includes(id)) e.inventory.push(id);}
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

  function load(src){
    if(!src)return null;
    if(images.has(src))return images.get(src);
    const img=window.assetManager.request(src);
    images.set(src,img);
    window.assetManager.whenReady(src).then(()=>{
      window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();window.updateAppearancePreview?.();
    }).catch(()=>{});
    return img;
  }
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
    if(slot==='shirt'){
      if(itemId==='top_dress') return set.dress;
      if(itemId==='top_shirt_f'){
        // The fitted-shirt source has a much wider authored silhouette than the
        // generic clothing box. Make its whole target 20% wider than the prior
        // 1.10 fit while preserving its centre point; torso shaping below then
        // restores the still-wider body section without equally inflating sleeves.
        const w=set.shirt.w*1.32;
        return {...set.shirt,x:set.shirt.x-(w-set.shirt.w)/2,w};
      }
      return set.shirt;
    }
    if(slot==='pants'){
      // Move every pants-slot garment upward without changing its dimensions.
      // Two per cent of the common pants target height gives a small waistband rise.
      const rise=set.pants.h*.02;
      return {...set.pants,y:set.pants.y-rise};
    }
    if(slot==='bra') return set.bra;
    if(slot==='underwear') return set.underwear;
    return null;
  }

  // A dress cannot be fitted from one maximum-width rectangle: a flared hem
  // would shrink the bodice and sleeves. Cache two source bands instead, each
  // with its own horizontal rendered-cloth bounds, while keeping a shared seam.
  // Using the green cloth mask here is important: alpha can include non-cloth
  // authored pixels that tint() subsequently removes, which made the visible
  // dress substantially narrower than the rectangle it was fitted against.
  function dressBands(img,waistFraction=.39){
    let per=dressBandBoundsCache.get(img);if(!per){per=new Map();dressBandBoundsCache.set(img,per);}
    const fraction=Math.max(.20,Math.min(.70,Number(waistFraction)||.39)),key=fraction.toFixed(4);
    if(per.has(key))return per.get(key);
    const full=toneBounds(img),bottom=full.y+full.h;
    const split=Math.max(full.y+1,Math.min(bottom-1,Math.round(full.y+full.h*fraction)));
    let result={
      top:{x:full.x,y:full.y,w:full.w,h:split-full.y},
      skirt:{x:full.x,y:split,w:full.w,h:bottom-split},
    };
    try{
      const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const p=x.getImageData(0,0,w,h).data;
      const xBounds=(y0,y1)=>{
        let left=w,right=-1;
        for(let yy=y0;yy<y1;yy++)for(let xx=0;xx<w;xx++){
          const i=(yy*w+xx)*4,r=p[i],g=p[i+1],b=p[i+2],a=p[i+3];
          if(pixelMatchesTone(r,g,b,a,'darkGreen')||pixelMatchesTone(r,g,b,a,'lightGreen')){if(xx<left)left=xx;if(xx>right)right=xx;}
        }
        return right>=left?{x:left,w:right-left+1}:null;
      };
      const topX=xBounds(full.y,split),skirtX=xBounds(split,bottom);
      if(topX)result.top={x:topX.x,y:full.y,w:topX.w,h:split-full.y};
      if(skirtX)result.skirt={x:skirtX.x,y:split,w:skirtX.w,h:bottom-split};
    }catch(_){/* Keep the common tone width if pixel inspection is unavailable. */}
    per.set(key,result);return result;
  }

  function feminineTopExpansion(itemId,t){
    const p=FEMININE_TOP_FIT[itemId]||FEMININE_TOP_FIT.default;
    const y=Math.max(0,Math.min(1,t));
    if(y<=.45) return 1+(p.chest-1)*(y/.45);
    return p.chest+(p.waist-p.chest)*((y-.45)/.55);
  }

  // Expand the central torso without moving the garment's outside sleeve edge.
  // Front/back are split into left/centre/right source zones: the centre grows
  // as we approach the waist while the two outside zones give up the same space.
  // That closes excessive arm/body gaps and makes the bodice fit the body rather
  // than just making the whole sprite (including sleeves) wider. Side view has
  // no useful left/right sleeve separation, so it receives a smaller centred
  // whole-strip expansion instead.
  function drawFeminineTop(ctx,source,trim,dx,dy,dw,dh,itemId,v){
    if(!trim?.w||!trim?.h)return false;
    const resolved=view(v),strips=Math.min(32,Math.max(12,Math.round(trim.h/10)));
    const centreSource=.52;
    for(let row=0;row<strips;row++){
      const sy0=trim.y+Math.floor(trim.h*row/strips),sy1=trim.y+Math.floor(trim.h*(row+1)/strips);
      if(sy1<=sy0)continue;
      const t=((sy0+sy1)/2-trim.y)/trim.h,expansion=feminineTopExpansion(itemId,t);
      const dy0=dy+dh*((sy0-trim.y)/trim.h),dy1=dy+dh*((sy1-trim.y)/trim.h);
      if(resolved==='side'){
        const sideScale=1+(expansion-1)*.45,stripW=dw*sideScale,stripX=dx+(dw-stripW)/2;
        ctx.drawImage(source,trim.x,sy0,trim.w,sy1-sy0,stripX,dy0,stripW,dy1-dy0+.15);
        continue;
      }
      const srcCentreW=trim.w*centreSource,srcOuterW=(trim.w-srcCentreW)/2;
      // Let the central body section use the requested expansion all the way up
      // to the full garment width. The old 72% clamp flattened larger fit values;
      // this 100% safety clamp only prevents the outer sleeve zones going negative.
      const centreDestW=Math.min(dw,dw*centreSource*expansion),outerDestW=(dw-centreDestW)/2;
      const sxCentre=trim.x+srcOuterW,sxRight=sxCentre+srcCentreW;
      ctx.drawImage(source,trim.x,sy0,srcOuterW,sy1-sy0,dx,dy0,outerDestW,dy1-dy0+.15);
      ctx.drawImage(source,sxCentre,sy0,srcCentreW,sy1-sy0,dx+outerDestW,dy0,centreDestW,dy1-dy0+.15);
      ctx.drawImage(source,sxRight,sy0,srcOuterW,sy1-sy0,dx+outerDestW+centreDestW,dy0,outerDestW,dy1-dy0+.15);
    }
    return true;
  }

  function drawFittedGarment(ctx,source,trim,target,bounds,slot,entity,itemId,v,garmentSpec,geometrySource){
    if(!trim?.w||!trim?.h)return false;
    const targetX=bounds.left+target.x*bounds.width,targetY=bounds.top+target.y*bounds.height;
    const targetW=target.w*bounds.width,targetH=target.h*bounds.height;

    if(slot==='shirt'&&garmentSpec?.fitMode==='dressSplit'&&geometrySource){
      const resolved=view(v),set=CLOTHING_TARGETS[resolved]||CLOTHING_TARGETS.front;
      const bands=dressBands(geometrySource,garmentSpec.waistFraction),topTarget=set.shirt;
      const baseTopW=topTarget.w*bounds.width,topH=topTarget.h*bounds.height;
      const dressWidthScale=itemId==='top_dress'?1.75:1;
      const topW=baseTopW*dressWidthScale;
      const baseTopX=bounds.left+topTarget.x*bounds.width;
      const topX=baseTopX-(topW-baseTopW)/2,topY=bounds.top+topTarget.y*bounds.height;
      const authoredFlare=bands.top.w?bands.skirt.w/bands.top.w:1;
      // First reproduce the old skirt width, including its authored-flare/cap rules,
      // then enlarge that result by 75% so the requested bottom increase is exact.
      const baseMaxSkirtW=Math.max(baseTopW,Math.min(bounds.width,Number(garmentSpec.maxSkirtWidth||.98)*bounds.width));
      const baseSkirtW=Math.min(baseMaxSkirtW,baseTopW*Math.max(1,authoredFlare));
      const skirtW=baseSkirtW*dressWidthScale;
      const skirtX=bounds.left+(bounds.width-skirtW)/2;
      const skirtY=bounds.top+OUTERWEAR.waist*bounds.height;
      const skirtH=(OUTERWEAR.bottom-OUTERWEAR.waist)*bounds.height;
      if(hasFeminineBody(entity)) drawFeminineTop(ctx,source,bands.top,topX,topY,topW,topH,itemId,v);
      else ctx.drawImage(source,bands.top.x,bands.top.y,bands.top.w,bands.top.h,topX,topY,topW,topH);
      ctx.drawImage(source,bands.skirt.x,bands.skirt.y,bands.skirt.w,bands.skirt.h,skirtX,skirtY,skirtW,skirtH);
      return true;
    }

    // Female tops need body-shaped horizontal fitting rather than a single
    // rectangle: preserve the established height and outside sleeve placement,
    // but widen the central chest/waist.
    if(slot==='shirt'){
      if(hasFeminineBody(entity)) return drawFeminineTop(ctx,source,trim,targetX,targetY,targetW,targetH,itemId,v);
      ctx.drawImage(source,trim.x,trim.y,trim.w,trim.h,targetX,targetY,targetW,targetH);
      return true;
    }
    if(slot==='pants'){
      ctx.drawImage(source,trim.x,trim.y,trim.w,trim.h,targetX,targetY,targetW,targetH);
      return true;
    }

    const scale=Math.min(targetW/trim.w,targetH/trim.h);
    let dw=trim.w*scale,dh=trim.h*scale;
    let dx=targetX+(targetW-dw)/2;
    let dy=targetY+(targetH-dh)/2;
    if(slot==='underwear'){
      const briefsRise=dh/3,oldWidth=dw;
      dw*=1.10;
      dx-=(dw-oldWidth)/2;
      dy-=briefsRise;
    }else if(slot==='bra'){
      // Bra placement is body-relative and must not depend on whether briefs are equipped.
      // Keep the same intended high-torso lift using the stable bra target envelope.
      dy-=targetH*.60;
      if(itemId==='underwear_bra'){
        const oldWidth=dw;
        dw*=.90;
        dx+=(oldWidth-dw)/2;
      }
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
      if(target) drew=drawFittedGarment(ctx,rendered,trim,target,bounds,slot,e,itemId,v,s,img)||drew;
      else {ctx.drawImage(rendered,bounds.left,bounds.top,bounds.width,bounds.height);drew=true;}
    }
    return drew;
  }

  function install(){registerBuiltinItems();const p=window.player;if(p)ensureDefaultOutfit(p,{player:true});for(const e of window.entities||[])ensureDefaultOutfit(e,{player:e?.side==='player'});}
  const timer=setInterval(()=>{if(registerBuiltinItems()){install();clearInterval(timer);}},50);
  setInterval(()=>{for(const e of window.entities||[])ensureDefaultOutfit(e,{player:e?.side==='player'});if(window.player)ensureDefaultOutfit(window.player,{player:true});},1000);
  if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});

  window.clothingSystem={build:BUILD,slots,preloadSlots,slotLabels:labels,builtinGarments:GARMENTS,clothingTargets:CLOTHING_TARGETS,outerwearGeometry:{...OUTERWEAR},playerDefault:PLAYER_DEFAULT,starterTops:{feminine:[...FEMININE_START_TOPS],masculine:[...MASCULINE_START_TOPS]},starterPants:STARTER_PANTS,getItemSpec:spec,migrateLegacyEquipment:migrate,ensureDefaultOutfit,preloadOutfit,visibleSlotsReady,getLayerColour:colour,setLayerColour:setColour,drawSlot,tintWholeLayer:tint,registerBuiltinItems};
  window.CLOTHING_SLOTS=slots;
})();