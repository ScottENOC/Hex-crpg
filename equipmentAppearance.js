// Per-equipped-item rendering visibility plus weapon and armour material colours.
(() => {
  'use strict';
  const BUILD='20261001-equipment-appearance-v4';
  const renderSlots=['weapon','offhand','armor','helmet','shirt','pants','shoes','bra','underwear'];
  const slotLabels={weapon:'Main hand',offhand:'Off hand',armor:'Armour',helmet:'Helmet',shirt:'Shirt / Dress',pants:'Pants',shoes:'Shoes',bra:'Bra',underwear:'Underwear'};
  const tintCache=new WeakMap();
  let armourRenderSourcesInstalled=false;
  let activeArmourEntity=null;
  let activeArmourClearQueued=false;
  const rearArmourPaths={light:'images/equipment/armour/human/light_back.webp',medium:'images/equipment/armour/human/medium_back.webp',heavy:'images/equipment/armour/human/heavy_back.webp'};

  function ensure(e){if(!e)return;if(!e.equipmentVisibility||typeof e.equipmentVisibility!=='object')e.equipmentVisibility={};if(!e.equipmentColors||typeof e.equipmentColors!=='object')e.equipmentColors={};e.displayArmour=true;e.displayClothes=true;}
  function isSlotVisible(e,slot){ensure(e);if(slot==='armor'){activeArmourEntity=e;if(!activeArmourClearQueued){activeArmourClearQueued=true;queueMicrotask(()=>{activeArmourEntity=null;activeArmourClearQueued=false;});}}return e?.equipmentVisibility?.[slot]!==false;}
  function setSlotVisible(e,slot,visible){if(!e||!renderSlots.includes(slot))return;ensure(e);e.equipmentVisibility[slot]=!!visible;}

  function weaponParts(itemId){const item=window.items?.[itemId];if(!item||item.type!=='weapon')return[];const id=String(itemId).toLowerCase();if(id.includes('bow')||id.includes('club')||id.includes('chair')||id.includes('torch'))return['wood'];if(id.includes('axe')||id.includes('pickaxe')||id.includes('spear')||id.includes('sword')||id.includes('dagger'))return['metal','wood'];return['metal'];}
  function defaultWeaponMaterial(part){return part==='wood'?{hue:30,saturation:68,value:55,opacity:1,unlocked:false}:{hue:210,saturation:8,value:72,opacity:1,unlocked:false};}
  function getWeaponMaterial(e,itemId,part){ensure(e);const item=e.equipmentColors[itemId]||(e.equipmentColors[itemId]={});const c=item[part]||(item[part]=defaultWeaponMaterial(part));c.opacity=1;if(c.unlocked===undefined)c.unlocked=false;return c;}
  function setWeaponMaterial(e,itemId,part,next){const prev=getWeaponMaterial(e,itemId,part);e.equipmentColors[itemId][part]={hue:Number(next.hue??prev.hue),saturation:Number(next.saturation??prev.saturation),value:Number(next.value??prev.value),opacity:1,unlocked:!!(next.unlocked??prev.unlocked)};}

  function armourTier(itemId){const item=window.items?.[itemId];if(!item||item.type!=='armor'||item.subType==='barding')return null;const reduction=Number(item.reduction||0);return reduction>=3?'heavy':reduction>=2?'medium':'light';}
  function armourParts(itemId){const tier=armourTier(itemId);if(tier==='light')return['leather','trim'];if(tier==='medium')return['metal','cloth','clothTrim'];if(tier==='heavy')return['metal'];return[];}
  function defaultArmourMaterial(part){
    if(part==='metal')return {hue:210,saturation:8,value:72,opacity:1,unlocked:false};
    if(part==='leather')return {hue:30,saturation:62,value:52,opacity:1,unlocked:false};
    if(part==='trim')return {hue:24,saturation:52,value:34,opacity:1,unlocked:false};
    if(part==='clothTrim')return {hue:38,saturation:70,value:62,opacity:1,unlocked:true};
    return {hue:220,saturation:62,value:52,opacity:1,unlocked:true};
  }
  function getArmourMaterial(e,itemId,part){ensure(e);const item=e.equipmentColors[itemId]||(e.equipmentColors[itemId]={});const c=item[part]||(item[part]=defaultArmourMaterial(part));if(c.opacity===undefined)c.opacity=1;if(c.unlocked===undefined)c.unlocked=part==='cloth'||part==='clothTrim';return c;}
  function setArmourMaterial(e,itemId,part,next){const prev=getArmourMaterial(e,itemId,part);e.equipmentColors[itemId][part]={hue:Number(next.hue??prev.hue),saturation:Number(next.saturation??prev.saturation),value:Number(next.value??prev.value),opacity:Math.max(0,Math.min(1,Number(next.opacity??prev.opacity??1))),unlocked:!!(next.unlocked??prev.unlocked)};}

  function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);}if(h<0)h+=360;return{h,s:max?d/max:0,v:max};}
  function hsvToRgb(h,s,v){h=((h%360)+360)%360;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let a=[0,0,0];if(h<60)a=[c,x,0];else if(h<120)a=[x,c,0];else if(h<180)a=[0,c,x];else if(h<240)a=[0,x,c];else if(h<300)a=[x,0,c];else a=[c,0,x];return a.map(n=>Math.round((n+m)*255));}
  function woodPixel(r,g,b,a){if(!a)return false;const hsv=rgbToHsv(r,g,b);return hsv.s>.16&&hsv.h>=8&&hsv.h<=75&&r>=b*1.05;}
  function weaponWoodPixel(itemId,r,g,b,a){
    if(woodPixel(r,g,b,a))return true;
    if(!a)return false;
    const id=String(itemId||'').toLowerCase();
    if(!(id.includes('sword')||id.includes('dagger')))return false;
    // Sword/dagger grips are much darker and less saturated than the axe haft.
    // Pick up those warm/dark grip pixels without classifying neutral blade steel
    // as wood, so the handle and blade remain independently colourable.
    const hsv=rgbToHsv(r,g,b);
    return hsv.s>.07&&hsv.h>=0&&hsv.h<=90&&r>=b*.94&&hsv.v<.72;
  }
  function armourPixelPart(tier,r,g,b,a){
    if(!a)return null;
    if(tier==='heavy')return 'metal';
    const hsv=rgbToHsv(r,g,b);
    if(tier==='medium'){
      if(hsv.s<.20||(hsv.s<.30&&hsv.v>.68))return 'metal';
      if(hsv.s>.24&&hsv.h>=12&&hsv.h<=78)return 'clothTrim';
      return 'cloth';
    }
    if(hsv.v<.32||hsv.s<.22)return 'trim';
    return 'leather';
  }
  function constrainedMaterial(part,c){
    if(c.unlocked)return {hue:c.hue,saturation:Math.max(.05,Math.min(.95,c.saturation/100)),value:Math.max(.04,Math.min(1,c.value/100))};
    if(part==='metal')return {hue:210,saturation:.08,value:Math.max(.04,Math.min(1,c.value/100))};
    if(part==='wood'||part==='leather'||part==='trim')return {hue:Math.max(15,Math.min(60,c.hue)),saturation:Math.max(.30,Math.min(.85,c.saturation/100)),value:Math.max(.04,Math.min(1,c.value/100))};
    return {hue:c.hue,saturation:Math.max(.05,Math.min(.95,c.saturation/100)),value:Math.max(.04,Math.min(1,c.value/100))};
  }
  function applyMaterial(px,i,src,c,part){const m=constrainedMaterial(part,c),v=Math.max(.03,Math.min(1,m.value+(src.v-.5)*.58)),rgb=hsvToRgb(m.hue,m.saturation,v);px[i]=rgb[0];px[i+1]=rgb[1];px[i+2]=rgb[2];px[i+3]=Math.round(px[i+3]*Math.max(0,Math.min(1,c.opacity??1)));}

  function resolveWeaponImage(e,itemId,image){if(!image||!itemId||!weaponParts(itemId).length)return image;const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!w||!h)return image;const parts=weaponParts(itemId),settings=parts.map(p=>[p,getWeaponMaterial(e,itemId,p)]),key='weapon|'+settings.map(([p,c])=>`${p}:${c.hue}:${c.saturation}:${c.value}:${c.unlocked?1:0}`).join('|');let per=tintCache.get(image);if(!per){per=new Map();tintCache.set(image,per);}if(per.has(key))return per.get(key);const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);const d=ctx.getImageData(0,0,w,h),px=d.data;for(let i=0;i<px.length;i+=4){if(!px[i+3])continue;let part=parts[0];if(parts.includes('metal')&&parts.includes('wood'))part=weaponWoodPixel(itemId,px[i],px[i+1],px[i+2],px[i+3])?'wood':'metal';applyMaterial(px,i,rgbToHsv(px[i],px[i+1],px[i+2]),getWeaponMaterial(e,itemId,part),part);}ctx.putImageData(d,0,0);per.set(key,out);return out;}

  function resolveArmourImage(e,itemId,image){const tier=armourTier(itemId);if(!image||!tier)return image;const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!w||!h)return image;const parts=armourParts(itemId),settings=parts.map(p=>[p,getArmourMaterial(e,itemId,p)]),key=`armour:${tier}|`+settings.map(([p,c])=>`${p}:${c.hue}:${c.saturation}:${c.value}:${c.opacity}:${c.unlocked?1:0}`).join('|');let per=tintCache.get(image);if(!per){per=new Map();tintCache.set(image,per);}if(per.has(key))return per.get(key);const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);const d=ctx.getImageData(0,0,w,h),px=d.data;for(let i=0;i<px.length;i+=4){if(!px[i+3])continue;const part=armourPixelPart(tier,px[i],px[i+1],px[i+2],px[i+3]);if(!part)continue;applyMaterial(px,i,rgbToHsv(px[i],px[i+1],px[i+2]),getArmourMaterial(e,itemId,part),part);}ctx.putImageData(d,0,0);per.set(key,out);return out;}

  function colourAwareSource(raw,tier){const e=activeArmourEntity,id=e?.equipped?.armor;return e&&armourTier(id)===tier?resolveArmourImage(e,id,raw):raw;}
  function installArmourRenderSources(){
    if(armourRenderSourcesInstalled)return true;
    const visuals=window.gameVisuals,rear=window.REAR_HUMAN_EQUIPMENT_ASSETS?.armour;
    if(!visuals?.humanLight||!visuals?.humanMedium||!visuals?.humanHeavy||!rear)return false;
    for(const [tier,path] of Object.entries(rearArmourPaths)){
      const img=window.assetManager.request(path);
      window.assetManager.whenReady(path).then(()=>{window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();}).catch(()=>{});
      rear[tier]=img;
    }
    const frontProps={light:'humanLight',medium:'humanMedium',heavy:'humanHeavy'};
    for(const [tier,prop] of Object.entries(frontProps)){
      let raw=visuals[prop];
      Object.defineProperty(visuals,prop,{configurable:true,enumerable:true,get(){return colourAwareSource(raw,tier);},set(next){raw=next;}});
    }
    for(const tier of ['light','medium','heavy']){
      let raw=rear[tier];
      Object.defineProperty(rear,tier,{configurable:true,enumerable:true,get(){return colourAwareSource(raw,tier);},set(next){raw=next;}});
    }
    armourRenderSourcesInstalled=true;
    return true;
  }

  function syncCharacter(source){if(!source)return;ensure(source);for(const target of [...(window.party||[]),...(window.entities||[])]){if(!target||target===source||target.name!==source.name)continue;target.equipmentVisibility=JSON.parse(JSON.stringify(source.equipmentVisibility||{}));target.equipmentColors=JSON.parse(JSON.stringify(source.equipmentColors||{}));target.displayArmour=true;target.displayClothes=true;}}
  function redraw(e){syncCharacter(e);window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();}
  window.equipmentAppearanceSystem={build:BUILD,renderSlots,slotLabels,ensure,isSlotVisible,setSlotVisible,weaponParts,getWeaponMaterial,setWeaponMaterial,resolveWeaponImage,armourTier,armourParts,getArmourMaterial,setArmourMaterial,resolveArmourImage,installArmourRenderSources,syncCharacter,redraw};
  const armourTimer=setInterval(()=>{if(installArmourRenderSources())clearInterval(armourTimer);},50);
  if(document.readyState==='complete')installArmourRenderSources();else window.addEventListener('load',installArmourRenderSources,{once:true});
})();
