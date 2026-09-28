// Inventory colour controls for explicit clothing image parts.
(() => {
  'use strict';
  const BUILD='20260928-clothing-inventory-v1';
  let wrapped=false;
  function ensurePicker(){
    if(window.buildPreciseColorPicker||document.querySelector('script[data-precise-appearance-colour]'))return;
    const s=document.createElement('script');s.src=`preciseAppearanceColor.js?build=${BUILD}`;s.async=false;s.dataset.preciseAppearanceColour='true';document.head.appendChild(s);
  }
  function fallback(label,value,onChange){
    const row=document.createElement('label');row.style.cssText='display:grid;grid-template-columns:145px 1fr;gap:8px;align-items:center;margin:5px 0;font-size:.9em;';
    const t=document.createElement('span');t.textContent=label;const i=document.createElement('input');i.type='range';i.min='0';i.max='359';i.value=String(value.hue);i.oninput=()=>onChange({...value,hue:Number(i.value)});row.append(t,i);return row;
  }
  function control(label,key,value,onChange){return window.buildPreciseColorPicker?window.buildPreciseColorPicker({key,label,hue:value.hue,saturation:value.saturation,value:value.value,compact:true,onChange}):fallback(label,value,onChange);}
  function sync(p){const e=(window.entities||[]).find(x=>x.name===p?.name);if(e&&e!==p){e.clothingColors=JSON.parse(JSON.stringify(p.clothingColors||{}));window.clothingSystem?.migrateLegacyEquipment?.(e);}}
  function redraw(p){sync(p);window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();}
  function inject(){
    const host=document.getElementById('inventory-content'),p=window.player,cs=window.clothingSystem;if(!host||!p||!cs||host.querySelector('[data-clothing-colours]'))return;
    cs.migrateLegacyEquipment(p);const box=document.createElement('div');box.dataset.clothingColours='true';box.style.cssText='border:1px solid #555;border-radius:5px;padding:8px;margin:8px 0 12px;';
    const title=document.createElement('strong');title.textContent='Clothing colours';box.appendChild(title);let count=0;
    for(const slot of [...cs.slots].reverse()){
      const id=p.equipped?.[slot],sp=id&&cs.getItemSpec(id);if(!sp)continue;const name=window.items?.[id]?.name||id;
      for(const part of sp.layers){if(!part.tint)continue;const c=cs.getLayerColour(p,id,part);box.appendChild(control(`${name} — ${part.label}`,`clothing-${slot}-${id}-${part.id}`,c,next=>{cs.setLayerColour(p,id,part.id,next);redraw(p);}));count++;}
    }
    if(!count){const n=document.createElement('div');n.style.cssText='font-size:.8em;color:#aaa;margin-top:6px;';n.textContent='Equip clothing to edit the colour of each clothing part.';box.appendChild(n);}
    host.prepend(box);
  }
  function install(){ensurePicker();window.clothingSystem?.migrateLegacyEquipment?.(window.player);if(wrapped||typeof window.showInventoryScreen!=='function')return;const base=window.showInventoryScreen;window.showInventoryScreen=function(){const r=base.apply(this,arguments);inject();return r;};wrapped=true;}
  window.injectClothingColourControls=inject;
  const timer=setInterval(()=>{install();if(wrapped)clearInterval(timer);},50);if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
})();