// resources.js
// Wilderness gathering: ore/fruit/herb/fish nodes scattered lazily as the
// world is explored, animal corpses left behind for harvesting, a mundane
// "Well Fed" buff, and a region-prosperity turn-in helper. None of this
// touches HP/mana — clerics keep in-combat healing as their own niche; this
// is about giving cross-country wilderness a reason to exist between the
// hand-placed quest locations, not a second healing economy.

// --- Lazy wilderness resource-node generation -------------------------------
// Nodes are deterministic (seeded by hex coordinate) so exploring the same
// hex always gives the same result across a save/load, but they're only
// actually created (given real, persistent, mutable state in tileObjects)
// the first time a hex is explored — same "compute don't store until
// needed" convention as the abandoned house's dormant skeletons.
function ensureWildernessResourceNode(q, r) {
    const key = `${q},${r}`;
    if (window.tileObjects[key]) return; // already generated, or hand-placed content
    if (window.distance({ q: 0, r: 0 }, { q, r }) < 35) return; // leave the village/farmland alone

    const terrain = window.getTerrainAt(q, r);
    const roll = window.pseudoRandom(q * 2.13 + 31, r * 3.17 + 53);

    // Ore/fruit/fish thresholds cut to ~10% of their original width — at
    // the old rates they were common enough that a wandering player either
    // felt obligated to stop and harvest constantly, or (once they realized
    // there'd always be another node right around the corner) ignored them
    // entirely. Herb patches are left as-is; only these three were reported
    // too common.
    if (terrain.name === 'Rocky Outcrop' && roll < 0.05) {
        const oreRoll = window.pseudoRandom(q * 5.1 + 7, r * 7.3 + 11);
        let oreType = 'ore_iron';
        // Starmetal: a needle in the haystack even among the already-rare
        // gem rolls above it — see crafting.js's starforged_blade recipe.
        if (oreRoll > 0.999) oreType = 'starmetal_ore';
        else if (oreRoll > 0.97) oreType = 'gem_blue';
        else if (oreRoll > 0.94) oreType = 'gem_red';
        else if (oreRoll > 0.90) oreType = 'gem_green';
        else if (oreRoll > 0.80) oreType = 'ore_gold';
        else if (oreRoll > 0.65) oreType = 'ore_silver';
        window.tileObjects[key] = { type: 'ore_node', oreType, depleted: false };
    } else if (terrain.name === 'Rocky Outcrop' && roll >= 0.05 && roll < 0.12) {
        // Plain quarriable stone — distinct from the rarer ore veins above,
        // no tool required (just heavier lifting than picking fruit).
        window.tileObjects[key] = { type: 'stone_deposit', depleted: false };
    } else if (terrain.name === 'Forest' && roll >= 0.5 && roll < 0.506) {
        window.tileObjects[key] = { type: 'fruit_tree', hasFruit: true, regrowAt: 0 };
    } else if (terrain.name === 'Forest' && roll >= 0.506 && roll < 0.52) {
        // Timber tree — chopped for building material, not food (see
        // harvestTimberTree's axe requirement below).
        window.tileObjects[key] = { type: 'timber_tree', hasTimber: true, regrowAt: 0 };
    } else if (terrain.name === 'Grass' && roll >= 0.96) {
        window.tileObjects[key] = { type: 'herb_patch', hasHerbs: true, regrowAt: 0 };
    } else if (terrain.name === 'Water' && roll < 0.008) {
        window.tileObjects[key] = { type: 'fishing_spot', lastFishedAt: 0 };
    }
}
window.ensureWildernessResourceNode = ensureWildernessResourceNode;

// --- Harvest interactions ----------------------------------------------------
// All share the same shape: check a gate (skill/tool/state), give item(s),
// set a regrow timer, show a message. Called from gameEngine.js's handleClick
// dispatch, same priority tier as the journal/altar/signpost interactions.

const NODE_REGROW_HOURS = { fruit_tree: 24, herb_patch: 18, fishing_spot: 4 };

