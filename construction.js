// construction.js
// Minimal build-order system for player housing: a fixed menu of upgrades a
// builder NPC can carry out, each costing either gathered resources (wood/
// stone) or a flat gold price instead, per the "just pay gold" fallback the
// resource-gathering loop was designed to support. Deliberately small and
// declarative (an id -> {name, cost, goldCost, isAvailable, apply} map)
// rather than a generic crafting engine — there are exactly two build
// orders right now, and a third town's builder NPC just needs its own entry
// added here, not a new system.

window.buildOrders = {
    upgrade_cottage: {
        name: 'Expand the cottage into a proper country house',
        cost: { wood: 6, stone: 6 },
        goldCost: 90,
        isAvailable: () => window.campaign2PlayerCottageBuilt && !window.campaign2PlayerCottageUpgraded,
        isDone: () => !!window.campaign2PlayerCottageUpgraded,
        apply: () => window.upgradePlayerCottage && window.upgradePlayerCottage(),
    },
    renovate_abandoned_house: {
        name: 'Renovate the abandoned house on the north road',
        cost: { wood: 8, stone: 8 },
        goldCost: 120,
        isAvailable: () => window.isAbandonedHouseCleared && window.isAbandonedHouseCleared() && !window.campaign2AbandonedHouseRenovated,
        isDone: () => !!window.campaign2AbandonedHouseRenovated,
        apply: () => window.renovateAbandonedHouse && window.renovateAbandonedHouse(),
    },
};

function countInventory(itemId) {
    return (window.player.inventory || []).filter(i => i === itemId).length;
}

function canAffordResources(order) {
    return Object.entries(order.cost).every(([item, amt]) => countInventory(item) >= amt);
}
window.canAffordResources = canAffordResources;

function canAffordGold(order) {
    return (window.party?.[0]?.gold || 0) >= order.goldCost;
}
window.canAffordGold = canAffordGold;

// Deducts payment (resources or gold, per `useGold`) and runs the order's
// apply() — the actual world change (see upgradePlayerCottage/
// renovateAbandonedHouse in campaign2World.js). Returns true on success.
function fulfillBuildOrder(orderId, useGold) {
    const order = window.buildOrders[orderId];
    if (!order || !order.isAvailable()) return false;
    if (useGold) {
        if (!canAffordGold(order)) { window.showMessage("You don't have enough gold for that."); return false; }
        window.party[0].gold -= order.goldCost;
    } else {
        if (!canAffordResources(order)) { window.showMessage("You don't have enough wood and stone for that yet."); return false; }
        Object.entries(order.cost).forEach(([item, amt]) => {
            let removed = 0;
            window.player.inventory = window.player.inventory.filter(i => {
                if (i === item && removed < amt) { removed++; return false; }
                return true;
            });
        });
    }
    order.apply();
    return true;
}
window.fulfillBuildOrder = fulfillBuildOrder;

function costLabel(order) {
    const parts = Object.entries(order.cost).map(([item, amt]) => `${amt}x ${window.items[item]?.name || item}`);
    return parts.join(', ');
}
window.buildOrderCostLabel = costLabel;
