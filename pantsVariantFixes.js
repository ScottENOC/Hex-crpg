// Skirt physical-shape compatibility only. Directional garment rendering belongs in clothingLayers.js.
(() => {
  'use strict';
  const BUILD=window.PRESENTATION_BUILD||'20260930-skirt-shape-compat';
  const SKIRT_ID='pants_skirt';
  const SKIRT_WIDTH_SCALE=.85;
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

    for(const inst of skirts){
      inst.appearance=inst.appearance||{};
      if(!inst.appearance.clothingShape)inst.appearance.clothingShape=clone(fallback);
      normaliseShape(inst.appearance.clothingShape);
    }

    const equipped=e.equippedInstances?.pants;
    if(wearsSkirt&&equipped?.itemId===SKIRT_ID){
      equipped.appearance=equipped.appearance||{};
      if(!equipped.appearance.clothingShape)equipped.appearance.clothingShape=clone(fallback);

      const previous=equippedSkirtInstances.get(e);
      if(previous!==equipped){
        e.clothingShape[SKIRT_ID]=clone(equipped.appearance.clothingShape);
        equippedSkirtInstances.set(e,equipped);
      }else{
        const local=normaliseShape(clone(e.clothingShape[SKIRT_ID])||clone(equipped.appearance.clothingShape));
        if(!sameShape(local,equipped.appearance.clothingShape))equipped.appearance.clothingShape=clone(local);
        e.clothingShape[SKIRT_ID]=clone(equipped.appearance.clothingShape);
      }
    }else{
      equippedSkirtInstances.delete(e);
      if(skirts.length&&!e.clothingShape[SKIRT_ID])e.clothingShape[SKIRT_ID]=fallback;
    }
  }

  function install(){
    const cs=window.clothingSystem;
    if(installed||!cs?.__skirtDrawPatched||!cs?.__seasonalShortsFitPatched||typeof cs.drawSlot!=='function')return false;
    const base=cs.drawSlot;
    cs.drawSlot=function(ctx,e,slot,v,bounds){
      if(slot==='pants'){
        syncPhysicalShapes(e);
        if(e?.equipped?.pants===SKIRT_ID){
          const narrower={...bounds,left:bounds.left+bounds.width*(1-SKIRT_WIDTH_SCALE)/2,width:bounds.width*SKIRT_WIDTH_SCALE};
          return base(ctx,e,slot,v,narrower);
        }
      }
      return base(ctx,e,slot,v,bounds);
    };
    cs.__pantsVariantFixes=true;
    installed=true;
    return true;
  }

  function tick(){
    for(const e of [...(window.party||[]),...(window.entities||[])])syncPhysicalShapes(e);
    if(window.player)syncPhysicalShapes(window.player);
    install();
  }

  const timer=setInterval(()=>{tick();if(installed)clearInterval(timer);},50);
  if(document.readyState==='complete')tick();else window.addEventListener('load',tick,{once:true});
  window.pantsVariantFixes={build:BUILD,syncPhysicalShapes};
})();
