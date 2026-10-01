// spriteAlignmentFixes.js
// Small presentation fixes for clothing/hair geometry that must be consistent
// across the direct humanoid renderer and its directional wrappers.
(() => {
  'use strict';

  const BUILD = window.PRESENTATION_BUILD || '20261001-sprite-alignment-v3';
  // The first alignment pass moved the pants waist from .535 to .500. Lift it
  // by a further quarter of that move (.00875), per the in-game visual check.
  const PANTS_TOP = .49125;
  const PANTS_BOTTOM = 1.005;
  const BRAID_TOP = -.035;
  const LEGACY_BRAID_TOP = { side:-.010, back:-.005 };
  const activeContexts = new WeakSet();
  const WRAPPER_LINK_KEYS = ['__alignmentWrappedFunction','__preciseBase','__previous','__legacyDrawPlayerCharacter'];
  const WRAPPER_MARKERS = ['__spriteAlignmentFixes','__preciseColourContext','__childSystem','__directionalBraidSupport','__directHumanoidCompositor'];

  function wrapperChainHas(fn, marker) {
    if (typeof fn !== 'function') return false;
    const seen = new Set();
    const pending = [fn];
    while (pending.length) {
      const current = pending.pop();
      if (typeof current !== 'function' || seen.has(current)) continue;
      seen.add(current);
      if (current[marker]) return true;
      for (const key of WRAPPER_LINK_KEYS) {
        if (typeof current[key] === 'function' && !seen.has(current[key])) pending.push(current[key]);
      }
    }
    return false;
  }

  function preserveWrapperMarkers(source, target) {
    for (const marker of WRAPPER_MARKERS) {
      if (wrapperChainHas(source, marker)) target[marker] = true;
    }
  }

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

  function currentBraidSource(entity, view) {
    const key = entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
    return window.DIRECTIONAL_CHARACTER_ASSETS?.[key]?.hair?.braid?.[view] || null;
  }

  function resolvedBraidSource(entity, source) {
    if (!source) return null;
    if (entity?.hairHue !== undefined && typeof window.getRecoloredCharacterHairSprite === 'function') {
      try {
        return window.getRecoloredCharacterHairSprite(
          source,
          entity.hairHue,
          entity.hairLightMult || 1,
          entity.hairSatMult || 1,
        ) || source;
      } catch (_) {}
    }
    return source;
  }

  function withBraidAlignment(ctx, entity, facing, bounds, draw) {
    const view = facingToView(facing);
    if (!ctx || typeof draw !== 'function' || entity?.hairStyle !== 'braid' || view === 'front' || !bounds?.height) {
      return draw();
    }
    if (entity?.equipped?.helmet && window.equipmentAppearanceSystem?.isSlotVisible?.(entity,'helmet') !== false) {
      return draw();
    }
    if (activeContexts.has(ctx)) return draw();

    const oldTop = LEGACY_BRAID_TOP[view];
    if (!Number.isFinite(oldTop)) return draw();
    const shiftY = (BRAID_TOP - oldTop) * bounds.height;
    const expectedY = bounds.top + oldTop * bounds.height;
    const originalDrawImage = ctx.drawImage;
    if (typeof originalDrawImage !== 'function') return draw();

    const patchedDrawImage = function(image, ...args) {
      // tightDirectionalHairDestination draws the complete braid source via the
      // 9-argument drawImage overload. Match both the current braid source and
      // its recoloured canvas, plus the old hard-coded destination Y, so no
      // clothing/body/equipment draw can be moved accidentally.
      if (args.length === 8) {
        const [sx,sy,sw,sh,dx,dy,dw,dh] = args;
        const source = currentBraidSource(entity, view);
        const recoloured = resolvedBraidSource(entity, source);
        const iw = image?.naturalWidth || image?.width || 0;
        const ih = image?.naturalHeight || image?.height || 0;
        const sourceW = source?.naturalWidth || source?.width || 0;
        const sourceH = source?.naturalHeight || source?.height || 0;
        const fullSource = iw > 0 && ih > 0 && Math.abs(Number(sx)) < .01 && Math.abs(Number(sy)) < .01
          && Math.abs(Number(sw)-iw) < .51 && Math.abs(Number(sh)-ih) < .51;
        const sameSource = image === source || image === recoloured
          || (sourceW > 0 && sourceH > 0 && iw === sourceW && ih === sourceH);
        const atOldBraidTop = Number.isFinite(Number(dy)) && Math.abs(Number(dy)-expectedY) < .75;
        if (fullSource && sameSource && atOldBraidTop) {
          return originalDrawImage.call(ctx,image,sx,sy,sw,sh,dx,Number(dy)+shiftY,dw,dh);
        }
      }
      return originalDrawImage.call(ctx,image,...args);
    };

    activeContexts.add(ctx);
    let patched = false;
    try {
      ctx.drawImage = patchedDrawImage;
      patched = ctx.drawImage === patchedDrawImage;
    } catch (_) {}

    try {
      const result = draw();
      const diagnostic = window.__humanoidRendererLastHair;
      if (patched && diagnostic?.style === 'braid' && diagnostic?.view === view && diagnostic?.dest) {
        diagnostic.dest.y = BRAID_TOP;
        diagnostic.alignmentAdjusted = true;
      }
      return result;
    } finally {
      if (patched) {
        try { ctx.drawImage = originalDrawImage; } catch (_) {}
      }
      activeContexts.delete(ctx);
    }
  }

  function wrapDirectional(name) {
    const current = window[name];
    if (typeof current !== 'function') return false;
    if (wrapperChainHas(current,'__spriteAlignmentFixes')) return true;
    const wrapped = function(ctx,entity,bounds,facing='down') {
      return withBraidAlignment(ctx,entity,facing,bounds,() => current.apply(this,arguments));
    };
    wrapped.__spriteAlignmentFixes = true;
    wrapped.__alignmentWrappedFunction = current;
    preserveWrapperMarkers(current, wrapped);
    window[name] = wrapped;
    return true;
  }

  function wrapWorld(name) {
    const current = window[name];
    if (typeof current !== 'function') return false;
    if (wrapperChainHas(current,'__spriteAlignmentFixes')) return true;
    const wrapped = function(ctx,entity,x,y,z=1,flyOff=0) {
      const bounds = directWorldBounds(entity,x,y,z,flyOff);
      return withBraidAlignment(ctx,entity,entity?.facing || 'down',bounds,() => current.apply(this,arguments));
    };
    wrapped.__spriteAlignmentFixes = true;
    wrapped.__alignmentWrappedFunction = current;
    preserveWrapperMarkers(current, wrapped);
    if (current.__legacyDrawPlayerCharacter) wrapped.__legacyDrawPlayerCharacter = current.__legacyDrawPlayerCharacter;
    window[name] = wrapped;
    return true;
  }

  function install() {
    const pants = applyPantsAlignment();
    const paletteWrapped = wrapPlayerPalette();
    const palette = applyCurrentPlayerPalette();
    const directional = [
      wrapDirectional('drawDirectionalHumanoidInBounds'),
      wrapDirectional('drawDirectionalCharacterBase'),
      wrapDirectional('drawHumanFemaleDirectionalBase'),
    ].some(Boolean);
    const world = [wrapWorld('drawPlayerCharacter'),wrapWorld('drawHumanoidCharacter')].some(Boolean);
    if (pants.changed || palette.changed) {
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
    }
    window.__spriteAlignmentFixesReady = !!(pants.ready && paletteWrapped && (directional || world));
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