function harvestOreNode(q, r) {
    const key = `${q},${r}`;
    const node = window.tileObjects[key];
    if (!node || node.depleted) { window.showMessage("This outcrop has already been picked clean."); return; }
    if (!window.player.inventory.includes('pickaxe')) {
        window.showMessage("You need a pickaxe to mine this.");
        return;
    }
    const isForager = (window.party || []).some(p => p.skills?.keen_forager);
    const amount = isForager ? 3 : 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < amount; i++) window.player.inventory.push(node.oreType);
    node.depleted = true;
    node.regrowAt = window.worldSeconds + 72 * 3600; // ore veins take days to be worth re-mining
    const item = window.items[node.oreType];
    window.showMessage(`You mine ${amount}x ${item.name}.`);
    if (window.showInventoryScreen && document.getElementById("inventory-modal")?.style.display === "block") window.showInventoryScreen();
}
window.harvestOreNode = harvestOreNode;

function harvestFruitTree(q, r) {
    const key = `${q},${r}`;
    const node = window.tileObjects[key];
    if (!node || !node.hasFruit) { window.showMessage("No ripe fruit here right now."); return; }
    const bonus = (window.party || []).some(p => p.skills?.nature_bounty) ? 1 : 0;
    const isForager = (window.party || []).some(p => p.skills?.keen_forager);
    const amount = (isForager ? 2 : 1 + Math.floor(Math.random() * 2)) + bonus;
    for (let i = 0; i < amount; i++) window.player.inventory.push('fruit');
    node.hasFruit = false;
    node.regrowAt = window.worldSeconds + NODE_REGROW_HOURS.fruit_tree * 3600;
    window.showMessage(`You gather ${amount}x fruit.`);
}
window.harvestFruitTree = harvestFruitTree;

// Building material — requires an axe equipped or simply carried (same
// "carrying it is enough" convention as the pickaxe unlocking ore mining).
function harvestTimberTree(q, r) {
    const key = `${q},${r}`;
    const node = window.tileObjects[key];
    if (!node || !node.hasTimber) { window.showMessage("This tree's already been stripped of usable timber."); return; }
    const hasAxe = window.player.inventory.includes('axe') ||
        (window.party || []).some(p => p.equipped?.weapon === 'axe' || p.equipped?.offhand === 'axe');
    if (!hasAxe) { window.showMessage("You need an axe to chop this down."); return; }
    const amount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < amount; i++) window.player.inventory.push('wood');
    node.hasTimber = false;
    node.regrowAt = window.worldSeconds + 48 * 3600;
    window.showMessage(`You chop ${amount}x wood.`);
    if (window.showInventoryScreen && document.getElementById("inventory-modal")?.style.display === "block") window.showInventoryScreen();
}
window.harvestTimberTree = harvestTimberTree;

// Building material — no tool required, just time and effort.
function harvestStoneDeposit(q, r) {
    const key = `${q},${r}`;
    const node = window.tileObjects[key];
    if (!node || node.depleted) { window.showMessage("Nothing left worth quarrying here."); return; }
    const amount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < amount; i++) window.player.inventory.push('stone');
    node.depleted = true;
    node.regrowAt = window.worldSeconds + 48 * 3600;
    window.showMessage(`You quarry ${amount}x stone.`);
    if (window.showInventoryScreen && document.getElementById("inventory-modal")?.style.display === "block") window.showInventoryScreen();
}
window.harvestStoneDeposit = harvestStoneDeposit;

function harvestHerbPatch(q, r) {
    const key = `${q},${r}`;
    const node = window.tileObjects[key];
    if (!node || !node.hasHerbs) { window.showMessage("This patch is picked over — nothing worth taking yet."); return; }
    const bonus = (window.party || []).some(p => p.skills?.nature_bounty) ? 1 : 0;
    const isForager = (window.party || []).some(p => p.skills?.keen_forager);
    const amount = (isForager ? 2 : 1 + Math.floor(Math.random() * 2)) + bonus;
    for (let i = 0; i < amount; i++) window.player.inventory.push('herbs');
    node.hasHerbs = false;
    node.regrowAt = window.worldSeconds + NODE_REGROW_HOURS.herb_patch * 3600;
    window.showMessage(`You gather ${amount}x herbs.`);
}
window.harvestHerbPatch = harvestHerbPatch;

