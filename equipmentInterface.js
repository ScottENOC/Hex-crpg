// Slot-first equipment UI: equipped boxes + one appearance-aware inventory list.
(()=>{'use strict';

const BUILD=window.PRESENTATION_BUILD||'20261002-equipment-ui-v7';
const SLOT_DEFS=[
  {key:'helmet',label:'Helmet',area:'helmet'},
  {key:'cloak',label:'Cloak',area:'cloak'},
  {key:'coat',label:'Coat',area:'coat'},
  {key:'shirt',label:'Shirt / Dress',area:'shirt'},
  {key:'topOuter',label:'Top outer / Corset',area:'topOuter'},
  {key:'armor',label:'Armour',area:'armor'},
  {key:'weapon',label:'Main hand',area:'weapon'},
  {key:'offhand',label:'Off hand',area:'offhand'},
  {key:'pants',label:'Pants',area:'pants'},
  {key:'tights',label:'Tights / Stockings',area:'tights'},
  {key:'shoes',label:'Shoes',area:'shoes'},
  {key:'bra',label:'Bra / Under-layer',area:'bra'},
  {key:'underwear',label:'Underwear',area:'underwear'},
  {key:'accessory',label:'Accessory',area:'accessory'}
];
window.EQUIPMENT_SLOT_DEFS=SLOT_DEFS;
let state={filter:'all',sort:'name',picker:null};

const base=v=>window.getEquipmentBaseId?.(v)||v;
const def=v=>window.items?.[base(v)]||null;
const isInst=v=>!!window.equipmentIdentity?.isInstance?.(v);

function clothingSlotsFor(raw){
  const id=base(raw),d=def(raw);
  if(d?.type!=='clothes')return[];
  const spec=window.clothingSystem?.getItemSpec?.(id);
  const declared=Array.isArray(spec?.slots)&&spec.slots.length
    ?spec.slots
    :(Array.isArray(d.clothingSlots)&&d.clothingSlots.length?d.clothingSlots:[spec?.slot||d.clothingSlot||'shirt']);
  return[...new Set(declared.filter(Boolean))];
}

function slotFor(raw){
  const id=base(raw),d=def(raw);
  if(!d)return null;
  if(d.type==='helmet')return'helmet';
  if(d.type==='armor')return d.subType==='barding'?null:'armor';
  if(d.type==='accessory')return'accessory';
  if(d.type==='shield')return'offhand';
  if(d.type==='weapon')return'weapon';
  if(d.type==='clothes')return window.clothingSystem?.getItemSpec?.(id)?.slot||d.clothingSlot||'shirt';
  return null;
}

function compatible(raw,slot,p){
  const d=def(raw);
  if(!d)return false;
  if(slot==='offhand'){
    if(d.type==='shield')return true;
    if(d.type!=='weapon'||!d.canOffhand)return false;
    const main=def(p?.equipped?.weapon);
    return !main||main.hands===1;
  }
  if(slot==='weapon')return d.type==='weapon';
  if(d.type==='clothes')return clothingSlotsFor(raw).includes(slot);
  return slotFor(raw)===slot;
}

function weight(raw){
  const d=def(raw);
  if(Number.isFinite(Number(d?.weight)))return Number(d.weight);
  const id=base(raw);
  if(d?.type==='helmet')return 2;
  if(d?.type==='shield')return id==='bulwark_shield'?7:5;
  if(d?.type==='armor'){const r=Number(d.reduction||0);return r>=3?18:r>=2?11:6;}
  if(d?.type==='weapon')return d.hands===2?4:2;
  if(d?.type==='clothes')return 1;
  if(d?.type==='accessory')return .2;
  return 0;
}

function value(raw){const d=def(raw);return Number(d?.buyPrice??d?.sellPrice??0);}
function label(raw){return window.inventoryDisplayName?.(raw)||window.describeEquipment?.(raw)||def(raw)?.name||String(base(raw));}

const INVENTORY_ICON_IDS=new Set([
  'dagger','pickaxe','chair','bottle','fruit','fish','herbs','game_meat','hide',
  'ore_iron','wood','stone','ore_silver','ore_gold','gem_red','gem_blue','gem_green',
  'starmetal_ore','dragon_scale','deep_crystal','sword_arrow_deflection','potion_health',
  'glowing_ring','orcbane_pendant','wolfward_charm','undying_locket','silvertongue_ring',
  'stormcaller_spear','nightowl_bow','featherweight_dagger','ashenwood_club',
  'travelers_cloakpin','moonlit_armor','huntsman_helm','shadowcloak','magic_backpack',
  'starforged_blade','dragonscale_mail','deepcrystal_pendant','hunting_bow',
  'reinforced_leather_armor','elder_locket','phylactery_shard','guild_ledger_evidence',
  'baron_tariff_evidence','disciple_evidence','wizard_corruption_evidence',
  'deepholds_sealed_letter'
]);

function imagePath(raw){
  const id=base(raw),d=def(raw);
  if(!id)return null;
  if(INVENTORY_ICON_IDS.has(id))return null;
  if(d?.type==='shield')return id==='bulwark_shield'?'images/equipment/shields/kite.png':'images/equipment/shields/round.png';
  if(d?.type==='helmet'){if(id==='nasal_helm')return'images/equipment/helmets/nasal_helm.png';return null;}
  if(d?.type==='weapon')return({
    sword:'images/equipment/weapons/sword.png',
    axe:'images/equipment/weapons/axe.png',
    club:'images/equipment/weapons/club.svg',
    spear:'images/equipment/weapons/spear.png',
    bow:'images/equipment/weapons/bow.svg',
    torch:'images/props/interactives/torch_lit.svg'
  })[id]||null;
  if(d?.type==='armor'){
    if(d.subType==='barding'){
      const tier=Number(d.reduction||0)>=3?'heavy':Number(d.reduction||0)>=2?'medium':'light';
      return`images/equipment/mounts/barding_${tier}.svg`;
    }
    const tier=Number(d.reduction||0)>=3?'heavy':Number(d.reduction||0)>=2?'medium':'light';
    return`images/equipment/armour/human/${tier}.png`;
  }
  return window.clothingSystem?.getItemSpec?.(id)?.layers?.[0]?.views?.front||null;
}

function spriteIcon(id,size){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 64 64');
  svg.setAttribute('aria-hidden','true');
  svg.style.cssText=`width:${size}px;height:${size}px;overflow:visible;`;
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');
  use.setAttribute('href',`images/equipment/item_icons.svg?build=${encodeURIComponent(BUILD)}#item-${id}`);
  svg.appendChild(use);
  return svg;
}

function appendMissingMark(wrap){
  if(wrap.querySelector('[data-missing-item-art]'))return;
  const mark=document.createElement('span');
  mark.dataset.missingItemArt='true';
  mark.textContent='◇';
  mark.title='Missing item art';
  mark.style.cssText='font-size:28px;color:#777';
  wrap.appendChild(mark);
}

// Clothing thumbnails are physical-instance previews, not raw PNG thumbnails.
// They therefore share colour/opacity data with the world renderer and stack key.
const clothingPreviewImages=new Map();
const clothingPreviewCache=new Map();

function stableAppearance(v){
  if(!isInst(v))return'';
  const sort=o=>{
    if(Array.isArray(o))return o.map(sort);
    if(o&&typeof o==='object'){
      return Object.fromEntries(
        Object.keys(o).sort().filter(k=>k!=='instanceId').map(k=>[k,sort(o[k])])
      );
    }
    return o;
  };
  return JSON.stringify(sort(v.appearance||null));
}

function previewImage(src,notify){
  let entry=clothingPreviewImages.get(src);
  if(!entry){
    const img=window.assetManager.request(src);
    entry={img,ready:false,failed:false,listeners:new Set()};
    clothingPreviewImages.set(src,entry);
    window.assetManager.whenReady(src).then(()=>{
      entry.ready=true;
      for(const fn of entry.listeners)fn();
      entry.listeners.clear();
    }).catch(()=>{
      entry.failed=true;
      for(const fn of entry.listeners)fn();
      entry.listeners.clear();
    });
  }
  if(notify&&!entry.ready&&!entry.failed)entry.listeners.add(notify);
  return entry;
}

function alphaBounds(canvas){
  const w=canvas.width,h=canvas.height;
  let result={x:0,y:0,w,h};
  try{
    const p=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
    let left=w,top=h,right=-1,bottom=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(p[(y*w+x)*4+3]<8)continue;
      if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;
    }
    if(right>=left&&bottom>=top)result={x:left,y:top,w:right-left+1,h:bottom-top+1};
  }catch(_){}
  return result;
}

function clothingColour(raw,layer){
  const c=isInst(raw)?raw.appearance?.clothing?.[layer.id]:null;
  return c||layer.defaultColor||{hue:30,saturation:70,value:70,opacity:1};
}

function skirtShape(raw){
  const shape=isInst(raw)?raw.appearance?.clothingShape:null;
  return{
    length:Math.max(.35,Math.min(.90,Number(shape?.length??.62))),
    flare:Math.max(0,Math.min(.30,Number(shape?.flare??.15)))
  };
}

function drawShapedSkirtIcon(ctx,source,crop,size,shape){
  const topY=size*.06;
  const destH=size*.88*(shape.length/.90);
  const topW=size*.62*.85;
  const strips=24;
  for(let row=0;row<strips;row++){
    const sy0=crop.y+Math.floor(crop.h*row/strips);
    const sy1=crop.y+Math.ceil(crop.h*(row+1)/strips);
    if(sy1<=sy0)continue;
    const t=(row+.5)/strips;
    const dw=topW*(1+shape.flare*t);
    const dx=(size-dw)/2;
    const dy0=topY+destH*row/strips;
    const dy1=topY+destH*(row+1)/strips;
    ctx.drawImage(source,crop.x,sy0,crop.w,sy1-sy0,dx,dy0,dw,dy1-dy0+.25);
  }
}

function renderClothingPreview(raw,size,canvas,wrap){
  const id=base(raw),cs=window.clothingSystem,spec=cs?.getItemSpec?.(id);
  if(!spec?.layers?.length)return false;

  const key=`${id}|${stableAppearance(raw)||'default'}|${size}`;
  const cached=clothingPreviewCache.get(key);
  if(cached){
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);
    ctx.drawImage(cached,0,0,size,size);
    return true;
  }

  // The trousers source is much larger than the other clothing art. Reuse the
  // pants renderer's downsampled/tinted cache so inventory previews do not run
  // a 1254px image through the generic pixel pipeline on iOS.
  if(id==='pants_trousers'&&window.pantsVariantFixes?.getTrousersPreview){
    const part=spec.layers[0],prepared=window.pantsVariantFixes.getTrousersPreview(clothingColour(raw,part));
    if(!prepared)return true;
    const result=document.createElement('canvas');
    result.width=size;result.height=size;
    const rctx=result.getContext('2d'),crop=prepared.crop;
    const maxW=size*.88,maxH=size*.88,scale=Math.min(maxW/crop.w,maxH/crop.h);
    const dw=crop.w*scale,dh=crop.h*scale,dx=(size-dw)/2,dy=(size-dh)/2;
    rctx.drawImage(prepared.canvas,crop.x,crop.y,crop.w,crop.h,dx,dy,dw,dh);
    clothingPreviewCache.set(key,result);
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);
    ctx.drawImage(result,0,0,size,size);
    return true;
  }

  const layers=[];
  let waiting=false,failed=false;
  const retry=()=>renderClothingPreview(raw,size,canvas,wrap);
  for(const layer of spec.layers){
    const src=layer.views?.front||layer.views?.side||layer.views?.back;
    if(!src)continue;
    const entry=previewImage(src,retry);
    if(entry.failed){failed=true;continue;}
    if(!entry.ready){waiting=true;continue;}
    layers.push({layer,img:entry.img});
  }

  if(waiting)return true;
  if(failed&&!layers.length){appendMissingMark(wrap);canvas.remove();return true;}
  if(!layers.length)return false;

  const w=Math.max(...layers.map(x=>x.img.naturalWidth||1));
  const h=Math.max(...layers.map(x=>x.img.naturalHeight||1));
  const composed=document.createElement('canvas');
  composed.width=w;composed.height=h;
  const cctx=composed.getContext('2d');
  for(const {layer,img} of layers){
    const rendered=layer.tint===false?img:(cs.tintWholeLayer?.(img,clothingColour(raw,layer),layer)||img);
    cctx.drawImage(rendered,0,0,w,h);
  }

  const crop=alphaBounds(composed);
  const result=document.createElement('canvas');
  result.width=size;result.height=size;
  const rctx=result.getContext('2d');
  if(id==='pants_skirt'){
    drawShapedSkirtIcon(rctx,composed,crop,size,skirtShape(raw));
  }else{
    const maxW=size*.88,maxH=size*.88,scale=Math.min(maxW/crop.w,maxH/crop.h);
    const dw=crop.w*scale,dh=crop.h*scale,dx=(size-dw)/2,dy=(size-dh)/2;
    rctx.drawImage(composed,crop.x,crop.y,crop.w,crop.h,dx,dy,dw,dh);
  }
  clothingPreviewCache.set(key,result);
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,size,size);
  ctx.drawImage(result,0,0,size,size);
  return true;
}

