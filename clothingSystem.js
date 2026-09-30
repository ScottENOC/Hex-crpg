// clothingSystem.js
// Compatibility loader for the explicit garment-layer model.
(() => {
  'use strict';
  const BUILD=window.PRESENTATION_BUILD||'20260930-visibility-assets-v1';

  function load(src,key){
    const attr=`data-${key}`;
    if(document.querySelector(`script[${attr}]`)) return;
    const s=document.createElement('script');
    s.src=`${src}?build=${encodeURIComponent(BUILD)}`;
    s.async=false;
    s.setAttribute(attr,'true');
    document.head.appendChild(s);
  }

  // Clothing is no longer inferred from colours baked into body sprites.
  // Each clothing part is an authored image and owns its own colour control.
  load('clothingLayers.js','explicit-clothing-layers');
  // The Silverhart clothier still sells four pre-slot-era outfit IDs. Traveler's
  // Garb already has compatibility art in clothingLayers.js; the other three
  // are upgraded here to the same explicit, directional garment model.
  load('merchantClothingArt.js','merchant-clothing-art');
  load('equipmentAppearance.js','equipment-appearance');
  load('clothingInventoryUI.js','clothing-inventory-ui');
  load('seasonalClothing.js','seasonal-clothing');
  load('skirtClothing.js','skirt-clothing');
  load('fashionMarket.js','silverhart-fashion-market');

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
