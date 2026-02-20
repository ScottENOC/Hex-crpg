// equipment.js

const items = {
    'dagger': { id: 'dagger', name: 'Dagger', type: 'weapon', subType: 'melee', damage: 1, range: 0, hands: 1, canOffhand: true },
    'sword': { id: 'sword', name: 'Sword', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1, canOffhand: true },
    'axe': { id: 'axe', name: 'Axe', type: 'weapon', subType: 'melee', damage: 3, range: 0, hands: 1 },
    'club': { id: 'club', name: 'Club', type: 'weapon', subType: 'melee', damage: 2, range: 0, hands: 1 },
    'quarterstaff': { id: 'quarterstaff', name: 'Quarterstaff', type: 'weapon', subType: 'melee', damage: 1, range: 1, hands: 2 },
    'spear': { id: 'spear', name: 'Spear', type: 'weapon', subType: 'melee', damage: 1, range: 1, hands: 2 },
    'bow': { id: 'bow', name: 'Bow', type: 'weapon', subType: 'ranged', damage: 1, range: 20, hands: 2 },
    'dagger': { id: 'dagger', name: 'Dagger', type: 'weapon', subType: 'melee', damage: 1, range: 8, hands: 1, canOffhand: true },
    'medium_armor': { id: 'medium_armor', name: 'Medium Armor', type: 'armor', reduction: 2 },
    'heavy_armor': { id: 'heavy_armor', name: 'Heavy Armor', type: 'armor', reduction: 3 },
    
    'nasal_helm': { id: 'nasal_helm', name: 'Nasal Helm', type: 'helmet', reduction: 1 },
    'torch': { id: 'torch', name: 'Torch', type: 'weapon', subType: 'tool', damage: 0, range: 0, lightRadius: 10, canOffhand: true },
    
    'wooden_shield': { id: 'wooden_shield', name: 'Wooden Shield', type: 'shield', reduction: 1, hands: 1 }
};

window.items = items;