function itemImage(raw,size=54){
  const wrap=document.createElement('div');
  wrap.style.cssText=`width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex:none;`;
  const id=base(raw),d=def(raw);

  if(d?.type==='clothes'){
    const canvas=document.createElement('canvas');
    canvas.width=size;canvas.height=size;
    canvas.setAttribute('aria-hidden','true');
    canvas.style.cssText=`width:${size}px;height:${size}px;object-fit:contain;`;
    wrap.appendChild(canvas);
    if(renderClothingPreview(raw,size,canvas,wrap))return wrap;
    canvas.remove();
  }

  const path=imagePath(raw);
  if(path){
    const img=window.assetManager.createDOMImage();
    window.assetManager.bind(img,path,{priority:-20,onError:()=>img.onerror?.()});
    img.alt='';
    img.style.cssText=`max-width:${size}px;max-height:${size}px;object-fit:contain;`;
    img.onerror=()=>{
      img.remove();
      if(INVENTORY_ICON_IDS.has(id))wrap.appendChild(spriteIcon(id,size));
      else appendMissingMark(wrap);
    };
    wrap.appendChild(img);
  }else if(INVENTORY_ICON_IDS.has(id)){
    wrap.appendChild(spriteIcon(id,size));
  }else{
    appendMissingMark(wrap);
  }
  return wrap;
}

