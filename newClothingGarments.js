// Ten cleaned clothing sets from the October 2026 art batch.
// Keeps the fixed-slot clothing model and adds a small, deterministic NPC-fashion policy.
(() => {
  'use strict';

  const BUILD = '20261001-new-clothing-v1';
  const ROOT = 'images/equipment/clothing/';
  const DEFAULT_COLOUR = { hue: 108, saturation: 48, value: 62, opacity: 1 };

  const GARMENTS = {
    shirt_plunge: {
      name: 'Plunging Top', slot: 'shirt', buyPrice: 30, weight: 0.35, fashionTier: 'fashion',
      description: 'A fitted top with a deep open front.',
      files: { front: 'shirt_plunge_front.png', side: 'shirt_plunge_side.png', back: 'shirt_plunge_back.png' },
    },
    shirt_tie_tank: {
      name: 'Tie-Side Tank', slot: 'shirt', buyPrice: 24, weight: 0.3, fashionTier: 'fashion',
      description: 'A sleeveless top tied at the sides.',
      files: { front: 'shirt_tie_tank_front.png', side: 'shirt_tie_tank_side.png', back: 'shirt_tie_tank_back.png' },
    },
    corset_lace: {
      name: 'Lace Corset', slot: 'topOuter', slots: ['bra', 'topOuter'], buyPrice: 45, weight: 0.7, fashionTier: 'statement',
      description: 'A structured lace corset that can be worn as an under-layer or over an inner top.',
      clothingGeometrySlot: 'shirt',
      files: { front: 'corset_lace_front.png', side: 'corset_lace_side.png', back: 'corset_lace_back.png' },
    },
    pants_lattice: {
      name: 'Lattice Trousers', slot: 'pants', buyPrice: 40, weight: 0.65, fashionTier: 'statement',
      description: 'Fitted trousers with open lattice panels down the legs.',
      files: { front: 'pants_lattice_front.png', side: 'pants_lattice_side.png', back: 'pants_lattice_back.png' },
    },
    cloak_full: {
      name: 'Full Cloak', slot: 'cloak', buyPrice: 50, weight: 1.2, fashionTier: 'everyday',
      description: 'A full-length cloak worn over armour and other clothing.',
      files: { front: 'cloak_full_front.png', side: 'cloak_full_side.png', back: 'cloak_full_back.png' },
    },
    shirt_collared: {
      name: 'Collared Shirt', slot: 'shirt', buyPrice: 28, weight: 0.45, fashionTier: 'everyday',
      description: 'A fitted collared shirt.',
      files: { front: 'shirt_collared_front.png', side: 'shirt_collared_side.png', back: 'shirt_collared_back.png' },
    },
    tights_fishnet: {
      name: 'Fishnet Stockings', slot: 'tights', buyPrice: 24, weight: 0.15, fashionTier: 'statement',
      description: 'Open-mesh stockings worn beneath trousers, shorts or a dress.',
      files: { front: 'tights_fishnet_front.png', side: 'tights_fishnet_side.png', back: 'tights_fishnet_back.png' },
    },
    shirt_mesh_turtleneck: {
      name: 'Mesh Turtleneck', slot: 'shirt', buyPrice: 34, weight: 0.25, fashionTier: 'statement',
      description: 'A long-sleeved open-mesh turtleneck.',
      files: { front: 'shirt_mesh_turtleneck_front.png', side: 'shirt_mesh_turtleneck_side.png', back: 'shirt_mesh_turtleneck_back.png' },
    },
    shirt_dress_lace: {
      name: 'Lace Dress', slot: 'shirt', buyPrice: 60, weight: 0.8, fashionTier: 'statement',
      description: 'A long fitted lace dress.', clothingFitMode: 'dressSplit', waistFraction: 0.42,
      files: { front: 'shirt_dress_lace_front.png', side: 'shirt_dress_lace_side.png', back: 'shirt_dress_lace_back.png' },
    },
    pants_fitted_shorts: {
      name: 'Fitted Shorts', slot: 'pants', buyPrice: 22, weight: 0.3, fashionTier: 'everyday',
      description: 'Close-fitting short trousers.',
      files: { front: 'pants_fitted_shorts_front.png', side: 'pants_fitted_shorts_side.png', back: 'pants_fitted_shorts_back.png' },
    },
  };

  const LOOKS = [
    { id: 'collared', tier: 'everyday', items: [['shirt_collared', 'shirt']] },
    { id: 'cloak', tier: 'everyday', items: [['cloak_full', 'cloak']] },
    { id: 'shorts-and-shirt', tier: 'everyday', items: [['shirt_collared', 'shirt'], ['pants_fitted_shorts', 'pants']] },
    { id: 'tie-tank', tier: 'fashion', items: [['shirt_tie_tank', 'shirt'], ['pants_fitted_shorts', 'pants']] },
    { id: 'plunge', tier: 'fashion', items: [['shirt_plunge', 'shirt'], ['pants_fitted_shorts', 'pants']] },
    { id: 'corseted', tier: 'statement', items: [['shirt_collared', 'shirt'], ['corset_lace', 'topOuter']] },
    { id: 'lattice', tier: 'statement', items: [['shirt_collared', 'shirt'], ['pants_lattice', 'pants']] },
    { id: 'mesh', tier: 'statement', items: [['shirt_mesh_turtleneck', 'shirt'], ['tights_fishnet', 'tights']] },
    { id: 'lace-dress', tier: 'statement', items: [['shirt_dress_lace', 'shirt'], ['tights_fishnet', 'tights']] },
  ];

  const HIGH_FASHION_DIALOGUE = new Set(['silverhart_clothier', 'silverhart_fashion_stock', 'silverhart_tailor']);
  const HIGH_FASHION_TITLES = /clothier|garment seller|master tailor/i;
  let registered = false;
  let corsetGeometryInstalled = false;
  let npcHookInstalled = false;

  function hash(text) {
    let h = 2166136261;
    for (const ch of String(text || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function unit(seed, channel) {
    return hash(`${seed}|${channel}`) / 4294967296;
  }

  function garmentLayer(id, def) {
    return [{
      id: 'base', label: 'Fabric', tint: true, defaultColor: { ...DEFAULT_COLOUR },
      views: {
        front: ROOT + def.files.front,
        side: ROOT + def.files.side,
        back: ROOT + def.files.back,
      },
    }];
  }

  function registerGarments() {
    if (!window.items) return false;
    for (const [id, def] of Object.entries(GARMENTS)) {
      if (window.items[id]) continue;
      const item = {
        name: def.name,
        description: def.description,
        type: 'clothes',
        clothingSlot: def.slot,
        buyPrice: def.buyPrice,
        weight: def.weight,
        fashionTier: def.fashionTier,
        clothingLayers: garmentLayer(id, def),
      };
      if (def.slots) {
        item.clothingSlots = [...def.slots];
        item.defaultClothingSlot = def.slot;
      }
      if (def.clothingGeometrySlot) item.clothingGeometrySlot = def.clothingGeometrySlot;
      if (def.clothingFitMode) item.clothingFitMode = def.clothingFitMode;
      if (def.waistFraction != null) item.clothingWaistFraction = def.waistFraction;
      window.items[id] = item;
    }
    registered = true;
    return true;
  }

  // A corset in the bra slot still occupies the torso; only its draw ORDER is
  // the bra/under-layer order. The base bra geometry is intentionally tiny, so
  // temporarily draw this one item through shirt geometry while preserving the
  // actual equipped slot and the real inner shirt above it.
  function installCorsetGeometryFix() {
    const cs = window.clothingSystem;
    if (!cs?.__smallSlotExpansionDrawExtra) return false;
    if (cs.drawSlot?.__newClothingGeometryFix) { corsetGeometryInstalled = true; return true; }
    const previous = cs.drawSlot.bind(cs);
    const wrapped = function drawSlotWithFlexibleGeometry(ctx, entity, slot, view, bounds) {
      if (slot !== 'bra' || window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) === false) {
        return previous(ctx, entity, slot, view, bounds);
      }
      const itemId = window.getEquipmentBaseId?.(entity?.equipped?.[slot]) || entity?.equipped?.[slot];
      const item = window.items?.[itemId];
      const geometry = item?.clothingGeometrySlot;
      if (!itemId || !geometry || geometry === slot) return previous(ctx, entity, slot, view, bounds);

      entity.equipped = entity.equipped || {};
      const oldGeometryItem = entity.equipped[geometry];
      const oldTopOuter = entity.equipped.topOuter;
      const oldItemSlot = item.clothingSlot;
      const visibility = entity.equipmentVisibility || (entity.equipmentVisibility = {});
      const hadVisibility = Object.prototype.hasOwnProperty.call(visibility, geometry);
      const oldVisibility = visibility[geometry];
      entity.equipped[geometry] = itemId;
      if (geometry === 'shirt') entity.equipped.topOuter = null;
      item.clothingSlot = geometry;
      visibility[geometry] = true;
      let drew = false;
      try {
        drew = !!previous(ctx, entity, geometry, view, bounds);
      } finally {
        entity.equipped[geometry] = oldGeometryItem;
        entity.equipped.topOuter = oldTopOuter;
        if (oldItemSlot === undefined) delete item.clothingSlot; else item.clothingSlot = oldItemSlot;
        if (hadVisibility) visibility[geometry] = oldVisibility; else delete visibility[geometry];
      }
      // The normal bra pass also draws tights immediately afterwards.
      return !!cs.__smallSlotExpansionDrawExtra(ctx, entity, 'tights', view, bounds) || drew;
    };
    wrapped.__newClothingGeometryFix = true;
    wrapped.__previous = previous;
    cs.drawSlot = wrapped;
    corsetGeometryInstalled = true;
    return true;
  }

  function npcContext(entity) {
    if (!entity?.isNPC || entity.side === 'enemy' || entity.customImage || entity.directionalArtKey) return null;
    if (entity.isChild || entity.ageBand === 'child' || /\b(child|boy|girl)\b/i.test(`${entity.title || ''}`)) return null;
    if (entity.equipped?.armor) return null;
    if (HIGH_FASHION_DIALOGUE.has(entity.dialogueId) || HIGH_FASHION_TITLES.test(`${entity.title || ''}`)) return 'highFashion';
    if (/^silverhart_/.test(`${entity.dialogueId || ''}`)) return 'capital';
    return 'ordinary';
  }

  function lookWeight(look, context) {
    if (context === 'highFashion') return look.tier === 'statement' ? 6 : look.tier === 'fashion' ? 3 : 1.5;
    if (context === 'capital') return look.tier === 'statement' ? 1.2 : look.tier === 'fashion' ? 2 : 3;
    return look.tier === 'statement' ? 0.03 : look.tier === 'fashion' ? 0.25 : 1;
  }

  function chooseLook(seed, context) {
    const weighted = LOOKS.map(look => ({ look, weight: lookWeight(look, context) })).filter(x => x.weight > 0);
    const total = weighted.reduce((sum, x) => sum + x.weight, 0);
    let roll = unit(seed, 'look') * total;
    for (const entry of weighted) { roll -= entry.weight; if (roll <= 0) return entry.look; }
    return weighted[weighted.length - 1]?.look || null;
  }

  function setNpcColour(entity, itemId, seed) {
    const cs = window.clothingSystem;
    const spec = cs?.getItemSpec?.(itemId);
    if (!spec?.layers?.length) return;
    entity.clothingColors = entity.clothingColors || {};
    const bucket = entity.clothingColors[itemId] || (entity.clothingColors[itemId] = {});
    const baseHue = Math.floor(unit(seed, `${itemId}:hue`) * 360);
    for (const part of spec.layers) {
      bucket[part.id] = {
        hue: baseHue,
        saturation: 28 + Math.round(unit(seed, `${itemId}:${part.id}:sat`) * 48),
        value: 38 + Math.round(unit(seed, `${itemId}:${part.id}:value`) * 44),
        opacity: 1,
      };
    }
  }

  function applyLook(entity, look, seed) {
    const cs = window.clothingSystem;
    if (!entity || !look || !cs) return false;
    cs.migrateLegacyEquipment?.(entity);
    entity.equipped = entity.equipped || {};
    entity.inventory = Array.isArray(entity.inventory) ? entity.inventory : [];
    for (const [itemId, slot] of look.items) {
      if (!window.items?.[itemId]) continue;
      entity.equipped[slot] = itemId;
      if (!entity.inventory.includes(itemId)) entity.inventory.push(itemId);
      setNpcColour(entity, itemId, seed);
    }
    cs.ensureDefaultOutfit?.(entity, { player: false });
    entity.npcFashionLook = look.id;
    return true;
  }

  function maybeStyleNpc(entity) {
    if (!entity || entity.__newClothingFashionApplied) return false;
    const context = npcContext(entity);
    if (!context) return false;
    entity.__newClothingFashionApplied = true;
    const seed = `${entity.name || 'npc'}|${entity.dialogueId || ''}|${entity.title || ''}`;
    const chance = context === 'highFashion' ? 1 : context === 'capital' ? 0.35 : 0.06;
    if (unit(seed, 'wear-new-clothing') >= chance) return false;
    return applyLook(entity, chooseLook(seed, context), seed);
  }

  function installNpcHook() {
    if (window.buildNPC?.__newClothingFashionHook) { npcHookInstalled = true; return true; }
    if (typeof window.buildNPC !== 'function') return false;
    const previous = window.buildNPC;
    const wrapped = function buildNpcWithFashion(spec) {
      const entity = previous.apply(this, arguments);
      maybeStyleNpc(entity);
      return entity;
    };
    wrapped.__newClothingFashionHook = true;
    wrapped.__previous = previous;
    window.buildNPC = wrapped;
    for (const entity of (Array.isArray(window.entities) ? window.entities : (window.entities && typeof window.entities === 'object' ? Object.values(window.entities) : []))) maybeStyleNpc(entity);
    npcHookInstalled = true;
    return true;
  }

  function install() {
    registerGarments();
    installCorsetGeometryFix();
    installNpcHook();
    return registered && corsetGeometryInstalled && npcHookInstalled;
  }

  let timer = null;
  timer = setInterval(() => { if (install() && timer != null) clearInterval(timer); }, 50);
  if (document.readyState === 'complete') install();
  else window.addEventListener('load', install, { once: true });
  setTimeout(() => clearInterval(timer), 15000);

  window.newClothingGarments = {
    build: BUILD,
    garmentIds: Object.keys(GARMENTS),
    garments: GARMENTS,
    looks: LOOKS,
    register: registerGarments,
    maybeStyleNpc,
    applyLook,
  };
})();