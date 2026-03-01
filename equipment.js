// equipment.js

const items = {
    'dagger': { id: 'dagger', name: 'Dagger', type: 'weapon', subType: 'melee', damage: 1, range: 8, hands: 1, canOffhand: true, buyPrice: 10 },
    'sword': { id: 'sword', name: 'Sword', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1, canOffhand: true, buyPrice: 25 },
    'axe': { id: 'axe', name: 'Axe', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1, buyPrice: 25 },
    'club': { id: 'club', name: 'Club', type: 'weapon', subType: 'melee', damage: 2, range: 0, hands: 1, buyPrice: 15 },
    'spear': { id: 'spear', name: 'Spear', type: 'weapon', subType: 'melee', damage: 1, range: 1, hands: 2, buyPrice: 20 },
    'bow': { id: 'bow', name: 'Bow', type: 'weapon', subType: 'ranged', damage: 1, range: 20, hands: 2, buyPrice: 30 },
    'medium_armor': { id: 'medium_armor', name: 'Medium Armor', type: 'armor', reduction: 2, buyPrice: 50 },
    'heavy_armor': { id: 'heavy_armor', name: 'Heavy Armor', type: 'armor', reduction: 3, buyPrice: 100 },
    
    'nasal_helm': { id: 'nasal_helm', name: 'Nasal Helm', type: 'helmet', reduction: 1, buyPrice: 30 },
    'torch': { id: 'torch', name: 'Torch', type: 'weapon', subType: 'tool', damage: 0, range: 0, lightRadius: 10, canOffhand: true, buyPrice: 5 },
    
    'wooden_shield': { id: 'wooden_shield', name: 'Wooden Shield', type: 'shield', reduction: 1, hands: 1, buyPrice: 20 },

    // Magic Items
    'sword_arrow_deflection': { id: 'sword_arrow_deflection', name: 'Sword of Arrow Deflection', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1, canOffhand: true, buyPrice: 500, skills: { 'deflect_arrows': 1 } },
    'potion_health': { id: 'potion_health', name: 'Potion of Health', type: 'consumable', subType: 'potion', buyPrice: 50 },
    'glowing_ring': { id: 'glowing_ring', name: 'Glowing Ring', type: 'accessory', buyPrice: 200, lightRadius: 10 }
};

window.items = items;
