// Explicit garment layers: one authored image per colourable part.
(() => {
  'use strict';
  const BUILD='20260928-clothing-layers-v5';
  // Draw order is innermost -> outermost. Preload order is the reverse so a
  // partially loaded character gets useful outer clothing before underwear,
  // and the renderer can gate body drawing on requested visible clothes.
  const slots=['underwear','bra','pants','shirt'];
  const preloadSlots=['shirt','pants','bra','underwear'];
  const labels={underwear:'Underwear',bra:'Bra',pants:'Pants',shirt:'Shirt / Dress'};
  const images=new Map(), tinted=new Map();

  const singleLayer=(slot,path,label)=>({
    slot,
    layers:[{
      id:'base',
      label,
      defaultColor:{hue:110,saturation:55,value:62},
      views:{front:path,side:path,back:path},
    }],
  });
  const twoToneGarment=(slot,views,labelDark,labelLight)=>({
    slot,
    layers:[
      {id:'dark',label:labelDark,defaultColor:{hue:110,saturation:60,value:42},views,sourceTone:'darkGreen'},
      {id:'light',label:labelLight,defaultColor:{hue:110,saturation:45,value:72},views,sourceTone:'lightGreen'},
    ],
  });

  const GARMENTS={
    top_blouse:singleLayer('shirt','images/equipment/clothing/top_blouse.png','Blouse'),
    top_dress:singleLayer('shirt','images/equipment/clothing/top_dress.png','Dress'),
    top_shirt:singleLayer('shirt','images/equipment/clothing/top_shirt.png','Shirt'),
    top_tunic:singleLayer('shirt','images/equipment/clothing/top_tunic.png','Tunic'),
    pants_baggy_wraps:singleLayer('pants','images/equipment/clothing/pants_baggy_wraps.png','Baggy wraps'),
    pants_breeches:singleLayer('pants','images/equipment/clothing/pants_breeches.png','Breeches'),
    pants_hose:singleLayer('pants','images/equipment/clothing/pants_hose.png','Hose'),
    pants_trousers:singleLayer('pants','images/equipment/clothing/pants_trousers.png','Trousers'),
    underwear_briefs:twoToneGarment(
      'underwear',
      {
        front:'images/equipment/clothing/briefs_female_front.jpg',
        back:'images/equipment/clothing/briefs_female_back.jpg',
      },
      'Main',
      'Trim'
    ),
    underwear_bra:twoToneGarment(
      'bra',
      {
        front:'images/equipment/clothing/bra_front.jpg',
        back:'images/equipment/clothing/bra_back.jpg',
      },
      'Main',
      'Trim'
    ),
  };
  const TOPS=['top_blouse','top_dress','top_shirt','top_tunic'];
  const PANTS=['pants_baggy_wraps','pants_breeches','pants_hose','pants_trousers'];
  const PLAYER_DEFAULT={
    shirt:'top_shirt',
    pants:'pants_trousers',
    underwear:'underwear_briefs',
    bra:'underwear_bra',
  };
  const HUMANOID_RACES=new Set(['human','elf','dwarf','goblin','orc']);

  function legacy(itemId){
    if(itemId!=='traveler_garb') return null;
    return {
      slot:'shirt',
      layers:[{
        id:'base',
        label:'Base',
        defaultColor:{hue:28,saturation:76,value:70},
        views:{
          front:'images/equipment/clothing/traveler_garb_front.svg',
          side:'images/equipment/clothing/traveler_garb_side.svg',
          back:'images/equipment/clothing/traveler_garb_back.svg',
        },
      }],
    };
  }

  function layer(raw,i){
    const c=raw.defaultColor||raw.color||{};
    return {
      id:String(raw.id||raw.key||`part${i+1}`),
      label:String(raw.label||raw.name||`Part ${i+1}`),
      tint:raw.tint!==false,
      views:raw.views||{},
      sourceTone:raw.sourceTone||null,
      defaultColor:{
        hue:Number(c.hue??30),
        saturation:Number(c.saturation??70),
        value:Number(c.value??70),
      },
    };
  }

  function spec(itemId){
    const item=window.items?.[itemId], builtin=GARMENTS[itemId], old=legacy(itemId);
    if(!item&&!builtin&&!old) return null;
    const source=builtin||old;
    const slot=item?.clothingSlot||source?.slot||(item?.type==='clothes'?'shirt':null);
    if(!slots.includes(slot)) return null;
    const raw=(Array.isArray(item?.clothingLayers)&&item.clothingLayers.length)
      ? item.clothingLayers
      : (source?.layers||[{
          id:'base',
          label:'Base',
          views:item?.clothingViews||{},
          defaultColor:{hue:30,saturation:70,value:70},
        }]);
    return {slot,layers:raw.map(layer)};
  }

  function registerBuiltinItems(){
    if(!window.items) return false;
    const names={
      top_blouse:'Blouse',
      top_dress:'Dress',
      top_shirt:'Shirt',
      top_tunic:'Tunic',
      pants_baggy_wraps:'Baggy Wraps',
      pants_breeches:'Breeches',
      pants_hose:'Hose',
      pants_trousers:'Trousers',
      underwear_briefs:'Briefs',
      underwear_bra:'Bra',
    };
    for(const [id,g] of Object.entries(GARMENTS)){
      if(!window.items[id]) window.items[id]={name:names[id]||id,type:'clothes',clothingSlot:g.slot};
    }
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

  function hash(text){
    let h=2166136261;
    for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
    return h>>>0;
  }

  function eligible(e){return !!e&&HUMANOID_RACES.has(e.race)&&!!e.gender;}

  function hasFeminineBody(e){
    // Current direct humanoid body selection is keyed by race + gender.
    // Keep this helper narrow so a future explicit body-presentation field
    // can replace it without touching wardrobe assignment.
    return e?.gender==='female';
  }

  function deterministicColour(seed,offset=0){
    const h=hash(`${seed}|${offset}`);
    return {hue:h%360,saturation:48+((h>>>9)%38),value:48+((h>>>16)%32)};
  }

  function ensureDefaultOutfit(e,{player=false}={}){
    if(!e?.equipped||!eligible(e)) return false;
    migrate(e);
    registerBuiltinItems();
    const seed=e.name||`${e.race}_${e.gender}`;

    if(!e.equipped.shirt) e.equipped.shirt=player?PLAYER_DEFAULT.shirt:TOPS[hash(`${seed}|top`)%TOPS.length];
    if(!e.equipped.pants) e.equipped.pants=player?PLAYER_DEFAULT.pants:PANTS[hash(`${seed}|pants`)%PANTS.length];

    if(player&&!e.equipped.underwear) e.equipped.underwear=PLAYER_DEFAULT.underwear;
    if(player&&hasFeminineBody(e)&&!e.equipped.bra) e.equipped.bra=PLAYER_DEFAULT.bra;

    if(player&&Array.isArray(e.inventory)){
      for(const slot of ['shirt','pants','underwear','bra']){
        const id=e.equipped[slot];
        if(id&&!e.inventory.includes(id)) e.inventory.push(id);
      }
    }

    for(const [slot,offset] of [['shirt',1],['pants',2],['underwear',3],['bra',4]]){
      const itemId=e.equipped[slot],s=itemId&&spec(itemId);
      if(!s) continue;
      for(const l of s.layers){
        const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});
        if(!all[l.id]){
          all[l.id]=player
            ? {...l.defaultColor}
            : deterministicColour(seed,offset+(l.id==='light'?17:0));
        }
      }
    }
    return true;
  }

  function colour(e,itemId,l){
    migrate(e);
    const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});
    return all[l.id]||(all[l.id]={...l.defaultColor});
  }

  function setColour(e,itemId,layerId,next){
    migrate(e);
    const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});
    const prev=all[layerId]||{hue:30,saturation:70,value:70};
    all[layerId]={
      hue:Number(next.hue??prev.hue),
      saturation:Number(next.saturation??prev.saturation),
      value:Number(next.value??prev.value),
    };
  }

  function load(src){
    if(!src) return null;
    if(images.has(src)) return images.get(src);
    const img=new Image();
    img.src=`${src}${src.includes('?')?'&':'?'}build=${BUILD}`;
    img.onload=()=>{window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();};
    images.set(src,img);
    return img;
  }

  function view(v){
    return(v==='up'||v==='back')?'back':(v==='left'||v==='right'||v==='side')?'side':'front';
  }

  function sourceForLayer(l,v){
    const resolved=view(v);
    if(l.views?.[resolved]) return l.views[resolved];
    // Underwear art currently has front/back only. Front is an explicit temporary
    // side fallback until dedicated side images are supplied.
    if(resolved==='side') return l.views?.front||l.views?.back||null;
    return l.views?.front||null;
  }

  function preloadOutfit(e,v='front'){
    migrate(e);
    ensureDefaultOutfit(e,{player:e?.side==='player'});
    for(const slot of preloadSlots){
      const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);
      if(!s) continue;
      for(const l of s.layers){
        const src=sourceForLayer(l,v);
        if(src) load(src);
      }
    }
  }

  function visibleSlotsReady(e,v='front'){
    if(e?.displayClothes===false) return true;
    preloadOutfit(e,v);
    for(const slot of preloadSlots){
      const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);
      if(!s) continue;
      for(const l of s.layers){
        const src=sourceForLayer(l,v),img=src&&load(src);
        if(src&&(!img?.complete||!img.naturalWidth)) return false;
      }
    }
    return true;
  }

  function hsvHsl(c){
    if(window.preciseHSVToHSL) return window.preciseHSVToHSL(c);
    const s=Math.max(0,Math.min(100,c.saturation))/100;
    const v=Math.max(0,Math.min(100,c.value))/100;
    const l=v*(1-s/2);
    const ss=(l===0||l===1)?0:(v-l)/Math.min(l,1-l);
    return {hue:c.hue,saturation:ss,lightness:l};
  }

  function hslRgb(h,s,l){
    h=((h%360)+360)%360/360;
    if(!s){const v=Math.round(l*255);return[v,v,v];}
    const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
    const f=t=>{
      if(t<0)t++;
      if(t>1)t--;
      if(t<1/6)return p+(q-p)*6*t;
      if(t<1/2)return q;
      if(t<2/3)return p+(q-p)*(2/3-t)*6;
      return p;
    };
    return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }

  function pixelMatchesTone(r,g,b,a,tone){
    if(!a||!tone) return false;

    // JPEG has no alpha, so isolate the authored green garment from its
    // background here. The tolerance deliberately accepts compressed edge
    // pixels while rejecting neutral/skin/background colours.
    const max=Math.max(r,g,b);
    const avg=(r+g+b)/3;
    const greenDominant=g>=r+7&&g>=b+7&&g>=45;
    if(!greenDominant) return false;

    // The supplied underwear uses two green values. A combined brightness test
    // is more robust than exact RGB matching after JPEG compression.
    const light=max>=150||avg>=118;
    if(tone==='darkGreen') return !light;
    if(tone==='lightGreen') return light;
    return true;
  }

  function tint(img,c,l=null){
    if(!img?.complete||!img.naturalWidth) return img;
    const tone=l?.sourceTone||'all';
    const key=`${img.src}|${c.hue}|${c.saturation}|${c.value}|${tone}`;
    if(tinted.has(key)) return tinted.get(key);

    const target=hsvHsl(c);
    const out=document.createElement('canvas');
    out.width=img.naturalWidth;
    out.height=img.naturalHeight;
    const x=out.getContext('2d',{willReadFrequently:true});
    x.drawImage(img,0,0);

    const d=x.getImageData(0,0,out.width,out.height),p=d.data;
    for(let i=0;i<p.length;i+=4){
      if(!p[i+3]) continue;

      if(l?.sourceTone&&!pixelMatchesTone(p[i],p[i+1],p[i+2],p[i+3],l.sourceTone)){
        p[i+3]=0;
        continue;
      }

      const lum=(Math.max(p[i],p[i+1],p[i+2])+Math.min(p[i],p[i+1],p[i+2]))/510;
      const lightness=Math.max(.02,Math.min(.98,target.lightness+(lum-.5)*.78));
      const rgb=hslRgb(target.hue,target.saturation,lightness);
      p[i]=rgb[0];
      p[i+1]=rgb[1];
      p[i+2]=rgb[2];
    }

    x.putImageData(d,0,0);
    tinted.set(key,out);
    return out;
  }

  function drawSlot(ctx,e,slot,v,bounds){
    migrate(e);
    if(e.displayClothes===false) return false;
    ensureDefaultOutfit(e,{player:e?.side==='player'});

    const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);
    if(!s||s.slot!==slot) return false;

    let drew=false;
    for(const l of s.layers){
      const src=sourceForLayer(l,v),img=load(src);
      if(!img?.complete||!img.naturalWidth) continue;
      ctx.drawImage(
        l.tint?tint(img,colour(e,itemId,l),l):img,
        bounds.left,bounds.top,bounds.width,bounds.height
      );
      drew=true;
    }
    return drew;
  }

  function install(){
    registerBuiltinItems();
    const p=window.player;
    if(p) ensureDefaultOutfit(p,{player:true});
    for(const e of window.entities||[]) ensureDefaultOutfit(e,{player:e?.side==='player'});
  }

  const timer=setInterval(()=>{
    if(registerBuiltinItems()){
      install();
      clearInterval(timer);
    }
  },50);

  // NPCs and companions can spawn well after initial world load. A cheap
  // one-second wardrobe reconciliation gives each humanoid a stable outfit once.
  setInterval(()=>{
    for(const e of window.entities||[]) ensureDefaultOutfit(e,{player:e?.side==='player'});
    if(window.player) ensureDefaultOutfit(window.player,{player:true});
  },1000);

  if(document.readyState==='complete') install();
  else window.addEventListener('load',install,{once:true});

  window.clothingSystem={
    build:BUILD,
    slots,
    preloadSlots,
    slotLabels:labels,
    builtinGarments:GARMENTS,
    playerDefault:PLAYER_DEFAULT,
    getItemSpec:spec,
    migrateLegacyEquipment:migrate,
    ensureDefaultOutfit,
    preloadOutfit,
    visibleSlotsReady,
    getLayerColour:colour,
    setLayerColour:setColour,
    drawSlot,
    tintWholeLayer:tint,
    registerBuiltinItems,
  };
  window.CLOTHING_SLOTS=slots;
})();