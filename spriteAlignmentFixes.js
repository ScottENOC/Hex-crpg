// spriteAlignmentFixes.js
// Small presentation fixes for clothing/hair geometry that must be consistent
// across the direct humanoid renderer and its directional wrappers.
(() => {
  'use strict';

  const BUILD = window.PRESENTATION_BUILD || '20261001-sprite-alignment-v2';
  const PANTS_TOP = .500;
  const PANTS_BOTTOM = 1.005;
  const BRAID_TOP = -.035;
  const LEGACY_BRAID_TOP = { side:-.010, back:-.005 };
  const activeContexts = new WeakSet();

  function facingToView(facing) {
    if (facing === 'up' || facing === 'back') return 'back';
    if (facing === 'left' || facing === 'right' || facing === 'side') return 'side';
    return 'front';
  }

  function applyPantsAlignment() {
    const cs = window.clothingSystem;
    const targets = cs?.clothingTargets;
    if (!targets?.front?.pants || !targets?.side?.pants || !targets?.back?.pants) {
      return {ready:false,changed:false};
    }

    // Pants and briefs share the same waist reference. Keep the established
    // bottom extent, so long trousers still reach the same point; only lift the
    // waistband. Shirts retain their existing lower edge and naturally overlap
    // the waistband because shirts render after pants.
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
    if (current.__spriteAlignmentFixes) return true;
    const wrapped = function(ctx,entity,bounds,facing='down') {
      return withBraidAlignment(ctx,entity,facing,bounds,() => current.apply(this,arguments));
    };
    wrapped.__spriteAlignmentFixes = true;
    wrapped.__alignmentWrappedFunction = current;
    // Preserve renderer/readiness markers used elsewhere in the presentation stack.
    for (const key of ['__directionalBraidSupport','__directHumanoidCompositor']) {
      if (current[key]) wrapped[key] = current[key];
    }
    window[name] = wrapped;
    return true;
  }

  function wrapWorld(name) {
    const current = window[name];
    if (typeof current !== 'function') return false;
    if (current.__spriteAlignmentFixes) return true;
    const wrapped = function(ctx,entity,x,y,z=1,flyOff=0) {
      const bounds = directWorldBounds(entity,x,y,z,flyOff);
      return withBraidAlignment(ctx,entity,entity?.facing || 'down',bounds,() => current.apply(this,arguments));
    };
    wrapped.__spriteAlignmentFixes = true;
    wrapped.__alignmentWrappedFunction = current;
    for (const key of ['__directionalBraidSupport','__directHumanoidCompositor']) {
      if (current[key]) wrapped[key] = current[key];
    }
    if (current.__legacyDrawPlayerCharacter) wrapped.__legacyDrawPlayerCharacter = current.__legacyDrawPlayerCharacter;
    window[name] = wrapped;
    return true;
  }

  function install() {
    const pants = applyPantsAlignment();
    const directional = [
      wrapDirectional('drawDirectionalHumanoidInBounds'),
      wrapDirectional('drawDirectionalCharacterBase'),
      wrapDirectional('drawHumanFemaleDirectionalBase'),
    ].some(Boolean);
    const world = [wrapWorld('drawPlayerCharacter'),wrapWorld('drawHumanoidCharacter')].some(Boolean);
    if (pants.changed) {
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
    }
    window.__spriteAlignmentFixesReady = !!(pants.ready && (directional || world));
    return window.__spriteAlignmentFixesReady;
  }

  // Presentation modules install through a few independent compatibility
  // loaders. Re-check briefly so this remains correct whichever one wins the
  // initial race, and re-wrap if the braid module replaces a public renderer
  // function after this file first runs.
  let attempts = 0;
  const timer = setInterval(() => {
    install();
    if (++attempts >= 80) clearInterval(timer);
  }, 125);
  if (document.readyState === 'complete') install();
  else window.addEventListener('load',install,{once:true});
})();
