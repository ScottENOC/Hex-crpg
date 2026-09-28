// clothingSystem.js
// Compatibility loader for the explicit garment-layer model.
(() => {
  'use strict';
  const BUILD='20260928-clothing-v6';

  function load(src,key){
    const attr=`data-${key}`;
    if(document.querySelector(`script[${attr}]`)) return;
    const s=document.createElement('script');
    s.src=`${src}?build=${BUILD}`;
    s.async=false;
    // DOMStringMap property names cannot contain hyphens. setAttribute keeps
    // the readable data-explicit-clothing-layers/data-clothing-inventory-ui
    // markers without throwing before the scripts are appended.
    s.setAttribute(attr,'true');
    document.head.appendChild(s);
  }

  // Clothing is no longer inferred from colours baked into body sprites.
  // Each clothing part is an authored image and owns its own colour control.
  load('clothingLayers.js','explicit-clothing-layers');
  load('equipmentAppearance.js','equipment-appearance');
  load('clothingInventoryUI.js','clothing-inventory-ui');

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