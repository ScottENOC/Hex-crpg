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

function buyHorse(coatKey) {
    if (!window.HORSE_COAT_PRESETS[coatKey]) return false;
    if (!partyHasRiding()) { window.showMessage("Nobody in your party knows how to ride yet."); return false; }
    const player = window.party?.[0];
    if (!player || player.gold < window.HORSE_PRICE) { window.showMessage(`You need ${window.HORSE_PRICE} gold for a horse.`); return false; }
    const playerEntity = window.entities.find(e => e.side === 'player' && !e.rider && e.name === player.name);
    if (!playerEntity) return false;
    const spawnHex = findClearNeighborHex(playerEntity.hex);
    if (!spawnHex) { window.showMessage("No clear space nearby for the horse."); return false; }

    player.gold -= window.HORSE_PRICE;
    const horse = window.createMonster('horse', spawnHex, null, null, 'player');
    horse.coatPreset = coatKey;
    window.entities.push(horse);
    window.showMessage(`You buy a ${window.HORSE_COAT_PRESETS[coatKey].name.toLowerCase()} horse.`);
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
    return true;
}
window.buyHorse = buyHorse;
