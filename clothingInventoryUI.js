// Compact per-item colour controls for explicit clothing image parts.
(() => {
  'use strict';
  const BUILD='20260928-clothing-inventory-v2';
  let wrapped=false;

  function ensurePicker(){
    if(window.buildPreciseColorPicker||document.querySelector('script[data-precise-appearance-colour]'))return;
    const s=document.createElement('script');
    s.src=`preciseAppearanceColor.js?build=${BUILD}`;
    s.async=false;
    s.dataset.preciseAppearanceColour='true';
    document.head.appendChild(s);
  }

  function fallback(label,value,onChange){
    const row=document.createElement('label');
    row.style.cssText='display:grid;grid-template-columns:145px 1fr;gap:8px;align-items:center;margin:5px 0;font-size:.9em;';
    const t=document.createElement('span');t.textContent=label;
    const i=document.createElement('input');i.type='range';i.min='0';i.max='359';i.value=String(value.hue);
    i.oninput=()=>onChange({...value,hue:Number(i.value)});
    row.append(t,i);
    return row;
  }

  function colourControl(label,key,value,onChange){
    return window.buildPreciseColorPicker
      ? window.buildPreciseColorPicker({key,label,hue:value.hue,saturation:value.saturation,value:value.value,compact:true,onChange})
      : fallback(label,value,onChange);
  }

  function transparencyControl(label,value,onChange){
    const row=document.createElement('label');
    row.style.cssText='display:grid;grid-template-columns:145px 1fr 42px;gap:8px;align-items:center;margin:5px 0;font-size:.9em;';
    const t=document.createElement('span');t.textContent=`${label} transparency`;
    const i=document.createElement('input');i.type='range';i.min='0';i.max='100';i.step='1';
    const out=document.createElement('span');out.style.cssText='font-size:.82em;text-align:right;color:#bbb;';
    const initial=Math.round((1-Math.max(0,Math.min(1,Number(value.opacity??1))))*100);
    i.value=String(initial);out.textContent=`${initial}%`;
    i.oninput=()=>{
      const transparency=Number(i.value);
      out.textContent=`${transparency}%`;
      onChange({...value,opacity:1-(transparency/100)});
    };
    row.append(t,i,out);
    return row;
  }

  function sync(p){
    const e=(window.entities||[]).find(x=>x.name===p?.name);
    if(e&&e!==p){
      e.clothingColors=JSON.parse(JSON.stringify(p.clothingColors||{}));
      window.clothingSystem?.migrateLegacyEquipment?.(e);
    }
  }

  function redraw(p){
    sync(p);
    window.drawMap?.();
    window.renderEntities?.();
    window.refreshDirectionalTurnPortraits?.();
  }

  function colourableItems(p,cs){
    const ids=[];
    const seen=new Set();
    const add=id=>{
      if(!id||seen.has(id))return;
      const sp=cs.getItemSpec(id);
      if(!sp||!sp.layers.some(part=>part.tint))return;
      seen.add(id);ids.push(id);
    };
    for(const id of p.inventory||[]) add(id);
    for(const slot of cs.slots||[]) add(p.equipped?.[slot]);
    return ids;
  }

  function openEditor(box,p,cs,id){
    const old=box.querySelector('[data-clothing-item-editor]');
    if(old) old.remove();

    const sp=cs.getItemSpec(id);
    if(!sp)return;
    const name=window.items?.[id]?.name||id;
    const editor=document.createElement('div');
    editor.dataset.clothingItemEditor='true';
    editor.style.cssText='border-top:1px solid #555;margin-top:8px;padding-top:8px;';

    const head=document.createElement('div');
    head.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;';
    const title=document.createElement('strong');title.textContent=`Colour: ${name}`;
    const close=document.createElement('button');close.type='button';close.textContent='Close';close.style.cssText='width:auto;padding:4px 8px;font-size:.8em;';
    close.onclick=()=>editor.remove();
    head.append(title,close);editor.appendChild(head);

    for(const part of sp.layers){
      if(!part.tint)continue;
      const partBox=document.createElement('div');
      partBox.style.cssText='border:1px solid #444;border-radius:4px;padding:6px;margin:6px 0;';
      if(sp.layers.length>1){
        const partTitle=document.createElement('div');partTitle.textContent=part.label;partTitle.style.cssText='font-size:.85em;font-weight:bold;margin-bottom:4px;color:#ddd;';partBox.appendChild(partTitle);
      }
      const current=cs.getLayerColour(p,id,part);
      partBox.appendChild(colourControl(
        sp.layers.length>1?'Colour':`${name} colour`,
        `clothing-${id}-${part.id}`,
        current,
        next=>{cs.setLayerColour(p,id,part.id,next);redraw(p);}
      ));
      partBox.appendChild(transparencyControl(
        sp.layers.length>1?part.label:name,
        current,
        next=>{cs.setLayerColour(p,id,part.id,next);redraw(p);}
      ));
      editor.appendChild(partBox);
    }
    box.appendChild(editor);
  }

  function inject(){
    const host=document.getElementById('inventory-content'),p=window.player,cs=window.clothingSystem;
    if(!host||!p||!cs||host.querySelector('[data-clothing-colours]'))return;
    cs.migrateLegacyEquipment(p);

    const ids=colourableItems(p,cs);
    const box=document.createElement('div');
    box.dataset.clothingColours='true';
    box.style.cssText='border:1px solid #555;border-radius:5px;padding:8px;margin:8px 0 12px;';
    const title=document.createElement('strong');title.textContent='Item colours';box.appendChild(title);

    if(!ids.length){
      const n=document.createElement('div');
      n.style.cssText='font-size:.8em;color:#aaa;margin-top:6px;';
      n.textContent='Colourable clothing will appear here.';
      box.appendChild(n);
    } else {
      const list=document.createElement('div');
      list.style.cssText='display:flex;flex-direction:column;gap:5px;margin-top:7px;';
      for(const id of ids){
        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #3f3f3f;padding:3px 0 6px;';
        const name=document.createElement('span');name.textContent=window.items?.[id]?.name||id;
        const equipped=(cs.slots||[]).some(slot=>p.equipped?.[slot]===id);
        if(equipped){const tag=document.createElement('small');tag.textContent=' equipped';tag.style.cssText='color:#aaa;font-size:.75em;';name.appendChild(tag);}
        const btn=document.createElement('button');btn.type='button';btn.textContent='Colour';btn.style.cssText='width:auto;padding:5px 10px;font-size:.82em;';
        btn.onclick=()=>openEditor(box,p,cs,id);
        row.append(name,btn);list.appendChild(row);
      }
      box.appendChild(list);
    }
    host.prepend(box);
  }

  function install(){
    ensurePicker();
    window.clothingSystem?.migrateLegacyEquipment?.(window.player);
    if(wrapped||typeof window.showInventoryScreen!=='function')return;
    const base=window.showInventoryScreen;
    window.showInventoryScreen=function(){const r=base.apply(this,arguments);inject();return r;};
    wrapped=true;
  }

  window.injectClothingColourControls=inject;
  const timer=setInterval(()=>{install();if(wrapped)clearInterval(timer);},50);
  if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
})();
