// femaleBaseClothingRecolor.js
// Human-female directional body art uses pale/neutral built-in underwear.
// The legacy recolourer was tuned for older dark warm clothing and therefore
// misses the white garments while sometimes classifying their warm antialiasing
// as skin. This wrapper gives those garments explicit spatial masks and, most
// importantly, lets clothing classification win before skin classification.
(() => {
  'use strict';

  const INSTALL_FLAG = '__femaleBaseClothingRecolorV2Installed';
  const ALPHA_MIN = 40;
  const TARGET_CLOTH_SAT = 0.56;
  const clothingCache = new WeakMap();
  const skinCache = new WeakMap();

  function rgbToHsl(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
    if(max===min) return [0,0,l];
    const d=max-min, s=l>.5?d/(2-max-min):d/(max+min);
    let h;
    if(max===r) h=(g-b)/d+(g<b?6:0);
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    return [h*60,s,l];
  }

  function hslToRgb(h,s,l){
    h=((h%360)+360)%360/360;
    if(!s){const v=Math.round(l*255);return[v,v,v];}
    const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
    const f=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }

  function ready(img){return !!img&&((img.complete&&img.naturalWidth)||(img.width&&img.height));}
  function wOf(img){return img.naturalWidth||img.width;}
  function hOf(img){return img.naturalHeight||img.height;}
  function baseOf(img){return ready(img?.__recolorBaseSource)?img.__recolorBaseSource:img;}
  function isFemaleDirectionalBody(img){
    const src=String(baseOf(img)?.src||'').toLowerCase().replaceAll('\\','/');
    return src.includes('images/characters/human_female/body_');
  }

  function skinSpec(tone){
    if(tone===undefined||tone===null) return null;
    const spec=typeof tone==='number'?{hue:tone}:tone;
    if(!Number.isFinite(spec?.hue)) return null;
    return {hue:Number(spec.hue),saturation:Number.isFinite(spec.saturation)?Number(spec.saturation):null,lightness:Number.isFinite(spec.lightness)?Number(spec.lightness):null};
  }

  function tintSkin(h,s,l,spec){
    const s2=spec.saturation===null?s:Math.max(0,Math.min(1,spec.saturation*(.65+s*.5)));
    const l2=spec.lightness===null?l:Math.max(.08,Math.min(.95,spec.lightness+(l-.68)));
    return hslToRgb(spec.hue,s2,l2);
  }

  function opaqueBounds(data,w,h){
    let left=w,right=-1,top=h,bottom=-1;
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]<ALPHA_MIN) continue;
      const p=i/4,x=p%w,y=Math.floor(p/w);
      if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;
    }
    return right>=left&&bottom>=top?{left,right,top,bottom,width:right-left+1,height:bottom-top+1}:null;
  }

  function garmentBand(x,y,h,s,l,bounds){
    if(!bounds) return null;
    const rx=(x-bounds.left)/Math.max(1,bounds.width-1);
    const ry=(y-bounds.top)/Math.max(1,bounds.height-1);

    // The authored bra/briefs are white/grey. Keep the colour gate deliberately
    // neutral so exposed warm skin inside the same anatomical region is not
    // recoloured. The broader second clause catches pale antialiased fabric edges.
    const paleNeutral=(s<=.24&&l>=.28)||(s<=.32&&l>=.72);
    if(!paleNeutral) return null;

    // Central-body gates reject arms, fingers and most thigh/leg pixels. Bands
    // are disjoint so the upper and lower sliders can never fight over a pixel.
    if(rx>=.20&&rx<=.80&&ry>=.17&&ry<=.39) return 'upper';
    if(rx>=.18&&rx<=.82&&ry>=.405&&ry<=.605) return 'lower';
    return null;
  }

  function femaleSkinPixel(h,s,l){
    // Clothing has already been excluded by garmentBand before this is called.
    // This broad warm range therefore safely keeps knees/fingers/toes as skin.
    return h>=5&&h<=55&&s>=.12&&l>=.14&&l<=.95;
  }

  function cacheGet(cache,base,key){return cache.get(base)?.get(key)||null;}
  function cacheSet(cache,base,key,value){let m=cache.get(base);if(!m){m=new Map();cache.set(base,m);}m.set(key,value);return value;}

  function sourcePixels(base){
    const w=wOf(base),h=hOf(base),c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(base,0,0);
    const imageData=ctx.getImageData(0,0,w,h);
    return {w,h,imageData,bounds:opaqueBounds(imageData.data,w,h)};
  }

  function recolorSkin(img,tone){
    if(!ready(img)||!isFemaleDirectionalBody(img)) return null;
    const spec=skinSpec(tone); if(!spec) return img;
    const base=baseOf(img),key=`${spec.hue}:${spec.saturation??'s'}:${spec.lightness??'l'}`;
    const cached=cacheGet(skinCache,base,key);if(cached)return cached;
    const {w,h,imageData,bounds}=sourcePixels(base),p=imageData.data;
    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<ALPHA_MIN) continue;
      const px=i/4,x=px%w,y=Math.floor(px/w),[hh,s,l]=rgbToHsl(p[i],p[i+1],p[i+2]);
      if(garmentBand(x,y,hh,s,l,bounds)) continue; // clothing wins over skin
      if(!femaleSkinPixel(hh,s,l)) continue;
      const [r,g,b]=tintSkin(hh,s,l,spec);p[i]=r;p[i+1]=g;p[i+2]=b;
    }
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(imageData,0,0);
    c.__recolorBaseSource=base;c.__skinToneSpec=spec;
    return cacheSet(skinCache,base,key,c);
  }

  function recolorBody(img,hues){
    if(!ready(img)||!isFemaleDirectionalBody(img)) return null;
    const base=baseOf(img);
    const inherited=skinSpec(img.__skinToneSpec), explicit=skinSpec(hues?.skinHue), spec=explicit||inherited;
    const shirtHue=hues?.shirtHue, pantsHue=hues?.pantsHue, satMult=Number.isFinite(hues?.satMult)?hues.satMult:1;
    const key=`${shirtHue??'x'}:${pantsHue??'x'}:${satMult}:${spec?.hue??'x'}:${spec?.saturation??'x'}:${spec?.lightness??'x'}`;
    const cached=cacheGet(clothingCache,base,key);if(cached)return cached;

    const {w,h,imageData,bounds}=sourcePixels(base),p=imageData.data;
    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<ALPHA_MIN) continue;
      const px=i/4,x=px%w,y=Math.floor(px/w),[hh,s,l]=rgbToHsl(p[i],p[i+1],p[i+2]);
      const band=garmentBand(x,y,hh,s,l,bounds);
      if(band){
        const hue=band==='upper'?shirtHue:pantsHue;
        if(hue!==undefined){
          const sat=Math.max(.34,Math.min(.78,TARGET_CLOTH_SAT*satMult));
          const light=Math.max(.24,Math.min(.84,l*.92));
          const [r,g,b]=hslToRgb(hue,sat,light);p[i]=r;p[i+1]=g;p[i+2]=b;
        }
        continue; // never let a garment pixel fall through to the skin rule
      }
      if(spec&&femaleSkinPixel(hh,s,l)){
        const [r,g,b]=tintSkin(hh,s,l,spec);p[i]=r;p[i+1]=g;p[i+2]=b;
      }
    }

    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(imageData,0,0);
    c.__recolorBaseSource=base;if(spec)c.__skinToneSpec=spec;
    return cacheSet(clothingCache,base,key,c);
  }

  function install(){
    if(window[INSTALL_FLAG]) return true;
    if(typeof window.getRecoloredSprite!=='function'||typeof window.getRecoloredSkinSprite!=='function') return false;
    const legacySprite=window.getRecoloredSprite,legacySkin=window.getRecoloredSkinSprite;
    window.getRecoloredSkinSprite=function(img,tone){return recolorSkin(img,tone)||legacySkin.apply(this,arguments);};
    window.getRecoloredSprite=function(img,hues){return recolorBody(img,hues)||legacySprite.apply(this,arguments);};
    window[INSTALL_FLAG]=true;
    window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();
    return true;
  }

  if(!install()){
    const timer=setInterval(()=>{if(install())clearInterval(timer);},25);
    setTimeout(()=>clearInterval(timer),10000);
  }
})();
