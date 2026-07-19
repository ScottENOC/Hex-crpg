// partyInventory.js
// Converts the party from "everyone has their own backpack, but only
// window.player's is ever actually read" (the de-facto state before this
// file — see the research this was built from: equipItem/resources.js/
// crafting.js/quest code all hardcode window.player.inventory) into a real,
// honest shared pool: window.partyInventory is the single canonical array,
// and every party member's own `.inventory` is an accessor property that
// reads/writes straight through to it (wireSharedInventory below). Existing
// code that does `window.player.inventory = window.player.inventory.filter(...)`
// keeps working unchanged — the setter just updates window.partyInventory,
// so every other party member (whose `.inventory` getter reads the same
// window.partyInventory) stays in sync automatically.
//
// Call wireSharedInventory(entity) once for every party member, right after
// they're pushed onto window.party (see characterCreation.js, campaign2World.js,
// campaign2Dialogue.js, main.js, network.js, roster.js, ui.js's debug
// companion) — merge:true (the default) folds that member's own starting
// kit into the shared pool; merge:false (used only when restoring a save,
// persistence.js) just re-attaches without merging, since every party
// member's saved `.inventory` is already a duplicate snapshot of the same
// pool from the moment it was serialized.
function wireSharedInventory(entity, opts = {}) {
    const merge = opts.merge !== false;
    if (!window.partyInventory) {
        window.partyInventory = (Array.isArray(entity.inventory) && entity.inventory.length) ? [...entity.inventory] : [];
    } else if (merge && Array.isArray(entity.inventory) && entity.inventory !== window.partyInventory) {
        window.partyInventory.push(...entity.inventory);
    }
    Object.defineProperty(entity, 'inventory', {
        configurable: true,
        enumerable: true,
        get() { return window.partyInventory; },
        set(v) { window.partyInventory = v; }
    });
}
window.wireSharedInventory = wireSharedInventory;

// --- Encumbrance -------------------------------------------------------------
// Every item has an implicit weight even without its own `weight` field —
// see the type/subType-based defaults below — so this applies uniformly
// without needing to hand-annotate every item in equipment.js. Capacity is
// a genuinely shared, party-wide pool (see strong_back, skills.js): more
// party members means more capacity, not a fixed number the whole party
// competes over.
const BASE_CARRY_PER_MEMBER = 40;
const STRONG_BACK_BONUS_PER_RANK = 15;
const CARRY_PER_OWNED_MOUNT = 40;
const CARRY_PER_ANIMAL_COMPANION = 20;

function getItemWeight(id) {
    const item = window.items && window.items[id];
    if (!item) return 1;
    if (item.weight !== undefined) return item.weight;
    if (item.type === 'quest_item') return 0;
    if (item.type === 'armor' || item.type === 'shield' || item.type === 'helmet') return (item.reduction || 1) * 6;
    if (item.type === 'weapon') return item.subType === 'ranged' ? 2 : item.subType === 'tool' ? 1 : 3;
    if (item.type === 'food' || item.type === 'consumable') return 0.5;
    if (item.type === 'resource') return 2;
    return 1;
}
window.getItemWeight = getItemWeight;

function getPartyCarryWeight() {
    return (window.partyInventory || []).reduce((sum, id) => sum + getItemWeight(id), 0);
}
window.getPartyCarryWeight = getPartyCarryWeight;

// Equipped-item carrying bonuses (magic_backpack, equipment.js) — any
// party member's own accessory slot, checked generically off a
// `carryBonus` field rather than hardcoding the backpack's item id, so a
// future item could grant this the same way without touching this file.
function getEquippedCarryBonus() {
    return (window.party || []).reduce((sum, p) => {
        const accessoryId = p.equipped?.accessory;
        const item = accessoryId && window.items[accessoryId];
        return sum + (item?.carryBonus || 0);
    }, 0);
}
window.getEquippedCarryBonus = getEquippedCarryBonus;

function getPartyCarryCapacity() {
    const memberCapacity = (window.party || []).reduce((sum, p) => sum + BASE_CARRY_PER_MEMBER + (p.skills?.strong_back || 0) * STRONG_BACK_BONUS_PER_RANK, 0);
    // Owned mounts (mountSize > 0 — horses, wolves, boars, unicorns; see
    // monsters.js) help carry whether they're currently being ridden or
    // just following along, same as an animal companion (a permanent
    // summon, see the animal_companion skill) — both are real pack animals,
    // just smaller ones than a proper mount.
    const ownedMounts = (window.entities || []).filter(e => e.alive && e.side === 'player' && (e.mountSize || 0) > 0).length;
    const animalCompanions = (window.party || []).filter(p => p.animalCompanion && p.animalCompanion.alive).length;
    return memberCapacity
        + ownedMounts * CARRY_PER_OWNED_MOUNT
        + animalCompanions * CARRY_PER_ANIMAL_COMPANION
        + getEquippedCarryBonus();
}
window.getPartyCarryCapacity = getPartyCarryCapacity;

