// Data-driven shield visuals: shape/material metadata plus cached two-colour livery.
// This is deliberately renderer-light. humanoidRenderer already asks gameVisuals.shield
// while resolving an equipped shield, so we expose the correct composed canvas there.
(() => {
  'use strict';
  const BUILD='20260929-shields-v1';
  const cache=new WeakMap();
  let activeEntity=null;
  let clearQueued=false;
  let installed=false;

  const SHIELD_VISUALS={
    round:{frontPath:null,backPath:'images/shield_back.svg',scale:.73},
    kite:{frontPath:'images/kiteshield.png',backPath:'images/shield_back.svg',scale:.82},
  };
  const extraAssets={kite:null};

  function patchItemMetadata(){
    if(!window.items)return false;
    const wooden=window.items.wooden_shield;
    if(wooden&&!wooden.shieldVisual)wooden.shieldVisual={shape:'round',material:'wood',scale:.73};
    const bulwark=window.items.bulwark_shield;
    if(bulwark&&!bulwark.shieldVisual)bulwark.shieldVisual={shape:'kite',material:'metal',scale:.82};
    return true;
  }

  function ensure(e){
    if(!e)return;
    if(!e.shieldAppearance||typeof e.shieldAppearance!=='object')e.shieldAppearance={};
  }
  function defaults(itemId){
    const material=window.items?.[itemId]?.shieldVisual?.material||'wood';
    return {
      pattern:'solid',
      primary:{hue:215,saturation:68,value:58},
      secondary:{hue:42,saturation:78,value:72},
      paintOpacity:material==='metal'?.62:.72,
    };
  }
  function getAppearance(e,itemId){
    ensure(e);
    if(!e||!itemId)return defaults(itemId);
    return e.shieldAppearance[itemId]||(e.shieldAppearance[itemId]=defaults(itemId));
  }
  function setAppearance(e,itemId,next={}){
    const prev=getAppearance(e,itemId);
    const colour=(base,n={})=>({hue:Number(n.hue??base.hue),saturation:Number(n.saturation??base.saturation),value:Number(n.value??base.value)});
    e.shieldAppearance[itemId]={
      pattern:['solid','per_pale','per_fess','quarterly'].includes(next.pattern)?next.pattern:prev.pattern,
      primary:colour(prev.primary,next.primary),
      secondary:colour(prev.secondary,next.secondary),
      paintOpacity:Math.max(0,Math.min(1,Number(next.paintOpacity??prev.paintOpacity))),
    };
    redraw(e);
  }

  function hsvToRgb(h,s,v){h=((h%360)+360)%360;s=Math.max(0,Math.min(1,s/100));v=Math.max(0,Math.min(1,v/100));const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let a;if(h<60)a=[c,x,0];else if(h<120)a=[x,c,0];else if(h<180)a=[0,c,x];else if(h<240)a=[0,x,c];else if(h<300)a=[x,0,c];else a=[c,0,x];return a.map(n=>Math.round((n+m)*255));}
  function css(c){const [r,g,b]=hsvToRgb(c.hue,c.saturation,c.value);return `rgb(${r},${g},${b})`;}
  function paintPattern(ctx,w,h,a){
    ctx.fillStyle=css(a.primary);ctx.fillRect(0,0,w,h);
    if(a.pattern==='solid')return;
    ctx.fillStyle=css(a.secondary);
    if(a.pattern==='per_pale')ctx.fillRect(w/2,0,w/2,h);
    else if(a.pattern==='per_fess')ctx.fillRect(0,h/2,w,h/2);
    else if(a.pattern==='quarterly'){ctx.fillRect(w/2,0,w/2,h/2);ctx.fillRect(0,h/2,w/2,h/2);}
  }
  function compose(e,itemId,image){
    if(!image||!itemId)return image;
    const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!w||!h)return image;
    const a=getAppearance(e,itemId);const visual=window.items?.[itemId]?.shieldVisual||{};
    const key=[visual.shape||'round',visual.material||'wood',a.pattern,a.primary.hue,a.primary.saturation,a.primary.value,a.secondary.hue,a.secondary.saturation,a.secondary.value,a.paintOpacity].join('|');
    let per=cache.get(image);if(!per){per=new Map();cache.set(image,per);}if(per.has(key))return per.get(key);
    const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d');ctx.drawImage(image,0,0,w,h);
    // Colour is clipped to the source alpha. multiply keeps grain, dents, highlights
    // and edge detail visible instead of flattening the shield into a heraldry disc.
    ctx.save();ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=a.paintOpacity;ctx.globalCompositeOperation='multiply';paintPattern(ctx,w,h,a);ctx.restore();
    // Reapply a little source shading/detail above the paint.
    ctx.save();ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.28;ctx.drawImage(image,0,0,w,h);ctx.restore();
    per.set(key,out);return out;
  }

  function noteEntity(e){activeEntity=e;if(!clearQueued){clearQueued=true;queueMicrotask(()=>{activeEntity=null;clearQueued=false;});}}
  function shieldSpec(e){const id=e?.equipped?.offhand&&window.items?.[e.equipped.offhand]?.type==='shield'?e.equipped.offhand:(e?.equipped?.weapon&&window.items?.[e.equipped.weapon]?.type==='shield'?e.equipped.weapon:null);return id?{id,visual:window.items[id].shieldVisual||{shape:'round',material:'wood',scale:.73}}:null;}
  function frontSource(raw){const spec=shieldSpec(activeEntity);if(!spec)return raw;const source=spec.visual.shape==='kite'&&extraAssets.kite?.complete&&extraAssets.kite.naturalWidth?extraAssets.kite:raw;return compose(activeEntity,spec.id,source);}

  function install(){
    patchItemMetadata();
    const visuals=window.gameVisuals;if(!visuals?.shield)return false;
    if(!extraAssets.kite){extraAssets.kite=new Image();extraAssets.kite.addEventListener('load',redraw);extraAssets.kite.src=`images/kiteshield.png?build=${encodeURIComponent(window.PRESENTATION_BUILD||BUILD)}`;}
    if(installed)return true;
    let raw=visuals.shield;
    Object.defineProperty(visuals,'shield',{configurable:true,enumerable:true,get(){return frontSource(raw);},set(next){raw=next;}});
    // humanoidRenderer exposes rear assets. Keep rear art material-only for now:
    // heraldry belongs on the face, not magically through the straps/backing.
    installed=true;window.__shieldAppearanceInstalled=true;return true;
  }

  function redraw(e){if(e)syncCharacter(e);window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();}
  function syncCharacter(source){if(!source)return;for(const target of [...(window.party||[]),...(window.entities||[])]){if(!target||target===source||target.name!==source.name)continue;target.shieldAppearance=JSON.parse(JSON.stringify(source.shieldAppearance||{}));}}

  // equipmentAppearance calls isSlotVisible immediately before the renderer resolves
  // a held item. Wrap it narrowly so the gameVisuals.shield getter knows which
  // character's livery to return without changing the compositor architecture.
  function hookAppearanceSystem(){const sys=window.equipmentAppearanceSystem;if(!sys||sys.__shieldHooked)return false;const original=sys.isSlotVisible;sys.isSlotVisible=function(e,slot){if(slot==='offhand'||slot==='weapon')noteEntity(e);return original.call(this,e,slot);};sys.__shieldHooked=true;return true;}

  window.shieldAppearanceSystem={build:BUILD,visuals:SHIELD_VISUALS,patterns:['solid','per_pale','per_fess','quarterly'],ensure,getAppearance,setAppearance,compose,shieldSpec,syncCharacter,redraw,noteEntity};
  const timer=setInterval(()=>{const a=install(),b=hookAppearanceSystem();if(a&&b)clearInterval(timer);},50);
  if(document.readyState==='complete'){install();hookAppearanceSystem();}else window.addEventListener('load',()=>{install();hookAppearanceSystem();},{once:true});
})();
