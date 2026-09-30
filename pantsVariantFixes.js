// Pants-specific rendering and physical-variant compatibility.
// Keeps the generic clothing renderer small while handling the unusually large
// trousers source art and the skirt's extra shape parameters.
(() => {
  'use strict';
  const BUILD=window.PRESENTATION_BUILD||'20260930-pants-variants-v2';
  const TROUSERS_ID='pants_trousers';
  const SKIRT_ID='pants_skirt';
  const SKIRT_WIDTH_SCALE=.85;
  const TROUSERS_RENDER_MAX=256;
  const images=new Map();
  const rendered=new WeakMap();
  const equippedSkirtInstances=new WeakMap();
  let installed=false;

  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function normaliseShape(shape){
    shape=shape&&typeof shape==='object'?shape:{};
    shape.length=Math.max(.35,Math.min(.90,Number(shape.length??.62)));
    shape.flare=Math.max(0,Math.min(.30,Number(shape.flare??.15)));
    return shape;
  }
  function sameShape(a,b){
    return !!a&&!!b&&Math.abs(Number(a.length)-Number(b.length))<1e-6&&Math.abs(Number(a.flare)-Number(b.flare))<1e-6;
  }

  function syncPhysicalShapes(e){
    if(!e)return;
    e.clothingShape=e.clothingShape&&typeof e.clothingShape==='object'?e.clothingShape:{};
    const skirts=(e.physicalEquipment||[]).filter(x=>x?.itemId===SKIRT_ID),wearsSkirt=e?.equipped?.pants===SKIRT_ID;
    if(!skirts.length&&!wearsSkirt){equippedSkirtInstances.delete(e);return;}

    let existing=e.clothingShape[SKIRT_ID];
    if(!existing&&window.skirtClothing?.ensureShape)existing=window.skirtClothing.ensureShape(e);
    const fallback=normaliseShape(clone(existing)||{length:.62,flare:.15});

    // Every physical skirt owns its own shape, just as it owns its own colour.
    for(const inst of skirts){
      inst.appearance=inst.appearance||{};
      if(!inst.appearance.clothingShape)inst.appearance.clothingShape=clone(fallback);
      normaliseShape(inst.appearance.clothingShape);
    }

    const equipped=e.equippedInstances?.pants;
    if(wearsSkirt&&equipped?.itemId===SKIRT_ID){
      equipped.appearance=equipped.appearance||{};
      if(!equipped.appearance.clothingShape)equipped.appearance.clothingShape=clone(fallback);
      normaliseShape(equipped.appearance.clothingShape);

      const previous=equippedSkirtInstances.get(e);
      if(previous!==equipped){
        // A newly equipped skirt restores its own saved shape into the legacy
        // entity field used by the world renderer and existing slider controls.
        e.clothingShape[SKIRT_ID]=clone(equipped.appearance.clothingShape);
        equippedSkirtInstances.set(e,equipped);
      }else{
        // While the same physical skirt remains equipped, slider edits land in
        // e.clothingShape first. Mirror those edits back into the instance so
        // save data, stacking and inventory previews all see the new shape.
        const local=normaliseShape(clone(e.clothingShape[SKIRT_ID])||clone(equipped.appearance.clothingShape));
        if(!sameShape(local,equipped.appearance.clothingShape))equipped.appearance.clothingShape=clone(local);
        e.clothingShape[SKIRT_ID]=clone(equipped.appearance.clothingShape);
      }
    }else{
      equippedSkirtInstances.delete(e);
      if(skirts.length&&!e.clothingShape[SKIRT_ID])e.clothingShape[SKIRT_ID]=fallback;
    }
  }

  function load(src){
    if(!src)return null;
    if(images.has(src))return images.get(src);
    const img=new Image();let attempt=0;const retryDelays=[100,350,900];
    const assign=()=>{
      const sep=src.includes('?')?'&':'?';
      const retry=attempt?`&assetRetry=${attempt}-${Date.now()}`:'';
      img.src=`${src}${sep}build=${encodeURIComponent(BUILD)}${retry}`;
    };
    img.addEventListener('load',()=>{
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
      window.renderEquipmentInterface?.();
    });
    img.addEventListener('error',()=>{if(attempt>=retryDelays.length)return;const delay=retryDelays[attempt++];setTimeout(assign,delay);});
    images.set(src,img);assign();return img;
  }
  function ready(img){return !!img&&img.complete&&img.naturalWidth>0&&img.naturalHeight>0;}
  function view(v){return(v==='up'||v==='back')?'back':(v==='left'||v==='right'||v==='side')?'side':'front';}
  function sourceFor(part,v){const resolved=view(v);return part?.views?.[resolved]||part?.views?.front||part?.views?.back||null;}

  function hsvHsl(c){
    if(window.preciseHSVToHSL)return window.preciseHSVToHSL(c);
    const s=Math.max(0,Math.min(100,Number(c.saturation)||0))/100,v=Math.max(0,Math.min(100,Number(c.value)||0))/100;
    const l=v*(1-s/2),ss=(l===0||l===1)?0:(v-l)/Math.min(l,1-l);
    return{hue:Number(c.hue)||0,saturation:ss,lightness:l};
  }
  function hslRgb(h,s,l){
    h=((h%360)+360)%360/360;
    if(!s){const v=Math.round(l*255);return[v,v,v];}
    const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
    const f=t=>{if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    return[Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }

  function renderTrousersSource(img,colour){
    let per=rendered.get(img);if(!per){per=new Map();rendered.set(img,per);}
    const opacity=Math.max(0,Math.min(1,Number(colour?.opacity??1)));
    const key=`${Number(colour?.hue)||0}|${Number(colour?.saturation)||0}|${Number(colour?.value)||0}|${opacity}`;
    if(per.has(key))return per.get(key);
    const scale=Math.min(1,TROUSERS_RENDER_MAX/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
    let crop={x:0,y:0,w,h};
    try{
      const data=ctx.getImageData(0,0,w,h),p=data.data,target=hsvHsl(colour||{});
      let left=w,top=h,right=-1,bottom=-1;
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
        const i=(yy*w+xx)*4,a=p[i+3];if(!a)continue;
        if(a>=8){if(xx<left)left=xx;if(xx>right)right=xx;if(yy<top)top=yy;if(yy>bottom)bottom=yy;}
        const lum=(Math.max(p[i],p[i+1],p[i+2])+Math.min(p[i],p[i+1],p[i+2]))/510;
        const lightness=Math.max(.02,Math.min(.98,target.lightness+(lum-.5)*.78)),rgb=hslRgb(target.hue,target.saturation,lightness);
        p[i]=rgb[0];p[i+1]=rgb[1];p[i+2]=rgb[2];p[i+3]=Math.round(a*opacity);
      }
      ctx.putImageData(data,0,0);
      if(right>=left&&bottom>=top)crop={x:left,y:top,w:right-left+1,h:bottom-top+1};
    }catch(_){/* The raw downsample remains a safe fallback. */}
    const result={canvas,crop};per.set(key,result);return result;
  }

  function getTrousersPreview(colour){
    const cs=window.clothingSystem,spec=cs?.getItemSpec?.(TROUSERS_ID),part=spec?.layers?.[0];
    if(!part)return null;
    const src=sourceFor(part,'front'),img=load(src);
    if(!ready(img))return null;
    return renderTrousersSource(img,colour||part.defaultColor||{});
  }

  function drawTrousers(ctx,e,v,bounds){
    const cs=window.clothingSystem,spec=cs?.getItemSpec?.(TROUSERS_ID),part=spec?.layers?.[0];
    if(!part||e?.displayClothes===false||window.equipmentAppearanceSystem?.isSlotVisible?.(e,'pants')===false)return false;
    const src=sourceFor(part,v),img=load(src);if(!ready(img))return false;
    const prepared=renderTrousersSource(img,cs.getLayerColour(e,TROUSERS_ID,part));
    const target=cs.clothingTargets?.[view(v)]?.pants||cs.clothingTargets?.front?.pants;if(!target)return false;
    const dx=bounds.left+target.x*bounds.width,dy=bounds.top+target.y*bounds.height,dw=target.w*bounds.width,dh=target.h*bounds.height;
    const c=prepared.crop;ctx.drawImage(prepared.canvas,c.x,c.y,c.w,c.h,dx,dy,dw,dh);return true;
  }

  function install(){
    const cs=window.clothingSystem;
    if(installed||!cs?.__skirtDrawPatched||!cs?.__seasonalShortsFitPatched||typeof cs.drawSlot!=='function')return false;
    const base=cs.drawSlot;
    cs.drawSlot=function(ctx,e,slot,v,bounds){
      if(slot==='pants'){
        syncPhysicalShapes(e);
        if(e?.equipped?.pants===TROUSERS_ID&&drawTrousers(ctx,e,v,bounds))return true;
        if(e?.equipped?.pants===SKIRT_ID){
          const narrower={...bounds,left:bounds.left+bounds.width*(1-SKIRT_WIDTH_SCALE)/2,width:bounds.width*SKIRT_WIDTH_SCALE};
          return base(ctx,e,slot,v,narrower);
        }
      }
      return base(ctx,e,slot,v,bounds);
    };
    cs.__pantsVariantFixes=true;installed=true;return true;
  }

  function tick(){
    for(const e of [...(window.party||[]),...(window.entities||[])])syncPhysicalShapes(e);
    if(window.player)syncPhysicalShapes(window.player);
    install();
  }
  const timer=setInterval(()=>{tick();if(installed)clearInterval(timer);},50);
  if(document.readyState==='complete')tick();else window.addEventListener('load',tick,{once:true});
  window.pantsVariantFixes={build:BUILD,syncPhysicalShapes,drawTrousers,getTrousersPreview};
})();
