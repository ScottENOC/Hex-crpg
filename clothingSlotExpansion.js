// Small clothing-slot expansion: preserve the singular-slot equipment model while
// allowing a few extra authored layers and the occasional garment (for example a
// corset) to choose between two slots.
(() => {
  'use strict';

  const EXTRA_SLOTS = ['tights', 'topOuter', 'coat', 'cloak'];
  const FLEXIBLE_SLOTS = new Set(['bra', 'topOuter']);
  const LABELS = {
    shirt: 'Top inner / Dress',
    tights: 'Tights / Stockings',
    topOuter: 'Top outer',
    coat: 'Coat',
    cloak: 'Cloak',
  };
  const GEOMETRY_SLOT = {
    tights: 'pants',
    topOuter: 'shirt',
    coat: 'shirt',
    cloak: 'shirt',
  };
  const PREFERRED = new Map();
  let installed = false;
  let baseEquipItem = null;
  let basePhysicalEquip = null;
  let basePhysicalCurrent = null;
  let basePhysicalReconcile = null;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const baseId = value => window.getEquipmentBaseId?.(value) || value;

  function validSlotsFor(item) {
    const cs = window.clothingSystem;
    const declared = Array.isArray(item?.clothingSlots) ? item.clothingSlots : [];
    return [...new Set(declared.filter(slot => cs?.slots?.includes(slot)))];
  }

  function defaultFlexibleSlot(item, choices) {
    const wanted = item?.defaultClothingSlot || item?.clothingSlot;
    if (choices.includes(wanted)) return wanted;
    if (choices.includes('topOuter')) return 'topOuter';
    return choices[0];
  }

  function chooseFlexibleSlot(itemId, choices) {
    const item = window.items?.[itemId];
    const fallback = defaultFlexibleSlot(item, choices);
    if (choices.length < 2) return fallback;

    // The only flexible combination intentionally supported here is a garment
    // such as a corset that may sit below the inner top or above it. Keep the
    // interaction synchronous so physical-equipment callers can finish assigning
    // the exact instance immediately after equipItem returns.
    if (choices.length === 2 && choices.includes('bra') && choices.includes('topOuter')) {
      const name = item?.name || itemId;
      const outer = window.confirm?.(
        `${name}: wear over your inner top?\n\nOK = Top outer\nCancel = Under layer (bra slot)`
      );
      return outer ? 'topOuter' : 'bra';
    }
    return fallback;
  }

  function withPreferredSlot(itemId, slot, fn) {
    PREFERRED.set(itemId, slot);
    try { return fn(); }
    finally { PREFERRED.delete(itemId); }
  }

  function installCoreSlots() {
    const cs = window.clothingSystem;
    if (!cs) return false;
    if (installed) return true;

    for (const slot of EXTRA_SLOTS) {
      if (!cs.slots.includes(slot)) cs.slots.push(slot);
      if (!cs.preloadSlots.includes(slot)) cs.preloadSlots.push(slot);
    }
    Object.assign(cs.slotLabels, LABELS);

    const originalGetItemSpec = cs.getItemSpec.bind(cs);
    cs.getItemSpec = function expandedItemSpec(itemId) {
      const item = window.items?.[itemId];
      const choices = validSlotsFor(item);
      if (!choices.length) return originalGetItemSpec(itemId);
      const selected = choices.includes(PREFERRED.get(itemId))
        ? PREFERRED.get(itemId)
        : defaultFlexibleSlot(item, choices);
      const previous = item.clothingSlot;
      item.clothingSlot = selected;
      try {
        const spec = originalGetItemSpec(itemId);
        return spec ? { ...spec, slot: selected, slots: [...choices] } : null;
      } finally {
        if (previous === undefined) delete item.clothingSlot;
        else item.clothingSlot = previous;
      }
    };

    const originalDrawSlot = cs.drawSlot.bind(cs);
    function drawExtraSlot(ctx, entity, slot, view, bounds) {
      const itemId = entity?.equipped?.[slot];
      if (!itemId) return false;
      if (window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) === false) return false;
      const item = window.items?.[baseId(itemId)];
      if (!item) return false;

      const geometry = item.clothingGeometrySlot || GEOMETRY_SLOT[slot] || 'shirt';
      const previousEquipped = entity.equipped?.[geometry];
      const previousItemSlot = item.clothingSlot;
      const previousFitMode = item.clothingFitMode;
      const visibility = entity.equipmentVisibility || (entity.equipmentVisibility = {});
      const hadGeometryVisibility = Object.prototype.hasOwnProperty.call(visibility, geometry);
      const previousGeometryVisibility = visibility[geometry];

      // Long coats/cloaks use the already-proven dress split geometry by default.
      // A specific item can opt out by setting clothingFitMode explicitly.
      if ((slot === 'coat' || slot === 'cloak') && item.clothingFitMode == null) {
        item.clothingFitMode = 'dressSplit';
      }
      item.clothingSlot = geometry;
      entity.equipped[geometry] = itemId;
      visibility[geometry] = true;
      try {
        return !!originalDrawSlot(ctx, entity, geometry, view, bounds);
      } finally {
        entity.equipped[geometry] = previousEquipped;
        if (previousItemSlot === undefined) delete item.clothingSlot;
        else item.clothingSlot = previousItemSlot;
        if (previousFitMode === undefined) delete item.clothingFitMode;
        else item.clothingFitMode = previousFitMode;
        if (hadGeometryVisibility) visibility[geometry] = previousGeometryVisibility;
        else delete visibility[geometry];
      }
    }

    cs.drawSlot = function expandedDrawSlot(ctx, entity, slot, view, bounds) {
      if (EXTRA_SLOTS.includes(slot)) return drawExtraSlot(ctx, entity, slot, view, bounds);
      let drew = !!originalDrawSlot(ctx, entity, slot, view, bounds);
      // The current compositor asks for the four legacy clothing slots. Interleave
      // the two new under-armour layers at those existing draw points.
      if (slot === 'bra') drew = drawExtraSlot(ctx, entity, 'tights', view, bounds) || drew;
      if (slot === 'shirt') drew = drawExtraSlot(ctx, entity, 'topOuter', view, bounds) || drew;
      return drew;
    };
    cs.__smallSlotExpansionDrawExtra = drawExtraSlot;

    installed = true;
    return true;
  }

  function installAppearanceSlots() {
    const ea = window.equipmentAppearanceSystem;
    if (!ea || ea.__smallClothingSlots) return !!ea;
    const insertAfter = (after, slot) => {
      if (ea.renderSlots.includes(slot)) return;
      const index = ea.renderSlots.indexOf(after);
      ea.renderSlots.splice(index >= 0 ? index + 1 : ea.renderSlots.length, 0, slot);
    };
    insertAfter('pants', 'tights');
    insertAfter('shirt', 'topOuter');
    insertAfter('armor', 'coat');
    insertAfter('coat', 'cloak');
    Object.assign(ea.slotLabels, LABELS);
    ea.__smallClothingSlots = true;
    return true;
  }

  function installOuterwearHook() {
    const cs = window.clothingSystem;
    if (!cs?.__smallSlotExpansionDrawExtra) return false;
    const current = window.drawFacialHairLayer;
    if (current?.__smallClothingOuterwearHook) return true;
    const previous = typeof current === 'function' ? current : null;
    const wrapped = function drawFacialHairAfterOuterwear(ctx, entity, view, bounds) {
      cs.__smallSlotExpansionDrawExtra(ctx, entity, 'coat', view, bounds);
      cs.__smallSlotExpansionDrawExtra(ctx, entity, 'cloak', view, bounds);
      return previous ? !!previous.apply(this, arguments) : false;
    };
    wrapped.__smallClothingOuterwearHook = true;
    wrapped.__previousFacialHairLayer = previous;
    window.drawFacialHairLayer = wrapped;
    return true;
  }

  function installEquipSupport() {
    if (!window.equipItem) return false;
    if (window.equipItem.__smallClothingSlots) return true;
    baseEquipItem = window.equipItem;

    function equipToSlot(itemId, slot, isOffhand = false) {
      const item = window.items?.[itemId];
      const choices = validSlotsFor(item);
      if (choices.length && !choices.includes(slot)) return false;
      return withPreferredSlot(itemId, slot, () => baseEquipItem.call(window, itemId, isOffhand));
    }

    const wrapped = function expandedEquipItem(itemId, isOffhand = false) {
      const item = window.items?.[itemId];
      const choices = validSlotsFor(item);
      if (choices.length > 1 && !PREFERRED.has(itemId)) {
        return equipToSlot(itemId, chooseFlexibleSlot(itemId, choices), isOffhand);
      }
      return baseEquipItem.apply(this, arguments);
    };
    wrapped.__smallClothingSlots = true;
    window.equipItem = wrapped;
    window.equipClothingToSlot = equipToSlot;
    return true;
  }

  function reconcileExtraInstances(entity) {
    const pw = window.physicalWearables;
    if (!entity || !pw?.list) return;
    basePhysicalReconcile?.(entity);
    const physicals = pw.list(entity);
    entity.equippedInstances = entity.equippedInstances || {};
    const used = new Set(Object.values(entity.equippedInstances).filter(Boolean));
    for (const slot of EXTRA_SLOTS) {
      const id = baseId(entity.equipped?.[slot]);
      if (!id) {
        delete entity.equippedInstances[slot];
        continue;
      }
      let inst = entity.equippedInstances[slot];
      if (inst && (baseId(inst.itemId) !== id || !physicals.includes(inst))) {
        used.delete(inst);
        inst = null;
      }
      if (!inst) {
        inst = physicals.find(candidate => baseId(candidate?.itemId) === id && !used.has(candidate))
          || physicals.find(candidate => baseId(candidate?.itemId) === id)
          || null;
        if (inst) entity.equippedInstances[slot] = inst;
      }
      if (inst) used.add(inst);
    }
  }

  function extraCurrent(entity, itemId) {
    if (!entity) return null;
    reconcileExtraInstances(entity);
    const id = baseId(itemId);
    for (const slot of EXTRA_SLOTS) {
      if (baseId(entity.equipped?.[slot]) === id && entity.equippedInstances?.[slot]) {
        return entity.equippedInstances[slot];
      }
    }
    return null;
  }

  function installPhysicalSupport() {
    const pw = window.physicalWearables;
    if (!pw) return false;
    if (!pw.__smallClothingSlots) {
      basePhysicalEquip = pw.equip?.bind(pw);
      basePhysicalCurrent = pw.current?.bind(pw);
      basePhysicalReconcile = pw.reconcile?.bind(pw);

      if (basePhysicalReconcile) {
        pw.reconcile = function expandedReconcile(entity) {
          reconcileExtraInstances(entity);
          return entity;
        };
      }
      if (basePhysicalCurrent) {
        pw.current = function expandedCurrent(entity, itemId) {
          return basePhysicalCurrent(entity, itemId) || extraCurrent(entity, itemId);
        };
      }
      if (basePhysicalEquip) {
        pw.equip = function expandedPhysicalEquip(instanceId) {
          const player = window.player;
          if (!player) return;
          reconcileExtraInstances(player);
          const inst = pw.list?.(player)?.find(candidate => candidate?.instanceId === instanceId);
          const itemId = inst?.itemId;
          const choices = validSlotsFor(window.items?.[itemId]);
          if (inst && choices.length > 1) {
            const slot = chooseFlexibleSlot(itemId, choices);
            window.equipClothingToSlot?.(itemId, slot);
            if (baseId(player.equipped?.[slot]) === baseId(itemId)) {
              for (const [otherSlot, otherInst] of Object.entries(player.equippedInstances || {})) {
                if (otherSlot !== slot && otherInst === inst) delete player.equippedInstances[otherSlot];
              }
              player.equippedInstances[slot] = inst;
              window.syncPlayerEntity?.();
              window.showInventoryScreen?.();
              window.renderEntities?.();
            }
            return;
          }
          return basePhysicalEquip(instanceId);
        };
      }
      pw.__smallClothingSlots = true;
    }

    // physicalWearables' original appearance hook closes over its original six
    // slots. Add a tiny outer wrapper so colours on the four new slots still
    // belong to the exact physical garment instance rather than the base item ID.
    const cs = window.clothingSystem;
    if (cs?.__physicalWearables && !cs.__smallSlotPhysicalColours) {
      const oldGet = cs.getLayerColour.bind(cs);
      const oldSet = cs.setLayerColour.bind(cs);
      cs.getLayerColour = function getExpandedLayerColour(entity, itemId, part) {
        const inst = extraCurrent(entity, itemId);
        if (!inst) return oldGet(entity, itemId, part);
        inst.appearance = inst.appearance || {};
        const bucket = inst.appearance.clothing || (inst.appearance.clothing = {});
        if (!bucket[part.id]) bucket[part.id] = clone(oldGet(entity, itemId, part));
        return bucket[part.id];
      };
      cs.setLayerColour = function setExpandedLayerColour(entity, itemId, partId, next) {
        const inst = extraCurrent(entity, itemId);
        if (!inst) return oldSet(entity, itemId, partId, next);
        const spec = cs.getItemSpec(itemId);
        const part = spec?.layers?.find(candidate => candidate.id === partId);
        if (!part) return;
        const previous = cs.getLayerColour(entity, itemId, part);
        inst.appearance = inst.appearance || {};
        const bucket = inst.appearance.clothing || (inst.appearance.clothing = {});
        bucket[partId] = { ...previous, ...next };
      };
      cs.__smallSlotPhysicalColours = true;
    }
    return !!cs?.__smallSlotPhysicalColours;
  }

  function syncEntities() {
    const seen = new Set();
    const all = [
      window.player,
      ...(Array.isArray(window.party) ? window.party : []),
      ...(Array.isArray(window.entities) ? window.entities : []),
    ].filter(Boolean);
    for (const entity of all) {
      if (seen.has(entity)) continue;
      seen.add(entity);
      window.clothingSystem?.migrateLegacyEquipment?.(entity);
      reconcileExtraInstances(entity);
    }
  }

  function installAll() {
    const ready = [
      installCoreSlots(),
      installAppearanceSlots(),
      installEquipSupport(),
      installPhysicalSupport(),
      installOuterwearHook(),
    ].every(Boolean);
    if (ready) syncEntities();
    return ready;
  }

  // Poll only during script start-up. Once the existing systems are present the
  // expansion is fully event-driven; there is no permanent per-frame or 10 Hz work.
  const timer = setInterval(() => { if (installAll()) clearInterval(timer); }, 100);
  if (document.readyState === 'complete') { if (installAll()) clearInterval(timer); }
  else window.addEventListener('load', () => { if (installAll()) clearInterval(timer); }, { once: true });

  window.clothingSlotExpansion = {
    slots: [...EXTRA_SLOTS],
    labels: { ...LABELS },
    flexibleSlots: [...FLEXIBLE_SLOTS],
    install: installAll,
  };
})();

