// equipment.js

const items = {
    'dagger': { id: 'dagger', name: 'Dagger', type: 'weapon', subType: 'melee', damage: 1, range: 8, hands: 1, canOffhand: true, buyPrice: 10 },
    'sword': { id: 'sword', name: 'Sword', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1, canOffhand: true, buyPrice: 25 },
    'axe': { id: 'axe', name: 'Axe', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1, buyPrice: 25 },
    'club': { id: 'club', name: 'Club', type: 'weapon', subType: 'melee', damage: 2, range: 0, hands: 1, buyPrice: 15 },
    'spear': { id: 'spear', name: 'Spear', type: 'weapon', subType: 'melee', damage: 1, range: 1, hands: 2, buyPrice: 20 },
    'bow': { id: 'bow', name: 'Bow', type: 'weapon', subType: 'ranged', damage: 1, range: 20, hands: 2, buyPrice: 30 },
    'light_armor': { id: 'light_armor', name: 'Light Armor', type: 'armor', reduction: 1, buyPrice: 25 },
    'medium_armor': { id: 'medium_armor', name: 'Medium Armor', type: 'armor', reduction: 2, buyPrice: 50 },
    'heavy_armor': { id: 'heavy_armor', name: 'Heavy Armor', type: 'armor', reduction: 3, buyPrice: 100 },
    
    'nasal_helm': { id: 'nasal_helm', name: 'Nasal Helm', type: 'helmet', reduction: 1, buyPrice: 30 },
    'torch': { id: 'torch', name: 'Torch', type: 'weapon', subType: 'tool', damage: 0, range: 0, lightRadius: 10, canOffhand: true, buyPrice: 5 },
    
    'wooden_shield': { id: 'wooden_shield', name: 'Wooden Shield', type: 'shield', reduction: 1, hands: 1, buyPrice: 20 },

    // Mining tool — a weak weapon in a pinch, but its real job is unlocking
    // ore-node harvesting for the whole party just by being carried (see
    // harvestOreNode in resources.js).
    'pickaxe': { id: 'pickaxe', name: 'Pickaxe', type: 'weapon', subType: 'melee', damage: 1, range: 0, hands: 1, buyPrice: 15, description: 'Better for breaking rock than fighting. Carrying one unlocks mining.' },

    // Gathered wilderness resources — mundane goods, not magic items. Sold
    // for modest gold, donated to raise a region's prosperity, or (food only)
    // eaten for the non-healing "Well Fed" buff. See resources.js.
    'fruit': { id: 'fruit', name: 'Wild Fruit', type: 'food', sellPrice: 1, description: 'Foraged from a fruiting tree.' },
    'fish': { id: 'fish', name: 'Fresh Fish', type: 'food', sellPrice: 2, description: 'Caught from a quiet stretch of water.' },
    'herbs': { id: 'herbs', name: 'Wild Herbs', type: 'resource', sellPrice: 2, description: 'Common medicinal and cooking herbs.' },
    'game_meat': { id: 'game_meat', name: 'Game Meat', type: 'food', sellPrice: 3, description: "Harvested from an animal's corpse." },
    'hide': { id: 'hide', name: 'Hide', type: 'resource', sellPrice: 4, description: "A tanned-worthy hide, harvested from an animal's corpse." },
    'ore_iron': { id: 'ore_iron', name: 'Iron Ore', type: 'resource', sellPrice: 5, description: 'Common ore, the backbone of most tools and arms.' },
    'ore_silver': { id: 'ore_silver', name: 'Silver Ore', type: 'resource', sellPrice: 12, description: 'Uncommon ore, prized for fine jewelry and coin.' },
    'ore_gold': { id: 'ore_gold', name: 'Gold Ore', type: 'resource', sellPrice: 20, description: 'Rare ore, valuable and soft.' },
    'gem_red': { id: 'gem_red', name: 'Red Gem', type: 'resource', sellPrice: 30, description: 'A rare, uncut gemstone — flavor and favor, nothing more.' },
    'gem_blue': { id: 'gem_blue', name: 'Blue Gem', type: 'resource', sellPrice: 30, description: 'A rare, uncut gemstone — flavor and favor, nothing more.' },
    'gem_green': { id: 'gem_green', name: 'Green Gem', type: 'resource', sellPrice: 30, description: 'A rare, uncut gemstone — flavor and favor, nothing more.' },

    // Magic Items
    // Deliberately avoid flat +hit/+damage stacking (bounded accuracy) —
    // these lean on situational effects, skill grants already consumed
    // elsewhere in combat, or the auraTag/auraRadius glow-warning system
    // (see checkEquipmentAuras in gameEngine.js) instead.
    'sword_arrow_deflection': { id: 'sword_arrow_deflection', name: 'Sword of Arrow Deflection', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1, canOffhand: true, buyPrice: 500, skills: { 'deflect_arrows': 1 } },
    'potion_health': { id: 'potion_health', name: 'Potion of Health', type: 'consumable', subType: 'potion', buyPrice: 50 },
    'glowing_ring': { id: 'glowing_ring', name: 'Glowing Ring', type: 'accessory', buyPrice: 200, lightRadius: 10 },

    'orcbane_pendant': { id: 'orcbane_pendant', name: "Orcbane Pendant", type: 'accessory', buyPrice: 180, auraTag: 'orc', auraRadius: 6, description: 'Warms and glows faintly when orcs are near.' },
    'wolfward_charm': { id: 'wolfward_charm', name: "Wolfward Charm", type: 'accessory', buyPrice: 150, auraTag: 'wolf', auraRadius: 6, description: 'Hums with a low growl-like vibration when wolves are near.' },
    'undying_locket': { id: 'undying_locket', name: "Locket of the Restless Dead", type: 'accessory', buyPrice: 220, auraTag: 'undead', auraRadius: 6, description: 'Grows cold when the walking dead draw close.' },
    'silvertongue_ring': { id: 'silvertongue_ring', name: "Silvertongue Ring", type: 'accessory', buyPrice: 250, skills: { 'parley_bonus': 1 }, description: 'A faint shimmer settles over your words when you try to talk your way out of a fight.' },
    'stormcaller_spear': { id: 'stormcaller_spear', name: "Stormcaller Spear", type: 'weapon', subType: 'melee', damage: 1, range: 1, hands: 2, buyPrice: 450, lightRadius: 4, description: 'Crackles with faint static in a storm — sheds a little light besides.' },
    'nightowl_bow': { id: 'nightowl_bow', name: "Nightowl Bow", type: 'weapon', subType: 'ranged', damage: 1, range: 20, hands: 2, buyPrice: 400, skills: { 'keen_night_sight': 1 }, description: 'Strung with owl feathers; sharpens your eyes after dark.' },
    'featherweight_dagger': { id: 'featherweight_dagger', name: "Featherweight Dagger", type: 'weapon', subType: 'melee', damage: 1, range: 8, hands: 1, canOffhand: true, buyPrice: 220, skills: { 'silent_step': 1 }, description: "So light it barely disturbs the air — steps taken while it's drawn are hard to hear." },
    'bulwark_shield': { id: 'bulwark_shield', name: "Bulwark of the Steadfast", type: 'shield', reduction: 1, hands: 1, buyPrice: 260, skills: { 'shield_bash': 1 }, description: 'A shield forged for holding a line, not just blocking blows.' },
    'ashenwood_club': { id: 'ashenwood_club', name: "Ashenwood Club", type: 'weapon', subType: 'melee', damage: 2, range: 0, hands: 1, buyPrice: 240, auraTag: 'goblin', auraRadius: 5, description: 'Charred wood from a burned goblin camp — it prickles when their kin are close.' },
    'travelers_cloakpin': { id: 'travelers_cloakpin', name: "Traveler's Cloakpin", type: 'accessory', buyPrice: 90, skills: { 'sure_footed': 1 }, description: "Keeps a cloak from snagging — the wearer rarely stumbles on rough ground." },
    'moonlit_armor': { id: 'moonlit_armor', name: "Moonlit Chain", type: 'armor', reduction: 2, buyPrice: 320, lightRadius: 3, description: 'Faintly luminous links, like captured moonlight — dim, but never quite dark around you.' },
    'huntsman_helm': { id: 'huntsman_helm', name: "Huntsman's Helm", type: 'helmet', reduction: 1, buyPrice: 140, auraTag: 'wolf', auraRadius: 5, description: "A wolf-tooth is set in the brow; it aches faintly when the pack is near." },

    // Quest items — no buyPrice, so they never show up in the shop.
    'elder_locket': { id: 'elder_locket', name: 'Tarnished Locket', type: 'quest_item' },
    'phylactery_shard': { id: 'phylactery_shard', name: 'Phylactery Shard', type: 'quest_item', description: 'A cold, faintly warm shard of blackened bone and glass. It wants to be whole again.' }
};

window.items = items;