function physicalFor(p,id,slot){return p?.equippedInstances?.[slot]||window.physicalEquipment?.current?.(p,id)||null;}

function entries(p){
  window.physicalEquipment?.reconcile?.(p);
  const physical=p.physicalEquipment||[],out=[...physical],counts={};
  for(const raw of p.inventory||[]){
    const id=base(raw);
    if(def(id))counts[id]=(counts[id]||0)+1;
  }
  for(const[id,n]of Object.entries(counts)){
    const have=physical.filter(x=>x.itemId===id).length;
    for(let i=have;i<n;i++)out.push(id);
  }
  return out;
}

function stackKey(v){
  const d=def(v);
  if(!d)return`unknown:${base(v)}`;
  if(isInst(v))return`${base(v)}|${v.designName||''}|${stableAppearance(v)}`;
  return`${base(v)}|plain`;
}

function grouped(p){
  const map=new Map();
  for(const raw of entries(p)){
    const key=stackKey(raw),g=map.get(key);
    if(g)g.count++;
    else map.set(key,{raw,count:1});
  }
  return[...map.values()];
}

function equip(raw,slot){
  const p=window.player,id=base(raw),d=def(raw);
  if(!p||!id)return;

  // The slot picker is an explicit choice. For flexible garments such as a
  // corset, honour the clicked slot instead of prompting again or silently
  // falling back to the garment's default slot.
  if(d?.type==='clothes'&&window.equipClothingToSlot){
    window.equipClothingToSlot(id,slot);
    if(isInst(raw)){
      p.equippedInstances=p.equippedInstances||{};
      for(const[otherSlot,other]of Object.entries(p.equippedInstances)){
        if(otherSlot!==slot&&other===raw)delete p.equippedInstances[otherSlot];
      }
      p.equippedInstances[slot]=raw;
      window.syncPlayerEntity?.();
    }
    state.picker=null;
    render();
    return;
  }

  if(isInst(raw)&&window.physicalEquipment&&slot===slotFor(raw)){
    window.physicalEquipment.equip(raw.instanceId);
    state.picker=null;
    return;
  }
  window.equipItem?.(id,slot==='offhand'&&d?.type==='weapon');
  if(isInst(raw)){
    p.equippedInstances=p.equippedInstances||{};
    p.equippedInstances[slot]=raw;
    window.syncPlayerEntity?.();
  }
  state.picker=null;
  render();
}

