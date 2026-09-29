// Inventory controls for shield shape metadata and two-colour heraldry.
(() => {
  'use strict';
  const BUILD='20260929-shield-ui-v1';
  let installed=false;

  function equippedShield(entity){
    const id=entity?.equipped?.offhand;
    return id&&window.items?.[id]?.type==='shield'?id:null;
  }
  function slider(label,value,min,max,oninput){
    const row=document.createElement('label');
    row.style.cssText='display:grid;grid-template-columns:105px 1fr 38px;gap:7px;align-items:center;margin:5px 0;font-size:.82em;color:#ddd;';
    const text=document.createElement('span');text.textContent=label;
    const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.value=value;
    const out=document.createElement('span');out.textContent=value;
    input.addEventListener('input',()=>{out.textContent=input.value;oninput(Number(input.value));});
    row.append(text,input,out);return row;
  }
  function colourControls(panel,title,colour,apply){
    const heading=document.createElement('div');heading.textContent=title;heading.style.cssText='font-weight:bold;margin-top:7px;color:#eee;';panel.appendChild(heading);
    panel.appendChild(slider('Hue',colour.hue,0,359,v=>apply({hue:v})));
    panel.appendChild(slider('Saturation',colour.saturation,0,100,v=>apply({saturation:v})));
    panel.appendChild(slider('Brightness',colour.value,5,100,v=>apply({value:v})));
  }
  function renderPanel(){
    const host=document.getElementById('inventory-content');
    const sys=window.shieldAppearanceSystem,entity=window.player;
    if(!host||!sys||!entity)return;
    host.querySelector('#shield-appearance-panel')?.remove();
    const itemId=equippedShield(entity);if(!itemId)return;
    const item=window.items[itemId],a=sys.getAppearance(entity,itemId),visual=item.shieldVisual||{};
    const panel=document.createElement('div');panel.id='shield-appearance-panel';
    panel.style.cssText='margin:12px 0;padding:10px;border:1px solid #666;border-radius:6px;background:#292929;';
    const h=document.createElement('h3');h.textContent='Shield appearance';h.style.margin='0 0 5px';panel.appendChild(h);
    const meta=document.createElement('div');meta.style.cssText='font-size:.8em;color:#aaa;margin-bottom:8px;';meta.textContent=`${item.name} — ${visual.shape||'round'} ${visual.material||'wood'} shield`;panel.appendChild(meta);
    const patternLabel=document.createElement('label');patternLabel.textContent='Pattern ';patternLabel.style.cssText='display:block;font-size:.85em;margin-bottom:8px;';
    const select=document.createElement('select');
    [['solid','Solid'],['per_pale','Split vertically'],['per_fess','Split horizontally'],['quarterly','Quartered']].forEach(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);});
    select.value=a.pattern;select.addEventListener('change',()=>{sys.setAppearance(entity,itemId,{pattern:select.value});renderPanel();});patternLabel.appendChild(select);panel.appendChild(patternLabel);
    const setColour=(which,delta)=>{const current=sys.getAppearance(entity,itemId);sys.setAppearance(entity,itemId,{[which]:{...current[which],...delta}});};
    colourControls(panel,'Primary colour',a.primary,d=>setColour('primary',d));
    if(a.pattern!=='solid')colourControls(panel,'Secondary colour',a.secondary,d=>setColour('secondary',d));
    panel.appendChild(slider('Paint strength',Math.round(a.paintOpacity*100),0,100,v=>sys.setAppearance(entity,itemId,{paintOpacity:v/100})));
    const note=document.createElement('div');note.style.cssText='font-size:.75em;color:#999;margin-top:7px;';note.textContent='Paint preserves the shield’s underlying grain, metalwork and shading. Heraldry is shown on the shield face only.';panel.appendChild(note);
    const backpackHeading=[...host.querySelectorAll('h3')].find(el=>el.textContent==='Backpack');
    if(backpackHeading)host.insertBefore(panel,backpackHeading);else host.appendChild(panel);
  }
  function install(){
    if(installed)return true;
    if(typeof window.showInventoryScreen!=='function'||!window.shieldAppearanceSystem)return false;
    const original=window.showInventoryScreen;
    window.showInventoryScreen=function(){const result=original.apply(this,arguments);renderPanel();return result;};
    window.showInventoryScreen.__shieldAppearanceUI=true;
    installed=true;window.__shieldAppearanceUIReady=true;
    if(document.getElementById('inventory-modal')?.style.display==='block')renderPanel();
    return true;
  }
  window.renderShieldAppearanceControls=renderPanel;
  const timer=setInterval(()=>{if(install())clearInterval(timer);},50);
  if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
})();
