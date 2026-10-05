// clothingSystem.js
// Compatibility loader for the explicit garment-layer model.
(() => {
  'use strict';
  const BUILD=window.PRESENTATION_BUILD||'20261005-unified-clothing-v1';
  const RETIRED_GARMENTS=new Set(['fine_tunic','noble_doublet','scholars_robe','traveler_garb','top_masc_toggle','top_masc_buttoned','top_masc_lacework']);

  function load(src,key){
    const attr=`data-${key}`;
    if(document.querySelector(`script[${attr}]`)) return;
    const s=document.createElement('script');
    s.src=`${src}?build=${encodeURIComponent(BUILD)}`;
    s.async=false;
    s.setAttribute(attr,'true');
    document.head.appendChild(s);
  }

  function purgeRetiredReferences(){
    // The original Silverhart clothier list predates the newer fashion-market
    // system. Keep it from advertising retired IDs even on saves/pages where
    // campaign2Content.js was evaluated before this compatibility loader.
    if(Array.isArray(window.campaign2ClothierItems)){
      for(let i=window.campaign2ClothierItems.length-1;i>=0;i--){
        if(RETIRED_GARMENTS.has(window.campaign2ClothierItems[i])) window.campaign2ClothierItems.splice(i,1);
      }
    }

    // Development saves made while these three garments existed may still
    // have today's ready-made stock or an outstanding bespoke order cached.
    // Purge those references so no retired item can reappear from save data.
    const p=window.party?.[0]||window.player;
    const market=p?.silverhartFashionMarket;
    if(market?.stock){
      for(const bucket of Object.values(market.stock)){
        if(Array.isArray(bucket?.entries)) bucket.entries=bucket.entries.filter(e=>!RETIRED_GARMENTS.has(e?.itemId));
      }
    }
    if(Array.isArray(market?.commissions)){
      const removed=market.commissions.filter(c=>RETIRED_GARMENTS.has(c?.itemId));
      if(removed.length&&p){
        p.gold=(p.gold||0)+removed.filter(c=>!c.collected).reduce((sum,c)=>sum+(Number(c.price)||0),0);
        market.commissions=market.commissions.filter(c=>!RETIRED_GARMENTS.has(c?.itemId));
      }
    }
  }

  // Clothing is no longer inferred from colours baked into body sprites.
  // Each clothing part is an authored image and owns its own colour control.
  load('clothingLayers.js','explicit-clothing-layers');
  load('equipmentAppearance.js','equipment-appearance');
  load('clothingInventoryUI.js','clothing-inventory-ui');
  load('iosEquipmentTouchFix.js','ios-equipment-touch-fix');
  load('seasonalClothing.js','seasonal-clothing');
  load('skirtClothing.js','skirt-clothing');
  load('pantsVariantFixes.js','pants-variant-fixes');
  load('spriteAlignmentFixes.js','sprite-alignment-fixes');
  load('fashionMarket.js','silverhart-fashion-market');
  load('bodyMarkingSystem.js','body-marking-system');
  load('clothingSlotExpansion.js','small-clothing-slot-expansion');
  load('newClothingGarments.js','new-clothing-garments');
  // Content policy comes last so it can wrap the final clothing-slot model.
  // It still polls briefly during startup because renderHotPathCache may install
  // its shirt fast path after this nested loader finishes.
  load('contentSafety.js','content-safety');

  purgeRetiredReferences();
  setInterval(purgeRetiredReferences,1000);

  window.applyClothingPreset=function(entity,itemId){
    if(!entity||!itemId) return;
    let attempts=0;
    const wait=()=>{
      const cs=window.clothingSystem,spec=cs?.getItemSpec?.(itemId);
      if(!cs||!spec){
        if(++attempts<200) setTimeout(wait,10);
        return;
      }
      cs.migrateLegacyEquipment(entity);
      entity.equipped[spec.slot]=itemId;
    };
    wait();
  };
})();