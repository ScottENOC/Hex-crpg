// Explicit garment layers: one authored image per colourable part.
(() => {
  'use strict';
  const BUILD='20260928-clothing-layers-v1';
  const slots=['underwear','bra','pants','shirt'];
  const labels={underwear:'Underwear',bra:'Bra',pants:'Pants',shirt:'Shirt / Dress'};
  const images=new Map(), tinted=new Map();

  function legacy(itemId){
    if(itemId!=='traveler_garb') return null;
    return {slot:'shirt',layers:[{id:'base',label:'Base',defaultColor:{hue:28,saturation:76,value:70},views:{front:'images/clothing/traveler_garb_front.svg',side:'images/clothing/traveler_garb_side.svg',back:'images/clothing/traveler_garb_back.svg'}}]};
  }
  function layer(raw,i){
    const c=raw.defaultColor||raw.color||{};
    return {id:String(raw.id||raw.key||`part${i+1}`),label:String(raw.label||raw.name||`Part ${i+1}`),tint:raw.tint!==false,views:raw.views||{},defaultColor:{hue:Number(c.hue??30),saturation:Number(c.saturation??70),value:Number(c.value??70)}};
  }
  function spec(itemId){
    const item=window.items?.[itemId], old=legacy(itemId);
    if(!item&&!old) return null;
    const slot=item?.clothingSlot||old?.slot||(item?.type==='clothes'?'shirt':null);
    if(!slots.includes(slot)) return null;
    const raw=(Array.isArray(item?.clothingLayers)&&item.clothingLayers.length)?item.clothingLayers:(old?.layers||[{id:'base',label:'Base',views:item?.clothingViews||{},defaultColor:{hue:30,saturation:70,value:70}}]);
    return {slot,layers:raw.map(layer)};
  }
  function migrate(e){
    if(!e?.equipped) return;
    slots.forEach(s=>{if(!(s in e.equipped)) e.equipped[s]=null;});
    if(e.equipped.clothes&&!e.equipped.shirt) e.equipped.shirt=e.equipped.clothes;
    if('clothes' in e.equipped) e.equipped.clothes=null;
    if(!e.clothingColors||typeof e.clothingColors!=='object') e.clothingColors={};
  }
  function colour(e,itemId,l){
    migrate(e);
    const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={});
    return all[l.id]||(all[l.id]={...l.defaultColor});
  }
  function setColour(e,itemId,layerId,next){
    migrate(e);
    const all=e.clothingColors[itemId]||(e.clothingColors[itemId]={}), prev=all[layerId]||{hue:30,saturation:70,value:70};
    all[layerId]={hue:Number(next.hue??prev.hue),saturation:Number(next.saturation??prev.saturation),value:Number(next.value??prev.value)};
  }
  function load(src){
    if(!src) return null;
    if(images.has(src)) return images.get(src);
    const img=new Image(); img.src=`${src}${src.includes('?')?'&':'?'}build=${BUILD}`;
    img.onload=()=>{window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();};
    images.set(src,img); return img;
  }
  function hsvHsl(c){
    if(window.preciseHSVToHSL) return window.preciseHSVToHSL(c);
    const s=Math.max(0,Math.min(100,c.saturation))/100,v=Math.max(0,Math.min(100,c.value))/100,l=v*(1-s/2),ss=(l===0||l===1)?0:(v-l)/Math.min(l,1-l);
    return {hue:c.hue,saturation:ss,lightness:l};
  }
  function hslRgb(h,s,l){
    h=((h%360)+360)%360/360;if(!s){const v=Math.round(l*255);return[v,v,v];}
    const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q,f=t=>{if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }
  function tint(img,c){
    if(!img?.complete||!img.naturalWidth) return img;
    const key=`${img.src}|${c.hue}|${c.saturation}|${c.value}`;if(tinted.has(key)) return tinted.get(key);
    const target=hsvHsl(c), out=document.createElement('canvas');out.width=img.naturalWidth;out.height=img.naturalHeight;
    const x=out.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const d=x.getImageData(0,0,out.width,out.height),p=d.data;
    for(let i=0;i<p.length;i+=4){if(!p[i+3])continue;const lum=(Math.max(p[i],p[i+1],p[i+2])+Math.min(p[i],p[i+1],p[i+2]))/510,l=Math.max(.02,Math.min(.98,target.lightness+(lum-.5)*.78)),rgb=hslRgb(target.hue,target.saturation,l);p[i]=rgb[0];p[i+1]=rgb[1];p[i+2]=rgb[2];}
    x.putImageData(d,0,0);tinted.set(key,out);return out;
  }
  function view(v){return(v==='up'||v==='back')?'back':(v==='left'||v==='right'||v==='side')?'side':'front';}
  function drawSlot(ctx,e,slot,v,bounds){
    migrate(e);const itemId=e?.equipped?.[slot],s=itemId&&spec(itemId);if(!s||s.slot!==slot)return false;let drew=false;
    for(const l of s.layers){const src=l.views?.[view(v)]||l.views?.front,img=load(src);if(!img?.complete||!img.naturalWidth)continue;ctx.drawImage(l.tint?tint(img,colour(e,itemId,l)):img,bounds.left,bounds.top,bounds.width,bounds.height);drew=true;}return drew;
  }
  window.clothingSystem={build:BUILD,slots,slotLabels:labels,getItemSpec:spec,migrateLegacyEquipment:migrate,getLayerColour:colour,setLayerColour:setColour,drawSlot,tintWholeLayer:tint};
  window.CLOTHING_SLOTS=slots;
})();