function unequipSlot(slot){
  const p=window.player;
  const expanded=window.clothingSlotExpansion?.slots||[];
  if(p?.equipped&&expanded.includes(slot)){
    p.equipped[slot]=null;
    if(p.equippedInstances)delete p.equippedInstances[slot];
    window.syncPlayerEntity?.();
    window.showCharacter?.();
    window.renderEntities?.();
    state.picker=null;
    render();
    return;
  }
  window.unequipItem?.(slot);
  state.picker=null;
}

function slotBox(p,s){
  const id=p.equipped?.[s.key],raw=(id&&physicalFor(p,id,s.key))||id,b=document.createElement('button');
  b.type='button';
  b.style.cssText=`grid-area:${s.area};min-height:92px;padding:6px;border:1px solid #666;border-radius:7px;background:#262626;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;overflow:hidden;touch-action:manipulation;`;
  b.appendChild(itemImage(raw));
  const sl=document.createElement('span');
  sl.textContent=s.label;
  sl.style.cssText='font-size:.68em;color:#aaa';
  const nm=document.createElement('span');
  nm.textContent=raw?label(raw):'Empty';
  nm.style.cssText='font-size:.76em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  b.append(sl,nm);
  b.onclick=()=>{state.picker=s.key;render();};
  return b;
}

