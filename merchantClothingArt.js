// merchantClothingArt.js
// Directional art for the three Silverhart clothier outfits that pre-date the
// explicit shirt/pants/bra/underwear garment system.
(() => {
  'use strict';
  const VIEWS=id=>({front:`images/equipment/clothing/${id}_front.svg`,side:`images/equipment/clothing/${id}_side.svg`,back:`images/equipment/clothing/${id}_back.svg`});
  const twoTone=(id,extra={})=>({clothingSlot:'shirt',clothingLayers:[
    {id:'dark',label:'Main',sourceTone:'darkGreen',defaultColor:{hue:28,saturation:62,value:46,opacity:1},views:VIEWS(id)},
    {id:'light',label:'Trim',sourceTone:'lightGreen',defaultColor:{hue:38,saturation:46,value:72,opacity:1},views:VIEWS(id)}
  ],...extra});
  function install(){
    if(!window.items){setTimeout(install,10);return;}
    Object.assign(window.items.fine_tunic,twoTone('fine_tunic'));
    Object.assign(window.items.noble_doublet,twoTone('noble_doublet'));
    Object.assign(window.items.scholars_robe,twoTone('scholars_robe',{clothingFitMode:'dressSplit',clothingWaistFraction:.39,clothingMaxSkirtWidth:.94}));
  }
  install();
})();