function isPartyOverencumbered() {
    return getPartyCarryWeight() > getPartyCarryCapacity();
}
window.isPartyOverencumbered = isPartyOverencumbered;

// A soft cap, not a hard block: going over capacity doesn't stop a pickup
// or purchase (that would mean plumbing a check into every acquisition
// path in the game — quest rewards, loot, shop buys, crafting, harvesting),
// it just makes the party slower (see getMoveCostMult, gameEngine.js).
// quartermaster (skills.js) softens exactly this multiplier.
function getEncumbranceMoveMult() {
    if (!isPartyOverencumbered()) return 1;
    const quartermasterRanks = Math.max(0, ...(window.party || []).map(p => p.skills?.quartermaster || 0));
    const penalty = 0.5 * Math.max(0, 1 - quartermasterRanks / 2);
    return 1 + penalty;
}
window.getEncumbranceMoveMult = getEncumbranceMoveMult;

// --- Appraiser shop discount -------------------------------------------------
function getAppraiserDiscountMult() {
    const ranks = Math.max(0, ...(window.party || []).map(p => p.skills?.appraiser || 0), 0);
    return 1 - Math.min(3, ranks) * 0.05;
}
window.getAppraiserDiscountMult = getAppraiserDiscountMult;

// --- Storage chests (player housing) -----------------------------------------
// Genuinely unlimited: a chest's `items` array is just another list of item
// ids, same shape as partyInventory, with no capacity check at all — the
// whole point of a chest is to be somewhere the encumbrance system above
// doesn't apply, so a player can stash a haul at home instead of carrying it.
function depositToChest(q, r, itemId) {
    const chest = window.tileObjects && window.tileObjects[`${q},${r}`];
    if (!chest || chest.type !== 'storage_chest') return false;
    const idx = window.partyInventory.indexOf(itemId);
    if (idx === -1) return false;
    window.partyInventory.splice(idx, 1);
    chest.items = chest.items || [];
    chest.items.push(itemId);
    return true;
}
window.depositToChest = depositToChest;

function withdrawFromChest(q, r, itemId) {
    const chest = window.tileObjects && window.tileObjects[`${q},${r}`];
    if (!chest || chest.type !== 'storage_chest') return false;
    const idx = (chest.items || []).indexOf(itemId);
    if (idx === -1) return false;
    chest.items.splice(idx, 1);
    window.partyInventory.push(itemId);
    return true;
}
window.withdrawFromChest = withdrawFromChest;

// Interaction entry point (see interactWithTileObject's 'storage_chest'
// dispatch, gameEngine.js). A simple deposit-everything/withdraw-by-name
// dialogue rather than a full drag-and-drop UI — matches this game's
// existing dialogue-driven interaction style (shops, altars, journals).
function openStorageChest(q, r) {
    const chest = window.tileObjects && window.tileObjects[`${q},${r}`];
    if (!chest || chest.type !== 'storage_chest') return;
    chest.items = chest.items || [];
    const chestNpc = { name: 'Storage Chest' };
    const carryCount = (window.partyInventory || []).length;
    const options = [];
    if (carryCount > 0) {
        options.push({
            label: `Store everything (${carryCount} items)`,
            action: () => {
                chest.items.push(...window.partyInventory);
                window.partyInventory.length = 0;
                window.showMessage('Everything you carried is now in the chest.');
                if (window.showInventoryScreen && document.getElementById("inventory-modal")?.style.display === "block") window.showInventoryScreen();
            }
        });
    }
    if (chest.items.length > 0) {
        options.push({
            label: `Take everything (${chest.items.length} items)`,
            action: () => {
                window.partyInventory.push(...chest.items);
                chest.items.length = 0;
                window.showMessage('You empty the chest into your packs.');
                if (window.showInventoryScreen && document.getElementById("inventory-modal")?.style.display === "block") window.showInventoryScreen();
            }
        });
    }
    options.push({ label: "Close.", action: () => {} });
    window.showDialogue(chestNpc, `A sturdy chest. It holds ${chest.items.length} item${chest.items.length === 1 ? '' : 's'} — as much as you ever put in it, no less.`, options);
}
window.openStorageChest = openStorageChest;
