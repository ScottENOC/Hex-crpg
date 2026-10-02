// Footwear slot and directional boots renderer.
// Keeps footwear in the clothing colour system while giving boots their own
// foot-relative geometry instead of stretching a pair across the whole body.
(() => {
  'use strict';

  const BUILD = window.PRESENTATION_BUILD || '20261001-footwear-v4';
  const SLOT = 'shoes';
  const ITEM_ID = 'boots';
  const VIEWS = {
    front: 'images/equipment/clothing/boots_front.png',
    side: 'images/equipment/clothing/boots_side.png',
    back: 'images/equipment/clothing/boots_back.png',
  };
  const DEFAULT_COLOR = {hue:110,saturation:55,value:62,opacity:1};
  const PLAYER_DEFAULT_COLOR = {hue:28,saturation:68,value:32,opacity:1};
  const HUMANOID_RACES = new Set(['human','elf','dwarf','goblin','orc']);
  const imageCache = new Map();
  const boundsCache = new WeakMap();
  const splitBoundsCache = new WeakMap();
  let unequipWrapped = false;

  // Public tuning so footwear can be adjusted without redrawing the source art.
  const tuning = window.FOOTWEAR_RENDER_TUNING = window.FOOTWEAR_RENDER_TUNING || {
    bottom: 1.006,
    height: 0.22,
    frontSpread: 0.24,
    backSpread: 0.24,
    maxBootWidth: 0.25,
    sideMaxWidth: 0.34,
    scale: 1.30,
    outwardShift: 0.40,
  };

  function view(v) {
    return (v === 'up' || v === 'back') ? 'back'
      : (v === 'left' || v === 'right' || v === 'side') ? 'side'
      : 'front';
  }

  function registerSlot() {
    const cs = window.clothingSystem;
    if (!cs || !window.items) return false;

    if (!cs.slots.includes(SLOT)) cs.slots.push(SLOT);
    if (!cs.preloadSlots.includes(SLOT)) cs.preloadSlots.push(SLOT);
    cs.slotLabels[SLOT] = 'Shoes';
    cs.builtinGarments[ITEM_ID] = {
      slot: SLOT,
      layers: [{
        id: 'base',
        label: 'Boots',
        defaultColor: {...DEFAULT_COLOR},
        views: {...VIEWS},
      }],
    };
    cs.registerBuiltinItems();

    window.items[ITEM_ID] = {
      ...(window.items[ITEM_ID] || {}),
      id: ITEM_ID,
      name: 'Boots',
      type: 'clothes',
      clothingSlot: SLOT,
      buyPrice: 18,
      weight: 1.2,
      description: 'A sturdy pair of practical boots.',
    };

    const ea = window.equipmentAppearanceSystem;
    if (ea) {
      if (!ea.renderSlots.includes(SLOT)) ea.renderSlots.push(SLOT);
      ea.slotLabels[SLOT] = 'Shoes';
    }
    return true;
  }

  function eligible(e) {
    return !!e?.equipped && HUMANOID_RACES.has(e.race) && !!e.gender;
  }

  function isMainCharacter(e) {
    if (!e) return false;
    const main = window.party?.[0];
    if (main) return e === main || (!!main.name && e.name === main.name);
    return e === window.player;
  }

  function ensureDefaultFootwear(e) {
    if (!eligible(e) || !window.clothingSystem) return false;
    window.clothingSystem.migrateLegacyEquipment(e);
    if (e.footwearDefaultsApplied !== true) {
      if (!e.equipped[SLOT]) e.equipped[SLOT] = ITEM_ID;
      e.footwearDefaultsApplied = true;
    }

    // Keep the authored source green for the normal tint system. Only the main
    // character's initial pair starts as dark-brown leather; saved/custom colours win.
    if (isMainCharacter(e) && e.equipped[SLOT] === ITEM_ID) {
      if (!e.clothingColors || typeof e.clothingColors !== 'object') e.clothingColors = {};
      const colours = e.clothingColors[ITEM_ID] || (e.clothingColors[ITEM_ID] = {});
      if (!colours.base) colours.base = {...PLAYER_DEFAULT_COLOR};
      else if (colours.base.opacity === undefined) colours.base.opacity = 1;
    }

    if (e === window.player && Array.isArray(e.inventory)
        && e.equipped[SLOT] === ITEM_ID && !e.inventory.includes(ITEM_ID)) {
      e.inventory.push(ITEM_ID);
    }
    return true;
  }

  function load(src) {
    if (!src) return null;
    if (imageCache.has(src)) return imageCache.get(src);
    const img = window.assetManager.request(src);
    imageCache.set(src, img);
    window.assetManager.whenReady(src).then(() => {
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
      window.updateAppearancePreview?.();
    }).catch(error => console.warn('Footwear asset failed:', src, error));
    return img;
  }

  function ready(img) {
    return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  }

  function opaqueBounds(img) {
    if (boundsCache.has(img)) return boundsCache.get(img);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    let result = {x:0,y:0,w,h};
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d', {willReadFrequently:true});
      x.drawImage(img,0,0);
      const p = x.getImageData(0,0,w,h).data;
      let left=w, top=h, right=-1, bottom=-1;
      for (let yy=0; yy<h; yy++) for (let xx=0; xx<w; xx++) {
        if (p[(yy*w+xx)*4+3] < 8) continue;
        if (xx<left) left=xx; if (xx>right) right=xx;
        if (yy<top) top=yy; if (yy>bottom) bottom=yy;
      }
      if (right>=left && bottom>=top) result={x:left,y:top,w:right-left+1,h:bottom-top+1};
    } catch (_) {}
    boundsCache.set(img,result);
    return result;
  }

  function splitBootBounds(img) {
    if (splitBoundsCache.has(img)) return splitBoundsCache.get(img);
    const full = opaqueBounds(img);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const mid = full.x + full.w/2;
    let result = null;
    try {
      const c = document.createElement('canvas');
      c.width=w; c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});
      x.drawImage(img,0,0);
      const p=x.getImageData(0,0,w,h).data;
      const scan=(x0,x1)=>{
        let left=x1,top=h,right=-1,bottom=-1;
        for(let yy=full.y;yy<full.y+full.h;yy++) for(let xx=x0;xx<x1;xx++){
          if(p[(yy*w+xx)*4+3]<8) continue;
          if(xx<left)left=xx;if(xx>right)right=xx;
          if(yy<top)top=yy;if(yy>bottom)bottom=yy;
        }
        return right>=left&&bottom>=top?{x:left,y:top,w:right-left+1,h:bottom-top+1}:null;
      };
      const left=scan(full.x,Math.floor(mid));
      const right=scan(Math.ceil(mid),full.x+full.w);
      if(left&&right) result={left,right};
    } catch (_) {}
    splitBoundsCache.set(img,result);
    return result;
  }

  function containedSize(src,maxW,maxH,scaleMultiplier=1) {
    const baseScale = Math.min(maxW/src.w, maxH/src.h);
    const scale = baseScale * Math.max(0,Number(scaleMultiplier)||1);
    return {w:src.w*scale,h:src.h*scale};
  }

  function drawContained(ctx,source,src,cx,bottom,maxW,maxH,scaleMultiplier=1) {
    const size = containedSize(src,maxW,maxH,scaleMultiplier);
    ctx.drawImage(source,src.x,src.y,src.w,src.h,cx-size.w/2,bottom-size.h,size.w,size.h);
    return size;
  }

  function drawFootwear(ctx,e,v,bounds) {
    const cs = window.clothingSystem;
    if (!cs || e?.displayClothes === false) return false;
    ensureDefaultFootwear(e);
    if (window.equipmentAppearanceSystem?.isSlotVisible?.(e,SLOT) === false) return false;

    const itemId = e?.equipped?.[SLOT];
    const spec = itemId && cs.getItemSpec(itemId);
    if (!spec || spec.slot !== SLOT) return false;
    const layer = spec.layers?.[0];
    if (!layer) return false;

    const resolved = view(v);
    const src = layer.views?.[resolved] || layer.views?.front;
    const img = load(src);
    if (!ready(img)) return false;

    const colour = cs.getLayerColour(e,itemId,layer);
    const rendered = layer.tint === false ? img : cs.tintWholeLayer(img,colour,layer);
    const bottom = bounds.top + Number(tuning.bottom ?? 1.006) * bounds.height;
    const maxH = Number(tuning.height ?? .22) * bounds.height;
    const renderScale = Math.max(0,Number(tuning.scale ?? 1.30)) || 1.30;

    if (resolved === 'side') {
      const trim = opaqueBounds(img);
      drawContained(ctx,rendered,trim,bounds.left+bounds.width/2,bottom,
        Number(tuning.sideMaxWidth ?? .34)*bounds.width,maxH,renderScale);
      return true;
    }

    const halves = splitBootBounds(img);
    if (!halves) {
      const trim = opaqueBounds(img);
      drawContained(ctx,rendered,trim,bounds.left+bounds.width/2,bottom,bounds.width*.55,maxH,renderScale);
      return true;
    }

    const spread = Number(resolved === 'back' ? tuning.backSpread : tuning.frontSpread) || .24;
    const maxW = Number(tuning.maxBootWidth ?? .25) * bounds.width;
    const centre = bounds.left + bounds.width/2;
    const halfSpread = spread*bounds.width/2;
    const outwardShift = Math.max(0,Number(tuning.outwardShift ?? .40));
    const leftSize = containedSize(halves.left,maxW,maxH,renderScale);
    const rightSize = containedSize(halves.right,maxW,maxH,renderScale);

    drawContained(ctx,rendered,halves.left,
      centre-halfSpread-outwardShift*leftSize.w,bottom,maxW,maxH,renderScale);
    drawContained(ctx,rendered,halves.right,
      centre+halfSpread+outwardShift*rightSize.w,bottom,maxW,maxH,renderScale);
    return true;
  }

  // The shirt hot-path optimiser replaces clothingSystem.drawSlot after this
  // module may already have installed. Keep footwear as the OUTERMOST drawSlot
  // wrapper, and re-wrap if another renderer legitimately replaces drawSlot.
  // HumanoidRenderer always invokes the shirt slot before armour, so this keeps
  // boots over trouser hems and below armour without coupling the hot path to shoes.
  function wrapClothingDraw() {
    const cs = window.clothingSystem;
    if (!cs || typeof cs.drawSlot !== 'function') return false;
    if (cs.drawSlot.__footwearDrawBridge) return true;
    const base = cs.drawSlot;
    const wrapped = function(ctx,e,slot,v,bounds) {
      const drew = base.apply(this,arguments);
      if (slot === 'shirt') drawFootwear(ctx,e,v,bounds);
      return drew;
    };
    wrapped.__footwearDrawBridge = true;
    wrapped.__footwearDrawBase = base;
    cs.drawSlot = wrapped;
    return true;
  }

  function syncShoes(p) {
    if (!p) return;
    for (const target of (Array.isArray(window.party) ? window.party : (window.party && typeof window.party === 'object' ? Object.values(window.party) : [])).concat(Array.isArray(window.entities) ? window.entities : (window.entities && typeof window.entities === 'object' ? Object.values(window.entities) : []))) {
      if (!target || target === p || target.name !== p.name) continue;
      if (!target.equipped) target.equipped={};
      target.equipped[SLOT] = p.equipped?.[SLOT] || null;
      target.footwearDefaultsApplied = true;
    }
  }

  function wrapUnequip() {
    if (unequipWrapped || typeof window.unequipItem !== 'function') return false;
    const base = window.unequipItem;
    window.unequipItem = function(slot) {
      if (slot !== SLOT) return base.apply(this,arguments);
      const p = window.player;
      if (!p?.equipped) return;
      p.equipped[SLOT] = null;
      p.footwearDefaultsApplied = true;
      syncShoes(p);
      window.showInventoryScreen?.();
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
    };
    unequipWrapped = true;
    return true;
  }

  function install() {
    if (!registerSlot()) return false;
    for (const e of (Array.isArray(window.entities) ? window.entities : (window.entities && typeof window.entities === 'object' ? Object.values(window.entities) : []))) ensureDefaultFootwear(e);
    for (const e of (Array.isArray(window.party) ? window.party : (window.party && typeof window.party === 'object' ? Object.values(window.party) : []))) ensureDefaultFootwear(e);
    if (window.player) ensureDefaultFootwear(window.player);
    const draw = wrapClothingDraw();
    const unequip = wrapUnequip();
    return draw && unequip;
  }

  // renderHotPathCache installs asynchronously. Keep checking during bootstrap
  // so footwear remains outside that wrapper whichever module wins the first race.
  const bootstrapTimer = setInterval(install,100);
  setTimeout(() => clearInterval(bootstrapTimer),15000);

  // Cheap long-lived safety check also covers dev hot reloads and delayed modules.
  setInterval(() => {
    registerSlot();
    wrapClothingDraw();
    wrapUnequip();
    for (const e of (Array.isArray(window.entities) ? window.entities : (window.entities && typeof window.entities === 'object' ? Object.values(window.entities) : []))) ensureDefaultFootwear(e);
    if (window.player) ensureDefaultFootwear(window.player);
  },1000);

  if (document.readyState === 'complete') install();
  else window.addEventListener('load',install,{once:true});

  window.footwearSystem = {
    build: BUILD,
    slot: SLOT,
    itemId: ITEM_ID,
    views: {...VIEWS},
    tuning,
    drawFootwear,
    ensureDefaultFootwear,
    ensureDrawBridge: wrapClothingDraw,
  };
})();