function picker(p,slot){
  const modal=document.createElement('div');
  modal.dataset.equipmentSlotPicker='true';
  modal.style.cssText='position:fixed;inset:0;background:#000b;z-index:10020;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;touch-action:pan-y;padding-top:env(safe-area-inset-top);box-sizing:border-box';
  const panel=document.createElement('div');
  panel.style.cssText='background:#202020;border:1px solid #666;border-radius:12px 12px 0 0;width:min(680px,100%);max-height:min(82dvh,720px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:12px max(12px,env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box';
  const s=SLOT_DEFS.find(x=>x.key===slot),head=document.createElement('div');
  head.style.cssText='display:flex;justify-content:space-between;align-items:center;margin:-12px -12px 8px;padding:12px;position:sticky;top:-12px;z-index:1;background:#202020;border-bottom:1px solid #444';
  head.innerHTML=`<strong>${s?.label||slot}</strong>`;
  const close=document.createElement('button');
  close.type='button';
  close.textContent='Close';
  close.style.cssText='width:auto;min-height:44px;padding:8px 12px;touch-action:manipulation';
  close.onclick=()=>{state.picker=null;render();};
  head.appendChild(close);
  panel.appendChild(head);

  const none=document.createElement('button');
  none.type='button';
  none.textContent='Unequip / empty slot';
  none.style.cssText='width:100%;min-height:44px;margin-bottom:8px;padding:9px;touch-action:manipulation';
  none.onclick=()=>unequipSlot(slot);
  panel.appendChild(none);

  const choices=grouped(p).filter(g=>compatible(g.raw,slot,p));
  if(!choices.length)panel.insertAdjacentHTML('beforeend','<p>Nothing compatible in the shared inventory.</p>');

  for(const g of choices){
    const raw=g.raw,row=document.createElement('button');
    row.type='button';
    row.style.cssText='width:100%;min-height:56px;display:grid;grid-template-columns:54px 1fr auto;gap:8px;align-items:center;text-align:left;padding:7px;margin:4px 0;background:#2d2d2d;color:#eee;border:1px solid #444;border-radius:6px;touch-action:manipulation';
    row.appendChild(itemImage(raw));
    const txt=document.createElement('span');
    txt.innerHTML=`<strong>${label(raw)}${g.count>1?` ×${g.count}`:''}</strong><br><small>${weight(raw).toFixed(1)} wt · ${value(raw)}g</small>`;
    row.appendChild(txt);
    const use=document.createElement('span');
    use.textContent='Equip';
    row.appendChild(use);
    row.onclick=()=>equip(raw,slot);
    panel.appendChild(row);
  }

  modal.appendChild(panel);
  modal.onclick=e=>{if(e.target===modal){state.picker=null;render();}};
  document.body.appendChild(modal);
}

