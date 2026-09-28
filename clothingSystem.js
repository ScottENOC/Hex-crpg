// clothingSystem.js
// Compatibility loader for the explicit garment-layer model.
(() => {
  'use strict';
  const BUILD='20260928-clothing-v3';
  function load(src,key){
    if(document.querySelector(`script[data-${key}]`))return;
    const s=document.createElement('script');s.src=`${src}?build=${BUILD}`;s.async=false;s.dataset[key]='true';document.head.appendChild(s);
  }
  // Clothing is no longer inferred from colours baked into body sprites.
  // Each clothing part is an authored image and owns its own colour control.
  load('clothingLayers.js','explicit-clothing-layers');
  load('clothingInventoryUI.js','clothing-inventory-ui');
  window.applyClothingPreset=function(entity,itemId){
    if(!entity||!itemId)return;
    const wait=()=>{
      const cs=window.clothingSystem,spec=cs?.getItemSpec?.(itemId);
      if(!cs||!spec){setTimeout(wait,0);return;}
      cs.migrateLegacyEquipment(entity);entity.equipped[spec.slot]=itemId;
    };
    wait();
  };
})();