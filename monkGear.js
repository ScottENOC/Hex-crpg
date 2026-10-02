// Class-targeted monk clothing integration.
(() => {
  'use strict';

  const TOP = 'monk_wrap';
  const PANTS = 'monk_trousers';
  const ASSET = 'images/equipment/clothing/';
  const BUILD = '20261002-monk-gear-v1';

  const topLayers = {
    slot: 'shirt',
    layers: [{
      id: 'base', label: 'Monk wrap', tint: false,
      defaultColor: { hue: 35, saturation: 25, value: 80, opacity: 1 },
      views: {
        front: `${ASSET}monk_wrap_front.png`,
        side: `${ASSET}monk_wrap_side.png`,
        back: `${ASSET}monk_wrap_back.png`,
      },
    }],
  };
  const pantsLayers = {
    slot: 'pants',
    layers: [{
      id: 'base', label: 'Monk trousers', tint: false,
      defaultColor: { hue: 35, saturation: 25, value: 80, opacity: 1 },
      views: {
        front: `${ASSET}monk_trousers_front.png`,
        side: `${ASSET}monk_trousers_side.png`,
        back: `${ASSET}monk_trousers_back.png`,
      },
    }],
  };

  function addUnique(array, id) {
    if (Array.isArray(array) && !array.includes(id)) array.push(id);
  }

  function equipMonkOutfit(character) {
    if (!character) return character;
    character.equipped ||= {};
    character.inventory ||= [];
    character.equipped.shirt = TOP;
    character.equipped.pants = PANTS;
    addUnique(character.inventory, TOP);
    addUnique(character.inventory, PANTS);
    return character;
  }

  // createCharacterData is the common path for the player and recruitable
  // companions. Brother Alden is created as a monk through this function, so
  // this also gives the existing monk companion the outfit without a one-off
  // name check.
  function wrapCharacterCreation() {
    const original = window.createCharacterData;
    if (typeof original !== 'function' || original.__monkGearWrapped) return false;
    function wrappedCreateCharacterData(...args) {
      const character = original.apply(this, args);
      const cls = character?.class || args[1];
      if (String(cls || '').toLowerCase() === 'monk') equipMonkOutfit(character);
      return character;
    }
    wrappedCreateCharacterData.__monkGearWrapped = true;
    wrappedCreateCharacterData.__monkGearOriginal = original;
    window.createCharacterData = wrappedCreateCharacterData;
    return true;
  }

  function registerItems() {
    if (!window.items) return false;
    window.items[TOP] = {
      ...(window.items[TOP] || {}),
      id: TOP,
      name: 'Monk Wrap',
      type: 'clothes',
      clothingSlot: 'shirt',
      buyPrice: 35,
      sellPrice: 12,
      description: 'A sleeveless crossed training wrap with a broad cloth sash.',
      clothingLayers: topLayers,
    };
    window.items[PANTS] = {
      ...(window.items[PANTS] || {}),
      id: PANTS,
      name: 'Monk Trousers',
      type: 'clothes',
      clothingSlot: 'pants',
      buyPrice: 30,
      sellPrice: 10,
      description: 'Loose training trousers gathered at the ankles and tied with a broad sash.',
      clothingLayers: pantsLayers,
    };
    return true;
  }

  function stockShops() {
    if (!Array.isArray(window.campaign2ClothierItems)) return false;
    addUnique(window.campaign2ClothierItems, TOP);
    addUnique(window.campaign2ClothierItems, PANTS);
    return true;
  }

  function hash(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  const genericTops = new Set(['top_masc_laced', 'top_blouse', 'top_shirt_f']);
  const genericPants = new Set(['pants_trousers']);

  function maybeEquipRareNpc(entity) {
    if (!entity || entity.side === 'player' || entity.__monkGearNpcRolled) return;
    entity.__monkGearNpcRolled = true;
    const humanoid = entity.tags?.includes?.('humanoid') || ['human', 'elf', 'dwarf', 'orc', 'goblin'].includes(entity.race);
    if (!humanoid) return;
    // Stable 1-in-25 roll: rare, deterministic, and therefore save/reload-safe.
    const identity = `${entity.name || ''}|${entity.race || ''}|${entity.gender || ''}|${entity.hex?.q ?? ''}|${entity.hex?.r ?? ''}`;
    if (hash(identity) % 25 !== 0) return;
    entity.equipped ||= {};
    const shirt = entity.equipped.shirt;
    const pants = entity.equipped.pants;
    // Respect authored/special costumes. Only replace empty or ordinary default clothing.
    if (shirt && !genericTops.has(shirt)) return;
    if (pants && !genericPants.has(pants)) return;
    equipMonkOutfit(entity);
  }

  function scanNpcs() {
    for (const entity of window.entities || []) maybeEquipRareNpc(entity);
  }

  function install() {
    wrapCharacterCreation();
    registerItems();
    stockShops();
    scanNpcs();
  }

  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  window.addEventListener('load', install, { once: true });
  const timer = setInterval(install, 1000);
  setTimeout(() => clearInterval(timer), 30000);

  window.monkGearSystem = { build: BUILD, topId: TOP, pantsId: PANTS, equipMonkOutfit, maybeEquipRareNpc, install };
})();