function backpack(p,host){
  const section=document.createElement('section');
  section.style.cssText='margin-top:12px;border-top:1px solid #555;padding-top:10px';
  const top=document.createElement('div');
  top.style.cssText='display:flex;gap:6px;flex-wrap:wrap;align-items:center';
  const h=document.createElement('strong');
  h.textContent='Inventory';
  h.style.marginRight='auto';
  top.appendChild(h);

  const f=document.createElement('select');
  f.style.touchAction='manipulation';
  for(const[v,t]of[
    ['all','All'],['weapon','Weapons'],['offhand','Off hand / shields'],['armor','Armour'],
    ['helmet','Helmets'],['cloak','Cloaks'],['coat','Coats'],['topOuter','Top outer / Corsets'],
    ['shirt','Tops / Dresses'],['pants','Pants'],['tights','Tights / Stockings'],['shoes','Shoes'],
    ['bra','Bra / Under-layers'],['underwear','Underwear'],['accessory','Accessories']
  ]){
    const o=document.createElement('option');o.value=v;o.textContent=t;f.appendChild(o);
  }
  f.value=state.filter;
  f.onchange=()=>{state.filter=f.value;render();};

  const sort=document.createElement('select');
  sort.style.touchAction='manipulation';
  for(const[v,t]of[['name','Name'],['slot','Slot'],['weight','Weight'],['value','Value']]){
    const o=document.createElement('option');o.value=v;o.textContent=`Sort: ${t}`;sort.appendChild(o);
  }
  sort.value=state.sort;
  sort.onchange=()=>{state.sort=sort.value;render();};
  top.append(f,sort);
  section.appendChild(top);

  let xs=grouped(p);
  if(state.filter!=='all'){
    xs=xs.filter(g=>compatible(g.raw,state.filter,p));
  }
  const cmp={
    name:(a,b)=>label(a.raw).localeCompare(label(b.raw)),
    slot:(a,b)=>(slotFor(a.raw)||'z').localeCompare(slotFor(b.raw)||'z')||label(a.raw).localeCompare(label(b.raw)),
    weight:(a,b)=>weight(a.raw)-weight(b.raw)||label(a.raw).localeCompare(label(b.raw)),
    value:(a,b)=>value(b.raw)-value(a.raw)||label(a.raw).localeCompare(label(b.raw))
  }[state.sort];
  xs.sort(cmp);

  for(const g of xs){
    const raw=g.raw,row=document.createElement('div');
    row.style.cssText='display:grid;grid-template-columns:48px minmax(0,1fr) 58px 58px;gap:7px;padding:7px 2px;border-bottom:1px solid #383838;align-items:center';
    row.appendChild(itemImage(raw,44));
    const n=document.createElement('span');
    n.textContent=`${label(raw)}${g.count>1?` ×${g.count}`:''}`;
    const w=document.createElement('span');
    w.textContent=`${weight(raw).toFixed(1)} wt`;
    w.style.cssText='font-size:.78em;color:#aaa;text-align:right';
    const v=document.createElement('span');
    v.textContent=`${value(raw)}g`;
    v.style.cssText='font-size:.78em;color:#aaa;text-align:right';
    row.append(n,w,v);
    section.appendChild(row);
  }
  host.appendChild(section);
}

