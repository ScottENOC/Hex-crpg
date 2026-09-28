// femaleBaseClothingRecolor.js
// Human-female directional body art has two authored, continuous pale garments:
// one upper piece and one lower piece. Do not infer these from generic anatomy
// lightness bands. Instead find the largest connected near-white region in the
// upper torso and pelvis respectively, then use those exact connected regions
// (plus a very small antialias expansion) as the clothing masks.
(() => {
  'use strict';

  const INSTALL_FLAG = '__femaleBaseClothingRecolorV3Installed';
  const ALPHA_MIN = 40;
  const TARGET_CLOTH_SAT = 0.58;
  const maskCache = new WeakMap();
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
    const src=String(baseOf(img)?.src||'').toLowerCase().replaceAll('\\\\','/');
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

  function femaleSkinPixel(h,s,l){
    return h>=5&&h<=55&&s>=.12&&l>=.14&&l<=.95;
  }

  function sourcePixels(base){
    const w=wOf(base),h=hOf(base),c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(base,0,0);
    const imageData=ctx.getImageData(0,0,w,h);
    return {w,h,imageData};
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

  function seedNearWhite(r,g,b,a){
    if(a<ALPHA_MIN) return false;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const [,s,l]=rgbToHsl(r,g,b);
    // Authored underwear is white/very pale grey. This deliberately excludes
    // pale warm skin by requiring both low chroma and high brightness.
    return l>=.68 && s<=.20 && max-min<=54;
  }

  function edgeFabricCandidate(r,g,b,a){
    if(a<ALPHA_MIN) return false;
    const [,s,l]=rgbToHsl(r,g,b);
    // Only used for one-pixel dilation around an already-proven white region.
    // It catches antialias/shadow pixels without becoming a second global
    // colour classifier.
    return l>=.38 && s<=.42;
  }

  function connectedComponents(seed,w,h,bounds){
    const seen=new Uint8Array(w*h), comps=[];
    const left=Math.max(0,bounds?.left??0), right=Math.min(w-1,bounds?.right??w-1);
    const top=Math.max(0,bounds?.top??0), bottom=Math.min(h-1,bounds?.bottom??h-1);
    const dirs=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    for(let y=top;y<=bottom;y++) for(let x=left;x<=right;x++){
      const start=y*w+x;
      if(!seed[start]||seen[start]) continue;
      const queue=[start]; seen[start]=1;
      const pixels=[]; let sumX=0,sumY=0,minX=x,maxX=x,minY=y,maxY=y;
      for(let qi=0;qi<queue.length;qi++){
        const idx=queue[qi], px=idx%w, py=Math.floor(idx/w);
        pixels.push(idx);sumX+=px;sumY+=py;
        if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
        for(const [dx,dy] of dirs){
          const nx=px+dx,ny=py+dy;
          if(nx<left||nx>right||ny<top||ny>bottom)continue;
          const ni=ny*w+nx;if(seed[ni]&&!seen[ni]){seen[ni]=1;queue.push(ni);}
        }
      }
      comps.push({pixels,size:pixels.length,cx:sumX/pixels.length,cy:sumY/pixels.length,minX,maxX,minY,maxY});
    }
    return comps;
  }

  function buildGarmentMasks(base){
    const cached=maskCache.get(base);if(cached)return cached;
    const {w,h,imageData}=sourcePixels(base),data=imageData.data,bounds=opaqueBounds(data,w,h);
    const upper=new Uint8Array(w*h),lower=new Uint8Array(w*h),seed=new Uint8Array(w*h);
    if(!bounds){const empty={w,h,upper,lower,upperSize:0,lowerSize:0,components:[]};maskCache.set(base,empty);return empty;}

    // Restrict component discovery to the central body. Arms/hands and almost
    // all face/leg highlights are excluded before colour is even considered.
    const central={
      left:Math.floor(bounds.left+bounds.width*.14),
      right:Math.ceil(bounds.left+bounds.width*.86),
      top:Math.floor(bounds.top+bounds.height*.12),
      bottom:Math.ceil(bounds.top+bounds.height*.68),
    };
    for(let y=central.top;y<=central.bottom;y++) for(let x=central.left;x<=central.right;x++){
      const idx=y*w+x,i=idx*4;
      if(seedNearWhite(data[i],data[i+1],data[i+2],data[i+3]))seed[idx]=1;
    }

    const comps=connectedComponents(seed,w,h,central).filter(c=>c.size>=8);
    const relY=c=>(c.cy-bounds.top)/Math.max(1,bounds.height-1);
    // User-provided invariant: one continuous upper garment and one continuous
    // lower garment. Select the largest white component in each broad vertical
    // zone rather than trying to infer exact anatomy from colour.
    const upperComp=comps.filter(c=>relY(c)>=.15&&relY(c)<=.43).sort((a,b)=>b.size-a.size)[0]||null;
    const lowerComp=comps.filter(c=>relY(c)>=.34&&relY(c)<=.64).sort((a,b)=>b.size-a.size)[0]||null;
    if(upperComp)for(const idx of upperComp.pixels)upper[idx]=1;
    if(lowerComp)for(const idx of lowerComp.pixels)lower[idx]=1;

    // Include just one neighbouring ring of plausible fabric edge pixels. This
    // keeps antialiased garment edges out of the skin pass without swallowing
    // surrounding belly/thigh skin.
    function dilate(mask){
      const additions=[];
      for(let idx=0;idx<mask.length;idx++){
        if(!mask[idx])continue;
        const x=idx%w,y=Math.floor(idx/w);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
          const ni=ny*w+nx;if(mask[ni])continue;
          const i=ni*4;if(edgeFabricCandidate(data[i],data[i+1],data[i+2],data[i+3]))additions.push(ni);
        }
      }
      for(const idx of additions)mask[idx]=1;
    }
    dilate(upper);dilate(lower);

    let upperSize=0,lowerSize=0;for(const v of upper)upperSize+=v;for(const v of lower)lowerSize+=v;
    const result={w,h,upper,lower,upperSize,lowerSize,components:comps.map(c=>({size:c.size,cx:c.cx,cy:c.cy,minX:c.minX,maxX:c.maxX,minY:c.minY,maxY:c.maxY}))};
    maskCache.set(base,result);
    window.__femaleBaseClothingMaskDebug={src:String(base.src||''),width:w,height:h,upperSize,lowerSize,components:result.components};
    return result;
  }

  function cacheGet(cache,base,key){return cache.get(base)?.get(key)||null;}
  function cacheSet(cache,base,key,value){let m=cache.get(base);if(!m){m=new Map();cache.set(base,m);}m.set(key,value);return value;}

  function recolorSkin(img,tone){
    if(!ready(img)||!isFemaleDirectionalBody(img)) return null;
    const spec=skinSpec(tone);if(!spec)return img;
    const base=baseOf(img),key=`${spec.hue}:${spec.saturation??'s'}:${spec.lightness??'l'}`;
    const cached=cacheGet(skinCache,base,key);if(cached)return cached;
    const {w,h,imageData}=sourcePixels(base),p=imageData.data,masks=buildGarmentMasks(base);
    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<ALPHA_MIN)continue;
      const idx=i/4;if(masks.upper[idx]||masks.lower[idx])continue;
      const [hh,s,l]=rgbToHsl(p[i],p[i+1],p[i+2]);if(!femaleSkinPixel(hh,s,l))continue;
      const [r,g,b]=tintSkin(hh,s,l,spec);p[i]=r;p[i+1]=g;p[i+2]=b;
    }
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(imageData,0,0);
    c.__recolorBaseSource=base;c.__skinToneSpec=spec;
    return cacheSet(skinCache,base,key,c);
  }

  function recolorBody(img,hues){
    if(!ready(img)||!isFemaleDirectionalBody(img))return null;
    const base=baseOf(img),inherited=skinSpec(img.__skinToneSpec),explicit=skinSpec(hues?.skinHue),spec=explicit||inherited;
    const shirtHue=hues?.shirtHue,pantsHue=hues?.pantsHue,satMult=Number.isFinite(hues?.satMult)?hues.satMult:1;
    const key=`${shirtHue??'x'}:${pantsHue??'x'}:${satMult}:${spec?.hue??'x'}:${spec?.saturation??'x'}:${spec?.lightness??'x'}`;
    const cached=cacheGet(clothingCache,base,key);if(cached)return cached;
    const {w,h,imageData}=sourcePixels(base),p=imageData.data,masks=buildGarmentMasks(base);
    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<ALPHA_MIN)continue;
      const idx=i/4;let hue;
      if(masks.upper[idx])hue=shirtHue;else if(masks.lower[idx])hue=pantsHue;
      if(hue!==undefined){
        const [,srcSat,l]=rgbToHsl(p[i],p[i+1],p[i+2]);
        const sat=Math.max(.38,Math.min(.82,TARGET_CLOTH_SAT*satMult));
        const light=Math.max(.22,Math.min(.84,l*.90));
        const [r,g,b]=hslToRgb(hue,Math.max(sat,srcSat*.75),light);p[i]=r;p[i+1]=g;p[i+2]=b;
        continue;
      }
      if((masks.upper[idx]||masks.lower[idx]))continue;
      if(spec){const [hh,s,l]=rgbToHsl(p[i],p[i+1],p[i+2]);if(femaleSkinPixel(hh,s,l)){const [r,g,b]=tintSkin(hh,s,l,spec);p[i]=r;p[i+1]=g;p[i+2]=b;}}
    }
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(imageData,0,0);
    c.__recolorBaseSource=base;if(spec)c.__skinToneSpec=spec;
    return cacheSet(clothingCache,base,key,c);
  }

  function install(){
    if(window[INSTALL_FLAG])return true;
    if(typeof window.getRecoloredSprite!=='function'||typeof window.getRecoloredSkinSprite!=='function')return false;
    const legacySprite=window.getRecoloredSprite,legacySkin=window.getRecoloredSkinSprite;
    window.getRecoloredSkinSprite=function(img,tone){return recolorSkin(img,tone)||legacySkin.apply(this,arguments);};
    window.getRecoloredSprite=function(img,hues){return recolorBody(img,hues)||legacySprite.apply(this,arguments);};
    window[INSTALL_FLAG]=true;
    window.__femaleBaseClothingMaskVersion=3;
    window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();
    return true;
  }

  if(!install()){
    const timer=setInterval(()=>{if(install())clearInterval(timer);},25);
    setTimeout(()=>clearInterval(timer),10000);
  }
})();
