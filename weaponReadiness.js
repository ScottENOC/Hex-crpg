// weaponReadiness.js - equipped (hands), readied (body), stored (shared inventory)
(() => {
  'use strict';

  const BODY = ['leftHip', 'rightHip', 'back'];
  const EMPTY_PLAN = Object.freeze([]);
  const RIG = {
    human_female:[1.60,1.92,-.16], human_male:[1.70,2.06,-.17],
    elf_female:[1.60,1.92,-.16], elf_male:[2,2.4,-.20],
    dwarf_female:[1.6,1.92,-.07], dwarf_male:[1.6,1.92,-.07],
    goblin_female:[1.45,1.7,-.12], goblin_male:[1.5,1.75,-.12],
    orc_female:[1.85,2.05,-.15], orc_male:[1.9,2.1,-.15]
  };

  const base = x => window.getEquipmentBaseId?.(x)
    || (typeof x === 'string' ? x : x?.baseId || x?.itemId || x?.id) || null;
  const party = () => Array.isArray(window.party) ? window.party.filter(Boolean) : [];
  const label = id => window.items?.[base(id)]?.name || base(id) || 'Weapon';

  function isPartyMember(entity) {
    if (!entity || entity.side !== 'player') return false;
    const members = window.party;
    if (!Array.isArray(members)) return false;
    return members.some(member => member === entity || member?.name === entity.name);
  }

  function kind(raw) {
    const id = base(raw);
    const item = id && window.items?.[id];
    if (!id || item?.type !== 'weapon') return null;
    const text = `${id} ${item.name || ''}`.toLowerCase();
    if (text.includes('dagger')) return 'dagger';
    if (text.includes('sword') || id === 'starforged_blade') return 'sword';
    if (text.includes('axe') && !text.includes('pickaxe')) return 'axe';
    if (text.includes('bow')) return 'bow';
    return null;
  }

  function ensure(character) {
    if (!character) return { leftHip:null, rightHip:null, back:null, extraDaggers:[] };
    let readiness = character.weaponReadiness;
    if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness)) {
      readiness = character.weaponReadiness = { leftHip:null, rightHip:null, back:null, extraDaggers:[] };
    }
    for (const slot of BODY) {
      if (!(slot in readiness) || (readiness[slot] && !kind(readiness[slot]))) readiness[slot] = null;
    }
    if (!Array.isArray(readiness.extraDaggers)) readiness.extraDaggers = [];
    readiness.extraDaggers = readiness.extraDaggers.filter(item => kind(item) === 'dagger');
    return readiness;
  }

  function assignments(character) {
    const readiness = ensure(character);
    const result = [];
    for (const location of BODY) {
      if (!readiness[location]) continue;
      result.push({ location, itemId:base(readiness[location]), kind:kind(readiness[location]) });
    }
    readiness.extraDaggers.forEach((item, index) => {
      result.push({ location:`dagger:${index}`, itemId:base(item), kind:'dagger' });
    });
    return result;
  }

  function activeWeapons(character) {
    const equipped = character?.equipped || {};
    const result = [];
    for (const raw of [equipped.weapon, equipped.offhand]) {
      const id = base(raw);
      if (id && window.items?.[id]?.type === 'weapon') result.push(id);
    }
    return result;
  }

  const count = (list, id) => list.reduce((n, value) => n + ((typeof value === 'string' ? value : value.itemId) === id), 0);

  function ownedCount(id) {
    id = base(id);
    return (window.partyInventory || window.player?.inventory || [])
      .reduce((n, raw) => n + (base(raw) === id), 0);
  }

  function assignedCount(character, id) {
    return count(assignments(character), base(id));
  }

  function activeCount(character, id) {
    return count(activeWeapons(character), base(id));
  }

  function committedCount(id) {
    id = base(id);
    return party().reduce((total, character) => {
      return total + Math.max(assignedCount(character, id), activeCount(character, id));
    }, 0);
  }

  const storedCount = id => Math.max(0, ownedCount(id) - committedCount(id));

  function sync(character) {
    if (!character) return;
    const entity = (window.entities || []).find(e => e?.name === character.name && e.side === 'player');
    if (entity && entity !== character) entity.weaponReadiness = ensure(character);
  }

  function message(text) {
    if (window.showMessage) window.showMessage(text);
    else console.info(text);
  }

  function place(character, id, { evict=false, free=true } = {}) {
    id = base(id);
    const weaponKind = kind(id);
    const readiness = ensure(character);
    if (!weaponKind) return { ok:false, reason:'That weapon has no body carry point yet.' };
    if (free && storedCount(id) <= 0) return { ok:false, reason:'No uncommitted copy is available in shared storage.' };

    if (weaponKind === 'axe' || weaponKind === 'bow') {
      if (!readiness.back || evict) {
        const old = readiness.back;
        readiness.back = id;
        sync(character);
        return { ok:true, location:'back', old };
      }
      return { ok:false, reason:`${label(readiness.back)} already occupies the back position.` };
    }

    const preferred = weaponKind === 'dagger' ? ['rightHip','leftHip'] : ['leftHip','rightHip'];
    for (const location of preferred) {
      if (readiness[location]) continue;
      readiness[location] = id;
      sync(character);
      return { ok:true, location };
    }
    if (weaponKind === 'dagger') {
      readiness.extraDaggers.push(id);
      sync(character);
      return { ok:true, location:`dagger:${readiness.extraDaggers.length - 1}` };
    }
    if (evict) {
      const location = preferred[0];
      const old = readiness[location];
      readiness[location] = id;
      sync(character);
      return { ok:true, location, old };
    }
    return { ok:false, reason:'Both hip positions are occupied.' };
  }

  function ensureEquipped(character) {
    if (!character) return;
    const needed = {};
    for (const id of activeWeapons(character)) {
      if (kind(id)) needed[id] = (needed[id] || 0) + 1;
    }
    for (const [id, amount] of Object.entries(needed)) {
      while (assignedCount(character, id) < amount) {
        if (!place(character, id, { evict:true, free:false }).ok) break;
      }
    }
    sync(character);
  }

  function refresh() {
    try { window.syncPlayerEntity?.(); window.renderEntities?.(); } catch (_) {}
    if (document.getElementById('inventory-modal')?.style.display === 'block') {
      setTimeout(() => window.showInventoryScreen?.(), 0);
    }
  }

  function ready(character, id) {
    const result = place(character, id);
    if (!result.ok) {
      message(`Cannot ready ${label(id)}: ${result.reason}`);
      return false;
    }
    message(`${label(id)} readied.`);
    refresh();
    return true;
  }

  function unreadyAt(character, location) {
    const readiness = ensure(character);
    const extraIndex = location.startsWith('dagger:') ? Number(location.split(':')[1]) : -1;
    const id = BODY.includes(location) ? readiness[location] : readiness.extraDaggers[extraIndex];
    if (!id) return false;
    if (assignedCount(character, id) <= activeCount(character, id)) {
      message(`${label(id)} is currently in hand, so its carry point stays reserved.`);
      return false;
    }
    if (BODY.includes(location)) readiness[location] = null;
    else readiness.extraDaggers.splice(extraIndex, 1);
    sync(character);
    message(`${label(id)} moved to stored party inventory.`);
    refresh();
    return true;
  }

  function projectedCount(character, id, offhand) {
    id = base(id);
    const current = base(offhand ? character?.equipped?.offhand : character?.equipped?.weapon);
    return activeCount(character, id) + (current === id ? 0 : 1);
  }

  function canEquipInCombat(character, id, offhand=false) {
    id = base(id);
    const current = base(offhand ? character?.equipped?.offhand : character?.equipped?.weapon);
    return current === id || assignedCount(character, id) >= projectedCount(character, id, offhand);
  }

  function canTake(character, id, offhand=false) {
    id = base(id);
    const current = base(offhand ? character?.equipped?.offhand : character?.equipped?.weapon);
    return current === id
      || assignedCount(character, id) >= projectedCount(character, id, offhand)
      || storedCount(id) > 0;
  }

  function installEquip() {
    const original = window.equipItem;
    if (typeof original !== 'function') return false;
    if (original.__weaponReadiness) return true;
    const wrapped = function(id, offhand=false) {
      const character = window.player;
      const itemId = base(id);
      const item = itemId && window.items?.[itemId];
      if (!character || item?.type !== 'weapon') return original.apply(this, arguments);
      if (window.isInCombat && !canEquipInCombat(character, itemId, offhand)) {
        message(`${label(itemId)} is stored, not readied. You cannot swap to it during combat.`);
        return false;
      }
      if (!window.isInCombat && !canTake(character, itemId, offhand)) {
        message(`${label(itemId)} is committed to another party member. Unready it there first.`);
        return false;
      }
      const beforeMain = base(character.equipped?.weapon);
      const beforeOff = base(character.equipped?.offhand);
      const result = original.apply(this, arguments);
      const afterMain = base(character.equipped?.weapon);
      const afterOff = base(character.equipped?.offhand);
      if (!window.isInCombat && (beforeMain !== afterMain || beforeOff !== afterOff || afterMain === itemId || afterOff === itemId)) {
        ensureEquipped(character);
      }
      return result;
    };
    wrapped.__weaponReadiness = true;
    wrapped.__unwrappedEquipItem = original;
    window.equipItem = wrapped;
    return true;
  }

  function activeLocations(character) {
    const remaining = {};
    for (const id of activeWeapons(character)) remaining[id] = (remaining[id] || 0) + 1;
    const result = new Set();
    for (const assignment of assignments(character)) {
      if ((remaining[assignment.itemId] || 0) <= 0) continue;
      result.add(assignment.location);
      remaining[assignment.itemId]--;
    }
    return result;
  }

  const locationName = location => location === 'leftHip' ? 'Left hip'
    : location === 'rightHip' ? 'Right hip'
    : location === 'back' ? 'Back' : 'Small sheath';

  function panel() {
    const character = window.player;
    if (!character) return null;
    ensureEquipped(character);
    const active = activeLocations(character);
    const panel = document.createElement('section');
    panel.dataset.weaponReadinessPanel = 'true';
    panel.style.cssText = 'border:1px solid #59636b;border-radius:6px;padding:9px;margin:0 0 12px;background:#24292d';
    panel.innerHTML = '<strong>Readied weapons</strong><div style="font-size:.8em;color:#aaa">In hand or attached to your body = reachable in combat. Everything else is stored with party gear.</div>';

    for (const assignment of assignments(character)) {
      const row = document.createElement('div');
      const inHand = active.has(assignment.location);
      row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin-top:5px;padding:4px;background:#30363b';
      row.innerHTML = `<span>${locationName(assignment.location)}: ${label(assignment.itemId)}${inHand ? ' — in hand' : ''}</span>`;
      const button = document.createElement('button');
      button.textContent = inHand ? 'In hand' : 'Store';
      button.disabled = inHand;
      button.style.width = 'auto';
      if (!inHand) button.onclick = () => unreadyAt(character, assignment.location);
      row.appendChild(button);
      panel.appendChild(row);
    }

    const storedIds = [...new Set((window.partyInventory || character.inventory || []).map(base).filter(Boolean))]
      .filter(id => kind(id) && storedCount(id) > 0);
    if (storedIds.length) {
      const heading = document.createElement('div');
      heading.textContent = 'Stored but ready-compatible:';
      heading.style.cssText = 'margin-top:8px;font-size:.82em;color:#bbb';
      panel.appendChild(heading);
      const buttons = document.createElement('div');
      buttons.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:5px';
      for (const id of storedIds) {
        const button = document.createElement('button');
        button.textContent = `Ready ${label(id)}`;
        button.style.width = 'auto';
        button.onclick = () => ready(character, id);
        buttons.appendChild(button);
      }
      panel.appendChild(buttons);
    }

    const note = document.createElement('div');
    note.style.cssText = 'font-size:.76em;color:#888;margin-top:7px';
    note.textContent = 'Swords use a hip; bows and axes use the back. Daggers use a hip first, but spare daggers can always fit in another small sheath. Spears, clubs and tools have no alternate carry point yet.';
    panel.appendChild(note);
    return panel;
  }

  function installUI() {
    const original = window.showInventoryScreen;
    if (typeof original !== 'function' || !original.__slotEquipmentUI) return false;
    if (original.__weaponReadiness) return true;
    const wrapped = function(...args) {
      const result = original.apply(this, args);
      const host = document.getElementById('inventory-content');
      if (host && !host.querySelector('[data-weapon-readiness-panel]')) {
        const readinessPanel = panel();
        if (readinessPanel) host.prepend(readinessPanel);
      }
      return result;
    };
    wrapped.__slotEquipmentUI = true;
    wrapped.__weaponReadiness = true;
    wrapped.__unwrappedInventoryUI = original;
    window.showInventoryScreen = wrapped;
    return true;
  }

  function bounds(entity, x, y, z=1, fly=0) {
    const rig = RIG[entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : ''];
    if (!rig) return null;
    const hex = window.hexSize || 1;
    const legacyWidth = rig[0] * hex * z;
    const height = rig[1] * hex * z;
    const top = y - legacyWidth / 2 + rig[2] * hex * z + fly;
    const width = height * .48;
    return { left:x - width / 2, top, width, height };
  }

  function alternateVisualPlan(entity) {
    if (!isPartyMember(entity)) return EMPTY_PLAN;
    const remaining = {};
    for (const id of activeWeapons(entity)) remaining[id] = (remaining[id] || 0) + 1;
    const result = [];
    let backIndex = 0;
    for (const assignment of assignments(entity)) {
      if ((remaining[assignment.itemId] || 0) > 0) {
        remaining[assignment.itemId]--;
        continue;
      }
      if (assignment.location.startsWith('dagger:')) continue;
      if (assignment.location === 'back') {
        result.push({ itemId:assignment.itemId, kind:assignment.kind, placement:'back', hip:null, backIndex:backIndex++ });
      } else {
        result.push({ itemId:assignment.itemId, kind:assignment.kind, placement:'hip', hip:assignment.location === 'leftHip' ? 'left' : 'right' });
      }
    }
    return result;
  }

  function installRender() {
    const original = window.drawHumanoidCharacter;
    const carry = window.realtimeWeaponSheathing;
    if (typeof original !== 'function' || !original.__realtimeSheathedWeaponPresentation || !carry?.drawLayer || !carry?.drawBackLayer) return false;
    if (original.__weaponReadiness) return true;
    const wrapped = function(ctx, entity, x, y, z, fly) {
      // NPCs, enemies, summons and other non-party entities use the original
      // weapon presentation directly. They do not need alternate readiness.
      if (!isPartyMember(entity)) return original.apply(this, arguments);

      const plan = alternateVisualPlan(entity);
      if (!plan.length) return original.apply(this, arguments);
      const facing = ['up','down','left','right'].includes(entity?.facing) ? entity.facing : 'down';
      const tacticalBounds = bounds(entity, x, y, z, fly);
      if (facing !== 'up' && tacticalBounds) carry.drawBackLayer(ctx, entity, tacticalBounds, plan);
      const rendered = original.apply(this, arguments);
      if (rendered) {
        const finalBounds = window.__humanoidRendererLastDraw?.entity === entity
          ? window.__humanoidRendererLastDraw.bounds : tacticalBounds;
        if (facing === 'up' && finalBounds) carry.drawBackLayer(ctx, entity, finalBounds, plan);
        carry.drawLayer(ctx, entity, plan);
      }
      return rendered;
    };
    wrapped.__realtimeSheathedWeaponPresentation = true;
    wrapped.__weaponReadiness = true;
    wrapped.__underlyingReadinessDraw = original;
    window.drawHumanoidCharacter = wrapped;
    return true;
  }

  function settle() {
    for (const character of party()) {
      ensure(character);
      ensureEquipped(character);
      sync(character);
    }
    installEquip();
    installUI();
    installRender();
  }

  settle();
  [50, 150, 500, 1500, 5000].forEach(delay => setTimeout(settle, delay));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', settle, { once:true });
  window.addEventListener('load', () => setTimeout(settle, 0), { once:true });

  window.weaponReadinessSystem = {
    kind, ensure, assignments,
    assignedCount, activeCount, ownedCount, committedCount, storedCount,
    ready, unreadyAt, canEquipInCombat, ensureEquipped,
    alternateVisualPlan, isPartyMember, settle
  };
})();
