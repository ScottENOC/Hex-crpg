// femaleBaseClothingRecolor.js
// Human-female directional body art has two authored pale garments: one upper
// piece and one lower piece. Build a semantic mask once from the untouched body
// art, then recolour only those masked pixels while preserving the original
// lightness/shading. The mask is an actual canvas: red = upper clothing,
// blue = lower clothing, channel intensity = blend strength at antialiased edges.
(() => {
  'use strict';

  const INSTALL_FLAG = '__femaleBaseClothingRecolorV4Installed';
  const ALPHA_MIN = 40;
  const maskCache = new WeakMap();
  const sourcePixelCache = new WeakMap();
  const clothingCache = new WeakMap();
  const skinCache = new WeakMap();

  function clamp(v,min=0,max=1){ return Math.max(min,Math.min(max,v)); }

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
    if(!s){ const v=Math.round(l*255); return [v,v,v]; }
    const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
    const f=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }

  function ready(img){return !!img&&((img.complete&&img.naturalWidth)||(img.width&&img.height));}
  function wOf(img){return img.naturalWidth||img.width;}
  function hOf(img){return img.naturalHeight||img.height;}
  function baseOf(img){return ready(img?.__recolorBaseSource)?img.__recolorBaseSource:img;}
  function isFemaleDirectionalBody(img){
    const src=String(baseOf(img)?.src||'').toLowerCase().replaceAll('\\\\','/');
    return src.includes('images/characters/human_female/body_');
  }

  function skinSpec(tone){
    if(tone===undefined||tone===null) return null;
    const spec=typeof tone==='number'?{hue:tone}:tone;
    if(!Number.isFinite(spec?.hue)) return null;
    return {
      hue:Number(spec.hue),
      saturation:Number.isFinite(spec.saturation)?Number(spec.saturation):null,
      lightness:Number.isFinite(spec.lightness)?Number(spec.lightness):null,
    };
  }

  function tintSkin(h,s,l,spec){
    const s2=spec.saturation===null?s:clamp(spec.saturation*(.65+s*.5));
    const l2=spec.lightness===null?l:clamp(spec.lightness+(l-.68),.08,.95);
    return hslToRgb(spec.hue,s2,l2);
  }

  function femaleSkinPixel(h,s,l){
    return h>=5&&h<=55&&s>=.12&&l>=.14&&l<=.95;
  }

  function sourcePixels(base){
    const cached=sourcePixelCache.get(base); if(cached) return cached;
    const w=wOf(base), h=hOf(base), c=document.createElement('canvas');
    c.width=w; c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(base,0,0);
    const result={w,h,imageData:ctx.getImageData(0,0,w,h)};
    sourcePixelCache.set(base,result);
    return result;
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

  // Bright neutral pixels are reliable seeds. Shaded cloth is darker, so the
  // flood-fill is allowed to grow through connected low-chroma greys after a
  // seed has proved that the region is clothing.
  function seedPixel(r,g,b,a){
    if(a<ALPHA_MIN) return false;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), [,s,l]=rgbToHsl(r,g,b);
    return l>=.70 && s<=.22 && max-min<=58;
  }

  function fabricPixel(r,g,b,a){
    if(a<ALPHA_MIN) return false;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), [,s,l]=rgbToHsl(r,g,b);
    return (s<=.30 && l>=.24 && max-min<=92) || (l>=.76 && s<=.42);
  }

  function softEdgePixel(r,g,b,a){
    if(a<16) return false;
    const [,s,l]=rgbToHsl(r,g,b);
    return s<=.42 && l>=.18;
  }

  const DIRS=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

  function grownComponents(data,w,h,zone){
    const seed=new Uint8Array(w*h), fabric=new Uint8Array(w*h), seen=new Uint8Array(w*h), comps=[];
    for(let y=zone.top;y<=zone.bottom;y++) for(let x=zone.left;x<=zone.right;x++){
      const idx=y*w+x,i=idx*4;
      if(seedPixel(data[i],data[i+1],data[i+2],data[i+3])) seed[idx]=1;
      if(fabricPixel(data[i],data[i+1],data[i+2],data[i+3])) fabric[idx]=1;
    }
    for(let y=zone.top;y<=zone.bottom;y++) for(let x=zone.left;x<=zone.right;x++){
      const start=y*w+x;
      if(!seed[start]||seen[start]) continue;
      const queue=[start], pixels=[]; seen[start]=1;
      let sumX=0,sumY=0,minX=x,maxX=x,minY=y,maxY=y,seedCount=0;
      for(let qi=0;qi<queue.length;qi++){
        const idx=queue[qi],px=idx%w,py=Math.floor(idx/w);
        pixels.push(idx); sumX+=px; sumY+=py; if(seed[idx]) seedCount++;
        if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
        for(const [dx,dy] of DIRS){
          const nx=px+dx,ny=py+dy;
          if(nx<zone.left||nx>zone.right||ny<zone.top||ny>zone.bottom) continue;
          const ni=ny*w+nx;
          if(fabric[ni]&&!seen[ni]){ seen[ni]=1; queue.push(ni); }
        }
      }
      if(seedCount) comps.push({pixels,size:pixels.length,seedCount,cx:sumX/pixels.length,cy:sumY/pixels.length,minX,maxX,minY,maxY});
    }
    return comps;
  }

  function addSoftEdge(mask,data,w,h){
    const additions=[];
    for(let idx=0;idx<mask.length;idx++){
      if(mask[idx]!==255) continue;
      const x=idx%w,y=Math.floor(idx/w);
      for(const [dx,dy] of DIRS){
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=w||ny<0||ny>=h) continue;
        const ni=ny*w+nx; if(mask[ni]) continue;
        const i=ni*4;
        if(softEdgePixel(data[i],data[i+1],data[i+2],data[i+3])) additions.push(ni);
      }
    }
    for(const idx of additions) if(mask[idx]<144) mask[idx]=144;
  }

  function maskName(base){
    const src=String(base?.src||'').split('#')[0].split('?')[0];
    return src.split('/').pop()?.replace(/\.png$/i,'') || `body-${Date.now()}`;
  }

  function buildSemanticMask(base){
    const cached=maskCache.get(base); if(cached) return cached;
    const {w,h,imageData}=sourcePixels(base), data=imageData.data, bounds=opaqueBounds(data,w,h);
    const upper=new Uint8Array(w*h), lower=new Uint8Array(w*h);
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    if(!bounds){
      const empty={w,h,upper,lower,canvas,upperSize:0,lowerSize:0,upperComponents:[],lowerComponents:[]};
      maskCache.set(base,empty); return empty;
    }

    const xLeft=Math.max(0,Math.floor(bounds.left+bounds.width*.12));
    const xRight=Math.min(w-1,Math.ceil(bounds.left+bounds.width*.88));
    const yAt=f=>Math.max(0,Math.min(h-1,Math.round(bounds.top+bounds.height*f)));
    const upperZone={left:xLeft,right:xRight,top:yAt(.14),bottom:yAt(.43)};
    const lowerZone={left:xLeft,right:xRight,top:yAt(.36),bottom:yAt(.66)};

    const upperComponents=grownComponents(data,w,h,upperZone).filter(c=>c.seedCount>=3&&c.size>=12).sort((a,b)=>b.size-a.size);
    const lowerComponents=grownComponents(data,w,h,lowerZone).filter(c=>c.seedCount>=3&&c.size>=12).sort((a,b)=>b.size-a.size);
    const upperComp=upperComponents[0]||null, lowerComp=lowerComponents[0]||null;
    if(upperComp) for(const idx of upperComp.pixels) upper[idx]=255;
    if(lowerComp) for(const idx of lowerComp.pixels) lower[idx]=255;
    addSoftEdge(upper,data,w,h); addSoftEdge(lower,data,w,h);

    // If the broad zones overlap, give an ambiguous pixel to whichever selected
    // component centre is vertically closer. In practice the garments are
    // separated, but this guarantees the red/blue semantic channels never fight.
    for(let idx=0;idx<upper.length;idx++) if(upper[idx]&&lower[idx]){
      const y=Math.floor(idx/w);
      const du=upperComp?Math.abs(y-upperComp.cy):Infinity;
      const dl=lowerComp?Math.abs(y-lowerComp.cy):Infinity;
      if(du<=dl) lower[idx]=0; else upper[idx]=0;
    }

    const maskCtx=canvas.getContext('2d');
    const maskData=maskCtx.createImageData(w,h), mp=maskData.data;
    let upperSize=0,lowerSize=0;
    for(let idx=0;idx<upper.length;idx++){
      const u=upper[idx],l=lower[idx]; if(!u&&!l) continue;
      if(u) upperSize++; if(l) lowerSize++;
      const i=idx*4; mp[i]=u; mp[i+1]=0; mp[i+2]=l; mp[i+3]=Math.max(u,l);
    }
    maskCtx.putImageData(maskData,0,0);
    canvas.__semanticClothingMask=true;
    canvas.__sourceBody=base;

    const key=maskName(base);
    window.HUMAN_FEMALE_CLOTHING_MASKS=window.HUMAN_FEMALE_CLOTHING_MASKS||{};
    window.HUMAN_FEMALE_CLOTHING_MASKS[key]=canvas;
    const result={w,h,upper,lower,canvas,upperSize,lowerSize,
      upperComponents:upperComponents.slice(0,8).map(c=>({size:c.size,seedCount:c.seedCount,cx:c.cx,cy:c.cy,minX:c.minX,maxX:c.maxX,minY:c.minY,maxY:c.maxY})),
      lowerComponents:lowerComponents.slice(0,8).map(c=>({size:c.size,seedCount:c.seedCount,cx:c.cx,cy:c.cy,minX:c.minX,maxX:c.maxX,minY:c.minY,maxY:c.maxY}))};
    maskCache.set(base,result);
    window.__femaleBaseClothingMaskDebug={src:String(base.src||''),maskKey:key,width:w,height:h,upperSize,lowerSize,
      upperComponents:result.upperComponents,lowerComponents:result.lowerComponents,maskCanvas:canvas};
    return result;
  }

  function cacheGet(cache,base,key){return cache.get(base)?.get(key)||null;}
  function cacheSet(cache,base,key,value){let m=cache.get(base);if(!m){m=new Map();cache.set(base,m);}m.set(key,value);return value;}

  function recolorSkin(img,tone){
    if(!ready(img)||!isFemaleDirectionalBody(img)) return null;
    const spec=skinSpec(tone); if(!spec) return img;
    const base=baseOf(img), key=`${spec.hue}:${spec.saturation??'s'}:${spec.lightness??'l'}`;
    const cached=cacheGet(skinCache,base,key); if(cached) return cached;
    const {w,h,imageData}=sourcePixels(base), p=new Uint8ClampedArray(imageData.data), masks=buildSemanticMask(base);
    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<ALPHA_MIN) continue;
      const idx=i/4; if(masks.upper[idx]>=32||masks.lower[idx]>=32) continue;
      const [hh,s,l]=rgbToHsl(p[i],p[i+1],p[i+2]); if(!femaleSkinPixel(hh,s,l)) continue;
      const [r,g,b]=tintSkin(hh,s,l,spec); p[i]=r;p[i+1]=g;p[i+2]=b;
    }
    const out=document.createElement('canvas');out.width=w;out.height=h;
    out.getContext('2d').putImageData(new ImageData(p,w,h),0,0);
    out.__recolorBaseSource=base; out.__skinToneSpec=spec;
    return cacheSet(skinCache,base,key,out);
  }

  function clothingSaturation(sourceSat,sourceLight,satMult){
    // Midtones carry the strongest colour; highlights and deep folds are a bit
    // less saturated. This keeps the original rendered fabric looking painted,
    // not like a flat RGB flood fill.
    const highlightPenalty=Math.max(0,sourceLight-.70)*.75;
    const shadowPenalty=Math.max(0,.28-sourceLight)*.45;
    return clamp((.58 + sourceSat*.12 - highlightPenalty - shadowPenalty)*satMult,.26,.78);
  }

  function blendChannel(a,b,t){ return Math.round(a+(b-a)*t); }

  function recolorBody(img,hues){
    if(!ready(img)||!isFemaleDirectionalBody(img)) return null;
    const base=baseOf(img), inherited=skinSpec(img.__skinToneSpec), explicit=skinSpec(hues?.skinHue), spec=explicit||inherited;
    const shirtHue=hues?.shirtHue, pantsHue=hues?.pantsHue, satMult=Number.isFinite(hues?.satMult)?hues.satMult:1;
    const key=`${shirtHue??'x'}:${pantsHue??'x'}:${satMult}:${spec?.hue??'x'}:${spec?.saturation??'x'}:${spec?.lightness??'x'}`;
    const cached=cacheGet(clothingCache,base,key); if(cached) return cached;
    const {w,h,imageData}=sourcePixels(base), p=new Uint8ClampedArray(imageData.data), masks=buildSemanticMask(base);

    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<ALPHA_MIN) continue;
      const idx=i/4, u=masks.upper[idx]/255, d=masks.lower[idx]/255;
      const garment=Math.max(u,d);
      if(garment>0){
        const hue=u>=d?shirtHue:pantsHue;
        if(hue!==undefined){
          const [hh,srcSat,srcLight]=rgbToHsl(p[i],p[i+1],p[i+2]);
          const sat=clothingSaturation(srcSat,srcLight,satMult);
          // Preserve the source lightness exactly except for pure/near-white
          // highlights, where HSL would otherwise remain visibly white no matter
          // what hue is selected. A gentle cap keeps the highlight while letting
          // the chosen colour show through.
          const light=Math.min(.93,srcLight);
          const [r,g,b]=hslToRgb(hue,sat,light);
          p[i]=blendChannel(p[i],r,garment);
          p[i+1]=blendChannel(p[i+1],g,garment);
          p[i+2]=blendChannel(p[i+2],b,garment);
        }
        continue; // semantic clothing can never fall through into skin
      }
      if(spec){
        const [hh,s,l]=rgbToHsl(p[i],p[i+1],p[i+2]);
        if(femaleSkinPixel(hh,s,l)){
          const [r,g,b]=tintSkin(hh,s,l,spec); p[i]=r;p[i+1]=g;p[i+2]=b;
        }
      }
    }

    const out=document.createElement('canvas');out.width=w;out.height=h;
    out.getContext('2d').putImageData(new ImageData(p,w,h),0,0);
    out.__recolorBaseSource=base; if(spec) out.__skinToneSpec=spec;
    return cacheSet(clothingCache,base,key,out);
  }

  function install(){
    if(window[INSTALL_FLAG]) return true;
    if(typeof window.getRecoloredSprite!=='function'||typeof window.getRecoloredSkinSprite!=='function') return false;
    const legacySprite=window.getRecoloredSprite, legacySkin=window.getRecoloredSkinSprite;
    window.getRecoloredSkinSprite=function(img,tone){return recolorSkin(img,tone)||legacySkin.apply(this,arguments);};
    window.getRecoloredSprite=function(img,hues){return recolorBody(img,hues)||legacySprite.apply(this,arguments);};
    window.getHumanFemaleClothingMaskCanvas=function(img){
      const base=baseOf(img); return ready(base)&&isFemaleDirectionalBody(base)?buildSemanticMask(base).canvas:null;
    };
    window[INSTALL_FLAG]=true;
    window.__femaleBaseClothingMaskVersion=4;
    window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();
    return true;
  }

  if(!install()){
    const timer=setInterval(()=>{if(install())clearInterval(timer);},25);
    setTimeout(()=>clearInterval(timer),10000);
  }
})();
