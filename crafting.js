// crafting.js
// Recipe-based magic-item crafting — deliberately NOT a numeric enchanting
// system (no "+1 sword" -> "+2 sword" grind). Each recipe consumes a
// specific rare material (see the "Rare crafting materials" block in
// equipment.js) and gold to produce one specific, already-defined magic
// item from equipment.js's "Runeforged items" block — same
// bounded-accuracy discipline as every other magic item in the game (see
// equipment.js's own comment on this): the payoff is a situational effect,
// never a flat combat bonus stronger than a mundane item's own tier.
//
// Two ways in, matching the Kragmoor Runesmith questline
// (campaign2Dialogue.js): craftAtForge is the self-taught path (requires the
// player to hold the runesmithing skill, gated behind that questline, and
// costs only the recipe's own material+gold price); craftWithSmith is the
// "pay someone who already knows how" path (no skill required, but the
// smith charges a real premium on top of the same materials).
const CRAFTING_RECIPES = {
    starforged_blade: {
        name: 'Starforged Blade',
        resultItemId: 'starforged_blade',
        materials: { starmetal_ore: 2 },
        gold: 150
    },
    dragonscale_mail: {
        name: 'Dragonscale Mail',
        resultItemId: 'dragonscale_mail',
        materials: { dragon_scale: 3 },
        gold: 200
    },
    deepcrystal_pendant: {
        name: 'Deep Crystal Pendant',
        resultItemId: 'deepcrystal_pendant',
        materials: { deep_crystal: 1, gem_blue: 1 },
        gold: 120
    }
};
window.CRAFTING_RECIPES = CRAFTING_RECIPES;

function materialsDescription(recipe) {
    return Object.entries(recipe.materials).map(([id, count]) => `${count}x ${window.items[id].name}`).join(', ');
}

function hasMaterials(recipe) {
    const inv = window.player.inventory || [];
    return Object.entries(recipe.materials).every(([id, count]) => inv.filter(i => i === id).length >= count);
}
window.hasMaterialsForRecipe = hasMaterials;

function canAffordRecipe(recipe, goldCost) {
    return (window.player.gold || 0) >= goldCost && hasMaterials(recipe);
}
window.canAffordRecipe = canAffordRecipe;

function consumeMaterials(recipe) {
    Object.entries(recipe.materials).forEach(([id, count]) => {
        let removed = 0;
        window.player.inventory = window.player.inventory.filter(i => {
            if (i === id && removed < count) { removed++; return false; }
            return true;
        });
    });
}

// Self-craft at a rune forge — requires the player to actually hold the
// runesmithing skill (grantRunesmithing, campaign2Dialogue.js), the payoff
// for finishing that questline yourself instead of always paying a smith.
function craftAtForge(recipeId) {
    const recipe = CRAFTING_RECIPES[recipeId];
    if (!recipe) return false;
    if (!window.player.skills || !window.player.skills.runesmithing) {
        window.showMessage("You don't know the craft yourself. Find a smith who does, or learn it.");
        return false;
    }
    if (!canAffordRecipe(recipe, recipe.gold)) {
        window.showMessage(`You need ${materialsDescription(recipe)} and ${recipe.gold} gold to craft that.`);
        return false;
    }
    consumeMaterials(recipe);
    window.player.gold -= recipe.gold;
    window.player.inventory.push(recipe.resultItemId);
    window.showMessage(`You craft a ${window.items[recipe.resultItemId].name} at the rune forge.`);
    if (window.showInventoryScreen && document.getElementById("inventory-modal")?.style.display === "block") window.showInventoryScreen();
    return true;
}
window.craftAtForge = craftAtForge;

// Paying an NPC smith who already knows the craft — no skill required of
// the player, but the smith charges a real premium (feeMultiplier) on top
// of the same rare materials for the labor and knowledge.
function craftWithSmith(recipeId, feeMultiplier = 1.5) {
    const recipe = CRAFTING_RECIPES[recipeId];
    if (!recipe) return false;
    const fee = Math.round(recipe.gold * feeMultiplier);
    if (!canAffordRecipe(recipe, fee)) {
        window.showMessage(`The smith needs ${materialsDescription(recipe)} and ${fee} gold to make that.`);
        return false;
    }
    consumeMaterials(recipe);
    window.player.gold -= fee;
    window.player.inventory.push(recipe.resultItemId);
    window.showMessage(`The smith crafts you a ${window.items[recipe.resultItemId].name}. (-${fee} gold)`);
    if (window.showInventoryScreen && document.getElementById("inventory-modal")?.style.display === "block") window.showInventoryScreen();
    return true;
}
window.craftWithSmith = craftWithSmith;

// Interacting with the rune_forge tileObject in Kragmoor (see
// buildDwarvenKingdom, campaign2World.js) — self-craft only, gated by
// window.craftAtForge's own runesmithing-skill check.
function openRuneForge() {
    const forgeNpc = { name: 'The Rune Forge' };
    if (!window.player.skills || !window.player.skills.runesmithing) {
        window.showDialogue(forgeNpc, "Cold stone and old tools — whatever this forge once made, you don't know the craft to wake it yourself.", [{ label: "Leave it.", action: () => {} }]);
        return;
    }
    const options = Object.entries(CRAFTING_RECIPES).map(([id, recipe]) => ({
        label: `${recipe.name} (${materialsDescription(recipe)}, ${recipe.gold}g)`,
        action: () => craftAtForge(id)
    }));
    options.push({ label: "Leave it.", action: () => {} });
    window.showDialogue(forgeNpc, "The forge answers to your own hand now. Work it, if you have what it needs.", options);
}
window.openRuneForge = openRuneForge;