function closeInventoryModal(){
  state.picker=null;
  document.querySelector('[data-equipment-slot-picker]')?.remove();
  const modal=document.getElementById('inventory-modal');
  if(!modal)return;
  modal.style.display='none';
  window.isPausedForReaction=false;
  window.lastModalClosedTime=Date.now();
  window.updateMusicState?.();
}

function installInputProbe(){
  if(window.__hexInputProbeInstalled)return;
  let enabled=false;
  try{
    enabled=new URLSearchParams(window.location.search).get('inputProbe')==='1'||localStorage.getItem('hex_input_probe')==='1';
  }catch(_){enabled=new URLSearchParams(window.location.search).get('inputProbe')==='1';}
  if(!enabled)return;
  window.__hexInputProbeInstalled=true;
  const out=document.createElement('pre');
  out.id='hex-input-probe';
  out.style.cssText='position:fixed;z-index:2147483647;left:6px;right:6px;top:max(6px,env(safe-area-inset-top));margin:0;padding:6px;background:#000d;color:#9f9;font:11px/1.25 monospace;white-space:pre-wrap;pointer-events:none;max-height:28vh;overflow:hidden;border:1px solid #597';
  document.body.appendChild(out);
  const lines=[];
  const describe=el=>{
    if(!el)return'—';
    const id=el.id?`#${el.id}`:'';
    const cls=el.classList?.length?`.${[...el.classList].slice(0,2).join('.')}`:'';
    return`${el.tagName||'?'}${id}${cls}`;
  };
  const record=event=>{
    const touch=event.changedTouches?.[0]||event.touches?.[0];
    const x=Number.isFinite(touch?.clientX)?touch.clientX:event.clientX;
    const y=Number.isFinite(touch?.clientY)?touch.clientY:event.clientY;
    const hit=Number.isFinite(x)&&Number.isFinite(y)?document.elementFromPoint(x,y):null;
    lines.push(`${event.type}: ${describe(event.target)} | hit ${describe(hit)}${event.defaultPrevented?' | prevented':''}`);
    if(lines.length>8)lines.shift();
    out.textContent=lines.join('\n');
  };
  for(const type of ['touchstart','pointerdown','touchend','pointerup','click']){
    document.addEventListener(type,record,{capture:true,passive:true});
  }
}