function harvestFishingSpot(q, r) {
    const key = `${q},${r}`;
    const node = window.tileObjects[key];
    if (!node) return;
    const sinceLastFish = window.worldSeconds - (node.lastFishedAt || 0);
    if (sinceLastFish < NODE_REGROW_HOURS.fishing_spot * 3600) {
        window.showMessage("The fish here haven't come back yet — give it some time.");
        return;
    }
    const bonus = (window.party || []).some(p => p.skills?.nature_bounty) ? 1 : 0;
    const amount = 1 + bonus;
    for (let i = 0; i < amount; i++) window.player.inventory.push('fish');
    node.lastFishedAt = window.worldSeconds;
    window.showMessage(`You catch ${amount}x fish.`);
}
window.harvestFishingSpot = harvestFishingSpot;

// Animal corpses: left behind when an 'animal'-tagged monster dies (see the
// call in handleLethalDamage), harvestable for meat/hide only with the
// nature_butchery skill (Knowledge: Nature's own reveal-flavor is a
// separate, lower sub-skill — see skills.js). Non-butchers can still see
// the corpse, they just can't clean-harvest it.
function leaveCorpse(monster) {
    const key = `${monster.hex.q},${monster.hex.r}`;
    if (window.tileObjects[key]) return; // don't clobber an existing node/building
    window.tileObjects[key] = { type: 'corpse', animalName: monster.name, harvested: false };
}
window.leaveCorpse = leaveCorpse;

function harvestCorpse(q, r) {
    const key = `${q},${r}`;
    const node = window.tileObjects[key];
    if (!node || node.harvested) { window.showMessage("Nothing left to take."); return; }
    const hasButchery = (window.party || []).some(p => p.skills?.nature_butchery);
    if (!hasButchery) {
        window.showMessage(`You don't have the skill to harvest ${node.animalName}'s corpse cleanly.`);
        return;
    }
    window.player.inventory.push('game_meat', 'hide');
    node.harvested = true;
    window.showMessage(`You harvest meat and a hide from the ${node.animalName}.`);
}
window.harvestCorpse = harvestCorpse;

// --- Well Fed: a mundane, non-healing buff from eating gathered food -------
// Deliberately never touches HP/mana - clerics keep in-combat healing as
// their own niche. This only softens wilderness-rest risk and travel, the
// same kind of thing the Survival skill already does.
function eatFood(itemId) {
    const item = window.items[itemId];
    if (!item || item.type !== 'food') return;
    const idx = window.player.inventory.indexOf(itemId);
    if (idx === -1) return;
    window.player.inventory.splice(idx, 1);
    window.player.wellFedUntil = Math.max(window.player.wellFedUntil || 0, window.worldSeconds) + 4 * 3600;
    window.showMessage(`You eat the ${item.name}. Well Fed for the next few hours.`);
    if (window.showInventoryScreen) window.showInventoryScreen();
}
window.eatFood = eatFood;

function isWellFed(player) {
    return !!player && window.worldSeconds < (player.wellFedUntil || 0);
}
window.isWellFed = isWellFed;

// --- Region prosperity turn-ins ----------------------------------------------
// Donating gathered goods at a relevant settlement raises that region's
// prosperity directly (regions.js already cascades prosperity -> security),
// giving resource-gathering a real, visible, non-combat world effect instead
// of just being a gold sink.
function donateResourceToRegion(regionId, itemId, amount, prosperityDelta) {
    const have = window.player.inventory.filter(i => i === itemId).length;
    if (have < amount) {
        window.showMessage(`You need ${amount}x ${window.items[itemId]?.name || itemId} to donate.`);
        return false;
    }
    let removed = 0;
    window.player.inventory = window.player.inventory.filter(i => {
        if (i === itemId && removed < amount) { removed++; return false; }
        return true;
    });
    if (window.adjustRegionStat) window.adjustRegionStat(regionId, 'prosperity', prosperityDelta);
    window.showMessage(`You donate ${amount}x ${window.items[itemId].name}. ${window.regions?.[regionId]?.name || regionId}'s prosperity rises.`);
    return true;
}
window.donateResourceToRegion = donateResourceToRegion;
