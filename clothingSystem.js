// clothingSystem.js
// First-pass layered clothing system. Equipped clothes are separate art from
// the body's baked-in underclothes, with independent primary/secondary hues.
(() => {
  'use strict';

  const BUILD = '20260928-clothing-v1';
  const cache = new Map();
  let installedWorldWrapper = false;
  let installedInventoryWrapper = false;

  const CLOTHING_VISUALS = {
    traveler_garb: {
      views: {
        front: 'images/clothing/traveler_garb_front.svg',
        side: 'images/clothing/traveler_garb_side.svg',
        back: 'images/clothing/traveler_garb_back.svg',
      },
      gender: 'unisex',
      wealthBands: ['poor', 'working', 'comfortable'],
      npcTags: ['traveller', 'villager', 'worker', 'tavern_staff', 'guard_off_duty'],
      primaryDefault: 28,
      secondaryDefault: 215,
    },
  };
  window.CLOTHING_VISUALS = Object.assign(window.CLOTHING_VISUALS || {}, CLOTHING_VISUALS);

  // Groundwork for NPC wardrobe selection. This intentionally does not yet
  // rewrite existing authored NPC outfits; it gives the NPC builder a stable
  // data-driven vocabulary to consume in the next pass.
  window.NPC_WARDROBE_RULES = window.NPC_WARDROBE_RULES || {
    wealthBands: ['poor', 'working', 'comfortable', 'wealthy', 'noble', 'royal'],
    genderModes: ['unisex', 'female', 'male'],
  };
  window.getNpcClothingCandidates = function getNpcClothingCandidates({gender, wealthBand, tags=[]}={}) {
    return Object.entries(window.CLOTHING_VISUALS || {}).filter(([, spec]) => {
      if (spec.gender && spec.gender !== 'unisex' && spec.gender !== gender) return false;
      if (wealthBand && spec.wealthBands && !spec.wealthBands.includes(wealthBand)) return false;
      if (tags.length && spec.npcTags?.length && !tags.some(t => spec.npcTags.includes(t))) return false;
      return true;
    }).map(([id]) => id);
  };

  const assets = {};
  function loadImage(src) {
    const img = new Image();
    img.src = `${src}?build=${BUILD}`;
    img.addEventListener('load', () => { window.renderEntities?.(); window.refreshDirectionalTurnPortraits?.(); });
    return img;
  }
  Object.entries(CLOTHING_VISUALS).forEach(([id, spec]) => {
    assets[id] = Object.fromEntries(Object.entries(spec.views).map(([view, src]) => [view, loadImage(src)]));
  });
  window.CLOTHING_ASSETS = assets;

  function rgbToHsl(r,g,b) {
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
    if (max===min) return [0,0,l];
    const d=max-min, s=l>.5 ? d/(2-max-min) : d/(max+min);
    let h;
    if (max===r) h=(g-b)/d+(g<b?6:0);
    else if (max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    return [h*60,s,l];
  }
  function hslToRgb(h,s,l) {
    h=((h%360)+360)%360/360;
    if (!s) { const v=Math.round(l*255); return [v,v,v]; }
    const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
    const f=t=>{ if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p; };
    return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }
  function recolorClothing(img, primaryHue, secondaryHue) {
    if (!img?.complete || !img.naturalWidth) return img;
    const key = `${img.src}|${primaryHue}|${secondaryHue}`;
    if (cache.has(key)) return cache.get(key);
    const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
    const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
    const data=ctx.getImageData(0,0,c.width,c.height); const p=data.data;
    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<32) continue;
      const r=p[i],g=p[i+1],b=p[i+2];
      let hue=null;
      if(r>b+45 && r>g+35) hue=primaryHue;
      else if(b>r+45 && b>g+20) hue=secondaryHue;
      if(hue===null || hue===undefined) continue;
      const [,s,l]=rgbToHsl(r,g,b); const [r2,g2,b2]=hslToRgb(hue,Math.max(.25,s),l);
      p[i]=r2;p[i+1]=g2;p[i+2]=b2;
    }
    ctx.putImageData(data,0,0); cache.set(key,c); return c;
  }
  window.getRecoloredClothingSprite = recolorClothing;

  function facingToView(facing) {
    if (facing==='up') return 'back';
    if (facing==='left' || facing==='right') return 'side';
    return 'front';
  }
  function shouldShowClothing(entity) {
    const id=entity?.equipped?.clothes;
    return !!CLOTHING_VISUALS[id] && (window.clothingDisplayMode==='clothes' || !entity.equipped?.armor);
  }
  function ensureColours(entity, id) {
    const spec=CLOTHING_VISUALS[id] || {};
    if (entity.clothingPrimaryHue===undefined) entity.clothingPrimaryHue=spec.primaryDefault ?? 28;
    if (entity.clothingSecondaryHue===undefined) entity.clothingSecondaryHue=spec.secondaryDefault ?? 215;
    if (entity.shirtHue===undefined) entity.shirtHue=30;
    if (entity.pantsHue===undefined) entity.pantsHue=220;
  }
  function drawOverlay(ctx, entity, bounds, facing) {
    const id=entity?.equipped?.clothes;
    if (!shouldShowClothing(entity) || !bounds || !ctx) return false;
    ensureColours(entity,id);
    const view=facingToView(facing);
    const img=assets[id]?.[view];
    if (!img?.complete || !img.naturalWidth) return false;
    const out=recolorClothing(img,entity.clothingPrimaryHue,entity.clothingSecondaryHue);
    const cx=bounds.left+bounds.width/2;
    ctx.save();
    if(facing==='left'){ctx.translate(cx,0);ctx.scale(-1,1);ctx.translate(-cx,0);}
    ctx.drawImage(out,bounds.left,bounds.top,bounds.width,bounds.height);
    ctx.restore();
    return true;
  }

  function directBounds(entity,x,y,z=1,flyOff=0){
    const key=`${entity?.race}_${entity?.gender}`;
    const rigs={human_female:{bodyW:1.60,bodyH:1.92,yOff:-.16},elf_female:{bodyW:1.60,bodyH:1.92,yOff:-.16},human_male:{bodyW:1.70,bodyH:2.06,yOff:-.17}};
    const rig=rigs[key]; if(!rig) return null;
    const hs=window.hexSize||1, legacyW=rig.bodyW*hs*z, legacyH=rig.bodyH*hs*z;
    const top=y-legacyW/2+rig.yOff*hs*z+(flyOff||0), width=legacyH*.48;
    return {left:x-width/2,top,width,height:legacyH};
  }

  function installWorldWrapper(){
    if(installedWorldWrapper || !window.__humanoidRendererInstalled || typeof window.drawPlayerCharacter!=='function') return;
    const base=window.drawPlayerCharacter;
    const wrapped=function(ctx,entity,x,y,z,flyOff){
      if(!shouldShowClothing(entity)) return base.apply(this,arguments);
      const id=entity.equipped.clothes, armor=entity.equipped.armor;
      entity.equipped.clothes=null;
      if(window.clothingDisplayMode==='clothes') entity.equipped.armor=null;
      try { base.apply(this,arguments); }
      finally { entity.equipped.clothes=id; entity.equipped.armor=armor; }
      const bounds=directBounds(entity,x,y,z,flyOff);
      if(bounds) drawOverlay(ctx,entity,bounds,entity.facing||'down');
    };
    wrapped.__directHumanoidCompositor=true;
    wrapped.__clothingOverlayWrapper=true;
    wrapped.__legacyDrawPlayerCharacter=base;
    window.drawPlayerCharacter=wrapped;
    installedWorldWrapper=true;
  }

  function syncEntityAppearance(source){
    const target=(window.entities||[]).find(e=>e.name===source?.name);
    if(target && target!==source){
      ['shirtHue','pantsHue','clothingPrimaryHue','clothingSecondaryHue'].forEach(k=>{ if(source[k]!==undefined) target[k]=source[k]; });
    }
  }
  function redraw(source){ syncEntityAppearance(source); window.drawMap?.(); window.renderEntities?.(); window.refreshDirectionalTurnPortraits?.(); }

  function sliderRow(label,value,onInput){
    const row=document.createElement('label'); row.style.cssText='display:grid;grid-template-columns:145px 1fr;gap:8px;align-items:center;margin:5px 0;font-size:.9em;';
    const text=document.createElement('span'); text.textContent=label;
    const input=document.createElement('input'); input.type='range'; input.min='0'; input.max='359'; input.value=String(value); input.addEventListener('input',()=>onInput(Number(input.value)));
    row.append(text,input); return row;
  }
  function injectInventoryControls(){
    const host=document.getElementById('inventory-content'); const p=window.player;
    if(!host || !p || host.querySelector('[data-clothing-colours]')) return;
    const box=document.createElement('div'); box.dataset.clothingColours='true'; box.style.cssText='border:1px solid #555;border-radius:5px;padding:8px;margin:8px 0 12px;';
    const title=document.createElement('strong'); title.textContent='Clothing colours'; box.appendChild(title);
    box.appendChild(sliderRow(p.gender==='male'?'Base clothing colour':'Base clothing — upper',p.shirtHue??30,v=>{p.shirtHue=v;if(p.gender==='male')p.pantsHue=v;redraw(p);}));
    if(p.gender!=='male') box.appendChild(sliderRow('Base clothing — lower',p.pantsHue??220,v=>{p.pantsHue=v;redraw(p);}));
    const clothesId=p.equipped?.clothes;
    if(clothesId && CLOTHING_VISUALS[clothesId]){
      ensureColours(p,clothesId);
      box.appendChild(sliderRow('Equipped clothes — primary',p.clothingPrimaryHue,v=>{p.clothingPrimaryHue=v;redraw(p);}));
      box.appendChild(sliderRow('Equipped clothes — secondary',p.clothingSecondaryHue,v=>{p.clothingSecondaryHue=v;redraw(p);}));
    } else {
      const note=document.createElement('div'); note.style.cssText='font-size:.8em;color:#aaa;margin-top:6px;'; note.textContent='Equip a supported clothing item to show its primary and secondary colour controls.'; box.appendChild(note);
    }
    host.prepend(box);
  }
  function installInventoryWrapper(){
    if(installedInventoryWrapper || typeof window.showInventoryScreen!=='function') return;
    const base=window.showInventoryScreen;
    window.showInventoryScreen=function(){ const result=base.apply(this,arguments); injectInventoryControls(); return result; };
    installedInventoryWrapper=true;
  }

  function updateCreatorBaseClothingControls(){
    const gender=document.getElementById('gender-select')?.value;
    const shirt=document.getElementById('shirt-hue-slider'), pants=document.getElementById('pants-hue-slider');
    if(!shirt || !pants) return;
    const shirtLabel=document.querySelector('label[for="shirt-hue-slider"]');
    const pantsLabel=document.querySelector('label[for="pants-hue-slider"]');
    if(shirtLabel) shirtLabel.textContent=gender==='male'?'Base Clothing Color':'Base Clothing Upper';
    if(pantsLabel) pantsLabel.textContent='Base Clothing Lower';
    const hide=gender==='male'; pants.hidden=hide; if(pantsLabel) pantsLabel.hidden=hide;
    if(hide) pants.value=shirt.value;
  }
  function installCreatorControls(){
    const gender=document.getElementById('gender-select'), shirt=document.getElementById('shirt-hue-slider'), pants=document.getElementById('pants-hue-slider');
    if(!gender || !shirt || !pants || gender.dataset.clothingControls==='true') return;
    gender.dataset.clothingControls='true';
    gender.addEventListener('change',updateCreatorBaseClothingControls);
    shirt.addEventListener('input',()=>{ if(gender.value==='male') pants.value=shirt.value; });
    updateCreatorBaseClothingControls();
  }

  function ensureHumanoidRenderer(){
    if(window.__humanoidRendererReady || document.querySelector('script[data-direct-humanoid-loader]')) return;
    const script=document.createElement('script'); script.src=`humanoidRenderer.js?build=${BUILD}`; script.async=false; script.dataset.directHumanoidLoader='true'; document.head.appendChild(script);
  }

  function install(){ ensureHumanoidRenderer(); installCreatorControls(); installInventoryWrapper(); installWorldWrapper(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  const timer=setInterval(()=>{ install(); if(installedWorldWrapper && installedInventoryWrapper) clearInterval(timer); },50);
})();