function installInventoryShell(){
  const modal=document.getElementById('inventory-modal');
  const content=modal?.querySelector('.modal-content');
  const host=document.getElementById('inventory-content');
  const close=document.getElementById('close-inventory-modal');
  if(!modal||!content||!host||!close)return false;
  if(modal.dataset.iosFirstInventory==='true')return true;

  modal.dataset.iosFirstInventory='true';
  content.classList.add('inventory-sheet');
  host.classList.add('inventory-sheet-scroll');

  const title=content.querySelector('h2');
  const header=document.createElement('div');
  header.className='inventory-sheet-header';
  if(title)header.appendChild(title);
  close.type='button';
  close.textContent='Close';
  close.setAttribute('aria-label','Close inventory');
  close.classList.add('inventory-sheet-close');
  header.appendChild(close);
  content.insertBefore(header,host);

  if(!document.getElementById('inventory-ios-first-style')){
    const style=document.createElement('style');
    style.id='inventory-ios-first-style';
    style.textContent=`
      #inventory-modal[data-ios-first-inventory="true"] .inventory-sheet-header{display:flex;align-items:center;gap:12px;border-bottom:1px solid #555;background:#333;z-index:2}
      #inventory-modal[data-ios-first-inventory="true"] .inventory-sheet-header h2{margin:0 auto 0 0;font-size:1.2rem}
      #inventory-modal[data-ios-first-inventory="true"] .inventory-sheet-close{position:static!important;min-width:64px;min-height:44px;padding:9px 12px!important;font-size:16px!important;line-height:1.1;background:#4a4a4a!important;color:#fff!important;border:1px solid #777!important;border-radius:7px!important;touch-action:manipulation}
      #inventory-modal[data-ios-first-inventory="true"] button,#inventory-modal[data-ios-first-inventory="true"] select{touch-action:manipulation}
      @media (max-width:850px),(pointer:coarse){
        #inventory-modal[data-ios-first-inventory="true"]{inset:0!important;width:auto!important;height:auto!important;overflow:hidden!important;overscroll-behavior:none;touch-action:pan-y;background:#333!important}
        #inventory-modal[data-ios-first-inventory="true"]>.inventory-sheet{box-sizing:border-box;width:100%!important;max-width:none!important;height:100dvh!important;max-height:none!important;margin:0!important;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)!important;border:0!important;border-radius:0!important;display:flex;flex-direction:column;overflow:hidden!important;touch-action:pan-y}
        #inventory-modal[data-ios-first-inventory="true"] .inventory-sheet-header{flex:none;min-height:56px;padding:8px max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left));box-sizing:border-box}
        #inventory-modal[data-ios-first-inventory="true"] .inventory-sheet-scroll{flex:1;min-height:0;overflow-y:auto!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:12px max(12px,env(safe-area-inset-right)) 18px max(12px,env(safe-area-inset-left));box-sizing:border-box}
      }
    `;
    document.head.appendChild(style);
  }

  // main.js still contains a legacy window-level touchend shim for old mobile
  // controls. Do not let it call preventDefault() for Inventory: Safari should
  // perform normal hit-testing and synthesize the ordinary click itself.
  modal.addEventListener('touchend',event=>event.stopPropagation(),{passive:true});

  // Close is deliberately a direct native click path rather than relying on the
  // old delegated touch shim. Stopping the click here also prevents a second
  // delegated close at window level.
  close.addEventListener('click',event=>{
    event.stopPropagation();
    closeInventoryModal();
  });

  return true;
}

function render(){
  document.querySelector('[data-equipment-slot-picker]')?.remove();
  installInventoryShell();
  const host=document.getElementById('inventory-content'),p=window.player;
  if(!host||!p)return;
  window.clothingSystem?.migrateLegacyEquipment?.(p);
  window.physicalEquipment?.reconcile?.(p);
  window.pantsVariantFixes?.syncPhysicalShapes?.(p);
  host.innerHTML='';
  host.dataset.equipmentRedesign='true';

  const gold=document.createElement('div');
  gold.textContent=`Gold: ${p.gold||0}`;
  gold.style.cssText='font-weight:bold;margin-bottom:8px';
  host.appendChild(gold);

  const layout=document.createElement('div');
  layout.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-areas:". helmet ." "cloak cloak cloak" "coat coat coat" "weapon armor offhand" "topOuter topOuter accessory" "shirt shirt accessory" "pants pants pants" "tights tights tights" "shoes shoes shoes" "bra bra bra" "underwear underwear underwear";gap:7px';
  for(const s of SLOT_DEFS)layout.appendChild(slotBox(p,s));
  host.appendChild(layout);
  backpack(p,host);
  if(state.picker)picker(p,state.picker);
}

function install(){
  installInputProbe();
  installInventoryShell();
  if(typeof window.showInventoryScreen!=='function'||window.showInventoryScreen.__slotEquipmentUI)return false;
  window.showInventoryScreen=function(){installInventoryShell();render();};
  window.showInventoryScreen.__slotEquipmentUI=true;
  window.renderEquipmentInterface=render;
  return true;
}

const timer=setInterval(()=>{if(install())clearInterval(timer);},50);
window.addEventListener('load',install,{once:true});
})();