// Mobile Safari can deliver touchstart/touchend to dynamically-created buttons
// inside the fixed, scrollable equipment picker but omit the synthetic click.
// Keep the button's existing click handler as the single source of truth: this
// bridge only calls button.click() after a stationary touch and prevents the
// browser from generating a second click for that same tap. A moved touch is
// left alone so scrolling the picker can never equip an item accidentally.
(() => {
  'use strict';
  if (window.__equipmentPickerTouchBridgeInstalled) return;
  window.__equipmentPickerTouchBridgeInstalled = true;

  const MAX_TAP_MOVE_PX = 10;
  let start = null;

  document.addEventListener('touchstart', event => {
    const button = event.target?.closest?.('[data-equipment-slot-picker] button');
    if (!button || event.touches.length !== 1) {
      start = null;
      return;
    }
    const touch = event.touches[0];
    start = { button, x: touch.clientX, y: touch.clientY };
  }, { passive: true, capture: true });

  document.addEventListener('touchend', event => {
    const pending = start;
    start = null;
    if (!pending || !pending.button.isConnected || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - pending.x;
    const dy = touch.clientY - pending.y;
    if ((dx * dx) + (dy * dy) > MAX_TAP_MOVE_PX * MAX_TAP_MOVE_PX) return;

    // Cancelling the native touchend suppresses Safari's delayed synthetic click;
    // the programmatic click below therefore runs the existing action exactly once.
    event.preventDefault();
    pending.button.click();
  }, { passive: false, capture: true });

  document.addEventListener('touchcancel', () => { start = null; }, { passive: true, capture: true });
})();
