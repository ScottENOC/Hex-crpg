// stable.js
// The merchant district's horse stable: buy a horse in one of a few vetted
// coat colors (see HORSE_COAT_PRESETS — a short hand-picked list, not a free
// hue slider, so there's no way to land on a green horse) for anyone with
// the Riding skill. Reuses the exact horse-spawn logic the Riding skill
// itself already uses when it grants a free one (see learnSkill_fixed.js),
// just gated on gold instead of just-learned-the-skill, and with a chosen
// coat instead of a random one.

window.HORSE_COAT_PRESETS = {
    brown:    { name: 'Brown',    hue: 25, light: 0.85, sat: 1.1 },
    black:    { name: 'Black',    hue: 0,  light: 0.25, sat: 0.2 },
    white:    { name: 'White',    hue: 0,  light: 1.9,  sat: 0.05 },
    chestnut: { name: 'Chestnut', hue: 12, light: 0.6,  sat: 1.4 },
    gray:     { name: 'Gray',     hue: 0,  light: 1.0,  sat: 0.1 },
    // Not offered by the stable — the Bone Trader's alternative to a living
    // horse for a lich-path player (see buySkeletonHorse below and
    // bone_trader, campaign2Dialogue.js). Same recolor mechanism, a
    // deliberately bleached/bony hue rather than any natural coat.
    skeleton: { name: 'Skeleton', hue: 0,  light: 1.6,  sat: 0.02 },
};

window.HORSE_PRICE = 150;

function partyHasRiding() {
    return (window.party || []).some(p => p.skills?.riding || p.skills?.riding_druid || p.skills?.riding_paladin);
}
window.partyHasRiding = partyHasRiding;

// Same "find a clear, non-water neighbor hex" search learnSkill_fixed.js
// already uses for the free skill-granted horse.
function findClearNeighborHex(hex) {
    const neighbors = window.getNeighbors(hex.q, hex.r);
    for (const h of neighbors) {
        const isOccupied = window.entities.some(e => e.alive && e.getAllHexes().some(oh => oh.q === h.q && oh.r === h.r));
        const terrain = window.getTerrainAt(h.q, h.r);
        if (!isOccupied && terrain && terrain.name !== 'Water') return h;
    }
    return null;
}

// tierId: 'untrained' (default) | 'trained' | 'war_trained' — see
// MOUNT_TRAINING_TIERS (monsters.js). Cost is HORSE_PRICE * the tier's
// multiplier; a trained/war-trained horse arrives with its skill points
// already spent and, at the higher tiers, a free barding fitting.
function buyHorse(coatKey, tierId = 'untrained') {
    const tier = window.MOUNT_TRAINING_TIERS?.[tierId];
    if (!window.HORSE_COAT_PRESETS[coatKey] || !tier) return false;
    if (!partyHasRiding()) { window.showMessage("Nobody in your party knows how to ride yet."); return false; }
    const player = window.party?.[0];
    const price = Math.round(window.HORSE_PRICE * tier.costMultiplier);
    if (!player || player.gold < price) { window.showMessage(`You need ${price} gold for a horse.`); return false; }
    const playerEntity = window.entities.find(e => e.side === 'player' && !e.rider && e.name === player.name);
    if (!playerEntity) return false;
    const spawnHex = findClearNeighborHex(playerEntity.hex);
    if (!spawnHex) { window.showMessage("No clear space nearby for the horse."); return false; }

    player.gold -= price;
    const horse = window.createMonster('horse', spawnHex, null, null, 'player');
    horse.coatPreset = coatKey;
    window.grantMountTraining(horse, tierId);
    window.entities.push(horse);
    window.showMessage(`You buy a ${tier.label.toLowerCase()} ${window.HORSE_COAT_PRESETS[coatKey].name.toLowerCase()} horse.`);
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
    return true;
}
window.buyHorse = buyHorse;

// A skeleton horse isn't bought — it's raised. A lich player either
// sacrifices their own living horse (this ritual does the killing itself;
// there's no ordinary way to attack your own mount through the normal
// combat path) or raises one already dead — an enemy's fallen mount found
// on the battlefield, or their own horse's corpse from an earlier kill.
// Wired to the "Raise Undead" action button (ui.js) via act.type
// 'raise_undead' (gameEngine.js).
function raiseSkeletonHorse(horseEntity) {
    if (!window.playerIsLich) { window.showMessage("You don't have the will to command the dead — not yet."); return false; }
    if (!horseEntity || horseEntity.name !== 'Horse') { window.showMessage("There's nothing here to raise."); return false; }
    if (horseEntity.coatPreset === 'skeleton') { window.showMessage("It's already risen."); return false; }
    if (!partyHasRiding()) { window.showMessage("Riding a horse takes the skill whether it's breathing or not."); return false; }

    if (horseEntity.alive && horseEntity.rider) {
        horseEntity.rider.riding = null;
        horseEntity.rider = null;
    }
    horseEntity.alive = true;
    horseEntity.hp = horseEntity.maxHp;
    horseEntity.side = 'player';
    horseEntity.coatPreset = 'skeleton';
    horseEntity.undead = true;
    window.showMessage("Bone knits over bone. What was flesh rises again, patient as the grave.");
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
    return true;
}
window.raiseSkeletonHorse = raiseSkeletonHorse;
