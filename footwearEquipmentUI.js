// Footwear extension for the newer slot-first equipment screen.
// equipmentInterface.js intentionally owns its SLOT_DEFS privately, so footwear
// adds its slot after that UI renders rather than maintaining a second inventory.
(() => {
  'use strict';

  const SLOT = 'shoes';
  const SLOT_LABEL = 'Shoes';
  let observedHost = null;
  let observer = null;
  let installQueued = false;

  const baseId = value => window.getEquipmentBaseId?.(value) || value?.itemId || value;
  const itemDef = value => window.items?.[baseId(value)] || null;
  const isInstance = value => !!window.equipmentIdentity?.isInstance?.(value);

  function slotFor(value) {
    const id = baseId(value);
    const def = itemDef(value);
    if (!id || !def) return null;
    if (def.type !== 'clothes') return null;
    return window.clothingSystem?.getItemSpec?.(id)?.slot || def.clothingSlot || 'shirt';
  }

  function label(value) {
    return window.inventoryDisplayName?.(value)
      || window.describeEquipment?.(value)
      || itemDef(value)?.name
      || String(baseId(value) || 'Empty');
  }

  function currentRaw(player) {
    const id = player?.equipped?.[SLOT];
    if (!id) return null;
    return player?.equippedInstances?.[SLOT]
      || window.physicalEquipment?.current?.(player, id)
      || id;
  }

  function availableShoes(player) {
    const out = [];
    const seenInstances = new Set();
    const seenBase = new Set();

    for (const raw of player?.physicalEquipment || []) {
      if (slotFor(raw) !== SLOT) continue;
      const key = raw?.instanceId || JSON.stringify(raw);
      if (seenInstances.has(key)) continue;
      seenInstances.add(key);
      out.push(raw);
      seenBase.add(baseId(raw));
    }

    // Legacy/base-id inventory entries still exist in development saves and in
    // several item-grant paths. Keep one picker entry for each such shoe type
    // unless a physical instance of the same item is already represented.
    for (const raw of player?.inventory || []) {
      const id = baseId(raw);
      if (!id || slotFor(id) !== SLOT || seenBase.has(id)) continue;
      seenBase.add(id);
      out.push(id);
    }
    return out;
  }

  function closePicker() {
    document.querySelector('[data-footwear-slot-picker]')?.remove();
  }

  function refreshInventory() {
    closePicker();
    queueMicrotask(() => window.showInventoryScreen?.());
  }

  function equip(value) {
    const id = baseId(value);
    if (!id) return;
    if (isInstance(value) && window.physicalEquipment?.equip) {
      window.physicalEquipment.equip(value.instanceId);
    } else {
      window.equipItem?.(id);
    }
    refreshInventory();
  }

  function unequip() {
    window.unequipItem?.(SLOT);
    refreshInventory();
  }

  function openPicker() {
    closePicker();
    const player = window.player;
    if (!player) return;

    const modal = document.createElement('div');
    modal.dataset.footwearSlotPicker = 'true';
    modal.style.cssText = 'position:fixed;inset:0;background:#000b;z-index:10021;display:flex;align-items:flex-end;justify-content:center';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#202020;border:1px solid #666;border-radius:12px 12px 0 0;width:min(680px,100%);max-height:72vh;overflow:auto;padding:12px';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px';
    const title = document.createElement('strong');
    title.textContent = SLOT_LABEL;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'width:auto;padding:5px 9px';
    close.onclick = closePicker;
    head.append(title, close);
    panel.appendChild(head);

    const none = document.createElement('button');
    none.type = 'button';
    none.textContent = 'Unequip / empty slot';
    none.style.cssText = 'width:100%;margin-bottom:8px;padding:9px';
    none.onclick = unequip;
    panel.appendChild(none);

    const choices = availableShoes(player);
    if (!choices.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nothing compatible in the shared inventory.';
      panel.appendChild(empty);
    }

    for (const raw of choices) {
      const row = document.createElement('button');
      row.type = 'button';
      row.style.cssText = 'width:100%;padding:9px;margin:0 0 6px;text-align:left;display:flex;justify-content:space-between;gap:8px';
      const name = document.createElement('span');
      name.textContent = label(raw);
      const action = document.createElement('span');
      action.textContent = 'Equip';
      action.style.color = '#9ccc65';
      row.append(name, action);
      row.onclick = () => equip(raw);
      panel.appendChild(row);
    }

    modal.appendChild(panel);
    modal.onclick = event => { if (event.target === modal) closePicker(); };
    document.body.appendChild(modal);
  }

  function findEquipmentGrid(host) {
    return [...(host?.children || [])].find(el =>
      typeof el.style?.gridTemplateAreas === 'string'
      && el.style.gridTemplateAreas.includes('helmet')
      && el.style.gridTemplateAreas.includes('pants')
    ) || null;
  }

  function makeSlotButton(player) {
    const raw = currentRaw(player);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.equipmentSlot = SLOT;
    button.style.cssText = 'grid-area:shoes;min-height:92px;padding:6px;border:1px solid #666;border-radius:7px;background:#262626;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;overflow:hidden;';

    const spec = raw && window.clothingSystem?.getItemSpec?.(baseId(raw));
    const src = spec?.layers?.[0]?.views?.front;
    if (src && window.assetManager?.createDOMImage && window.assetManager?.bind) {
      const img = window.assetManager.createDOMImage();
      img.alt = '';
      img.style.cssText = 'width:54px;height:54px;object-fit:contain;flex:none';
      window.assetManager.bind(img, src, {priority:-20, onError:() => img.remove()});
      button.appendChild(img);
    }

    const slot = document.createElement('span');
    slot.textContent = SLOT_LABEL;
    slot.style.cssText = 'font-size:.68em;color:#aaa';
    const name = document.createElement('span');
    name.textContent = raw ? label(raw) : 'Empty';
    name.style.cssText = 'font-size:.76em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    button.append(slot, name);
    button.onclick = openPicker;
    return button;
  }

  function installSlot() {
    installQueued = false;
    const host = document.getElementById('inventory-content');
    const player = window.player;
    if (!host || !player) return false;

    if (observedHost !== host) {
      observer?.disconnect();
      observedHost = host;
      observer = new MutationObserver(queueInstall);
      observer.observe(host, {childList:true, subtree:false});
    }

    const grid = findEquipmentGrid(host);
    if (!grid) return false;
    if (grid.querySelector('[data-equipment-slot="shoes"]')) return true;

    const areas = grid.style.gridTemplateAreas || '';
    if (!areas.includes('shoes')) {
      grid.style.gridTemplateAreas = areas.includes('"pants pants pants"')
        ? areas.replace('"pants pants pants"', '"pants pants pants" "shoes shoes shoes"')
        : `${areas} "shoes shoes shoes"`.trim();
    }
    grid.appendChild(makeSlotButton(player));
    return true;
  }

  function queueInstall() {
    if (installQueued) return;
    installQueued = true;
    queueMicrotask(installSlot);
  }

  function wrapInventoryEntryPoint() {
    const current = window.showInventoryScreen;
    if (typeof current !== 'function' || current.__footwearSlotUI) return false;
    const wrapped = function(...args) {
      const result = current.apply(this, args);
      queueInstall();
      return result;
    };
    // Preserve the marker used by equipmentInterface.js so wrapping the new UI
    // cannot cause that module to reinstall itself. If we wrapped the old UI
    // first, leave it unset so equipmentInterface can still replace it later.
    if (current.__slotEquipmentUI) wrapped.__slotEquipmentUI = true;
    wrapped.__footwearSlotUI = true;
    window.showInventoryScreen = wrapped;
    return true;
  }

  setInterval(() => {
    wrapInventoryEntryPoint();
    if (document.getElementById('inventory-content')) queueInstall();
  }, 100);

  if (document.readyState === 'complete') queueInstall();
  else window.addEventListener('load', queueInstall, {once:true});

  window.footwearEquipmentUI = {slot:SLOT, installSlot, openPicker, availableShoes};
})();
