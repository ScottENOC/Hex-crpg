// spriteAlignmentFixes.js
// Small presentation fixes for clothing/hair geometry that must be consistent
// across the direct humanoid renderer and its directional wrappers.
(() => {
  'use strict';

  const BUILD = window.PRESENTATION_BUILD || '20261005-sprite-alignment-v4';
  // The first alignment pass moved the pants waist from .535 to .500. Lift it
  // by a further quarter of that move (.00875), per the in-game visual check.
  const PANTS_TOP = .49125;
  const PANTS_BOTTOM = 1.005;
  const PLAYER_START_COLOURS = {
    shirt: {
      dark:{hue:110,saturation:60,value:42,opacity:1},
      light:{hue:110,saturation:45,value:72,opacity:1},
      base:{hue:110,saturation:55,value:62,opacity:1},
    },
    pants: {
      dark:{hue:28,saturation:58,value:36,opacity:1},
      light:{hue:28,saturation:48,value:54,opacity:1},
      base:{hue:28,saturation:58,value:42,opacity:1},
    },
    underwear: {
      dark:{hue:0,saturation:0,value:12,opacity:1},
      light:{hue:0,saturation:0,value:28,opacity:1},
      base:{hue:0,saturation:0,value:16,opacity:1},
    },
    bra: {
      dark:{hue:0,saturation:0,value:12,opacity:1},
      light:{hue:0,saturation:0,value:28,opacity:1},
      base:{hue:0,saturation:0,value:16,opacity:1},
    },
  };

  function facingToView(facing) {
    if (facing === 'up' || facing === 'back') return 'back';
    if (facing === 'left' || facing === 'right' || facing === 'side') return 'side';
    return 'front';
  }

  function sameColour(a,b) {
    if (!a || !b) return false;
    return Math.abs(Number(a.hue)-Number(b.hue)) < .01
      && Math.abs(Number(a.saturation)-Number(b.saturation)) < .01
      && Math.abs(Number(a.value)-Number(b.value)) < .01
      && Math.abs(Number(a.opacity ?? 1)-Number(b.opacity ?? 1)) < .001;
  }

  function playerStartColour(slot, layer) {
    const palette = PLAYER_START_COLOURS[slot];
    if (!palette) return null;
    return palette[layer?.id] || palette.base || null;
  }

  function applyPlayerStartingPalette(entity) {
    const cs = window.clothingSystem;
    if (!cs || !entity?.equipped || !entity?.clothingColors) return {ready:false,changed:false};
    if (entity.clothingPlayerPaletteApplied === true) return {ready:true,changed:false};

    let sawGarment = false;
    let changed = false;
    for (const slot of ['shirt','pants','underwear','bra']) {
      const itemId = entity.equipped[slot];
      if (!itemId) continue;
      const spec = cs.getItemSpec?.(itemId);
      if (!spec?.layers?.length) continue;
      const all = entity.clothingColors[itemId];
      if (!all) return {ready:false,changed};
      sawGarment = true;
      for (const layer of spec.layers) {
        const current = all[layer.id];
        if (!current) return {ready:false,changed};
        // Only replace untouched stock-green defaults. Existing saves with a
        // player-selected colour remain exactly as the player chose them.
        if (!sameColour(current,layer.defaultColor)) continue;
        const next = playerStartColour(slot,layer);
        if (!next) continue;
        all[layer.id] = {...next};
        changed = true;
      }
    }

    if (sawGarment) entity.clothingPlayerPaletteApplied = true;
    return {ready:sawGarment,changed};
  }

  function wrapPlayerPalette() {
    const cs = window.clothingSystem;
    if (!cs) return false;

    if (typeof cs.ensureDefaultOutfit === 'function' && !cs.ensureDefaultOutfit.__playerStartPalette) {
      const original = cs.ensureDefaultOutfit;
      const wrapped = function(entity,options={}) {
        const result = original.apply(this,arguments);
        if (options?.player === true || entity === window.player || entity?.side === 'player') {
          applyPlayerStartingPalette(entity);
        }
        return result;
      };
      wrapped.__playerStartPalette = true;
      wrapped.__playerStartPaletteOriginal = original;
      cs.ensureDefaultOutfit = wrapped;
    }

    if (typeof cs.drawSlot === 'function' && !cs.drawSlot.__playerStartPalette) {
      const original = cs.drawSlot;
      const wrapped = function(ctx,entity,slot,view,bounds) {
        if (entity === window.player || entity?.side === 'player') {
          cs.ensureDefaultOutfit?.(entity,{player:true});
          applyPlayerStartingPalette(entity);
        }
        return original.apply(this,arguments);
      };
      wrapped.__playerStartPalette = true;
      wrapped.__playerStartPaletteOriginal = original;
      cs.drawSlot = wrapped;
    }
    return true;
  }

  function applyCurrentPlayerPalette() {
    const cs = window.clothingSystem;
    if (!cs) return {ready:false,changed:false};
    let ready = false;
    let changed = false;
    const seen = new Set();
    const candidates = [window.player,...(window.entities || [])];
    for (const entity of candidates) {
      if (!entity || seen.has(entity) || (entity !== window.player && entity?.side !== 'player')) continue;
      seen.add(entity);
      cs.ensureDefaultOutfit?.(entity,{player:true});
      const result = applyPlayerStartingPalette(entity);
      ready = ready || result.ready;
      changed = changed || result.changed;
    }
    return {ready,changed};
  }

  function applyPantsAlignment() {
    const cs = window.clothingSystem;
    const targets = cs?.clothingTargets;
    if (!targets?.front?.pants || !targets?.side?.pants || !targets?.back?.pants) {
      return {ready:false,changed:false};
    }

    // Keep the established bottom extent, so long trousers still reach the
    // same point; only lift the waistband. Shirts retain their existing lower
    // edge and naturally overlap the waistband because shirts render after pants.
    let changed = false;
    for (const view of ['front','side','back']) {
      const target = targets[view].pants;
      const nextH = PANTS_BOTTOM - PANTS_TOP;
      if (Math.abs(Number(target.y)-PANTS_TOP) > 1e-6 || Math.abs(Number(target.h)-nextH) > 1e-6) {
        target.y = PANTS_TOP;
        target.h = nextH;
        changed = true;
      }
    }

    if (cs.outerwearGeometry && typeof cs.outerwearGeometry === 'object') {
      cs.outerwearGeometry.pantsTop = PANTS_TOP;
    }
    window.__pantsWaistAlignment = {top:PANTS_TOP,bottom:PANTS_BOTTOM,build:BUILD};
    return {ready:true,changed};
  }

  function directWorldBounds(entity, x, y, z=1, flyOff=0) {
    const key = entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
    const rigs = {
      human_female:{bodyW:1.60,bodyH:1.92,yOff:-.16},
      elf_female:{bodyW:1.60,bodyH:1.92,yOff:-.16},
      human_male:{bodyW:1.70,bodyH:2.06,yOff:-.17},
    };
    const rig = rigs[key];
    if (!rig || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
    const hs = window.hexSize || 1;
    const zoom = Number(z) || 1;
    const legacyW = rig.bodyW * hs * zoom;
    const height = rig.bodyH * hs * zoom;
    const top = y - legacyW/2 + rig.yOff*hs*zoom + (Number(flyOff) || 0);
    const width = height * Number(window.HUMAN_FEMALE_RENDER_ASPECT || .48);
    return {left:x-width/2,top,width,height};
  }

  function install() {
    const pants = applyPantsAlignment();
    const paletteWrapped = wrapPlayerPalette();
    const palette = applyCurrentPlayerPalette();
    if (pants.changed || palette.changed) {
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
    }
    window.__spriteAlignmentFixesReady = !!(pants.ready && paletteWrapped);
    return window.__spriteAlignmentFixesReady;
  }

  // Presentation modules install through a few independent compatibility
  // loaders. Re-check briefly so this remains correct whichever one wins the
  // initial race, and re-wrap if another presentation module replaces a public
  // renderer function after this file first runs.
  let attempts = 0;
  const timer = setInterval(() => {
    install();
    if (++attempts >= 80) clearInterval(timer);
  }, 125);
  if (document.readyState === 'complete') install();
  else window.addEventListener('load',install,{once:true});
})();